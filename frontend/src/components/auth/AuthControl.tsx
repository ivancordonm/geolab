import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LogOut } from "lucide-react";

import { GoogleSignInButton } from "../../auth/GoogleSignInButton";
import type { UserProfile } from "../../types/auth";

interface AuthControlProps {
  user: UserProfile | null;
  onCredential: (idToken: string) => void;
  onSignOut: () => void;
}

export function AuthControl({ user, onCredential, onSignOut }: AuthControlProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      const inMenu = menuRef.current?.contains(target) ?? false;
      const inButton = buttonRef.current?.contains(target) ?? false;
      if (!inMenu && !inButton) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  if (user === null) {
    return <GoogleSignInButton onCredential={onCredential} />;
  }

  const handleToggle = (): void => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.top, left: rect.right + 8 });
    }
    setOpen((value) => !value);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        title={user.name ?? user.email}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={handleToggle}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-edge text-xs font-semibold text-content"
      >
        {user.pictureUrl !== null ? (
          <img
            src={user.pictureUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span>{(user.name ?? user.email).charAt(0).toUpperCase()}</span>
        )}
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Account menu"
              style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
              className="z-50 w-52 overflow-hidden rounded-xl border border-edge bg-surface p-1.5 shadow-pop"
            >
              <div className="px-2.5 py-2 text-xs text-muted">
                <p className="truncate font-semibold text-content">{user.name ?? user.email}</p>
                <p className="truncate">{user.email}</p>
              </div>
              <div className="my-1 h-px bg-edge" role="separator" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-content transition-colors hover:bg-accent-soft hover:text-accent-soft-fg"
              >
                <LogOut size={16} aria-hidden />
                Sign out
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
