"""Shared orchestration for model-backed planners.

Any planner that asks a language model to translate natural language into a
construction script reuses the same deterministic boundary: the model only
*proposes* a script, and `evaluate_script` — never the model — decides whether it
is valid. This base class owns the prompt, the JSON contract, the validation, and
a single repair retry. Concrete subclasses implement only the transport in
`_complete`.
"""

from __future__ import annotations

import json
from abc import abstractmethod
from typing import Any

from app.agent.planner import Planner, PlannerError, UnsupportedRequestError
from app.agent.schemas import AgentResponse
from app.geometry.script import ConstructionScriptError, evaluate_script

MAX_TOKENS = 2000

SYSTEM_PROMPT = """\
You are the construction planner for GeoLab, an interactive 2D geometry workspace.
Translate the user's natural-language request (in ANY language, including Spanish)
into a construction script written ONLY in the deterministic grammar below.

You reason about geometry; you do NOT compute coordinates of derived objects — the
deterministic engine does that. Your only job is to emit a correct script.

GRAMMAR
Each line is one assignment:  name = Command(arg1, arg2, ...)
- name: an identifier matching [A-Za-z_][A-Za-z0-9_]*, unique, and defined before
  it is referenced.
- Reference earlier objects by their name. A point argument may instead be given
  inline as coordinates: (x, y).

COMMANDS (use these names EXACTLY, with the stated arity):
- Point(x, y)                     free point at numeric coordinates
- Line(P, Q)                      line through two points
- Segment(P, Q)                   segment between two points
- Circle(center, throughPoint)    circle centred at one point through another
- Midpoint(P, Q)                  midpoint of two points (a point)
- ParallelLine(P, line)           line through point P parallel to an existing line
- PerpendicularLine(P, line)      line through point P perpendicular to a line
- Intersection(lineA, lineB)      exact intersection point of two lines
- Intersection(line, circle, selector)  selector: first, second, left, or right
- Intersection(circleA, circleB, selector) selector: upper, lower, left, or right
- PerpendicularBisector(P, Q)     perpendicular bisector line of segment PQ
- AngleBisector(armA, vertex, armB)   angle bisector line
- Circumcircle(P, Q, R)           circle through three points
- Reflection(P, mirror)           reflect P over a line or over a point
- Homothety(center, P, ratio)     ratio is a number OR a point name
- Inversion(P, circle)            invert P in a circle
- Translation(P, from, to)        translate P by vector from->to
- Rotation(P, center, degrees)    degrees is a number

RULES
- Emit every object the construction needs, in dependency order.
- Never calculate coordinates for intersections. Always use Intersection.
- Free points need explicit coordinates. When the user does not supply them, invent
  reasonable, well-spread integer coordinates (e.g. A=(0,0), B=(6,0), C=(2,4)).
- Use ONLY the commands above. Do NOT invent constructors. There is no "Triangle",
  "Median", "Altitude", etc. — build them from the primitives:
    * Triangle ABC = three points + three segments (AB, BC, CA).
    * Median from a vertex = Midpoint of the opposite side, then Segment(vertex, midpoint).
    * Altitude from a vertex = Line through the opposite side, then
      PerpendicularLine(vertex, thatLine).
- If a current script is supplied, you may EXTEND it: reuse existing object names and
  never redefine an existing name.
- If the request genuinely cannot be expressed with these commands, return an empty
  string for generated_script and explain why in `reasoning`.

OUTPUT
Return ONLY a JSON object with exactly these fields:
  reasoning         a short explanation of how you mapped the request
  plan              an ordered list of human-readable steps (array of strings)
  generated_script  the full script, one statement per line ("" if impossible)
Do not wrap the JSON in markdown fences or any other text.
"""

PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "reasoning": {"type": "string"},
        "plan": {"type": "array", "items": {"type": "string"}},
        "generated_script": {"type": "string"},
    },
    "required": ["reasoning", "plan", "generated_script"],
    "additionalProperties": False,
}


class BaseScriptPlanner(Planner):
    """Model-neutral planner. Subclasses implement `_complete` only."""

    def generate_plan(self, user_request: str, current_script: str | None = None) -> AgentResponse:
        messages: list[dict[str, Any]] = [
            {"role": "user", "content": _build_user_message(user_request, current_script)}
        ]

        # One proposal, plus a single deterministic repair round if the engine
        # rejects the first script. The engine — not the model — is the authority.
        last_error: ConstructionScriptError | None = None
        for _attempt in range(2):
            text = self._complete(messages)
            proposal = _parse_proposal(text)

            script = str(proposal.get("generated_script", "")).strip()
            if not script:
                raise UnsupportedRequestError(
                    proposal.get("reasoning")
                    or "I could not express this request with the available constructions."
                )

            try:
                evaluate_script(script, document_id="agent_preview", title="Agent preview")
            except ConstructionScriptError as error:
                last_error = error
                messages.append({"role": "assistant", "content": text})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            "That script failed deterministic validation at line "
                            f"{error.diagnostic.line}: {error.diagnostic.message}. "
                            "Return a corrected script that uses only the documented grammar."
                        ),
                    }
                )
                continue

            return AgentResponse(
                reasoning=str(proposal.get("reasoning", "")),
                plan=[str(step) for step in proposal.get("plan", [])],
                generated_script=script,
                warnings=_warnings(current_script, script),
            )

        assert last_error is not None
        raise PlannerError(
            f"The planner could not produce a valid script "
            f"(line {last_error.diagnostic.line}: {last_error.diagnostic.message})."
        )

    @abstractmethod
    def _complete(self, messages: list[dict[str, Any]]) -> str:
        """Send the conversation to the model and return the raw JSON text reply."""


def _build_user_message(user_request: str, current_script: str | None) -> str:
    request = user_request.strip()
    if current_script and current_script.strip():
        return (
            "Current construction script (extend it; reuse existing names, do not "
            f"redefine them):\n{current_script.strip()}\n\nRequest: {request}"
        )
    return f"Request: {request}"


def _parse_proposal(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    # Tolerate models that wrap JSON in ```json fences despite instructions.
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as error:
        raise PlannerError("The planner returned malformed output.") from error
    if not isinstance(parsed, dict):
        raise PlannerError("The planner returned an unexpected response shape.")
    return parsed


def _warnings(current_script: str | None, generated_script: str) -> list[str]:
    warnings: list[str] = []
    if (
        current_script
        and current_script.strip()
        and not generated_script.startswith(current_script.strip())
    ):
        warnings.append(
            "The generated script does not preserve the current construction verbatim; "
            "review it before applying."
        )
    return warnings
