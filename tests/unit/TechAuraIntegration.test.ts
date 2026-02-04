import { TechAuraIntegration } from '../../src/services/TechAuraIntegration';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TechAuraIntegration', () => {
    let integration: TechAuraIntegration;
    const testConfig = {
        apiUrl: 'http://localhost:9999',
        apiKey: 'test-api-key'
    };

    beforeEach(() => {
        integration = new TechAuraIntegration(testConfig.apiUrl, testConfig.apiKey);
        jest.clearAllMocks();
    });

    describe('getOrdersReadyForShipping', () => {
        it('should return orders when API returns success', async () => {
            const mockOrders = [
                {
                    orderNumber: 'ORD-001',
                    customerName: 'Juan Pérez',
                    customerPhone: '3001234567',
                    shippingAddress: 'Calle 45 # 23-67, Bogotá',
                    status: 'confirmed'
                },
                {
                    orderNumber: 'ORD-002',
                    customerName: 'María García',
                    customerPhone: '3009876543',
                    shippingAddress: 'Carrera 7 # 100-25, Medellín',
                    status: 'confirmed'
                }
            ];

            mockedAxios.get.mockResolvedValue({
                data: { success: true, orders: mockOrders }
            });

            const result = await integration.getOrdersReadyForShipping();

            expect(result).toEqual(mockOrders);
            expect(mockedAxios.get).toHaveBeenCalledWith(
                'http://localhost:9999/api/shipping/orders-ready',
                {
                    headers: { 'X-API-Key': 'test-api-key' },
                    timeout: 10000
                }
            );
        });

        it('should return empty array when API returns no orders', async () => {
            mockedAxios.get.mockResolvedValue({
                data: { success: true, orders: [] }
            });

            const result = await integration.getOrdersReadyForShipping();

            expect(result).toEqual([]);
        });

        it('should return empty array when API returns success:false', async () => {
            mockedAxios.get.mockResolvedValue({
                data: { success: false, error: 'No orders found' }
            });

            const result = await integration.getOrdersReadyForShipping();

            expect(result).toEqual([]);
        });

        it('should return empty array on API error', async () => {
            mockedAxios.get.mockRejectedValue(new Error('Network error'));

            const result = await integration.getOrdersReadyForShipping();

            expect(result).toEqual([]);
        });

        it('should handle timeout errors gracefully', async () => {
            mockedAxios.get.mockRejectedValue(new Error('ETIMEDOUT'));

            const result = await integration.getOrdersReadyForShipping();

            expect(result).toEqual([]);
        });
    });

    describe('getOrderDetails', () => {
        it('should return order details when found', async () => {
            const mockOrder = {
                orderNumber: 'ORD-001',
                customerName: 'Juan Pérez',
                customerPhone: '3001234567',
                shippingAddress: 'Calle 45 # 23-67, Bogotá',
                city: 'Bogotá',
                productDescription: 'USB 16GB Custom',
                status: 'confirmed',
                paymentStatus: 'paid'
            };

            mockedAxios.get.mockResolvedValue({
                data: { success: true, order: mockOrder }
            });

            const result = await integration.getOrderDetails('ORD-001');

            expect(result).toEqual(mockOrder);
            expect(mockedAxios.get).toHaveBeenCalledWith(
                'http://localhost:9999/api/shipping/order/ORD-001',
                {
                    headers: { 'X-API-Key': 'test-api-key' },
                    timeout: 10000
                }
            );
        });

        it('should return null when order not found', async () => {
            mockedAxios.get.mockResolvedValue({
                data: { success: false, error: 'Order not found' }
            });

            const result = await integration.getOrderDetails('ORD-INVALID');

            expect(result).toBeNull();
        });

        it('should return null on API error', async () => {
            mockedAxios.get.mockRejectedValue(new Error('Network error'));

            const result = await integration.getOrderDetails('ORD-001');

            expect(result).toBeNull();
        });

        it('should encode order number in URL', async () => {
            mockedAxios.get.mockResolvedValue({
                data: { success: true, order: { orderNumber: 'ORD 001' } }
            });

            await integration.getOrderDetails('ORD 001');

            expect(mockedAxios.get).toHaveBeenCalledWith(
                'http://localhost:9999/api/shipping/order/ORD%20001',
                expect.any(Object)
            );
        });
    });

    describe('notifyGuideCreated', () => {
        it('should return true when notification is successful', async () => {
            mockedAxios.post.mockResolvedValue({
                data: { success: true }
            });

            const notificationData = {
                orderNumber: 'ORD-001',
                trackingNumber: 'TA123ABC456',
                carrier: 'Servientrega',
                estimatedDelivery: '2024-01-20'
            };

            const result = await integration.notifyGuideCreated(notificationData);

            expect(result).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://localhost:9999/api/shipping/guide-created',
                notificationData,
                {
                    headers: {
                        'X-API-Key': 'test-api-key',
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
        });

        it('should work without estimatedDelivery', async () => {
            mockedAxios.post.mockResolvedValue({
                data: { success: true }
            });

            const notificationData = {
                orderNumber: 'ORD-001',
                trackingNumber: 'TA123ABC456',
                carrier: 'Coordinadora'
            };

            const result = await integration.notifyGuideCreated(notificationData);

            expect(result).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://localhost:9999/api/shipping/guide-created',
                notificationData,
                expect.any(Object)
            );
        });

        it('should return false when notification fails', async () => {
            mockedAxios.post.mockResolvedValue({
                data: { success: false, error: 'Failed to notify' }
            });

            const result = await integration.notifyGuideCreated({
                orderNumber: 'ORD-001',
                trackingNumber: 'TA123ABC456',
                carrier: 'Servientrega'
            });

            expect(result).toBe(false);
        });

        it('should return false on API error', async () => {
            mockedAxios.post.mockRejectedValue(new Error('Network error'));

            const result = await integration.notifyGuideCreated({
                orderNumber: 'ORD-001',
                trackingNumber: 'TA123ABC456',
                carrier: 'Servientrega'
            });

            expect(result).toBe(false);
        });
    });

    describe('requestMissingData', () => {
        it('should return true when request is successful', async () => {
            mockedAxios.post.mockResolvedValue({
                data: { success: true }
            });

            const result = await integration.requestMissingData('ORD-001', ['shippingAddress', 'city']);

            expect(result).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://localhost:9999/api/shipping/request-missing-data',
                { order_number: 'ORD-001', missing_fields: ['shippingAddress', 'city'] },
                {
                    headers: {
                        'X-API-Key': 'test-api-key',
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
        });

        it('should return false when request fails', async () => {
            mockedAxios.post.mockResolvedValue({
                data: { success: false, error: 'Order not found' }
            });

            const result = await integration.requestMissingData('ORD-INVALID', ['phone']);

            expect(result).toBe(false);
        });

        it('should return false on API error', async () => {
            mockedAxios.post.mockRejectedValue(new Error('Network error'));

            const result = await integration.requestMissingData('ORD-001', ['city']);

            expect(result).toBe(false);
        });

        it('should handle empty missing fields array', async () => {
            mockedAxios.post.mockResolvedValue({
                data: { success: true }
            });

            const result = await integration.requestMissingData('ORD-001', []);

            expect(result).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://localhost:9999/api/shipping/request-missing-data',
                { order_number: 'ORD-001', missing_fields: [] },
                expect.any(Object)
            );
        });
    });

    describe('constructor', () => {
        it('should use provided configuration', () => {
            const customIntegration = new TechAuraIntegration(
                'http://custom-url:8080',
                'custom-api-key'
            );

            mockedAxios.get.mockResolvedValue({
                data: { success: true, orders: [] }
            });

            customIntegration.getOrdersReadyForShipping();

            expect(mockedAxios.get).toHaveBeenCalledWith(
                'http://custom-url:8080/api/shipping/orders-ready',
                {
                    headers: { 'X-API-Key': 'custom-api-key' },
                    timeout: 10000
                }
            );
        });

        it('should use default configuration when not provided', () => {
            // The default integration instance uses environment variables
            // which are captured at module load time. We test that the 
            // singleton works correctly with the test environment values.
            const { techAuraIntegration: defaultInstance } = require('../../src/services/TechAuraIntegration');
            
            mockedAxios.get.mockResolvedValue({
                data: { success: true, orders: [] }
            });

            defaultInstance.getOrdersReadyForShipping();

            // Should use the test environment URL (set in setup.ts)
            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.stringContaining('/api/shipping/orders-ready'),
                expect.any(Object)
            );
        });
    });

    describe('API Key Header', () => {
        it('should include X-API-Key header in GET requests', async () => {
            mockedAxios.get.mockResolvedValue({
                data: { success: true, orders: [] }
            });

            await integration.getOrdersReadyForShipping();

            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: { 'X-API-Key': 'test-api-key' }
                })
            );
        });

        it('should include X-API-Key header in POST requests', async () => {
            mockedAxios.post.mockResolvedValue({
                data: { success: true }
            });

            await integration.notifyGuideCreated({
                orderNumber: 'ORD-001',
                trackingNumber: 'TA123',
                carrier: 'Test'
            });

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'X-API-Key': 'test-api-key'
                    })
                })
            );
        });
    });

    describe('Timeout Configuration', () => {
        it('should set 10 second timeout for all requests', async () => {
            mockedAxios.get.mockResolvedValue({
                data: { success: true, orders: [] }
            });
            mockedAxios.post.mockResolvedValue({
                data: { success: true }
            });

            await integration.getOrdersReadyForShipping();
            await integration.getOrderDetails('ORD-001');
            await integration.notifyGuideCreated({
                orderNumber: 'ORD-001',
                trackingNumber: 'TA123',
                carrier: 'Test'
            });
            await integration.requestMissingData('ORD-001', ['field']);

            // Check all calls have timeout: 10000
            mockedAxios.get.mock.calls.forEach(call => {
                expect(call[1]).toEqual(expect.objectContaining({ timeout: 10000 }));
            });
            mockedAxios.post.mock.calls.forEach(call => {
                expect(call[2]).toEqual(expect.objectContaining({ timeout: 10000 }));
            });
        });
    });

    describe('requestMissingDataStructured', () => {
        it('should return true when structured request is successful', async () => {
            mockedAxios.post.mockResolvedValue({
                data: { success: true }
            });

            const request = {
                orderNumber: 'ORD-001',
                missingFields: [
                    { field: 'address' as const, reason: 'Address is incomplete' },
                    { field: 'city' as const, reason: 'City is required for shipping' }
                ],
                urgency: 'high' as const,
                deadline: new Date('2024-01-20T12:00:00Z')
            };

            const result = await integration.requestMissingDataStructured(request);

            expect(result).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://localhost:9999/api/shipping/request-data',
                {
                    order_number: 'ORD-001',
                    missing_fields: [
                        { field: 'address', reason: 'Address is incomplete' },
                        { field: 'city', reason: 'City is required for shipping' }
                    ],
                    urgency: 'high',
                    deadline: '2024-01-20T12:00:00.000Z'
                },
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'X-API-Key': 'test-api-key',
                        'Content-Type': 'application/json'
                    }),
                    timeout: 10000
                })
            );
        });

        it('should return false when structured request fails', async () => {
            mockedAxios.post.mockResolvedValue({
                data: { success: false, error: 'Order not found' }
            });

            const request = {
                orderNumber: 'ORD-INVALID',
                missingFields: [{ field: 'phone' as const, reason: 'Phone is missing' }],
                urgency: 'low' as const
            };

            const result = await integration.requestMissingDataStructured(request);

            expect(result).toBe(false);
        });

        it('should return false on API error', async () => {
            mockedAxios.post.mockRejectedValue(new Error('Network error'));

            const request = {
                orderNumber: 'ORD-001',
                missingFields: [{ field: 'city' as const, reason: 'City required' }],
                urgency: 'medium' as const
            };

            const result = await integration.requestMissingDataStructured(request);

            expect(result).toBe(false);
        });

        it('should handle request without deadline', async () => {
            mockedAxios.post.mockResolvedValue({
                data: { success: true }
            });

            const request = {
                orderNumber: 'ORD-001',
                missingFields: [{ field: 'name' as const, reason: 'Name missing' }],
                urgency: 'low' as const
            };

            const result = await integration.requestMissingDataStructured(request);

            expect(result).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    deadline: undefined
                }),
                expect.any(Object)
            );
        });
    });

    describe('updateShippingStatus', () => {
        it('should return true when status update is successful', async () => {
            mockedAxios.post.mockResolvedValue({
                data: { success: true }
            });

            const update = {
                orderNumber: 'ORD-001',
                status: 'in_transit' as const,
                trackingNumber: 'TA123456789',
                carrier: 'Servientrega',
                estimatedDelivery: new Date('2024-01-25T14:00:00Z'),
                notes: 'Package picked up from warehouse'
            };

            const result = await integration.updateShippingStatus(update);

            expect(result).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://localhost:9999/api/shipping/status-update',
                {
                    order_number: 'ORD-001',
                    status: 'in_transit',
                    tracking_number: 'TA123456789',
                    carrier: 'Servientrega',
                    estimated_delivery: '2024-01-25T14:00:00.000Z',
                    notes: 'Package picked up from warehouse'
                },
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'X-API-Key': 'test-api-key',
                        'Content-Type': 'application/json'
                    }),
                    timeout: 10000
                })
            );
        });

        it('should return false when status update fails', async () => {
            mockedAxios.post.mockResolvedValue({
                data: { success: false, error: 'Order not found' }
            });

            const update = {
                orderNumber: 'ORD-INVALID',
                status: 'delivered' as const
            };

            const result = await integration.updateShippingStatus(update);

            expect(result).toBe(false);
        });

        it('should return false on API error', async () => {
            mockedAxios.post.mockRejectedValue(new Error('Network error'));

            const update = {
                orderNumber: 'ORD-001',
                status: 'picked_up' as const
            };

            const result = await integration.updateShippingStatus(update);

            expect(result).toBe(false);
        });

        it('should handle minimal update (only required fields)', async () => {
            mockedAxios.post.mockResolvedValue({
                data: { success: true }
            });

            const update = {
                orderNumber: 'ORD-001',
                status: 'label_created' as const
            };

            const result = await integration.updateShippingStatus(update);

            expect(result).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    order_number: 'ORD-001',
                    status: 'label_created',
                    tracking_number: undefined,
                    carrier: undefined,
                    estimated_delivery: undefined,
                    notes: undefined
                }),
                expect.any(Object)
            );
        });

        it('should handle all status values', async () => {
            mockedAxios.post.mockResolvedValue({
                data: { success: true }
            });

            const statuses: Array<'label_created' | 'picked_up' | 'in_transit' | 'delivered' | 'returned'> = [
                'label_created', 'picked_up', 'in_transit', 'delivered', 'returned'
            ];

            for (const status of statuses) {
                const result = await integration.updateShippingStatus({
                    orderNumber: 'ORD-001',
                    status
                });

                expect(result).toBe(true);
            }

            expect(mockedAxios.post).toHaveBeenCalledTimes(statuses.length);
        });
    });
});

describe('techAuraIntegration singleton', () => {
    it('should export a singleton instance', () => {
        const { techAuraIntegration } = require('../../src/services/TechAuraIntegration');
        expect(techAuraIntegration).toBeDefined();
        expect(techAuraIntegration).toBeInstanceOf(require('../../src/services/TechAuraIntegration').TechAuraIntegration);
    });
});
