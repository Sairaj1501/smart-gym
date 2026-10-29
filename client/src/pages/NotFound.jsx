import { Link } from 'react-router-dom';
export default function NotFound({ forbidden }) {
  return <div className="mx-auto mt-20 max-w-md text-center"><p className="font-display text-5xl font-semibold text-brand">{forbidden ? '403' : '404'}</p><h1 className="mt-3 text-xl font-semibold">{forbidden ? 'You do not have access to this page' : 'This page does not exist'}</h1><p className="mt-2 text-sm text-slate-500">{forbidden ? 'Your role does not include this area.' : 'Check the address or use the menu.'}</p><Link to="/" className="btn btn-dark mt-6">Back to overview</Link></div>;
}
