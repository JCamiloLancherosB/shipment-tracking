/**
 * Servientrega Carrier Implementation
 * Major Colombian carrier
 */

import { BaseCarrier } from '../BaseCarrier';
import {
    ShipmentData,
    ShipmentResult,
    TrackingInfo,
    Quote,
    ShipmentStatus
} from '../types';

export class ServientregaCarrier extends BaseCarrier {
    id = 'servientrega';
    name = 'Servientrega';
    logo = '/images/carriers/servientrega.png';
    pricePerKg = 9200; // COP per kg
    hasPickup = true;

    supportedCities = [
        'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena',
        'Bucaramanga', 'Pereira', 'Manizales', 'Cúcuta', 'Ibagué',
        'Santa Marta', 'Villavicencio', 'Neiva', 'Armenia', 'Pasto',
        'Montería', 'Sincelejo', 'Valledupar', 'Popayán', 'Tunja',
        'Florencia', 'Quibdó', 'Riohacha', 'Leticia', 'Yopal',
        'Sogamoso', 'Duitama', 'Girardot', 'Fusagasugá', 'Chía',
        'Zipaquirá', 'Facatativá', 'Soacha', 'Bello', 'Envigado'
    ];

    constructor() {
        super();
        this.averageDeliveryDays.set('bogota', 1);
        this.averageDeliveryDays.set('medellin', 1);
        this.averageDeliveryDays.set('cali', 2);
        this.averageDeliveryDays.set('barranquilla', 2);
        this.averageDeliveryDays.set('cartagena', 2);
    }

    protected mapStatus(carrierStatus: string): ShipmentStatus {
        const statusMap: Record<string, ShipmentStatus> = {
            'ADMITIDO': 'created',
            'RECOGIDO': 'picked_up',
            'EN TRANSPORTE': 'in_transit',
            'EN REPARTO': 'out_for_delivery',
            'ENTREGADO': 'delivered',
            'DEVUELTO': 'returned',
            'ANULADO': 'cancelled',
            'RECHAZADO': 'failed_delivery'
        };
        return statusMap[carrierStatus.toUpperCase()] || 'in_transit';
    }

    async createShipment(data: ShipmentData): Promise<ShipmentResult> {
        const trackingNumber = `SV${this.generateTrackingNumber().substring(3)}`;
        
        const estimatedDays = this.averageDeliveryDays.get(
            this.normalizeCity(data.destination)
        ) || 2;

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
            statusDescription: 'En proceso de entrega',
            estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            events: [
                {
                    timestamp: new Date(),
                    status: 'in_transit',
                    description: 'En centro de distribución',
                    location: 'Bogotá',
                    details: null
                },
                {
                    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
                    status: 'picked_up',
                    description: 'Envío admitido',
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
        ) || 2;

        const basePrice = this.pricePerKg * weight;
        const insuranceFee = 2000;
        const totalPrice = basePrice + insuranceFee;

        return {
            available: true,
            price: totalPrice,
            currency: 'COP',
            estimatedDays,
            serviceName: 'Servicio Express'
        };
    }
}
