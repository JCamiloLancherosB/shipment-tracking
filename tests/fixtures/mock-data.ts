// Mock data for testing

export const mockGuideTexts = {
  servientrega: `
SERVIENTREGA
GUIA DE ENVIO
Número de guía: SV123456789
Destinatario: Juan Carlos Pérez
Teléfono: 300 123 4567
Dirección: Calle 45 # 23-67
Ciudad: Bogotá
Remitente: TechAura
  `,
  coordinadora: `
COORDINADORA
Guía: CD987654321
Cliente: María González López
Tel: 3012345678
Cra 7 # 100-25
MEDELLIN
  `,
  interrapidisimo: `
INTER RÁPIDISIMO
Tracking: IR555123456
Para: Carlos Alberto Rodríguez
Celular: 301-987-6543
Av. 68 # 45-23
CALI
  `,
  envia: `
ENVÍA COLVANES
Número guía: ENV789456123
Nombre: Andrea Martínez
Teléfono: 3209876543
Diagonal 25 # 12-45
Barranquilla
  `,
  tcc: `
TCC
Guía #: TCC445566778
Destinatario: Pedro Sánchez
Tel: 300 555 1234
Carrera 15 # 88-22
BUCARAMANGA
  `,
  carrier472: `
472
Número: 472998877665
Cliente: Luis Fernando Gómez
Celular: 3015554321
Transversal 34 # 56-78
PEREIRA
  `
};

export const mockDatabaseOrders = [
  {
    id: 1,
    order_number: 'ORD-2024-001',
    phone_number: '3001234567',
    shipping_phone: '3001234567',
    customer_name: 'Juan Carlos Pérez',
    shipping_address: 'Calle 45 # 23-67, Bogotá',
    processing_status: 'confirmed',
    tracking_number: null,
    carrier: null,
    shipping_status: null,
    shipped_at: null,
    created_at: new Date('2024-01-15'),
    updated_at: new Date('2024-01-15')
  },
  {
    id: 2,
    order_number: 'ORD-2024-002',
    phone_number: '3012345678',
    shipping_phone: '3012345678',
    customer_name: 'María González López',
    shipping_address: 'Cra 7 # 100-25, Medellín',
    processing_status: 'processing',
    tracking_number: null,
    carrier: null,
    shipping_status: null,
    shipped_at: null,
    created_at: new Date('2024-01-16'),
    updated_at: new Date('2024-01-16')
  },
  {
    id: 3,
    order_number: 'ORD-2024-003',
    phone_number: '3019876543',
    shipping_phone: '3019876543',
    customer_name: 'Carlos Alberto Rodríguez',
    shipping_address: 'Av. 68 # 45-23, Cali',
    processing_status: 'confirmed',
    tracking_number: null,
    carrier: null,
    shipping_status: null,
    shipped_at: null,
    created_at: new Date('2024-01-17'),
    updated_at: new Date('2024-01-17')
  }
];

export const mockWhatsAppResponses = {
  success: {
    status: 200,
    data: {
      success: true,
      messageId: 'msg-123456'
    }
  },
  failure: {
    status: 500,
    data: {
      success: false,
      error: 'Failed to send message'
    }
  }
};

export const mockParsedGuideData = {
  trackingNumber: 'SV123456789',
  customerName: 'Juan Carlos Pérez',
  customerPhone: '573001234567',
  shippingAddress: 'Calle 45 # 23-67',
  city: 'Bogota',
  carrier: 'Servientrega',
  rawText: mockGuideTexts.servientrega.substring(0, 500)
};

export const mockCustomerMatch = {
  id: 1,
  orderNumber: 'ORD-2024-001',
  phone: '3001234567',
  name: 'Juan Carlos Pérez',
  address: 'Calle 45 # 23-67, Bogotá',
  confidence: 100,
  matchedBy: 'phone' as const
};
