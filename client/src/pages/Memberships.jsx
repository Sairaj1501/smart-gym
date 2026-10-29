import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useApi } from '../lib/hooks.js';
import { api, qs } from '../lib/api.js';
import { inr, fmtDate } from '../lib/format.js';
import { Async, Badge, Card, Check, Input, Modal, PageHeader, Pager, Select, Table, useAction } from '../components/ui.jsx';

function PlanForm({ plan, onClose, onDone }) {
  const { run, busy } = useAction(); const [errs, setErrs] = useState({});
  const [f, setF] = useState({ name: plan?.name || '', durationValue: plan?.durationValue || 1, durationUnit: plan?.durationUnit || 'months', price: plan?.price ?? '', description: plan?.description || '', facilities: (plan?.facilities || []).join(', '), includesPersonalTraining: !!plan?.includesPersonalTraining, isActive: plan?.isActive ?? true });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => { e.preventDefault(); setErrs({});
    const body = { ...f, durationValue: Number(f.durationValue), price: Number(f.price), facilities: f.facilities.split(',').map((s) => s.trim()).filter(Boolean) };
    if (await run(() => api(plan ? `/plans/${plan._id}` : '/plans', { method: plan ? 'PUT' : 'POST', body }), 'Plan saved', (x) => setErrs(x.fields || {}))) { onDone(); onClose(); } };
  return <Modal title={plan ? 'Edit plan' : 'New plan'} onClose={onClose}><form onSubmit={submit} className="space-y-3" noValidate>
    <Input label="Plan name" value={f.name} onChange={set('name')} error={errs.name} /><div className="grid grid-cols-2 gap-3"><Input label="Duration" type="number" min="1" value={f.durationValue} onChange={set('durationValue')} error={errs.durationValue} /><Select label="Unit" value={f.durationUnit} onChange={set('durationUnit')} options={['months', 'days']} /></div>
    <Input label="Price (₹)" type="number" min="0" value={f.price} onChange={set('price')} error={errs.price} /><Input label="Description" value={f.description} onChange={set('description')} /><Input label="Facilities (comma separated)" value={f.facilities} onChange={set('facilities')} />
    <Check checked={f.includesPersonalTraining} onChange={set('includesPersonalTraining')} label="Includes personal training sessions" /><Check checked={f.isActive} onChange={set('isActive')} label="Offered to new members" />
    <p className="text-xs text-slate-500">Changing a plan never alters existing memberships; each one keeps the price and duration it was sold at.</p>
    <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>Save plan</button></div></form></Modal>;
}

export default function Memberships() {
  const { user } = useAuth(); const [state, setState] = useState('expiring'); const [page, setPage] = useState(1); const [edit, setEdit] = useState(null);
  const plans = useApi(`/plans${user.role === 'admin' ? '?all=1' : ''}`); const list = useApi(`/memberships${qs({ state, page })}`);
  return <><PageHeader title="Memberships" subtitle="Plans, and who needs to renew." actions={user.role === 'admin' && <button className="btn btn-primary" onClick={() => setEdit({})}><Plus className="h-4 w-4" />New plan</button>} />
    <Card title="Plans"><Async state={plans}><Table head={['Plan', 'Duration', 'Price', 'Personal training', 'Facilities', 'Status', '']}>{plans.data?.items.map((p) => <tr key={p._id}><td className="td font-semibold">{p.name}</td><td className="td">{p.durationValue} {p.durationUnit}</td><td className="td">{inr(p.price)}</td><td className="td">{p.includesPersonalTraining ? 'Yes' : 'No'}</td><td className="td text-slate-500">{(p.facilities || []).join(', ') || '-'}</td><td className="td"><Badge value={p.isActive ? 'active' : 'archived'} /></td><td className="td">{user.role === 'admin' && <button className="font-semibold text-brand-dark" onClick={() => setEdit(p)}>Edit</button>}</td></tr>)}</Table></Async></Card>
    <Card title="Memberships" className="mt-5" action={<div className="w-44"><Select label="" value={state} onChange={(e) => { setState(e.target.value); setPage(1); }} options={['expiring', 'expired', 'active', 'upcoming']} /></div>}>
      <Async state={list} empty={list.data?.items?.length === 0 && { title: `No ${state} memberships` }}><Table head={['Member', 'Plan', 'Ends', 'State', 'Outstanding']}>{list.data?.items.map((m) => <tr key={m._id}><td className="td"><Link className="font-semibold hover:underline" to={`/members/${m.member?._id}`}>{m.member?.fullName}</Link> <span className="text-xs text-slate-400">{m.member?.memberCode}</span></td><td className="td">{m.planSnapshot.name}</td><td className="td">{fmtDate(m.endDate)} <span className="text-slate-400">({m.daysLeft}d)</span></td><td className="td"><Badge value={m.state} /></td><td className="td">{m.outstanding ? inr(m.outstanding) : '-'}</td></tr>)}</Table><Pager meta={list.data} onPage={setPage} /></Async></Card>
    {edit && <PlanForm plan={edit._id ? edit : null} onClose={() => setEdit(null)} onDone={plans.reload} />}</>;
}
