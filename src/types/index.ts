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

export interface ICustomerMatcher {
    findCustomer(guideData: ShippingGuideData): Promise<CustomerMatch | null>;
    updateOrderTracking(orderNumber: string, trackingNumber: string, carrier: string): Promise<boolean>;
}

export interface ProcessResult {
    success: boolean;
    message: string;
    trackingNumber?: string;
    sentTo?: string;
    error?: string;
}

export interface ExtractedOrderData {
    customerName: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    neighborhood: string | null;
    department: string | null;
    cedula: string | null;
    references: string | null;
    product: string | null;
    rawText: string;
    confidence: number;
    imageSource?: string;
}

export interface BulkOrderExportRow {
    nombreDestinatario: string;
    telefono: string;
    direccion: string;
    ciudad: string;
    barrio: string;
    conRecaudo: string;
    nota: string;
    email: string;
    idVariable: string;
    codigoPostal: string;
    transportadora: string;
    cedula: string;
    colonia: string;
    seguro: string;
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
