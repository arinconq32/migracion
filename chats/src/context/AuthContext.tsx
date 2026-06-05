"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AUTH_STORAGE_KEY,
  type AuthUser,
  defaultRouteForRole,
  isAdministrador,
} from "@/lib/auth";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  login: (usuario: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function persistUser(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (!user) {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const stored = readStoredUser();
      if (stored) {
        if (!cancelled) {
          setUser(stored);
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch("/api/auth/me");
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && data?.user) {
          setUser(data.user as AuthUser);
          persistUser(data.user as AuthUser);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (usuario: string, password: string) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.user) {
        return {
          ok: false,
          error: data?.error || "No se pudo iniciar sesión",
        };
      }

      const nextUser = data.user as AuthUser;
      setUser(nextUser);
      persistUser(nextUser);
      router.replace(defaultRouteForRole(nextUser.role));
      return { ok: true };
    },
    [router],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    persistUser(null);
    router.replace("/signin");
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin: isAdministrador(user?.role),
      login,
      logout,
    }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return context;
}
