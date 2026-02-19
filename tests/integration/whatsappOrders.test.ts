import express from 'express';
import request from 'supertest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { setupRoutes } from '../../src/api/routes';
import { GuideParser } from '../../src/services/GuideParser';
import { CustomerMatcher } from '../../src/services/CustomerMatcher';
import { WhatsAppSender } from '../../src/services/WhatsAppSender';

jest.mock('../../src/services/GuideParser');
jest.mock('../../src/services/CustomerMatcher');
jest.mock('../../src/services/WhatsAppSender');
jest.mock('../../src/services/ShipmentService', () => ({
    ShipmentService: jest.fn().mockImplementation(() => ({
        createShipment: jest.fn()
    }))
}));
jest.mock('../../src/services/WhatsAppChatParser', () => ({
    WhatsAppChatParser: jest.fn().mockImplementation(() => ({
        parseImages: jest.fn().mockResolvedValue([
            {
                customerName: 'Jezus H.',
                phone: '3127996451',
                address: 'Avenida 44 n 44 013',
                city: 'Bello',
                neighborhood: 'Niquia',
                department: 'Antioquia',
                cedula: null,
                references: null,
                product: null,
                rawText: 'sample OCR text',
                confidence: 0.75
            }
        ])
    }))
}));

const TEST_API_KEY = 'test-shipping-api-key';

describe('WhatsApp Orders API Endpoints', () => {
    let app: express.Application;
    let mockParser: jest.Mocked<GuideParser>;
    let mockMatcher: jest.Mocked<CustomerMatcher>;
    let mockSender: jest.Mocked<WhatsAppSender>;
    let tmpDir: string;

    beforeEach(() => {
        mockParser = new GuideParser() as jest.Mocked<GuideParser>;
        mockMatcher = new CustomerMatcher({} as any) as jest.Mocked<CustomerMatcher>;
        mockSender = new WhatsAppSender({ apiUrl: '', apiKey: '' }) as jest.Mocked<WhatsAppSender>;

        app = express();
        setupRoutes(app, {
            parser: mockParser,
            matcher: mockMatcher,
            sender: mockSender
        });

        tmpDir = os.tmpdir();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/extract-whatsapp-orders', () => {
        let testImagePath: string;

        beforeEach(() => {
            // Create a minimal valid PNG (1x1 pixel) for testing
            testImagePath = path.join(tmpDir, 'test-wa-image.png');
            // Minimal PNG binary
            const minimalPng = Buffer.from(
                '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
                '2e00000000c4944415478016360f8cfc00000000200016dd4a260000000049454e44ae426082',
                'hex'
            );
            fs.writeFileSync(testImagePath, minimalPng);
        });

        afterEach(() => {
            if (fs.existsSync(testImagePath)) {
                fs.unlinkSync(testImagePath);
            }
        });

        it('should return 400 when no images are uploaded', async () => {
            const response = await request(app)
                .post('/api/extract-whatsapp-orders')
                .set('x-api-key', TEST_API_KEY)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toMatch(/no images/i);
        });

        it('should return extracted orders from uploaded images', async () => {
            const response = await request(app)
                .post('/api/extract-whatsapp-orders')
                .set('x-api-key', TEST_API_KEY)
                .attach('images', testImagePath)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.orders)).toBe(true);
            expect(response.body.orders.length).toBeGreaterThan(0);
            expect(response.body.orders[0]).toHaveProperty('customerName');
            expect(response.body.orders[0]).toHaveProperty('phone');
            expect(response.body.orders[0]).toHaveProperty('confidence');
        });

        it('should require API key authentication', async () => {
            await request(app)
                .post('/api/extract-whatsapp-orders')
                .attach('images', testImagePath)
                .expect(401);
        });
    });

    describe('POST /api/export-orders', () => {
        const sampleOrders = [
            {
                nombreDestinatario: 'Jezus H.',
                telefono: '3127996451',
                direccion: 'Avenida 44 n 44 013',
                ciudad: 'Bello',
                barrio: 'Niquia',
                conRecaudo: '',
                nota: '',
                email: '',
                idVariable: '',
                codigoPostal: '',
                transportadora: 'Coordinadora',
                cedula: '',
                colonia: '',
                seguro: ''
            }
        ];

        it('should return 400 when no orders are provided', async () => {
            const response = await request(app)
                .post('/api/export-orders')
                .set('x-api-key', TEST_API_KEY)
                .set('Content-Type', 'application/json')
                .send({ orders: [] })
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should return CSV file when format is csv', async () => {
            const response = await request(app)
                .post('/api/export-orders')
                .set('x-api-key', TEST_API_KEY)
                .set('Content-Type', 'application/json')
                .send({ orders: sampleOrders, format: 'csv' })
                .expect(200);

            expect(response.headers['content-type']).toMatch(/text\/csv/);
            expect(response.headers['content-disposition']).toMatch(/ordenes_masivas\.csv/);
            expect(response.text).toContain('NOMBRE DESTINATARIO');
            expect(response.text).toContain('Jezus H.');
        });

        it('should return CSV by default when format is not specified', async () => {
            const response = await request(app)
                .post('/api/export-orders')
                .set('x-api-key', TEST_API_KEY)
                .set('Content-Type', 'application/json')
                .send({ orders: sampleOrders })
                .expect(200);

            expect(response.headers['content-type']).toMatch(/text\/csv/);
        });

        it('should return xlsx file when format is xlsx', async () => {
            const response = await request(app)
                .post('/api/export-orders')
                .set('x-api-key', TEST_API_KEY)
                .set('Content-Type', 'application/json')
                .send({ orders: sampleOrders, format: 'xlsx' })
                .expect(200);

            expect(response.headers['content-type']).toMatch(/spreadsheetml/);
            expect(response.headers['content-disposition']).toMatch(/ordenes_masivas\.xlsx/);
        });

        it('should require API key authentication', async () => {
            await request(app)
                .post('/api/export-orders')
                .set('Content-Type', 'application/json')
                .send({ orders: sampleOrders })
                .expect(401);
        });
    });
});
