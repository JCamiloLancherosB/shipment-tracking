/**
 * Carrier Selector Service
 * Selects the best carrier based on various criteria
 */

import {
    Carrier,
    Quote,
    SelectionPriority,
    CarrierSelectionResult
} from '../carriers/types';
import {
    InterRapidisimoCarrier,
    ServientregaCarrier,
    EnviaCarrier,
    CoordinadoraCarrier,
    TCCCarrier,
    DepriseCarrier
} from '../carriers/implementations';

interface QuoteWithCarrier {
    carrier: Carrier;
    quote: Quote;
}

/**
 * Service for selecting the best carrier for a shipment
 */
export class CarrierSelector {
    private carriers: Map<string, Carrier>;

    constructor() {
        this.carriers = new Map();
        this.initializeCarriers();
    }

    /**
     * Initialize all available carriers
     */
    private initializeCarriers(): void {
        const carrierInstances: Carrier[] = [
            new InterRapidisimoCarrier(),
            new ServientregaCarrier(),
            new EnviaCarrier(),
            new CoordinadoraCarrier(),
            new TCCCarrier(),
            new DepriseCarrier()
        ];

        for (const carrier of carrierInstances) {
            this.carriers.set(carrier.id, carrier);
        }
    }

    /**
     * Get all available carriers
     */
    getCarriers(): Carrier[] {
        return Array.from(this.carriers.values());
    }

    /**
     * Get a carrier by ID
     */
    getCarrier(carrierId: string): Carrier | undefined {
        return this.carriers.get(carrierId);
    }

    /**
     * Select the best carrier for a shipment
     */
    async selectBestCarrier(
        origin: string,
        destination: string,
        weight: number,
        priority: SelectionPriority = 'balanced'
    ): Promise<CarrierSelectionResult> {
        // Get quotes from all carriers
        const quotes = await Promise.all(
            Array.from(this.carriers.values()).map(async carrier => ({
                carrier,
                quote: await carrier.getQuote(origin, destination, weight)
            }))
        );

        // Filter carriers that support the route
        const validQuotes = quotes.filter(q => q.quote.available);

        if (validQuotes.length === 0) {
            throw new Error(
                `No hay transportadoras disponibles para la ruta ${origin} -> ${destination}`
            );
        }

        // Select based on priority
        switch (priority) {
            case 'fastest':
                return this.selectFastest(validQuotes);
            case 'cheapest':
                return this.selectCheapest(validQuotes);
            case 'balanced':
            default:
                return this.selectBalanced(validQuotes);
        }
    }

    /**
     * Select the fastest carrier
     */
    private selectFastest(quotes: QuoteWithCarrier[]): CarrierSelectionResult {
        const sorted = [...quotes].sort((a, b) => 
            a.quote.estimatedDays - b.quote.estimatedDays
        );
        
        const selected = sorted[0];
        return {
            carrier: selected.carrier,
            quote: selected.quote,
            reason: `Seleccionado por ser el más rápido (${selected.quote.estimatedDays} días)`
        };
    }

    /**
     * Select the cheapest carrier
     */
    private selectCheapest(quotes: QuoteWithCarrier[]): CarrierSelectionResult {
        const sorted = [...quotes].sort((a, b) => 
            a.quote.price - b.quote.price
        );
        
        const selected = sorted[0];
        return {
            carrier: selected.carrier,
            quote: selected.quote,
            reason: `Seleccionado por ser el más económico ($${selected.quote.price.toLocaleString()} COP)`
        };
    }

    /**
     * Select a balanced option considering price, speed, and reliability
     * Score = (1/normalized_price) * 0.4 + (1/normalized_days) * 0.4 + reliability * 0.2
     */
    private selectBalanced(quotes: QuoteWithCarrier[]): CarrierSelectionResult {
        // Find min/max for normalization
        const prices = quotes.map(q => q.quote.price);
        const days = quotes.map(q => q.quote.estimatedDays);
        
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const minDays = Math.min(...days);
        const maxDays = Math.max(...days);

        // Calculate scores
        const scored = quotes.map(q => {
            // Normalize price (lower is better, so invert)
            const normalizedPrice = maxPrice > minPrice 
                ? 1 - (q.quote.price - minPrice) / (maxPrice - minPrice)
                : 1;
            
            // Normalize days (lower is better, so invert)
            const normalizedDays = maxDays > minDays
                ? 1 - (q.quote.estimatedDays - minDays) / (maxDays - minDays)
                : 1;
            
            // Base reliability score (all carriers start equal)
            const reliability = 0.8;

            // Calculate weighted score
            const score = normalizedPrice * 0.4 + normalizedDays * 0.4 + reliability * 0.2;

            return { ...q, score };
        });

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        const selected = scored[0];
        return {
            carrier: selected.carrier,
            quote: selected.quote,
            reason: `Mejor balance calidad-precio (${selected.quote.estimatedDays} días, $${selected.quote.price.toLocaleString()} COP)`
        };
    }

    /**
     * Get quotes from all carriers
     */
    async getAllQuotes(
        origin: string,
        destination: string,
        weight: number
    ): Promise<Array<{ carrier: string; name: string; quote: Quote }>> {
        const quotes = await Promise.all(
            Array.from(this.carriers.values()).map(async carrier => ({
                carrier: carrier.id,
                name: carrier.name,
                quote: await carrier.getQuote(origin, destination, weight)
            }))
        );

        return quotes.filter(q => q.quote.available);
    }
}

// Export singleton instance
export const carrierSelector = new CarrierSelector();
