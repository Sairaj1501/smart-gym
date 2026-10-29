import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Printer } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useApi, useDebounced } from '../lib/hooks.js';
import { api, newKey, qs } from '../lib/api.js';
import { inr, fmtDate, label, GOALS, LEVELS, todayKey } from '../lib/format.js';
import { Async, Badge, Card, Check, Confirm, Empty, Input, Kpi, Modal, Notice, PageHeader, Pager, Select, Table, useAction, useToast } from '../components/ui.jsx';
import AttendanceStrip from '../components/AttendanceStrip.jsx';

const METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'other'];

function AddMember({ onClose, onDone }) {
  const plans = useApi('/plans'); const trainers = useApi('/trainers'); const { run, busy } = useAction();
  const [f, setF] = useState({ fullName: '', email: '', phone: '', dob: '', gender: 'unspecified', planId: '', trainerId: '', discount: '0', pay: '', method: 'cash', healthConsent: false });
  const [errs, setErrs] = useState({}); const [done, setDone] = useState(null); const [key] = useState(newKey());
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErrs({});
    const body = { fullName: f.fullName, email: f.email, phone: f.phone, dob: f.dob, gender: f.gender, healthConsent: f.healthConsent, idempotencyKey: key, ...(f.planId && { planId: f.planId, discount: Number(f.discount || 0) }), ...(f.trainerId && { trainerId: f.trainerId }), ...(f.pay && { initialPayment: { amount: Number(f.pay), method: f.method } }) };
    const r = await run(() => api('/members', { method: 'POST', body }), 'Member registered', (x) => setErrs(x.fields || {}));
    if (r) setDone(r);
  };
  if (done) return <Modal title="Member registered" onClose={() => { onDone(); onClose(); }}><div className="space-y-3 text-sm"><p><b>{done.member.fullName}</b> ({done.member.memberCode}) was added{done.membership ? ` with the ${done.membership.planSnapshot.name} plan` : ''}.</p><Notice tone="amber">Temporary password: <b className="select-all font-mono text-base">{done.tempPassword}</b><br />Shown only once. Share it securely; the member must change it at first sign-in.</Notice><div className="flex justify-end"><button className="btn btn-dark" onClick={() => { onDone(); onClose(); }}>Done</button></div></div></Modal>;
  return <Modal title="Register member" onClose={onClose} wide><form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
    <Input label="Full name" value={f.fullName} onChange={set('fullName')} error={errs.fullName} required /><Input label="Email" type="email" value={f.email} onChange={set('email')} error={errs.email} required />
    <Input label="Phone" value={f.phone} onChange={set('phone')} error={errs.phone} required /><Input label="Date of birth" type="date" max={todayKey()} value={f.dob} onChange={set('dob')} error={errs.dob} required />
    <Select label="Gender (optional)" value={f.gender} onChange={set('gender')} options={['unspecified', 'male', 'female', 'other']} />
    <Select label="Trainer" value={f.trainerId} onChange={set('trainerId')} placeholder="None yet" options={(trainers.data?.items || []).map((t) => [t._id, t.fullName])} />
    <Select label="Membership plan" value={f.planId} onChange={set('planId')} placeholder="Assign later" options={(plans.data?.items || []).map((p) => [p._id, `${p.name} · ${inr(p.price)}`])} error={errs.planId} />
    <Input label="Discount (₹)" type="number" min="0" value={f.discount} onChange={set('discount')} disabled={!f.planId} />
    <Input label="Amount received now (₹)" type="number" min="0" value={f.pay} onChange={set('pay')} disabled={!f.planId} hint="Leave empty if nothing was paid yet" error={errs['initialPayment.amount']} />
    <Select label="Payment method" value={f.method} onChange={set('method')} options={METHODS} disabled={!f.pay} />
    <div className="sm:col-span-2"><Check checked={f.healthConsent} onChange={set('healthConsent')} label="The member agrees to the gym storing optional health measurements (weight, BMI, body measurements). They can withdraw or delete this at any time." /></div>
    <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Register member'}</button></div></form></Modal>;
}

export function Members() {
  const { user } = useAuth(); const [q, setQ] = useState(''); const dq = useDebounced(q); const [status, setStatus] = useState(''); const [ms, setMs] = useState(''); const [page, setPage] = useState(1); const [add, setAdd] = useState(false);
  const list = useApi(`/members${qs({ q: dq, status, membership: ms, page })}`);
  const canAdd = ['admin', 'staff'].includes(user.role);
  return <><PageHeader title="Members" actions={canAdd && <button className="btn btn-primary" onClick={() => setAdd(true)}><Plus className="h-4 w-4" />Register member</button>} />
    <Card><div className="mb-4 grid gap-3 sm:grid-cols-3"><Input label="Search" placeholder="Name, ID, phone or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /><Select label="Account" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All" options={['active', 'inactive']} /><Select label="Membership" value={ms} onChange={(e) => { setMs(e.target.value); setPage(1); }} placeholder="All" options={['active', 'expiring', 'expired', 'none']} /></div>
      <Async state={list} empty={list.data?.items?.length === 0 && { title: 'No members found', hint: dq || status || ms ? 'Try clearing the filters.' : 'Register the first member to get started.' }}>
        <Table head={['Member', 'Phone', 'Trainer', 'Membership', 'Valid until', 'Due']}>{list.data?.items.map((m) => <tr key={m._id} className="hover:bg-slate-50"><td className="td"><Link to={`/members/${m._id}`} className="font-semibold hover:underline">{m.fullName}</Link><div className="text-xs text-slate-400">{m.memberCode}{m.status === 'inactive' && ' · inactive'}</div></td><td className="td">{m.phone}</td><td className="td">{m.trainer?.fullName || '-'}</td><td className="td"><Badge value={m.membership?.state || 'none'} /></td><td className="td">{m.membership ? fmtDate(m.membership.endDate) : '-'}</td><td className="td">{m.outstanding ? <span className="font-semibold text-amber-700">{inr(m.outstanding)}</span> : '-'}</td></tr>)}</Table>
        <Pager meta={list.data} onPage={setPage} /></Async></Card>
    {add && <AddMember onClose={() => setAdd(false)} onDone={list.reload} />}</>;
}

function EditMember({ m, onClose, onDone, role }) {
  const trainers = useApi(role !== 'member' ? '/trainers' : null); const { run, busy } = useAction(); const [errs, setErrs] = useState({});
  const [f, setF] = useState({ fullName: m.fullName, phone: m.phone, trainerId: m.trainer?._id || m.trainer || '', fitnessGoal: m.fitnessGoal, activityLevel: m.activityLevel, emergencyName: m.emergencyContact?.name || '', emergencyPhone: m.emergencyContact?.phone || '', targetWeightKg: m.targetWeightKg || '', healthConsiderations: m.healthConsiderations || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => { e.preventDefault(); setErrs({});
    const own = role === 'member'; const body = { phone: f.phone, fitnessGoal: f.fitnessGoal, activityLevel: f.activityLevel, emergencyContact: { name: f.emergencyName, phone: f.emergencyPhone }, ...(own ? { targetWeightKg: f.targetWeightKg ? Number(f.targetWeightKg) : null, healthConsiderations: f.healthConsiderations } : { fullName: f.fullName, trainerId: f.trainerId || null }) };
    if (await run(() => api(`/members/${m._id}`, { method: 'PUT', body }), 'Details saved', (x) => setErrs(x.fields || {}))) { onDone(); onClose(); } };
  return <Modal title="Edit details" onClose={onClose}><form onSubmit={submit} className="space-y-3" noValidate>
    {role !== 'member' && <><Input label="Full name" value={f.fullName} onChange={set('fullName')} error={errs.fullName} /><Select label="Trainer" value={f.trainerId} onChange={set('trainerId')} placeholder="None" options={(trainers.data?.items || []).map((t) => [t._id, t.fullName])} /></>}
    <Input label="Phone" value={f.phone} onChange={set('phone')} error={errs.phone} /><Select label="Fitness goal" value={f.fitnessGoal} onChange={set('fitnessGoal')} options={GOALS} /><Select label="Activity level" value={f.activityLevel} onChange={set('activityLevel')} options={LEVELS} />
    <div className="grid grid-cols-2 gap-3"><Input label="Emergency contact" value={f.emergencyName} onChange={set('emergencyName')} /><Input label="Emergency phone" value={f.emergencyPhone} onChange={set('emergencyPhone')} /></div>
    {role === 'member' && <><Input label="Goal weight (kg, optional)" type="number" step="0.1" value={f.targetWeightKg} onChange={set('targetWeightKg')} error={errs.targetWeightKg} /><div><label className="label">Health considerations (optional, voluntary)<textarea className="input mt-1 font-normal" rows="3" maxLength="500" value={f.healthConsiderations} onChange={set('healthConsiderations')} /></label><p className="mt-1 text-xs text-slate-500">Visible only to you, your trainer and the administrator. Plans do not adapt to medical conditions; please consult a professional.</p></div></>}
    <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>Save changes</button></div></form></Modal>;
}

export function PaymentModal({ member, membershipId, outstanding, onClose, onDone }) {
  const { run, busy } = useAction(); const [key] = useState(newKey()); const [f, setF] = useState({ amount: outstanding || '', method: 'cash', note: '' }); const [err, setErr] = useState('');
  const submit = async (e) => { e.preventDefault(); setErr('');
    const r = await run(() => api('/payments', { method: 'POST', body: { memberId: member._id, ...(membershipId && { membershipId }), amount: Number(f.amount), method: f.method, note: f.note || undefined, idempotencyKey: key } }), null, (x) => setErr(x.message));
    if (r) { onDone(r); } };
  return <Modal title={`Record payment · ${member.fullName}`} onClose={onClose}><form onSubmit={submit} className="space-y-3" noValidate>
    <p className="text-sm text-slate-600">Outstanding balance: <b>{inr(outstanding)}</b></p>{err && <Notice tone="red">{err}</Notice>}
    <Input label="Amount (₹)" type="number" min="1" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /><Select label="Method" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} options={METHODS} /><Input label="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength="200" />
    <p className="text-xs text-slate-500">This records a payment received by staff. It is not verified by a payment gateway. Pressing the button twice will not create a second payment.</p>
    <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.amount}>{busy ? 'Saving…' : 'Record payment'}</button></div></form></Modal>;
}

export function Receipt({ id, onClose }) {
  const r = useApi(`/payments/${id}/receipt`); const x = r.data?.receipt;
  return <Modal title="Receipt" onClose={onClose}><Async state={r}>{x && <div className="print-area space-y-2 text-sm"><h3 className="font-display text-xl font-semibold">{x.gymName}</h3><p className="text-slate-500">Receipt {x.receiptNo} · {fmtDate(x.date)}</p><hr /><p><b>{x.member.fullName}</b> ({x.member.memberCode})</p>{x.plan && <p>{x.plan}{x.validity && ` · ${fmtDate(x.validity.from)} to ${fmtDate(x.validity.to)}`}</p>}<p className="text-lg">Amount: <b>{inr(x.amount)}</b> via {label(x.method)} {x.status === 'refunded' && <Badge value="refunded" />}</p>{x.balanceAfter != null && <p>Balance on this membership: {inr(x.balanceAfter)}</p>}<p className="text-xs text-slate-500">{x.verification}. Recorded by {x.recordedBy}.</p></div>}</Async><div className="no-print mt-4 flex justify-end"><button className="btn btn-dark" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</button></div></Modal>;
}

export function MemberProfile() {
  const { id } = useParams(); const { user } = useAuth(); const nav = useNavigate(); const toast = useToast();
  const d = useApi(`/members/${id}`); const plans = useApi(['admin', 'staff'].includes(user.role) ? '/plans' : null);
  const att = useApi(`/attendance/member/${id}`); const pay = useApi(['admin', 'staff'].includes(user.role) ? `/payments/member/${id}` : null);
  const [modal, setModal] = useState(null); const [planId, setPlanId] = useState(''); const { run, busy } = useAction();
  const staff = ['admin', 'staff'].includes(user.role); const m = d.data?.member; const cur = d.data?.currentMembership;
  const reload = () => { d.reload(); pay.reload?.(); };
  return <><PageHeader title={m?.fullName || 'Member'} subtitle={m && `${m.memberCode} · joined ${fmtDate(m.joiningDate)}${m.status === 'inactive' ? ' · account inactive' : ''}`}
    actions={m && <>{staff && <button className="btn btn-ghost" onClick={() => setModal('edit')}>Edit details</button>}{user.role === 'admin' && (m.status === 'active' ? <button className="btn btn-ghost" onClick={() => setModal('deactivate')}>Deactivate</button> : <button className="btn btn-ghost" onClick={() => api(`/members/${id}/activate`, { method: 'POST' }).then(() => { toast('Member reactivated'); d.reload(); })}>Reactivate</button>)}{['admin', 'trainer'].includes(user.role) && <Link className="btn btn-dark" to={`/health?memberId=${id}`}>Health & progress</Link>}</>} />
    <Async state={d}>{m && <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi title="Membership" value={cur ? label(cur.state) : 'None'} hint={cur ? `Ends ${fmtDate(cur.endDate)}` : 'No plan assigned'} tone={cur?.state === 'expired' ? 'bad' : cur?.state === 'expiring' ? 'warn' : ''} /><Kpi title="Outstanding" value={inr(d.data.outstanding)} tone={d.data.outstanding ? 'warn' : ''} /><Kpi title="Visits, last 30 days" value={d.data.attendanceLast30Days} hint={d.data.lastVisit ? `Last visit ${d.data.lastVisit}` : 'No visits yet'} /><Kpi title="Trainer" value={m.trainer?.fullName || '-'} /></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Details"><dl className="grid grid-cols-2 gap-y-2 text-sm"><dt className="text-slate-500">Phone</dt><dd>{m.phone}</dd><dt className="text-slate-500">Email</dt><dd className="break-all">{m.email}</dd><dt className="text-slate-500">Goal</dt><dd>{label(m.fitnessGoal)}</dd><dt className="text-slate-500">Activity</dt><dd>{label(m.activityLevel)}</dd><dt className="text-slate-500">Emergency</dt><dd>{m.emergencyContact?.name ? `${m.emergencyContact.name} · ${m.emergencyContact.phone || ''}` : '-'}</dd>{user.role !== 'staff' && <><dt className="text-slate-500">Health notes</dt><dd>{m.healthConsiderations || '-'}</dd></>}<dt className="text-slate-500">Health tracking consent</dt><dd>{m.consent?.healthData ? 'Given' : 'Not given'}</dd></dl></Card>
        <Card title="Attendance this month" action={att.data && <span className="text-sm text-slate-500">{att.data.summary.attendedDays} of {att.data.summary.daysElapsed} days ({att.data.summary.percentage}%)</span>}><Async state={att}><AttendanceStrip days={(att.data?.items || []).map((x) => x.dayKey)} /></Async></Card>
        {staff && <Card title="Membership" className="lg:col-span-2" action={<div className="flex flex-wrap gap-2">{cur && <button className="btn btn-primary" onClick={() => setModal('renew')}>Renew</button>}<button className="btn btn-ghost" onClick={() => setModal(cur ? 'change' : 'assign')}>{cur ? 'Change plan' : 'Assign plan'}</button>{d.data.outstanding > 0 && <button className="btn btn-ghost" onClick={() => setModal('pay')}>Record payment</button>}</div>}>
          {d.data.membershipHistory.length ? <Table head={['Plan', 'Type', 'Start', 'End', 'State', 'Due', 'Paid']}>{d.data.membershipHistory.map((h) => <tr key={h._id}><td className="td font-medium">{h.planSnapshot.name}</td><td className="td">{label(h.kind)}</td><td className="td">{fmtDate(h.startDate)}</td><td className="td">{fmtDate(h.endDate)}</td><td className="td">{h.status === 'superseded' ? <Badge value="archived" tone="slate" /> : <Badge value={h.state} />}</td><td className="td">{inr(h.amountDue)}</td><td className="td">{inr(h.amountPaid)}</td></tr>)}</Table> : <Empty title="No membership history" />}</Card>}
        {staff && <Card title="Payments" className="lg:col-span-2"><Async state={pay} empty={pay.data?.items?.length === 0 && { title: 'No payments yet' }}><Table head={['Receipt', 'Date', 'Amount', 'Method', 'Status', '']}>{pay.data?.items.map((p) => <tr key={p._id}><td className="td">{p.receiptNo}</td><td className="td">{fmtDate(p.paidAt)}</td><td className="td">{inr(p.amount)}</td><td className="td">{label(p.method)}</td><td className="td"><Badge value={p.status} /></td><td className="td"><button className="font-semibold text-brand-dark" onClick={() => setModal({ receipt: p._id })}>Receipt</button></td></tr>)}</Table></Async></Card>}
      </div></>}</Async>
    {modal === 'edit' && <EditMember m={m} role={user.role} onClose={() => setModal(null)} onDone={reload} />}
    {modal === 'pay' && <PaymentModal member={m} outstanding={d.data.outstanding} onClose={() => setModal(null)} onDone={() => { toast('Payment recorded'); setModal(null); reload(); }} />}
    {modal?.receipt && <Receipt id={modal.receipt} onClose={() => setModal(null)} />}
    {modal === 'deactivate' && <Confirm danger title="Deactivate member?" message="They will no longer be able to sign in or check in. All payment, membership and attendance history is kept." confirmLabel="Deactivate" onClose={() => setModal(null)} onConfirm={async () => { await api(`/members/${id}`, { method: 'DELETE' }); toast('Member deactivated'); d.reload(); }} />}
    {['renew', 'change', 'assign'].includes(modal) && <Modal title={modal === 'renew' ? 'Renew membership' : modal === 'change' ? 'Change plan' : 'Assign plan'} onClose={() => setModal(null)}><div className="space-y-3"><Select label={modal === 'renew' ? 'Plan (leave empty to keep the current one)' : 'Plan'} value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder={modal === 'renew' ? 'Same as current' : 'Choose a plan'} options={(plans.data?.items || []).map((p) => [p._id, `${p.name} · ${inr(p.price)}`])} />
      <Notice>{modal === 'renew' ? 'Renewing before expiry continues from the current end date, so no paid days are lost. After expiry it starts today. The old record is kept.' : modal === 'change' ? 'The current record is kept as history and the new plan starts today. No pro-rata refund is calculated; unpaid balance on the old plan stays owed.' : 'The expiry date is calculated automatically from the plan.'}</Notice>
      <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || (modal !== 'renew' && !planId)} onClick={async () => { const path = modal === 'renew' ? `/memberships/${cur._id}/renew` : modal === 'change' ? `/memberships/member/${id}/change-plan` : '/memberships'; const body = modal === 'assign' ? { memberId: id, planId } : { ...(planId && { planId }) }; if (await run(() => api(path, { method: 'POST', body }), 'Membership updated')) { setModal(null); setPlanId(''); reload(); } }}>Confirm</button></div></div></Modal>}</>;
}
