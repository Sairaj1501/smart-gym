import { Setting } from '../models/index.js';
export async function getSettings() {
  try {
    return await Setting.findOneAndUpdate({ key: 'gym' }, { $setOnInsert: { key: 'gym' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  } catch (e) {
    if (e.code === 11000) return Setting.findOne({ key: 'gym' }).lean();
    throw e;
  }
}
