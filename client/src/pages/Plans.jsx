import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useApi } from '../lib/hooks.js';
import { api, qs } from '../lib/api.js';
import { fmtDate, label, todayKey } from '../lib/format.js';
import { Async, Badge, Card, Check, Empty, Input, Modal, Notice, PageHeader, Select, Table, useAction, useToast } from '../components/ui.jsx';
import MemberPicker from '../components/MemberPicker.jsx';

const csv = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const isReviewer = (r) => ['admin', 'trainer'].includes(r);

function usePlanScope() {
  const { user } = useAuth(); const [picked, setPicked] = useState(null);
  return { user, picked, setPicked, memberId: user.role === 'member' ? user.memberId : picked?._id, picker: user.role !== 'member' };
}
function PlanTable({ list, onOpen, showMember }) {
  return <Async state={list} empty={list.data?.items.length === 0 && { title: 'No plans yet', hint: 'Generate one above.' }}><Table head={[...(showMember ? ['Member'] : []), 'Plan', 'Status', 'Created', '']}>{list.data?.items.map((p) => <tr key={p._id}>{showMember && <td className="td">{p.member?.fullName}</td>}<td className="td font-medium">{p.plan?.title || `Diet plan · ${p.plan?.targets?.kcal} kcal`}{p.requiresProfessionalReview && <span title="Needs professional review"><ShieldAlert className="ml-1 inline h-4 w-4 text-amber-500" /></span>}</td><td className="td"><Badge value={p.status} /></td><td className="td">{fmtDate(p.createdAt)}</td><td className="td"><button className="font-semibold text-brand-dark" onClick={() => onOpen(p._id)}>Open</button></td></tr>)}</Table></Async>;
}
function ReviewBar({ plan, onDone, endpoint, edited }) {
  const { user } = useAuth(); const { run, busy } = useAction(); const [notes, setNotes] = useState(plan.trainerNotes || '');
  if (!isReviewer(user.role) || plan.status === 'archived') return null;
  const act = (action) => run(() => api(`${endpoint}/${plan._id}/review`, { method: 'PUT', body: { action, trainerNotes: notes || undefined, ...(edited && { plan: edited }) } }), action === 'approve' ? 'Plan approved and assigned' : 'Plan archived').then((r) => r && onDone());
  return <div className="mt-4 rounded-xl border border-slate-200 p-3"><Input label="Notes to the member (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength="1000" /><div className="mt-3 flex gap-2"><button className="btn btn-primary" disabled={busy} onClick={() => act('approve')}>{plan.status === 'active' ? 'Save changes' : 'Approve & assign'}</button><button className="btn btn-ghost" disabled={busy} onClick={() => act('archive')}>Archive</button></div></div>;
}
const Disclaimers = ({ plan }) => <>{plan.requiresProfessionalReview && <Notice tone="amber">Flagged for professional review: this member noted a health consideration or limitation. This plan does not adapt to medical conditions.</Notice>}{plan.disclaimer && <p className="mt-3 text-xs text-slate-500">{plan.disclaimer}</p>}</>;

/* ---------------- Workouts ---------------- */
function WorkoutDetail({ id, onClose }) {
  const { user } = useAuth(); const d = useApi(`/workout-plans/${id}`); const [edit, setEdit] = useState({}); const [logging, setLogging] = useState(false);
  const wp = d.data?.plan; const body = wp?.plan; const reviewer = isReviewer(user.role);
  const edited = body && Object.keys(edit).length ? { ...body, days: body.days.map((day) => ({ ...day, exercises: day.exercises.map((ex, i) => ({ ...ex, ...(edit[`${day.dayNumber}-${i}`] || {}) })) })) } : undefined;
  return <Modal title={body?.title || 'Workout plan'} onClose={onClose} wide><Async state={d}>{wp && <>
    <div className="mb-3 flex flex-wrap items-center gap-2"><Badge value={wp.status} /><span className="text-sm text-slate-500">{wp.member?.fullName} · {label(body.level)} · {body.durationMin} min</span>{wp.status === 'active' && user.role === 'member' && <button className="btn btn-primary ml-auto" onClick={() => setLogging(true)}>Log a workout</button>}</div>
    {wp.coachNote && <Notice>{wp.coachNote}</Notice>}
    <div className="mt-3 space-y-4">{body.days.map((day) => <div key={day.dayNumber}><h3 className="font-semibold">Day {day.dayNumber}: {day.label}</h3><Table head={['Exercise', 'Muscle', 'Sets', 'Reps / time', 'Rest', 'How']}>{day.exercises.map((ex, i) => { const k = `${day.dayNumber}-${i}`; const e = edit[k] || {}; return <tr key={k}><td className="td font-medium">{ex.name}</td><td className="td">{ex.muscle}</td><td className="td">{reviewer ? <input className="input !w-14 !py-1" type="number" min="1" max="10" value={e.sets ?? ex.sets} onChange={(x) => setEdit({ ...edit, [k]: { ...e, sets: Number(x.target.value) } })} /> : ex.sets}</td><td className="td">{reviewer ? <input className="input !w-24 !py-1" value={e.reps ?? ex.reps} onChange={(x) => setEdit({ ...edit, [k]: { ...e, reps: x.target.value } })} /> : ex.reps}</td><td className="td">{ex.restSec ? `${ex.restSec}s` : '-'}</td><td className="td max-w-xs text-xs text-slate-500">{ex.instructions}</td></tr>; })}</Table></div>)}</div>
    <ul className="mt-3 list-disc pl-5 text-sm text-slate-600">{body.notes?.map((n) => <li key={n}>{n}</li>)}</ul><Disclaimers plan={body} />
    <ReviewBar plan={wp} endpoint="/workout-plans" edited={edited} onDone={() => { d.reload(); onClose(true); }} />
    {logging && <LogWorkout plan={wp} onClose={() => setLogging(false)} />}</>}</Async></Modal>;
}
function LogWorkout({ plan, onClose }) {
  const [day, setDay] = useState(plan.plan.days[0].dayNumber); const cur = plan.plan.days.find((x) => x.dayNumber === Number(day)); const { run, busy } = useAction(); const [rows, setRows] = useState({}); const [safety, setSafety] = useState('');
  const setRow = (i, k, v) => setRows({ ...rows, [i]: { ...(rows[i] || {}), [k]: v } });
  const submit = async () => {
    const exercises = cur.exercises.map((ex, i) => { const r = rows[i] || {}; const top = Number(String(ex.reps).match(/\d+/g)?.pop() || 0); return { name: ex.name, exerciseId: ex.exerciseId, targetSets: ex.sets, targetRepsMax: top, setsDone: Number(r.sets ?? 0), minReps: Number(r.reps ?? 0), ...(r.kg && { weightKg: Number(r.kg) }), discomfort: !!r.pain }; }).filter((e) => e.setsDone > 0);
    if (!exercises.length) return;
    const r = await run(() => api(`/workout-plans/${plan._id}/log`, { method: 'POST', body: { dayNumber: cur.dayNumber, exercises } }), 'Workout logged'); if (r) { if (r.safetyNote) setSafety(r.safetyNote); else onClose(); } };
  if (safety) return <Modal title="Please read" onClose={onClose}><Notice tone="amber">{safety}</Notice><div className="mt-4 flex justify-end"><button className="btn btn-dark" onClick={onClose}>OK</button></div></Modal>;
  return <Modal title="Log a workout" onClose={onClose} wide><Select label="Day" value={day} onChange={(e) => { setDay(e.target.value); setRows({}); }} options={plan.plan.days.map((x) => [x.dayNumber, `Day ${x.dayNumber}: ${x.label}`])} />
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr><th className="th">Exercise</th><th className="th">Sets done</th><th className="th">Reps (lowest set)</th><th className="th">Weight kg</th><th className="th">Discomfort</th></tr></thead><tbody>{cur.exercises.map((ex, i) => <tr key={i}><td className="td">{ex.name}<div className="text-xs text-slate-400">{ex.sets} × {ex.reps}</div></td><td className="td"><input className="input !w-16 !py-1" type="number" min="0" max="20" onChange={(e) => setRow(i, 'sets', e.target.value)} /></td><td className="td"><input className="input !w-16 !py-1" type="number" min="0" onChange={(e) => setRow(i, 'reps', e.target.value)} /></td><td className="td"><input className="input !w-20 !py-1" type="number" min="0" step="0.5" onChange={(e) => setRow(i, 'kg', e.target.value)} /></td><td className="td"><input type="checkbox" className="h-4 w-4 accent-rose-500" onChange={(e) => setRow(i, 'pain', e.target.checked)} aria-label={`Discomfort during ${ex.name}`} /></td></tr>)}</tbody></table></div>
    <p className="mt-2 text-xs text-slate-500">Tick "Discomfort" if anything hurt. Stop that exercise and tell your trainer. Leave sets empty for exercises you skipped.</p><div className="mt-4 flex justify-end gap-2"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={submit}>Save log</button></div></Modal>;
}
export function Workouts() {
  const { user, settings } = useAuth(); const s = usePlanScope(); const list = useApi(`/workout-plans${qs({ memberId: s.memberId })}`); const prog = useApi(user.role === 'member' ? `/workout-plans/member/${user.memberId}/progression` : null);
  const [open, setOpen] = useState(null); const { run, busy } = useAction(); const [err, setErr] = useState('');
  const [f, setF] = useState({ goal: 'general_fitness', level: 'beginner', daysPerWeek: 3, durationMin: 45, equipment: 'gym', limitations: '', useAI: false });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const gen = async () => { setErr(''); const r = await run(() => api('/workout-plans/generate', { method: 'POST', body: { ...f, daysPerWeek: Number(f.daysPerWeek), durationMin: Number(f.durationMin), limitations: f.limitations || undefined, ...(s.picker && { memberId: s.memberId }) } }), 'Plan generated', (x) => setErr(x.message)); if (r) { list.reload(); setOpen(r.plan._id); } };
  return <><PageHeader title="Workout plans" subtitle={user.role === 'member' ? 'Generate a suggested plan; your trainer reviews it before it goes live.' : 'Review plans and assign them to members.'} />
    <Card title="Generate a suggested plan">{s.picker && <div className="mb-3 max-w-md"><MemberPicker value={s.picked} onChange={s.setPicked} /></div>}{err && <div className="mb-3"><Notice tone="red">{err}</Notice></div>}
      <div className="grid gap-3 sm:grid-cols-3"><Select label="Goal" value={f.goal} onChange={set('goal')} options={['general_fitness', 'strength', 'muscle_building', 'weight_management', 'cardio', 'flexibility']} /><Select label="Experience" value={f.level} onChange={set('level')} options={['beginner', 'intermediate', 'advanced']} /><Select label="Equipment" value={f.equipment} onChange={set('equipment')} options={[['gym', 'Full gym'], ['dumbbells', 'Dumbbells only'], ['bodyweight', 'No equipment (home)']]} /><Select label="Days per week" value={f.daysPerWeek} onChange={set('daysPerWeek')} options={[2, 3, 4, 5, 6].map((n) => [n, `${n} days`])} /><Input label="Minutes per session" type="number" min="20" max="120" value={f.durationMin} onChange={set('durationMin')} /><Input label="Limitations (optional)" placeholder="e.g. sore knees" value={f.limitations} onChange={set('limitations')} maxLength="300" hint="Anything entered here sends the plan for trainer review. It does not adapt exercises." /></div>
      {settings?.aiConfigured && <div className="mt-3"><Check checked={f.useAI} onChange={set('useAI')} label="Add a plain-language explanation written by AI (it cannot change the exercises)" /></div>}
      <button className="btn btn-primary mt-4" disabled={busy || (s.picker && !s.memberId)} onClick={gen}>{busy ? 'Generating…' : 'Generate plan'}</button><p className="mt-3 text-xs text-slate-500">Plans are produced by fixed rules (goal, level, days, equipment), not by a trained model. General fitness suggestions only; they do not replace professional advice.</p></Card>
    <Card title="Plans" className="mt-5"><PlanTable list={list} onOpen={setOpen} showMember={user.role !== 'member'} /></Card>
    {prog.data?.items?.length > 0 && <Card title="Progression suggestions" className="mt-5"><ul className="divide-y divide-slate-100 text-sm">{prog.data.items.map((p) => <li key={p.exercise} className="flex gap-3 py-2"><Badge value={p.action} tone={p.action === 'increase' ? 'green' : p.action === 'hold' ? 'amber' : 'slate'} /><span><b>{p.exercise}</b> · {p.message}</span></li>)}</ul><p className="mt-2 text-xs text-slate-500">{prog.data.note}</p></Card>}
    {open && <WorkoutDetail id={open} onClose={(changed) => { setOpen(null); if (changed) list.reload(); }} />}</>;
}

/* ---------------- Diet ---------------- */
function DietDetail({ id, onClose }) {
  const { user } = useAuth(); const d = useApi(`/diet-plans/${id}`); const ad = useApi(`/diet-plans/${id}/adherence`); const [day, setDay] = useState(0); const { run } = useAction();
  const dp = d.data?.plan; const body = dp?.plan; const followed = new Set((ad.data?.items || []).filter((a) => a.followed && a.dayKey === todayKey()).map((a) => a.slot));
  return <Modal title="Diet plan" onClose={onClose} wide><Async state={d}>{dp && <>
    <div className="mb-3 flex flex-wrap items-center gap-2"><Badge value={dp.status} /><span className="text-sm text-slate-500">{dp.member?.fullName}</span></div>
    <Notice tone="amber">Approximate values from sample food data. Informational only, not medical nutrition therapy.</Notice>
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Calories', `${body.targets.kcal}`], ['Protein', `${body.targets.proteinG} g`], ['Carbs', `${body.targets.carbsG} g`], ['Fat', `${body.targets.fatG} g`]].map(([k, v]) => <div key={k} className="rounded-lg bg-surface p-3 text-center"><p className="text-xs text-slate-500">{k} target</p><p className="font-display text-lg font-semibold">{v}</p></div>)}</div>
    {dp.coachNote && <div className="mt-3"><Notice>{dp.coachNote}</Notice></div>}{body.warnings?.map((w) => <div key={w} className="mt-3"><Notice tone="amber">{w}</Notice></div>)}
    <div className="mt-4 flex flex-wrap gap-1">{body.days.map((x, i) => <button key={i} className={`rounded-lg px-3 py-1 text-sm font-semibold ${i === day ? 'bg-ink text-white' : 'bg-surface'}`} onClick={() => setDay(i)}>Day {x.day}</button>)}</div>
    <div className="mt-3 space-y-3">{body.days[day].meals.map((m) => <div key={m.slot} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between"><h3 className="font-semibold">{m.slot}</h3><span className="text-sm text-slate-500">{m.totals.kcal} kcal · {m.totals.proteinG} g protein</span></div><ul className="mt-1 text-sm text-slate-700">{m.items.map((i) => <li key={i.foodId}>{i.servings} × {i.serving} {i.name}</li>)}</ul>{user.role === 'member' && dp.status === 'active' && day === 0 && <div className="mt-2"><Check checked={followed.has(m.slot)} onChange={(e) => run(() => api(`/diet-plans/${id}/adherence`, { method: 'POST', body: { slot: m.slot, followed: e.target.checked } })).then(ad.reload)} label="I followed this meal today" /></div>}</div>)}</div>
    <p className="mt-3 text-sm text-slate-600">Day total: {body.days[day].totals.kcal} kcal · {body.days[day].totals.proteinG} g protein · {body.days[day].totals.carbsG} g carbs · {body.days[day].totals.fatG} g fat</p><p className="mt-2 text-sm text-slate-600">{body.hydration}</p>
    {ad.data?.summary?.mealsLogged > 0 && <p className="mt-2 text-sm"><b>Adherence:</b> {ad.data.summary.percentFollowed}% of meals on {ad.data.summary.daysTracked} tracked day(s). {ad.data.summary.note}</p>}
    <Disclaimers plan={body} /><ReviewBar plan={dp} endpoint="/diet-plans" onDone={() => { d.reload(); onClose(true); }} /></>}</Async></Modal>;
}
export function Diet() {
  const { user, settings } = useAuth(); const s = usePlanScope(); const list = useApi(`/diet-plans${qs({ memberId: s.memberId })}`); const [open, setOpen] = useState(null); const { run, busy } = useAction(); const [err, setErr] = useState('');
  const [f, setF] = useState({ dietType: 'vegetarian', allergies: '', intolerances: '', dislikedFoods: '', mealsPerDay: 4, heightCm: '', weightKg: '', goal: '', useAI: false });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const gen = async () => { setErr(''); const body = { dietType: f.dietType, allergies: csv(f.allergies), intolerances: csv(f.intolerances), dislikedFoods: csv(f.dislikedFoods), mealsPerDay: Number(f.mealsPerDay), useAI: f.useAI, ...(f.heightCm && { heightCm: Number(f.heightCm) }), ...(f.weightKg && { weightKg: Number(f.weightKg) }), ...(f.goal && { goal: f.goal }), ...(s.picker && { memberId: s.memberId }) };
    const r = await run(() => api('/diet-plans/generate', { method: 'POST', body }), 'Plan generated', (x) => setErr(x.message)); if (r) { list.reload(); setOpen(r.plan._id); } };
  return <><PageHeader title="Diet plans" subtitle="General meal suggestions from your preferences and allergies." />
    <Card title="Generate a suggested plan">{s.picker && <div className="mb-3 max-w-md"><MemberPicker value={s.picked} onChange={s.setPicked} /></div>}{err && <div className="mb-3"><Notice tone="red">{err}</Notice></div>}
      <div className="grid gap-3 sm:grid-cols-3"><Select label="Diet preference" value={f.dietType} onChange={set('dietType')} options={['vegetarian', 'vegan', 'eggetarian', 'non_vegetarian']} /><Select label="Meals per day" value={f.mealsPerDay} onChange={set('mealsPerDay')} options={[3, 4, 5].map((n) => [n, `${n} meals`])} /><Select label="Goal (default: your profile)" value={f.goal} onChange={set('goal')} placeholder="Use profile goal" options={['general_fitness', 'weight_management', 'muscle_building', 'strength', 'consistency', 'maintain']} />
        <Input label="Allergies" placeholder="e.g. peanuts, dairy" value={f.allergies} onChange={set('allergies')} hint="Comma separated. These foods are never included." /><Input label="Intolerances" placeholder="e.g. lactose, gluten" value={f.intolerances} onChange={set('intolerances')} /><Input label="Foods to avoid" placeholder="e.g. banana" value={f.dislikedFoods} onChange={set('dislikedFoods')} />
        <Input label="Height (cm)" type="number" value={f.heightCm} onChange={set('heightCm')} hint="Leave empty to use your latest recorded value" /><Input label="Weight (kg)" type="number" step="0.1" value={f.weightKg} onChange={set('weightKg')} /></div>
      {settings?.aiConfigured && <div className="mt-3"><Check checked={f.useAI} onChange={set('useAI')} label="Add a plain-language explanation written by AI (it cannot change foods or calories)" /></div>}
      <button className="btn btn-primary mt-4" disabled={busy || (s.picker && !s.memberId)} onClick={gen}>{busy ? 'Generating…' : 'Generate plan'}</button>
      <p className="mt-3 text-xs text-slate-500">Plans are built by rules (Mifflin-St Jeor estimate, modest goal adjustment, a safe calorie floor and a sample food database), not by a trained model. Adults only. Not medical advice; if you have a medical or dietary condition, see a doctor or registered dietitian.</p></Card>
    <Card title="Plans" className="mt-5"><PlanTable list={list} onOpen={setOpen} showMember={user.role !== 'member'} /></Card>
    {open && <DietDetail id={open} onClose={(changed) => { setOpen(null); if (changed) list.reload(); }} />}</>;
}
