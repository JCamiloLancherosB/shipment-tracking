import { ShipmentService } from '../../src/services/ShipmentService';

// Mock the mysql2/promise module
jest.mock('mysql2/promise', () => ({
    createPool: jest.fn().mockReturnValue({
        execute: jest.fn()
    })
}));

// Mock the config
jest.mock('../../src/config/config', () => ({
    config: {
        techauraDb: {
            host: 'localhost',
            port: 3306,
            user: 'test_user',
            password: 'test_password',
            database: 'test_db'
        }
    }
}));

describe('ShipmentService', () => {
    let shipmentService: ShipmentService;
    let mockPool: any;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Get the mocked pool
        const mysql = require('mysql2/promise');
        mockPool = mysql.createPool();
        
        shipmentService = new ShipmentService();
    });

    describe('createShipment', () => {
        const mockShipmentRequest = {
            orderNumber: 'ORD-2024-001',
            customerName: 'Juan Carlos Pérez',
            customerPhone: '3001234567',
            shippingAddress: 'Calle 45 # 23-67, Bogotá',
            shippingPhone: '3001234567',
            productDescription: 'USB 16GB - Custom Design',
            status: 'ready_for_shipping'
        };

        it('should create a shipment and return it with a generated tracking number', async () => {
            mockPool.execute.mockResolvedValue([{ insertId: 1 }]);

            const result = await shipmentService.createShipment(mockShipmentRequest);

            expect(result).toEqual({
                id: 1,
                orderNumber: mockShipmentRequest.orderNumber,
                trackingNumber: expect.stringMatching(/^TA[A-Z0-9]+$/),
                customerName: mockShipmentRequest.customerName,
                customerPhone: mockShipmentRequest.customerPhone,
                shippingAddress: mockShipmentRequest.shippingAddress,
                shippingPhone: mockShipmentRequest.shippingPhone,
                productDescription: mockShipmentRequest.productDescription,
                status: mockShipmentRequest.status,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            });

            expect(mockPool.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO shipments'),
                expect.arrayContaining([
                    mockShipmentRequest.orderNumber,
                    expect.stringMatching(/^TA[A-Z0-9]+$/),
                    mockShipmentRequest.customerName,
                    mockShipmentRequest.customerPhone,
                    mockShipmentRequest.shippingAddress,
                    mockShipmentRequest.shippingPhone,
                    mockShipmentRequest.productDescription,
                    mockShipmentRequest.status,
                    expect.any(Date),
                    expect.any(Date)
                ])
            );
        });

        it('should generate unique tracking numbers', async () => {
            mockPool.execute.mockResolvedValue([{ insertId: 1 }]);

            const result1 = await shipmentService.createShipment(mockShipmentRequest);
            const result2 = await shipmentService.createShipment(mockShipmentRequest);

            // Tracking numbers should be different (with high probability)
            expect(result1.trackingNumber).not.toBe(result2.trackingNumber);
        });

        it('should throw error on database failure', async () => {
            mockPool.execute.mockRejectedValue(new Error('Database connection failed'));

            await expect(shipmentService.createShipment(mockShipmentRequest))
                .rejects.toThrow('Database connection failed');
        });
    });

    describe('getShipmentByTrackingNumber', () => {
        it('should return shipment when found', async () => {
            const mockRow = {
                id: 1,
                order_number: 'ORD-2024-001',
                tracking_number: 'TA123ABC456DEF',
                customer_name: 'Juan Carlos Pérez',
                customer_phone: '3001234567',
                shipping_address: 'Calle 45 # 23-67, Bogotá',
                shipping_phone: '3001234567',
                product_description: 'USB 16GB - Custom Design',
                status: 'ready_for_shipping',
                created_at: new Date('2024-01-15'),
                updated_at: new Date('2024-01-15')
            };

            mockPool.execute.mockResolvedValue([[mockRow]]);

            const result = await shipmentService.getShipmentByTrackingNumber('TA123ABC456DEF');

            expect(result).toEqual({
                id: 1,
                orderNumber: 'ORD-2024-001',
                trackingNumber: 'TA123ABC456DEF',
                customerName: 'Juan Carlos Pérez',
                customerPhone: '3001234567',
                shippingAddress: 'Calle 45 # 23-67, Bogotá',
                shippingPhone: '3001234567',
                productDescription: 'USB 16GB - Custom Design',
                status: 'ready_for_shipping',
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            });
        });

        it('should return null when shipment not found', async () => {
            mockPool.execute.mockResolvedValue([[]]);

            const result = await shipmentService.getShipmentByTrackingNumber('NONEXISTENT');

            expect(result).toBeNull();
        });
    });

    describe('getShipmentByOrderNumber', () => {
        it('should return shipment when found', async () => {
            const mockRow = {
                id: 1,
                order_number: 'ORD-2024-001',
                tracking_number: 'TA123ABC456DEF',
                customer_name: 'Juan Carlos Pérez',
                customer_phone: '3001234567',
                shipping_address: 'Calle 45 # 23-67, Bogotá',
                shipping_phone: '3001234567',
                product_description: 'USB 16GB - Custom Design',
                status: 'ready_for_shipping',
                created_at: new Date('2024-01-15'),
                updated_at: new Date('2024-01-15')
            };

            mockPool.execute.mockResolvedValue([[mockRow]]);

            const result = await shipmentService.getShipmentByOrderNumber('ORD-2024-001');

            expect(result).toEqual({
                id: 1,
                orderNumber: 'ORD-2024-001',
                trackingNumber: 'TA123ABC456DEF',
                customerName: 'Juan Carlos Pérez',
                customerPhone: '3001234567',
                shippingAddress: 'Calle 45 # 23-67, Bogotá',
                shippingPhone: '3001234567',
                productDescription: 'USB 16GB - Custom Design',
                status: 'ready_for_shipping',
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            });
        });

        it('should return null when order not found', async () => {
            mockPool.execute.mockResolvedValue([[]]);

            const result = await shipmentService.getShipmentByOrderNumber('NONEXISTENT');

            expect(result).toBeNull();
        });
    });

    describe('updateShipmentStatus', () => {
        it('should update status successfully', async () => {
            mockPool.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await shipmentService.updateShipmentStatus(1, 'shipped');

            expect(result).toBe(true);
            expect(mockPool.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE shipments SET status'),
                ['shipped', 1]
            );
        });

        it('should return false when shipment not found', async () => {
            mockPool.execute.mockResolvedValue([{ affectedRows: 0 }]);

            const result = await shipmentService.updateShipmentStatus(999, 'shipped');

            expect(result).toBe(false);
        });
    });
});
