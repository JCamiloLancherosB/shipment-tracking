export interface ShippingGuideData {
    trackingNumber: string;
    customerName: string;
    customerPhone?: string;
    shippingAddress: string;
    city: string;
    department?: string;
    carrier: string;
    estimatedDelivery?: Date;
    rawText: string;
}

export interface CustomerMatch {
    id: number;
    orderNumber: string;
    phone: string;
    name: string;
    address: string;
    confidence: number;
    matchedBy: 'phone' | 'name' | 'address';
}

export interface ProcessResult {
    success: boolean;
    message: string;
    trackingNumber?: string;
    sentTo?: string;
    error?: string;
}

export interface CreateShipmentRequest {
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    shippingAddress: string;
    shippingPhone: string;
    productDescription: string;
    status: string;
}

export interface Shipment {
    id: number;
    orderNumber: string;
    trackingNumber: string;
    customerName: string;
    customerPhone: string;
    shippingAddress: string;
    shippingPhone: string;
    productDescription: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
}
