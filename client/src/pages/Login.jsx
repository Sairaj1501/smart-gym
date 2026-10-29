import { useState } from 'react';
import { Activity } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { Input, ErrorBox } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth(); const [f, setF] = useState({ email: '', password: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await login(f.email, f.password); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  return <div className="grid min-h-screen lg:grid-cols-2">
    <div className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex"><div className="flex items-center gap-2"><Activity className="h-7 w-7 text-brand" /><span className="font-display text-xl font-semibold">Smart Gym</span></div>
      <div><h1 className="font-display text-5xl font-semibold leading-tight">Every visit counted.<br />Every member known.</h1><p className="mt-4 max-w-md text-slate-300">Memberships, attendance, payments, training plans and progress in one place, with alerts when a regular member goes quiet.</p></div>
      <div className="grid grid-cols-7 gap-1.5 opacity-90" aria-hidden>{Array.from({ length: 42 }, (_, i) => <div key={i} className={`aspect-square rounded-md ${[0, 2, 3, 5, 7, 9, 10, 12, 14, 16, 17, 19, 21, 23, 24, 26, 28, 30, 31, 33, 35, 37, 38].includes(i) ? 'bg-brand' : 'bg-navy-700'}`} />)}</div></div>
    <div className="flex items-center justify-center p-6"><form onSubmit={submit} className="w-full max-w-sm space-y-4" noValidate><h2 className="text-2xl font-semibold">Sign in</h2>
      {err && <ErrorBox message={err} />}
      <Input label="Email" type="email" autoComplete="username" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <Input label="Password" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      <button className="btn btn-primary w-full" disabled={busy || !f.email || !f.password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="text-center text-xs text-slate-500">New member or trainer? Your gym creates your account and gives you a temporary password.</p></form></div></div>;
}
