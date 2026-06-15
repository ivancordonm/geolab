# Cancel In-Progress Request Button — Design Spec

**Date:** 2026-06-15  
**Status:** Approved

## Problem

The assistant panel has no way to cancel an in-progress planning request without also clearing the entire conversation. The trash icon (clear conversation) aborts the request but destroys all message history as a side effect.

## Goal

Add a dedicated Cancel button that aborts the current fetch without touching the conversation history.

## Scope

Single file change: `frontend/src/components/assistant/AssistantPanel.tsx`.

No changes to `planner.ts`, backend, or any other component.

## Design

### New function: `handleCancel`

```ts
const handleCancel = (): void => {
  requestControllerRef.current?.abort();
  requestControllerRef.current = null;
  setLoading(false);
};
```

- Aborts the `AbortController` tied to the active fetch.
- Sets `requestControllerRef.current` to `null` so the `finally` block in `handleSubmit` does not double-execute `setLoading(false)`.
- Does **not** touch `messages`, `input`, `response`, or `error`.

### Conditional render in the form

Replace the single submit button with a conditional:

```tsx
{loading ? (
  <button type="button" onClick={handleCancel} /* danger-soft styles */>
    Cancel
  </button>
) : (
  <button type="submit" disabled={!input.trim()} /* brand styles */>
    Send
  </button>
)}
```

The Cancel button occupies the same space as Send — no layout shift.

### Styles for Cancel button

Same size as Send (`rounded-lg px-4 py-2.5 text-sm font-semibold w-full`), with neutral/danger palette:

```
bg-surface-muted text-danger-fg border border-danger-edge
hover:bg-danger-soft
focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500
transition-colors
```

### Promise lifecycle after cancel

When `handleCancel` runs:
1. `controller.signal.aborted` becomes `true`.
2. The fetch rejects — `.catch` fires but returns early because `controller.signal.aborted` is checked first.
3. `.finally` checks `requestControllerRef.current === controller` — this is `false` (ref was set to `null` by `handleCancel`), so `setLoading(false)` is skipped (already done).
4. No error message is added to the chat.
5. The user's message that was already appended to `messages` stays visible.

### User-facing behaviour

| State | Button shown |
|-------|-------------|
| Idle | Send (disabled if input empty) |
| `loading = true` | Cancel |
| Applying script | Send (disabled via `applyingScript`) |

## Out of scope

- "Request cancelled" system message in the chat.
- Removing the user message on cancel.
- Any refactor of request logic into a separate hook.
