import express from 'express';
import request from 'supertest';

// Create mock before importing modules that use ShipmentService
const mockCreateShipment = jest.fn();

jest.mock('../../src/services/ShipmentService', () => ({
    ShipmentService: jest.fn().mockImplementation(() => ({
        createShipment: mockCreateShipment
    }))
}));

// Mock websocket module
const mockAddToOrderQueue = jest.fn();
const mockNotifyNewOrder = jest.fn();

jest.mock('../../src/websocket', () => ({
    addToOrderQueue: mockAddToOrderQueue,
    notifyNewOrder: mockNotifyNewOrder
}));

// Now import the modules that use ShipmentService
import { setupRoutes } from '../../src/api/routes';
import { GuideParser } from '../../src/services/GuideParser';
import { CustomerMatcher } from '../../src/services/CustomerMatcher';
import { WhatsAppSender } from '../../src/services/WhatsAppSender';

// Mock other services
jest.mock('../../src/services/GuideParser');
jest.mock('../../src/services/CustomerMatcher');
jest.mock('../../src/services/WhatsAppSender');

describe('Webhooks API Tests', () => {
    let app: express.Application;
    let mockParser: jest.Mocked<GuideParser>;
    let mockMatcher: jest.Mocked<CustomerMatcher>;
    let mockSender: jest.Mocked<WhatsAppSender>;

    beforeEach(() => {
        // Clear all mock calls
        jest.clearAllMocks();
        
        // Create fresh mocks
        mockParser = new GuideParser() as jest.Mocked<GuideParser>;
        mockMatcher = new CustomerMatcher({} as any) as jest.Mocked<CustomerMatcher>;
        mockSender = new WhatsAppSender({ apiUrl: '', apiKey: '' }) as jest.Mocked<WhatsAppSender>;

        // Setup default mock implementations
        mockParser.parse = jest.fn();
        mockMatcher.findCustomer = jest.fn();
        mockMatcher.updateOrderTracking = jest.fn();
        mockSender.sendGuide = jest.fn();

        // Create Express app and setup routes
        app = express();
        setupRoutes(app, {
            parser: mockParser,
            matcher: mockMatcher,
            sender: mockSender
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /webhooks/order-completed', () => {
        const validOrderData = {
            order_id: 1,
            order_number: 'ORD-2024-001',
            customer_name: 'Juan Carlos Pérez',
            customer_phone: '3001234567',
            shipping_address: 'Calle 45 # 23-67, Bogotá',
            shipping_phone: '3001234567',
            product_type: 'Custom Design',
            capacity: '16GB'
        };

        it('should create a shipment successfully with valid data', async () => {
            const mockShipment = {
                id: 1,
                orderNumber: validOrderData.order_number,
                trackingNumber: 'TA123ABC456DEF',
                customerName: validOrderData.customer_name,
                customerPhone: validOrderData.customer_phone,
                shippingAddress: validOrderData.shipping_address,
                shippingPhone: validOrderData.shipping_phone,
                productDescription: `USB ${validOrderData.capacity} - ${validOrderData.product_type}`,
                status: 'ready_for_shipping',
                createdAt: new Date(),
                updatedAt: new Date()
            };

            mockCreateShipment.mockResolvedValue(mockShipment);

            const response = await request(app)
                .post('/webhooks/order-completed')
                .send(validOrderData)
                .expect(200);

            expect(response.body).toEqual({
                success: true,
                shipment_id: mockShipment.id,
                tracking_number: mockShipment.trackingNumber
            });
        });

        it('should return 400 when order_number is missing', async () => {
            const invalidData = {
                customer_phone: '3001234567',
                shipping_address: 'Calle 45 # 23-67, Bogotá'
            };

            const response = await request(app)
                .post('/webhooks/order-completed')
                .send(invalidData)
                .expect(400);

            expect(response.body).toEqual({
                success: false,
                error: 'Missing required fields: order_number, customer_phone, shipping_address'
            });
        });

        it('should return 400 when customer_phone is missing', async () => {
            const invalidData = {
                order_number: 'ORD-2024-001',
                shipping_address: 'Calle 45 # 23-67, Bogotá'
            };

            const response = await request(app)
                .post('/webhooks/order-completed')
                .send(invalidData)
                .expect(400);

            expect(response.body).toEqual({
                success: false,
                error: 'Missing required fields: order_number, customer_phone, shipping_address'
            });
        });

        it('should return 400 when shipping_address is missing', async () => {
            const invalidData = {
                order_number: 'ORD-2024-001',
                customer_phone: '3001234567'
            };

            const response = await request(app)
                .post('/webhooks/order-completed')
                .send(invalidData)
                .expect(400);

            expect(response.body).toEqual({
                success: false,
                error: 'Missing required fields: order_number, customer_phone, shipping_address'
            });
        });

        it('should use customer_phone as shipping_phone when shipping_phone is not provided', async () => {
            const dataWithoutShippingPhone = {
                order_number: 'ORD-2024-001',
                customer_name: 'Juan Carlos Pérez',
                customer_phone: '3001234567',
                shipping_address: 'Calle 45 # 23-67, Bogotá',
                product_type: 'Custom Design',
                capacity: '16GB'
            };

            const mockShipment = {
                id: 1,
                orderNumber: dataWithoutShippingPhone.order_number,
                trackingNumber: 'TA123ABC456DEF',
                customerName: dataWithoutShippingPhone.customer_name,
                customerPhone: dataWithoutShippingPhone.customer_phone,
                shippingAddress: dataWithoutShippingPhone.shipping_address,
                shippingPhone: dataWithoutShippingPhone.customer_phone,
                productDescription: `USB ${dataWithoutShippingPhone.capacity} - ${dataWithoutShippingPhone.product_type}`,
                status: 'ready_for_shipping',
                createdAt: new Date(),
                updatedAt: new Date()
            };

            mockCreateShipment.mockResolvedValue(mockShipment);

            const response = await request(app)
                .post('/webhooks/order-completed')
                .send(dataWithoutShippingPhone)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(mockCreateShipment).toHaveBeenCalledWith(
                expect.objectContaining({
                    shippingPhone: dataWithoutShippingPhone.customer_phone
                })
            );
        });

        it('should handle database errors gracefully', async () => {
            mockCreateShipment.mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app)
                .post('/webhooks/order-completed')
                .send(validOrderData)
                .expect(500);

            expect(response.body).toEqual({
                success: false,
                error: 'Failed to create shipment'
            });
        });

        it('should handle empty request body', async () => {
            const response = await request(app)
                .post('/webhooks/order-completed')
                .send({})
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Missing required fields');
        });

        it('should handle optional fields being null or empty', async () => {
            // When product_type and capacity are null, productDescription should just be 'USB'
            const minimalData = {
                order_number: 'ORD-2024-001',
                customer_name: null,
                customer_phone: '3001234567',
                shipping_address: 'Calle 45 # 23-67, Bogotá',
                product_type: null,
                capacity: null
            };

            const mockShipment = {
                id: 1,
                orderNumber: minimalData.order_number,
                trackingNumber: 'TA123ABC456DEF',
                customerName: '',
                customerPhone: minimalData.customer_phone,
                shippingAddress: minimalData.shipping_address,
                shippingPhone: minimalData.customer_phone,
                productDescription: 'USB',
                status: 'ready_for_shipping',
                createdAt: new Date(),
                updatedAt: new Date()
            };

            mockCreateShipment.mockResolvedValue(mockShipment);

            const response = await request(app)
                .post('/webhooks/order-completed')
                .send(minimalData)
                .expect(200);

            expect(response.body.success).toBe(true);
            
            // Verify the product description was built correctly
            expect(mockCreateShipment).toHaveBeenCalledWith(
                expect.objectContaining({
                    productDescription: 'USB'
                })
            );
        });

        it('should build product description correctly with only capacity', async () => {
            const dataWithCapacityOnly = {
                order_number: 'ORD-2024-001',
                customer_phone: '3001234567',
                shipping_address: 'Calle 45 # 23-67, Bogotá',
                capacity: '16GB'
            };

            const mockShipment = {
                id: 1,
                orderNumber: dataWithCapacityOnly.order_number,
                trackingNumber: 'TA123ABC456DEF',
                customerName: '',
                customerPhone: dataWithCapacityOnly.customer_phone,
                shippingAddress: dataWithCapacityOnly.shipping_address,
                shippingPhone: dataWithCapacityOnly.customer_phone,
                productDescription: 'USB 16GB',
                status: 'ready_for_shipping',
                createdAt: new Date(),
                updatedAt: new Date()
            };

            mockCreateShipment.mockResolvedValue(mockShipment);

            await request(app)
                .post('/webhooks/order-completed')
                .send(dataWithCapacityOnly)
                .expect(200);
            
            expect(mockCreateShipment).toHaveBeenCalledWith(
                expect.objectContaining({
                    productDescription: 'USB 16GB'
                })
            );
        });

        it('should build product description correctly with only product_type', async () => {
            const dataWithProductTypeOnly = {
                order_number: 'ORD-2024-001',
                customer_phone: '3001234567',
                shipping_address: 'Calle 45 # 23-67, Bogotá',
                product_type: 'Custom Design'
            };

            const mockShipment = {
                id: 1,
                orderNumber: dataWithProductTypeOnly.order_number,
                trackingNumber: 'TA123ABC456DEF',
                customerName: '',
                customerPhone: dataWithProductTypeOnly.customer_phone,
                shippingAddress: dataWithProductTypeOnly.shipping_address,
                shippingPhone: dataWithProductTypeOnly.customer_phone,
                productDescription: 'USB Custom Design',
                status: 'ready_for_shipping',
                createdAt: new Date(),
                updatedAt: new Date()
            };

            mockCreateShipment.mockResolvedValue(mockShipment);

            await request(app)
                .post('/webhooks/order-completed')
                .send(dataWithProductTypeOnly)
                .expect(200);
            
            expect(mockCreateShipment).toHaveBeenCalledWith(
                expect.objectContaining({
                    productDescription: 'USB Custom Design'
                })
            );
        });
    });

    describe('404 Handler with webhooks endpoint', () => {
        it('should include webhooks endpoint in available endpoints list', async () => {
            const response = await request(app)
                .get('/unknown-route')
                .expect(404);

            expect(response.body.availableEndpoints).toContain('POST /webhooks/order-completed');
        });

        it('should include new-order webhook endpoint in available endpoints list', async () => {
            const response = await request(app)
                .get('/unknown-route')
                .expect(404);

            expect(response.body.availableEndpoints).toContain('POST /webhooks/new-order');
        });
    });

    describe('POST /webhooks/new-order', () => {
        const validNewOrderData = {
            event: 'order_ready_for_shipping',
            order_number: 'ORD-2024-002',
            customer_name: 'María García',
            customer_phone: '3009876543',
            shipping_address: 'Carrera 7 # 100-25, Medellín',
            city: 'Medellín',
            product_description: 'USB 32GB Custom',
            created_at: '2024-01-15T10:30:00Z'
        };

        beforeEach(() => {
            mockAddToOrderQueue.mockClear();
            mockNotifyNewOrder.mockClear();
        });

        it('should process new order webhook successfully', async () => {
            const response = await request(app)
                .post('/webhooks/new-order')
                .send(validNewOrderData)
                .expect(200);

            expect(response.body).toEqual({
                success: true,
                message: 'Order queued for processing'
            });
        });

        it('should add order to queue and notify via WebSocket', async () => {
            await request(app)
                .post('/webhooks/new-order')
                .send(validNewOrderData)
                .expect(200);

            expect(mockAddToOrderQueue).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderNumber: validNewOrderData.order_number,
                    customerName: validNewOrderData.customer_name,
                    phone: validNewOrderData.customer_phone,
                    address: validNewOrderData.shipping_address,
                    city: validNewOrderData.city,
                    product: validNewOrderData.product_description
                })
            );

            expect(mockNotifyNewOrder).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderNumber: validNewOrderData.order_number
                })
            );
        });

        it('should return 400 when order_number is missing', async () => {
            const invalidData = {
                event: 'order_ready_for_shipping',
                customer_name: 'María García',
                customer_phone: '3009876543'
            };

            const response = await request(app)
                .post('/webhooks/new-order')
                .send(invalidData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Missing required field: order_number');
        });

        it('should return 401 when API key is invalid and WEBHOOK_SECRET is set', async () => {
            // Save original env
            const originalSecret = process.env.WEBHOOK_SECRET;
            process.env.WEBHOOK_SECRET = 'test-secret-key';

            try {
                const response = await request(app)
                    .post('/webhooks/new-order')
                    .set('x-api-key', 'wrong-key')
                    .send(validNewOrderData)
                    .expect(401);

                expect(response.body.error).toBe('Unauthorized');
            } finally {
                // Restore original env (properly handle undefined)
                if (originalSecret === undefined) {
                    delete process.env.WEBHOOK_SECRET;
                } else {
                    process.env.WEBHOOK_SECRET = originalSecret;
                }
            }
        });

        it('should accept request with correct API key when WEBHOOK_SECRET is set', async () => {
            // Save original env
            const originalSecret = process.env.WEBHOOK_SECRET;
            process.env.WEBHOOK_SECRET = 'test-secret-key';

            try {
                const response = await request(app)
                    .post('/webhooks/new-order')
                    .set('x-api-key', 'test-secret-key')
                    .send(validNewOrderData)
                    .expect(200);

                expect(response.body.success).toBe(true);
            } finally {
                // Restore original env (properly handle undefined)
                if (originalSecret === undefined) {
                    delete process.env.WEBHOOK_SECRET;
                } else {
                    process.env.WEBHOOK_SECRET = originalSecret;
                }
            }
        });

        it('should handle missing optional fields gracefully', async () => {
            const minimalData = {
                event: 'order_ready_for_shipping',
                order_number: 'ORD-2024-003'
            };

            const response = await request(app)
                .post('/webhooks/new-order')
                .send(minimalData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(mockAddToOrderQueue).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderNumber: 'ORD-2024-003',
                    customerName: '',
                    phone: '',
                    address: '',
                    city: '',
                    product: ''
                })
            );
        });
    });
});
