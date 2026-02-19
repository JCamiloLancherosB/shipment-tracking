import express, { Request, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GuideParser, WhatsAppChatDetectedError } from '../services/GuideParser';
import { ICustomerMatcher, BulkOrderExportRow } from '../types';
import { WhatsAppSender } from '../services/WhatsAppSender';
import { WhatsAppChatParser } from '../services/WhatsAppChatParser';
import webhooksRouter from '../routes/webhooks';
import carrierRoutes from './carrierRoutes';
import { apiKeyAuth } from '../middleware/auth';

// Upload directory using OS-appropriate temp path
export const UPLOAD_DIR = path.join(os.tmpdir(), 'shipment-tracking-uploads');

// Max age for orphaned uploads (1 hour in milliseconds)
export const UPLOAD_MAX_AGE_MS = 60 * 60 * 1000;

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
export function cleanupOldUploads(maxAgeMs: number = UPLOAD_MAX_AGE_MS): void {
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
    matcher: ICustomerMatcher;
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
    app.get('/health/techaura', apiKeyAuth, async (req: Request, res: Response) => {
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

    // Manual guide upload and processing — accepts multiple files
    app.post('/api/process-guide', apiKeyAuth, uploadLimiter, upload.array('guide', 50), async (req: Request, res: Response) => {
        const files = req.files as Express.Multer.File[] | undefined;

        // Support legacy single-file usage (upload.single sets req.file)
        const singleFile = (req as any).file as Express.Multer.File | undefined;
        const allFiles = files && files.length > 0 ? files : (singleFile ? [singleFile] : []);

        if (allFiles.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No se subió ningún archivo' 
            });
        }

        // If multiple files, process each and return array of results
        if (allFiles.length > 1) {
            const results = [];
            for (const file of allFiles) {
                try {
                    const guideData = await services.parser.parse(file.path);
                    if (!guideData) {
                        fs.existsSync(file.path) && fs.unlinkSync(file.path);
                        results.push({ success: false, fileName: file.originalname, error: '⚠️ Esta imagen no parece ser una guía de transportadora. Si tienes capturas de WhatsApp con datos de clientes, usa la sección "📱 Guías desde WhatsApp".' });
                        continue;
                    }
                    const customer = await services.matcher.findCustomer(guideData);
                    if (!customer) {
                        fs.existsSync(file.path) && fs.unlinkSync(file.path);
                        results.push({ success: false, fileName: file.originalname, message: 'No se encontró cliente asociado', guideData });
                        continue;
                    }
                    const sent = await services.sender.sendGuide(customer.phone, guideData, file.path);
                    if (sent) {
                        await services.matcher.updateOrderTracking(customer.orderNumber, guideData.trackingNumber, guideData.carrier);
                        fs.existsSync(file.path) && fs.unlinkSync(file.path);
                        results.push({ success: true, fileName: file.originalname, trackingNumber: guideData.trackingNumber, sentTo: customer.phone, customer: customer.name });
                    } else {
                        fs.existsSync(file.path) && fs.unlinkSync(file.path);
                        results.push({ success: false, fileName: file.originalname, error: 'Error al enviar la guía por WhatsApp' });
                    }
                } catch (err: any) {
                    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
                    if (err instanceof WhatsAppChatDetectedError) {
                        results.push({ success: false, fileName: file.originalname, error: '⚠️ Esta imagen parece ser una captura de WhatsApp. Usa la sección "📱 Guías desde WhatsApp" para procesar conversaciones de clientes.' });
                    } else {
                        results.push({ success: false, fileName: file.originalname, error: err.message || 'Error interno' });
                    }
                }
            }
            return res.json({ success: true, results });
        }

        // Single file path (original behaviour)
        const file = allFiles[0];
        try {
            const filePath = file.path;

            // Parse the guide
            const guideData = await services.parser.parse(filePath);
            if (!guideData) {
                fs.unlinkSync(filePath); // Clean up
                return res.status(400).json({ 
                    success: false, 
                    error: '⚠️ Esta imagen no parece ser una guía de transportadora. Si tienes capturas de WhatsApp con datos de clientes, usa la sección "📱 Guías desde WhatsApp".' 
                });
            }

            // Match customer
            const customer = await services.matcher.findCustomer(guideData);
            if (!customer) {
                fs.unlinkSync(filePath); // Clean up
                return res.json({
                    success: false,
                    message: 'No se encontró cliente asociado',
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
                    message: 'Guía enviada correctamente',
                    trackingNumber: guideData.trackingNumber,
                    sentTo: customer.phone,
                    customer: customer.name
                });
            } else {
                // Clean up on send failure
                fs.unlinkSync(filePath);
                return res.status(500).json({
                    success: false,
                    error: 'Error al enviar la guía por WhatsApp'
                });
            }
        } catch (error: any) {
            console.error('Error processing guide:', error);
            
            // Clean up file if it exists
            if (file?.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }

            if (error instanceof WhatsAppChatDetectedError) {
                return res.status(400).json({
                    success: false,
                    error: '⚠️ Esta imagen parece ser una captura de WhatsApp. Usa la sección "📱 Guías desde WhatsApp" para procesar conversaciones de clientes.'
                });
            }

            if (error.message === 'Database not connected') {
                return res.status(503).json({
                    success: false,
                    error: 'Base de datos no conectada'
                });
            }

            return res.status(500).json({ 
                success: false, 
                error: error.message || 'Error interno del servidor'
            });
        }
    });

    // Test guide parsing only (no sending)
    app.post('/api/test-parse', apiKeyAuth, uploadLimiter, upload.single('guide'), async (req: Request, res: Response) => {
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
    app.post('/api/test-match', apiKeyAuth, testLimiter, async (req: Request, res: Response) => {
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
            if (error.message === 'Database not connected') {
                return res.status(503).json({
                    success: false,
                    error: 'Database not connected yet'
                });
            }
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });

    // Extract order data from WhatsApp chat screenshots — API key optional (uses session auth fallback)
    app.post('/api/extract-whatsapp-orders', uploadLimiter, upload.array('images', 20), async (req: Request, res: Response) => {
        const uploadedPaths: string[] = [];
        try {
            const files = req.files as Express.Multer.File[] | undefined;
            if (!files || files.length === 0) {
                return res.status(400).json({ success: false, error: 'No images uploaded' });
            }

            files.forEach(f => uploadedPaths.push(f.path));

            const parser = new WhatsAppChatParser();
            const orders = await parser.parseImages(files.map(f => f.path));

            // Clean up uploaded files
            uploadedPaths.forEach(p => { try { fs.unlinkSync(p); } catch { /* ignore */ } });

            return res.json({ success: true, orders });
        } catch (error: any) {
            uploadedPaths.forEach(p => { try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ } });
            return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
        }
    });

    // Export confirmed orders to CSV or Excel
    app.post('/api/export-orders', apiKeyAuth, async (req: Request, res: Response) => {
        try {
            const { orders, format } = req.body as { orders: BulkOrderExportRow[]; format?: string };

            if (!Array.isArray(orders) || orders.length === 0) {
                return res.status(400).json({ success: false, error: 'No orders provided' });
            }

            const columns = [
                'NOMBRE DESTINATARIO', 'TELEFONO', 'DIRECCION', 'CIUDAD', 'BARRIO',
                'CON RECAUDO', 'NOTA', 'EMAIL (OPCIONAL)', 'ID DE VARIABLE (OPCIONAL)',
                'CODIGO POSTAL (OPCIONAL)', 'TRANSPORTADORA (OPCIONAL)', 'CEDULA (OPCIONAL)',
                'COLONIA (OBLIGATORIO SOLO PARA QUIKEN)', 'SEGURO (SOLO APLICA PARA ENVIA)'
            ];

            const rows = orders.map(o => [
                o.nombreDestinatario || '',
                o.telefono || '',
                o.direccion || '',
                o.ciudad || '',
                o.barrio || '',
                o.conRecaudo || '',
                o.nota || '',
                o.email || '',
                o.idVariable || '',
                o.codigoPostal || '',
                o.transportadora || '',
                o.cedula || '',
                o.colonia || '',
                o.seguro || ''
            ]);

            if (format === 'xlsx') {
                const ExcelJS = await import('exceljs');
                const workbook = new ExcelJS.Workbook();
                const sheet = workbook.addWorksheet('Ordenes Masivas');

                sheet.addRow(columns);
                const headerRow = sheet.getRow(1);
                headerRow.font = { bold: true };
                headerRow.commit();

                rows.forEach(row => sheet.addRow(row));

                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="ordenes_masivas.xlsx"');

                await workbook.xlsx.write(res);
                return res.end();
            } else {
                // Default: CSV
                const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
                const csvLines = [
                    columns.map(escape).join(','),
                    ...rows.map(row => row.map(escape).join(','))
                ];
                const csv = csvLines.join('\r\n');

                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', 'attachment; filename="ordenes_masivas.csv"');
                return res.send('\uFEFF' + csv); // BOM for Excel UTF-8 compatibility
            }
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
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
                'POST /api/extract-whatsapp-orders',
                'POST /api/export-orders',
                'GET /orders/confirm',
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
