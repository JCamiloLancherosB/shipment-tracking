import { Request, Response, NextFunction } from 'express';
import { config } from '../config/config';

/**
 * API key authentication middleware.
 * Checks for a valid API key in the `x-api-key` header or `Authorization: Bearer <key>` header.
 * Returns 401 Unauthorized if the key is missing or invalid.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
    const expectedKey = config.apiKey;

    // If no API key is configured, skip authentication
    if (!expectedKey) {
        next();
        return;
    }

    // Check x-api-key header first
    let providedKey = req.headers['x-api-key'] as string | undefined;

    // Fall back to Authorization: Bearer <key>
    if (!providedKey) {
        const authHeader = req.headers['authorization'] as string | undefined;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            providedKey = authHeader.slice(7);
        }
    }

    if (!providedKey) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing API key' });
        return;
    }

    if (providedKey !== expectedKey) {
        res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
        return;
    }

    next();
}
