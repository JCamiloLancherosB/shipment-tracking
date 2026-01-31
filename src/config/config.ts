import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: parseInt(process.env.PORT || '3010'),
    
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
