import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { ShippingGuideData } from '../types';

export class WhatsAppSender {
    private apiUrl: string;
    private apiKey: string;

    constructor(config: { apiUrl: string; apiKey: string }) {
        this.apiUrl = config.apiUrl;
        this.apiKey = config.apiKey;
    }

    async sendGuide(phone: string, guideData: ShippingGuideData, filePath: string): Promise<boolean> {
        try {
            // Format phone number
            const formattedPhone = this.formatPhone(phone);

            // Send text message first
            const message = this.formatMessage(guideData);
            await this.sendText(formattedPhone, message);

            // Then send the guide file
            await this.sendMedia(formattedPhone, filePath, 'Guía de envío');

            return true;
        } catch (error) {
            console.error('Error sending guide via WhatsApp:', error);
            return false;
        }
    }

    private async sendText(phone: string, message: string): Promise<void> {
        await axios.post(`${this.apiUrl}/api/send-message`, {
            phone,
            message
        }, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        });
    }

    private async sendMedia(phone: string, filePath: string, caption: string): Promise<void> {
        const formData = new FormData();
        formData.append('phone', phone);
        formData.append('caption', caption);
        formData.append('file', fs.createReadStream(filePath));

        await axios.post(`${this.apiUrl}/api/send-media`, formData, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                ...formData.getHeaders()
            }
        });
    }

    private formatPhone(phone: string): string {
        const digits = phone.replace(/\D/g, '');
        if (digits.startsWith('57')) return digits;
        if (digits.length === 10) return '57' + digits;
        return digits;
    }

    private formatMessage(data: ShippingGuideData): string {
        return `🚚 *¡Tu pedido ha sido enviado!*

📦 *Número de guía:* ${data.trackingNumber}
🏢 *Transportadora:* ${data.carrier}
📍 *Destino:* ${data.city || 'Ver guía adjunta'}

Puedes rastrear tu envío en la página de la transportadora.

¡Gracias por tu compra en TechAura! 🎉

_Escribe "rastrear" para ver el estado de tu envío._`;
    }
}
