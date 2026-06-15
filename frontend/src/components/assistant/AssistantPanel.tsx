import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Sparkles, Trash2 } from "lucide-react";

import { AgentPlanningError, plannerClient } from "../../agent/planner";
import { scriptGenerator } from "../../agent/scriptGenerator";
import { useAssistantConfig } from "../../agent/useAssistantConfig";
import type { AgentResponse, AssistantMessage } from "../../agent/types";
import type { GeometryDocument } from "../../types/geometry";
import { ConfigPopover } from "./ConfigPopover";

interface AssistantPanelProps {
  document: GeometryDocument;
  applyingScript: boolean;
  onApplyScript: (script: string) => Promise<void>;
}

const INITIAL_MESSAGE: AssistantMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Describe a construction in natural language (any language). I will generate a " +
    "deterministically validated script for your review.",
};

export function AssistantPanel({ document, applyingScript, onApplyScript }: AssistantPanelProps) {
  const [config, setConfig, remember, apiKeys, models] = useAssistantConfig();
  const [messages, setMessages] = useState<AssistantMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [response, setResponse] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const request = input.trim();
    if (!request || loading) {
      return;
    }
    setInput("");
    setError(null);
    setResponse(null);
    setMessages((current) => [
      ...current,
      { id: createMessageId(), role: "user", content: request },
    ]);
    setLoading(true);
    const controller = new AbortController();
    requestControllerRef.current = controller;
    void plannerClient
      .generatePlan({
        userRequest: request,
        currentScript: scriptGenerator.generate(document),
        config,
      }, controller.signal)
      .then((plan) => {
        if (controller.signal.aborted) return;
        setResponse(plan);
        setMessages((current) => [
          ...current,
          { id: createMessageId(), role: "assistant", content: plan.reasoning },
        ]);
      })
      .catch((planningError: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          planningError instanceof AgentPlanningError
            ? planningError.message
            : "The planner could not process this request.";
        setError(message);
        setMessages((current) => [
          ...current,
          { id: createMessageId(), role: "assistant", content: message },
        ]);
      })
      .finally(() => {
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
          setLoading(false);
        }
      });
  };

  const handleClearConversation = (): void => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setMessages([INITIAL_MESSAGE]);
    setInput("");
    setLoading(false);
    setResponse(null);
    setError(null);
  };

  const handleApply = (): void => {
    if (response === null || applying || applyingScript) {
      return;
    }
    setApplying(true);
    setError(null);
    void onApplyScript(response.generatedScript)
      .then(() => {
        setMessages((current) => [
          ...current,
          { id: createMessageId(), role: "assistant", content: "The reviewed script was applied." },
        ]);
      })
      .catch((applyError: unknown) => {
        setError(applyError instanceof Error ? applyError.message : "The script could not be applied.");
      })
      .finally(() => setApplying(false));
  };

  return (
    <section className="p-4" aria-labelledby="assistant-heading">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.13em] text-brand-600">
            AI planner
          </p>
          <h2
            id="assistant-heading"
            className="m-0 mt-0.5 flex items-center gap-1.5 text-lg font-bold tracking-tight text-content"
          >
            <Sparkles size={18} aria-hidden className="text-brand-600" />
            Assistant
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-success-soft px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-success-fg">
            Validated
          </span>
          <button
            type="button"
            title="Start a new conversation"
            aria-label="Start a new conversation"
            disabled={applying || applyingScript}
            onClick={handleClearConversation}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      </div>

      <div className="mb-3">
        <ConfigPopover
          config={config}
          remember={remember}
          onChange={setConfig}
          apiKeys={apiKeys}
          models={models}
        />
      </div>

      <div
        className="flex max-h-64 flex-col gap-2 overflow-y-auto"
        aria-label="Assistant chat history"
        aria-live="polite"
      >
        {messages.map((message) => (
          <article
            key={message.id}
            className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-snug ${
              message.role === "user"
                ? "self-end bg-brand-600 text-white"
                : "self-start bg-surface-muted text-muted"
            }`}
          >
            <strong className="mb-0.5 block text-[0.65rem] font-semibold uppercase tracking-wide opacity-80">
              {message.role === "user" ? "You" : "Assistant"}
            </strong>
            <p className="m-0">{message.content}</p>
          </article>
        ))}
        {loading ? (
          <p className="m-0 text-sm font-semibold text-brand-600">Planning and validating…</p>
        ) : null}
      </div>

      <form className="mt-3 flex flex-col gap-2" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="assistant-request">
          Describe a geometry construction
        </label>
        <textarea
          id="assistant-request"
          value={input}
          rows={3}
          placeholder="Dibuja un triángulo ABC y traza la altura desde C."
          disabled={loading}
          onChange={(event) => setInput(event.target.value)}
          className="w-full resize-y rounded-lg border border-edge bg-surface p-3 text-sm leading-snug text-content focus:border-brand-400 focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/30 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {loading ? "Planning…" : "Send"}
        </button>
      </form>

      {error ? (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-danger-edge bg-danger-soft p-3 text-sm leading-snug text-danger-fg"
        >
          {error}
        </div>
      ) : null}

      {response ? (
        <section
          className="mt-4 border-t border-edge pt-3"
          aria-label="Generated construction preview"
        >
          <h3 className="m-0 mb-1.5 text-sm font-semibold text-content">Plan</h3>
          <ol className="m-0 list-decimal pl-5 text-sm leading-relaxed text-muted">
            {response.plan.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {response.warnings.map((warning) => (
            <p
              key={warning}
              className="mt-2.5 rounded-lg border border-warning-edge bg-warning-soft p-2.5 text-sm leading-snug text-warning-fg"
            >
              {warning}
            </p>
          ))}
          <h3 className="m-0 mb-1.5 mt-3 text-sm font-semibold text-content">Generated script</h3>
          <pre className="m-0 max-h-60 overflow-auto whitespace-pre rounded-lg border border-edge bg-surface-muted p-3 font-mono text-[0.75rem] leading-relaxed text-content">
            <code>{response.generatedScript}</code>
          </pre>
          <button
            type="button"
            disabled={applying || applyingScript}
            onClick={handleApply}
            style={{ backgroundColor: "var(--geo-segment)" }}
            className="mt-2.5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {applying || applyingScript ? "Applying…" : "Apply Script"}
          </button>
        </section>
      ) : null}
    </section>
  );
}

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
