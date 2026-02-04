/**
 * Envía Carrier Implementation
 * Colombian carrier (Colvanes)
 */

import { BaseCarrier } from '../BaseCarrier';
import {
    ShipmentData,
    ShipmentResult,
    TrackingInfo,
    Quote,
    ShipmentStatus
} from '../types';

export class EnviaCarrier extends BaseCarrier {
    id = 'envia';
    name = 'Envía Colvanes';
    logo = '/images/carriers/envia.png';
    pricePerKg = 7800; // COP per kg
    hasPickup = true;

    supportedCities = [
        'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena',
        'Bucaramanga', 'Pereira', 'Manizales', 'Cúcuta', 'Ibagué',
        'Santa Marta', 'Villavicencio', 'Neiva', 'Armenia', 'Pasto',
        'Montería', 'Sincelejo', 'Valledupar', 'Popayán', 'Tunja'
    ];

    constructor() {
        super();
        this.averageDeliveryDays.set('bogota', 1);
        this.averageDeliveryDays.set('medellin', 2);
        this.averageDeliveryDays.set('cali', 2);
        this.averageDeliveryDays.set('barranquilla', 3);
        this.averageDeliveryDays.set('cartagena', 3);
    }

    protected mapStatus(carrierStatus: string): ShipmentStatus {
        const statusMap: Record<string, ShipmentStatus> = {
            'GENERADO': 'created',
            'RECOGIDO': 'picked_up',
            'EN RUTA': 'in_transit',
            'EN DISTRIBUCIÓN': 'out_for_delivery',
            'ENTREGADO': 'delivered',
            'DEVUELTO': 'returned',
            'CANCELADO': 'cancelled',
            'NO ENTREGADO': 'failed_delivery'
        };
        return statusMap[carrierStatus.toUpperCase()] || 'in_transit';
    }

    async createShipment(data: ShipmentData): Promise<ShipmentResult> {
        const trackingNumber = `ENV${this.generateTrackingNumber().substring(3)}`;
        
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
        return {
            carrier: this.name,
            trackingNumber,
            status: 'in_transit',
            statusDescription: 'Envío en camino',
            estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            events: [
                {
                    timestamp: new Date(),
                    status: 'in_transit',
                    description: 'En tránsito hacia destino',
                    location: 'Centro de distribución',
                    details: null
                }
            ],
            currentLocation: 'En tránsito',
            recipientName: null,
            signedBy: null,
            deliveredAt: null
        };
    }

    async getLabel(trackingNumber: string): Promise<Buffer> {
        return Buffer.from('PDF_LABEL_PLACEHOLDER');
    }

    async cancelShipment(trackingNumber: string): Promise<boolean> {
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
        const totalPrice = basePrice + 3000; // handling fee

        return {
            available: true,
            price: totalPrice,
            currency: 'COP',
            estimatedDays,
            serviceName: 'Envío Estándar'
        };
    }
}
