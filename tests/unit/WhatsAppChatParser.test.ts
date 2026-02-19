import { WhatsAppChatParser } from '../../src/services/WhatsAppChatParser';
import { ExtractedOrderData } from '../../src/types';

jest.mock('tesseract.js', () => ({
    recognize: jest.fn()
}));

describe('WhatsAppChatParser', () => {
    let parser: WhatsAppChatParser;

    beforeEach(() => {
        parser = new WhatsAppChatParser();
    });

    // ---- extractPhone ----
    describe('extractPhone', () => {
        it('extracts a plain 10-digit Colombian mobile number', () => {
            expect(parser.extractPhone('Teléfono: 3126444610')).toBe('3126444610');
        });

        it('extracts number with spaces (312 799 64 51)', () => {
            const result = parser.extractPhone('cel: 312 799 64 51');
            expect(result).toBe('3127996451');
        });

        it('extracts number with +57 prefix', () => {
            const result = parser.extractPhone('+57 317 3808722 gracias');
            expect(result).toBe('3173808722');
        });

        it('returns null when no phone is present', () => {
            expect(parser.extractPhone('Solo texto sin teléfono')).toBeNull();
        });
    });

    // ---- extractName ----
    describe('extractName', () => {
        it('extracts name after "Nombre:" label', () => {
            expect(parser.extractName('Nombre: Yorman Quinto Palacios')).toBe('Yorman Quinto Palacios');
        });

        it('extracts name after "Cliente:" label', () => {
            expect(parser.extractName('cliente: Gustavo Rincón Dueñas')).toBe('Gustavo Rincón Dueñas');
        });

        it('returns null when no name pattern is found', () => {
            expect(parser.extractName('3126444610\ncalle 45 # 23-10')).toBeNull();
        });
    });

    // ---- extractAddress ----
    describe('extractAddress', () => {
        it('extracts a CRA address', () => {
            const text = 'Dirección: CRA 49# 45-134 parque de San Antonio';
            expect(parser.extractAddress(text)).toContain('CRA 49');
        });

        it('extracts an avenida address', () => {
            const text = 'Avenida 44 n 44 013 barrio Niquia';
            const result = parser.extractAddress(text);
            expect(result).not.toBeNull();
        });

        it('returns null when no address keyword is found', () => {
            expect(parser.extractAddress('Nombre: Juan\nTeléfono: 3001234567')).toBeNull();
        });
    });

    // ---- extractCity ----
    describe('extractCity', () => {
        it('finds Medellín in text', () => {
            expect(parser.extractCity('Ciudad: Medellín, Antioquia')).toBe('Medellín');
        });

        it('finds Bello in text', () => {
            expect(parser.extractCity('ciudad Bello, Antioquia')).toBe('Bello');
        });

        it('finds Buga in text', () => {
            expect(parser.extractCity('Entrega en Buga, Valle del Cauca')).toBe('Buga');
        });

        it('returns null when no known city found', () => {
            expect(parser.extractCity('Solo texto sin ciudad conocida')).toBeNull();
        });
    });

    // ---- extractNeighborhood ----
    describe('extractNeighborhood', () => {
        it('extracts neighborhood after "Barrio:" label', () => {
            expect(parser.extractNeighborhood('Barrio: La Candelaria')).toBe('La Candelaria');
        });

        it('returns null when no neighborhood keyword', () => {
            expect(parser.extractNeighborhood('Medellín, Antioquia')).toBeNull();
        });
    });

    // ---- extractCedula ----
    describe('extractCedula', () => {
        it('extracts cedula after "CC" label', () => {
            expect(parser.extractCedula('CC 14899362')).toBe('14899362');
        });

        it('extracts cedula after "cédula" label', () => {
            expect(parser.extractCedula('cédula: 12345678')).toBe('12345678');
        });

        it('returns null when no cedula keyword', () => {
            expect(parser.extractCedula('Solo nombre sin doc')).toBeNull();
        });
    });

    // ---- calculateConfidence ----
    describe('calculateConfidence', () => {
        it('returns 1 when all core fields are present', () => {
            const data: Partial<ExtractedOrderData> = {
                customerName: 'Juan',
                phone: '3001234567',
                address: 'Calle 1',
                city: 'Bogotá',
                neighborhood: 'Chapinero',
                department: 'Cundinamarca',
                cedula: '12345678',
                references: 'Cerca al parque'
            };
            expect(parser.calculateConfidence(data)).toBe(1);
        });

        it('returns 0 when no fields are present', () => {
            expect(parser.calculateConfidence({})).toBe(0);
        });

        it('returns partial confidence when only phone is present', () => {
            const conf = parser.calculateConfidence({ phone: '3001234567' });
            expect(conf).toBeGreaterThan(0);
            expect(conf).toBeLessThan(1);
        });
    });

    // ---- parseImage (mocked OCR) ----
    describe('parseImage', () => {
        beforeEach(() => {
            const tesseract = require('tesseract.js');
            tesseract.recognize.mockResolvedValue({
                data: {
                    text: 'Nombre: Jezus H.\nTeléfono: 312 799 64 51\nDirección: Avenida 44 n 44 013\nCiudad: Bello\nBarrio: Niquia'
                }
            });
        });

        it('parses image and returns ExtractedOrderData', async () => {
            const result = await parser.parseImage('/fake/path.png');

            expect(result.customerName).toBe('Jezus H.');
            expect(result.phone).toBe('3127996451');
            expect(result.city).toBe('Bello');
            expect(result.neighborhood).toBe('Niquia');
            expect(result.rawText).toContain('Jezus H.');
            expect(result.confidence).toBeGreaterThan(0);
        });
    });

    // ---- parseImages (batch) ----
    describe('parseImages', () => {
        beforeEach(() => {
            const tesseract = require('tesseract.js');
            tesseract.recognize.mockResolvedValue({
                data: { text: 'Nombre: Test User\nTeléfono: 3001234567\nciudad Bogotá' }
            });
        });

        it('returns an array of results for each image', async () => {
            const results = await parser.parseImages(['/fake/img1.png', '/fake/img2.png']);
            expect(results).toHaveLength(2);
            results.forEach((r: ExtractedOrderData) => {
                expect(r).toHaveProperty('rawText');
                expect(r).toHaveProperty('confidence');
            });
        });
    });
});
