import {
    setupWebSocket,
    getPendingOrders,
    addToOrderQueue,
    removeFromOrderQueue,
    notifyNewOrder,
    notifyStatusChange,
    getIO,
    maskPhone,
    OrderQueueItem
} from '../../src/websocket';
import { createServer } from 'http';

// We need to mock socket.io
jest.mock('socket.io', () => {
    const mockEmit = jest.fn();
    const mockOn = jest.fn((event, callback) => {
        if (event === 'connection') {
            // Simulate a connection immediately
            const mockSocket = {
                id: 'test-socket-id',
                emit: jest.fn(),
                on: jest.fn()
            };
            callback(mockSocket);
        }
    });
    const mockUse = jest.fn((middleware) => {
        // Store middleware for testing but don't block connection
    });

    return {
        Server: jest.fn().mockImplementation(() => ({
            emit: mockEmit,
            on: mockOn,
            use: mockUse
        }))
    };
});

describe('WebSocket Module', () => {
    describe('Order Queue Operations', () => {
        beforeEach(async () => {
            // Clear the order queue before each test by removing all items
            const orders = await getPendingOrders();
            for (const order of orders) {
                removeFromOrderQueue(order.orderNumber);
            }
        });

        it('should add order to queue', async () => {
            const order: OrderQueueItem = {
                orderNumber: 'ORD-001',
                customerName: 'Juan Pérez',
                phone: '3001234567',
                address: 'Calle 45 # 23-67, Bogotá',
                city: 'Bogotá',
                product: 'USB 16GB',
                receivedAt: new Date()
            };

            addToOrderQueue(order);
            const orders = await getPendingOrders();

            expect(orders).toContainEqual(expect.objectContaining({
                orderNumber: 'ORD-001',
                customerName: 'Juan Pérez'
            }));
        });

        it('should remove order from queue', async () => {
            const order: OrderQueueItem = {
                orderNumber: 'ORD-002',
                customerName: 'María García',
                phone: '3009876543',
                address: 'Carrera 7 # 100-25',
                city: 'Medellín',
                product: 'USB 32GB',
                receivedAt: new Date()
            };

            addToOrderQueue(order);
            removeFromOrderQueue('ORD-002');
            const orders = await getPendingOrders();

            const found = orders.find(o => o.orderNumber === 'ORD-002');
            expect(found).toBeUndefined();
        });

        it('should update order if added with same order number', async () => {
            const order1: OrderQueueItem = {
                orderNumber: 'ORD-003',
                customerName: 'Initial Name',
                phone: '3001111111',
                address: 'Initial Address',
                city: 'Bogotá',
                product: 'USB 8GB',
                receivedAt: new Date()
            };

            const order2: OrderQueueItem = {
                orderNumber: 'ORD-003',
                customerName: 'Updated Name',
                phone: '3002222222',
                address: 'Updated Address',
                city: 'Cali',
                product: 'USB 16GB',
                receivedAt: new Date()
            };

            addToOrderQueue(order1);
            addToOrderQueue(order2);
            const orders = await getPendingOrders();

            const matching = orders.filter(o => o.orderNumber === 'ORD-003');
            expect(matching.length).toBe(1);
            expect(matching[0].customerName).toBe('Updated Name');
        });
    });

    describe('WebSocket Setup', () => {
        it('should create WebSocket server from HTTP server', () => {
            const httpServer = createServer();
            const io = setupWebSocket(httpServer);

            expect(io).toBeDefined();
            expect(getIO()).toBe(io);
        });
    });

    describe('Notifications', () => {
        beforeEach(() => {
            // Setup WebSocket first
            const httpServer = createServer();
            setupWebSocket(httpServer);
        });

        it('should emit new-order event via notifyNewOrder with masked phone', () => {
            const order: OrderQueueItem = {
                orderNumber: 'ORD-004',
                customerName: 'Test Customer',
                phone: '3001234567',
                address: 'Test Address',
                city: 'Test City',
                product: 'Test Product',
                receivedAt: new Date()
            };

            notifyNewOrder(order);

            const io = getIO();
            expect(io).not.toBeNull();
            expect(io!.emit).toHaveBeenCalledWith('new-order', expect.objectContaining({
                orderNumber: 'ORD-004',
                phone: '****4567'
            }));
        });

        it('should emit status-change event via notifyStatusChange', () => {
            notifyStatusChange('ORD-005', 'in_transit');

            const io = getIO();
            expect(io).not.toBeNull();
            expect(io!.emit).toHaveBeenCalledWith('status-change', {
                orderNumber: 'ORD-005',
                status: 'in_transit'
            });
        });
    });

    describe('getIO function', () => {
        it('should return the io instance after setup', () => {
            // After setupWebSocket has been called in 'Notifications' describe block,
            // getIO should return the io instance
            const io = getIO();
            // We expect it to be defined since setupWebSocket was called earlier
            expect(io).toBeDefined();
        });
    });
});

describe('OrderQueueItem interface', () => {
    it('should have correct structure', () => {
        const order: OrderQueueItem = {
            orderNumber: 'ORD-TEST',
            customerName: 'Test',
            phone: '123',
            address: 'Address',
            city: 'City',
            product: 'Product',
            receivedAt: new Date()
        };

        expect(order.orderNumber).toBeDefined();
        expect(order.customerName).toBeDefined();
        expect(order.phone).toBeDefined();
        expect(order.address).toBeDefined();
        expect(order.city).toBeDefined();
        expect(order.product).toBeDefined();
        expect(order.receivedAt).toBeInstanceOf(Date);
    });
});

describe('maskPhone', () => {
    it('should mask phone numbers longer than 4 digits', () => {
        expect(maskPhone('3001234567')).toBe('****4567');
    });

    it('should mask phone with exactly 5 digits', () => {
        expect(maskPhone('12345')).toBe('****2345');
    });

    it('should return phone as-is if 4 or fewer digits', () => {
        expect(maskPhone('1234')).toBe('1234');
        expect(maskPhone('123')).toBe('123');
        expect(maskPhone('')).toBe('');
    });
});

describe('WebSocket Authentication', () => {
    it('should register authentication middleware via io.use', () => {
        const httpServer = createServer();
        const io = setupWebSocket(httpServer);

        expect(io.use).toHaveBeenCalled();
    });
});
