# Agent backend

- `registry.py` provides transport-neutral, schema-validated tool registration
  and execution.
- `tools.py` registers deterministic geometry handlers bound to a validated
  workspace.
- `models.py` defines tool descriptors, calls, outputs, and safe graph views.
- `planner.py` defines the provider-neutral `Planner` interface, deterministic
  intent analysis, rule-based script generation, and validation-before-preview.
- `schemas.py` defines the `/agent/plan` request and response contract.
- `examples.py` contains deterministic default coordinates used by the MVP
  planner.
- `router.py` exposes discovery and execution over HTTP.

The future LLM planner may replace `RuleBasedPlanner` or propose calls against
tool descriptors, but it will not receive direct references to mutable geometry
state. The current planner only returns scripts and never applies them.
