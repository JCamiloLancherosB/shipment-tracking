/**
 * Coordinadora Carrier Implementation
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

export class CoordinadoraCarrier extends BaseCarrier {
    id = 'coordinadora';
    name = 'Coordinadora';
    logo = '/images/carriers/coordinadora.png';
    pricePerKg = 8800; // COP per kg
    hasPickup = true;

    supportedCities = [
        'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena',
        'Bucaramanga', 'Pereira', 'Manizales', 'Cúcuta', 'Ibagué',
        'Santa Marta', 'Villavicencio', 'Neiva', 'Armenia', 'Pasto',
        'Montería', 'Sincelejo', 'Valledupar', 'Popayán', 'Tunja',
        'Florencia', 'Yopal', 'Sogamoso', 'Duitama', 'Girardot'
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
            'DOCUMENTADO': 'created',
            'RECOLECTADO': 'picked_up',
            'EN MOVIMIENTO': 'in_transit',
            'EN REPARTO': 'out_for_delivery',
            'ENTREGADO': 'delivered',
            'DEVOLUCIÓN': 'returned',
            'ANULADO': 'cancelled',
            'NOVEDAD': 'failed_delivery'
        };
        return statusMap[carrierStatus.toUpperCase()] || 'in_transit';
    }

    async createShipment(data: ShipmentData): Promise<ShipmentResult> {
        const trackingNumber = `CD${this.generateTrackingNumber().substring(3)}`;
        
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
            statusDescription: 'Paquete en movimiento',
            estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            events: [
                {
                    timestamp: new Date(),
                    status: 'in_transit',
                    description: 'En tránsito hacia ciudad destino',
                    location: 'Centro logístico',
                    details: null
                },
                {
                    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
                    status: 'picked_up',
                    description: 'Recolección completada',
                    location: 'Origen',
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
        ) || 2;

        const basePrice = this.pricePerKg * weight;
        const handlingFee = 2500;
        const totalPrice = basePrice + handlingFee;

        return {
            available: true,
            price: totalPrice,
            currency: 'COP',
            estimatedDays,
            serviceName: 'Servicio Mercancía'
        };
    }
}
