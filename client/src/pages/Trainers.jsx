import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useApi } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { Async, Badge, Card, Empty, Input, Modal, Notice, PageHeader, useAction } from '../components/ui.jsx';

function TrainerForm({ t, onClose, onDone }) {
  const { run, busy } = useAction(); const [errs, setErrs] = useState({}); const [temp, setTemp] = useState(null);
  const [f, setF] = useState({ fullName: t?.fullName || '', email: '', phone: t?.phone || '', specialization: t?.specialization || '', experienceYears: t?.experienceYears ?? 0, certifications: (t?.certifications || []).join(', ') });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => { e.preventDefault(); setErrs({});
    const body = { fullName: f.fullName, phone: f.phone, specialization: f.specialization, experienceYears: Number(f.experienceYears), certifications: f.certifications.split(',').map((s) => s.trim()).filter(Boolean), ...(!t && { email: f.email }) };
    const r = await run(() => api(t ? `/trainers/${t._id}` : '/trainers', { method: t ? 'PUT' : 'POST', body }), 'Trainer saved', (x) => setErrs(x.fields || {}));
    if (r) { onDone(); if (r.tempPassword) setTemp(r.tempPassword); else onClose(); } };
  if (temp) return <Modal title="Trainer added" onClose={onClose}><Notice tone="amber">Temporary password: <b className="select-all font-mono text-base">{temp}</b><br />Shown only once. Share it securely.</Notice><div className="mt-4 flex justify-end"><button className="btn btn-dark" onClick={onClose}>Done</button></div></Modal>;
  return <Modal title={t ? 'Edit trainer' : 'Add trainer'} onClose={onClose}><form onSubmit={submit} className="space-y-3" noValidate><Input label="Full name" value={f.fullName} onChange={set('fullName')} error={errs.fullName} />{!t && <Input label="Email (used to sign in)" type="email" value={f.email} onChange={set('email')} error={errs.email} />}<Input label="Phone" value={f.phone} onChange={set('phone')} error={errs.phone} /><Input label="Specialization" value={f.specialization} onChange={set('specialization')} /><Input label="Years of experience" type="number" min="0" value={f.experienceYears} onChange={set('experienceYears')} /><Input label="Certifications (comma separated)" value={f.certifications} onChange={set('certifications')} hint="Listed as declared. Verify documents before relying on them." />
    <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>Save trainer</button></div></form></Modal>;
}

export default function Trainers() {
  const { user } = useAuth(); const d = useApi('/trainers?all=1'); const [edit, setEdit] = useState(null); const admin = user.role === 'admin'; const { run } = useAction();
  return <><PageHeader title="Trainers" subtitle="Workload and availability." actions={admin && <button className="btn btn-primary" onClick={() => setEdit({})}><Plus className="h-4 w-4" />Add trainer</button>} />
    <Async state={d} empty={d.data?.items?.length === 0 && { title: 'No trainers yet', hint: admin ? 'Add a trainer to start assigning members.' : '' }}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{d.data?.items.map((t) => <Card key={t._id}><div className="flex items-start justify-between"><div><h3 className="font-display text-lg font-semibold">{t.fullName}</h3><p className="text-sm text-slate-500">{t.trainerCode} · {t.specialization}</p></div><Badge value={t.employmentStatus} tone={t.employmentStatus === 'active' ? 'green' : 'slate'} /></div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm"><div className="rounded-lg bg-surface p-2"><dt className="text-xs text-slate-500">Members</dt><dd className="font-semibold">{t.assignedMembers}</dd></div><div className="rounded-lg bg-surface p-2"><dt className="text-xs text-slate-500">This month</dt><dd className="font-semibold">{t.sessionsThisMonth}</dd></div><div className="rounded-lg bg-surface p-2"><dt className="text-xs text-slate-500">Upcoming</dt><dd className="font-semibold">{t.upcomingSessions}</dd></div></dl>
      <p className="mt-3 text-sm text-slate-600">{t.phone} · {t.experienceYears} yr experience</p>{t.certifications?.length > 0 && <p className="mt-1 text-xs text-slate-500">Declared: {t.certifications.join(', ')}</p>}
      {admin && <div className="mt-3 flex gap-3 text-sm font-semibold"><button className="text-brand-dark" onClick={() => setEdit(t)}>Edit</button><button className="text-slate-500" onClick={() => run(() => api(`/trainers/${t._id}`, { method: 'PUT', body: { employmentStatus: t.employmentStatus === 'active' ? 'inactive' : 'active' } }), 'Updated').then(d.reload)}>{t.employmentStatus === 'active' ? 'Deactivate' : 'Reactivate'}</button></div>}</Card>)}</div></Async>
    {edit && <TrainerForm t={edit._id ? edit : null} onClose={() => setEdit(null)} onDone={d.reload} />}</>;
}
