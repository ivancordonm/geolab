import { useCallback, useEffect, useState } from "react";

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
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      const profile = await loginWithGoogle(idToken);
      setUser(profile);
    } catch {
      setError("Unable to sign in with Google.");
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await logoutRequest();
    } finally {
      setUser(null);
    }
  }, []);

  return { user, loading, error, signIn, signOut };
}
