import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useApi } from '../lib/hooks.js';
import { download, qs } from '../lib/api.js';
import { Async, Card, Input, Notice, PageHeader, Pager, Select, useAction } from '../components/ui.jsx';

const ALL = { members: 'Member directory', memberships: 'Memberships and dues', renewals: 'Renewals', attendance: 'Attendance', payments: 'Payment history', pending: 'Pending payments', revenue: 'Revenue by month', trainers: 'Trainer allocation', sessions: 'Personal training sessions', 'fitness-progress': 'Fitness progress summary' };
const ACCESS = { admin: Object.keys(ALL), staff: ['members', 'memberships', 'renewals', 'attendance', 'payments', 'pending'], trainer: ['attendance', 'fitness-progress'] };

export default function Reports() {
  const { user } = useAuth(); const types = ACCESS[user.role]; const [type, setType] = useState(types[0]); const [f, setF] = useState({ from: '', to: '' }); const [page, setPage] = useState(1); const [sort, setSort] = useState(''); const [dir, setDir] = useState('asc'); const { run, busy } = useAction();
  const r = useApi(`/reports/${type}${qs({ ...f, page, sort, dir, limit: 25 })}`);
  const usesDates = ['memberships', 'renewals', 'attendance', 'payments', 'revenue', 'sessions'].includes(type);
  return <><PageHeader title="Reports" subtitle="Generated live from the database and limited to what your role may see." actions={<><button className="btn btn-ghost no-print" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / save as PDF</button><button className="btn btn-primary no-print" disabled={busy} onClick={() => run(() => download(`/reports/${type}${qs({ ...f, format: 'csv' })}`, `${type}.csv`), 'CSV downloaded')}><Download className="h-4 w-4" />Download CSV</button></>} />
    <Card><div className="no-print mb-4 grid gap-3 sm:grid-cols-4"><Select label="Report" value={type} onChange={(e) => { setType(e.target.value); setPage(1); setSort(''); }} options={types.map((t) => [t, ALL[t]])} />{usesDates && <><Input label="From" type="date" value={f.from} onChange={(e) => { setF({ ...f, from: e.target.value }); setPage(1); }} /><Input label="To" type="date" value={f.to} onChange={(e) => { setF({ ...f, to: e.target.value }); setPage(1); }} /></>}</div>
      <div className="print-area"><h2 className="mb-2 hidden text-lg font-semibold print:block">{ALL[type]}</h2>
        <Async state={r} empty={r.data?.items.length === 0 && { title: 'No records for this report', hint: usesDates ? 'Try a wider date range.' : '' }}>{r.data && <><div className="overflow-x-auto"><table className="w-full min-w-[640px]"><thead className="border-b border-slate-200"><tr>{r.data.columns.map((c) => <th key={c.key} className="th"><button className="font-semibold" onClick={() => { setDir(sort === c.key && dir === 'asc' ? 'desc' : 'asc'); setSort(c.key); }}>{c.label}{sort === c.key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>)}</tr></thead><tbody className="divide-y divide-slate-100">{r.data.items.map((row, i) => <tr key={i}>{r.data.columns.map((c) => <td key={c.key} className="td">{String(row[c.key] ?? '')}</td>)}</tr>)}</tbody></table></div><Pager meta={r.data} onPage={setPage} /></>}</Async></div></Card>
    <div className="mt-4"><Notice>PDF export uses your browser's print dialog (choose "Save as PDF"). CSV files neutralise spreadsheet formulas for safety.</Notice></div></>;
}
