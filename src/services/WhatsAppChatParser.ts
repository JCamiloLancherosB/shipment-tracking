import * as fs from 'fs';
import { ExtractedOrderData } from '../types';
import colombianCities from '../data/colombian-cities.json';

interface CityEntry {
    city: string;
    department: string;
}

export class WhatsAppChatParser {
    private tesseract: any = null;
    private readonly cities: CityEntry[] = colombianCities as CityEntry[];

    /**
     * Parse a single WhatsApp screenshot image and extract order data.
     */
    async parseImage(imagePath: string): Promise<ExtractedOrderData> {
        const rawText = await this.performOCR(imagePath);
        return this.extractOrderData(rawText, imagePath);
    }

    /**
     * Parse multiple WhatsApp screenshot images in batch.
     */
    async parseImages(imagePaths: string[]): Promise<ExtractedOrderData[]> {
        const results: ExtractedOrderData[] = [];
        for (const imagePath of imagePaths) {
            const result = await this.parseImage(imagePath);
            results.push(result);
        }
        return results;
    }

    private async performOCR(imagePath: string): Promise<string> {
        if (!this.tesseract) {
            const tesseractModule = await import('tesseract.js');
            this.tesseract = tesseractModule.default || tesseractModule;
        }

        const result = await this.tesseract.recognize(imagePath, 'spa', {
            logger: (m: any) => {
                if (m.status === 'recognizing text') {
                    process.stdout.write(`\rOCR: ${Math.round(m.progress * 100)}%`);
                }
            }
        });

        console.log('');
        return result.data.text || '';
    }

    private extractOrderData(rawText: string, imageSource?: string): ExtractedOrderData {
        const customerName = this.extractName(rawText);
        const phone = this.extractPhone(rawText);
        const address = this.extractAddress(rawText);
        const { city, department } = this.extractCityAndDepartment(rawText);
        const neighborhood = this.extractNeighborhood(rawText);
        const cedula = this.extractCedula(rawText);
        const references = this.extractReferences(rawText);

        const partial: Partial<ExtractedOrderData> = {
            customerName,
            phone,
            address,
            city,
            neighborhood,
            department,
            cedula,
            references
        };

        const confidence = this.calculateConfidence(partial);

        return {
            customerName,
            phone,
            address,
            city,
            neighborhood,
            department,
            cedula,
            references,
            product: null,
            rawText,
            confidence,
            imageSource
        };
    }

    extractPhone(text: string): string | null {
        // Colombian phone formats: 3XXXXXXXXX, +57 3XX..., 312 799 64 51, 317 3808722
        // Also handles: "TEL. 312 799 64 51", "+57 317 3808722", "Tel 317 3808722", "Celular: 3126444610"
        const patterns = [
            /(?:tel(?:éfono|efono)?\.?|cel(?:ular)?\.?|celular\s*:)\s*\+?57\s*3\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/i,
            /(?:tel(?:éfono|efono)?\.?|cel(?:ular)?\.?|celular\s*:)\s*\+?57\s*3\d{2}[\s-]?\d{7}/i,
            /(?:tel(?:éfono|efono)?\.?|cel(?:ular)?\.?|celular\s*:)\s*3\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/i,
            /(?:tel(?:éfono|efono)?\.?|cel(?:ular)?\.?|celular\s*:)\s*3\d{2}[\s-]?\d{7}/i,
            /\+57\s*3\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/,
            /\+57\s*3\d{2}[\s-]?\d{7}/,
            /\b3\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/,
            /\b3\d{2}[\s-]?\d{7}\b/,
            /\b3\d{9}\b/
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
            // Normalize: extract digits only, remove country code 57 if present
            const digits = match[0].replace(/[^\d]/g, '');
            // If 12 digits starting with 57, strip country code; take last 10 digits
            if (digits.startsWith('57') && digits.length === 12) {
                return digits.slice(2);
            }
            // Return last 10 digits only if we have at least 10
            return digits.length >= 10 ? digits.slice(-10) : digits;
            }
        }
        return null;
    }

    extractName(text: string): string | null {
        // Look for name indicators (require colon separator, no newline crossing)
        // Uses [A-Za-z\u00C0-\u024F] to cover all Latin letters including Spanish accented chars
        const latinLetter = '[A-Za-z\\u00C0-\\u024F]';
        const nameWord = `${latinLetter}+(?:[.]${latinLetter}*)?`;
        const namePatterns = [
            new RegExp(`nombre\\s*:\\s*(${latinLetter}${nameWord}(?:[^\\S\\n]+${nameWord}){1,3})`, 'i'),
            new RegExp(`cliente\\s*:\\s*(${latinLetter}${nameWord}(?:[^\\S\\n]+${nameWord}){1,3})`, 'i'),
            new RegExp(`para\\s*:\\s*(${latinLetter}${nameWord}(?:[^\\S\\n]+${nameWord}){1,3})`, 'i'),
            new RegExp(`destinatario\\s*:\\s*(${latinLetter}${nameWord}(?:[^\\S\\n]+${nameWord}){1,3})`, 'i')
        ];

        for (const pattern of namePatterns) {
            const match = text.match(pattern);
            if (match?.[1]) {
                return match[1].trim();
            }
        }

        // Heuristic: in WhatsApp order messages the name is often the first or last non-empty line
        // that looks like a proper name (2-4 capitalized words, no digits, no address keywords)
        const addressKeywords = /\b(?:calle|cl|carrera|cra|avenida|av|barrio|tel|cel|cc|nit|oficina|interrapidisimo|servientrega|bello|bogot|medellin|medellín|cali|buga|ant|valle)\b/i;
        const fullNamePattern = /^[A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+(?:\s+[A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+){1,3}$/;

        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        // Check first non-phone line
        for (const line of lines) {
            if (/^\+?57\s*3\d/.test(line) || /^\d/.test(line)) continue; // skip phone/digit lines
            if (addressKeywords.test(line)) continue;
            if (fullNamePattern.test(line) && line.split(' ').length >= 2) {
                return line;
            }
        }

        // Check last line
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            if (/^\+?57\s*3\d/.test(line) || /^\d/.test(line)) continue;
            if (addressKeywords.test(line)) continue;
            // Last line may be shorter (e.g. "Jezus h") — allow single word if title-case
            if (/^[A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+(?:\s+[A-Za-z\u00C0-\u024F][a-z\u00C0-\u024F]*)*$/.test(line) && line.length >= 3) {
                return line;
            }
        }

        return null;
    }

    extractAddress(text: string): string | null {
        // Address keywords in Spanish — including abbreviated forms used in Colombia
        const addressKeywords = [
            /(?:dirección|direccion|dir)[:\s]+(.+?)(?:\n|ciudad|barrio|tel|cel|$)/i,
            /(?:calle|cl)\s*\d+[\w\s]*(?:#|No\.?|nro\.?|n)\s*[\d\-]+[^,\n]*/i,
            /(?:carrera|cra|cr)\s*\d+[\w\s]*(?:#|No\.?|nro\.?|n)\s*[\d\-]+[^,\n]*/i,
            /(?:avenida|av(?:da)?\.?)\s+[\w\s]+\s*(?:#|No\.?|nro\.?|n)?\s*[\d\-]+[^,\n]*/i,
            /(?:transversal|tv)\s*\d+[\w\s]*(?:#|No\.?|nro\.?|n)\s*[\d\-]+[^,\n]*/i,
            /(?:diagonal|dg)\s*\d+[\w\s]*(?:#|No\.?|nro\.?|n)\s*[\d\-]+[^,\n]*/i,
            /(?:circular|circ)\s*\d+[\w\s]*(?:#|No\.?|nro\.?|n)\s*[\d\-]+[^,\n]*/i,
            /(?:manzana|mz)\s*[\w\d]+\s*(?:casa|ap\.?|apto\.?|local|torre|bloque|piso)?\s*[\w\d]*/i
        ];

        for (const pattern of addressKeywords) {
            const match = text.match(pattern);
            if (match) {
                // If captured group, return it; otherwise return full match
                return (match[1] || match[0]).trim();
            }
        }

        return null;
    }

    extractCity(text: string): string | null {
        return this.extractCityAndDepartment(text).city;
    }

    private extractCityAndDepartment(text: string): { city: string | null; department: string | null } {
        const lowerText = text.toLowerCase();

        // Try labeled city patterns first (require colon separator to avoid false positives)
        const cityPatterns = [
            /ciudad\s*:\s*([^\n,]+)/i,
            /municipio\s*:\s*([^\n,]+)/i,
            /c\.?\s*\/\s*:\s*([^\n,]+)/i
        ];

        for (const pattern of cityPatterns) {
            const match = text.match(pattern);
            if (match?.[1]) {
                const cityName = match[1].trim();
                // Try to find in known cities
                const found = this.cities.find(
                    c => c.city.toLowerCase() === cityName.toLowerCase()
                );
                if (found) {
                    return { city: found.city, department: found.department };
                }
                return { city: cityName, department: null };
            }
        }

        // Scan text for known Colombian cities
        for (const entry of this.cities) {
            const cityLower = entry.city.toLowerCase();
            // Use word boundary to avoid partial matches
            const regex = new RegExp(`\\b${cityLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
            if (regex.test(lowerText)) {
                return { city: entry.city, department: entry.department };
            }
        }

        return { city: null, department: null };
    }

    extractNeighborhood(text: string): string | null {
        const patterns = [
            /barri[oó][:\s]+([^\n,;.]+)/i,
            /b\/[:\s]*([^\n,;.]+)/i,
            /brio[:\s]+([^\n,;.]+)/i,
            /sector[:\s]+([^\n,;.]+)/i,
            /urb(?:anización|anizacion|\.)[:\s]+([^\n,;.]+)/i,
            /conj(?:unto|\.)[:\s]+([^\n,;.]+)/i
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match?.[1]) {
                return match[1].trim();
            }
        }
        return null;
    }

    extractCedula(text: string): string | null {
        const patterns = [
            /(?:c\.?c\.?|cédula|cedula|documento|doc\.?|nit)[:\s#]?\s*(\d{6,12})/i,
            /\bID[:\s]+(\d{6,12})\b/i,
            /\bcc\s+(\d{6,12})\b/i
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match?.[1]) {
                return match[1].trim();
            }
        }
        return null;
    }

    private extractReferences(text: string): string | null {
        // Detect delivery type first (oficina transportadora, etc.)
        const deliveryPatterns = [
            /(?:oficina\s+(?:interrapid[ií]simo|servientrega|coordinadora|env[ií]a|deprisa)[^\n]*)/i,
            /(?:entregar?\s+en\s+oficina[^\n]*)/i,
            /(?:referencia|ref\.?|nota|observación|observacion|indicación|indicacion)[:\s]+([^\n]+)/i,
            /(?:entregar|entrega)[:\s]+([^\n]+)/i,
            /(?:punto\s+de\s+referencia)[:\s]+([^\n]+)/i
        ];

        for (const pattern of deliveryPatterns) {
            const match = text.match(pattern);
            if (match) {
                return (match[1] || match[0]).trim();
            }
        }
        return null;
    }

    calculateConfidence(data: Partial<ExtractedOrderData>): number {
        const fields: Array<keyof Partial<ExtractedOrderData>> = [
            'customerName', 'phone', 'address', 'city'
        ];
        const optionalFields: Array<keyof Partial<ExtractedOrderData>> = [
            'neighborhood', 'department', 'cedula', 'references'
        ];

        let score = 0;
        let maxScore = 0;

        // Core fields have higher weight
        for (const field of fields) {
            maxScore += 2;
            if (data[field]) score += 2;
        }

        // Optional fields have lower weight
        for (const field of optionalFields) {
            maxScore += 1;
            if (data[field]) score += 1;
        }

        return maxScore > 0 ? Math.round((score / maxScore) * 100) / 100 : 0;
    }
}

export const whatsAppChatParser = new WhatsAppChatParser();
