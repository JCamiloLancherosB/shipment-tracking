import axios from 'axios';

const TECHAURA_API_URL = process.env.TECHAURA_API_URL || 'http://127.0.0.1:3009';
const TECHAURA_API_KEY = process.env.TECHAURA_API_KEY || '';

/**
 * Interface for orders ready for shipping from the chatbot
 */
export interface OrderForShipping {
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    shippingAddress: string;
    shippingPhone?: string;
    city?: string;
    department?: string;
    productDescription?: string;
    status: string;
    createdAt?: Date;
}

/**
 * Interface for detailed order information
 */
export interface OrderDetails {
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    shippingAddress: string;
    shippingPhone?: string;
    city?: string;
    department?: string;
    productDescription?: string;
    notes?: string;
    status: string;
    paymentStatus?: string;
    paymentMethod?: string;
    totalAmount?: number;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * Interface for guide creation notification data
 */
export interface GuideCreatedNotification {
    orderNumber: string;
    trackingNumber: string;
    carrier: string;
    estimatedDelivery?: string;
}

/**
 * Interface for missing field specification
 */
export interface MissingFieldSpec {
    field: 'name' | 'phone' | 'address' | 'city' | 'department';
    reason: string;
}

/**
 * Interface for structured missing data request
 */
export interface MissingDataRequest {
    orderNumber: string;
    missingFields: MissingFieldSpec[];
    urgency: 'low' | 'medium' | 'high';
    deadline?: Date;
}

/**
 * Interface for shipping status update
 */
export interface ShippingStatusUpdate {
    orderNumber: string;
    status: 'label_created' | 'picked_up' | 'in_transit' | 'delivered' | 'returned';
    trackingNumber?: string;
    carrier?: string;
    estimatedDelivery?: Date;
    notes?: string;
}

/**
 * Service for integrating with the TechAura chatbot API
 * Handles communication for order retrieval and shipping notifications
 */
export class TechAuraIntegration {
    private apiUrl: string;
    private apiKey: string;

    constructor(apiUrl?: string, apiKey?: string) {
        this.apiUrl = apiUrl || TECHAURA_API_URL;
        this.apiKey = apiKey || TECHAURA_API_KEY;
    }

    /**
     * Get orders ready for shipping from the chatbot
     * @returns Array of orders ready for guide creation
     */
    async getOrdersReadyForShipping(): Promise<OrderForShipping[]> {
        try {
            const response = await axios.get(
                `${this.apiUrl}/api/shipping/orders-ready`,
                {
                    headers: { 'X-API-Key': this.apiKey },
                    timeout: 2000
                }
            );

            if (response.data.success) {
                return response.data.orders;
            }

            return [];
        } catch (error) {
            console.error('Error fetching orders from TechAura:', error);
            return [];
        }
    }

    /**
     * Get detailed information about a specific order
     * @param orderNumber - The order number to retrieve
     * @returns Order details or null if not found
     */
    async getOrderDetails(orderNumber: string): Promise<OrderDetails | null> {
        try {
            const response = await axios.get(
                `${this.apiUrl}/api/shipping/order/${encodeURIComponent(orderNumber)}`,
                {
                    headers: { 'X-API-Key': this.apiKey },
                    timeout: 2000
                }
            );

            if (response.data.success) {
                return response.data.order;
            }

            return null;
        } catch (error) {
            console.error(`Error fetching order ${orderNumber}:`, error);
            return null;
        }
    }

    /**
     * Notify the chatbot that a shipping guide has been created
     * This triggers a WhatsApp message to be sent to the customer
     * @param data - Guide creation notification data
     * @returns true if notification was successful
     */
    async notifyGuideCreated(data: GuideCreatedNotification): Promise<boolean> {
        try {
            const response = await axios.post(
                `${this.apiUrl}/api/shipping/guide-created`,
                data,
                {
                    headers: {
                        'X-API-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 2000
                }
            );

            return response.data.success;
        } catch (error) {
            console.error('Error notifying guide creation:', error);
            return false;
        }
    }

    /**
     * Request missing data from customer via the chatbot
     * Sends a WhatsApp message asking for the specified missing fields
     * @param orderNumber - The order number
     * @param missingFields - Array of field names that are missing
     * @returns true if the request was sent successfully
     */
    async requestMissingData(orderNumber: string, missingFields: string[]): Promise<boolean> {
        try {
            const response = await axios.post(
                `${this.apiUrl}/api/shipping/request-missing-data`,
                // API expects snake_case field names as per TechAura chatbot specification
                { order_number: orderNumber, missing_fields: missingFields },
                {
                    headers: {
                        'X-API-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 2000
                }
            );

            return response.data.success;
        } catch (error) {
            console.error('Error requesting missing data:', error);
            return false;
        }
    }

    /**
     * Request missing data from customer via the chatbot with structured request
     * Sends a WhatsApp message asking for the specified missing fields with reasons
     * @param request - Structured missing data request
     * @returns true if the request was sent successfully
     */
    async requestMissingDataStructured(request: MissingDataRequest): Promise<boolean> {
        try {
            const response = await axios.post(
                `${this.apiUrl}/api/shipping/request-data`,
                {
                    order_number: request.orderNumber,
                    missing_fields: request.missingFields.map(f => ({
                        field: f.field,
                        reason: f.reason
                    })),
                    urgency: request.urgency,
                    deadline: request.deadline?.toISOString()
                },
                {
                    headers: {
                        'X-API-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 2000
                }
            );

            return response.data.success;
        } catch (error) {
            console.error('Error requesting missing data (structured):', error);
            return false;
        }
    }

    /**
     * Update shipping status in the chatbot
     * This triggers a WhatsApp notification to the customer
     * @param update - Shipping status update data
     * @returns true if the update was successful
     */
    async updateShippingStatus(update: ShippingStatusUpdate): Promise<boolean> {
        try {
            const response = await axios.post(
                `${this.apiUrl}/api/shipping/status-update`,
                {
                    order_number: update.orderNumber,
                    status: update.status,
                    tracking_number: update.trackingNumber,
                    carrier: update.carrier,
                    estimated_delivery: update.estimatedDelivery?.toISOString(),
                    notes: update.notes
                },
                {
                    headers: {
                        'X-API-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 2000
                }
            );

            return response.data.success;
        } catch (error) {
            console.error('Error updating shipping status:', error);
            return false;
        }
    }
}

/**
 * Singleton instance for convenience
 */
export const techAuraIntegration = new TechAuraIntegration();
