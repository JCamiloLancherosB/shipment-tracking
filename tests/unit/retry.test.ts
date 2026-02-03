import { 
    retryConfig, 
    circuitBreakerConfig, 
    calculateBackoffDelay, 
    sleep,
    RetryConfig
} from '../../src/config/retry';

describe('Retry Configuration', () => {
    describe('default values', () => {
        it('should have default retry configuration', () => {
            expect(retryConfig.maxRetries).toBe(3);
            expect(retryConfig.initialDelayMs).toBe(1000);
            expect(retryConfig.maxDelayMs).toBe(10000);
            expect(retryConfig.backoffMultiplier).toBe(2);
        });

        it('should have default circuit breaker configuration', () => {
            expect(circuitBreakerConfig.failureThreshold).toBe(5);
            expect(circuitBreakerConfig.resetTimeoutMs).toBe(30000);
        });
    });

    describe('calculateBackoffDelay', () => {
        const testConfig: RetryConfig = {
            maxRetries: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            backoffMultiplier: 2
        };

        it('should return initial delay for first attempt', () => {
            const delay = calculateBackoffDelay(0, testConfig);
            expect(delay).toBe(1000);
        });

        it('should double delay for each attempt', () => {
            expect(calculateBackoffDelay(0, testConfig)).toBe(1000);
            expect(calculateBackoffDelay(1, testConfig)).toBe(2000);
            expect(calculateBackoffDelay(2, testConfig)).toBe(4000);
            expect(calculateBackoffDelay(3, testConfig)).toBe(8000);
        });

        it('should cap delay at maxDelayMs', () => {
            expect(calculateBackoffDelay(4, testConfig)).toBe(10000); // 16000 capped to 10000
            expect(calculateBackoffDelay(10, testConfig)).toBe(10000);
        });

        it('should use default config when not provided', () => {
            const delay = calculateBackoffDelay(0);
            expect(delay).toBeGreaterThan(0);
        });
    });

    describe('sleep', () => {
        it('should resolve after specified time', async () => {
            const startTime = Date.now();
            await sleep(50);
            const endTime = Date.now();
            
            // Allow 20ms tolerance for CI environments
            expect(endTime - startTime).toBeGreaterThanOrEqual(30);
        });

        it('should handle zero delay', async () => {
            const startTime = Date.now();
            await sleep(0);
            const endTime = Date.now();
            
            expect(endTime - startTime).toBeLessThan(50);
        });
    });
});
