import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useApi } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { fmtDateTime } from '../lib/format.js';
import { Async, Badge, Card, Confirm, Input, Modal, Notice, PageHeader, Select, Table, useAction, useToast } from '../components/ui.jsx';
import MemberPicker from '../components/MemberPicker.jsx';

function Schedule({ onClose, onDone }) {
  const { user } = useAuth(); const trainers = useApi(user.role !== 'trainer' ? '/trainers' : null); const { run, busy } = useAction(); const [err, setErr] = useState('');
  const [member, setMember] = useState(null); const [f, setF] = useState({ trainerId: '', start: '', durationMin: 60, notes: '' });
  const submit = async () => { setErr(''); const r = await run(() => api('/sessions', { method: 'POST', body: { memberId: member._id, ...(f.trainerId && { trainerId: f.trainerId }), start: new Date(f.start).toISOString(), durationMin: Number(f.durationMin), notes: f.notes || undefined } }), 'Session scheduled', (x) => setErr(x.message)); if (r) { onDone(); onClose(); } };
  return <Modal title="Schedule a session" onClose={onClose}><div className="space-y-3">{err && <Notice tone="red">{err}</Notice>}<MemberPicker value={member} onChange={setMember} />
    {user.role !== 'trainer' && <Select label="Trainer" value={f.trainerId} onChange={(e) => setF({ ...f, trainerId: e.target.value })} placeholder="Choose a trainer" options={(trainers.data?.items || []).map((t) => [t._id, t.fullName])} />}
    <Input label="Start (your local time)" type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /><Input label="Duration (minutes)" type="number" min="15" max="180" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} /><Input label="Notes (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength="300" />
    <p className="text-xs text-slate-500">The member needs a valid plan that includes personal training. Overlapping bookings for the trainer or member are blocked.</p>
    <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !member || !f.start || (user.role !== 'trainer' && !f.trainerId)} onClick={submit}>Schedule</button></div></div></Modal>;
}

export default function Sessions() {
  const { user } = useAuth(); const toast = useToast(); const [status, setStatus] = useState('scheduled'); const list = useApi(`/sessions?status=${status}`); const [modal, setModal] = useState(null); const { run } = useAction();
  const canSchedule = ['admin', 'staff', 'trainer'].includes(user.role); const [help, setHelp] = useState('');
  return <><PageHeader title="Training sessions" actions={<>{canSchedule && <button className="btn btn-primary" onClick={() => setModal('new')}><Plus className="h-4 w-4" />Schedule</button>}{user.role === 'member' && <button className="btn btn-dark" onClick={() => setModal('help')}>Request trainer help</button>}</>} />
    <Card action={<div className="w-44"><Select label="" value={status} onChange={(e) => setStatus(e.target.value)} options={['scheduled', 'completed', 'cancelled']} /></div>}><Async state={list} empty={list.data?.items.length === 0 && { title: `No ${status} sessions` }}><Table head={['When', 'Member', 'Trainer', 'Length', 'Status', '']}>{list.data?.items.map((s) => <tr key={s._id}><td className="td">{fmtDateTime(s.start)}</td><td className="td">{s.member?.fullName}</td><td className="td">{s.trainer?.fullName}</td><td className="td">{Math.round((new Date(s.end) - new Date(s.start)) / 60000)} min</td><td className="td"><Badge value={s.status} /></td><td className="td whitespace-nowrap">{s.status === 'scheduled' && <>{['admin', 'trainer'].includes(user.role) && new Date(s.start) <= new Date() && <button className="font-semibold text-brand-dark" onClick={() => run(() => api(`/sessions/${s._id}/complete`, { method: 'PUT', body: {} }), 'Marked completed').then(list.reload)}>Complete</button>}<button className="ml-3 font-semibold text-rose-600" onClick={() => setModal({ cancel: s })}>Cancel</button></>}</td></tr>)}</Table></Async></Card>
    {modal === 'new' && <Schedule onClose={() => setModal(null)} onDone={list.reload} />}
    {modal?.cancel && <Confirm danger title="Cancel this session?" message="Both the member and the trainer are notified." confirmLabel="Cancel session" onClose={() => setModal(null)} onConfirm={async () => { await api(`/sessions/${modal.cancel._id}/cancel`, { method: 'PUT', body: {} }); toast('Session cancelled'); list.reload(); }} />}
    {modal === 'help' && <Modal title="Request trainer assistance" onClose={() => setModal(null)}><div className="space-y-3"><Input label="What do you need help with?" value={help} onChange={(e) => setHelp(e.target.value)} maxLength="500" /><div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" disabled={help.trim().length < 3} onClick={async () => { if (await run(() => api('/feedback', { method: 'POST', body: { category: 'trainer_assistance', message: help } }), 'Your trainer has been notified')) { setHelp(''); setModal(null); } }}>Send request</button></div></div></Modal>}</>;
}
