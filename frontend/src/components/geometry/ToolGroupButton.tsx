import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ConstructionTool } from "../../geometry/constructionTools";

export interface IconProps {
  size?: number | string;
  "aria-hidden"?: boolean;
}

export interface GroupToolOption {
  tool: ConstructionTool;
  label: string;
  instruction: string;
  icon: ComponentType<IconProps>;
  shortcut?: string;
}

interface ToolGroupButtonProps {
  label: string;
  /** Tooltip instruction for the group trigger (e.g. "Choose a polygon tool"). */
  instruction: string;
  tools: readonly GroupToolOption[];
  activeTool: ConstructionTool;
  onActivateTool: (tool: ConstructionTool) => void;
  onShowTooltip?: (
    e: React.MouseEvent<HTMLButtonElement>,
    label: string,
    instruction: string,
    shortcut?: string,
  ) => void;
  onHideTooltip?: () => void;
}

const MENU_WIDTH = 200;
const MENU_ITEM_HEIGHT_ESTIMATE = 36;

export function ToolGroupButton({
  label,
  instruction,
  tools,
  activeTool,
  onActivateTool,
  onShowTooltip,
  onHideTooltip,
}: ToolGroupButtonProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [lastUsed, setLastUsed] = useState<ConstructionTool | null>(tools[0]?.tool ?? null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeMember = tools.find((entry) => entry.tool === activeTool);
  const displayed =
    activeMember ?? tools.find((entry) => entry.tool === lastUsed) ?? tools[0];
  const isActive = activeMember !== undefined;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const activeIndex = tools.findIndex((entry) => entry.tool === activeTool);
    const focusIndex = activeIndex >= 0 ? activeIndex : 0;
    itemRefs.current[focusIndex]?.focus();
  }, [open, tools, activeTool]);

  const focusItem = (index: number): void => {
    const count = tools.length;
    const wrapped = ((index % count) + count) % count;
    itemRefs.current[wrapped]?.focus();
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const currentIndex = itemRefs.current.findIndex((el) => el === document.activeElement);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(currentIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(currentIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(tools.length - 1);
        break;
      default:
        break;
    }
  };

  if (tools.length === 0) return null;

  const DisplayedIcon = displayed.icon;

  const handleToggle = (): void => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const estimatedHeight = tools.length * MENU_ITEM_HEIGHT_ESTIMATE + 16;
      const left = Math.min(rect.right + 8, window.innerWidth - MENU_WIDTH - 8);
      const top = Math.max(8, Math.min(rect.top, window.innerHeight - estimatedHeight - 8));
      setPos({ top, left });
    }
    setOpen((value) => !value);
  };

  const handleSelect = (tool: ConstructionTool): void => {
    setLastUsed(tool);
    setOpen(false);
    onHideTooltip?.();
    onActivateTool(tool);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={isActive}
        data-displayed-tool={displayed.tool}
        onClick={handleToggle}
        onMouseEnter={(e) => onShowTooltip?.(e, label, instruction)}
        onMouseLeave={() => onHideTooltip?.()}
        className={`relative w-full flex items-center justify-center rounded-lg p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
          isActive
            ? "bg-brand-600 text-white"
            : "text-muted hover:bg-accent-soft hover:text-accent-soft-fg"
        }`}
      >
        <DisplayedIcon size={18} aria-hidden />
        <span
          aria-hidden
          className="absolute bottom-0.5 right-0.5 h-0 w-0 border-b-[5px] border-l-[5px] border-b-current border-l-transparent opacity-60"
        />
      </button>

      {open && pos !== null
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              onKeyDown={handleMenuKeyDown}
              style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH, zIndex: 9999 }}
              className="rounded-xl border border-edge bg-surface p-1.5 shadow-pop"
            >
              {tools.map(({ tool, label: toolLabel, instruction: toolInstruction, icon: Icon, shortcut }, index) => {
                const active = activeTool === tool;
                return (
                  <button
                    key={tool}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    type="button"
                    role="menuitem"
                    aria-keyshortcuts={shortcut}
                    onClick={() => handleSelect(tool)}
                    onMouseEnter={(e) => onShowTooltip?.(e, toolLabel, toolInstruction, shortcut)}
                    onMouseLeave={() => onHideTooltip?.()}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                      active
                        ? "bg-brand-600 text-white"
                        : "text-content hover:bg-accent-soft hover:text-accent-soft-fg"
                    }`}
                  >
                    <Icon size={16} aria-hidden />
                    <span>{toolLabel}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
