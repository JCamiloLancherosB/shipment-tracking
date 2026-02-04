import express from 'express';
import request from 'supertest';
import * as path from 'path';
import { createViewRouter, getShippingStats, getTrackingHistory } from '../../src/api/viewRoutes';
import { techAuraIntegration } from '../../src/services/TechAuraIntegration';

// Mock the TechAura integration
jest.mock('../../src/services/TechAuraIntegration');

const mockTechAuraIntegration = techAuraIntegration as jest.Mocked<typeof techAuraIntegration>;

describe('View Routes', () => {
    let app: express.Application;

    const mockOrders = [
        {
            orderNumber: 'ORD-001',
            customerName: 'Juan Pérez',
            customerPhone: '3001234567',
            shippingAddress: 'Calle 45 # 23-67, Bogotá',
            city: 'Bogotá',
            status: 'confirmed'
        },
        {
            orderNumber: 'ORD-002',
            customerName: 'María García',
            customerPhone: '3009876543',
            shippingAddress: 'Carrera 7 # 100-25, Medellín',
            city: 'Medellín',
            status: 'pending'
        }
    ];

    const mockOrderDetails = {
        orderNumber: 'ORD-001',
        customerName: 'Juan Pérez',
        customerPhone: '3001234567',
        shippingAddress: 'Calle 45 # 23-67, Bogotá',
        city: 'Bogotá',
        department: 'Cundinamarca',
        productDescription: 'USB 16GB Custom',
        notes: 'Entregar en portería',
        status: 'confirmed',
        paymentStatus: 'paid',
        createdAt: new Date(),
        updatedAt: new Date()
    };

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Create Express app with EJS configured
        app = express();
        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, '../../src/views'));
        
        // Mount the view router
        app.use(createViewRouter());
    });

    describe('GET /dashboard', () => {
        it('should render dashboard with stats and orders', async () => {
            mockTechAuraIntegration.getOrdersReadyForShipping.mockResolvedValue(mockOrders);

            const response = await request(app)
                .get('/dashboard')
                .expect(200);

            expect(response.text).toContain('Dashboard');
            expect(mockTechAuraIntegration.getOrdersReadyForShipping).toHaveBeenCalled();
        });

        it('should render dashboard with empty state when no orders', async () => {
            mockTechAuraIntegration.getOrdersReadyForShipping.mockResolvedValue([]);

            const response = await request(app)
                .get('/dashboard')
                .expect(200);

            expect(response.text).toContain('Dashboard');
            expect(response.text).toContain('No hay pedidos pendientes');
        });

        it('should handle errors gracefully', async () => {
            mockTechAuraIntegration.getOrdersReadyForShipping.mockRejectedValue(new Error('API Error'));

            const response = await request(app)
                .get('/dashboard')
                .expect(200);

            // Should still render the page with empty data
            expect(response.text).toContain('Dashboard');
        });
    });

    describe('GET /orders', () => {
        it('should render orders list', async () => {
            mockTechAuraIntegration.getOrdersReadyForShipping.mockResolvedValue(mockOrders);

            const response = await request(app)
                .get('/orders')
                .expect(200);

            expect(response.text).toContain('Pedidos');
            expect(response.text).toContain('ORD-001');
            expect(response.text).toContain('Juan Pérez');
        });

        it('should render empty state when no orders', async () => {
            mockTechAuraIntegration.getOrdersReadyForShipping.mockResolvedValue([]);

            const response = await request(app)
                .get('/orders')
                .expect(200);

            expect(response.text).toContain('No hay pedidos pendientes');
        });
    });

    describe('GET /orders/:orderNumber', () => {
        it('should render order detail page', async () => {
            mockTechAuraIntegration.getOrderDetails.mockResolvedValue(mockOrderDetails);

            const response = await request(app)
                .get('/orders/ORD-001')
                .expect(200);

            expect(response.text).toContain('Pedido ORD-001');
            expect(response.text).toContain('Juan Pérez');
            expect(mockTechAuraIntegration.getOrderDetails).toHaveBeenCalledWith('ORD-001');
        });

        it('should return 404 when order not found', async () => {
            mockTechAuraIntegration.getOrderDetails.mockResolvedValue(null);

            const response = await request(app)
                .get('/orders/ORD-INVALID')
                .expect(404);

            expect(response.text).toContain('No se encontr');
        });

        it('should handle errors gracefully', async () => {
            mockTechAuraIntegration.getOrderDetails.mockRejectedValue(new Error('API Error'));

            const response = await request(app)
                .get('/orders/ORD-001')
                .expect(500);

            expect(response.text).toContain('Error');
        });
    });

    describe('GET /upload', () => {
        it('should render upload page with order options', async () => {
            mockTechAuraIntegration.getOrdersReadyForShipping.mockResolvedValue(mockOrders);

            const response = await request(app)
                .get('/upload')
                .expect(200);

            expect(response.text).toContain('Subir Guía');
            expect(response.text).toContain('Auto-detectar');
            expect(response.text).toContain('ORD-001');
        });

        it('should handle query parameter for pre-selected order', async () => {
            mockTechAuraIntegration.getOrdersReadyForShipping.mockResolvedValue(mockOrders);

            const response = await request(app)
                .get('/upload?order=ORD-001')
                .expect(200);

            expect(response.text).toContain('Subir Guía');
        });
    });

    describe('GET /', () => {
        it('should redirect to dashboard', async () => {
            const response = await request(app)
                .get('/')
                .expect(302);

            expect(response.headers.location).toBe('/dashboard');
        });
    });

    describe('getShippingStats', () => {
        it('should return stats based on orders count', async () => {
            mockTechAuraIntegration.getOrdersReadyForShipping.mockResolvedValue(mockOrders);

            const stats = await getShippingStats();

            expect(stats.pending).toBe(2);
            expect(stats.sentToday).toBe(0);
            expect(stats.errors).toBe(0);
        });

        it('should return zero stats on error', async () => {
            mockTechAuraIntegration.getOrdersReadyForShipping.mockRejectedValue(new Error('Error'));

            const stats = await getShippingStats();

            expect(stats.pending).toBe(0);
            expect(stats.sentToday).toBe(0);
            expect(stats.errors).toBe(0);
        });
    });

    describe('getTrackingHistory', () => {
        it('should return empty array (placeholder implementation)', async () => {
            const history = await getTrackingHistory('ORD-001');

            expect(history).toEqual([]);
        });
    });
});
