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
        const patterns = [
            /\+57\s*3\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/,
            /\b3\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/,
            /\b3\d{2}[\s-]?\d{7}\b/,
            /\b3\d{9}\b/
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                // Normalize: remove spaces, dashes, +57 prefix
                return match[0].replace(/[\s\-+]/g, '').replace(/^57/, '');
            }
        }
        return null;
    }

    extractName(text: string): string | null {
        // Look for name indicators (require colon separator, no newline crossing)
        const namePatterns = [
            /nombre\s*:\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]+(?:[^\S\n]+[A-ZÁÉÍÓÚÑA-Za-záéíóúñ.]+){1,3})/i,
            /cliente\s*:\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]+(?:[^\S\n]+[A-ZÁÉÍÓÚÑA-Za-záéíóúñ.]+){1,3})/i,
            /para\s*:\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]+(?:[^\S\n]+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ.]+){1,3})/i,
            /destinatario\s*:\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]+(?:[^\S\n]+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ.]+){1,3})/i
        ];

        for (const pattern of namePatterns) {
            const match = text.match(pattern);
            if (match?.[1]) {
                return match[1].trim();
            }
        }

        // Fallback: look for capitalized word sequences that look like full names
        const lines = text.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            // A full name typically has 2-4 words, each starting with uppercase
            const fullNamePattern = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}$/;
            if (fullNamePattern.test(trimmed) && trimmed.split(' ').length >= 2) {
                return trimmed;
            }
        }

        return null;
    }

    extractAddress(text: string): string | null {
        // Address keywords in Spanish
        const addressKeywords = [
            /(?:dirección|direccion|dir)[:\s]+(.+?)(?:\n|ciudad|barrio|tel|cel|$)/i,
            /(?:calle|cl)\s*\d+\s*(?:#|No\.?|nro\.?)\s*[\d\-]+[^,\n]*/i,
            /(?:carrera|cra|cr)\s*\d+\s*(?:#|No\.?|nro\.?)\s*[\d\-]+[^,\n]*/i,
            /(?:avenida|av|avda)\s+[\w\s]+\s*(?:#|No\.?|nro\.?)?\s*[\d\-]+[^,\n]*/i,
            /(?:transversal|tv)\s*\d+\s*(?:#|No\.?|nro\.?)\s*[\d\-]+[^,\n]*/i,
            /(?:diagonal|dg)\s*\d+\s*(?:#|No\.?|nro\.?)\s*[\d\-]+[^,\n]*/i,
            /(?:circular|circ)\s*\d+\s*(?:#|No\.?|nro\.?)\s*[\d\-]+[^,\n]*/i
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
            /barrio[:\s]+([^\n,;.]+)/i,
            /sector[:\s]+([^\n,;.]+)/i,
            /b\/[:\s]+([^\n,;.]+)/i,
            /urbanización[:\s]+([^\n,;.]+)/i
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
            /(?:c\.?c\.?|cédula|cedula|cc|documento)[:\s#]?\s*(\d{6,10})/i,
            /\bID[:\s]+(\d{6,10})\b/i
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
        const patterns = [
            /(?:referencia|ref\.?|nota|observación|observacion|indicación|indicacion)[:\s]+([^\n]+)/i,
            /(?:entregar|entrega)[:\s]+([^\n]+)/i,
            /(?:punto\s+de\s+referencia)[:\s]+([^\n]+)/i
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match?.[1]) {
                return match[1].trim();
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
