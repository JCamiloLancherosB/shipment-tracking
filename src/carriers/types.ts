/**
 * Multi-Carrier Tracking System Types
 * Defines common interfaces for carrier integration
 */

/**
 * Unified shipment status across all carriers
 */
export type ShipmentStatus =
    | 'created'
    | 'picked_up'
    | 'in_transit'
    | 'out_for_delivery'
    | 'delivered'
    | 'failed_delivery'
    | 'returned'
    | 'cancelled';

/**
 * Individual tracking event
 */
export interface TrackingEvent {
    timestamp: Date;
    status: ShipmentStatus;
    description: string;
    location: string;
    details: string | null;
}

/**
 * Unified tracking information returned by all carriers
 */
export interface TrackingInfo {
    carrier: string;
    trackingNumber: string;
    status: ShipmentStatus;
    statusDescription: string;
    estimatedDelivery: Date | null;
    events: TrackingEvent[];
    currentLocation: string | null;
    recipientName: string | null;
    signedBy: string | null;
    deliveredAt: Date | null;
}

/**
 * Data required to create a shipment
 */
export interface ShipmentData {
    origin: string;
    destination: string;
    weight: number;
    recipient: RecipientData;
    reference: string;
    declaredValue?: number;
    dimensions?: {
        length: number;
        width: number;
        height: number;
    };
}

/**
 * Recipient information
 */
export interface RecipientData {
    name: string;
    phone: string;
    address: string;
    city: string;
    department?: string;
    postalCode?: string;
    notes?: string;
}

/**
 * Result of shipment creation
 */
export interface ShipmentResult {
    trackingNumber: string;
    carrier: string;
    labelUrl?: string;
    estimatedDelivery?: Date;
    createdAt: Date;
}

/**
 * Quote from a carrier for a shipment
 */
export interface Quote {
    available: boolean;
    price: number;
    currency: string;
    estimatedDays: number;
    serviceName: string;
    carrierNotes?: string;
}

/**
 * Carrier interface that all carrier implementations must follow
 */
export interface Carrier {
    id: string;
    name: string;
    logo: string;
    supportedCities: string[];
    averageDeliveryDays: Map<string, number>;  // city -> days
    pricePerKg: number;
    hasPickup: boolean;

    /**
     * Create a new shipment
     */
    createShipment(data: ShipmentData): Promise<ShipmentResult>;

    /**
     * Get tracking information for a shipment
     */
    getTrackingInfo(trackingNumber: string): Promise<TrackingInfo>;

    /**
     * Get shipping label as PDF buffer
     */
    getLabel(trackingNumber: string): Promise<Buffer>;

    /**
     * Cancel a shipment
     */
    cancelShipment(trackingNumber: string): Promise<boolean>;

    /**
     * Get a quote for shipping
     */
    getQuote(origin: string, destination: string, weight: number): Promise<Quote>;
}

/**
 * Selection priority for carrier selection
 */
export type SelectionPriority = 'fastest' | 'cheapest' | 'balanced';

/**
 * Result of carrier selection
 */
export interface CarrierSelectionResult {
    carrier: Carrier;
    quote: Quote;
    reason: string;
}
