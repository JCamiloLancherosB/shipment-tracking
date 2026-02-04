/**
 * Base Carrier Implementation
 * Provides common functionality for all carrier implementations
 */

import {
    Carrier,
    ShipmentData,
    ShipmentResult,
    TrackingInfo,
    TrackingEvent,
    Quote,
    ShipmentStatus
} from './types';

/**
 * Abstract base class for carrier implementations
 * Provides common functionality and stub implementations
 */
export abstract class BaseCarrier implements Carrier {
    abstract id: string;
    abstract name: string;
    abstract logo: string;
    abstract supportedCities: string[];
    abstract pricePerKg: number;
    abstract hasPickup: boolean;

    averageDeliveryDays: Map<string, number> = new Map();

    /**
     * Check if carrier supports a given city
     */
    protected supportsCity(city: string): boolean {
        const normalizedCity = this.normalizeCity(city);
        return this.supportedCities.some(
            c => this.normalizeCity(c) === normalizedCity
        );
    }

    /**
     * Normalize city name for comparison
     */
    protected normalizeCity(city: string): string {
        return city
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    /**
     * Map carrier-specific status to unified status
     */
    protected abstract mapStatus(carrierStatus: string): ShipmentStatus;

    /**
     * Generate a tracking number (for simulation/testing)
     */
    protected generateTrackingNumber(): string {
        const prefix = this.id.toUpperCase().substring(0, 3);
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `${prefix}${timestamp}${random}`;
    }

    // Abstract methods that must be implemented by each carrier
    abstract createShipment(data: ShipmentData): Promise<ShipmentResult>;
    abstract getTrackingInfo(trackingNumber: string): Promise<TrackingInfo>;
    abstract getLabel(trackingNumber: string): Promise<Buffer>;
    abstract cancelShipment(trackingNumber: string): Promise<boolean>;
    abstract getQuote(origin: string, destination: string, weight: number): Promise<Quote>;
}
