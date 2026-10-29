import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, Bell, CalendarCheck, ClipboardList, CreditCard, Dumbbell, FileBarChart, HeartPulse, LayoutDashboard, LogOut, Menu, Salad, Settings, Timer, UserCog, Users, X } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useApi } from '../lib/hooks.js';
import ChatWidget from './ChatWidget.jsx';

const NAV = [
  ['/', 'Overview', LayoutDashboard, ['admin', 'staff', 'trainer', 'member']], ['/members', 'Members', Users, ['admin', 'staff', 'trainer']], ['/memberships', 'Memberships', ClipboardList, ['admin', 'staff']],
  ['/attendance', 'Attendance', CalendarCheck, ['admin', 'staff', 'trainer', 'member']], ['/trainers', 'Trainers', UserCog, ['admin', 'staff']], ['/workouts', 'Workout plans', Dumbbell, ['admin', 'trainer', 'member']],
  ['/diet', 'Diet plans', Salad, ['admin', 'trainer', 'member']], ['/health', 'Health & progress', HeartPulse, ['admin', 'trainer', 'member']], ['/payments', 'Payments', CreditCard, ['admin', 'staff', 'member']],
  ['/sessions', 'Sessions', Timer, ['admin', 'staff', 'trainer', 'member']], ['/notifications', 'Notifications', Bell, ['admin', 'staff', 'trainer', 'member']], ['/reports', 'Reports', FileBarChart, ['admin', 'staff', 'trainer']], ['/settings', 'Settings', Settings, ['admin', 'staff', 'trainer', 'member']],
];

export default function Layout() {
  const { user, logout, settings } = useAuth(); const nav = useNavigate(); const [open, setOpen] = useState(false);
  const unread = useApi('/notifications?unread=1&limit=1'); const count = unread.data?.unreadCount || 0;
  const links = NAV.filter(([, , , roles]) => roles.includes(user.role));
  const side = (
    <nav className="flex h-full flex-col bg-ink p-4 text-slate-200" aria-label="Main">
      <div className="mb-6 flex items-center gap-2 px-2"><Activity className="h-6 w-6 text-brand" /><span className="font-display text-lg font-semibold text-white">{settings?.gymName || 'Smart Gym'}</span></div>
      <div className="flex-1 space-y-1 overflow-y-auto">{links.map(([to, name, Icon]) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-brand text-ink' : 'hover:bg-navy-700'}`}><Icon className="h-4 w-4" />{name}{to === '/notifications' && count > 0 && <span className="ml-auto rounded-full bg-rose-500 px-1.5 text-xs text-white">{count}</span>}</NavLink>)}</div>
      <div className="mt-4 border-t border-navy-600 pt-4"><p className="truncate px-2 text-sm font-semibold text-white">{user.name}</p><p className="px-2 text-xs capitalize text-slate-400">{user.role}</p><button onClick={() => { logout(); nav('/'); }} className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-navy-700"><LogOut className="h-4 w-4" />Sign out</button></div>
    </nav>);
  return (
    <div className="min-h-screen lg:flex">
      <aside className="no-print hidden w-64 shrink-0 lg:block"><div className="fixed inset-y-0 w-64">{side}</div></aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-ink/60" onClick={() => setOpen(false)} /><div className="relative h-full w-64">{side}<button className="absolute right-2 top-3 text-white" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button></div></div>}
      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden"><button onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button><span className="font-display font-semibold">{settings?.gymName || 'Smart Gym'}</span></header>
        {settings?.demoData && <div className="no-print bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">Demo data: every member, payment and statistic here is sample data, not real gym records.</div>}
        <main className="mx-auto max-w-7xl p-4 sm:p-6"><Outlet /></main>
      </div>
      {user.role === 'member' && !user.mustChangePassword && <ChatWidget />}
    </div>
  );
}
