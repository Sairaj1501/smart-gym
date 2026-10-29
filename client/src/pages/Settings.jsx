import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { useApi } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { fmtDateTime, fmtDate } from '../lib/format.js';
import { Async, Card, Check, Input, Notice, PageHeader, Select, Table, useAction } from '../components/ui.jsx';

function Password() {
  const { user, setUser } = useAuth(); const { run, busy } = useAction(); const [f, setF] = useState({ currentPassword: '', newPassword: '' }); const [errs, setErrs] = useState({});
  const submit = async (e) => { e.preventDefault(); setErrs({}); if (await run(() => api('/auth/change-password', { method: 'POST', body: f }), 'Password changed', (x) => setErrs(x.fields || {}))) { setF({ currentPassword: '', newPassword: '' }); setUser({ ...user, mustChangePassword: false }); } };
  return <Card title="Change password"><form onSubmit={submit} className="max-w-sm space-y-3" noValidate>{user.mustChangePassword && <Notice tone="amber">You are using a temporary password. Please choose your own before continuing.</Notice>}
    <Input label="Current password" type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} error={errs.currentPassword} /><Input label="New password" type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} error={errs.newPassword} hint="At least 8 characters with a letter and a number" /><button className="btn btn-primary" disabled={busy || !f.currentPassword || !f.newPassword}>Update password</button></form></Card>;
}

function GymSettings() {
  const s = useApi('/settings'); const { reloadSettings } = useAuth(); const { run, busy } = useAction(); const [f, setF] = useState(null);
  const v = f || s.data?.settings; const set = (k) => (e) => setF({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => { const b = { gymName: v.gymName, timezone: v.timezone, expiryWarningDays: Number(v.expiryWarningDays), allowExpiredCheckIn: !!v.allowExpiredCheckIn, renewalPolicy: v.renewalPolicy, inactiveDays: Number(v.inactiveDays), declineRatio: Number(v.declineRatio) }; if (await run(() => api('/settings', { method: 'PUT', body: b }), 'Settings saved')) { setF(null); s.reload(); reloadSettings(); } };
  return <Card title="Gym settings"><Async state={s}>{v && <div className="grid max-w-3xl gap-3 sm:grid-cols-2"><Input label="Gym name" value={v.gymName} onChange={set('gymName')} /><Input label="Time zone" value={v.timezone} onChange={set('timezone')} hint="e.g. Asia/Kolkata" /><Input label="Warn this many days before expiry" type="number" min="1" max="60" value={v.expiryWarningDays} onChange={set('expiryWarningDays')} /><Select label="Renewal policy" value={v.renewalPolicy} onChange={set('renewalPolicy')} options={[['extend', 'Continue from current end date'], ['fromToday', 'Always start today']]} /><Input label="Mark inactive after (days without a visit)" type="number" min="3" max="60" value={v.inactiveDays} onChange={set('inactiveDays')} /><Input label="Declining if recent visits fall to (fraction of usual)" type="number" step="0.05" min="0.1" max="0.9" value={v.declineRatio} onChange={set('declineRatio')} /><div className="sm:col-span-2"><Check checked={!!v.allowExpiredCheckIn} onChange={set('allowExpiredCheckIn')} label="Allow members with expired memberships to check in" /></div><div><button className="btn btn-primary" disabled={busy} onClick={save}>Save settings</button></div></div>}</Async></Card>;
}

function Audit() {
  const a = useApi('/audit-logs?limit=15'); const fb = useApi('/feedback');
  return <><Card title="Recent administrative actions" className="mt-5"><Async state={a} empty={a.data?.items.length === 0 && { title: 'No actions logged yet' }}><Table head={['When', 'Who', 'Action', 'Entity']}>{a.data?.items.map((x) => <tr key={x._id}><td className="td">{fmtDateTime(x.createdAt)}</td><td className="td">{x.actor?.name || '-'} <span className="text-xs text-slate-400">{x.actorRole}</span></td><td className="td font-medium">{x.action}</td><td className="td text-slate-500">{x.entity}</td></tr>)}</Table></Async></Card>
    <Card title="Member feedback" className="mt-5"><Async state={fb} empty={fb.data?.items.length === 0 && { title: 'No feedback yet' }}><ul className="divide-y divide-slate-100 text-sm">{fb.data?.items.map((x) => <li key={x._id} className="py-2"><b>{x.member?.fullName}</b> <span className="text-slate-400">· {x.category.replace('_', ' ')}{x.rating ? ` · ${x.rating}/5` : ''} · {fmtDate(x.createdAt)}</span><p className="text-slate-700">{x.message}</p></li>)}</ul></Async></Card></>;
}

function MemberExtras() {
  const { user } = useAuth(); const m = useApi(`/members/${user.memberId}`); const { run, busy } = useAction(); const [fb, setFb] = useState({ category: 'service', rating: '', message: '' });
  const consent = m.data?.member?.consent?.healthData;
  return <><Card title="Privacy" className="mt-5"><Async state={m}><Check checked={!!consent} onChange={(e) => run(() => api(`/members/${user.memberId}`, { method: 'PUT', body: { consentHealth: e.target.checked } }), e.target.checked ? 'Health tracking turned on' : 'Health tracking turned off').then(m.reload)} label="Allow the gym to store my optional health measurements (weight, BMI, body measurements)" /><p className="mt-2 text-sm text-slate-500">Only you, your assigned trainer and the administrator can see them. Turning this off stops new records; you can delete existing ones from Health & progress.</p></Async></Card>
    <Card title="Send feedback" className="mt-5"><div className="max-w-md space-y-3"><Select label="About" value={fb.category} onChange={(e) => setFb({ ...fb, category: e.target.value })} options={['service', 'facility', 'trainer', 'other']} /><Select label="Rating (optional)" value={fb.rating} onChange={(e) => setFb({ ...fb, rating: e.target.value })} placeholder="No rating" options={[1, 2, 3, 4, 5].map((n) => [n, `${n} / 5`])} /><Input label="Your message" value={fb.message} maxLength="1000" onChange={(e) => setFb({ ...fb, message: e.target.value })} /><button className="btn btn-primary" disabled={busy || fb.message.trim().length < 3} onClick={async () => { if (await run(() => api('/feedback', { method: 'POST', body: { category: fb.category, message: fb.message, ...(fb.rating && { rating: Number(fb.rating) }) } }), 'Thanks for your feedback')) setFb({ category: 'service', rating: '', message: '' }); }}>Send feedback</button></div></Card></>;
}

export default function Settings() {
  const { user } = useAuth();
  return <><PageHeader title="Settings" /><Password />{user.role === 'admin' && <div className="mt-5"><GymSettings /><Audit /></div>}{user.role === 'member' && !user.mustChangePassword && <MemberExtras />}{user.role === 'member' && <p className="mt-5 text-sm text-slate-500">To update your phone, goal or health notes, open <a className="font-semibold text-brand-dark underline" href={`/members/${user.memberId}`}>your profile</a>.</p>}</>;
}
