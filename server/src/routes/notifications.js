import { Router } from 'express';
import { z } from 'zod';
import { Notification } from '../models/index.js';
import { authorize } from '../middleware/auth.js';
import { asyncHandler, validate, HttpError, oid, paging, pageMeta } from '../utils/http.js';
import { runReminders } from '../services/reminders.js';

const r = Router();
r.get('/', validate(z.object({ unread: z.enum(['0', '1']).optional(), category: z.string().max(20).optional(), page: z.any().optional(), limit: z.any().optional() }), 'query'), asyncHandler(async (req, res) => {
  const pg = paging(req.query); const f = { user: req.user.id };
  if (req.query.unread === '1') f.isRead = false; if (req.query.category) f.category = req.query.category;
  const [items, total, unreadCount] = await Promise.all([Notification.find(f).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), Notification.countDocuments(f), Notification.countDocuments({ user: req.user.id, isRead: false })]);
  res.json({ items, unreadCount, ...pageMeta(total, pg) });
}));
r.put('/read-all', asyncHandler(async (req, res) => res.json({ updated: (await Notification.updateMany({ user: req.user.id, isRead: false }, { isRead: true })).modifiedCount })));
r.put('/:id/read', validate(z.object({ id: oid }), 'params'), asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { isRead: true }, { new: true });
  if (!n) throw new HttpError(404, 'Notification not found', 'not_found'); res.json({ notification: n });
}));
r.post('/run-reminders', authorize('admin'), asyncHandler(async (_req, res) => res.json({ created: await runReminders(), note: 'In-app notifications only. No email or SMS is sent.' })));
export default r;
