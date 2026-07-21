import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { AgentPlanningError, planStream, plannerClient } from "../../agent/planner";
import { scriptGenerator } from "../../agent/scriptGenerator";
import { useAssistantConfig } from "../../agent/useAssistantConfig";
import type {
  AgentResponse,
  AssistantMessage,
  ToolCallProposal,
} from "../../agent/types";
import type { GeometryDocument } from "../../types/geometry";
import { ConfigPopover } from "./ConfigPopover";

interface AssistantPanelProps {
  document: GeometryDocument;
  applyingScript: boolean;
  onApplyScript: (script: string) => Promise<void>;
}

function createWelcomeMessage(t: TFunction): AssistantMessage {
  return { id: "welcome", role: "assistant", content: t("assistant.welcome") };
}

export function AssistantPanel({ document, applyingScript, onApplyScript }: AssistantPanelProps) {
  const { t, i18n } = useTranslation();
  const [config, setConfig, remember, apiKeys, models] = useAssistantConfig();
  const [messages, setMessages] = useState<AssistantMessage[]>(() => [createWelcomeMessage(t)]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [response, setResponse] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamThinking, setStreamThinking] = useState("");
  const [streamProposals, setStreamProposals] = useState<ToolCallProposal[] | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const streamControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMessages((current) => current.length === 1 && current[0].id === "welcome" ? [createWelcomeMessage(t)] : current);
  }, [i18n.resolvedLanguage, t]);

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
            : t("assistant.plannerFailed");
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

  const handleStreamPreview = (): void => {
    const request = input.trim();
    if (!request || streaming) {
      return;
    }
    setError(null);
    setStreamThinking("");
    setStreamProposals(null);
    setStreaming(true);
    const controller = new AbortController();
    streamControllerRef.current = controller;

    void (async () => {
      try {
        for await (const event of planStream(
          { userRequest: request, document },
          controller.signal,
        )) {
          if (controller.signal.aborted) return;
          if (event.event === "thinking") {
            setStreamThinking((current) => current + event.data.delta);
          } else if (event.event === "tools_selected") {
            // Surface the proposal as inert data. Actual sequential execution,
            // with per-call user approval, is deferred (see report).
            setStreamProposals(event.data.tool_calls);
          } else if (event.event === "done") {
            setStreamProposals(event.data.toolCalls);
          } else if (event.event === "error") {
            setError(event.data.message);
          }
        }
      } catch (streamError: unknown) {
        if (controller.signal.aborted) return;
        setError(
          streamError instanceof AgentPlanningError
            ? streamError.message
            : t("assistant.streamingFailed"),
        );
      } finally {
        if (streamControllerRef.current === controller) {
          streamControllerRef.current = null;
          setStreaming(false);
        }
      }
    })();
  };

  const handleCancel = (): void => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setLoading(false);
  };

  const handleClearConversation = (): void => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    setMessages([createWelcomeMessage(t)]);
    setInput("");
    setLoading(false);
    setStreaming(false);
    setStreamThinking("");
    setStreamProposals(null);
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
          { id: createMessageId(), role: "assistant", content: t("assistant.scriptApplied") },
        ]);
      })
      .catch((applyError: unknown) => {
        setError(applyError instanceof Error ? applyError.message : t("assistant.scriptApplyFailed"));
      })
      .finally(() => setApplying(false));
  };

  return (
    <section className="p-4" aria-labelledby="assistant-heading">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.13em] text-brand-600">
            {t("assistant.planner")}
          </p>
          <h2
            id="assistant-heading"
            className="m-0 mt-0.5 flex items-center gap-1.5 text-lg font-bold tracking-tight text-content"
          >
            <Sparkles size={18} aria-hidden className="text-brand-600" />
            {t("common.assistant")}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-success-soft px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-success-fg">
            {t("assistant.validated")}
          </span>
          <button
            type="button"
            title={t("assistant.newConversation")}
            aria-label={t("assistant.newConversation")}
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
        aria-label={t("assistant.chatHistory")}
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
              {message.role === "user" ? t("assistant.you") : t("common.assistant")}
            </strong>
            <p className="m-0">{message.content}</p>
          </article>
        ))}
        {loading ? (
          <p className="m-0 text-sm font-semibold text-brand-600">{t("assistant.planning")}</p>
        ) : null}
      </div>

      <form className="mt-3 flex flex-col gap-2" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="assistant-request">
          {t("assistant.requestLabel")}
        </label>
        <textarea
          id="assistant-request"
          value={input}
          rows={3}
          placeholder={t("assistant.placeholder")}
          disabled={loading}
          onChange={(event) => setInput(event.target.value)}
          className="w-full resize-y rounded-lg border border-edge bg-surface p-3 text-sm leading-snug text-content focus:border-brand-400 focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/30 disabled:opacity-60"
        />
        {loading ? (
          <button
            type="button"
            onClick={handleCancel}
            className="w-full rounded-lg border border-danger-edge bg-surface-muted px-4 py-2.5 text-sm font-semibold text-danger-fg transition-colors hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            {t("common.cancel")}
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {t("assistant.send")}
          </button>
        )}
        <button
          type="button"
          onClick={handleStreamPreview}
          disabled={!input.trim() || streaming || loading}
          title={t("assistant.streamInstruction")}
          className="rounded-lg border border-edge bg-surface-muted px-4 py-2 text-xs font-semibold text-muted transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {streaming ? t("assistant.streaming") : t("assistant.previewStream")}
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

      {streaming || streamThinking || streamProposals ? (
        <section
          className="mt-4 border-t border-edge pt-3"
          aria-label={t("assistant.streamPreview")}
          aria-live="polite"
        >
          <h3 className="m-0 mb-1.5 text-sm font-semibold text-content">
            {t("assistant.streamingPlanner")} {streaming ? t("assistant.thinking") : t("assistant.proposal")}
          </h3>
          {streamThinking ? (
            <p className="m-0 whitespace-pre-wrap rounded-lg bg-surface-muted p-2.5 text-sm leading-snug text-muted">
              {streamThinking}
            </p>
          ) : null}
          {streamProposals ? (
            <ol className="mt-2 mb-0 list-decimal pl-5 text-sm leading-relaxed text-muted">
              {streamProposals.map((proposal, index) => (
                <li key={`${proposal.toolName}-${index}`}>
                  <code className="font-mono text-[0.78rem]">{proposal.toolName}</code>
                  {" "}
                  {JSON.stringify(proposal.arguments)}
                </li>
              ))}
            </ol>
          ) : null}
          {streamProposals ? (
            <p className="mt-2 mb-0 text-[0.7rem] italic text-muted">
              {t("assistant.previewOnly")}
            </p>
          ) : null}
        </section>
      ) : null}

      {response ? (
        <section
          className="mt-4 border-t border-edge pt-3"
          aria-label={t("assistant.generatedPreview")}
        >
          <h3 className="m-0 mb-1.5 text-sm font-semibold text-content">{t("assistant.plan")}</h3>
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
          <h3 className="m-0 mb-1.5 mt-3 text-sm font-semibold text-content">{t("assistant.generatedScript")}</h3>
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
            {applying || applyingScript ? t("assistant.applying") : t("assistant.applyScript")}
          </button>
        </section>
      ) : null}
    </section>
  );
}

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
