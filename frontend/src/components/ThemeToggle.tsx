import { Moon, Sun } from "lucide-react";

import type { Theme } from "../theme/useTheme";
import { ToolbarTooltip } from "./geometry/ToolbarTooltip";

type ThemeToggleProps = {
  theme: Theme;
  onToggle: () => void;
};

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === "dark";
  return (
    <ToolbarTooltip
      label={isDark ? "Light theme" : "Dark theme"}
      instruction={isDark ? "Switch to the light appearance" : "Switch to the dark appearance"}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        aria-pressed={isDark}
        className="flex items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent-soft-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        {isDark ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
      </button>
    </ToolbarTooltip>
  );
}
