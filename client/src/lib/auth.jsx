import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState(null);
  const loadSettings = useCallback(() => api('/settings').then((d) => setSettings({ ...d.settings, aiConfigured: d.aiConfigured })).catch(() => {}), []);
  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('sg:logout', out);
    if (!getToken()) setReady(true);
    else api('/auth/me').then((d) => { setUser(d.user); loadSettings(); }).catch(() => setToken(null)).finally(() => setReady(true));
    return () => window.removeEventListener('sg:logout', out);
  }, [loadSettings]);
  const login = async (email, password) => { const d = await api('/auth/login', { method: 'POST', body: { email, password } }); setToken(d.token); setUser(d.user); loadSettings(); return d.user; };
  const logout = () => { setToken(null); setUser(null); setSettings(null); };
  return <Ctx.Provider value={{ user, ready, login, logout, setUser, settings, reloadSettings: loadSettings }}>{children}</Ctx.Provider>;
}
