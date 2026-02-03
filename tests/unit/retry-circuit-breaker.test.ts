import { WhatsAppSender, CircuitState } from '../../src/services/WhatsAppSender';
import { mockParsedGuideData } from '../fixtures/mock-data';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock fs for file operations
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    createReadStream: jest.fn(() => {
        const { Readable } = require('stream');
        // Create a proper readable stream that FormData can use
        const mockStream = new Readable({
            read() {
                this.push(Buffer.from('mock file content'));
                this.push(null); // End of stream
            }
        });
        return mockStream;
    }),
}));

describe('WhatsAppSender - Retry and Circuit Breaker', () => {
    let sender: WhatsAppSender;
    const config = {
        apiUrl: 'http://localhost:9999',
        apiKey: 'test-api-key',
        retryConfig: {
            maxRetries: 2,
            initialDelayMs: 10, // Short delay for testing
            maxDelayMs: 100,
            backoffMultiplier: 2
        },
        circuitBreakerConfig: {
            failureThreshold: 3,
            resetTimeoutMs: 100 // Short timeout for testing
        }
    };

    beforeEach(() => {
        sender = new WhatsAppSender(config);
        jest.clearAllMocks();
    });

    describe('Circuit Breaker', () => {
        it('should start with CLOSED circuit state', () => {
            expect(sender.getCircuitState()).toBe(CircuitState.CLOSED);
        });

        it('should remain CLOSED on successful requests', async () => {
            mockedAxios.post.mockResolvedValue({ data: { success: true } });

            await sender.sendGuide(
                '3001234567',
                mockParsedGuideData,
                '/tmp/test-guide.pdf'
            );

            expect(sender.getCircuitState()).toBe(CircuitState.CLOSED);
        });

        it('should open circuit after threshold failures', async () => {
            // Simulate network errors (retryable)
            mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

            // Make enough requests to trigger circuit breaker
            // Each request will retry and fail, counting towards threshold
            for (let i = 0; i < config.circuitBreakerConfig.failureThreshold; i++) {
                await sender.sendGuide(
                    '3001234567',
                    mockParsedGuideData,
                    '/tmp/test-guide.pdf'
                );
            }

            expect(sender.getCircuitState()).toBe(CircuitState.OPEN);
        });

        it('should reject requests when circuit is OPEN', async () => {
            mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

            // Trigger circuit breaker
            for (let i = 0; i < config.circuitBreakerConfig.failureThreshold; i++) {
                await sender.sendGuide(
                    '3001234567',
                    mockParsedGuideData,
                    '/tmp/test-guide.pdf'
                );
            }

            // Reset call count
            mockedAxios.post.mockClear();

            // Next request should be blocked by circuit breaker
            const result = await sender.sendGuide(
                '3001234567',
                mockParsedGuideData,
                '/tmp/test-guide.pdf'
            );

            expect(result).toBe(false);
            // No actual API call should be made
            expect(mockedAxios.post).not.toHaveBeenCalled();
        });

        it('should allow test request after reset timeout (HALF_OPEN)', async () => {
            // Reset mock to ensure fresh state
            mockedAxios.post.mockReset();
            
            // Create a fresh sender
            const halfOpenSender = new WhatsAppSender(config);
            
            mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

            // Trigger circuit breaker
            for (let i = 0; i < config.circuitBreakerConfig.failureThreshold; i++) {
                await halfOpenSender.sendGuide(
                    '3001234567',
                    mockParsedGuideData,
                    '/tmp/test-guide.pdf'
                );
            }

            expect(halfOpenSender.getCircuitState()).toBe(CircuitState.OPEN);

            // Wait for reset timeout
            await new Promise(resolve => setTimeout(resolve, config.circuitBreakerConfig.resetTimeoutMs + 50));

            // Reset mock to succeed
            mockedAxios.post.mockReset();
            mockedAxios.post.mockResolvedValue({ data: { success: true } });

            // This request should be allowed (HALF_OPEN -> CLOSED on success)
            const result = await halfOpenSender.sendGuide(
                '3001234567',
                mockParsedGuideData,
                '/tmp/test-guide.pdf'
            );

            expect(result).toBe(true);
            expect(halfOpenSender.getCircuitState()).toBe(CircuitState.CLOSED);
        });

        it('should reset circuit breaker on manual reset', async () => {
            mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

            // Trigger circuit breaker
            for (let i = 0; i < config.circuitBreakerConfig.failureThreshold; i++) {
                await sender.sendGuide(
                    '3001234567',
                    mockParsedGuideData,
                    '/tmp/test-guide.pdf'
                );
            }

            expect(sender.getCircuitState()).toBe(CircuitState.OPEN);

            // Manually reset
            sender.resetCircuitBreaker();

            expect(sender.getCircuitState()).toBe(CircuitState.CLOSED);
            expect(sender.getFailureCount()).toBe(0);
        });
    });

    describe('Retry Logic', () => {
        it('should retry on retryable errors and succeed eventually', async () => {
            // Reset all mocks and setup fresh
            mockedAxios.post.mockReset();
            
            // Create a fresh sender for this test
            const retrySender = new WhatsAppSender({
                ...config,
                circuitBreakerConfig: {
                    failureThreshold: 10, // High threshold to not trigger circuit breaker
                    resetTimeoutMs: 100
                }
            });

            // First 2 calls fail with ETIMEDOUT, then all succeed
            let callCount = 0;
            mockedAxios.post.mockImplementation(() => {
                callCount++;
                if (callCount <= 2) {
                    return Promise.reject(new Error('ETIMEDOUT'));
                }
                return Promise.resolve({ data: { success: true } });
            });

            const result = await retrySender.sendGuide(
                '3001234567',
                mockParsedGuideData,
                '/tmp/test-guide.pdf'
            );

            expect(result).toBe(true);
            // Should have called: 2 failed + 1 success for text + 1 for media = 4
            expect(mockedAxios.post).toHaveBeenCalledTimes(4);
        });

        it('should not retry on non-retryable errors (4xx)', async () => {
            mockedAxios.post.mockReset();
            
            const error401 = {
                response: { status: 401, data: { error: 'Unauthorized' } },
                isAxiosError: true
            };
            mockedAxios.post.mockRejectedValue(error401);

            const result = await sender.sendGuide(
                '3001234567',
                mockParsedGuideData,
                '/tmp/test-guide.pdf'
            );

            expect(result).toBe(false);
            // Should only try once for 401 (non-retryable)
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        });

        it('should retry on 5xx errors', async () => {
            mockedAxios.post.mockReset();
            
            // Create a fresh sender for this test
            const retrySender = new WhatsAppSender({
                ...config,
                circuitBreakerConfig: {
                    failureThreshold: 10, // High threshold to not trigger circuit breaker
                    resetTimeoutMs: 100
                }
            });

            // First call fails with 500, then all succeed
            let callCount = 0;
            mockedAxios.post.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.reject({
                        response: { status: 500, data: { error: 'Internal Server Error' } },
                        isAxiosError: true
                    });
                }
                return Promise.resolve({ data: { success: true } });
            });

            const result = await retrySender.sendGuide(
                '3001234567',
                mockParsedGuideData,
                '/tmp/test-guide.pdf'
            );

            expect(result).toBe(true);
            // 1 failed + 1 success for text + 1 for media
            expect(mockedAxios.post).toHaveBeenCalledTimes(3);
        });

        it('should stop retrying after max retries', async () => {
            mockedAxios.post.mockReset();
            
            // Create a fresh sender with high circuit breaker threshold
            const retrySender = new WhatsAppSender({
                ...config,
                circuitBreakerConfig: {
                    failureThreshold: 10,
                    resetTimeoutMs: 100
                }
            });

            mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

            const result = await retrySender.sendGuide(
                '3001234567',
                mockParsedGuideData,
                '/tmp/test-guide.pdf'
            );

            expect(result).toBe(false);
            // Initial attempt + maxRetries (2) = 3 total attempts
            expect(mockedAxios.post).toHaveBeenCalledTimes(3);
        });
    });

    describe('Health Check', () => {
        it('should return healthy when API is reachable', async () => {
            mockedAxios.get = jest.fn().mockResolvedValue({ data: { status: 'ok' } });

            const health = await sender.checkHealth();

            expect(health.healthy).toBe(true);
            expect(health.circuitState).toBe(CircuitState.CLOSED);
            expect(health.responseTimeMs).toBeDefined();
        });

        it('should return unhealthy when API is not reachable', async () => {
            mockedAxios.get = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

            const health = await sender.checkHealth();

            expect(health.healthy).toBe(false);
            expect(health.message).toContain('ECONNREFUSED');
        });

        it('should include circuit breaker state in health response', async () => {
            mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

            // Trigger circuit breaker
            for (let i = 0; i < config.circuitBreakerConfig.failureThreshold; i++) {
                await sender.sendGuide(
                    '3001234567',
                    mockParsedGuideData,
                    '/tmp/test-guide.pdf'
                );
            }

            mockedAxios.get = jest.fn().mockResolvedValue({ data: { status: 'ok' } });

            const health = await sender.checkHealth();

            expect(health.circuitState).toBe(CircuitState.OPEN);
        });
    });

    describe('Structured Logging', () => {
        it('should log structured messages on send guide start', async () => {
            const consoleSpy = jest.spyOn(console, 'log');
            mockedAxios.post.mockResolvedValue({ data: { success: true } });

            await sender.sendGuide(
                '3001234567',
                mockParsedGuideData,
                '/tmp/test-guide.pdf'
            );

            const logCalls = consoleSpy.mock.calls.map(call => {
                try {
                    return JSON.parse(call[0]);
                } catch {
                    return null;
                }
            }).filter(log => log !== null);

            const startLog = logCalls.find(log => log.action === 'send_guide_start');
            expect(startLog).toBeDefined();
            expect(startLog.service).toBe('WhatsAppSender');
            expect(startLog.level).toBe('INFO');

            consoleSpy.mockRestore();
        });

        it('should mask phone numbers in logs', async () => {
            const consoleSpy = jest.spyOn(console, 'log');
            mockedAxios.post.mockResolvedValue({ data: { success: true } });

            await sender.sendGuide(
                '3001234567',
                mockParsedGuideData,
                '/tmp/test-guide.pdf'
            );

            const logCalls = consoleSpy.mock.calls.map(call => {
                try {
                    return JSON.parse(call[0]);
                } catch {
                    return null;
                }
            }).filter(log => log !== null);

            const startLog = logCalls.find(log => log.action === 'send_guide_start');
            expect(startLog).toBeDefined();
            // Phone should be masked, not showing full number
            expect(startLog.metadata.phone).not.toBe('3001234567');
            expect(startLog.metadata.phone).toContain('4567'); // Last 4 digits visible

            consoleSpy.mockRestore();
        });

        it('should log errors with structured format', async () => {
            const consoleSpy = jest.spyOn(console, 'error');
            mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

            await sender.sendGuide(
                '3001234567',
                mockParsedGuideData,
                '/tmp/test-guide.pdf'
            );

            const errorLogs = consoleSpy.mock.calls.map(call => {
                try {
                    return JSON.parse(call[0]);
                } catch {
                    return null;
                }
            }).filter(log => log !== null);

            const errorLog = errorLogs.find(log => log.action === 'send_guide_failed');
            expect(errorLog).toBeDefined();
            expect(errorLog.level).toBe('ERROR');

            consoleSpy.mockRestore();
        });
    });
});
