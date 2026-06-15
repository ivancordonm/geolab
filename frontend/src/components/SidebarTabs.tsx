import { useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface SidebarTab {
  id: string;
  label: string;
  icon: ReactNode;
  panel: ReactNode;
}

interface SidebarTabsProps {
  tabs: SidebarTab[];
}

/**
 * Accessible tabbed sidebar. All panels stay mounted (inactive ones get the
 * `hidden` attribute) so component state — e.g. the in-progress script — is
 * preserved across tab switches.
 */
export function SidebarTabs({ tabs }: SidebarTabsProps) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = (index: number): void => {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(tabs.length - 1);
    }
  };

  return (
    <section className="overflow-hidden rounded-card border border-edge bg-surface shadow-card">
      <div
        role="tablist"
        aria-label="Construction panels"
        className="flex gap-1 border-b border-edge bg-surface-muted p-1.5"
      >
        {tabs.map((tab, index) => {
          const selected = index === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={`${baseId}-tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                selected
                  ? "bg-surface text-brand-600 shadow-sm"
                  : "text-muted hover:text-content"
              }`}
            >
              <span aria-hidden className={selected ? "text-brand-600" : "text-subtle"}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={index !== active}
        >
          {tab.panel}
        </div>
      ))}
    </section>
  );
}
