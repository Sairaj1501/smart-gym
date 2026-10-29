import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { Empty } from './ui.jsx';

const COLORS = ['#22C97A', '#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6'];
const axis = { fontSize: 11, fill: '#64748B' };
const Wrap = ({ data, children, height = 240, valueKey = 'value' }) => !data?.length || data.every((d) => !(d[valueKey] ?? d.weightKg)) ? <Empty title="No data yet" hint="This chart fills in as records are added." /> : <div style={{ height }} role="img"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>;
const short = (k) => (typeof k === 'string' && k.length >= 7 && k[4] === '-' ? k.slice(2) : k);

export const LineC = ({ data, x = 'key', y = 'value', color = '#22C97A', unit = '', height, money }) => <Wrap data={data} height={height} valueKey={y}><LineChart data={data} margin={{ left: -10, right: 8, top: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey={x} tick={axis} tickFormatter={short} interval="preserveStartEnd" /><YAxis tick={axis} allowDecimals /><Tooltip formatter={(v) => (money ? `₹${Number(v).toLocaleString('en-IN')}` : `${v}${unit}`)} /><Line type="monotone" dataKey={y} stroke={color} strokeWidth={2.5} dot={data.length < 20} /></LineChart></Wrap>;
export const BarC = ({ data, x = 'key', y = 'value', color = '#3B82F6', height, name }) => <Wrap data={data} height={height} valueKey={y}><BarChart data={data} margin={{ left: -10, right: 8, top: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} /><XAxis dataKey={x} tick={axis} tickFormatter={short} interval="preserveStartEnd" /><YAxis tick={axis} allowDecimals={false} /><Tooltip /><Bar dataKey={y} name={name} fill={color} radius={[4, 4, 0, 0]} /></BarChart></Wrap>;
export const PieC = ({ data, height = 240 }) => <Wrap data={data} height={height}><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></Wrap>;
