import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Languages, Moon, Settings, Sun } from "lucide-react";
import type { Language } from "../i18n/useLanguage";
import type { Theme } from "../theme/useTheme";
import { ToolbarTooltip } from "./geometry/ToolbarTooltip";

type Props = { language: Language; onLanguageChange: (language: Language) => void; theme: Theme; onThemeToggle: () => void };
export function SettingsMenu({ language, onLanguageChange, theme, onThemeToggle }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null); const panelRef = useRef<HTMLDivElement>(null);
  const t = (es: string, en: string) => language === "es" ? es : en;
  useEffect(() => {
    if (!open) return;
    const pointer = (event: MouseEvent) => { const target = event.target as Node; if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", pointer); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", pointer); document.removeEventListener("keydown", key); };
  }, [open]);
  const rect = triggerRef.current?.getBoundingClientRect();
  const switchThemeLabel = theme === "dark" ? t("Cambiar a tema claro", "Switch to light theme") : t("Cambiar a tema oscuro", "Switch to dark theme");
  return <div>
    <ToolbarTooltip label={t("Ajustes", "Settings")} instruction={t("Cambia el tema y el idioma", "Change theme and language")}>
      <button ref={triggerRef} type="button" aria-label={t("Ajustes", "Settings")} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent-soft-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"><Settings size={18} aria-hidden /></button>
    </ToolbarTooltip>
    {open && rect && createPortal(<div ref={panelRef} role="dialog" aria-label={t("Ajustes", "Settings")} style={{ position: "fixed", left: Math.max(8, Math.min(rect.right + 8, window.innerWidth - 228)), top: Math.max(8, Math.min(rect.top, window.innerHeight - 180)), width: 220, zIndex: 9999 }} className="rounded-xl border border-edge bg-surface p-3 shadow-pop">
      <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">{t("Ajustes", "Settings")}</p>
      <button type="button" aria-label={switchThemeLabel} aria-pressed={theme === "dark"} onClick={onThemeToggle} className="mb-3 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-content hover:bg-surface-hover">{theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}{switchThemeLabel}</button>
      <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">{t("Idioma", "Language")}</p>
      <div className="flex gap-1" role="group" aria-label={t("Idioma", "Language")}><Languages size={16} className="mt-1 text-muted" aria-hidden />{(["es", "en"] as const).map((choice) => <button key={choice} type="button" onClick={() => onLanguageChange(choice)} aria-pressed={language === choice} className={`rounded-md px-2 py-1 text-xs font-semibold ${language === choice ? "bg-brand-600 text-white" : "text-muted hover:bg-accent-soft"}`}>{choice === "es" ? "Español" : "English"}</button>)}</div>
    </div>, document.body)}
  </div>;
}
