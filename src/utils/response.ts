/**
 * Standardised API response helpers for Vercel serverless functions.
 */
import type { VercelResponse } from '@vercel/node';

export function ok<T>(res: VercelResponse, data: T, meta?: Record<string, unknown>) {
  return res.status(200).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function created<T>(res: VercelResponse, data: T) {
  return res.status(201).json({ success: true, data });
}

export function badRequest(res: VercelResponse, message: string) {
  return res.status(400).json({ success: false, error: message });
}

export function unauthorized(res: VercelResponse, message = 'Unauthorized') {
  return res.status(401).json({ success: false, error: message });
}

export function notFound(res: VercelResponse, message = 'Not found') {
  return res.status(404).json({ success: false, error: message });
}

export function tooManyRequests(res: VercelResponse, retryAfterSeconds?: number) {
  if (retryAfterSeconds) res.setHeader('Retry-After', retryAfterSeconds.toString());
  return res.status(429).json({
    success: false,
    error: 'Too many requests. Please try again later.',
    ...(retryAfterSeconds ? { retryAfter: retryAfterSeconds } : {}),
  });
}

export function serverError(res: VercelResponse, message = 'Internal server error') {
  return res.status(500).json({ success: false, error: message });
}
