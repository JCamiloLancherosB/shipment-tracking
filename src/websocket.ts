import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

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
 * Setup WebSocket server for real-time notifications
 * @param server - HTTP server instance
 * @returns Socket.IO server instance
 */
export function setupWebSocket(server: HttpServer): Server {
    io = new Server(server, {
        cors: {
            origin: process.env.CORS_ORIGIN || '*',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', async (socket: Socket) => {
        console.log('📡 Dashboard connected:', socket.id);

        // Send pending orders when client connects
        const pending = await getPendingOrders();
        socket.emit('pending-orders', pending);

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
        io.emit('new-order', order);
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
