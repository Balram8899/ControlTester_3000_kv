import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type UserRole = "l1" | "l2" | "admin";
export type User = { email: string; name: string; role: UserRole };

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  register: (name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  listUsers: () => Promise<User[]>;
  updateUserRole: (email: string, role: UserRole) => Promise<{ ok: boolean; error?: string }>;
  createUser: (name: string, email: string, password: string, role: UserRole) => Promise<{ ok: boolean; error?: string }>;
  deleteUser: (email: string) => Promise<{ ok: boolean; error?: string }>;
}

const SESSION_KEY = "ct3_current_user";

const AuthContext = createContext<AuthContextType | null>(null);

async function apiCall(path: string, body: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.detail ?? "Request failed" };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else localStorage.removeItem(SESSION_KEY);
  }, [user]);

  async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const result = await apiCall("/api/users/login", { email, password });
    if (!result.ok) return { ok: false, error: result.error };
    const u = result.data as User;
    setUser(u);
    return { ok: true };
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }

  async function register(name: string, email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const result = await apiCall("/api/users/register", { name, email, password });
    if (!result.ok) return { ok: false, error: result.error };
    const u = result.data as User;
    setUser(u);
    return { ok: true };
  }

  async function listUsers(): Promise<User[]> {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  }

  async function updateUserRole(email: string, role: UserRole): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(email)}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.detail ?? "Failed to update role" };
      if (user && user.email.toLowerCase() === email.toLowerCase()) {
        setUser((u) => u ? { ...u, role } : u);
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }

  async function createUser(name: string, email: string, password: string, role: UserRole): Promise<{ ok: boolean; error?: string }> {
    const result = await apiCall("/api/users", { name, email, password, role });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true };
  }

  async function deleteUser(email: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(email)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.detail ?? "Failed to delete user" };
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, register, listUsers, updateUserRole, createUser, deleteUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
