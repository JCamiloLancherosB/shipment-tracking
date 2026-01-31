import mysql from 'mysql2/promise';
import { ShippingGuideData, CustomerMatch } from '../types';

export class CustomerMatcher {
    private pool: mysql.Pool;

    constructor(dbConfig: any) {
        this.pool = mysql.createPool({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password,
            database: dbConfig.database,
            waitForConnections: true,
            connectionLimit: 5
        });
    }

    async findCustomer(guideData: ShippingGuideData): Promise<CustomerMatch | null> {
        // Try matching by phone first (highest confidence)
        if (guideData.customerPhone) {
            const byPhone = await this.matchByPhone(guideData.customerPhone);
            if (byPhone) return byPhone;
        }

        // Try matching by name + city
        if (guideData.customerName) {
            const byName = await this.matchByName(guideData.customerName, guideData.city);
            if (byName) return byName;
        }

        // Try matching by address
        if (guideData.shippingAddress) {
            const byAddress = await this.matchByAddress(guideData.shippingAddress);
            if (byAddress) return byAddress;
        }

        return null;
    }

    private async matchByPhone(phone: string): Promise<CustomerMatch | null> {
        const sanitized = phone.replace(/\D/g, '').slice(-10);
        
        const [rows] = await this.pool.execute(`
            SELECT 
                o.id,
                o.order_number,
                o.phone_number,
                o.customer_name,
                o.shipping_address,
                o.processing_status
            FROM orders o
            WHERE (o.phone_number LIKE ? OR o.shipping_phone LIKE ?)
            AND o.processing_status IN ('confirmed', 'processing')
            AND o.tracking_number IS NULL
            ORDER BY o.created_at DESC
            LIMIT 1
        `, [`%${sanitized}%`, `%${sanitized}%`]) as any;

        if (rows.length > 0) {
            const order = rows[0];
            return {
                id: order.id,
                orderNumber: order.order_number,
                phone: order.phone_number,
                name: order.customer_name,
                address: order.shipping_address,
                confidence: 100,
                matchedBy: 'phone'
            };
        }

        return null;
    }

    private async matchByName(name: string, city?: string): Promise<CustomerMatch | null> {
        const nameParts = name.toLowerCase().split(/\s+/);
        
        let sql = `
            SELECT * FROM orders 
            WHERE LOWER(customer_name) LIKE ?
            AND processing_status IN ('confirmed', 'processing')
            AND tracking_number IS NULL
        `;
        const params: string[] = [`%${nameParts[0]}%`];

        if (city) {
            sql += ` AND LOWER(shipping_address) LIKE ?`;
            params.push(`%${city.toLowerCase()}%`);
        }

        sql += ` ORDER BY created_at DESC LIMIT 1`;

        const [rows] = await this.pool.execute(sql, params) as any;

        if (rows.length > 0) {
            const order = rows[0];
            return {
                id: order.id,
                orderNumber: order.order_number,
                phone: order.phone_number,
                name: order.customer_name,
                address: order.shipping_address,
                confidence: 80,
                matchedBy: 'name'
            };
        }

        return null;
    }

    private async matchByAddress(address: string): Promise<CustomerMatch | null> {
        const [rows] = await this.pool.execute(`
            SELECT * FROM orders 
            WHERE LOWER(shipping_address) LIKE ?
            AND processing_status IN ('confirmed', 'processing')
            AND tracking_number IS NULL
            ORDER BY created_at DESC
            LIMIT 1
        `, [`%${address.toLowerCase().substring(0, 30)}%`]) as any;

        if (rows.length > 0) {
            const order = rows[0];
            return {
                id: order.id,
                orderNumber: order.order_number,
                phone: order.phone_number,
                name: order.customer_name,
                address: order.shipping_address,
                confidence: 60,
                matchedBy: 'address'
            };
        }

        return null;
    }

    async updateOrderTracking(orderNumber: string, trackingNumber: string, carrier: string): Promise<boolean> {
        try {
            const [result] = await this.pool.execute(`
                UPDATE orders SET
                    tracking_number = ?,
                    carrier = ?,
                    shipping_status = 'shipped',
                    shipped_at = NOW(),
                    updated_at = NOW()
                WHERE order_number = ?
            `, [trackingNumber, carrier, orderNumber]) as any;

            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error updating order tracking:', error);
            return false;
        }
    }
}
