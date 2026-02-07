import express from 'express';
import * as path from 'path';
import { createServer } from 'http';
import { config } from './config/config';
import { FolderWatcher } from './watchers/FolderWatcher';
import { GuideParser } from './services/GuideParser';
import { CustomerMatcher } from './services/CustomerMatcher';
import { WhatsAppSender } from './services/WhatsAppSender';
import { setupRoutes, cleanupOldUploads, UPLOAD_MAX_AGE_MS } from './api/routes';
import { createViewRouter } from './api/viewRoutes';
import { setupWebSocket } from './websocket';

// Global service state
let serviceReady = false;
let dbConnected = false;

// Prevent process crashes from unhandled errors
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

class ShipmentTrackingApp {
    private app: express.Application;
    private watcher: FolderWatcher | null = null;
    private parser: GuideParser;
    private matcher: CustomerMatcher | null = null;
    private sender: WhatsAppSender;

    constructor() {
        this.app = express();
        this.parser = new GuideParser();
        this.sender = new WhatsAppSender(config.whatsapp);
    }

    async processGuide(filePath: string): Promise<void> {
        if (!this.matcher) {
            console.error('❌ Cannot process guide: database not connected');
            return;
        }

        console.log(`📄 Processing guide: ${filePath}`);
        
        try {
            // 1. Parse the guide
            const guideData = await this.parser.parse(filePath);
            if (!guideData) {
                console.error(`❌ Could not parse guide: ${filePath}`);
                return;
            }
            
            console.log(`✅ Extracted data:`, guideData);
            
            // 2. Match customer in TechAura database
            const customer = await this.matcher.findCustomer(guideData);
            if (!customer) {
                console.warn(`⚠️ No customer match found for guide: ${guideData.trackingNumber}`);
                await this.logUnmatched(guideData);
                return;
            }
            
            console.log(`✅ Matched customer: ${customer.name} (${customer.phone})`);
            
            // 3. Send guide via WhatsApp
            const sent = await this.sender.sendGuide(customer.phone, guideData, filePath);
            if (sent) {
                console.log(`✅ Guide sent to ${customer.phone}`);
                await this.updateOrderTracking(customer.orderNumber, guideData);
            } else {
                console.error(`❌ Failed to send guide to ${customer.phone}`);
            }
        } catch (error) {
            console.error(`❌ Error processing guide:`, error);
        }
    }

    private async logUnmatched(guideData: any): Promise<void> {
        // Log unmatched guides for manual review
        console.log('📝 Unmatched guide logged:', {
            tracking: guideData.trackingNumber,
            customer: guideData.customerName,
            phone: guideData.customerPhone
        });
    }

    private async updateOrderTracking(orderNumber: string, guideData: any): Promise<void> {
        if (!this.matcher) return;
        await this.matcher.updateOrderTracking(
            orderNumber, 
            guideData.trackingNumber, 
            guideData.carrier
        );
    }

    private async initializeServices(): Promise<void> {
        // Connect to database
        try {
            this.matcher = new CustomerMatcher(config.techauraDb);
            dbConnected = true;
            console.log('✅ Database pool created');
        } catch (error) {
            console.error('⚠️ Database connection failed:', (error as Error).message);
            // Retry database connection every 30 seconds
            const retryInterval = setInterval(() => {
                if (!dbConnected) {
                    try {
                        this.matcher = new CustomerMatcher(config.techauraDb);
                        dbConnected = true;
                        serviceReady = true;
                        console.log('✅ Database reconnected');
                        clearInterval(retryInterval);
                    } catch (e) {
                        console.error('⚠️ DB retry failed:', (e as Error).message);
                    }
                }
            }, 30000);
        }

        // Start folder watcher (non-blocking: log error but don't crash)
        try {
            this.watcher = new FolderWatcher(config.watchFolder, this.processGuide.bind(this));
            this.watcher.start();
        } catch (error) {
            console.error('⚠️ Failed to start folder watcher:', error);
        }

        if (dbConnected) {
            serviceReady = true;
            console.log('✅ All services initialized - fully operational');
        }
    }

    async start(): Promise<void> {
        const port = config.port || 3010;

        // Diagnostic startup log
        console.log('='.repeat(50));
        console.log('  SHIPMENT TRACKING SERVICE');
        console.log('='.repeat(50));
        console.log(`  Port: ${port}`);
        console.log(`  Node: ${process.version}`);
        console.log(`  PID:  ${process.pid}`);
        console.log(`  ENV:  ${process.env.NODE_ENV || 'development'}`);
        console.log(`  DB:   ${config.techauraDb.host}:${config.techauraDb.port}`);
        console.log('='.repeat(50));

        // 1. FIRST: Configure app and register routes
        this.app.set('view engine', 'ejs');
        this.app.set('views', path.join(__dirname, 'views'));
        
        const publicPath = path.join(__dirname, '..', 'public');
        this.app.use(express.static(publicPath));

        // Register early health check (before any DB-dependent middleware)
        this.app.get('/health', (_req, res) => {
            res.status(serviceReady ? 200 : 503).json({
                status: serviceReady ? 'healthy' : 'starting',
                service: 'shipment-tracking',
                database: dbConnected ? 'connected' : 'disconnected',
                port: port,
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        });
        
        // Setup view routes (must be before API routes to avoid 404 handler)
        this.app.use(createViewRouter());
        
        // Setup Express API routes (uses a placeholder matcher until DB connects)
        setupRoutes(this.app, {
            parser: this.parser,
            matcher: this.matcher as any,
            sender: this.sender
        });
        
        // 2. SECOND: Create HTTP server and start listening
        const httpServer = createServer(this.app);
        setupWebSocket(httpServer);
        
        httpServer.listen(port, '0.0.0.0', () => {
            console.log(`🚀 Shipment Tracking listening on port ${port}`);
            console.log(`✅ Health: http://localhost:${port}/health`);

            // Cleanup old uploads at startup
            cleanupOldUploads();

            // Periodic cleanup every hour
            setInterval(() => cleanupOldUploads(), UPLOAD_MAX_AGE_MS);

            // 3. THIRD: Initialize services in background (after port is open)
            this.initializeServices().then(() => {
                console.log(`
🚚 Shipment Tracking System Started
===================================
📂 Watching folder: ${config.watchFolder}
🌐 API available at: http://localhost:${port}
🖥️  Dashboard at: http://localhost:${port}/dashboard
📡 WebSocket available at: ws://localhost:${port}
✅ Health check available at http://localhost:${port}/health
🔗 TechAura DB: ${config.techauraDb.host} (${dbConnected ? 'connected' : 'disconnected'})
                `);
            }).catch(err => {
                console.error('❌ Service initialization failed:', err.message);
            });
        });
    }
}

const app = new ShipmentTrackingApp();
app.start().catch(console.error);
