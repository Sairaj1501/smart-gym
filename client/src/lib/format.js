export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
export const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const label = (s) => String(s || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const TONE = { active: 'green', expiring: 'amber', expired: 'red', upcoming: 'blue', none: 'slate', inactive: 'red', declining: 'amber', engaged: 'green', new: 'blue', paid: 'green', refunded: 'slate', pending_review: 'amber', archived: 'slate', scheduled: 'blue', completed: 'green', cancelled: 'slate' };
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const GOALS = ['general_fitness', 'weight_management', 'muscle_building', 'strength', 'consistency', 'maintain'];
export const LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
