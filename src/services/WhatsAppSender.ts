import axios, { AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { ShippingGuideData } from '../types';
import { 
    RetryConfig, 
    CircuitBreakerConfig, 
    retryConfig as defaultRetryConfig,
    circuitBreakerConfig as defaultCircuitBreakerConfig,
    calculateBackoffDelay,
    sleep
} from '../config/retry';

export enum CircuitState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    HALF_OPEN = 'HALF_OPEN'
}

export interface WhatsAppSenderConfig {
    apiUrl: string;
    apiKey: string;
    retryConfig?: RetryConfig;
    circuitBreakerConfig?: CircuitBreakerConfig;
}

export interface StructuredLog {
    timestamp: string;
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    service: string;
    action: string;
    message: string;
    metadata?: Record<string, unknown>;
}

export class WhatsAppSender {
    private apiUrl: string;
    private apiKey: string;
    private retryConfig: RetryConfig;
    private circuitBreakerConfig: CircuitBreakerConfig;
    
    // Circuit breaker state
    private circuitState: CircuitState = CircuitState.CLOSED;
    private failureCount: number = 0;
    private lastFailureTime: number = 0;

    constructor(config: WhatsAppSenderConfig | { apiUrl: string; apiKey: string }) {
        this.apiUrl = config.apiUrl;
        this.apiKey = config.apiKey;
        this.retryConfig = 'retryConfig' in config && config.retryConfig 
            ? config.retryConfig 
            : defaultRetryConfig;
        this.circuitBreakerConfig = 'circuitBreakerConfig' in config && config.circuitBreakerConfig 
            ? config.circuitBreakerConfig 
            : defaultCircuitBreakerConfig;
    }

    /**
     * Get the current state of the circuit breaker
     */
    getCircuitState(): CircuitState {
        return this.circuitState;
    }

    /**
     * Get the current failure count
     */
    getFailureCount(): number {
        return this.failureCount;
    }

    /**
     * Reset the circuit breaker state (for testing purposes)
     */
    resetCircuitBreaker(): void {
        this.circuitState = CircuitState.CLOSED;
        this.failureCount = 0;
        this.lastFailureTime = 0;
    }

    /**
     * Structured logging utility
     */
    private log(log: Omit<StructuredLog, 'timestamp' | 'service'>): void {
        const structuredLog: StructuredLog = {
            timestamp: new Date().toISOString(),
            service: 'WhatsAppSender',
            ...log
        };
        
        const logString = JSON.stringify(structuredLog);
        
        switch (log.level) {
            case 'ERROR':
                console.error(logString);
                break;
            case 'WARN':
                console.warn(logString);
                break;
            case 'DEBUG':
                console.debug(logString);
                break;
            default:
                console.log(logString);
        }
    }

    /**
     * Check if circuit breaker allows the request
     */
    private canMakeRequest(): boolean {
        if (this.circuitState === CircuitState.CLOSED) {
            return true;
        }

        if (this.circuitState === CircuitState.OPEN) {
            const timeSinceLastFailure = Date.now() - this.lastFailureTime;
            if (timeSinceLastFailure >= this.circuitBreakerConfig.resetTimeoutMs) {
                this.circuitState = CircuitState.HALF_OPEN;
                this.log({
                    level: 'INFO',
                    action: 'circuit_breaker_half_open',
                    message: 'Circuit breaker transitioning to HALF_OPEN state',
                    metadata: { timeSinceLastFailure }
                });
                return true;
            }
            return false;
        }

        // HALF_OPEN - allow one request to test
        return true;
    }

    /**
     * Record a successful request for circuit breaker
     */
    private recordSuccess(): void {
        if (this.circuitState === CircuitState.HALF_OPEN) {
            this.log({
                level: 'INFO',
                action: 'circuit_breaker_closed',
                message: 'Circuit breaker closing after successful request'
            });
        }
        this.failureCount = 0;
        this.circuitState = CircuitState.CLOSED;
    }

    /**
     * Record a failed request for circuit breaker
     */
    private recordFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.circuitState === CircuitState.HALF_OPEN) {
            this.circuitState = CircuitState.OPEN;
            this.log({
                level: 'WARN',
                action: 'circuit_breaker_reopened',
                message: 'Circuit breaker re-opened after failed test request',
                metadata: { failureCount: this.failureCount }
            });
            return;
        }

        if (this.failureCount >= this.circuitBreakerConfig.failureThreshold) {
            this.circuitState = CircuitState.OPEN;
            this.log({
                level: 'WARN',
                action: 'circuit_breaker_opened',
                message: `Circuit breaker opened after ${this.failureCount} failures`,
                metadata: { 
                    failureCount: this.failureCount,
                    resetTimeoutMs: this.circuitBreakerConfig.resetTimeoutMs
                }
            });
        }
    }

    /**
     * Execute a function with retry logic and exponential backoff
     */
    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        operationName: string
    ): Promise<T> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
            // Check circuit breaker before attempting
            if (!this.canMakeRequest()) {
                this.log({
                    level: 'WARN',
                    action: 'request_blocked',
                    message: `Request blocked by circuit breaker (state: ${this.circuitState})`,
                    metadata: { operationName, circuitState: this.circuitState }
                });
                throw new Error(`Circuit breaker is ${this.circuitState}`);
            }

            try {
                if (attempt > 0) {
                    const delay = calculateBackoffDelay(attempt - 1, this.retryConfig);
                    this.log({
                        level: 'INFO',
                        action: 'retry_attempt',
                        message: `Retrying ${operationName} (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})`,
                        metadata: { attempt: attempt + 1, delayMs: delay }
                    });
                    await sleep(delay);
                }

                const result = await operation();
                this.recordSuccess();
                
                if (attempt > 0) {
                    this.log({
                        level: 'INFO',
                        action: 'retry_success',
                        message: `${operationName} succeeded after ${attempt + 1} attempts`,
                        metadata: { attempts: attempt + 1 }
                    });
                }
                
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                
                const isRetryable = this.isRetryableError(error);
                
                this.log({
                    level: 'WARN',
                    action: 'request_failed',
                    message: `${operationName} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})`,
                    metadata: {
                        attempt: attempt + 1,
                        error: lastError.message,
                        isRetryable,
                        statusCode: (error as AxiosError)?.response?.status
                    }
                });

                if (!isRetryable || attempt === this.retryConfig.maxRetries) {
                    this.recordFailure();
                    throw lastError;
                }
            }
        }

        // This should never be reached due to the throw in the loop
        this.recordFailure();
        throw lastError || new Error(`${operationName} failed after all retries`);
    }

    /**
     * Determine if an error is retryable
     */
    private isRetryableError(error: unknown): boolean {
        // Check for network-related error messages first
        if (error instanceof Error) {
            const retryableMessages = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'];
            if (retryableMessages.some(msg => error.message.includes(msg))) {
                return true;
            }
        }

        // Check for axios-like errors (duck typing to handle mocks)
        const axiosLikeError = error as { response?: { status?: number }; isAxiosError?: boolean };
        
        if (axiosLikeError.response) {
            const status = axiosLikeError.response.status;
            
            // 5xx server errors are retryable
            if (status && status >= 500) {
                return true;
            }
            
            // 429 Too Many Requests is retryable
            if (status === 429) {
                return true;
            }
            
            // 408 Request Timeout is retryable
            if (status === 408) {
                return true;
            }
            
            // 4xx client errors (except above) are NOT retryable
            if (status && status >= 400 && status < 500) {
                return false;
            }
        }

        // If error has isAxiosError flag but no response, it's a network error (retryable)
        if (axiosLikeError.isAxiosError && !axiosLikeError.response) {
            return true;
        }
        
        return false;
    }

    /**
     * Check health of the TechAura API connection
     */
    async checkHealth(): Promise<{ healthy: boolean; message: string; circuitState: CircuitState; responseTimeMs?: number }> {
        const startTime = Date.now();
        
        try {
            // Try to make a simple request to verify connectivity
            await axios.get(`${this.apiUrl}/health`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: 5000
            });
            
            const responseTimeMs = Date.now() - startTime;
            
            this.log({
                level: 'INFO',
                action: 'health_check_success',
                message: 'TechAura API health check passed',
                metadata: { responseTimeMs }
            });
            
            return {
                healthy: true,
                message: 'TechAura API is reachable',
                circuitState: this.circuitState,
                responseTimeMs
            };
        } catch (error) {
            const responseTimeMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            this.log({
                level: 'WARN',
                action: 'health_check_failed',
                message: 'TechAura API health check failed',
                metadata: { error: errorMessage, responseTimeMs }
            });
            
            return {
                healthy: false,
                message: `TechAura API is not reachable: ${errorMessage}`,
                circuitState: this.circuitState,
                responseTimeMs
            };
        }
    }

    async sendGuide(phone: string, guideData: ShippingGuideData, filePath: string): Promise<boolean> {
        this.log({
            level: 'INFO',
            action: 'send_guide_start',
            message: 'Starting to send shipping guide',
            metadata: { 
                phone: this.maskPhone(phone),
                trackingNumber: guideData.trackingNumber,
                carrier: guideData.carrier
            }
        });

        try {
            // Format phone number
            const formattedPhone = this.formatPhone(phone);

            // Send text message first with retry
            const message = this.formatMessage(guideData);
            await this.sendText(formattedPhone, message);

            // Then send the guide file with retry
            await this.sendMedia(formattedPhone, filePath, 'Guía de envío');

            this.log({
                level: 'INFO',
                action: 'send_guide_success',
                message: 'Successfully sent shipping guide',
                metadata: { 
                    phone: this.maskPhone(phone),
                    trackingNumber: guideData.trackingNumber
                }
            });

            return true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            this.log({
                level: 'ERROR',
                action: 'send_guide_failed',
                message: 'Failed to send shipping guide',
                metadata: { 
                    phone: this.maskPhone(phone),
                    trackingNumber: guideData.trackingNumber,
                    error: errorMessage
                }
            });
            
            return false;
        }
    }

    /**
     * Mask phone number for logging (privacy)
     */
    private maskPhone(phone: string): string {
        if (phone.length <= 4) return '****';
        return phone.slice(0, -4).replace(/./g, '*') + phone.slice(-4);
    }

    private async sendText(phone: string, message: string): Promise<void> {
        await this.executeWithRetry(
            async () => {
                await axios.post(`${this.apiUrl}/api/send-message`, {
                    phone,
                    message
                }, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });
            },
            'sendText'
        );
    }

    private async sendMedia(phone: string, filePath: string, caption: string): Promise<void> {
        await this.executeWithRetry(
            async () => {
                const formData = new FormData();
                formData.append('phone', phone);
                formData.append('caption', caption);
                formData.append('file', fs.createReadStream(filePath));

                await axios.post(`${this.apiUrl}/api/send-media`, formData, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        ...formData.getHeaders()
                    },
                    timeout: 30000
                });
            },
            'sendMedia'
        );
    }

    private formatPhone(phone: string): string {
        const digits = phone.replace(/\D/g, '');
        if (digits.startsWith('57')) return digits;
        if (digits.length === 10) return '57' + digits;
        return digits;
    }

    private formatMessage(data: ShippingGuideData): string {
        return `🚚 *¡Tu pedido ha sido enviado!*

📦 *Número de guía:* ${data.trackingNumber}
🏢 *Transportadora:* ${data.carrier}
📍 *Destino:* ${data.city || 'Ver guía adjunta'}

Puedes rastrear tu envío en la página de la transportadora.

¡Gracias por tu compra en TechAura! 🎉

_Escribe "rastrear" para ver el estado de tu envío._`;
    }
}
