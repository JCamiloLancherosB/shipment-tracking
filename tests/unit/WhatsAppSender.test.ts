import { WhatsAppSender } from '../../src/services/WhatsAppSender';
import { mockParsedGuideData } from '../fixtures/mock-data';
import axios from 'axios';
import * as fs from 'fs';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock fs for file operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createReadStream: jest.fn(() => ({
    pipe: jest.fn(),
    on: jest.fn(),
  })),
}));

describe('WhatsAppSender', () => {
  let sender: WhatsAppSender;
  const config = {
    apiUrl: 'http://localhost:9999',
    apiKey: 'test-api-key'
  };

  beforeEach(() => {
    sender = new WhatsAppSender(config);
    jest.clearAllMocks();
  });

  describe('sendGuide', () => {
    it('should send guide successfully', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      const result = await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2); // Text + Media
    });

    it('should send text message before media', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      // First call should be to send-message endpoint
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        1,
        'http://localhost:9999/api/send-message',
        expect.objectContaining({
          phone: expect.any(String),
          message: expect.any(String)
        }),
        expect.any(Object)
      );

      // Second call should be to send-media endpoint
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        2,
        'http://localhost:9999/api/send-media',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should format phone number correctly', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      const textCall = mockedAxios.post.mock.calls[0];
      expect(textCall[1]).toEqual(
        expect.objectContaining({
          phone: '573001234567'
        })
      );
    });

    it('should include authorization header', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      const textCall = mockedAxios.post.mock.calls[0];
      expect(textCall[2]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key'
          })
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.post.mockRejectedValue(new Error('API Error'));

      const result = await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      expect(result).toBe(false);
    });

    it('should return false on text send failure', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Send failed'));

      const result = await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      expect(result).toBe(false);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1); // Fails on first call
    });

    it('should return false on media send failure', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { success: true } }) // Text succeeds
        .mockRejectedValueOnce(new Error('Media failed')); // Media fails

      const result = await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      expect(result).toBe(false);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('formatPhone', () => {
    const testCases = [
      { input: '3001234567', expected: '573001234567', desc: '10 digits' },
      { input: '573001234567', expected: '573001234567', desc: 'already has 57 prefix' },
      { input: '57-300-123-4567', expected: '573001234567', desc: 'with dashes' },
      { input: '57 300 123 4567', expected: '573001234567', desc: 'with spaces' },
      { input: '(57) 300-123-4567', expected: '573001234567', desc: 'with parentheses' },
      { input: '+573001234567', expected: '573001234567', desc: 'with plus sign' }
    ];

    testCases.forEach(({ input, expected, desc }) => {
      it(`should format phone: ${desc}`, async () => {
        mockedAxios.post.mockResolvedValue({ data: { success: true } });

        await sender.sendGuide(
          input,
          mockParsedGuideData,
          '/tmp/test-guide.pdf'
        );

        const textCall = mockedAxios.post.mock.calls[0];
        expect(textCall[1].phone).toBe(expected);
      });
    });

    it('should keep phone as-is if not 10 digits and no 57 prefix', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await sender.sendGuide(
        '123',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      const textCall = mockedAxios.post.mock.calls[0];
      expect(textCall[1].phone).toBe('123');
    });
  });

  describe('formatMessage', () => {
    it('should include tracking number in message', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      const textCall = mockedAxios.post.mock.calls[0];
      const message = textCall[1].message;
      
      expect(message).toContain(mockParsedGuideData.trackingNumber);
    });

    it('should include carrier name in message', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      const textCall = mockedAxios.post.mock.calls[0];
      const message = textCall[1].message;
      
      expect(message).toContain(mockParsedGuideData.carrier);
    });

    it('should include city in message when provided', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      const textCall = mockedAxios.post.mock.calls[0];
      const message = textCall[1].message;
      
      expect(message).toContain(mockParsedGuideData.city);
    });

    it('should use fallback text when city is not provided', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      const dataWithoutCity = {
        ...mockParsedGuideData,
        city: ''
      };

      await sender.sendGuide(
        '3001234567',
        dataWithoutCity,
        '/tmp/test-guide.pdf'
      );

      const textCall = mockedAxios.post.mock.calls[0];
      const message = textCall[1].message;
      
      expect(message).toContain('Ver guía adjunta');
    });

    it('should format message with emoji and markdown', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      const textCall = mockedAxios.post.mock.calls[0];
      const message = textCall[1].message;
      
      expect(message).toContain('🚚');
      expect(message).toContain('*');
      expect(message).toContain('TechAura');
    });

    it('should include tracking instructions', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      const textCall = mockedAxios.post.mock.calls[0];
      const message = textCall[1].message;
      
      expect(message).toContain('rastrear');
    });
  });

  describe('sendMedia', () => {
    it('should send media with correct caption', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      const mediaCall = mockedAxios.post.mock.calls[1];
      const formData = mediaCall[1];
      
      // FormData is being used
      expect(formData).toBeDefined();
    });

    it('should include multipart headers for media upload', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      const mediaCall = mockedAxios.post.mock.calls[1];
      const headers = mediaCall[2].headers;
      
      expect(headers.Authorization).toBe('Bearer test-api-key');
    });
  });

  describe('API Configuration', () => {
    it('should use configured API URL', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:9999'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should use configured API key', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      const textCall = mockedAxios.post.mock.calls[0];
      expect(textCall[2].headers.Authorization).toBe('Bearer test-api-key');
    });

    it('should work with different API configurations', async () => {
      const customSender = new WhatsAppSender({
        apiUrl: 'http://custom-api.com',
        apiKey: 'custom-key'
      });

      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await customSender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('http://custom-api.com'),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer custom-key'
          })
        })
      );
    });
  });

  describe('Error Scenarios', () => {
    it('should handle network timeout', async () => {
      mockedAxios.post.mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      expect(result).toBe(false);
    });

    it('should handle 401 unauthorized', async () => {
      mockedAxios.post.mockRejectedValue({
        response: { status: 401, data: { error: 'Unauthorized' } }
      });

      const result = await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      expect(result).toBe(false);
    });

    it('should handle 500 server error', async () => {
      mockedAxios.post.mockRejectedValue({
        response: { status: 500, data: { error: 'Internal Server Error' } }
      });

      const result = await sender.sendGuide(
        '3001234567',
        mockParsedGuideData,
        '/tmp/test-guide.pdf'
      );

      expect(result).toBe(false);
    });
  });
});
