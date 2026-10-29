import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { api } from '../lib/api.js';

export default function ChatWidget() {
  const [open, setOpen] = useState(false); const [msgs, setMsgs] = useState([{ role: 'assistant', content: 'Hi! Ask me about your membership, check-ins, plans or fitness terms. I cannot give medical advice.' }]); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, open]);
  const send = async (e) => { e.preventDefault(); const t = text.trim(); if (!t || busy) return; setText(''); const history = msgs.slice(1).map(({ role, content }) => ({ role, content })); setMsgs((m) => [...m, { role: 'user', content: t }]); setBusy(true);
    try { const r = await api('/chat', { method: 'POST', body: { message: t, history } }); setMsgs((m) => [...m, { role: 'assistant', content: r.reply, source: r.source }]); } catch (x) { setMsgs((m) => [...m, { role: 'assistant', content: `Sorry, I could not answer: ${x.message}`, error: true }]); } finally { setBusy(false); } };
  return <div className="no-print fixed bottom-4 right-4 z-40">{open ? <div className="flex h-[28rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200" role="dialog" aria-label="Fitness assistant">
    <div className="flex items-center justify-between bg-ink px-4 py-3 text-white"><span className="font-display font-semibold">Fitness assistant</span><button onClick={() => setOpen(false)} aria-label="Close chat"><X className="h-4 w-4" /></button></div>
    <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm" aria-live="polite">{msgs.map((m, i) => <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 ${m.role === 'user' ? 'ml-auto bg-brand text-ink' : m.error ? 'bg-rose-50 text-rose-700' : 'bg-surface'}`}>{m.content}{m.source === 'rules' && <span className="mt-1 block text-[10px] text-slate-400">Automated reply</span>}</div>)}{busy && <div className="w-20 rounded-2xl bg-surface px-3 py-2 text-slate-400">Typing…</div>}<div ref={end} /></div>
    <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-2"><input className="input" placeholder="Type a question" value={text} maxLength="500" onChange={(e) => setText(e.target.value)} aria-label="Message" /><button className="btn btn-primary !px-3" disabled={busy || !text.trim()} aria-label="Send"><Send className="h-4 w-4" /></button></form></div>
    : <button onClick={() => setOpen(true)} className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-brand shadow-xl hover:bg-navy-700" aria-label="Open fitness assistant"><MessageCircle /></button>}</div>;
}
