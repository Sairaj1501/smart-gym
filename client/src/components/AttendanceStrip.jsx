// Six-week check-in calendar: the single "memorable" visual of the app. Each square is one day.
const dk = (d) => d.toISOString().slice(0, 10);
export default function AttendanceStrip({ days = [], weeks = 6 }) {
  const set = new Set(days); const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00Z');
  const end = new Date(today); end.setUTCDate(end.getUTCDate() + (6 - today.getUTCDay())); // end of this week (Saturday)
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - (weeks * 7 - 1));
  const cells = []; for (let i = 0; i < weeks * 7; i++) { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); cells.push(d); }
  return <div><div className="grid grid-flow-col grid-rows-7 gap-1" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0,1fr))` }} role="img" aria-label={`${days.length} check-ins in the last ${weeks} weeks`}>{cells.map((d) => { const k = dk(d); const hit = set.has(k); const future = d > today; return <div key={k} title={`${k}${hit ? ' · checked in' : ''}`} className={`aspect-square rounded-[5px] ${future ? 'bg-transparent' : hit ? 'bg-brand' : 'bg-slate-200'}`} />; })}</div><p className="mt-2 text-xs text-slate-500">Green squares are days you checked in.</p></div>;
}
