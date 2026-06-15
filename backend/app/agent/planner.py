"""Replaceable planner abstraction with a deterministic rule-based MVP."""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.agent.examples import DEFAULT_POINT_COORDINATES, format_number
from app.agent.schemas import AgentResponse
from app.geometry.script import (
    ConstructionScriptError,
    ParsedStatement,
    evaluate_script,
    parse_script,
)


class PlannerError(ValueError):
    """Base error for requests that cannot produce a safe validated script."""


class UnsupportedRequestError(PlannerError):
    pass


class ProviderTimeoutError(PlannerError):
    """Raised when an external LLM provider exceeds the configured timeout."""


class Planner(ABC):
    """Provider-neutral planner interface for rule-based or future LLM planners."""

    @abstractmethod
    def generate_plan(self, user_request: str, current_script: str | None = None) -> AgentResponse:
        """Generate a reviewed, deterministically validated construction script."""


@dataclass(frozen=True, slots=True)
class Intent:
    kind: str
    labels: tuple[str, ...]


class IntentAnalyzer:
    """Extract the small supported intent set without probabilistic inference."""

    def analyze(self, user_request: str) -> list[Intent]:
        normalized = " ".join(user_request.strip().split())
        intents: list[Intent] = []

        triangle = re.search(
            r"(?:create|construct|draw)\s+(?:a\s+)?triangle\s+([A-Za-z]{3})", normalized, re.I
        )
        if triangle:
            intents.append(Intent("triangle", tuple(triangle.group(1).upper())))

        midpoint = re.search(
            r"(?:construct|create|find|draw)\s+(?:the\s+)?midpoint\s+(?:of\s+)?([A-Za-z])\s*([A-Za-z])",
            normalized,
            re.I,
        )
        if midpoint:
            intents.append(Intent("midpoint", _groups(midpoint)))

        circle = re.search(
            r"(?:draw|create|construct)\s+(?:a\s+|the\s+)?circle\s+centered\s+at\s+([A-Za-z])\s+through\s+([A-Za-z])",
            normalized,
            re.I,
        )
        if circle:
            intents.append(Intent("circle", _groups(circle)))

        perpendicular = re.search(
            r"(?:construct|draw|create)\s+(?:the\s+)?perpendicular(?:\s+line)?\s+from\s+([A-Za-z])\s+to\s+([A-Za-z])\s*([A-Za-z])",
            normalized,
            re.I,
        )
        if perpendicular:
            intents.append(Intent("perpendicular", _groups(perpendicular)))

        parallel = re.search(
            r"(?:construct|draw|create)\s+(?:a\s+|the\s+)?parallel(?:\s+line)?\s+through\s+([A-Za-z])\s+to\s+([A-Za-z])\s*([A-Za-z])",
            normalized,
            re.I,
        )
        if parallel:
            intents.append(Intent("parallel", _groups(parallel)))

        median = re.search(
            r"(?:construct|draw|create)\s+(?:the\s+)?median\s+from\s+([A-Za-z])", normalized, re.I
        )
        if median:
            intents.append(Intent("median", (median.group(1).upper(),)))

        altitude = re.search(
            r"(?:construct|draw|create)\s+(?:the\s+)?altitude\s+from\s+([A-Za-z])", normalized, re.I
        )
        if altitude:
            intents.append(Intent("altitude", (altitude.group(1).upper(),)))

        line = re.search(
            r"(?:draw|create|construct)\s+(?:a\s+|the\s+)?line\s+([A-Za-z])\s*([A-Za-z])",
            normalized,
            re.I,
        )
        if line:
            intents.append(Intent("line", _groups(line)))

        segment = re.search(
            r"(?:draw|create|construct)\s+(?:a\s+|the\s+)?segment\s+([A-Za-z])\s*([A-Za-z])",
            normalized,
            re.I,
        )
        if segment:
            intents.append(Intent("segment", _groups(segment)))

        return _deduplicate_intents(intents)


class RuleBasedPlanner(Planner):
    """Deterministic planner that emits scripts and validates them before return."""

    def __init__(self, analyzer: IntentAnalyzer | None = None) -> None:
        self._analyzer = analyzer or IntentAnalyzer()

    def generate_plan(self, user_request: str, current_script: str | None = None) -> AgentResponse:
        intents = self._analyzer.analyze(user_request)
        if not intents:
            raise UnsupportedRequestError(
                "I can currently plan triangles, lines, segments, circles, midpoints, "
                "parallels, perpendiculars, medians, and altitudes."
            )

        starts_new_triangle = any(intent.kind == "triangle" for intent in intents)
        builder = ScriptBuilder(None if starts_new_triangle else current_script)
        plan: list[str] = []
        warnings: list[str] = []
        triangle_labels = next(
            (intent.labels for intent in intents if intent.kind == "triangle"),
            ("A", "B", "C"),
        )

        for intent in intents:
            if intent.kind == "triangle":
                self._triangle(builder, intent.labels, plan)
            elif intent.kind == "midpoint":
                self._midpoint(builder, intent.labels, plan)
            elif intent.kind == "line":
                self._line(builder, intent.labels, plan)
            elif intent.kind == "segment":
                self._segment(builder, intent.labels, plan)
            elif intent.kind == "circle":
                self._circle(builder, intent.labels, plan)
            elif intent.kind == "perpendicular":
                self._perpendicular(builder, intent.labels, plan)
            elif intent.kind == "parallel":
                self._parallel(builder, intent.labels, plan)
            elif intent.kind == "median":
                self._median(builder, intent.labels[0], triangle_labels, plan)
            elif intent.kind == "altitude":
                self._altitude(builder, intent.labels[0], triangle_labels, plan)

        generated_script = builder.script
        try:
            evaluate_script(generated_script, document_id="agent_preview", title="Agent preview")
        except ConstructionScriptError as error:
            diagnostic = error.diagnostic
            raise PlannerError(
                f"Generated script failed validation at line {diagnostic.line}: {diagnostic.message}"
            ) from error

        if current_script and starts_new_triangle:
            warnings.append(
                "The requested triangle starts a new construction and replaces the current graph."
            )
        reasoning = (
            "I mapped the request to deterministic geometry constructors, resolved all references, "
            "and validated the complete script without mutating the current graph."
        )
        return AgentResponse(
            reasoning=reasoning,
            plan=plan,
            generated_script=generated_script,
            warnings=warnings,
        )

    def _triangle(self, builder: ScriptBuilder, labels: tuple[str, ...], plan: list[str]) -> None:
        for index, label in enumerate(labels):
            builder.ensure_point(label, index)
        a, b, c = labels
        builder.ensure_segment(a, b, preferred_id=f"{a}{b}")
        builder.ensure_segment(b, c, preferred_id=f"{b}{c}")
        builder.ensure_segment(c, a, preferred_id=f"{c}{a}")
        plan.extend(
            [
                f"Create free points {a}, {b}, and {c}.",
                f"Connect {a}{b}, {b}{c}, and {c}{a} with segments.",
            ]
        )

    def _midpoint(self, builder: ScriptBuilder, labels: tuple[str, ...], plan: list[str]) -> None:
        a, b = labels
        builder.ensure_point(a, 0)
        builder.ensure_point(b, 1)
        midpoint_id = builder.unique_id("M" if not builder.has("M") else f"M_{a}{b}")
        builder.add(midpoint_id, "Midpoint", a, b)
        plan.append(f"Construct midpoint {midpoint_id} of {a}{b}.")

    def _line(self, builder: ScriptBuilder, labels: tuple[str, ...], plan: list[str]) -> None:
        line_id = builder.ensure_line(*labels)
        plan.append(f"Draw line {line_id} through {labels[0]} and {labels[1]}.")

    def _segment(self, builder: ScriptBuilder, labels: tuple[str, ...], plan: list[str]) -> None:
        segment_id = builder.ensure_segment(*labels)
        plan.append(f"Draw segment {segment_id} between {labels[0]} and {labels[1]}.")

    def _circle(self, builder: ScriptBuilder, labels: tuple[str, ...], plan: list[str]) -> None:
        center, point = labels
        builder.ensure_point(center, 0)
        builder.ensure_point(point, 2)
        circle_id = builder.unique_id("c1")
        builder.add(circle_id, "Circle", center, point)
        plan.append(f"Draw circle {circle_id} centered at {center} through {point}.")

    def _perpendicular(
        self, builder: ScriptBuilder, labels: tuple[str, ...], plan: list[str]
    ) -> None:
        point, a, b = labels
        builder.ensure_point(point, 2)
        line_id = builder.ensure_line(a, b)
        result_id = builder.unique_id("h")
        builder.add(result_id, "PerpendicularLine", point, line_id)
        plan.append(f"Construct {result_id} through {point}, perpendicular to line {a}{b}.")

    def _parallel(self, builder: ScriptBuilder, labels: tuple[str, ...], plan: list[str]) -> None:
        point, a, b = labels
        builder.ensure_point(point, 3)
        line_id = builder.ensure_line(a, b)
        result_id = builder.unique_id("p")
        builder.add(result_id, "ParallelLine", point, line_id)
        plan.append(f"Construct {result_id} through {point}, parallel to line {a}{b}.")

    def _median(
        self,
        builder: ScriptBuilder,
        vertex: str,
        triangle: tuple[str, ...],
        plan: list[str],
    ) -> None:
        a, b = _opposite_side(vertex, triangle)
        builder.ensure_point(vertex, 2)
        builder.ensure_point(a, 0)
        builder.ensure_point(b, 1)
        midpoint_id = builder.unique_id(f"M_{a}{b}")
        builder.add(midpoint_id, "Midpoint", a, b)
        median_id = builder.unique_id(f"median_{vertex}")
        builder.add(median_id, "Segment", vertex, midpoint_id)
        plan.extend(
            [
                f"Construct midpoint {midpoint_id} of side {a}{b}.",
                f"Draw median {median_id} from {vertex} to {midpoint_id}.",
            ]
        )

    def _altitude(
        self,
        builder: ScriptBuilder,
        vertex: str,
        triangle: tuple[str, ...],
        plan: list[str],
    ) -> None:
        a, b = _opposite_side(vertex, triangle)
        builder.ensure_point(vertex, 2)
        line_id = builder.ensure_line(a, b)
        altitude_id = builder.unique_id(f"h_{vertex}")
        builder.add(altitude_id, "PerpendicularLine", vertex, line_id)
        plan.extend(
            [
                f"Create supporting line {line_id} through side {a}{b}.",
                f"Draw altitude {altitude_id} through {vertex} perpendicular to {a}{b}.",
            ]
        )


class ScriptBuilder:
    """Append-only construction builder with symbol and command awareness."""

    def __init__(self, current_script: str | None) -> None:
        self._lines: list[str] = []
        self._statements: dict[str, ParsedStatement] = {}
        if current_script and current_script.strip():
            try:
                statements = parse_script(current_script)
            except ConstructionScriptError as error:
                raise PlannerError(f"Current construction script is invalid: {error}") from error
            self._lines.extend(current_script.strip().splitlines())
            self._statements.update({statement.target: statement for statement in statements})

    @property
    def script(self) -> str:
        return "\n".join(self._lines)

    def has(self, identifier: str) -> bool:
        return identifier in self._statements

    def unique_id(self, preferred: str) -> str:
        if not self.has(preferred):
            return preferred
        suffix = 2
        while self.has(f"{preferred}_{suffix}"):
            suffix += 1
        return f"{preferred}_{suffix}"

    def add(self, target: str, command: str, *arguments: str) -> str:
        target = self.unique_id(target)
        line = f"{target} = {command}({', '.join(arguments)})"
        statement = ParsedStatement(target, command, tuple(arguments), len(self._lines) + 1, line)
        self._lines.append(line)
        self._statements[target] = statement
        return target

    def ensure_point(self, label: str, coordinate_index: int) -> str:
        existing = self._statements.get(label)
        if existing is not None:
            if existing.command not in {"Point", "Midpoint"}:
                raise PlannerError(f"'{label}' exists but is not a point")
            return label
        x, y = DEFAULT_POINT_COORDINATES[coordinate_index % len(DEFAULT_POINT_COORDINATES)]
        return self.add(label, "Point", format_number(x), format_number(y))

    def ensure_line(self, a: str, b: str) -> str:
        self.ensure_point(a, 0)
        self.ensure_point(b, 1)
        preferred = f"{a}{b}"
        existing = self._statements.get(preferred)
        if existing is not None and existing.command == "Line":
            return preferred
        line_id = preferred if existing is None else f"line_{preferred}"
        existing_line = self._find_binary("Line", a, b)
        return existing_line or self.add(line_id, "Line", a, b)

    def ensure_segment(self, a: str, b: str, preferred_id: str | None = None) -> str:
        self.ensure_point(a, 0)
        self.ensure_point(b, 1)
        existing = self._find_binary("Segment", a, b)
        return existing or self.add(preferred_id or f"segment_{a}{b}", "Segment", a, b)

    def _find_binary(self, command: str, a: str, b: str) -> str | None:
        for target, statement in self._statements.items():
            if statement.command == command and set(statement.arguments) == {a, b}:
                return target
        return None


def _groups(match: re.Match[str]) -> tuple[str, ...]:
    return tuple(group.upper() for group in match.groups())


def _deduplicate_intents(intents: list[Intent]) -> list[Intent]:
    seen: set[tuple[str, tuple[str, ...]]] = set()
    result: list[Intent] = []
    for intent in intents:
        key = (intent.kind, intent.labels)
        if key not in seen:
            seen.add(key)
            result.append(intent)
    return result


def _opposite_side(vertex: str, triangle: tuple[str, ...]) -> tuple[str, str]:
    if vertex not in triangle:
        raise PlannerError(f"Point '{vertex}' is not part of triangle {''.join(triangle)}")
    opposite = [label for label in triangle if label != vertex]
    if len(opposite) != 2:
        raise PlannerError("A median or altitude requires a three-point triangle")
    return opposite[0], opposite[1]
