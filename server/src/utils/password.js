import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10); // equalises timing for unknown emails
export const genTempPassword = () => `${crypto.randomBytes(6).toString('base64url')}a1`;
export const passwordSchema = z.string().min(8, 'At least 8 characters').max(72).regex(/[A-Za-z]/, 'Include a letter').regex(/\d/, 'Include a number');
