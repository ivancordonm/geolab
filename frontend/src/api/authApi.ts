import type { UserProfile } from "../types/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class AuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function loginWithGoogle(idToken: string): Promise<UserProfile> {
  const response = await fetch(`${API_BASE}/auth/google`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) {
    throw new AuthError("Google login failed.", response.status);
  }
  return (await response.json()) as UserProfile;
}

export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const response = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new AuthError("Unable to fetch the current session.", response.status);
  }
  return (await response.json()) as UserProfile;
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new AuthError("Logout failed.", response.status);
  }
}
