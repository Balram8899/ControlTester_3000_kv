import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type UserRole = "l1" | "l2" | "admin";
export type User = { email: string; name: string; role: UserRole };

interface StoredUser extends User {
  password: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  register: (name: string, email: string, password: string) => { ok: boolean; error?: string };
  listUsers: () => User[];
  updateUserRole: (email: string, role: UserRole) => { ok: boolean; error?: string };
  createUser: (name: string, email: string, password: string, role: UserRole) => { ok: boolean; error?: string };
  deleteUser: (email: string) => { ok: boolean; error?: string };
}

const USERS_KEY = "ct3_users";
const SESSION_KEY = "ct3_current_user";
const ADMIN_EMAIL = "admin@bank.com";

const DEFAULT_ADMIN: StoredUser = {
  email: ADMIN_EMAIL,
  name: "Admin",
  password: "zUlqVAZ5wt",
  role: "admin",
};

function loadUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    const users: StoredUser[] = raw ? JSON.parse(raw) : [];
    let mutated = false;
    const migrated = users.map((u) => {
      if (!u.role) {
        mutated = true;
        return { ...u, role: u.email.toLowerCase() === ADMIN_EMAIL ? "admin" : "l1" } as StoredUser;
      }
      if (u.email.toLowerCase() === ADMIN_EMAIL && u.role !== "admin") {
        mutated = true;
        return { ...u, role: "admin" } as StoredUser;
      }
      return u;
    });
    if (mutated) saveUsers(migrated);
    return migrated;
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
    const sessionUser: User = { email: found.email, name: found.name, role: found.role };
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
    const newUser: StoredUser = { email, name, password, role: "l1" };
    saveUsers([...users, newUser]);
    const sessionUser: User = { email, name, role: "l1" };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    setUser(sessionUser);
    return { ok: true };
  }

  function listUsers(): User[] {
    return loadUsers().map(({ email, name, role }) => ({ email, name, role }));
  }

  function updateUserRole(email: string, role: UserRole): { ok: boolean; error?: string } {
    const users = loadUsers();
    const idx = users.findIndex((u) => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) return { ok: false, error: "User not found." };
    if (users[idx].email.toLowerCase() === ADMIN_EMAIL && role !== "admin") {
      return { ok: false, error: "Cannot change the role of the default admin." };
    }
    users[idx] = { ...users[idx], role };
    saveUsers(users);
    if (user && user.email.toLowerCase() === email.toLowerCase()) {
      const updated = { ...user, role };
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
      setUser(updated);
    }
    return { ok: true };
  }

  function createUser(
    name: string,
    email: string,
    password: string,
    role: UserRole
  ): { ok: boolean; error?: string } {
    const users = loadUsers();
    if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, error: "An account with this email already exists." };
    }
    saveUsers([...users, { email, name, password, role }]);
    return { ok: true };
  }

  function deleteUser(email: string): { ok: boolean; error?: string } {
    if (email.toLowerCase() === ADMIN_EMAIL) {
      return { ok: false, error: "Cannot delete the default admin." };
    }
    const users = loadUsers();
    const filtered = users.filter((u) => u.email.toLowerCase() !== email.toLowerCase());
    if (filtered.length === users.length) return { ok: false, error: "User not found." };
    saveUsers(filtered);
    return { ok: true };
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
