// Test setup file
// This runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3999';
process.env.WATCH_FOLDER = '/tmp/test-guides';
process.env.WHATSAPP_API_URL = 'http://localhost:9999';
process.env.WHATSAPP_API_KEY = 'test-api-key';
process.env.TECHAURA_API_URL = 'http://localhost:9999';
process.env.TECHAURA_API_KEY = 'test-techaura-api-key';
process.env.SHIPPING_API_KEY = 'test-shipping-api-key';
process.env.TECHAURA_DB_HOST = 'localhost';
process.env.TECHAURA_DB_PORT = '3306';
process.env.TECHAURA_DB_USER = 'test_user';
process.env.TECHAURA_DB_PASSWORD = 'test_password';
process.env.TECHAURA_DB_NAME = 'test_db';
process.env.DASHBOARD_SECRET = 'test-dashboard-secret';
process.env.CORS_ORIGIN = 'http://localhost:3010';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Increase test timeout for slow operations like OCR
jest.setTimeout(10000);
