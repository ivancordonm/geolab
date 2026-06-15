import { useState } from "react";
import type { FormEvent } from "react";
import { Trash2 } from "lucide-react";

import type { ScriptErrorDetail } from "../../types/script";

interface ScriptEditorProps {
  initialScript: string;
  running: boolean;
  error: ScriptErrorDetail | null;
  output: string | null;
  onRunScript: (script: string) => Promise<void>;
}

export function ScriptEditor({
  initialScript,
  running,
  error,
  output,
  onRunScript,
}: ScriptEditorProps) {
  const [script, setScript] = useState(initialScript);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void onRunScript(script).catch(() => undefined);
  };

  return (
    <section className="p-4" aria-labelledby="script-heading">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.13em] text-brand-600">
            Reproducible construction
          </p>
          <h2 id="script-heading" className="m-0 mt-0.5 text-lg font-bold tracking-tight text-content">
            Script editor
          </h2>
        </div>
        <button
          type="button"
          title="Clear script"
          aria-label="Clear script"
          disabled={running || script.length === 0}
          onClick={() => setScript("")}
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="construction-script">
          Construction script
        </label>
        <textarea
          id="construction-script"
          value={script}
          spellCheck={false}
          aria-describedby="script-output"
          onChange={(event) => setScript(event.target.value)}
          className="block min-h-60 w-full resize-y rounded-lg border border-edge bg-surface-muted p-3 font-mono text-[0.8rem] leading-relaxed text-content [tab-size:2] focus:border-brand-400 focus:bg-surface focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/30"
        />
        <button
          type="submit"
          disabled={running || !script.trim()}
          className="mt-2.5 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {running ? "Running…" : "Run script"}
        </button>
      </form>

      <div
        id="script-output"
        role={error ? "alert" : "status"}
        aria-live="polite"
        className={`mt-3 min-h-14 rounded-lg border p-3 text-sm leading-relaxed ${
          error
            ? "border-danger-edge bg-danger-soft text-danger-fg"
            : "border-edge bg-surface-muted text-muted"
        }`}
      >
        {error ? (
          <>
            <strong className="block">
              Line {error.line}, column {error.column}: {error.message}
            </strong>
            <code className="mt-1.5 block overflow-x-auto font-mono text-[0.8rem]">
              {error.sourceLine}
            </code>
          </>
        ) : (
          (output ?? "Run the script to replace the current construction.")
        )}
      </div>
    </section>
  );
}
