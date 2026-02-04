import { Router, Request, Response } from 'express';
import { ShipmentService } from '../services/ShipmentService';
import { addToOrderQueue, notifyNewOrder, OrderQueueItem } from '../websocket';

const router = Router();
const shipmentService = new ShipmentService();

/**
 * Get webhook secret at request time to allow dynamic configuration
 */
function getWebhookSecret(): string {
    return process.env.WEBHOOK_SECRET || '';
}

/**
 * Interface for new order webhook payload from TechAura
 */
interface NewOrderWebhook {
    event: 'order_ready_for_shipping';
    order_number: string;
    customer_name: string;
    customer_phone: string;
    shipping_address: string;
    city: string;
    product_description: string;
    created_at: string;
}

/**
 * Webhook receiver for new orders ready for shipping
 * Called by TechAura chatbot when an order is ready for processing
 */
router.post('/new-order', async (req: Request, res: Response) => {
    try {
        // Validate API key
        const apiKey = req.headers['x-api-key'] as string;
        const webhookSecret = getWebhookSecret();
        if (webhookSecret && apiKey !== webhookSecret) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const payload = req.body as NewOrderWebhook;

        // Validate required fields
        if (!payload.order_number) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: order_number'
            });
        }

        // Create order queue item
        const orderItem: OrderQueueItem = {
            orderNumber: payload.order_number,
            customerName: payload.customer_name || '',
            phone: payload.customer_phone || '',
            address: payload.shipping_address || '',
            city: payload.city || '',
            product: payload.product_description || '',
            receivedAt: new Date()
        };

        // Add to local queue for processing
        addToOrderQueue(orderItem);

        // Notify dashboard via WebSocket
        notifyNewOrder(orderItem);

        console.log(`📬 New order received via webhook: ${payload.order_number}`);

        return res.json({
            success: true,
            message: 'Order queued for processing'
        });

    } catch (error) {
        console.error('Error processing new order webhook:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process webhook'
        });
    }
});

/**
 * Webhook called by the chatbot when an order is completed
 */
router.post('/order-completed', async (req: Request, res: Response) => {
    try {
        const { 
            order_id,
            order_number,
            customer_name,
            customer_phone,
            shipping_address,
            shipping_phone,
            product_type,
            capacity
        } = req.body;

        // Validate required fields
        if (!order_number || !customer_phone || !shipping_address) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: order_number, customer_phone, shipping_address' 
            });
        }

        // Build product description based on available data
        const productParts = [capacity, product_type].filter(Boolean);
        const productDescription = productParts.length > 0
            ? `USB ${productParts.join(' - ')}`
            : 'USB';

        // Create shipment record
        const shipment = await shipmentService.createShipment({
            orderNumber: order_number,
            customerName: customer_name || '',
            customerPhone: customer_phone,
            shippingAddress: shipping_address,
            shippingPhone: shipping_phone || customer_phone,
            productDescription,
            status: 'ready_for_shipping'
        });

        console.log(`📦 Shipment created for order ${order_number}: ${shipment.trackingNumber}`);

        return res.json({ 
            success: true, 
            shipment_id: shipment.id,
            tracking_number: shipment.trackingNumber
        });

    } catch (error) {
        console.error('Error creating shipment:', error);
        return res.status(500).json({ success: false, error: 'Failed to create shipment' });
    }
});

export default router;
