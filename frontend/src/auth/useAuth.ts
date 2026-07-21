import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchCurrentUser, loginWithGoogle, logout as logoutRequest } from "../api/authApi";
import type { UserProfile } from "../types/auth";

export interface UseAuthResult {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  signIn: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const { t } = useTranslation();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<"auth.errors.signIn" | "auth.errors.signOut" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((profile) => {
        if (!cancelled) setUser(profile);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (idToken: string) => {
    setErrorKey(null);
    try {
      const profile = await loginWithGoogle(idToken);
      setUser(profile);
    } catch {
      setErrorKey("auth.errors.signIn");
    }
  }, []);

  const signOut = useCallback(async () => {
    setErrorKey(null);
    try {
      await logoutRequest();
    } catch {
      setErrorKey("auth.errors.signOut");
    } finally {
      setUser(null);
    }
  }, []);

  return { user, loading, error: errorKey === null ? null : t(errorKey), signIn, signOut };
}
