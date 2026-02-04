/**
 * Integration tests for carrier routes
 */

import express from 'express';
import request from 'supertest';
import carrierRoutes from '../../src/api/carrierRoutes';

describe('Carrier Routes Integration Tests', () => {
    let app: express.Application;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/api', carrierRoutes);
    });

    describe('GET /api/carriers', () => {
        it('should return list of all carriers', async () => {
            const response = await request(app)
                .get('/api/carriers')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.carriers).toBeInstanceOf(Array);
            expect(response.body.carriers.length).toBe(6);

            for (const carrier of response.body.carriers) {
                expect(carrier.id).toBeDefined();
                expect(carrier.name).toBeDefined();
                expect(carrier.logo).toBeDefined();
                expect(typeof carrier.hasPickup).toBe('boolean');
                expect(typeof carrier.pricePerKg).toBe('number');
            }
        });
    });

    describe('GET /api/carriers/:carrierId', () => {
        it('should return carrier details', async () => {
            const response = await request(app)
                .get('/api/carriers/servientrega')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.carrier.id).toBe('servientrega');
            expect(response.body.carrier.name).toBe('Servientrega');
            expect(response.body.carrier.supportedCities).toBeInstanceOf(Array);
        });

        it('should return 404 for unknown carrier', async () => {
            const response = await request(app)
                .get('/api/carriers/unknown-carrier')
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Transportadora no encontrada');
        });
    });

    describe('GET /api/carriers/quote', () => {
        it('should return quotes for valid route', async () => {
            const response = await request(app)
                .get('/api/carriers/quote')
                .query({ origin: 'Bogotá', destination: 'Medellín', weight: 2 })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.quotes).toBeInstanceOf(Array);
            expect(response.body.quotes.length).toBeGreaterThan(0);

            for (const quote of response.body.quotes) {
                expect(quote.carrier).toBeDefined();
                expect(quote.name).toBeDefined();
                expect(quote.quote.available).toBe(true);
                expect(quote.quote.price).toBeGreaterThan(0);
            }
        });

        it('should return empty quotes for unsupported route', async () => {
            const response = await request(app)
                .get('/api/carriers/quote')
                .query({ origin: 'Ciudad Falsa', destination: 'Otra Falsa', weight: 1 })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.quotes).toHaveLength(0);
        });

        it('should return 400 when missing parameters', async () => {
            const response = await request(app)
                .get('/api/carriers/quote')
                .query({ origin: 'Bogotá' })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Parámetros requeridos');
        });
    });

    describe('GET /api/tracking/:trackingNumber', () => {
        it('should return tracking info for valid tracking number', async () => {
            const response = await request(app)
                .get('/api/tracking/SV123456789')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.tracking).toBeDefined();
            expect(response.body.tracking.carrier).toBe('Servientrega');
            expect(response.body.tracking.trackingNumber).toBe('SV123456789');
            expect(response.body.tracking.status).toBeDefined();
            expect(response.body.tracking.events).toBeInstanceOf(Array);
        });

        it('should detect carrier from tracking number prefix', async () => {
            const testCases = [
                { trackingNumber: 'IR123456789', expectedCarrier: 'InterRapidísimo' },
                { trackingNumber: 'SV123456789', expectedCarrier: 'Servientrega' },
                { trackingNumber: 'ENV123456789', expectedCarrier: 'Envía Colvanes' },
                { trackingNumber: 'CD123456789', expectedCarrier: 'Coordinadora' },
                { trackingNumber: 'TCC123456789', expectedCarrier: 'TCC' },
                { trackingNumber: 'DPR123456789', expectedCarrier: 'Deprisa' },
            ];

            for (const { trackingNumber, expectedCarrier } of testCases) {
                const response = await request(app)
                    .get(`/api/tracking/${trackingNumber}`)
                    .expect(200);

                expect(response.body.tracking.carrier).toBe(expectedCarrier);
            }
        });

        it('should return 400 for empty tracking number', async () => {
            const response = await request(app)
                .get('/api/tracking/%20')
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/shipments', () => {
        const validShipmentRequest = {
            origin: 'Bogotá',
            destination: 'Medellín',
            weight: 2,
            priority: 'balanced',
            recipientData: {
                name: 'Juan Pérez',
                phone: '3001234567',
                address: 'Calle 50 # 40-30',
                city: 'Medellín'
            },
            orderNumber: 'ORD-2024-001'
        };

        it('should create shipment with balanced priority', async () => {
            const response = await request(app)
                .post('/api/shipments')
                .send(validShipmentRequest)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.shipment.trackingNumber).toBeDefined();
            expect(response.body.shipment.carrier).toBeDefined();
            expect(response.body.shipment.estimatedDelivery).toBeDefined();
            expect(response.body.quote).toBeDefined();
            expect(response.body.selectionReason).toContain('balance');
        });

        it('should create shipment with fastest priority', async () => {
            const response = await request(app)
                .post('/api/shipments')
                .send({ ...validShipmentRequest, priority: 'fastest' })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.selectionReason).toContain('más rápido');
        });

        it('should create shipment with cheapest priority', async () => {
            const response = await request(app)
                .post('/api/shipments')
                .send({ ...validShipmentRequest, priority: 'cheapest' })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.selectionReason).toContain('más económico');
        });

        it('should return 400 when missing required fields', async () => {
            const response = await request(app)
                .post('/api/shipments')
                .send({ origin: 'Bogotá' })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Campos requeridos');
        });

        it('should return 400 when recipient data is incomplete', async () => {
            const response = await request(app)
                .post('/api/shipments')
                .send({
                    ...validShipmentRequest,
                    recipientData: { name: 'Juan' }
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Datos de destinatario incompletos');
        });

        it('should return 500 when no carriers support the route', async () => {
            const response = await request(app)
                .post('/api/shipments')
                .send({
                    ...validShipmentRequest,
                    destination: 'Ciudad Inexistente'
                })
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('No hay transportadoras disponibles');
        });
    });

    describe('DELETE /api/shipments/:trackingNumber', () => {
        it('should cancel shipment successfully', async () => {
            const response = await request(app)
                .delete('/api/shipments/SV123456789')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('cancelado');
        });

        it('should return 404 for unknown tracking format', async () => {
            const response = await request(app)
                .delete('/api/shipments/UNKNOWN123')
                .expect(404);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/shipments/:trackingNumber/label', () => {
        it('should return PDF label', async () => {
            const response = await request(app)
                .get('/api/shipments/SV123456789/label')
                .expect(200);

            expect(response.headers['content-type']).toBe('application/pdf');
            expect(response.headers['content-disposition']).toContain('label-SV123456789.pdf');
        });

        it('should return 404 for unknown tracking format', async () => {
            const response = await request(app)
                .get('/api/shipments/UNKNOWN123/label')
                .expect(404);

            expect(response.body.success).toBe(false);
        });
    });
});
