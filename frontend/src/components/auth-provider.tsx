"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { ApiError, apiGet, type MeResponse } from "@/lib/api";
import { getRefreshToken } from "@/lib/token-store";

interface AuthContextValue {
  user: MeResponse | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export const AUTH_CHANGED_EVENT = "salon:auth-changed";

/** Thông báo cho AuthProvider (cùng tab) rằng phiên đã đổi — gọi sau login/register/logout. */
export function notifyAuthChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
}

/**
 * Ngữ cảnh xác thực toàn cục: lấy /auth/me một lần khi mount, cập nhật khi
 * token đổi (custom event + storage để đồng bộ cross-tab). Nav và các widget
 * header dùng useAuth() để biết người dùng hiện tại mà không cần mỗi component
 * tự fetch /auth/me.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getRefreshToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await apiGet<MeResponse>("/auth/me");
      setUser(me);
    } catch (error) {
      if (error instanceof ApiError) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => {
      void refresh();
    };
    window.addEventListener(AUTH_CHANGED_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
