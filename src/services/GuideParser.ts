import * as fs from 'fs';
import * as path from 'path';
import { ShippingGuideData } from '../types';
import colombianCities from '../data/colombian-cities.json';

export class WhatsAppChatDetectedError extends Error {
    constructor() {
        super('WHATSAPP_CHAT_DETECTED');
        this.name = 'WhatsAppChatDetectedError';
    }
}

export class GuideParser {
    private pdfParse: any = null;
    private tesseract: any = null;

    /**
     * Detects whether the OCR text comes from a WhatsApp chat screenshot,
     * a carrier shipping guide, or an unknown image type.
     */
    detectImageType(text: string): 'carrier_guide' | 'whatsapp_chat' | 'unknown' {
        const lower = text.toLowerCase();

        // Carrier patterns
        const carrierPattern = /servientrega|coordinadora|inter\s*r[aá]pidisimo|env[ií]a|colvanes|\btcc\b|\b472\b/i; // 472 is a Colombian postal/courier carrier
        const trackingPattern = /(?:gu[íi]a|tracking|numero|guia)\s*[:#]?\s*[A-Z0-9]{6,}|\b\d{10,15}\b|[A-Z]{2,3}\d{9,12}/;

        const hasCarrier = carrierPattern.test(text);
        const hasTracking = trackingPattern.test(text);

        if (hasCarrier && hasTracking) {
            return 'carrier_guide';
        }

        // WhatsApp chat patterns
        const hasTimestamp = /\d{1,2}:\d{2}\s*[ap]\.?m\.?/i.test(text);
        const hasChatWords = /buenos\s*d[íi]as|buenas\s*tardes|buenas\s*noches|por\s*supuesto|ok\s*gracias/i.test(lower);
        const hasAddressIndicators = /\bbarrio\b|tel\.|cel\.|avenida|calle\b|carrera\b/i.test(text);
        const hasWhatsAppHeader = /\+57\s*3\d{9}/.test(text);
        const hasWhatsAppTicks = /✓✓|✓/.test(text);

        const whatsappScore = [hasTimestamp, hasChatWords, hasAddressIndicators, hasWhatsAppHeader, hasWhatsAppTicks]
            .filter(Boolean).length;

        if (whatsappScore >= 2 && !hasCarrier) {
            return 'whatsapp_chat';
        }

        return 'unknown';
    }

    /**
     * Returns true if the OCR text appears to be a WhatsApp chat screenshot.
     */
    isWhatsAppChat(text: string): boolean {
        return this.detectImageType(text) === 'whatsapp_chat';
    }

    async parse(filePath: string): Promise<ShippingGuideData | null> {
        const ext = path.extname(filePath).toLowerCase();
        let text: string;

        try {
            if (ext === '.pdf') {
                text = await this.parsePDF(filePath);
            } else if (['.png', '.jpg', '.jpeg', '.webp', '.bmp'].includes(ext)) {
                text = await this.parseImage(filePath);
            } else {
                console.warn(`Unsupported file type: ${ext}`);
                return null;
            }

            return this.extractData(text);
        } catch (error) {
            if (error instanceof WhatsAppChatDetectedError) {
                throw error;
            }
            console.error(`Error parsing ${filePath}:`, error);
            return null;
        }
    }

    private async parsePDF(filePath: string): Promise<string> {
        if (!this.pdfParse) {
            this.pdfParse = (await import('pdf-parse')).default;
        }
        
        const buffer = fs.readFileSync(filePath);
        const data = await this.pdfParse(buffer);
        return data.text || '';
    }

    private async parseImage(filePath: string): Promise<string> {
        if (!this.tesseract) {
            const tesseractModule = await import('tesseract.js');
            this.tesseract = tesseractModule.default || tesseractModule;
        }

        const result = await this.tesseract.recognize(filePath, 'spa', {
            logger: (m: any) => {
                if (m.status === 'recognizing text') {
                    process.stdout.write(`\rOCR: ${Math.round(m.progress * 100)}%`);
                }
            }
        });

        console.log(''); // New line after progress
        return result.data.text || '';
    }

    private extractData(text: string): ShippingGuideData | null {
        if (this.isWhatsAppChat(text)) {
            throw new WhatsAppChatDetectedError();
        }

        const data: Partial<ShippingGuideData> = { rawText: text };

        // Carrier detection
        const carriers: Record<string, RegExp> = {
            'Servientrega': /servientrega/i,
            'Coordinadora': /coordinadora/i,
            'InterRapidisimo': /inter\s*r[aá]pidisimo/i,
            'Envia': /env[ií]a|colvanes/i,
            'TCC': /\btcc\b/i,
            '472': /\b472\b/i
        };

        for (const [name, pattern] of Object.entries(carriers)) {
            if (pattern.test(text)) {
                data.carrier = name;
                break;
            }
        }

        // Tracking number patterns
        const trackingPatterns = [
            /(?:gu[íi]a|tracking|numero|guia)\s*[:#]?\s*([A-Z0-9]{8,20})/i,
            /\b(\d{10,15})\b/,
            /([A-Z]{2,3}\d{9,12})/
        ];

        for (const pattern of trackingPatterns) {
            const match = text.match(pattern);
            if (match) {
                data.trackingNumber = (match[1] || match[0]).trim();
                break;
            }
        }

        // Customer name
        const namePatterns = [
            /(?:destinatario|nombre|cliente|para)\s*[:#]?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/i
        ];

        for (const pattern of namePatterns) {
            const match = text.match(pattern);
            if (match) {
                data.customerName = match[1].trim();
                break;
            }
        }

        // Phone number (Colombian)
        const phoneMatch = text.match(/(\+?57\s?)?([3][0-9]{2}[\s.-]?[0-9]{3}[\s.-]?[0-9]{4})/);
        if (phoneMatch) {
            data.customerPhone = '57' + phoneMatch[2].replace(/[\s.-]/g, '');
        }

        // Address
        const addressMatch = text.match(/((?:calle|carrera|cra|cll|av|avenida|transversal|diagonal)\s*#?\s*\d+[^,\n]{0,50})/i);
        if (addressMatch) {
            data.shippingAddress = addressMatch[1].trim();
        }

        // City (Colombian cities) - with accent normalization
        const normalizeText = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const textNormalized = normalizeText(text);
        for (const entry of colombianCities) {
            const cityNormalized = normalizeText(entry.city);
            if (textNormalized.includes(cityNormalized)) {
                data.city = entry.city;
                data.department = entry.department;
                break;
            }
        }

        // Validate minimum data
        if (data.trackingNumber && (data.customerName || data.customerPhone)) {
            return {
                trackingNumber: data.trackingNumber || 'UNKNOWN',
                customerName: data.customerName || 'Unknown',
                customerPhone: data.customerPhone,
                shippingAddress: data.shippingAddress || '',
                city: data.city || '',
                department: data.department || '',
                carrier: data.carrier || 'Unknown',
                rawText: text.substring(0, 1000)
            } as ShippingGuideData;
        }

        return null;
    }
}
