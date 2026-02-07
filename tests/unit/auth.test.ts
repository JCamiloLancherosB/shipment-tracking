import express from 'express';
import request from 'supertest';
import { apiKeyAuth } from '../../src/middleware/auth';
import { config } from '../../src/config/config';

describe('API Key Authentication Middleware', () => {
    let app: express.Application;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.get('/protected', apiKeyAuth, (_req, res) => {
            res.json({ success: true });
        });
        app.get('/public', (_req, res) => {
            res.json({ success: true });
        });
    });

    describe('when SHIPPING_API_KEY is set', () => {
        const originalApiKey = config.apiKey;

        beforeEach(() => {
            (config as any).apiKey = 'test-shipping-api-key';
        });

        afterEach(() => {
            (config as any).apiKey = originalApiKey;
        });

        it('should return 401 when no API key is provided', async () => {
            const response = await request(app)
                .get('/protected')
                .expect(401);

            expect(response.body).toEqual({
                error: 'Unauthorized',
                message: 'Missing API key'
            });
        });

        it('should return 401 when invalid API key is provided via x-api-key', async () => {
            const response = await request(app)
                .get('/protected')
                .set('x-api-key', 'wrong-key')
                .expect(401);

            expect(response.body).toEqual({
                error: 'Unauthorized',
                message: 'Invalid API key'
            });
        });

        it('should return 401 when invalid API key is provided via Authorization Bearer', async () => {
            const response = await request(app)
                .get('/protected')
                .set('Authorization', 'Bearer wrong-key')
                .expect(401);

            expect(response.body).toEqual({
                error: 'Unauthorized',
                message: 'Invalid API key'
            });
        });

        it('should allow request with valid x-api-key header', async () => {
            const response = await request(app)
                .get('/protected')
                .set('x-api-key', 'test-shipping-api-key')
                .expect(200);

            expect(response.body).toEqual({ success: true });
        });

        it('should allow request with valid Authorization Bearer header', async () => {
            const response = await request(app)
                .get('/protected')
                .set('Authorization', 'Bearer test-shipping-api-key')
                .expect(200);

            expect(response.body).toEqual({ success: true });
        });

        it('should prefer x-api-key over Authorization header', async () => {
            const response = await request(app)
                .get('/protected')
                .set('x-api-key', 'test-shipping-api-key')
                .set('Authorization', 'Bearer wrong-key')
                .expect(200);

            expect(response.body).toEqual({ success: true });
        });

        it('should not affect public endpoints without middleware', async () => {
            const response = await request(app)
                .get('/public')
                .expect(200);

            expect(response.body).toEqual({ success: true });
        });

        it('should reject Authorization header without Bearer prefix', async () => {
            const response = await request(app)
                .get('/protected')
                .set('Authorization', 'test-shipping-api-key')
                .expect(401);

            expect(response.body).toEqual({
                error: 'Unauthorized',
                message: 'Missing API key'
            });
        });
    });

    describe('when SHIPPING_API_KEY is not set', () => {
        const originalApiKey = config.apiKey;

        beforeEach(() => {
            (config as any).apiKey = '';
        });

        afterEach(() => {
            (config as any).apiKey = originalApiKey;
        });

        it('should allow requests without API key when no key is configured', async () => {
            const response = await request(app)
                .get('/protected')
                .expect(200);

            expect(response.body).toEqual({ success: true });
        });
    });
});
