import mysql from 'mysql2/promise';
import { config } from '../config/config';
import { CreateShipmentRequest, Shipment } from '../types';

export class ShipmentService {
    private pool: mysql.Pool;

    constructor() {
        this.pool = mysql.createPool({
            host: config.techauraDb.host,
            port: config.techauraDb.port,
            user: config.techauraDb.user,
            password: config.techauraDb.password,
            database: config.techauraDb.database,
            waitForConnections: true,
            connectionLimit: 5
        });
    }

    /**
     * Generates a unique tracking number
     */
    private generateTrackingNumber(): string {
        const prefix = 'TA';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `${prefix}${timestamp}${random}`;
    }

    /**
     * Creates a new shipment record
     */
    async createShipment(data: CreateShipmentRequest): Promise<Shipment> {
        const trackingNumber = this.generateTrackingNumber();
        const now = new Date();

        const [result] = await this.pool.execute(`
            INSERT INTO shipments (
                order_number,
                tracking_number,
                customer_name,
                customer_phone,
                shipping_address,
                shipping_phone,
                product_description,
                status,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            data.orderNumber,
            trackingNumber,
            data.customerName,
            data.customerPhone,
            data.shippingAddress,
            data.shippingPhone,
            data.productDescription,
            data.status,
            now,
            now
        ]) as any;

        return {
            id: result.insertId,
            orderNumber: data.orderNumber,
            trackingNumber,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            shippingAddress: data.shippingAddress,
            shippingPhone: data.shippingPhone,
            productDescription: data.productDescription,
            status: data.status,
            createdAt: now,
            updatedAt: now
        };
    }

    /**
     * Gets a shipment by tracking number
     */
    async getShipmentByTrackingNumber(trackingNumber: string): Promise<Shipment | null> {
        const [rows] = await this.pool.execute(`
            SELECT * FROM shipments WHERE tracking_number = ?
        `, [trackingNumber]) as any;

        if (rows.length === 0) {
            return null;
        }

        const row = rows[0];
        return {
            id: row.id,
            orderNumber: row.order_number,
            trackingNumber: row.tracking_number,
            customerName: row.customer_name,
            customerPhone: row.customer_phone,
            shippingAddress: row.shipping_address,
            shippingPhone: row.shipping_phone,
            productDescription: row.product_description,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    /**
     * Gets a shipment by order number
     */
    async getShipmentByOrderNumber(orderNumber: string): Promise<Shipment | null> {
        const [rows] = await this.pool.execute(`
            SELECT * FROM shipments WHERE order_number = ?
        `, [orderNumber]) as any;

        if (rows.length === 0) {
            return null;
        }

        const row = rows[0];
        return {
            id: row.id,
            orderNumber: row.order_number,
            trackingNumber: row.tracking_number,
            customerName: row.customer_name,
            customerPhone: row.customer_phone,
            shippingAddress: row.shipping_address,
            shippingPhone: row.shipping_phone,
            productDescription: row.product_description,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    /**
     * Updates shipment status
     */
    async updateShipmentStatus(id: number, status: string): Promise<boolean> {
        const [result] = await this.pool.execute(`
            UPDATE shipments SET status = ?, updated_at = NOW() WHERE id = ?
        `, [status, id]) as any;

        return result.affectedRows > 0;
    }
}
