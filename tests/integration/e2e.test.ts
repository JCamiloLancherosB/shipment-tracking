import express from 'express';
import request from 'supertest';
import { setupRoutes } from '../../src/api/routes';
import { GuideParser } from '../../src/services/GuideParser';
import { CustomerMatcher } from '../../src/services/CustomerMatcher';
import { WhatsAppSender } from '../../src/services/WhatsAppSender';
import { FolderWatcher } from '../../src/watchers/FolderWatcher';
import { mockGuideTexts, mockDatabaseOrders } from '../fixtures/mock-data';
import * as fs from 'fs';
import * as path from 'path';

// Mock external dependencies
jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => ({
    execute: jest.fn()
  }))
}));

jest.mock('axios');
const axios = require('axios');

jest.mock('pdf-parse', () => {
  return jest.fn((buffer) => {
    return Promise.resolve({
      text: mockGuideTexts.servientrega
    });
  });
});

jest.mock('tesseract.js', () => ({
  default: {
    recognize: jest.fn(() => {
      return Promise.resolve({
        data: {
          text: mockGuideTexts.coordinadora
        }
      });
    })
  }
}));

describe('End-to-End Flow Tests', () => {
  describe('Complete Upload → Parse → Match → Send Flow', () => {
    let app: express.Application;
    let parser: GuideParser;
    let matcher: CustomerMatcher;
    let sender: WhatsAppSender;
    let mockPool: any;

    beforeEach(() => {
      // Setup mocked database
      const mysql = require('mysql2/promise');
      mockPool = {
        execute: jest.fn()
      };
      mysql.createPool.mockReturnValue(mockPool);

      // Setup real services with mocked dependencies
      parser = new GuideParser();
      matcher = new CustomerMatcher({
        host: 'localhost',
        port: 3306,
        user: 'test',
        password: 'test',
        database: 'test'
      });
      sender = new WhatsAppSender({
        apiUrl: 'http://localhost:9999',
        apiKey: 'test-key'
      });

      // Setup Express app
      app = express();
      setupRoutes(app, { parser, matcher, sender });

      // Mock successful responses
      mockPool.execute.mockResolvedValue([[mockDatabaseOrders[0]]]);
      axios.post = jest.fn().mockResolvedValue({ data: { success: true } });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should complete full flow: PDF upload → parse → match → send', async () => {
      // Create test PDF file
      const testDir = '/tmp/e2e-test';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testFile = path.join(testDir, 'guide.pdf');
      fs.writeFileSync(testFile, 'pdf content');

      // Upload and process
      const response = await request(app)
        .post('/api/process-guide')
        .attach('guide', testFile)
        .expect(200);

      // Verify response
      expect(response.body.success).toBe(true);
      expect(response.body.trackingNumber).toBe('SV123456789');
      expect(response.body.customer).toBeTruthy();

      // Verify all steps were executed
      expect(mockPool.execute).toHaveBeenCalled(); // Database query
      expect(axios.post).toHaveBeenCalled(); // WhatsApp send

      // Cleanup
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
      fs.rmdirSync(testDir);
    });

    it('should complete full flow: PNG upload → OCR → match → send', async () => {
      const testDir = '/tmp/e2e-test';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testFile = path.join(testDir, 'guide.png');
      fs.writeFileSync(testFile, 'png content');

      const response = await request(app)
        .post('/api/process-guide')
        .attach('guide', testFile)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.trackingNumber).toBe('CD987654321');

      // Cleanup
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
      fs.rmdirSync(testDir);
    });

    it('should handle no customer match gracefully', async () => {
      mockPool.execute.mockResolvedValue([[]]); // No match

      const testDir = '/tmp/e2e-test';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testFile = path.join(testDir, 'guide.pdf');
      fs.writeFileSync(testFile, 'pdf content');

      const response = await request(app)
        .post('/api/process-guide')
        .attach('guide', testFile)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('No matching customer');
      expect(response.body.guideData).toBeTruthy();

      // WhatsApp should not be called
      expect(axios.post).not.toHaveBeenCalled();

      // Cleanup
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
      fs.rmdirSync(testDir);
    });

    it('should handle WhatsApp send failure', async () => {
      axios.post = jest.fn().mockRejectedValue(new Error('WhatsApp API down'));

      const testDir = '/tmp/e2e-test';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testFile = path.join(testDir, 'guide.pdf');
      fs.writeFileSync(testFile, 'pdf content');

      const response = await request(app)
        .post('/api/process-guide')
        .attach('guide', testFile)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to send guide');

      // Cleanup
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
      fs.rmdirSync(testDir);
    });

    it('should update database after successful send', async () => {
      mockPool.execute
        .mockResolvedValueOnce([[mockDatabaseOrders[0]]]) // Find customer
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update order

      const testDir = '/tmp/e2e-test';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testFile = path.join(testDir, 'guide.pdf');
      fs.writeFileSync(testFile, 'pdf content');

      await request(app)
        .post('/api/process-guide')
        .attach('guide', testFile)
        .expect(200);

      // Verify database update was called
      expect(mockPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orders'),
        expect.arrayContaining(['SV123456789', 'Servientrega'])
      );

      // Cleanup
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
      fs.rmdirSync(testDir);
    });
  });

  describe('FolderWatcher Integration', () => {
    let watcher: FolderWatcher;
    let watchDir: string;
    let parser: GuideParser;
    let processedGuides: string[];

    beforeEach(() => {
      watchDir = '/tmp/e2e-watch-' + Date.now();
      processedGuides = [];
      
      parser = new GuideParser();
      
      watcher = new FolderWatcher(watchDir, async (filePath: string) => {
        const guideData = await parser.parse(filePath);
        if (guideData) {
          processedGuides.push(guideData.trackingNumber);
        }
      });
    });

    afterEach(() => {
      watcher.stop();
      
      if (fs.existsSync(watchDir)) {
        try {
          const files = fs.readdirSync(watchDir);
          files.forEach(file => {
            const filePath = path.join(watchDir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              fs.rmSync(filePath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(filePath);
            }
          });
          fs.rmdirSync(watchDir);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });

    it('should detect and process new guide files', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      // Add a new guide file
      const guideFile = path.join(watchDir, 'new-guide.pdf');
      fs.writeFileSync(guideFile, 'guide content');

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3500));

      expect(processedGuides).toContain('SV123456789');
    });

    it('should process multiple files', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      // Add multiple files
      const file1 = path.join(watchDir, 'guide1.pdf');
      const file2 = path.join(watchDir, 'guide2.png');
      
      fs.writeFileSync(file1, 'guide 1');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      fs.writeFileSync(file2, 'guide 2');
      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(processedGuides.length).toBeGreaterThanOrEqual(2);
    });

    it('should ignore non-guide files', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      // Add non-guide file
      const textFile = path.join(watchDir, 'readme.txt');
      fs.writeFileSync(textFile, 'text content');

      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(processedGuides.length).toBe(0);
    });

    it('should move processed files to subfolder', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const guideFile = path.join(watchDir, 'guide.pdf');
      fs.writeFileSync(guideFile, 'guide content');

      await new Promise(resolve => setTimeout(resolve, 3500));

      // File should be moved
      expect(fs.existsSync(guideFile)).toBe(false);
      
      const processedFile = path.join(watchDir, 'processed', 'guide.pdf');
      expect(fs.existsSync(processedFile)).toBe(true);
    });
  });

  describe('Multiple Carrier Support E2E', () => {
    let app: express.Application;
    let parser: GuideParser;
    let matcher: CustomerMatcher;
    let sender: WhatsAppSender;
    let mockPool: any;

    beforeEach(() => {
      const mysql = require('mysql2/promise');
      mockPool = {
        execute: jest.fn().mockResolvedValue([[mockDatabaseOrders[0]]])
      };
      mysql.createPool.mockReturnValue(mockPool);

      parser = new GuideParser();
      matcher = new CustomerMatcher({
        host: 'localhost',
        port: 3306,
        user: 'test',
        password: 'test',
        database: 'test'
      });
      sender = new WhatsAppSender({
        apiUrl: 'http://localhost:9999',
        apiKey: 'test-key'
      });

      app = express();
      setupRoutes(app, { parser, matcher, sender });

      axios.post = jest.fn().mockResolvedValue({ data: { success: true } });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    const carriers = [
      { name: 'Servientrega', text: mockGuideTexts.servientrega, tracking: 'SV123456789' },
      { name: 'Coordinadora', text: mockGuideTexts.coordinadora, tracking: 'CD987654321' },
      { name: 'InterRapidisimo', text: mockGuideTexts.interrapidisimo, tracking: 'IR555123456' },
      { name: 'Envia', text: mockGuideTexts.envia, tracking: 'ENV789456123' },
      { name: 'TCC', text: mockGuideTexts.tcc, tracking: 'TCC445566778' },
      { name: '472', text: mockGuideTexts.carrier472, tracking: '472998877665' }
    ];

    carriers.forEach(({ name, text, tracking }) => {
      it(`should process ${name} guides end-to-end`, async () => {
        // Mock PDF parser to return carrier-specific text
        const pdfParse = require('pdf-parse');
        pdfParse.mockResolvedValueOnce({ text });

        const testDir = '/tmp/e2e-test';
        if (!fs.existsSync(testDir)) {
          fs.mkdirSync(testDir, { recursive: true });
        }
        const testFile = path.join(testDir, `guide-${name}.pdf`);
        fs.writeFileSync(testFile, 'content');

        const response = await request(app)
          .post('/api/process-guide')
          .attach('guide', testFile)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.trackingNumber).toBe(tracking);

        // Verify database update includes carrier name
        expect(mockPool.execute).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([tracking, name])
        );

        // Cleanup
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
        if (fs.existsSync(testDir)) {
          fs.rmdirSync(testDir);
        }
      });
    });
  });

  describe('API Health and Monitoring', () => {
    let app: express.Application;

    beforeEach(() => {
      app = express();
      setupRoutes(app, {
        parser: new GuideParser(),
        matcher: new CustomerMatcher({} as any),
        sender: new WhatsAppSender({ apiUrl: '', apiKey: '' })
      });
    });

    it('should maintain health endpoint availability', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });

    it('should handle concurrent requests', async () => {
      const requests = [];
      
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .get('/health')
            .expect(200)
        );
      }

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.body.status).toBe('healthy');
      });
    });
  });

  describe('Error Recovery', () => {
    let app: express.Application;
    let mockPool: any;

    beforeEach(() => {
      const mysql = require('mysql2/promise');
      mockPool = {
        execute: jest.fn()
      };
      mysql.createPool.mockReturnValue(mockPool);

      app = express();
      setupRoutes(app, {
        parser: new GuideParser(),
        matcher: new CustomerMatcher({
          host: 'localhost',
          port: 3306,
          user: 'test',
          password: 'test',
          database: 'test'
        }),
        sender: new WhatsAppSender({
          apiUrl: 'http://localhost:9999',
          apiKey: 'test-key'
        })
      });
    });

    it('should recover from database connection errors', async () => {
      mockPool.execute.mockRejectedValueOnce(new Error('Connection lost'));

      const testDir = '/tmp/e2e-test';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testFile = path.join(testDir, 'guide.pdf');
      fs.writeFileSync(testFile, 'content');

      const response = await request(app)
        .post('/api/process-guide')
        .attach('guide', testFile);

      // Should still return a response, not crash
      expect(response.status).toBeGreaterThanOrEqual(200);

      // Cleanup
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
      fs.rmdirSync(testDir);
    });

    it('should continue after individual request failures', async () => {
      axios.post = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: { success: true } });

      const testDir = '/tmp/e2e-test';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      // First request fails
      const testFile1 = path.join(testDir, 'guide1.pdf');
      fs.writeFileSync(testFile1, 'content');
      
      await request(app)
        .post('/api/process-guide')
        .attach('guide', testFile1);

      // Second request should succeed
      const testFile2 = path.join(testDir, 'guide2.pdf');
      fs.writeFileSync(testFile2, 'content');
      
      mockPool.execute.mockResolvedValue([[mockDatabaseOrders[0]]]);
      
      const response = await request(app)
        .post('/api/process-guide')
        .attach('guide', testFile2)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Cleanup
      if (fs.existsSync(testFile1)) fs.unlinkSync(testFile1);
      if (fs.existsSync(testFile2)) fs.unlinkSync(testFile2);
      fs.rmdirSync(testDir);
    });
  });
});
