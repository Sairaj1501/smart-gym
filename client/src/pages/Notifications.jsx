import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { useApi } from '../lib/hooks.js';
import { api, qs } from '../lib/api.js';
import { fmtDateTime, label } from '../lib/format.js';
import { Async, Badge, Card, PageHeader, Pager, Select, useAction } from '../components/ui.jsx';
import { Link } from 'react-router-dom';

export default function Notifications() {
  const { user } = useAuth(); const [cat, setCat] = useState(''); const [unread, setUnread] = useState(''); const [page, setPage] = useState(1); const { run, busy } = useAction();
  const list = useApi(`/notifications${qs({ category: cat, unread, page })}`);
  const read = async (n) => { if (!n.isRead) { await api(`/notifications/${n._id}/read`, { method: 'PUT' }); list.reload(); } };
  return <><PageHeader title="Notifications" subtitle="In-app alerts only. No email or SMS is sent." actions={<><button className="btn btn-ghost" onClick={() => run(() => api('/notifications/read-all', { method: 'PUT' }), 'All marked as read').then(list.reload)}>Mark all read</button>{user.role === 'admin' && <button className="btn btn-dark" disabled={busy} onClick={() => run(() => api('/notifications/run-reminders', { method: 'POST' })).then((r) => r && list.reload())}>Run reminder check</button>}</>} />
    <Card><div className="mb-4 grid max-w-md grid-cols-2 gap-3"><Select label="Category" value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} placeholder="All" options={['membership', 'payment', 'workout', 'diet', 'session', 'attendance', 'goal', 'system']} /><Select label="Show" value={unread} onChange={(e) => { setUnread(e.target.value); setPage(1); }} options={[['', 'All'], ['1', 'Unread only']]} /></div>
      <Async state={list} empty={list.data?.items.length === 0 && { title: 'No notifications', hint: 'Reminders and updates will show up here.' }}><ul className="divide-y divide-slate-100">{list.data?.items.map((n) => <li key={n._id} className={`flex items-start gap-3 py-3 ${n.isRead ? 'opacity-70' : ''}`}><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.isRead ? 'bg-slate-300' : 'bg-brand'}`} /><div className="flex-1"><p className="font-semibold">{n.link ? <Link to={n.link} onClick={() => read(n)} className="hover:underline">{n.title}</Link> : n.title}</p><p className="text-sm text-slate-600">{n.message}</p><p className="mt-0.5 text-xs text-slate-400">{fmtDateTime(n.createdAt)}</p></div><Badge value={n.category} tone="slate" />{!n.isRead && <button className="text-xs font-semibold text-brand-dark" onClick={() => read(n)}>Mark read</button>}</li>)}</ul><Pager meta={list.data} onPage={setPage} /></Async></Card></>;
}
