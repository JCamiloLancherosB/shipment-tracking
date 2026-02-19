import express, { Request, Response, Router } from 'express';
import { techAuraIntegration, OrderForShipping, OrderDetails } from '../services/TechAuraIntegration';

/**
 * Interface for dashboard statistics
 */
export interface DashboardStats {
    pending: number;
    sentToday: number;
    errors: number;
}

/**
 * Interface for tracking history event
 */
export interface TrackingEvent {
    timestamp: Date;
    action: string;
    details?: string;
}

/**
 * Get shipping statistics for the dashboard
 * @returns Dashboard statistics
 */
export async function getShippingStats(): Promise<DashboardStats> {
    try {
        const orders = await techAuraIntegration.getOrdersReadyForShipping();
        
        // For now, return basic stats based on available data
        // In a full implementation, this would query the database for more detailed stats
        return {
            pending: orders.length,
            sentToday: 0, // Would need database query for actual sent count
            errors: 0     // Would need database query for actual error count
        };
    } catch (error) {
        console.error('Error fetching shipping stats:', error);
        return {
            pending: 0,
            sentToday: 0,
            errors: 0
        };
    }
}

/**
 * Get tracking history for an order
 * @param orderNumber - The order number
 * @returns Array of tracking events
 */
export async function getTrackingHistory(orderNumber: string): Promise<TrackingEvent[]> {
    // In a full implementation, this would query the database for tracking history
    // For now, return an empty array as placeholder
    return [];
}

/**
 * Creates the view routes router
 * @returns Express Router with view routes configured
 */
export function createViewRouter(): Router {
    const router = Router();

    // Dashboard - main overview
    router.get('/dashboard', async (req: Request, res: Response) => {
        try {
            const stats = await getShippingStats();
            const orders = await techAuraIntegration.getOrdersReadyForShipping();
            
            // Limit to last 10 orders for dashboard
            const recentOrders = orders.slice(0, 10);
            
            res.render('dashboard', { 
                stats, 
                orders: recentOrders,
                title: 'Dashboard',
                currentPage: 'dashboard'
            });
        } catch (error) {
            console.error('Error rendering dashboard:', error);
            res.render('dashboard', { 
                stats: { pending: 0, sentToday: 0, errors: 0 }, 
                orders: [],
                title: 'Dashboard',
                currentPage: 'dashboard',
                error: 'Error al cargar el dashboard'
            });
        }
    });

    // Orders list
    router.get('/orders', async (req: Request, res: Response) => {
        try {
            const orders = await techAuraIntegration.getOrdersReadyForShipping();
            
            res.render('orders', { 
                orders,
                title: 'Pedidos',
                currentPage: 'orders'
            });
        } catch (error) {
            console.error('Error rendering orders:', error);
            res.render('orders', { 
                orders: [],
                title: 'Pedidos',
                currentPage: 'orders',
                error: 'Error al cargar los pedidos'
            });
        }
    });

    // Order detail with tracking history
    router.get('/orders/:orderNumber', async (req: Request, res: Response) => {
        try {
            const { orderNumber } = req.params;
            const order = await techAuraIntegration.getOrderDetails(orderNumber);
            
            if (!order) {
                return res.status(404).render('order-detail', {
                    order: null,
                    tracking: [],
                    title: 'Pedido no encontrado',
                    currentPage: 'orders',
                    error: 'No se encontró el pedido especificado'
                });
            }

            const tracking = await getTrackingHistory(orderNumber);
            
            res.render('order-detail', { 
                order, 
                tracking,
                title: `Pedido ${orderNumber}`,
                currentPage: 'orders'
            });
        } catch (error) {
            console.error('Error rendering order detail:', error);
            res.status(500).render('order-detail', {
                order: null,
                tracking: [],
                title: 'Error',
                currentPage: 'orders',
                error: 'Error al cargar el detalle del pedido'
            });
        }
    });

    // Upload guide page
    router.get('/upload', async (req: Request, res: Response) => {
        try {
            const orders = await techAuraIntegration.getOrdersReadyForShipping();
            const selectedOrder = req.query.order as string | undefined;
            
            res.render('upload-guide', { 
                orders,
                selectedOrder,
                title: 'Subir Guía',
                currentPage: 'upload'
            });
        } catch (error) {
            console.error('Error rendering upload page:', error);
            res.render('upload-guide', { 
                orders: [],
                title: 'Subir Guía',
                currentPage: 'upload',
                error: 'Error al cargar la página'
            });
        }
    });

    // Redirect root to dashboard
    router.get('/', (req: Request, res: Response) => {
        res.redirect('/dashboard');
    });

    // Order confirmation view for WhatsApp-extracted orders
    router.get('/orders/confirm', (req: Request, res: Response) => {
        res.render('order-confirmation', {
            title: 'Confirmar Pedidos de WhatsApp',
            currentPage: 'whatsapp'
        });
    });

    return router;
}

export default createViewRouter;
