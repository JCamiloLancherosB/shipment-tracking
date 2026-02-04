/**
 * Tests for Carrier Implementations
 */

import { InterRapidisimoCarrier } from '../../src/carriers/implementations/InterRapidisimoCarrier';
import { ServientregaCarrier } from '../../src/carriers/implementations/ServientregaCarrier';
import { EnviaCarrier } from '../../src/carriers/implementations/EnviaCarrier';
import { CoordinadoraCarrier } from '../../src/carriers/implementations/CoordinadoraCarrier';
import { TCCCarrier } from '../../src/carriers/implementations/TCCCarrier';
import { DepriseCarrier } from '../../src/carriers/implementations/DepriseCarrier';
import { ShipmentData, RecipientData } from '../../src/carriers/types';

describe('Carrier Implementations', () => {
    const testShipmentData: ShipmentData = {
        origin: 'Bogotá',
        destination: 'Medellín',
        weight: 2,
        recipient: {
            name: 'Juan Pérez',
            phone: '3001234567',
            address: 'Calle 50 # 40-30',
            city: 'Medellín'
        },
        reference: 'ORD-001'
    };

    describe('InterRapidisimoCarrier', () => {
        let carrier: InterRapidisimoCarrier;

        beforeEach(() => {
            carrier = new InterRapidisimoCarrier();
        });

        it('should have correct carrier properties', () => {
            expect(carrier.id).toBe('interrapidisimo');
            expect(carrier.name).toBe('InterRapidísimo');
            expect(carrier.hasPickup).toBe(true);
            expect(carrier.pricePerKg).toBeGreaterThan(0);
        });

        it('should create a shipment with IR prefix', async () => {
            const result = await carrier.createShipment(testShipmentData);

            expect(result.trackingNumber).toMatch(/^IR/);
            expect(result.carrier).toBe('interrapidisimo');
            expect(result.estimatedDelivery).toBeInstanceOf(Date);
            expect(result.createdAt).toBeInstanceOf(Date);
        });

        it('should return tracking info', async () => {
            const trackingInfo = await carrier.getTrackingInfo('IR123456789');

            expect(trackingInfo.carrier).toBe('InterRapidísimo');
            expect(trackingInfo.trackingNumber).toBe('IR123456789');
            expect(trackingInfo.status).toBeDefined();
            expect(trackingInfo.events.length).toBeGreaterThan(0);
        });

        it('should return quote for supported route', async () => {
            const quote = await carrier.getQuote('Bogotá', 'Medellín', 2);

            expect(quote.available).toBe(true);
            expect(quote.price).toBeGreaterThan(0);
            expect(quote.estimatedDays).toBeGreaterThan(0);
            expect(quote.currency).toBe('COP');
        });

        it('should return unavailable quote for unsupported route', async () => {
            const quote = await carrier.getQuote('Bogotá', 'Ciudad Inexistente', 2);

            expect(quote.available).toBe(false);
        });
    });

    describe('ServientregaCarrier', () => {
        let carrier: ServientregaCarrier;

        beforeEach(() => {
            carrier = new ServientregaCarrier();
        });

        it('should have correct carrier properties', () => {
            expect(carrier.id).toBe('servientrega');
            expect(carrier.name).toBe('Servientrega');
            expect(carrier.hasPickup).toBe(true);
        });

        it('should create a shipment with SV prefix', async () => {
            const result = await carrier.createShipment(testShipmentData);

            expect(result.trackingNumber).toMatch(/^SV/);
            expect(result.carrier).toBe('servientrega');
        });

        it('should support major Colombian cities', async () => {
            const quote = await carrier.getQuote('Bogotá', 'Cali', 1);
            expect(quote.available).toBe(true);
        });
    });

    describe('EnviaCarrier', () => {
        let carrier: EnviaCarrier;

        beforeEach(() => {
            carrier = new EnviaCarrier();
        });

        it('should have correct carrier properties', () => {
            expect(carrier.id).toBe('envia');
            expect(carrier.name).toBe('Envía Colvanes');
        });

        it('should create a shipment with ENV prefix', async () => {
            const result = await carrier.createShipment(testShipmentData);

            expect(result.trackingNumber).toMatch(/^ENV/);
        });
    });

    describe('CoordinadoraCarrier', () => {
        let carrier: CoordinadoraCarrier;

        beforeEach(() => {
            carrier = new CoordinadoraCarrier();
        });

        it('should have correct carrier properties', () => {
            expect(carrier.id).toBe('coordinadora');
            expect(carrier.name).toBe('Coordinadora');
        });

        it('should create a shipment with CD prefix', async () => {
            const result = await carrier.createShipment(testShipmentData);

            expect(result.trackingNumber).toMatch(/^CD/);
        });
    });

    describe('TCCCarrier', () => {
        let carrier: TCCCarrier;

        beforeEach(() => {
            carrier = new TCCCarrier();
        });

        it('should have correct carrier properties', () => {
            expect(carrier.id).toBe('tcc');
            expect(carrier.name).toBe('TCC');
        });

        it('should create a shipment with TCC prefix', async () => {
            const result = await carrier.createShipment(testShipmentData);

            expect(result.trackingNumber).toMatch(/^TCC/);
        });
    });

    describe('DepriseCarrier', () => {
        let carrier: DepriseCarrier;

        beforeEach(() => {
            carrier = new DepriseCarrier();
        });

        it('should have correct carrier properties', () => {
            expect(carrier.id).toBe('deprise');
            expect(carrier.name).toBe('Deprisa');
        });

        it('should create a shipment with DPR prefix', async () => {
            const result = await carrier.createShipment(testShipmentData);

            expect(result.trackingNumber).toMatch(/^DPR/);
        });
    });

    describe('Common Carrier Behavior', () => {
        const carriers = [
            new InterRapidisimoCarrier(),
            new ServientregaCarrier(),
            new EnviaCarrier(),
            new CoordinadoraCarrier(),
            new TCCCarrier(),
            new DepriseCarrier()
        ];

        test.each(carriers.map(c => [c.name, c]))(
            '%s should cancel shipment successfully',
            async (name, carrier) => {
                const result = await carrier.cancelShipment('TEST123');
                expect(result).toBe(true);
            }
        );

        test.each(carriers.map(c => [c.name, c]))(
            '%s should return label buffer',
            async (name, carrier) => {
                const label = await carrier.getLabel('TEST123');
                expect(label).toBeInstanceOf(Buffer);
            }
        );
    });
});
