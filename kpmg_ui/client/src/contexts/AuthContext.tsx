import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type User = { email: string; name: string };

interface StoredUser extends User {
  password: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  register: (name: string, email: string, password: string) => { ok: boolean; error?: string };
}

const USERS_KEY = "ct3_users";
const SESSION_KEY = "ct3_current_user";

const DEFAULT_ADMIN: StoredUser = {
  email: "admin@bank.com",
  name: "Admin",
  password: "admin123",
};

function loadUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function seedDefaultAdmin() {
  const users = loadUsers();
  if (!users.find((u) => u.email === DEFAULT_ADMIN.email)) {
    saveUsers([DEFAULT_ADMIN, ...users]);
  }
}

const AuthContext = createContext<AuthContextType | null>(null);

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
    seedDefaultAdmin();
  }, []);

  function login(email: string, password: string): { ok: boolean; error?: string } {
    const users = loadUsers();
    const found = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );
    if (!found) {
      return { ok: false, error: "Invalid email or password." };
    }
    const sessionUser: User = { email: found.email, name: found.name };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    setUser(sessionUser);
    return { ok: true };
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }

  function register(
    name: string,
    email: string,
    password: string
  ): { ok: boolean; error?: string } {
    const users = loadUsers();
    if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, error: "An account with this email already exists." };
    }
    const newUser: StoredUser = { email, name, password };
    saveUsers([...users, newUser]);
    const sessionUser: User = { email, name };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    setUser(sessionUser);
    return { ok: true };
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
