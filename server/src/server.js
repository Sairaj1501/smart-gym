import mongoose from 'mongoose';
import { env, assertEnv } from './config/env.js';
import { createApp } from './app.js';
import { runReminders } from './services/reminders.js';

assertEnv();
mongoose.set('strictQuery', true);
await mongoose.connect(env.mongoUri);
console.log('MongoDB connected');
await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // build unique indexes before serving traffic

const app = createApp();
app.listen(env.port, () => console.log(`API listening on http://localhost:${env.port}`));

// Simple in-process scheduler (fine for one instance). Idempotent thanks to notification dedupe keys.
const tick = () => runReminders().then((c) => console.log('Reminders run', c)).catch((e) => console.error('Reminder job failed', e.message));
setTimeout(tick, 10_000);
setInterval(tick, 6 * 60 * 60 * 1000);
