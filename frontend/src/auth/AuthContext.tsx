import { createContext, useContext, useState, ReactNode } from "react";
import { apiRequest } from "../api";

export type Role = "student" | "staff";

export interface AuthUser {
  id: number;
  role: Role;
  loginId: string;
  displayName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (loginId: string, password: string) => Promise<void>;
  register: (
    role: Role,
    loginId: string,
    password: string,
    displayName: string,
    securityQuestion?: string,
    securityAnswer?: string
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });

  function persist(token: string, user: AuthUser) {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    setUser(user);
  }

  async function login(loginId: string, password: string) {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginId, password }),
    });
    persist(data.token, data.user);
  }

  async function register(
    role: Role,
    loginId: string,
    password: string,
    displayName: string,
    securityQuestion?: string,
    securityAnswer?: string
  ) {
    const data = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ role, loginId, password, displayName, securityQuestion, securityAnswer }),
    });
    persist(data.token, data.user);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
