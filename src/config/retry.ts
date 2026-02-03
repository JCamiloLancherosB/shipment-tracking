/**
 * Retry and Circuit Breaker Configuration
 * For handling connection issues with TechAura API
 */

export interface RetryConfig {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
}

export interface CircuitBreakerConfig {
    failureThreshold: number;
    resetTimeoutMs: number;
}

export const retryConfig: RetryConfig = {
    maxRetries: parseInt(process.env.RETRY_MAX_RETRIES || '3'),
    initialDelayMs: parseInt(process.env.RETRY_INITIAL_DELAY_MS || '1000'),
    maxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS || '10000'),
    backoffMultiplier: parseFloat(process.env.RETRY_BACKOFF_MULTIPLIER || '2')
};

export const circuitBreakerConfig: CircuitBreakerConfig = {
    failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
    resetTimeoutMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS || '30000')
};

/**
 * Calculates the delay for a given retry attempt using exponential backoff
 */
export function calculateBackoffDelay(
    attempt: number, 
    config: RetryConfig = retryConfig
): number {
    const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
    return Math.min(delay, config.maxDelayMs);
}

/**
 * Utility function to sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
