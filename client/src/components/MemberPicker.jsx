import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { useApi, useDebounced } from '../lib/hooks.js';

export default function MemberPicker({ value, onChange, label = 'Member' }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const res = useApi(dq.length >= 2 && !value ? `/members?q=${encodeURIComponent(dq)}&limit=6&status=active` : null);
  if (value) return <div><span className="label">{label}</span><div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"><span><b>{value.fullName}</b> <span className="text-slate-500">{value.memberCode}</span></span><button type="button" onClick={() => onChange(null)} aria-label="Change member"><X className="h-4 w-4" /></button></div></div>;
  return <div className="relative"><label className="label">{label}<div className="relative mt-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className="input pl-9 font-normal" placeholder="Search by name, ID or phone" value={q} onChange={(e) => setQ(e.target.value)} /></div></label>
    {dq.length >= 2 && <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">{res.loading ? <li className="p-3 text-sm text-slate-500">Searching…</li> : res.data?.items?.length ? res.data.items.map((m) => <li key={m._id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { onChange(m); setQ(''); }}><b>{m.fullName}</b> <span className="text-slate-500">{m.memberCode} · {m.phone}</span></button></li>) : <li className="p-3 text-sm text-slate-500">No matching member</li>}</ul>}</div>;
}
