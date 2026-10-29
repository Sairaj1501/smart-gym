import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { Members, MemberProfile } from './pages/Members.jsx';
import Memberships from './pages/Memberships.jsx';
import Attendance from './pages/Attendance.jsx';
import Trainers from './pages/Trainers.jsx';
import Payments from './pages/Payments.jsx';
import Health from './pages/Health.jsx';
import { Workouts, Diet } from './pages/Plans.jsx';
import Sessions from './pages/Sessions.jsx';
import Notifications from './pages/Notifications.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';
import NotFound from './pages/NotFound.jsx';

const ALL = ['admin', 'staff', 'trainer', 'member'];
const routes = [
  ['/', Dashboard, ALL], ['/members', Members, ['admin', 'staff', 'trainer']], ['/members/:id', MemberProfile, ['admin', 'staff', 'trainer']],
  ['/memberships', Memberships, ['admin', 'staff']], ['/attendance', Attendance, ALL], ['/trainers', Trainers, ['admin', 'staff']],
  ['/workouts', Workouts, ['admin', 'trainer', 'member']], ['/diet', Diet, ['admin', 'trainer', 'member']], ['/health', Health, ['admin', 'trainer', 'member']],
  ['/payments', Payments, ['admin', 'staff', 'member']], ['/sessions', Sessions, ALL], ['/notifications', Notifications, ALL],
  ['/reports', Reports, ['admin', 'staff', 'trainer']], ['/settings', Settings, ALL],
];

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner text="Starting…" />;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  return (
    <Routes>
      <Route element={<Layout />}>
        {routes.map(([path, El, roles]) => <Route key={path} path={path} element={roles.includes(user.role) ? (user.mustChangePassword && path !== '/settings' ? <Navigate to="/settings" /> : <El />) : <NotFound forbidden />} />)}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
