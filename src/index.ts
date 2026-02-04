import express from 'express';
import * as path from 'path';
import { config } from './config/config';
import { FolderWatcher } from './watchers/FolderWatcher';
import { GuideParser } from './services/GuideParser';
import { CustomerMatcher } from './services/CustomerMatcher';
import { WhatsAppSender } from './services/WhatsAppSender';
import { setupRoutes } from './api/routes';
import { createViewRouter } from './api/viewRoutes';

class ShipmentTrackingApp {
    private app: express.Application;
    private watcher: FolderWatcher;
    private parser: GuideParser;
    private matcher: CustomerMatcher;
    private sender: WhatsAppSender;

    constructor() {
        this.app = express();
        this.parser = new GuideParser();
        this.matcher = new CustomerMatcher(config.techauraDb);
        this.sender = new WhatsAppSender(config.whatsapp);
        this.watcher = new FolderWatcher(config.watchFolder, this.processGuide.bind(this));
    }

    async processGuide(filePath: string): Promise<void> {
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
        await this.matcher.updateOrderTracking(
            orderNumber, 
            guideData.trackingNumber, 
            guideData.carrier
        );
    }

    async start(): Promise<void> {
        // Configure EJS as template engine
        this.app.set('view engine', 'ejs');
        this.app.set('views', path.join(__dirname, 'views'));
        
        // Serve static files from public folder
        // In dev mode (tsx), __dirname is src/, in prod mode it's dist/
        // public folder is at the project root level
        const publicPath = path.join(__dirname, '..', 'public');
        this.app.use(express.static(publicPath));
        
        // Setup view routes (must be before API routes to avoid 404 handler)
        this.app.use(createViewRouter());
        
        // Setup Express API routes
        setupRoutes(this.app, {
            parser: this.parser,
            matcher: this.matcher,
            sender: this.sender
        });
        
        // Start folder watcher
        this.watcher.start();
        
        // Start HTTP server
        const port = config.port || 3010;
        this.app.listen(port, () => {
            console.log(`
🚚 Shipment Tracking System Started
===================================
📂 Watching folder: ${config.watchFolder}
🌐 API available at: http://localhost:${port}
🖥️  Dashboard at: http://localhost:${port}/dashboard
🔗 Connected to TechAura DB: ${config.techauraDb.host}
            `);
        });
    }
}

const app = new ShipmentTrackingApp();
app.start().catch(console.error);
