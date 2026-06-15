# Frontend agent boundary

- `planner.ts` defines a provider-neutral client and the HTTP rule-based planner
  adapter.
- `scriptGenerator.ts` converts the current shared geometry document back into
  reproducible construction DSL for planner context.
- `types.ts` defines UI-facing plan and chat contracts.

The assistant only previews scripts. Applying a preview always uses the existing
`/geometry/evaluate-script` validation path and never mutates geometry directly.
