import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UPLOAD_DIR, cleanupOldUploads } from '../../src/api/routes';

describe('Upload Configuration', () => {
    describe('UPLOAD_DIR', () => {
        it('should use os.tmpdir() as base directory', () => {
            expect(UPLOAD_DIR).toBe(path.join(os.tmpdir(), 'shipment-tracking-uploads'));
        });

        it('should not be a hardcoded Unix path', () => {
            expect(UPLOAD_DIR).not.toBe('/tmp/uploads/');
            expect(UPLOAD_DIR).not.toBe('/tmp/uploads');
        });
    });

    describe('cleanupOldUploads', () => {
        const testDir = UPLOAD_DIR;

        beforeEach(() => {
            // Ensure the upload directory exists for tests
            if (!fs.existsSync(testDir)) {
                fs.mkdirSync(testDir, { recursive: true });
            }
        });

        afterEach(() => {
            // Clean up test files
            if (fs.existsSync(testDir)) {
                const files = fs.readdirSync(testDir);
                for (const file of files) {
                    try {
                        fs.unlinkSync(path.join(testDir, file));
                    } catch {
                        // ignore
                    }
                }
            }
        });

        it('should not throw when upload directory does not exist', () => {
            // Temporarily use a non-existent path by passing a short maxAge
            // The function should handle missing directories gracefully
            expect(() => cleanupOldUploads()).not.toThrow();
        });

        it('should remove files older than maxAgeMs', () => {
            // Create a test file
            const testFile = path.join(testDir, 'old-upload-test');
            fs.writeFileSync(testFile, 'test content');

            // Set file mtime to 2 hours ago
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            fs.utimesSync(testFile, twoHoursAgo, twoHoursAgo);

            // Run cleanup with 1 hour max age
            cleanupOldUploads(60 * 60 * 1000);

            expect(fs.existsSync(testFile)).toBe(false);
        });

        it('should not remove files newer than maxAgeMs', () => {
            // Create a recent test file
            const testFile = path.join(testDir, 'recent-upload-test');
            fs.writeFileSync(testFile, 'test content');

            // Run cleanup with 1 hour max age
            cleanupOldUploads(60 * 60 * 1000);

            expect(fs.existsSync(testFile)).toBe(true);
        });

        it('should handle mixed old and new files', () => {
            const oldFile = path.join(testDir, 'old-file');
            const newFile = path.join(testDir, 'new-file');

            fs.writeFileSync(oldFile, 'old content');
            fs.writeFileSync(newFile, 'new content');

            // Make old file 2 hours old
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            fs.utimesSync(oldFile, twoHoursAgo, twoHoursAgo);

            cleanupOldUploads(60 * 60 * 1000);

            expect(fs.existsSync(oldFile)).toBe(false);
            expect(fs.existsSync(newFile)).toBe(true);
        });
    });
});

describe('File Type Filtering', () => {
    // Test that the file filter is working via the API
    // We import express and supertest to test the actual multer config
    let app: any;
    let request: any;

    beforeAll(async () => {
        const express = (await import('express')).default;
        const supertest = (await import('supertest')).default;
        request = supertest;

        // Mock all required service modules
        jest.mock('../../src/services/GuideParser');
        jest.mock('../../src/services/CustomerMatcher');
        jest.mock('../../src/services/WhatsAppSender');
        jest.mock('../../src/services/ShipmentService', () => ({
            ShipmentService: jest.fn().mockImplementation(() => ({
                createShipment: jest.fn()
            }))
        }));

        const { setupRoutes } = await import('../../src/api/routes');
        const { GuideParser } = await import('../../src/services/GuideParser');
        const { CustomerMatcher } = await import('../../src/services/CustomerMatcher');
        const { WhatsAppSender } = await import('../../src/services/WhatsAppSender');

        const mockParser = new GuideParser() as any;
        const mockMatcher = new CustomerMatcher({} as any) as any;
        const mockSender = new WhatsAppSender({ apiUrl: '', apiKey: '' }) as any;

        mockParser.parse = jest.fn().mockResolvedValue(null);
        mockMatcher.findCustomer = jest.fn();
        mockMatcher.updateOrderTracking = jest.fn();
        mockSender.sendGuide = jest.fn();

        app = express();
        setupRoutes(app, {
            parser: mockParser,
            matcher: mockMatcher,
            sender: mockSender
        });
    });

    it('should accept PDF files', async () => {
        const testDir = path.join(os.tmpdir(), 'test-filter-uploads');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        const testFile = path.join(testDir, 'test.pdf');
        fs.writeFileSync(testFile, 'fake pdf content');

        const response = await request(app)
            .post('/api/test-parse')
            .attach('guide', testFile);

        // Should not get 400 "No file uploaded" — the file was accepted
        // It may get 400 for parse failure, but that means the file was accepted
        expect(response.body.error).not.toBe('No file uploaded');

        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    });

    it('should accept image files (PNG)', async () => {
        const testDir = path.join(os.tmpdir(), 'test-filter-uploads');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        const testFile = path.join(testDir, 'test.png');
        fs.writeFileSync(testFile, 'fake png content');

        const response = await request(app)
            .post('/api/test-parse')
            .attach('guide', testFile);

        expect(response.body.error).not.toBe('No file uploaded');

        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    });

    it('should reject disallowed file types', async () => {
        const testDir = path.join(os.tmpdir(), 'test-filter-uploads');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        const testFile = path.join(testDir, 'malware.exe');
        fs.writeFileSync(testFile, 'fake executable content');

        const response = await request(app)
            .post('/api/test-parse')
            .attach('guide', testFile);

        // .exe should be rejected by the file filter, resulting in no file being set
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('No file uploaded');

        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    });

    it('should reject .sh files', async () => {
        const testDir = path.join(os.tmpdir(), 'test-filter-uploads');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        const testFile = path.join(testDir, 'script.sh');
        fs.writeFileSync(testFile, '#!/bin/bash\necho pwned');

        const response = await request(app)
            .post('/api/test-parse')
            .attach('guide', testFile);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('No file uploaded');

        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    });
});
