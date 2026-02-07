jest.mock('../../src/services/GuideParser');
jest.mock('../../src/services/CustomerMatcher');
jest.mock('../../src/services/WhatsAppSender');
jest.mock('../../src/services/ShipmentService', () => ({
  ShipmentService: jest.fn().mockImplementation(() => ({
    createShipment: jest.fn()
  }))
}));

import express from 'express';
import request from 'supertest';
import { setupRoutes } from '../../src/api/routes';
import { GuideParser } from '../../src/services/GuideParser';
import { WhatsAppSender } from '../../src/services/WhatsAppSender';
import { ICustomerMatcher } from '../../src/types';
import { mockParsedGuideData } from '../fixtures/mock-data';
import * as fs from 'fs';
import * as path from 'path';

describe('MatcherProxy and DB-not-connected handling', () => {
  let app: express.Application;
  let mockParser: jest.Mocked<GuideParser>;
  let mockSender: jest.Mocked<WhatsAppSender>;

  describe('when matcher throws "Database not connected"', () => {
    let dbNotConnectedMatcher: ICustomerMatcher;

    beforeEach(() => {
      mockParser = new GuideParser() as jest.Mocked<GuideParser>;
      mockSender = new WhatsAppSender({ apiUrl: '', apiKey: '' }) as jest.Mocked<WhatsAppSender>;

      mockParser.parse = jest.fn();
      mockSender.sendGuide = jest.fn();

      // Simulate a matcher proxy where DB is not connected
      dbNotConnectedMatcher = {
        findCustomer: jest.fn().mockRejectedValue(new Error('Database not connected')),
        updateOrderTracking: jest.fn().mockRejectedValue(new Error('Database not connected')),
      };

      app = express();
      setupRoutes(app, {
        parser: mockParser,
        matcher: dbNotConnectedMatcher,
        sender: mockSender,
      });
    });

    it('should return 503 on POST /api/test-match when DB is not connected', async () => {
      const response = await request(app)
        .post('/api/test-match')
        .send({ customerPhone: '573001234567' })
        .expect(503);

      expect(response.body).toEqual({
        success: false,
        error: 'Database not connected yet',
      });
    });

    it('should return 503 on POST /api/process-guide when DB is not connected', async () => {
      const testDir = '/tmp/test-uploads-proxy';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testFile = path.join(testDir, 'test-guide.pdf');
      fs.writeFileSync(testFile, 'test guide content');

      mockParser.parse.mockResolvedValue(mockParsedGuideData);

      const response = await request(app)
        .post('/api/process-guide')
        .attach('guide', testFile)
        .expect(503);

      expect(response.body).toEqual({
        success: false,
        error: 'Database not connected yet',
      });

      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    });
  });

  describe('when matcher is connected', () => {
    let connectedMatcher: ICustomerMatcher;

    beforeEach(() => {
      mockParser = new GuideParser() as jest.Mocked<GuideParser>;
      mockSender = new WhatsAppSender({ apiUrl: '', apiKey: '' }) as jest.Mocked<WhatsAppSender>;

      mockParser.parse = jest.fn();
      mockSender.sendGuide = jest.fn();

      connectedMatcher = {
        findCustomer: jest.fn().mockResolvedValue(null),
        updateOrderTracking: jest.fn().mockResolvedValue(true),
      };

      app = express();
      setupRoutes(app, {
        parser: mockParser,
        matcher: connectedMatcher,
        sender: mockSender,
      });
    });

    it('should process POST /api/test-match normally when DB is connected', async () => {
      const response = await request(app)
        .post('/api/test-match')
        .send({ customerPhone: '573001234567' })
        .expect(200);

      expect(response.body).toEqual({
        success: false,
        message: 'No matching customer found',
      });
    });
  });
});
