import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Languages, Moon, Settings, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { languages } from "../i18n";
import type { Theme } from "../theme/useTheme";
import { ToolbarTooltip } from "./geometry/ToolbarTooltip";

type Props = { theme: Theme; onThemeToggle: () => void };
export function SettingsMenu({ theme, onThemeToggle }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null); const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const pointer = (event: MouseEvent) => { const target = event.target as Node; if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", pointer); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", pointer); document.removeEventListener("keydown", key); };
  }, [open]);
  const rect = triggerRef.current?.getBoundingClientRect();
  const switchThemeLabel = theme === "dark" ? t("settings.switchToLight") : t("settings.switchToDark");
  return <div>
    <ToolbarTooltip label={t("settings.title")} instruction={t("settings.instruction")}>
      <button ref={triggerRef} type="button" aria-label={t("settings.title")} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent-soft-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"><Settings size={18} aria-hidden /></button>
    </ToolbarTooltip>
    {open && rect && createPortal(<div ref={panelRef} role="dialog" aria-label={t("settings.title")} style={{ position: "fixed", left: Math.max(8, Math.min(rect.right + 8, window.innerWidth - 228)), top: Math.max(8, Math.min(rect.top, window.innerHeight - 180)), width: 220, zIndex: 9999 }} className="rounded-xl border border-edge bg-surface p-3 shadow-pop">
      <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">{t("settings.title")}</p>
      <button type="button" aria-label={switchThemeLabel} aria-pressed={theme === "dark"} onClick={onThemeToggle} className="mb-3 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-content hover:bg-surface-hover">{theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}{switchThemeLabel}</button>
      <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">{t("settings.language")}</p>
      <div className="flex items-start gap-1" role="group" aria-label={t("settings.language")}><Languages size={16} className="mt-1 shrink-0 text-muted" aria-hidden /><div className="grid min-w-0 flex-1 grid-cols-2 gap-1">{languages.map(({ code, nativeName }) => <button key={code} type="button" lang={code} onClick={() => void i18n.changeLanguage(code)} aria-pressed={i18n.resolvedLanguage === code} className={`min-w-0 rounded-md px-2 py-1 text-xs font-semibold ${i18n.resolvedLanguage === code ? "bg-brand-600 text-white" : "text-muted hover:bg-accent-soft"}`}>{nativeName}</button>)}</div></div>
    </div>, document.body)}
  </div>;
}
