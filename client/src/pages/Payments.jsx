import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { useApi } from '../lib/hooks.js';
import { api, qs } from '../lib/api.js';
import { inr, fmtDate, label } from '../lib/format.js';
import { Async, Badge, Card, Confirm, Empty, Input, Kpi, Notice, PageHeader, Pager, Select, Table, useToast } from '../components/ui.jsx';
import MemberPicker from '../components/MemberPicker.jsx';
import { PaymentModal, Receipt } from './Members.jsx';

export default function Payments() {
  const { user } = useAuth(); const toast = useToast(); const staff = ['admin', 'staff'].includes(user.role);
  const [f, setF] = useState({ from: '', to: '', method: '' }); const [page, setPage] = useState(1); const [member, setMember] = useState(null); const [modal, setModal] = useState(null);
  const list = useApi(staff ? `/payments${qs({ ...f, page })}` : `/payments/member/${user.memberId}`); const day = useApi(staff ? '/payments/daily-summary' : null);
  const due = useApi(member ? `/members/${member._id}` : null);
  const items = list.data?.items || [];
  return <><PageHeader title="Payments" subtitle={staff ? 'Manually recorded payments, receipts and dues.' : 'Your payment history and dues.'} />
    {staff && <><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi title="Collected today" value={inr(day.data?.total)} hint={(day.data?.byMethod || []).map((m) => `${label(m.method)} ${inr(m.total)}`).join(' · ') || 'No payments yet today'} /></div>
      <Card title="Record a payment" className="mt-5"><div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]"><MemberPicker value={member} onChange={setMember} />{member && <button className="btn btn-primary" disabled={due.loading} onClick={() => setModal('pay')}>Record payment</button>}</div>{member && due.data && <p className="mt-2 text-sm text-slate-600">Outstanding for {member.fullName}: <b>{inr(due.data.outstanding)}</b></p>}</Card></>}
    {!staff && list.data && <div className="mb-4"><Notice tone={list.data.outstanding ? 'amber' : 'green'}>{list.data.outstanding ? `Pending balance: ${inr(list.data.outstanding)}. Please pay at the front desk.` : 'You have no pending dues.'}</Notice></div>}
    <Card title="History" className="mt-5">{staff && <div className="mb-4 grid gap-3 sm:grid-cols-3"><Input label="From" type="date" value={f.from} onChange={(e) => { setF({ ...f, from: e.target.value }); setPage(1); }} /><Input label="To" type="date" value={f.to} onChange={(e) => { setF({ ...f, to: e.target.value }); setPage(1); }} /><Select label="Method" value={f.method} onChange={(e) => { setF({ ...f, method: e.target.value }); setPage(1); }} placeholder="All" options={['cash', 'upi', 'card', 'bank_transfer', 'other']} /></div>}
      <Async state={list} empty={items.length === 0 && { title: 'No payments found' }}><Table head={['Receipt', 'Date', ...(staff ? ['Member'] : []), 'Amount', 'Method', 'Status', '']}>{items.map((p) => <tr key={p._id}><td className="td">{p.receiptNo}</td><td className="td">{fmtDate(p.paidAt)}</td>{staff && <td className="td">{p.member?.fullName}</td>}<td className="td font-semibold">{inr(p.amount)}</td><td className="td">{label(p.method)}</td><td className="td"><Badge value={p.status} /></td><td className="td whitespace-nowrap"><button className="font-semibold text-brand-dark" onClick={() => setModal({ receipt: p._id })}>Receipt</button>{user.role === 'admin' && p.status === 'paid' && <button className="ml-3 font-semibold text-rose-600" onClick={() => setModal({ refund: p })}>Refund</button>}</td></tr>)}</Table>{staff && <Pager meta={list.data} onPage={setPage} />}</Async></Card>
    {modal === 'pay' && due.data && <PaymentModal member={member} outstanding={due.data.outstanding} onClose={() => setModal(null)} onDone={() => { toast('Payment recorded'); setModal(null); list.reload(); day.reload(); due.reload(); }} />}
    {modal?.receipt && <Receipt id={modal.receipt} onClose={() => setModal(null)} />}
    {modal?.refund && <Confirm danger title="Refund this payment?" message={`Marks ${modal.refund.receiptNo} (${inr(modal.refund.amount)}) as refunded and adds it back to the member's balance. This does not move any money; refund the member separately.`} confirmLabel="Mark refunded" onClose={() => setModal(null)} onConfirm={async () => { await api(`/payments/${modal.refund._id}/refund`, { method: 'POST' }); toast('Payment marked refunded'); list.reload(); day.reload(); }} />}</>;
}
