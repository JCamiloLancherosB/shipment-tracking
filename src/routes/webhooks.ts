import { Router, Request, Response } from 'express';
import { ShipmentService } from '../services/ShipmentService';

const router = Router();
const shipmentService = new ShipmentService();

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

        // Create shipment record
        const shipment = await shipmentService.createShipment({
            orderNumber: order_number,
            customerName: customer_name || '',
            customerPhone: customer_phone,
            shippingAddress: shipping_address,
            shippingPhone: shipping_phone || customer_phone,
            productDescription: `USB ${capacity || ''} - ${product_type || ''}`.trim(),
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
