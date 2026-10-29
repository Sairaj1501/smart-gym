import { useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, QrCode } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useApi } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { inr, fmtDate, fmtDateTime, WEEKDAYS } from '../lib/format.js';
import { Async, Badge, Card, Empty, Kpi, PageHeader, Spinner, Table, Notice, useAction } from '../components/ui.jsx';
import { BarC, LineC, PieC } from '../components/charts.jsx';
import AttendanceStrip from '../components/AttendanceStrip.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  return user.role === 'member' ? <MemberDash /> : user.role === 'trainer' ? <TrainerDash /> : <StaffDash />;
}

function EngagementList({ items, linkBase = '/members/' }) {
  const alerts = items.filter((e) => ['inactive', 'declining'].includes(e.status));
  if (!alerts.length) return <Empty title="No attendance concerns" hint="Members who stop or slow down will appear here, based on real check-ins." />;
  return <ul className="divide-y divide-slate-100">{alerts.slice(0, 8).map((e) => <li key={e.memberId} className="flex items-start justify-between gap-3 py-2.5"><div><Link className="font-semibold hover:underline" to={`${linkBase}${e.memberId}`}>{e.fullName}</Link><p className="text-sm text-slate-500">{e.message}</p></div><Badge value={e.status} /></li>)}</ul>;
}

function StaffDash() {
  const { user } = useAuth(); const d = useApi('/analytics/dashboard'); const eng = useApi('/attendance/engagement'); const k = d.data?.kpis; const c = d.data?.charts;
  return <><PageHeader title="Overview" subtitle={d.data ? `Figures as of ${d.data.asOf}, calculated from the database.` : ''} />
    <Async state={d}><>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi title="Registered members" value={k?.totalMembers} hint={`${k?.newThisMonth} new this month`} />
        <Kpi title="Active memberships" value={k?.activeMemberships} hint={`${k?.noMembership} members without a plan`} />
        <Kpi title="Expiring soon" value={k?.expiringSoon} tone={k?.expiringSoon ? 'warn' : ''} hint="Within the warning period" />
        <Kpi title="Expired" value={k?.expired} tone={k?.expired ? 'bad' : ''} />
        <Kpi title="Check-ins today" value={k?.todayAttendance} hint={`${k?.weekAttendance} this week · ${k?.monthAttendance} this month`} />
        <Kpi title="Pending payments" value={inr(k?.outstandingPayments)} tone={k?.outstandingPayments ? 'warn' : ''} />
        {user.role === 'admin' && <Kpi title="Revenue this month" value={inr(k?.monthRevenue)} hint={`${inr(k?.annualRevenue)} this year`} />}
        <Kpi title="Needs follow-up" value={(k?.inactiveMembers || 0) + (k?.decliningMembers || 0)} hint={`${k?.inactiveMembers} inactive · ${k?.decliningMembers} declining`} />
        <Kpi title="Upcoming PT sessions" value={k?.upcomingSessions} />
        <Kpi title="Workouts logged (month)" value={k?.workoutsLoggedThisMonth} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {user.role === 'admin' && <Card title="Revenue by month"><LineC data={c?.revenue} money /></Card>}
        <Card title="Check-ins, last 30 days"><LineC data={c?.attendanceDaily} color="#3B82F6" /></Card>
        <Card title="New registrations"><BarC data={c?.registrations} name="Members" /></Card>
        <Card title="Current plan mix"><PieC data={c?.planDistribution || []} /></Card>
        <Card title="Check-ins by weekday (90 days)"><BarC data={c?.attendanceByWeekday} x="name" color="#22C97A" /></Card>
        <Card title="Peak hours (60 days)"><BarC data={c?.peakHours} x="name" color="#8B5CF6" /></Card>
        <Card title="Renewals by month"><BarC data={c?.renewals} color="#F59E0B" name="Renewals" /></Card>
        <Card title="Trainer workload">{d.data?.trainerWorkload?.length ? <Table head={['Trainer', 'Members', 'Sessions this month']}>{d.data.trainerWorkload.map((t) => <tr key={t.trainer}><td className="td font-medium">{t.trainer}</td><td className="td">{t.members}</td><td className="td">{t.sessionsThisMonth}</td></tr>)}</Table> : <Empty title="No trainers yet" />}</Card>
        <Card title="Attendance follow-ups" action={<Link to="/attendance" className="text-sm font-semibold text-brand-dark">Open</Link>}><Async state={eng}><EngagementList items={eng.data?.items || []} /></Async></Card>
        <Card title="Renewals due soon">{d.data?.renewalsDue?.length ? <ul className="divide-y divide-slate-100">{d.data.renewalsDue.slice(0, 8).map((r) => <li key={r.memberId} className="flex justify-between py-2 text-sm"><Link className="font-medium hover:underline" to={`/members/${r.memberId}`}>{r.planName}</Link><span className="text-slate-500">{r.daysLeft} day(s) left · {fmtDate(r.endDate)}</span></li>)}</ul> : <Empty title="No renewals due" />}</Card>
      </div></></Async></>;
}

function TrainerDash() {
  const d = useApi('/analytics/trainer');
  return <><PageHeader title="My members" subtitle="Only members assigned to you are shown." /><Async state={d}>{d.data && <>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi title="Assigned members" value={d.data.members.length} /><Kpi title="Workout plans to review" value={d.data.pendingReviews.workouts} tone={d.data.pendingReviews.workouts ? 'warn' : ''} /><Kpi title="Diet plans to review" value={d.data.pendingReviews.diets} tone={d.data.pendingReviews.diets ? 'warn' : ''} /><Kpi title="Less active" value={d.data.lessActive.length} /></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Card title="Members who need attention"><EngagementList items={d.data.lessActive} /></Card>
      <Card title="Upcoming sessions">{d.data.upcomingSessions.length ? <ul className="divide-y divide-slate-100">{d.data.upcomingSessions.map((s) => <li key={s._id} className="flex justify-between py-2 text-sm"><span className="font-medium">{s.member?.fullName}</span><span className="text-slate-500">{fmtDateTime(s.start)}</span></li>)}</ul> : <Empty title="No upcoming sessions" />}</Card>
      <Card title="Assigned members" className="lg:col-span-2">{d.data.members.length ? <Table head={['Member', 'Goal', 'Membership', 'Attendance', 'Workout plan']}>{d.data.members.map((m) => <tr key={m._id}><td className="td"><Link className="font-semibold hover:underline" to={`/members/${m._id}`}>{m.fullName}</Link> <span className="text-slate-400">{m.memberCode}</span></td><td className="td">{m.fitnessGoal?.replace(/_/g, ' ')}</td><td className="td">{m.membership ? <Badge value={m.membership.state} /> : <Badge value="none" />}</td><td className="td">{m.engagement ? <Badge value={m.engagement.status} /> : '-'}</td><td className="td">{m.hasActiveWorkoutPlan ? <Badge value="active" /> : <span className="text-slate-400">None</span>}</td></tr>)}</Table> : <Empty title="No members assigned yet" hint="Ask the front desk to assign members to you." />}</Card>
    </div></>}</Async></>;
}

function MemberDash() {
  const { user } = useAuth(); const d = useApi('/analytics/me'); const now = new Date();
  const ym = (off) => { const x = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - off, 1)); return x.toISOString().slice(0, 7); };
  const cur = useApi(`/attendance/member/${user.memberId}?month=${ym(0)}`); const prev = useApi(`/attendance/member/${user.memberId}?month=${ym(1)}`);
  const prog = useApi(d.data?.healthConsent ? `/fitness-progress/${user.memberId}` : null);
  const [qr, setQr] = useState(null); const { run } = useAction();
  const days = [...(cur.data?.items || []), ...(prev.data?.items || [])].map((x) => x.dayKey);
  const m = d.data?.membership; const dow = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' });
  const today = d.data?.workoutPlan?.days.find((x) => WEEKDAYS[x.weekday] === dow);
  return <><PageHeader title={`Hello, ${user.name.split(' ')[0]}`} subtitle="Your week at a glance." /><Async state={d}>{d.data && <>
    {d.data.outstanding > 0 && <div className="mb-4"><Notice tone="amber">You have a pending balance of <b>{inr(d.data.outstanding)}</b>. Please settle it at the front desk.</Notice></div>}
    <div className="grid gap-5 lg:grid-cols-3">
      <Card title="Membership">{m ? <><p className="font-display text-xl font-semibold">{m.planSnapshot.name}</p><p className="mt-1 text-sm text-slate-500">{fmtDate(m.startDate)} to {fmtDate(m.endDate)}</p><div className="mt-3 flex items-center gap-2"><Badge value={m.state} /><span className="text-sm text-slate-600">{m.daysLeft >= 0 ? `${m.daysLeft} day(s) left` : `Expired ${-m.daysLeft} day(s) ago`}</span></div></> : <Empty title="No membership yet" hint="Ask the front desk to assign a plan." />}</Card>
      <Card title="Consistency"><p className="font-display text-3xl font-semibold">{d.data.attendance.thisMonth}<span className="text-base font-normal text-slate-500"> visits this month</span></p><p className="mt-1 text-sm text-slate-500">Current streak: {d.data.attendance.currentStreakDays} day(s)</p><div className="mt-4"><AttendanceStrip days={days} /></div></Card>
      <Card title="Check in" action={<QrCode className="h-4 w-4 text-slate-400" />}>{qr ? <div className="flex flex-col items-center gap-2"><QRCodeSVG value={qr} size={150} /><p className="text-center text-xs text-slate-500">Show this to the front desk. It expires in 5 minutes.</p></div> : <><p className="text-sm text-slate-600">Generate a short-lived QR code for the front desk to scan.</p><button className="btn btn-dark mt-3" onClick={async () => { const r = await run(() => api('/attendance/qr-token')); if (r) setQr(r.token); }}>Show my QR code</button></>}</Card>
      <Card title="Today's workout">{today ? <><p className="text-lg font-semibold">{today.label}</p><Link className="btn btn-primary mt-3" to="/workouts">Open plan</Link></> : d.data.workoutPlan ? <p className="text-sm text-slate-600">Rest day. Your plan: {d.data.workoutPlan.title}.</p> : <Empty title="No active workout plan" action={<Link className="btn btn-dark" to="/workouts">Generate one</Link>} />}</Card>
      <Card title="Nutrition target">{d.data.dietPlan ? <><p className="font-display text-2xl font-semibold">{d.data.dietPlan.targets.kcal} kcal</p><p className="text-sm text-slate-500">{d.data.dietPlan.targets.proteinG} g protein · approximate</p><Link className="btn btn-ghost mt-3" to="/diet">View meals</Link></> : <Empty title="No diet plan yet" action={<Link className="btn btn-dark" to="/diet">Generate one</Link>} />}</Card>
      <Card title="Upcoming sessions">{d.data.upcomingSessions.length ? <ul className="space-y-2 text-sm">{d.data.upcomingSessions.map((s) => <li key={s._id} className="flex justify-between"><span>{s.trainer?.fullName}</span><span className="text-slate-500">{fmtDateTime(s.start)}</span></li>)}</ul> : <Empty title="No sessions booked" />}</Card>
      <Card title="Weight trend" className="lg:col-span-3">{!d.data.healthConsent ? <Notice>Health tracking is off. Turn it on in <Link className="font-semibold underline" to="/settings">Settings</Link> to record weight and see progress charts. Your records stay private.</Notice> : prog.loading ? <Spinner /> : <LineC data={prog.data?.weight || []} x="date" y="weightKg" unit=" kg" />}</Card>
    </div></>}</Async></>;
}
