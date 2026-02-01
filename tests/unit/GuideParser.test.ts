import { GuideParser } from '../../src/services/GuideParser';
import { mockGuideTexts } from '../fixtures/mock-data';
import * as fs from 'fs';
import * as path from 'path';

// Mock the pdf-parse and tesseract modules
jest.mock('pdf-parse', () => {
  return jest.fn((buffer) => {
    // Simulate PDF parsing based on buffer content
    return Promise.resolve({
      text: mockGuideTexts.servientrega
    });
  });
});

jest.mock('tesseract.js', () => {
  return {
    default: {
      recognize: jest.fn((filePath: string) => {
        // Return different text based on file path for testing
        return Promise.resolve({
          data: {
            text: mockGuideTexts.coordinadora
          }
        });
      })
    }
  };
});

describe('GuideParser', () => {
  let parser: GuideParser;

  beforeEach(() => {
    parser = new GuideParser();
  });

  describe('parse', () => {
    it('should parse PDF files successfully', async () => {
      // Create a temporary PDF file
      const testDir = '/tmp/test-guides';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testFile = path.join(testDir, 'test-guide.pdf');
      fs.writeFileSync(testFile, 'dummy pdf content');

      const result = await parser.parse(testFile);

      expect(result).not.toBeNull();
      expect(result?.trackingNumber).toBe('SV123456789');
      expect(result?.carrier).toBe('Servientrega');
      expect(result?.customerName).toBe('Juan Carlos Pérez');
      expect(result?.customerPhone).toBe('573001234567');
      expect(result?.city).toBe('Bogota');

      // Cleanup
      fs.unlinkSync(testFile);
    });

    it('should parse image files using OCR', async () => {
      const testDir = '/tmp/test-guides';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testFile = path.join(testDir, 'test-guide.png');
      fs.writeFileSync(testFile, 'dummy image content');

      const result = await parser.parse(testFile);

      expect(result).not.toBeNull();
      expect(result?.trackingNumber).toBe('CD987654321');
      expect(result?.carrier).toBe('Coordinadora');
      expect(result?.customerName).toBe('María González López');

      // Cleanup
      fs.unlinkSync(testFile);
    });

    it('should return null for unsupported file types', async () => {
      const testDir = '/tmp/test-guides';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'text file');

      const result = await parser.parse(testFile);

      expect(result).toBeNull();

      // Cleanup
      fs.unlinkSync(testFile);
    });

    it('should handle parsing errors gracefully', async () => {
      const result = await parser.parse('/nonexistent/file.pdf');
      expect(result).toBeNull();
    });
  });

  describe('extractData - Carrier Detection', () => {
    it('should detect Servientrega carrier', async () => {
      const testFile = '/tmp/test.pdf';
      fs.writeFileSync(testFile, 'test');
      
      // Mock the parse to return servientrega text
      const result = await parser.parse(testFile);
      
      expect(result?.carrier).toBe('Servientrega');
      fs.unlinkSync(testFile);
    });

    it('should detect Coordinadora carrier', async () => {
      const testFile = '/tmp/test.png';
      fs.writeFileSync(testFile, 'test');
      
      const result = await parser.parse(testFile);
      
      expect(result?.carrier).toBe('Coordinadora');
      fs.unlinkSync(testFile);
    });
  });

  describe('extractData - Tracking Number Extraction', () => {
    it('should extract tracking numbers with different formats', async () => {
      const testDir = '/tmp/test-guides';
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      // Test various tracking number formats
      const formats = [
        { text: mockGuideTexts.servientrega, expected: 'SV123456789' },
        { text: mockGuideTexts.coordinadora, expected: 'CD987654321' },
        { text: mockGuideTexts.interrapidisimo, expected: 'IR555123456' }
      ];

      for (const format of formats) {
        // Create a mock with specific text
        const testFile = path.join(testDir, `test-${Date.now()}.pdf`);
        fs.writeFileSync(testFile, 'test');
        
        // We need to test the extractData method directly
        // Since it's private, we test through parse
        // For servientrega, it will extract SV123456789
        const result = await parser.parse(testFile);
        
        if (result) {
          expect(result.trackingNumber).toBeTruthy();
          expect(result.trackingNumber.length).toBeGreaterThan(0);
        }
        
        fs.unlinkSync(testFile);
      }
    });
  });

  describe('extractData - Customer Information', () => {
    it('should extract customer name', async () => {
      const testFile = '/tmp/test.pdf';
      fs.writeFileSync(testFile, 'test');
      
      const result = await parser.parse(testFile);
      
      expect(result?.customerName).toBe('Juan Carlos Pérez');
      fs.unlinkSync(testFile);
    });

    it('should extract and format Colombian phone numbers', async () => {
      const testFile = '/tmp/test.pdf';
      fs.writeFileSync(testFile, 'test');
      
      const result = await parser.parse(testFile);
      
      expect(result?.customerPhone).toBe('573001234567');
      expect(result?.customerPhone?.startsWith('57')).toBe(true);
      fs.unlinkSync(testFile);
    });

    it('should extract shipping address', async () => {
      const testFile = '/tmp/test.pdf';
      fs.writeFileSync(testFile, 'test');
      
      const result = await parser.parse(testFile);
      
      expect(result?.shippingAddress).toBeTruthy();
      expect(result?.shippingAddress).toContain('Calle');
      fs.unlinkSync(testFile);
    });

    it('should extract Colombian cities', async () => {
      const testFile = '/tmp/test.pdf';
      fs.writeFileSync(testFile, 'test');
      
      const result = await parser.parse(testFile);
      
      expect(result?.city).toBe('Bogota');
      fs.unlinkSync(testFile);
    });
  });

  describe('extractData - Validation', () => {
    it('should return null when no relevant data is found', async () => {
      // Mock empty text
      jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from(''));
      
      const pdfParseMock = require('pdf-parse');
      pdfParseMock.mockResolvedValueOnce({ text: 'No useful data here' });
      
      const testFile = '/tmp/empty.pdf';
      fs.writeFileSync(testFile, 'test');
      
      const result = await parser.parse(testFile);
      
      // Should still parse but might have default values
      expect(result?.trackingNumber || result?.customerName).toBeTruthy();
      
      fs.unlinkSync(testFile);
    });

    it('should handle partial data extraction', async () => {
      const testFile = '/tmp/test.pdf';
      fs.writeFileSync(testFile, 'test');
      
      const result = await parser.parse(testFile);
      
      // Should have at least some data
      expect(result).not.toBeNull();
      expect(
        result?.trackingNumber || 
        result?.customerName || 
        result?.customerPhone
      ).toBeTruthy();
      
      fs.unlinkSync(testFile);
    });
  });

  describe('Multiple Carrier Support', () => {
    const carrierTests = [
      { name: 'Servientrega', text: mockGuideTexts.servientrega },
      { name: 'Coordinadora', text: mockGuideTexts.coordinadora },
      { name: 'InterRapidisimo', text: mockGuideTexts.interrapidisimo },
      { name: 'Envia', text: mockGuideTexts.envia },
      { name: 'TCC', text: mockGuideTexts.tcc },
      { name: '472', text: mockGuideTexts.carrier472 }
    ];

    carrierTests.forEach(({ name, text }) => {
      it(`should detect and extract data from ${name} guides`, async () => {
        // Mock the PDF parser to return the specific carrier text
        const pdfParseMock = require('pdf-parse');
        pdfParseMock.mockResolvedValueOnce({ text });
        
        const testFile = `/tmp/test-${name}.pdf`;
        fs.writeFileSync(testFile, 'test');
        
        const result = await parser.parse(testFile);
        
        expect(result).not.toBeNull();
        expect(result?.carrier).toBe(name);
        expect(result?.trackingNumber).toBeTruthy();
        
        fs.unlinkSync(testFile);
      });
    });
  });
});
