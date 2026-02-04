/**
 * InterRapidisimo Carrier Implementation
 * Colombian carrier for domestic shipments
 */

import { BaseCarrier } from '../BaseCarrier';
import {
    ShipmentData,
    ShipmentResult,
    TrackingInfo,
    Quote,
    ShipmentStatus
} from '../types';

export class InterRapidisimoCarrier extends BaseCarrier {
    id = 'interrapidisimo';
    name = 'InterRapidísimo';
    logo = '/images/carriers/interrapidisimo.png';
    pricePerKg = 8500; // COP per kg
    hasPickup = true;

    supportedCities = [
        'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena',
        'Bucaramanga', 'Pereira', 'Manizales', 'Cúcuta', 'Ibagué',
        'Santa Marta', 'Villavicencio', 'Neiva', 'Armenia', 'Pasto',
        'Montería', 'Sincelejo', 'Valledupar', 'Popayán', 'Tunja',
        'Sogamoso', 'Duitama', 'Girardot', 'Fusagasugá', 'Chía'
    ];

    constructor() {
        super();
        // Set average delivery days per city
        this.averageDeliveryDays.set('bogota', 1);
        this.averageDeliveryDays.set('medellin', 2);
        this.averageDeliveryDays.set('cali', 2);
        this.averageDeliveryDays.set('barranquilla', 3);
        this.averageDeliveryDays.set('cartagena', 3);
    }

    protected mapStatus(carrierStatus: string): ShipmentStatus {
        const statusMap: Record<string, ShipmentStatus> = {
            'RECIBIDO': 'created',
            'RECOLECTADO': 'picked_up',
            'EN CENTRO': 'in_transit',
            'EN TRANSITO': 'in_transit',
            'EN REPARTO': 'out_for_delivery',
            'ENTREGADO': 'delivered',
            'DEVUELTO': 'returned',
            'CANCELADO': 'cancelled',
            'NO ENTREGADO': 'failed_delivery'
        };
        return statusMap[carrierStatus.toUpperCase()] || 'in_transit';
    }

    async createShipment(data: ShipmentData): Promise<ShipmentResult> {
        // In a real implementation, this would call InterRapidisimo's API
        // For now, we simulate the response
        const trackingNumber = `IR${this.generateTrackingNumber().substring(3)}`;
        
        const estimatedDays = this.averageDeliveryDays.get(
            this.normalizeCity(data.destination)
        ) || 3;

        const estimatedDelivery = new Date();
        estimatedDelivery.setDate(estimatedDelivery.getDate() + estimatedDays);

        return {
            trackingNumber,
            carrier: this.id,
            estimatedDelivery,
            createdAt: new Date()
        };
    }

    async getTrackingInfo(trackingNumber: string): Promise<TrackingInfo> {
        // In a real implementation, this would call InterRapidisimo's tracking API
        // For now, we return simulated data
        return {
            carrier: this.name,
            trackingNumber,
            status: 'in_transit',
            statusDescription: 'Envío en tránsito hacia destino',
            estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            events: [
                {
                    timestamp: new Date(),
                    status: 'in_transit',
                    description: 'Paquete en centro de distribución',
                    location: 'Bogotá',
                    details: null
                },
                {
                    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    status: 'picked_up',
                    description: 'Paquete recolectado',
                    location: 'Origen',
                    details: null
                }
            ],
            currentLocation: 'Bogotá',
            recipientName: null,
            signedBy: null,
            deliveredAt: null
        };
    }

    async getLabel(trackingNumber: string): Promise<Buffer> {
        // In a real implementation, this would fetch the PDF label from API
        return Buffer.from('PDF_LABEL_PLACEHOLDER');
    }

    async cancelShipment(trackingNumber: string): Promise<boolean> {
        // In a real implementation, this would call the cancellation API
        return true;
    }

    async getQuote(origin: string, destination: string, weight: number): Promise<Quote> {
        const supportsOrigin = this.supportsCity(origin);
        const supportsDestination = this.supportsCity(destination);

        if (!supportsOrigin || !supportsDestination) {
            return {
                available: false,
                price: 0,
                currency: 'COP',
                estimatedDays: 0,
                serviceName: 'No disponible'
            };
        }

        const estimatedDays = this.averageDeliveryDays.get(
            this.normalizeCity(destination)
        ) || 3;

        const basePrice = this.pricePerKg * weight;
        const handlingFee = 3500;
        const totalPrice = basePrice + handlingFee;

        return {
            available: true,
            price: totalPrice,
            currency: 'COP',
            estimatedDays,
            serviceName: 'Servicio Estándar'
        };
    }
}
