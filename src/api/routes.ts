import express, { Request, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GuideParser } from '../services/GuideParser';
import { CustomerMatcher } from '../services/CustomerMatcher';
import { WhatsAppSender } from '../services/WhatsAppSender';
import webhooksRouter from '../routes/webhooks';
import carrierRoutes from './carrierRoutes';

// Upload directory using OS-appropriate temp path
export const UPLOAD_DIR = path.join(os.tmpdir(), 'shipment-tracking-uploads');

// Allowed file extensions for uploads
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.bmp'];

// Setup multer for file uploads
const upload = multer({ 
    dest: UPLOAD_DIR,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, ALLOWED_EXTENSIONS.includes(ext));
    }
});

/**
 * Cleans up files older than the specified max age from the upload directory.
 * @param maxAgeMs Maximum file age in milliseconds (default: 1 hour)
 */
export function cleanupOldUploads(maxAgeMs: number = 60 * 60 * 1000): void {
    try {
        if (!fs.existsSync(UPLOAD_DIR)) {
            return;
        }
        const now = Date.now();
        const files = fs.readdirSync(UPLOAD_DIR);
        for (const file of files) {
            const filePath = path.join(UPLOAD_DIR, file);
            try {
                const stats = fs.statSync(filePath);
                if (stats.isFile() && (now - stats.mtimeMs) > maxAgeMs) {
                    fs.unlinkSync(filePath);
                    console.log(`🧹 Cleaned up orphaned upload: ${file}`);
                }
            } catch {
                // Ignore errors for individual files (may have been deleted already)
            }
        }
    } catch {
        // Ignore errors during cleanup (directory may not exist yet)
    }
}

// Rate limiter for file upload endpoints
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 requests per windowMs
    message: 'Too many upload requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiter for test endpoints
const testLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Limit each IP to 50 requests per windowMs
    message: 'Too many test requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

interface Services {
    parser: GuideParser;
    matcher: CustomerMatcher;
    sender: WhatsAppSender;
}

export function setupRoutes(app: express.Application, services: Services): void {
    app.use(express.json());

    // Mount webhooks router
    app.use('/webhooks', webhooksRouter);

    // Mount carrier routes for multi-carrier tracking
    app.use('/api', carrierRoutes);

    // Note: Primary /health endpoint is registered early in index.ts for resilience.
    // This serves as a fallback when routes are used standalone (e.g., tests).
    app.get('/health', (req: Request, res: Response) => {
        res.json({ 
            status: 'healthy', 
            service: 'shipment-tracking',
            port: parseInt(process.env.PORT || '3010'),
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    });

    // Extended health check that verifies TechAura API connection
    app.get('/health/techaura', async (req: Request, res: Response) => {
        try {
            const healthResult = await services.sender.checkHealth();
            
            const statusCode = healthResult.healthy ? 200 : 503;
            
            return res.status(statusCode).json({
                status: healthResult.healthy ? 'ok' : 'degraded',
                service: 'shipment-tracking',
                timestamp: new Date().toISOString(),
                dependencies: {
                    techAuraApi: {
                        healthy: healthResult.healthy,
                        message: healthResult.message,
                        circuitBreakerState: healthResult.circuitState,
                        responseTimeMs: healthResult.responseTimeMs
                    }
                }
            });
        } catch (error: any) {
            return res.status(503).json({
                status: 'error',
                service: 'shipment-tracking',
                timestamp: new Date().toISOString(),
                dependencies: {
                    techAuraApi: {
                        healthy: false,
                        message: error.message || 'Unknown error checking TechAura API health'
                    }
                }
            });
        }
    });

    // Manual guide upload and processing
    app.post('/api/process-guide', uploadLimiter, upload.single('guide'), async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'No file uploaded' 
                });
            }

            const filePath = req.file.path;

            // Parse the guide
            const guideData = await services.parser.parse(filePath);
            if (!guideData) {
                fs.unlinkSync(filePath); // Clean up
                return res.status(400).json({ 
                    success: false, 
                    error: 'Could not parse guide data' 
                });
            }

            // Match customer
            const customer = await services.matcher.findCustomer(guideData);
            if (!customer) {
                fs.unlinkSync(filePath); // Clean up
                return res.json({
                    success: false,
                    message: 'No matching customer found',
                    guideData
                });
            }

            // Send via WhatsApp
            const sent = await services.sender.sendGuide(customer.phone, guideData, filePath);
            
            if (sent) {
                await services.matcher.updateOrderTracking(
                    customer.orderNumber, 
                    guideData.trackingNumber, 
                    guideData.carrier
                );

                // Clean up after successful send and DB update
                fs.unlinkSync(filePath);

                return res.json({
                    success: true,
                    message: 'Guide sent successfully',
                    trackingNumber: guideData.trackingNumber,
                    sentTo: customer.phone,
                    customer: customer.name
                });
            } else {
                // Clean up on send failure
                fs.unlinkSync(filePath);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to send guide via WhatsApp'
                });
            }
        } catch (error: any) {
            console.error('Error processing guide:', error);
            
            // Clean up file if it exists
            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            return res.status(500).json({ 
                success: false, 
                error: error.message || 'Internal server error'
            });
        }
    });

    // Test guide parsing only (no sending)
    app.post('/api/test-parse', uploadLimiter, upload.single('guide'), async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'No file uploaded' 
                });
            }

            const filePath = req.file.path;
            const guideData = await services.parser.parse(filePath);
            
            // Clean up
            fs.unlinkSync(filePath);

            if (guideData) {
                return res.json({
                    success: true,
                    data: guideData
                });
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Could not extract data from guide'
                });
            }
        } catch (error: any) {
            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });

    // Test customer matching
    app.post('/api/test-match', testLimiter, async (req: Request, res: Response) => {
        try {
            const { customerName, customerPhone, shippingAddress, city } = req.body;

            if (!customerName && !customerPhone && !shippingAddress) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'At least one search parameter required' 
                });
            }

            const guideData = {
                trackingNumber: 'TEST',
                customerName: customerName || '',
                customerPhone,
                shippingAddress: shippingAddress || '',
                city: city || '',
                carrier: 'Test',
                rawText: 'Test'
            };

            const match = await services.matcher.findCustomer(guideData);

            if (match) {
                return res.json({
                    success: true,
                    match
                });
            } else {
                return res.json({
                    success: false,
                    message: 'No matching customer found'
                });
            }
        } catch (error: any) {
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });

    // 404 handler
    app.use((req: Request, res: Response) => {
        res.status(404).json({ 
            error: 'Not found',
            availableEndpoints: [
                'GET /health',
                'GET /health/techaura',
                'POST /api/process-guide',
                'POST /api/test-parse',
                'POST /api/test-match',
                'POST /webhooks/order-completed',
                'POST /webhooks/new-order',
                'GET /api/tracking/:trackingNumber',
                'POST /api/shipments',
                'GET /api/shipments/:trackingNumber/label',
                'DELETE /api/shipments/:trackingNumber',
                'GET /api/carriers',
                'GET /api/carriers/:carrierId',
                'GET /api/carriers/quote'
            ]
        });
    });
}
