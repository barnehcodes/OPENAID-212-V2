"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Role } from "@/hooks/useParticipant";
import { PREVIEW_ADDRESS } from "@/lib/previewMode";

interface MockRoleState {
  role: Role | null;
  address: string;
  name: string;
  isVerified: boolean;
  setRole: (role: Role, name?: string) => void;
  clear: () => void;
}

const STORAGE_KEY = "openaid:preview-role";

const MockRoleContext = createContext<MockRoleState | null>(null);

export function MockRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role | null>(null);
  const [name, setName] = useState<string>("Preview User");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { role: Role; name: string };
        setRoleState(parsed.role);
        setName(parsed.name);
      } catch {}
    }
  }, []);

  const setRole = (next: Role, nextName?: string) => {
    const finalName = nextName ?? name;
    setRoleState(next);
    setName(finalName);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ role: next, name: finalName }));
    }
  };

  const clear = () => {
    setRoleState(null);
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <MockRoleContext.Provider
      value={{ role, address: PREVIEW_ADDRESS, name, isVerified: true, setRole, clear }}
    >
      {children}
    </MockRoleContext.Provider>
  );
}

export function useMockRole(): MockRoleState {
  const ctx = useContext(MockRoleContext);
  if (!ctx) {
    return {
      role: null,
      address: PREVIEW_ADDRESS,
      name: "Preview User",
      isVerified: true,
      setRole: () => {},
      clear: () => {},
    };
  }
  return ctx;
}
