import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { X, Loader2, Inbox, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { label, TONE } from '../lib/format.js';

const TONES = { green: 'bg-emerald-50 text-emerald-700 ring-emerald-200', amber: 'bg-amber-50 text-amber-800 ring-amber-200', red: 'bg-rose-50 text-rose-700 ring-rose-200', blue: 'bg-sky-50 text-sky-700 ring-sky-200', slate: 'bg-slate-100 text-slate-600 ring-slate-200' };
export const Badge = ({ value, tone }) => <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${TONES[tone || TONE[value] || 'slate']}`}>{label(value)}</span>;

export const Spinner = ({ text = 'Loading…' }) => <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin" />{text}</div>;
export const Empty = ({ title = 'Nothing here yet', hint, action }) => <div className="flex flex-col items-center gap-2 py-10 text-center"><Inbox className="h-8 w-8 text-slate-300" /><p className="font-semibold text-slate-600">{title}</p>{hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}{action}</div>;
export const ErrorBox = ({ message, onRetry }) => <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1">{message}</div>{onRetry && <button className="font-semibold underline" onClick={onRetry}>Try again</button>}</div>;
export const Notice = ({ children, tone = 'blue' }) => <div className={`rounded-xl p-3 text-sm ring-1 ${TONES[tone]}`}>{children}</div>;
export const Async = ({ state, children, empty }) => state.loading ? <Spinner /> : state.error ? <ErrorBox message={state.error} onRetry={state.reload} /> : empty ? <Empty {...empty} /> : children;

export const PageHeader = ({ title, subtitle, actions }) => <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div><div className="flex flex-wrap gap-2">{actions}</div></div>;
export const Card = ({ title, action, children, className = '' }) => <section className={`card ${className}`}>{(title || action) && <div className="mb-3 flex items-center justify-between gap-2">{title && <h2 className="text-base font-semibold">{title}</h2>}{action}</div>}{children}</section>;
export const Kpi = ({ title, value, hint, tone }) => <div className="card !p-4"><p className="text-sm text-slate-500">{title}</p><p className={`mt-1 font-display text-2xl font-semibold ${tone === 'warn' ? 'text-amber-600' : tone === 'bad' ? 'text-rose-600' : ''}`}>{value}</p>{hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}</div>;

export function Field({ label: l, error, hint, children }) {
  return <div><label className="label">{l}{children}</label>{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}{error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}</div>;
}
export const Input = ({ label: l, error, hint, ...p }) => <div><label className="label">{l}<input className="input mt-1 font-normal" {...p} /></label>{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}{error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}</div>;
export const Select = ({ label: l, error, options, placeholder, ...p }) => <div><label className="label">{l}<select className="input mt-1 font-normal" {...p}>{placeholder !== undefined && <option value="">{placeholder}</option>}{options.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, label(o)]; return <option key={v} value={v}>{t}</option>; })}</select></label>{error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}</div>;
export const Check = ({ label: l, ...p }) => <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-500" {...p} /><span>{l}</span></label>;

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2><button className="rounded p-1 hover:bg-slate-100" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div>{children}
    </div></div>;
}
export function Confirm({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return <Modal title={title} onClose={onClose}><p className="text-sm text-slate-600">{message}</p><div className="mt-5 flex justify-end gap-2"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); onClose(); } }}>{confirmLabel}</button></div></Modal>;
}

export const Table = ({ head, children }) => <div className="overflow-x-auto"><table className="w-full min-w-[640px]"><thead className="border-b border-slate-200"><tr>{head.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{children}</tbody></table></div>;
export const Pager = ({ meta, onPage }) => meta && meta.pages > 1 ? <div className="mt-3 flex items-center justify-between text-sm text-slate-500"><span>{meta.total} records</span><div className="flex items-center gap-2"><button className="btn btn-ghost !py-1" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Previous</button><span>Page {meta.page} of {meta.pages}</span><button className="btn btn-ghost !py-1" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>Next</button></div></div> : null;

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'ok') => { const id = Math.random(); setItems((x) => [...x, { id, message, tone }]); setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500); }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">{items.map((t) => <div key={t.id} className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${t.tone === 'err' ? 'bg-rose-600' : 'bg-ink'}`}>{t.tone === 'err' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-brand" />}{t.message}</div>)}</div></ToastCtx.Provider>;
}

/** Runs an async action with toast feedback. Returns the result or undefined on failure; fieldErrors via onError. */
export function useAction() {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const run = async (fn, okMsg, onError) => { setBusy(true); try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { onError?.(e); toast(e.message, 'err'); } finally { setBusy(false); } };
  return { run, busy };
}
