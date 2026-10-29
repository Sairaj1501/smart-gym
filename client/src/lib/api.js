const BASE = `${import.meta.env.VITE_API_URL || ''}/api`;
export const getToken = () => localStorage.getItem('sg_token');
export const setToken = (t) => (t ? localStorage.setItem('sg_token', t) : localStorage.removeItem('sg_token'));

export class ApiError extends Error {
  constructor(message, status, code, fields) { super(message); this.status = status; this.code = code; this.fields = fields; }
}

export async function api(path, { method = 'GET', body, raw = false } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers: { ...(body && { 'Content-Type': 'application/json' }), ...(getToken() && { Authorization: `Bearer ${getToken()}` }) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new ApiError('Cannot reach the server. Check that the API is running.', 0, 'network'); }
  if (raw && res.ok) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) { setToken(null); window.dispatchEvent(new Event('sg:logout')); }
    throw new ApiError(data.error || 'Request failed', res.status, data.code, data.fields);
  }
  return data;
}
export const qs = (o) => { const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)); const s = p.toString(); return s ? `?${s}` : ''; };
export const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function download(path, filename) {
  const res = await api(path, { raw: true }); const blob = await res.blob();
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
