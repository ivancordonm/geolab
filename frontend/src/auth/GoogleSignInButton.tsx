import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: { theme: string; size: string; type: string },
          ): void;
        };
      };
    };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
  theme: "light" | "dark";
}

export function GoogleSignInButton({ onCredential, theme }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
  const [ready, setReady] = useState(false);

  // Keep the latest callback in a ref instead of the effect's dependency array.
  // The parent passes an inline function, so its identity changes on every
  // render (e.g. every canvas click); depending on it directly would call
  // google.accounts.id.initialize() again on each of those renders, which
  // Google's own SDK warns can cause unexpected sign-in behavior.
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  // Initializes the client once per client id. Deliberately does not depend
  // on theme: re-running initialize() just to change the button's colors
  // would risk the same "called multiple times" issue described above.
  useEffect(() => {
    if (googleClientId === "") {
      return;
    }

    let cancelled = false;

    const initialize = (): void => {
      if (cancelled || window.google === undefined) {
        return;
      }
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => onCredentialRef.current(response.credential),
      });
      setReady(true);
    };

    if (window.google !== undefined) {
      initialize();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existingScript ?? document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", initialize);
    if (existingScript === null) {
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      script.removeEventListener("load", initialize);
    };
  }, [googleClientId]);

  // Renders (or re-renders) the button once the client is initialized, and
  // again whenever the app's color theme toggles so it matches the surrounding UI.
  useEffect(() => {
    if (!ready || containerRef.current === null || window.google === undefined) {
      return;
    }
    window.google.accounts.id.renderButton(containerRef.current, {
      theme: theme === "dark" ? "filled_black" : "outline",
      size: "large",
      type: "icon",
    });
  }, [ready, theme]);

  if (googleClientId === "") {
    return null;
  }

  return <div ref={containerRef} className="google-sign-in-button" aria-label="Sign in with Google" />;
}
