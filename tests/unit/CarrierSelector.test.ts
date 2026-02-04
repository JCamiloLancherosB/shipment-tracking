/**
 * Tests for CarrierSelector service
 */

import { CarrierSelector } from '../../src/services/CarrierSelector';

describe('CarrierSelector', () => {
    let selector: CarrierSelector;

    beforeEach(() => {
        selector = new CarrierSelector();
    });

    describe('getCarriers', () => {
        it('should return all available carriers', () => {
            const carriers = selector.getCarriers();
            
            expect(carriers).toHaveLength(6);
            expect(carriers.map(c => c.id)).toEqual(
                expect.arrayContaining([
                    'interrapidisimo',
                    'servientrega',
                    'envia',
                    'coordinadora',
                    'tcc',
                    'deprisa'
                ])
            );
        });

        it('should return carriers with required properties', () => {
            const carriers = selector.getCarriers();
            
            for (const carrier of carriers) {
                expect(carrier.id).toBeDefined();
                expect(carrier.name).toBeDefined();
                expect(carrier.logo).toBeDefined();
                expect(typeof carrier.pricePerKg).toBe('number');
                expect(typeof carrier.hasPickup).toBe('boolean');
                expect(Array.isArray(carrier.supportedCities)).toBe(true);
            }
        });
    });

    describe('getCarrier', () => {
        it('should return a specific carrier by ID', () => {
            const carrier = selector.getCarrier('servientrega');
            
            expect(carrier).toBeDefined();
            expect(carrier?.id).toBe('servientrega');
            expect(carrier?.name).toBe('Servientrega');
        });

        it('should return undefined for unknown carrier', () => {
            const carrier = selector.getCarrier('unknown-carrier');
            
            expect(carrier).toBeUndefined();
        });
    });

    describe('selectBestCarrier', () => {
        it('should select fastest carrier when priority is fastest', async () => {
            const result = await selector.selectBestCarrier(
                'Bogotá',
                'Medellín',
                2,
                'fastest'
            );

            expect(result.carrier).toBeDefined();
            expect(result.quote.available).toBe(true);
            expect(result.reason).toContain('más rápido');
        });

        it('should select cheapest carrier when priority is cheapest', async () => {
            const result = await selector.selectBestCarrier(
                'Bogotá',
                'Cali',
                2,
                'cheapest'
            );

            expect(result.carrier).toBeDefined();
            expect(result.quote.available).toBe(true);
            expect(result.reason).toContain('más económico');
        });

        it('should select balanced option by default', async () => {
            const result = await selector.selectBestCarrier(
                'Bogotá',
                'Barranquilla',
                1.5,
                'balanced'
            );

            expect(result.carrier).toBeDefined();
            expect(result.quote.available).toBe(true);
            expect(result.reason).toContain('balance');
        });

        it('should throw error when no carriers support the route', async () => {
            await expect(
                selector.selectBestCarrier(
                    'Bogotá',
                    'Ciudad Inexistente',
                    1,
                    'balanced'
                )
            ).rejects.toThrow('No hay transportadoras disponibles');
        });
    });

    describe('getAllQuotes', () => {
        it('should return quotes from all carriers that support the route', async () => {
            const quotes = await selector.getAllQuotes('Bogotá', 'Medellín', 2);

            expect(quotes.length).toBeGreaterThan(0);
            
            for (const item of quotes) {
                expect(item.carrier).toBeDefined();
                expect(item.name).toBeDefined();
                expect(item.quote.available).toBe(true);
                expect(item.quote.price).toBeGreaterThan(0);
                expect(item.quote.estimatedDays).toBeGreaterThan(0);
            }
        });

        it('should filter out unavailable carriers', async () => {
            const quotes = await selector.getAllQuotes(
                'Bogotá',
                'Leticia',  // Remote city - not all carriers support
                1
            );

            // All returned quotes should be available
            for (const item of quotes) {
                expect(item.quote.available).toBe(true);
            }
        });

        it('should return empty array when no carriers support the route', async () => {
            const quotes = await selector.getAllQuotes(
                'Ciudad Inexistente',
                'Otra Ciudad Inexistente',
                1
            );

            expect(quotes).toHaveLength(0);
        });
    });
});
