import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message, code, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const validate = (schema, where = 'body') => (req, _res, next) => {
  const r = schema.safeParse(req[where] ?? {});
  if (!r.success) return next(r.error);
  req[where] = r.data;
  next();
};
export const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const paging = (q) => {
  const page = Math.max(1, parseInt(q.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
};
export const pageMeta = (total, p) => ({ total, page: p.page, limit: p.limit, pages: Math.max(1, Math.ceil(total / p.limit)) });
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
