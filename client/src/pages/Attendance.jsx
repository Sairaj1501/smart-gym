import { useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../lib/auth.jsx';
import { useApi } from '../lib/hooks.js';
import { api, qs } from '../lib/api.js';
import { fmtDateTime, todayKey } from '../lib/format.js';
import { Async, Badge, Card, Empty, Input, Notice, PageHeader, Pager, Table, useAction } from '../components/ui.jsx';
import MemberPicker from '../components/MemberPicker.jsx';
import AttendanceStrip from '../components/AttendanceStrip.jsx';

const time = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

function Alerts({ trainer }) {
  const eng = useApi('/attendance/engagement');
  return <Card title="Attendance follow-ups" action={<span className="text-xs text-slate-500">Based on real check-ins. Not a health assessment.</span>}><Async state={eng}>{eng.data?.items.filter((e) => ['inactive', 'declining'].includes(e.status)).length ? <ul className="divide-y divide-slate-100">{eng.data.items.filter((e) => ['inactive', 'declining'].includes(e.status)).map((e) => <li key={e.memberId} className="flex items-start justify-between gap-3 py-2.5"><div><Link className="font-semibold hover:underline" to={`/members/${e.memberId}`}>{e.fullName}</Link> <span className="text-xs text-slate-400">{e.memberCode}</span><p className="text-sm text-slate-500">{e.message}</p></div><Badge value={e.status} /></li>)}</ul> : <Empty title="No attendance concerns right now" />}</Async></Card>;
}

function StaffView() {
  const { user } = useAuth(); const [member, setMember] = useState(null); const [token, setToken] = useState(''); const [date, setDate] = useState(todayKey()); const [page, setPage] = useState(1); const { run, busy } = useAction();
  const list = useApi(`/attendance${qs({ from: date, to: date, page })}`); const canMark = ['admin', 'staff'].includes(user.role); const [msg, setMsg] = useState(null);
  const checkIn = async (body) => { setMsg(null); const r = await run(() => api('/attendance/check-in', { method: 'POST', body }), null, (e) => setMsg({ tone: 'red', text: e.message }));
    if (r) { setMsg({ tone: 'green', text: `${r.member.fullName} checked in${r.membershipState === 'expiring' ? ' (membership expiring soon)' : ''}.` }); setMember(null); setToken(''); list.reload(); } };
  return <><PageHeader title="Attendance" subtitle="Check members in and watch for drop-offs." />
    <div className="grid gap-5 lg:grid-cols-2">
      {canMark && <Card title="Check in a member"><div className="space-y-3">{msg && <Notice tone={msg.tone}>{msg.text}</Notice>}<MemberPicker value={member} onChange={setMember} /><button className="btn btn-primary" disabled={!member || busy} onClick={() => checkIn({ memberId: member._id })}>Check in</button>
        <hr className="border-slate-100" /><Input label="Or paste a member's QR code" placeholder="Scan with a USB scanner or paste the code" value={token} onChange={(e) => setToken(e.target.value)} hint="Camera scanning is not built in; hardware scanners that type text work." /><button className="btn btn-dark" disabled={!token || busy} onClick={() => checkIn({ token })}>Check in with QR</button></div></Card>}
      <Alerts />
      <Card title="Check-ins" className="lg:col-span-2" action={<div className="w-44"><Input label="" type="date" max={todayKey()} value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} /></div>}>
        <Async state={list} empty={list.data?.items?.length === 0 && { title: 'No check-ins on this date' }}><Table head={['Member', 'In', 'Out', 'Method', '']}>{list.data?.items.map((a) => <tr key={a._id}><td className="td font-semibold">{a.member?.fullName} <span className="text-xs font-normal text-slate-400">{a.member?.memberCode}</span></td><td className="td">{time(a.checkInAt)}</td><td className="td">{a.checkOutAt ? time(a.checkOutAt) : '-'}</td><td className="td">{a.method}</td><td className="td">{canMark && !a.checkOutAt && <button className="font-semibold text-brand-dark" onClick={() => run(() => api('/attendance/check-out', { method: 'POST', body: { memberId: a.member._id } }), 'Checked out').then(list.reload)}>Check out</button>}</td></tr>)}</Table><Pager meta={list.data} onPage={setPage} /></Async></Card></div></>;
}

function MemberView() {
  const { user } = useAuth(); const [month, setMonth] = useState(todayKey().slice(0, 7)); const d = useApi(`/attendance/member/${user.memberId}?month=${month}`); const [qr, setQr] = useState(null); const { run } = useAction();
  return <><PageHeader title="My attendance" /><div className="grid gap-5 lg:grid-cols-3"><Card title="Month" className="lg:col-span-2" action={<div className="w-40"><Input label="" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>}><Async state={d}>{d.data && <><p className="mb-3 text-sm text-slate-600"><b>{d.data.summary.attendedDays}</b> visit days out of {d.data.summary.daysElapsed} days so far ({d.data.summary.percentage}%). Percentage = days attended ÷ calendar days elapsed in the month.</p><AttendanceStrip days={d.data.items.map((x) => x.dayKey)} weeks={6} />{d.data.items.length ? <div className="mt-4"><Table head={['Date', 'In', 'Out']}>{d.data.items.map((a) => <tr key={a._id}><td className="td">{a.dayKey}</td><td className="td">{time(a.checkInAt)}</td><td className="td">{a.checkOutAt ? time(a.checkOutAt) : '-'}</td></tr>)}</Table></div> : <Empty title="No visits this month" />}</>}</Async></Card>
    <Card title="My QR code">{qr ? <div className="flex flex-col items-center gap-2"><QRCodeSVG value={qr} size={160} /><p className="text-xs text-slate-500">Expires in 5 minutes.</p></div> : <button className="btn btn-dark" onClick={async () => { const r = await run(() => api('/attendance/qr-token')); if (r) setQr(r.token); }}>Show QR code</button>}</Card></div></>;
}
export default function Attendance() { const { user } = useAuth(); return user.role === 'member' ? <MemberView /> : <StaffView />; }
