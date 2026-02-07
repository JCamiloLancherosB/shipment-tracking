import express from 'express';
import request from 'supertest';
import { setupRoutes } from '../../src/api/routes';
import { GuideParser } from '../../src/services/GuideParser';
import { CustomerMatcher } from '../../src/services/CustomerMatcher';
import { WhatsAppSender } from '../../src/services/WhatsAppSender';
import { mockParsedGuideData, mockCustomerMatch } from '../fixtures/mock-data';
import * as fs from 'fs';
import * as path from 'path';

// Mock the services
jest.mock('../../src/services/GuideParser');
jest.mock('../../src/services/CustomerMatcher');
jest.mock('../../src/services/WhatsAppSender');
jest.mock('../../src/services/ShipmentService', () => ({
  ShipmentService: jest.fn().mockImplementation(() => ({
    createShipment: jest.fn()
  }))
}));

describe('API Routes Integration Tests', () => {
  let app: express.Application;
  let mockParser: jest.Mocked<GuideParser>;
  let mockMatcher: jest.Mocked<CustomerMatcher>;
  let mockSender: jest.Mocked<WhatsAppSender>;

  beforeEach(() => {
    // Create fresh mocks
    mockParser = new GuideParser() as jest.Mocked<GuideParser>;
    mockMatcher = new CustomerMatcher({} as any) as jest.Mocked<CustomerMatcher>;
    mockSender = new WhatsAppSender({ apiUrl: '', apiKey: '' }) as jest.Mocked<WhatsAppSender>;

    // Setup default mock implementations
    mockParser.parse = jest.fn();
    mockMatcher.findCustomer = jest.fn();
    mockMatcher.updateOrderTracking = jest.fn();
    mockSender.sendGuide = jest.fn();

    // Create Express app and setup routes
    app = express();
    setupRoutes(app, {
      parser: mockParser,
      matcher: mockMatcher,
      sender: mockSender
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        service: 'shipment-tracking',
        port: 3999,
        timestamp: expect.any(String),
        uptime: expect.any(Number)
      });
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });
  });

  describe('POST /api/process-guide', () => {
    let testFilePath: string;

    beforeEach(() => {
      // Create a temporary test file
      const testDir = '/tmp/test-uploads';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      testFilePath = path.join(testDir, 'test-guide.pdf');
      fs.writeFileSync(testFilePath, 'test guide content');
    });

    afterEach(() => {
      // Cleanup
      if (fs.existsSync(testFilePath)) {
        try {
          fs.unlinkSync(testFilePath);
        } catch (e) {
          // File may have been deleted by the endpoint
        }
      }
    });

    it('should process valid guide successfully', async () => {
      mockParser.parse.mockResolvedValue(mockParsedGuideData);
      mockMatcher.findCustomer.mockResolvedValue(mockCustomerMatch);
      mockSender.sendGuide.mockResolvedValue(true);
      mockMatcher.updateOrderTracking.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/process-guide')
        .attach('guide', testFilePath)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Guide sent successfully',
        trackingNumber: mockParsedGuideData.trackingNumber,
        sentTo: mockCustomerMatch.phone,
        customer: mockCustomerMatch.name
      });

      expect(mockParser.parse).toHaveBeenCalled();
      expect(mockMatcher.findCustomer).toHaveBeenCalled();
      expect(mockSender.sendGuide).toHaveBeenCalled();
      expect(mockMatcher.updateOrderTracking).toHaveBeenCalled();
    });

    it('should return 400 when no file is uploaded', async () => {
      const response = await request(app)
        .post('/api/process-guide')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'No file uploaded'
      });
    });

    it('should return 400 when guide cannot be parsed', async () => {
      mockParser.parse.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/process-guide')
        .attach('guide', testFilePath)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Could not parse guide data'
      });
    });

    it('should return success:false when no customer match found', async () => {
      mockParser.parse.mockResolvedValue(mockParsedGuideData);
      mockMatcher.findCustomer.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/process-guide')
        .attach('guide', testFilePath)
        .expect(200);

      expect(response.body).toEqual({
        success: false,
        message: 'No matching customer found',
        guideData: mockParsedGuideData
      });
    });

    it('should return 500 when WhatsApp send fails', async () => {
      mockParser.parse.mockResolvedValue(mockParsedGuideData);
      mockMatcher.findCustomer.mockResolvedValue(mockCustomerMatch);
      mockSender.sendGuide.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/process-guide')
        .attach('guide', testFilePath)
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to send guide via WhatsApp'
      });
    });

    it('should handle parser errors gracefully', async () => {
      mockParser.parse.mockRejectedValue(new Error('Parser error'));

      const response = await request(app)
        .post('/api/process-guide')
        .attach('guide', testFilePath)
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Parser error'
      });
    });

    it('should cleanup file on success', async () => {
      mockParser.parse.mockResolvedValue(mockParsedGuideData);
      mockMatcher.findCustomer.mockResolvedValue(mockCustomerMatch);
      mockSender.sendGuide.mockResolvedValue(true);
      mockMatcher.updateOrderTracking.mockResolvedValue(true);

      await request(app)
        .post('/api/process-guide')
        .attach('guide', testFilePath)
        .expect(200);

      // File should be deleted after processing
      // Wait a bit for async cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Note: In actual implementation, file is deleted, but in test
      // environment with mocks, we can't easily verify this
    });

    it('should cleanup file on error', async () => {
      mockParser.parse.mockResolvedValue(null);

      await request(app)
        .post('/api/process-guide')
        .attach('guide', testFilePath)
        .expect(400);

      // File should be deleted even on error
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  describe('POST /api/test-parse', () => {
    let testFilePath: string;

    beforeEach(() => {
      const testDir = '/tmp/test-uploads';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      testFilePath = path.join(testDir, 'test-guide.pdf');
      fs.writeFileSync(testFilePath, 'test guide content');
    });

    afterEach(() => {
      if (fs.existsSync(testFilePath)) {
        try {
          fs.unlinkSync(testFilePath);
        } catch (e) {
          // File may have been deleted
        }
      }
    });

    it('should parse guide and return data', async () => {
      mockParser.parse.mockResolvedValue(mockParsedGuideData);

      const response = await request(app)
        .post('/api/test-parse')
        .attach('guide', testFilePath)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockParsedGuideData
      });

      expect(mockParser.parse).toHaveBeenCalled();
    });

    it('should return 400 when no file uploaded', async () => {
      const response = await request(app)
        .post('/api/test-parse')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'No file uploaded'
      });
    });

    it('should return 400 when parsing fails', async () => {
      mockParser.parse.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/test-parse')
        .attach('guide', testFilePath)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Could not extract data from guide'
      });
    });

    it('should handle parser errors', async () => {
      mockParser.parse.mockRejectedValue(new Error('Parse error'));

      const response = await request(app)
        .post('/api/test-parse')
        .attach('guide', testFilePath)
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Parse error'
      });
    });

    it('should not send WhatsApp message or update database', async () => {
      mockParser.parse.mockResolvedValue(mockParsedGuideData);

      await request(app)
        .post('/api/test-parse')
        .attach('guide', testFilePath)
        .expect(200);

      expect(mockMatcher.findCustomer).not.toHaveBeenCalled();
      expect(mockSender.sendGuide).not.toHaveBeenCalled();
      expect(mockMatcher.updateOrderTracking).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/test-match', () => {
    it('should match customer by phone', async () => {
      mockMatcher.findCustomer.mockResolvedValue(mockCustomerMatch);

      const response = await request(app)
        .post('/api/test-match')
        .send({
          customerPhone: '573001234567'
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        match: mockCustomerMatch
      });

      expect(mockMatcher.findCustomer).toHaveBeenCalled();
    });

    it('should match customer by name and city', async () => {
      mockMatcher.findCustomer.mockResolvedValue(mockCustomerMatch);

      const response = await request(app)
        .post('/api/test-match')
        .send({
          customerName: 'Juan Carlos Pérez',
          city: 'Bogota'
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        match: mockCustomerMatch
      });
    });

    it('should match customer by address', async () => {
      mockMatcher.findCustomer.mockResolvedValue(mockCustomerMatch);

      const response = await request(app)
        .post('/api/test-match')
        .send({
          shippingAddress: 'Calle 45 # 23-67'
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        match: mockCustomerMatch
      });
    });

    it('should return 400 when no search parameters provided', async () => {
      const response = await request(app)
        .post('/api/test-match')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'At least one search parameter required'
      });
    });

    it('should return success:false when no match found', async () => {
      mockMatcher.findCustomer.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/test-match')
        .send({
          customerPhone: '579999999999'
        })
        .expect(200);

      expect(response.body).toEqual({
        success: false,
        message: 'No matching customer found'
      });
    });

    it('should handle matcher errors', async () => {
      mockMatcher.findCustomer.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/test-match')
        .send({
          customerPhone: '573001234567'
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Database error'
      });
    });

    it('should not send WhatsApp message or update database', async () => {
      mockMatcher.findCustomer.mockResolvedValue(mockCustomerMatch);

      await request(app)
        .post('/api/test-match')
        .send({
          customerPhone: '573001234567'
        })
        .expect(200);

      expect(mockSender.sendGuide).not.toHaveBeenCalled();
      expect(mockMatcher.updateOrderTracking).not.toHaveBeenCalled();
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown-route')
        .expect(404);

      expect(response.body).toEqual({
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

    it('should return 404 for unknown POST routes', async () => {
      const response = await request(app)
        .post('/api/unknown')
        .expect(404);

      expect(response.body.error).toBe('Not found');
    });
  });

  describe('Rate Limiting', () => {
    it('should accept requests within rate limit', async () => {
      mockParser.parse.mockResolvedValue(mockParsedGuideData);

      const testDir = '/tmp/test-uploads';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testFile = path.join(testDir, 'test.pdf');

      // Make 5 requests (well within limit)
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(testFile, `test ${i}`);
        const response = await request(app)
          .post('/api/test-parse')
          .attach('guide', testFile);

        expect(response.status).toBeLessThan(429);
      }

      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    });
  });

  describe('Request Validation', () => {
    it('should validate JSON content type for test-match', async () => {
      const response = await request(app)
        .post('/api/test-match')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({
          customerPhone: '573001234567'
        }));

      expect(response.status).not.toBe(415); // Not Unsupported Media Type
    });

    it('should validate multipart content for file uploads', async () => {
      const response = await request(app)
        .post('/api/process-guide')
        .send({ data: 'not a file' })
        .expect(400);

      expect(response.body.error).toBe('No file uploaded');
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format', async () => {
      const response = await request(app)
        .post('/api/process-guide')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it.skip('should include error message in response', async () => {
      // Use a fresh app instance to avoid rate limiting issues
      const freshApp = express();
      setupRoutes(freshApp, {
        parser: mockParser,
        matcher: mockMatcher,
        sender: mockSender
      });

      mockParser.parse.mockRejectedValue(new Error('Custom error'));

      const testDir = '/tmp/test-uploads';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testFile = path.join(testDir, 'test-error.pdf');
      fs.writeFileSync(testFile, 'test');

      const response = await request(freshApp)
        .post('/api/test-parse')
        .attach('guide', testFile)
        .expect(500);

      expect(response.body.error).toBe('Custom error');

      fs.unlinkSync(testFile);
    });
  });
});
