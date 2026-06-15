import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, Settings } from "lucide-react";
import type { AssistantModels } from "../../agent/useAssistantConfig";
import type { AssistantConfig, ProviderName } from "../../agent/types";
import { PROVIDER_DEFAULTS } from "../../agent/types";

interface ConfigPopoverProps {
  config: AssistantConfig;
  remember: boolean;
  onChange: (c: AssistantConfig, remember: boolean) => void;
  /** Mapa de API keys guardadas por provider, para restaurarlas al cambiar de tipo. */
  apiKeys: Record<ProviderName, string>;
  models: AssistantModels;
}

interface PopoverPos {
  top: number;
  left: number;
  width: number;
}

const PROVIDER_LABELS: Record<ProviderName, string> = {
  huggingface: "HuggingFace",
  openai: "OpenAI",
  nvidia: "Nvidia",
};

const POPOVER_WIDTH = 288; // w-72


const PROVIDER_KEY_URLS: Record<ProviderName, string> = {
  huggingface: "https://huggingface.co/settings/tokens",
  openai: "https://platform.openai.com/api-keys",
  nvidia: "https://build.nvidia.com/settings/api-keys",
};


export function ConfigPopover({ config, remember, onChange, apiKeys, models }: ConfigPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const [draft, setDraft] = useState<AssistantConfig>(config);
  const [draftKeys, setDraftKeys] = useState<Record<ProviderName, string>>(apiKeys);
  const [draftModels, setDraftModels] = useState<AssistantModels>(models);
  const [draftRemember, setDraftRemember] = useState(remember);
  const [showKey, setShowKey] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  useEffect(() => {
    setDraftKeys(apiKeys);
  }, [apiKeys]);

  useEffect(() => {
    setDraftModels(models);
  }, [models]);

  useEffect(() => {
    setDraftRemember(remember);
  }, [remember]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insidePopover = popoverRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insidePopover) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleToggle = (): void => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Align right edge of popover with right edge of trigger, clamped to viewport
      const left = Math.max(8, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8));
      setPos({ top: rect.bottom + 4, left, width: rect.width });
    }
    setOpen((v) => !v);
  };

  const handleProviderChange = (provider: ProviderName): void => {
    // Reset to the provider defaults while restoring its saved model and API key.
    setDraft({
      ...PROVIDER_DEFAULTS[provider],
      model: draftModels[provider],
      apiKey: draftKeys[provider] ?? "",
    });
    setShowKey(false);
  };

  const handleSave = (): void => {
    onChange(draft, draftRemember);
    setShowKey(false);
    setOpen(false);
  };

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Configure assistant provider"
        aria-expanded={open}
        onClick={handleToggle}
        className="flex w-full items-center gap-1.5 rounded-lg border border-edge bg-surface-muted px-2.5 py-1.5 text-left text-xs text-muted transition-colors hover:border-brand-400 hover:text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <Settings size={12} aria-hidden className="shrink-0" />
        <span className="truncate">
          {PROVIDER_LABELS[config.provider]} / {config.model}
        </span>
        <span className="ml-auto shrink-0 text-[10px] opacity-50">▾</span>
      </button>

      {open && pos !== null
        ? createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              aria-label="Assistant settings"
              style={{ position: "fixed", top: pos.top, left: pos.left, width: POPOVER_WIDTH, zIndex: 9999 }}
              className="rounded-xl border border-edge bg-surface p-4 shadow-pop"
            >
              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
                Provider
              </p>
              <div className="mb-4 flex gap-1.5">
                {(["huggingface", "openai", "nvidia"] as ProviderName[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleProviderChange(p)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 ${
                      draft.provider === p
                        ? "bg-brand-600 text-white"
                        : "border border-edge text-muted hover:text-content"
                    }`}
                  >
                    {PROVIDER_LABELS[p]}
                  </button>
                ))}
              </div>

              <label className="mb-3 block">
                <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
                  Model
                </span>
                <input
                  type="text"
                  value={draft.model}
                  onChange={(e) => {
                    const model = e.target.value;
                    setDraft((d) => ({ ...d, model }));
                    setDraftModels((current) => ({ ...current, [draft.provider]: model }));
                  }}
                  className="w-full rounded-lg border border-edge bg-surface-muted px-2.5 py-1.5 text-xs text-content focus:border-brand-400 focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/30"
                />
              </label>

              <label className="mb-3 block">
                <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
                  Base URL{draft.provider === "openai" || draft.provider === "huggingface" ? " (optional)" : ""}
                </span>
                <input
                  type="text"
                  value={draft.baseUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                  className="w-full rounded-lg border border-edge bg-surface-muted px-2.5 py-1.5 text-xs text-content focus:border-brand-400 focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/30"
                />
              </label>

              <label className="mb-3 block">
                <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
                  Temperature
                </span>
                <input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={draft.temperature}
                  onChange={(e) => {
                    const temperature = Number(e.target.value);
                    if (Number.isFinite(temperature)) {
                      setDraft((d) => ({
                        ...d,
                        temperature: Math.min(2, Math.max(0, temperature)),
                      }));
                    }
                  }}
                  className="w-full rounded-lg border border-edge bg-surface-muted px-2.5 py-1.5 text-xs text-content focus:border-brand-400 focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/30"
                />
                <span className="mt-1 block text-[0.65rem] text-muted">
                  0 = more deterministic, 1 = the provider default.
                </span>
              </label>

              <div className="mb-4">
                <label className="block">
                  <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
                    API key
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type={showKey ? "text" : "password"}
                      value={draft.apiKey}
                      placeholder={
                        draft.provider === "nvidia"
                          ? "nvapi-…"
                          : draft.provider === "huggingface"
                            ? "hf_…"
                            : "sk-…"
                      }
                      onChange={(e) => {
                        const apiKey = e.target.value;
                        setDraft((d) => ({ ...d, apiKey }));
                        setDraftKeys((k) => ({ ...k, [draft.provider]: apiKey }));
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-edge bg-surface-muted px-2.5 py-1.5 text-xs text-content focus:border-brand-400 focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/30"
                    />
                    {!draft.apiKey ? (
                      <a
                        href={PROVIDER_KEY_URLS[draft.provider]}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Get ${PROVIDER_LABELS[draft.provider]} API key`}
                        title={`Get ${PROVIDER_LABELS[draft.provider]} API key`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-edge text-muted transition-colors hover:border-brand-400 hover:text-content focus-visible:outline-2 focus-visible:outline-brand-500"
                      >
                        <KeyRound size={14} aria-hidden />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      aria-label={showKey ? "Hide API key" : "Show API key"}
                      onClick={() => setShowKey((v) => !v)}
                      className="shrink-0 rounded-lg border border-edge px-2 py-1.5 text-xs text-muted hover:text-content focus-visible:outline-2 focus-visible:outline-brand-500"
                    >
                      {showKey ? "🙈" : "👁"}
                    </button>
                  </div>
                </label>
                <label className="mt-2 flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draftRemember}
                    onChange={(e) => setDraftRemember(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-brand-600"
                  />
                  <span className="text-[0.65rem] text-muted">Remember between sessions</span>
                </label>
                <p className="mt-2 text-[0.65rem] text-muted">
                  🔒 The key is stored only in your browser.{" "}
                  {draftRemember
                    ? "It persists between sessions on this device."
                    : "It is cleared when you close the tab."}
                </p>
              </div>

              <button
                type="button"
                onClick={handleSave}
                className="w-full rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                Save
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
