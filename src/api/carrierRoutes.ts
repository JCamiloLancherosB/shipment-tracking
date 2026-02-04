/**
 * Multi-Carrier Tracking API Routes
 * Provides unified tracking, shipment creation, and quote endpoints
 */

import { Router, Request, Response } from 'express';
import { carrierSelector } from '../services/CarrierSelector';
import { TrackingInfo, SelectionPriority, RecipientData } from '../carriers/types';

const router = Router();

/**
 * Tracking number patterns for carrier detection
 */
const TRACKING_PATTERNS: Array<{ pattern: RegExp; carrierId: string }> = [
    { pattern: /^IR\d{8,}/i, carrierId: 'interrapidisimo' },
    { pattern: /^SV\d{8,}/i, carrierId: 'servientrega' },
    { pattern: /^ENV\d{8,}/i, carrierId: 'envia' },
    { pattern: /^CD\d{8,}/i, carrierId: 'coordinadora' },
    { pattern: /^TCC\d{8,}/i, carrierId: 'tcc' },
    { pattern: /^DPR\d{8,}/i, carrierId: 'deprise' },
];

/**
 * Detect carrier from tracking number format
 */
function detectCarrierByTrackingNumber(trackingNumber: string): string | null {
    for (const { pattern, carrierId } of TRACKING_PATTERNS) {
        if (pattern.test(trackingNumber)) {
            return carrierId;
        }
    }
    return null;
}

/**
 * GET /api/tracking/:trackingNumber
 * Unified tracking endpoint - works with any carrier's tracking number
 */
router.get('/tracking/:trackingNumber', async (req: Request, res: Response) => {
    const { trackingNumber } = req.params;

    if (!trackingNumber || trackingNumber.trim() === '') {
        return res.status(400).json({
            success: false,
            error: 'Número de guía requerido'
        });
    }

    try {
        // Try to detect carrier by tracking number format
        const detectedCarrierId = detectCarrierByTrackingNumber(trackingNumber);
        
        if (detectedCarrierId) {
            const carrier = carrierSelector.getCarrier(detectedCarrierId);
            if (carrier) {
                const trackingInfo = await carrier.getTrackingInfo(trackingNumber);
                return res.json({
                    success: true,
                    tracking: trackingInfo
                });
            }
        }

        // If carrier not detected, try all carriers
        const carriers = carrierSelector.getCarriers();
        for (const carrier of carriers) {
            try {
                const trackingInfo = await carrier.getTrackingInfo(trackingNumber);
                if (trackingInfo) {
                    return res.json({
                        success: true,
                        tracking: trackingInfo
                    });
                }
            } catch {
                // Continue to next carrier
            }
        }

        return res.status(404).json({
            success: false,
            error: 'Guía no encontrada en ninguna transportadora'
        });
    } catch (error: any) {
        console.error('Error getting tracking info:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener información de tracking'
        });
    }
});

/**
 * POST /api/shipments
 * Create a shipment with automatic carrier selection
 */
router.post('/shipments', async (req: Request, res: Response) => {
    const {
        origin,
        destination,
        weight,
        priority,
        recipientData,
        orderNumber,
        declaredValue,
        dimensions
    } = req.body;

    // Validate required fields
    if (!origin || !destination || !weight || !recipientData || !orderNumber) {
        return res.status(400).json({
            success: false,
            error: 'Campos requeridos: origin, destination, weight, recipientData, orderNumber'
        });
    }

    // Validate recipient data
    const recipient: RecipientData = recipientData;
    if (!recipient.name || !recipient.phone || !recipient.address || !recipient.city) {
        return res.status(400).json({
            success: false,
            error: 'Datos de destinatario incompletos: name, phone, address, city son requeridos'
        });
    }

    try {
        // Select best carrier
        const selectionPriority: SelectionPriority = priority || 'balanced';
        const { carrier, quote, reason } = await carrierSelector.selectBestCarrier(
            origin,
            destination,
            Number(weight),
            selectionPriority
        );

        // Create shipment with selected carrier
        const shipment = await carrier.createShipment({
            origin,
            destination,
            weight: Number(weight),
            recipient,
            reference: orderNumber,
            declaredValue,
            dimensions
        });

        // Note: In a real implementation, you would save to database here
        // await ShipmentRepository.create({ ... });

        return res.json({
            success: true,
            shipment: {
                trackingNumber: shipment.trackingNumber,
                carrier: carrier.name,
                carrierId: carrier.id,
                estimatedDelivery: shipment.estimatedDelivery,
                labelUrl: `/api/shipments/${shipment.trackingNumber}/label`,
                createdAt: shipment.createdAt
            },
            quote: {
                price: quote.price,
                currency: quote.currency,
                estimatedDays: quote.estimatedDays,
                serviceName: quote.serviceName
            },
            selectionReason: reason
        });
    } catch (error: any) {
        console.error('Error creating shipment:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al crear el envío'
        });
    }
});

/**
 * GET /api/shipments/:trackingNumber/label
 * Get shipping label for a shipment
 */
router.get('/shipments/:trackingNumber/label', async (req: Request, res: Response) => {
    const { trackingNumber } = req.params;

    try {
        const carrierId = detectCarrierByTrackingNumber(trackingNumber);
        if (!carrierId) {
            return res.status(404).json({
                success: false,
                error: 'No se pudo determinar la transportadora'
            });
        }

        const carrier = carrierSelector.getCarrier(carrierId);
        if (!carrier) {
            return res.status(404).json({
                success: false,
                error: 'Transportadora no encontrada'
            });
        }

        const label = await carrier.getLabel(trackingNumber);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="label-${trackingNumber}.pdf"`);
        return res.send(label);
    } catch (error: any) {
        console.error('Error getting label:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener la etiqueta'
        });
    }
});

/**
 * DELETE /api/shipments/:trackingNumber
 * Cancel a shipment
 */
router.delete('/shipments/:trackingNumber', async (req: Request, res: Response) => {
    const { trackingNumber } = req.params;

    try {
        const carrierId = detectCarrierByTrackingNumber(trackingNumber);
        if (!carrierId) {
            return res.status(404).json({
                success: false,
                error: 'No se pudo determinar la transportadora'
            });
        }

        const carrier = carrierSelector.getCarrier(carrierId);
        if (!carrier) {
            return res.status(404).json({
                success: false,
                error: 'Transportadora no encontrada'
            });
        }

        const cancelled = await carrier.cancelShipment(trackingNumber);
        
        if (cancelled) {
            return res.json({
                success: true,
                message: 'Envío cancelado exitosamente'
            });
        } else {
            return res.status(400).json({
                success: false,
                error: 'No se pudo cancelar el envío'
            });
        }
    } catch (error: any) {
        console.error('Error cancelling shipment:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al cancelar el envío'
        });
    }
});

/**
 * GET /api/carriers/quote
 * Get quotes from all carriers for a route
 */
router.get('/carriers/quote', async (req: Request, res: Response) => {
    const { origin, destination, weight } = req.query;

    if (!origin || !destination || !weight) {
        return res.status(400).json({
            success: false,
            error: 'Parámetros requeridos: origin, destination, weight'
        });
    }

    try {
        const quotes = await carrierSelector.getAllQuotes(
            String(origin),
            String(destination),
            Number(weight)
        );

        return res.json({
            success: true,
            origin: String(origin),
            destination: String(destination),
            weight: Number(weight),
            quotes
        });
    } catch (error: any) {
        console.error('Error getting quotes:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener cotizaciones'
        });
    }
});

/**
 * GET /api/carriers
 * List all available carriers
 */
router.get('/carriers', (req: Request, res: Response) => {
    const carriers = carrierSelector.getCarriers().map(carrier => ({
        id: carrier.id,
        name: carrier.name,
        logo: carrier.logo,
        hasPickup: carrier.hasPickup,
        pricePerKg: carrier.pricePerKg,
        supportedCitiesCount: carrier.supportedCities.length
    }));

    return res.json({
        success: true,
        carriers
    });
});

/**
 * GET /api/carriers/:carrierId
 * Get details of a specific carrier
 */
router.get('/carriers/:carrierId', (req: Request, res: Response) => {
    const { carrierId } = req.params;

    const carrier = carrierSelector.getCarrier(carrierId);
    if (!carrier) {
        return res.status(404).json({
            success: false,
            error: 'Transportadora no encontrada'
        });
    }

    return res.json({
        success: true,
        carrier: {
            id: carrier.id,
            name: carrier.name,
            logo: carrier.logo,
            hasPickup: carrier.hasPickup,
            pricePerKg: carrier.pricePerKg,
            supportedCities: carrier.supportedCities
        }
    });
});

export default router;
