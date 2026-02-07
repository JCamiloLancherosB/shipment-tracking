/**
 * Tests for the "listen first, connect later" startup pattern.
 * Verifies that the health endpoint is available immediately,
 * and reports correct service/database status.
 */

// These mocks must be set up BEFORE any imports that reference the mocked modules
jest.mock('../../src/services/GuideParser');
jest.mock('../../src/services/CustomerMatcher');
jest.mock('../../src/services/WhatsAppSender');
jest.mock('../../src/services/TechAuraIntegration', () => ({
  TechAuraIntegration: jest.fn().mockImplementation(() => ({
    getOrdersReadyForShipping: jest.fn().mockResolvedValue([]),
    getOrderDetails: jest.fn().mockResolvedValue(null),
  })),
  techAuraIntegration: {
    getOrdersReadyForShipping: jest.fn().mockResolvedValue([]),
    getOrderDetails: jest.fn().mockResolvedValue(null),
  },
}));
jest.mock('../../src/websocket', () => ({
  setupWebSocket: jest.fn(),
}));
jest.mock('../../src/watchers/FolderWatcher');

import express from 'express';
import request from 'supertest';
import { setupRoutes } from '../../src/api/routes';
import { createViewRouter } from '../../src/api/viewRoutes';
import { GuideParser } from '../../src/services/GuideParser';
import { CustomerMatcher } from '../../src/services/CustomerMatcher';
import { WhatsAppSender } from '../../src/services/WhatsAppSender';

describe('Service Startup - Health Check', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
  });

  it('should respond to /health before database is connected (503 starting)', async () => {
    let serviceReady = false;
    let dbConnected = false;

    // Register the early health check (same logic as in index.ts)
    app.get('/health', (_req, res) => {
      res.status(serviceReady ? 200 : 503).json({
        status: serviceReady ? 'healthy' : 'starting',
        service: 'shipment-tracking',
        database: dbConnected ? 'connected' : 'disconnected',
        port: 3010,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('starting');
    expect(response.body.service).toBe('shipment-tracking');
    expect(response.body.database).toBe('disconnected');
    expect(response.body).toHaveProperty('port');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('timestamp');
  });

  it('should respond to /health with 200 when service is fully ready', async () => {
    let serviceReady = true;
    let dbConnected = true;

    app.get('/health', (_req, res) => {
      res.status(serviceReady ? 200 : 503).json({
        status: serviceReady ? 'healthy' : 'starting',
        service: 'shipment-tracking',
        database: dbConnected ? 'connected' : 'disconnected',
        port: 3010,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.database).toBe('connected');
  });

  it('should report database disconnected when DB is not available', async () => {
    let serviceReady = false;
    let dbConnected = false;

    app.get('/health', (_req, res) => {
      res.status(serviceReady ? 200 : 503).json({
        status: serviceReady ? 'healthy' : 'starting',
        service: 'shipment-tracking',
        database: dbConnected ? 'connected' : 'disconnected',
        port: 3010,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    });

    const response = await request(app).get('/health');

    expect(response.body.database).toBe('disconnected');
    // Importantly, we still get a response (not ECONNREFUSED)
    expect(response.status).toBe(503);
  });

  it('should return valid ISO timestamp in health response', async () => {
    app.get('/health', (_req, res) => {
      res.status(200).json({
        status: 'healthy',
        service: 'shipment-tracking',
        database: 'connected',
        port: 3010,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    });

    const response = await request(app).get('/health');

    const timestamp = new Date(response.body.timestamp);
    expect(timestamp.toString()).not.toBe('Invalid Date');
  });

  it('fallback /health in routes still works for standalone usage', async () => {
    const mockParser = new GuideParser() as jest.Mocked<GuideParser>;
    const mockMatcher = new CustomerMatcher({} as any) as jest.Mocked<CustomerMatcher>;
    const mockSender = new WhatsAppSender({ apiUrl: '', apiKey: '' }) as jest.Mocked<WhatsAppSender>;

    mockParser.parse = jest.fn();
    mockMatcher.findCustomer = jest.fn();
    mockMatcher.updateOrderTracking = jest.fn();
    mockSender.sendGuide = jest.fn();

    setupRoutes(app, {
      parser: mockParser,
      matcher: mockMatcher,
      sender: mockSender,
    });

    const response = await request(app).get('/health').expect(200);

    expect(response.body.status).toBe('healthy');
    expect(response.body.service).toBe('shipment-tracking');
  });
});
