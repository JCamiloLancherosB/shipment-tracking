import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: parseInt(process.env.PORT || '3010'),
    
    // CORS origin for WebSocket connections (defaults to same-origin)
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3010',
    
    // Dashboard secret for WebSocket authentication
    dashboardSecret: process.env.DASHBOARD_SECRET || '',
    // API key for authenticating incoming requests
    apiKey: process.env.SHIPPING_API_KEY || '',
    
    // Folder to watch for new shipping guides
    watchFolder: process.env.WATCH_FOLDER || './guides',
    
    // TechAura MySQL database connection
    techauraDb: {
        host: process.env.TECHAURA_DB_HOST || 'localhost',
        port: parseInt(process.env.TECHAURA_DB_PORT || '3306'),
        user: process.env.TECHAURA_DB_USER || 'techaura_bot',
        password: process.env.TECHAURA_DB_PASSWORD || '',
        database: process.env.TECHAURA_DB_NAME || 'techaura_bot'
    },
    
    // WhatsApp API configuration (connects to TechAura bot)
    whatsapp: {
        apiUrl: process.env.WHATSAPP_API_URL || 'http://localhost:3009',
        apiKey: process.env.WHATSAPP_API_KEY || ''
    },
    
    // OCR configuration
    ocr: {
        language: 'spa', // Spanish
        tesseractPath: process.env.TESSERACT_PATH
    }
};

// Log warning if SHIPPING_API_KEY is not set
if (!config.apiKey) {
    console.warn('⚠️ WARNING: SHIPPING_API_KEY is not set. API endpoints will not require authentication.');
}
