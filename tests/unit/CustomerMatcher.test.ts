import { CustomerMatcher } from '../../src/services/CustomerMatcher';
import { ShippingGuideData } from '../../src/types';
import { mockDatabaseOrders, mockParsedGuideData } from '../fixtures/mock-data';

// Mock mysql2/promise
jest.mock('mysql2/promise', () => {
  return {
    createPool: jest.fn(() => ({
      execute: jest.fn(),
    })),
  };
});

describe('CustomerMatcher', () => {
  let matcher: CustomerMatcher;
  let mockPool: any;

  beforeEach(() => {
    const mysql = require('mysql2/promise');
    mockPool = {
      execute: jest.fn(),
    };
    mysql.createPool.mockReturnValue(mockPool);

    matcher = new CustomerMatcher({
      host: 'localhost',
      port: 3306,
      user: 'test',
      password: 'test',
      database: 'test'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findCustomer', () => {
    describe('Phone Number Matching (Highest Confidence)', () => {
      it('should match customer by phone number with 100% confidence', async () => {
        const guideData: ShippingGuideData = {
          ...mockParsedGuideData,
          customerPhone: '573001234567'
        };

        mockPool.execute.mockResolvedValueOnce([[mockDatabaseOrders[0]]]);

        const result = await matcher.findCustomer(guideData);

        expect(result).not.toBeNull();
        expect(result?.confidence).toBe(100);
        expect(result?.matchedBy).toBe('phone');
        expect(result?.phone).toBe('3001234567');
        expect(mockPool.execute).toHaveBeenCalled();
      });

      it('should handle Colombian phone format with 57 prefix', async () => {
        const guideData: ShippingGuideData = {
          ...mockParsedGuideData,
          customerPhone: '573001234567'
        };

        mockPool.execute.mockResolvedValueOnce([[mockDatabaseOrders[0]]]);

        const result = await matcher.findCustomer(guideData);

        expect(result).not.toBeNull();
        expect(result?.matchedBy).toBe('phone');
      });

      it('should handle 10-digit phone numbers', async () => {
        const guideData: ShippingGuideData = {
          ...mockParsedGuideData,
          customerPhone: '3001234567'
        };

        mockPool.execute.mockResolvedValueOnce([[mockDatabaseOrders[0]]]);

        const result = await matcher.findCustomer(guideData);

        expect(result).not.toBeNull();
        expect(result?.matchedBy).toBe('phone');
      });

      it('should sanitize phone numbers before matching', async () => {
        const guideData: ShippingGuideData = {
          ...mockParsedGuideData,
          customerPhone: '57-300-123-4567'
        };

        mockPool.execute.mockResolvedValueOnce([[mockDatabaseOrders[0]]]);

        const result = await matcher.findCustomer(guideData);

        expect(mockPool.execute).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([
            expect.stringContaining('3001234567')
          ])
        );
      });
    });

    describe('Name + City Matching', () => {
      it('should match customer by name with 80% confidence', async () => {
        const guideData: ShippingGuideData = {
          trackingNumber: 'TEST',
          customerPhone: undefined,
          customerName: 'María González',
          shippingAddress: '',  // Clear address so it doesn't match by address
          city: 'Medellin',
          carrier: 'Test',
          rawText: 'test'
        };

        // Name match returns data with 80 confidence
        mockPool.execute.mockResolvedValueOnce([[mockDatabaseOrders[1]]]);  // Name match

        const result = await matcher.findCustomer(guideData);

        expect(result).not.toBeNull();
        expect(result?.confidence).toBe(80);
        expect(result?.matchedBy).toBe('name');
        expect(result?.name).toContain('María González');
      });

      it('should match by name without city', async () => {
        const guideData: ShippingGuideData = {
          ...mockParsedGuideData,
          customerPhone: undefined,
          customerName: 'María González'
        };

        // Phone is undefined so no phone query, name match returns data
        mockPool.execute.mockResolvedValueOnce([[mockDatabaseOrders[1]]]);  // Name match

        const result = await matcher.findCustomer(guideData);

        expect(result).not.toBeNull();
        expect(result?.matchedBy).toBe('name');
      });

      it('should handle multi-word names', async () => {
        const guideData: ShippingGuideData = {
          ...mockParsedGuideData,
          customerPhone: undefined,
          customerName: 'Carlos Alberto Rodríguez'
        };

        mockPool.execute
          .mockResolvedValueOnce([[]])  // No phone match
          .mockResolvedValueOnce([[mockDatabaseOrders[2]]]);  // Name match

        const result = await matcher.findCustomer(guideData);

        expect(result).not.toBeNull();
        expect(mockPool.execute).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([
            expect.stringContaining('carlos')
          ])
        );
      });

      it('should include city in query when provided', async () => {
        const guideData: ShippingGuideData = {
          ...mockParsedGuideData,
          customerPhone: undefined,
          customerName: 'María González',
          city: 'Medellin'
        };

        mockPool.execute
          .mockResolvedValueOnce([[]])  // No phone match
          .mockResolvedValueOnce([[mockDatabaseOrders[1]]]);  // Name match

        await matcher.findCustomer(guideData);

        expect(mockPool.execute).toHaveBeenCalledWith(
          expect.stringContaining('LOWER(shipping_address) LIKE ?'),
          expect.arrayContaining([
            expect.any(String),
            expect.stringContaining('medellin')
          ])
        );
      });
    });

    describe('Address Matching', () => {
      it('should match customer by address with 60% confidence', async () => {
        const guideData: ShippingGuideData = {
          ...mockParsedGuideData,
          customerPhone: undefined,
          customerName: '',  // Empty name so name matching is skipped
          shippingAddress: 'Av. 68 # 45-23'
        };

        // No phone or name queries, address match returns data
        mockPool.execute.mockResolvedValueOnce([[mockDatabaseOrders[2]]]);  // Address match

        const result = await matcher.findCustomer(guideData);

        expect(result).not.toBeNull();
        expect(result?.confidence).toBe(60);
        expect(result?.matchedBy).toBe('address');
      });

      it('should truncate long addresses for matching', async () => {
        const guideData: ShippingGuideData = {
          ...mockParsedGuideData,
          customerPhone: undefined,
          customerName: '',  // Empty name
          shippingAddress: 'A very long address that should be truncated for matching purposes'
        };

        mockPool.execute.mockResolvedValueOnce([[mockDatabaseOrders[2]]]);  // Address match

        await matcher.findCustomer(guideData);

        const lastCall = mockPool.execute.mock.calls[0];
        const addressParam = lastCall[1][0];
        
        // Check that address is truncated to 30 chars
        expect(addressParam.length).toBeLessThanOrEqual(32); // 30 + 2 for %%
      });
    });

    describe('No Match Scenarios', () => {
      it('should return null when no customer matches', async () => {
        const guideData: ShippingGuideData = {
          ...mockParsedGuideData,
          customerPhone: '579999999999',
          customerName: 'Nobody',
          shippingAddress: 'Nowhere'
        };

        mockPool.execute.mockResolvedValue([[]]);

        const result = await matcher.findCustomer(guideData);

        expect(result).toBeNull();
      });

      it('should return null when guide has no searchable data', async () => {
        const guideData: ShippingGuideData = {
          trackingNumber: 'TEST123',
          customerName: 'Unknown',
          shippingAddress: '',
          city: '',
          carrier: 'Test',
          rawText: ''
        };

        mockPool.execute.mockResolvedValue([[]]);

        const result = await matcher.findCustomer(guideData);

        expect(result).toBeNull();
      });
    });

    describe('Confidence Scoring', () => {
      it('should prioritize phone match over name match', async () => {
        const guideData: ShippingGuideData = {
          ...mockParsedGuideData,
          customerPhone: '573001234567',
          customerName: 'Juan Carlos Pérez'
        };

        // Only phone match will be executed
        mockPool.execute.mockResolvedValueOnce([[mockDatabaseOrders[0]]]);

        const result = await matcher.findCustomer(guideData);

        expect(result?.confidence).toBe(100);
        expect(result?.matchedBy).toBe('phone');
        // Should only call execute once for phone match
        expect(mockPool.execute).toHaveBeenCalledTimes(1);
      });

      it('should prioritize name match over address match', async () => {
        const guideData: ShippingGuideData = {
          ...mockParsedGuideData,
          customerPhone: undefined,
          customerName: 'María González',
          shippingAddress: 'Cra 7 # 100-25'
        };

        // Name match will be executed first and returns data
        mockPool.execute.mockResolvedValueOnce([[mockDatabaseOrders[1]]]);  // Name match

        const result = await matcher.findCustomer(guideData);

        expect(result?.confidence).toBe(80);
        expect(result?.matchedBy).toBe('name');
        // Should not reach address matching
        expect(mockPool.execute).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('updateOrderTracking', () => {
    it('should update order with tracking information', async () => {
      mockPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await matcher.updateOrderTracking(
        'ORD-2024-001',
        'SV123456789',
        'Servientrega'
      );

      expect(result).toBe(true);
      expect(mockPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orders'),
        ['SV123456789', 'Servientrega', 'ORD-2024-001']
      );
    });

    it('should return false when no rows are affected', async () => {
      mockPool.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

      const result = await matcher.updateOrderTracking(
        'INVALID-ORDER',
        'SV123456789',
        'Servientrega'
      );

      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      mockPool.execute.mockRejectedValueOnce(new Error('Database error'));

      const result = await matcher.updateOrderTracking(
        'ORD-2024-001',
        'SV123456789',
        'Servientrega'
      );

      expect(result).toBe(false);
    });

    it('should update shipping status to "shipped"', async () => {
      mockPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      await matcher.updateOrderTracking(
        'ORD-2024-001',
        'SV123456789',
        'Servientrega'
      );

      expect(mockPool.execute).toHaveBeenCalledWith(
        expect.stringContaining("shipping_status = 'shipped'"),
        expect.any(Array)
      );
    });

    it('should set shipped_at timestamp', async () => {
      mockPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      await matcher.updateOrderTracking(
        'ORD-2024-001',
        'SV123456789',
        'Servientrega'
      );

      expect(mockPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('shipped_at = NOW()'),
        expect.any(Array)
      );
    });
  });

  describe('Database Query Filters', () => {
    it('should only search confirmed or processing orders', async () => {
      const guideData: ShippingGuideData = {
        ...mockParsedGuideData,
        customerPhone: '573001234567'
      };

      mockPool.execute.mockResolvedValueOnce([[mockDatabaseOrders[0]]]);

      await matcher.findCustomer(guideData);

      expect(mockPool.execute).toHaveBeenCalledWith(
        expect.stringContaining("processing_status IN ('confirmed', 'processing')"),
        expect.any(Array)
      );
    });

    it('should only search orders without tracking numbers', async () => {
      const guideData: ShippingGuideData = {
        ...mockParsedGuideData,
        customerPhone: '573001234567'
      };

      mockPool.execute.mockResolvedValueOnce([[mockDatabaseOrders[0]]]);

      await matcher.findCustomer(guideData);

      expect(mockPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('tracking_number IS NULL'),
        expect.any(Array)
      );
    });

    it('should order results by created_at DESC', async () => {
      const guideData: ShippingGuideData = {
        ...mockParsedGuideData,
        customerPhone: '573001234567'
      };

      mockPool.execute.mockResolvedValueOnce([[mockDatabaseOrders[0]]]);

      await matcher.findCustomer(guideData);

      expect(mockPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY'),
        expect.any(Array)
      );
    });
  });
});
