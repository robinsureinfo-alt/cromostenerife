import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { http, saveToken, clearToken, getToken } from './api';

type User = { id: string; email: string; username: string; role?: string };
type Profile = { display_name?: string; club?: string; profile_completed?: boolean } | null;

type Ctx = {
  user: User | null;
  profile: Profile;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const t = await getToken();
      if (!t) {
        setUser(null);
        setProfile(null);
        return;
      }
      const r = await http.get('/auth/me');
      setUser(r.data.user);
      setProfile(r.data.profile);
    } catch {
      setUser(null);
      setProfile(null);
      await clearToken();
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = async (identifier: string, password: string) => {
    const r = await http.post('/auth/login', { identifier, password });
    await saveToken(r.data.token);
    await refresh();
  };

  const register = async (email: string, username: string, password: string) => {
    const r = await http.post('/auth/register', { email, username, password });
    await saveToken(r.data.token);
    await refresh();
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthCtx.Provider value={{ user, profile, loading, login, register, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth must be inside AuthProvider');
  return c;
}
