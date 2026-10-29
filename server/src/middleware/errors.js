import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

export const notFound = (req, _res, next) => next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`, 'not_found'));

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    const fields = Object.fromEntries(err.issues.map((i) => [i.path.join('.') || 'body', i.message]));
    return res.status(400).json({ error: 'Please fix the highlighted fields', code: 'validation_error', fields });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    return res.status(409).json({ error: `A record with this ${field} already exists`, code: 'duplicate', field });
  }
  if (err?.name === 'CastError' || err?.name === 'ValidationError') return res.status(400).json({ error: err.message, code: 'validation_error' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side', code: 'server_error', ...(env.nodeEnv !== 'production' && { detail: err.message }) });
}
