import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from './config/config';

let io: Server | null = null;

// In-memory order queue for pending orders
const pendingOrders: Map<string, OrderQueueItem> = new Map();

/**
 * Interface for items in the order queue
 */
export interface OrderQueueItem {
    orderNumber: string;
    customerName: string;
    phone: string;
    address: string;
    city: string;
    product: string;
    receivedAt: Date;
}

/**
 * Mask a phone number to show only the last 4 digits
 * @param phone - The phone number to mask
 * @returns Masked phone string
 */
export function maskPhone(phone: string): string {
    if (phone.length <= 4) {
        return phone;
    }
    return '****' + phone.slice(-4);
}

/**
 * Setup WebSocket server for real-time notifications
 * @param server - HTTP server instance
 * @returns Socket.IO server instance
 */
export function setupWebSocket(server: HttpServer): Server {
    io = new Server(server, {
        cors: {
            origin: config.corsOrigin,
            methods: ['GET', 'POST']
        }
    });

    // Authenticate WebSocket connections using a dashboard secret
    io.use((socket, next) => {
        if (!config.dashboardSecret) {
            next(new Error('Authentication error: DASHBOARD_SECRET not configured'));
            return;
        }
        const token = socket.handshake.auth.token;
        if (token && token === config.dashboardSecret) {
            next();
        } else {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', async (socket: Socket) => {
        console.log('📡 Dashboard connected:', socket.id);

        // Send pending orders with masked phone numbers when client connects
        const pending = await getPendingOrders();
        const maskedPending = pending.map(order => ({
            ...order,
            phone: maskPhone(order.phone)
        }));
        socket.emit('pending-orders', maskedPending);

        socket.on('disconnect', () => {
            console.log('📡 Dashboard disconnected:', socket.id);
        });
    });

    return io;
}

/**
 * Get all pending orders from the queue
 * @returns Array of pending order items
 */
export async function getPendingOrders(): Promise<OrderQueueItem[]> {
    return Array.from(pendingOrders.values());
}

/**
 * Add an order to the pending queue
 * @param order - Order to add
 */
export function addToOrderQueue(order: OrderQueueItem): void {
    pendingOrders.set(order.orderNumber, order);
}

/**
 * Remove an order from the pending queue
 * @param orderNumber - Order number to remove
 */
export function removeFromOrderQueue(orderNumber: string): void {
    pendingOrders.delete(orderNumber);
}

/**
 * Emit a new order notification to all connected clients
 * @param order - The order data to emit
 */
export function notifyNewOrder(order: OrderQueueItem): void {
    if (io) {
        const maskedOrder = {
            ...order,
            phone: maskPhone(order.phone)
        };
        io.emit('new-order', maskedOrder);
        console.log(`📤 Emitted new-order event for ${order.orderNumber}`);
    }
}

/**
 * Emit a status change notification to all connected clients
 * @param orderNumber - The order number
 * @param status - The new status
 */
export function notifyStatusChange(orderNumber: string, status: string): void {
    if (io) {
        io.emit('status-change', { orderNumber, status });
        console.log(`📤 Emitted status-change event for ${orderNumber}: ${status}`);
    }
}

/**
 * Get the Socket.IO server instance
 * @returns Socket.IO server instance or null if not initialized
 */
export function getIO(): Server | null {
    return io;
}
