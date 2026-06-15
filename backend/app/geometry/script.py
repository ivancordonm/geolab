"""Parser and semantic evaluator for the MVP construction scripting language."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from app.geometry.engine import GeometryGraph
from app.geometry.models import (
    AngleBisectorLine,
    AngleBisectorDefinition,
    Circle,
    CircleByCenterPointDefinition,
    CircumscribedCircle,
    CircumscribedDefinition,
    Coordinate,
    EvaluatedValue,
    GeometryDocument,
    GeometryObject,
    GeometryViewport,
    HomothetyPoint,
    HomothetyPointDefinition,
    HomothetyScalar,
    HomothetyScalarDefinition,
    IntersectionCC,
    IntersectionCCDefinition,
    IntersectionLC,
    IntersectionLCDefinition,
    IntersectionLL,
    IntersectionLLDefinition,
    InversionInCircle,
    InversionInCircleDefinition,
    Line,
    LineThroughPointsDefinition,
    Midpoint,
    MidpointDefinition,
    ParallelLine,
    ParallelLineDefinition,
    PerpendicularBisectorLine,
    PerpendicularBisectorDefinition,
    PerpendicularLine,
    PerpendicularLineDefinition,
    Point,
    Polygon,
    PolygonDefinition,
    ReflectionOverLine,
    ReflectionOverLineDefinition,
    ReflectionOverPoint,
    ReflectionOverPointDefinition,
    RegularPolygonDefinition,
    RotatedObject,
    RotationDefinition,
    Segment,
    SegmentBetweenPointsDefinition,
    TranslatedPoint,
    TranslationDefinition,
    VectorPolygonDefinition,
)

CommandName = Literal[
    "Point",
    "Line",
    "Segment",
    "Circle",
    "Midpoint",
    "ParallelLine",
    "PerpendicularLine",
    "IntersectionLL",
    "IntersectionLC",
    "IntersectionCC",
    "Intersection",
    "PerpendicularBisector",
    "AngleBisector",
    "Circumcircle",
    "Reflection",
    "Homothety",
    "Inversion",
    "Translation",
    "Rotation",
    "Polygon",
    "VectorPolygon",
]

SUPPORTED_COMMANDS: frozenset[str] = frozenset(
    {
        "Point",
        "Line",
        "Segment",
        "Circle",
        "Midpoint",
        "ParallelLine",
        "PerpendicularLine",
        "IntersectionLL",
        "IntersectionLC",
        "IntersectionCC",
        "Intersection",
        "PerpendicularBisector",
        "AngleBisector",
        "Circumcircle",
        "Reflection",
        "Homothety",
        "Inversion",
        "Translation",
        "Rotation",
        "Polygon",
        "VectorPolygon",
    }
)

_IDENTIFIER = r"[A-Za-z_][A-Za-z0-9_]*"
_IDENTIFIER_PATTERN = re.compile(rf"^{_IDENTIFIER}$")
_NUMBER_PATTERN = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$")
_STATEMENT_PATTERN = re.compile(
    rf"^\s*(?P<target>{_IDENTIFIER})\s*=\s*"
    rf"(?P<command>{_IDENTIFIER})\s*\((?P<arguments>.*)\)\s*$"
)
_NUM = r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?"
_COORDINATE_PATTERN = re.compile(
    rf"^\(\s*(?P<x>{_NUM})\s*,\s*(?P<y>{_NUM})\s*\)$"
)


@dataclass(frozen=True, slots=True)
class ParsedStatement:
    """One syntactically valid assignment before semantic resolution."""

    target: str
    command: str
    arguments: tuple[str, ...]
    line: int
    source_line: str


@dataclass(frozen=True, slots=True)
class ScriptDiagnostic:
    """Stable parser/semantic diagnostic suitable for API transport."""

    code: str
    message: str
    line: int
    column: int
    source_line: str


class ConstructionScriptError(ValueError):
    """Raised when a script cannot be parsed or converted safely."""

    def __init__(self, diagnostic: ScriptDiagnostic) -> None:
        super().__init__(f"Line {diagnostic.line}: {diagnostic.message}")
        self.diagnostic = diagnostic


def _split_top_level_args(text: str) -> list[str]:
    """Split a comma-separated argument list while respecting nested parentheses."""
    args: list[str] = []
    depth = 0
    current: list[str] = []
    for ch in text:
        if ch == "(":
            depth += 1
            current.append(ch)
        elif ch == ")":
            depth -= 1
            current.append(ch)
        elif ch == "," and depth == 0:
            args.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
    args.append("".join(current).strip())
    return args


def _next_inline_point_label(occupied: set[str]) -> str:
    """Return the next available single-letter label A-Z, then P1, P2, …"""
    for code in range(ord("A"), ord("Z") + 1):
        label = chr(code)
        if label not in occupied:
            return label
    index = 1
    while True:
        label = f"P{index}"
        if label not in occupied:
            return label
        index += 1


def parse_script(script: str) -> list[ParsedStatement]:
    """Parse assignment statements while preserving source line information."""

    statements: list[ParsedStatement] = []
    for line_number, original_line in enumerate(script.splitlines(), start=1):
        source_without_comment = original_line.split("#", maxsplit=1)[0]
        if not source_without_comment.strip():
            continue

        match = _STATEMENT_PATTERN.fullmatch(source_without_comment)
        if match is None:
            _raise(
                "invalid_syntax",
                "Expected assignment syntax: name = Command(arg1, arg2)",
                line_number,
                original_line,
            )

        arguments_text = match.group("arguments").strip()
        raw_args = _split_top_level_args(arguments_text) if arguments_text else []
        arguments = tuple(raw_args)
        if any(not argument for argument in arguments):
            _raise(
                "invalid_argument_list",
                "Arguments must not be empty",
                line_number,
                original_line,
            )

        statements.append(
            ParsedStatement(
                target=match.group("target"),
                command=match.group("command"),
                arguments=arguments,
                line=line_number,
                source_line=original_line,
            )
        )

    if not statements:
        _raise("empty_script", "Script must contain at least one construction", 1, "")
    return statements


def evaluate_script(
    script: str,
    *,
    document_id: str = "script_document",
    title: str = "Script construction",
) -> tuple[GeometryDocument, dict[str, EvaluatedValue]]:
    """Parse, resolve, and evaluate a construction script deterministically."""

    statements = parse_script(script)
    objects: list[GeometryObject] = []
    symbols: dict[str, GeometryObject] = {}

    for statement in statements:
        if statement.command not in SUPPORTED_COMMANDS:
            _raise(
                "unknown_command",
                f"Unknown command '{statement.command}'",
                statement.line,
                statement.source_line,
            )
        if statement.target in symbols:
            _raise(
                "duplicate_assignment",
                f"Object '{statement.target}' is already defined",
                statement.line,
                statement.source_line,
            )

        built = _build_object(statement, symbols, objects)
        # _build_object returns a list to support multi-output commands (intersections).
        for obj in built:
            objects.append(obj)
            symbols[obj.id] = obj

    document = GeometryDocument(
        id=document_id,
        title=title,
        objects=objects,
        viewport=GeometryViewport(),
    )
    graph = GeometryGraph(document)
    statements_by_target = {statement.target: statement for statement in statements}
    for obj in graph.document.objects:
        definition = obj.definition
        selector = getattr(definition, "selector", None)
        value = graph.values[obj.id]
        if selector is not None and value.type == "undefined":
            statement = statements_by_target[obj.id]
            _raise(
                value.code,
                value.message,
                statement.line,
                statement.source_line,
            )
    return graph.document, graph.values


def _build_object(
    statement: ParsedStatement,
    symbols: dict[str, GeometryObject],
    objects: list[GeometryObject],
) -> list[GeometryObject]:
    """Build geometry object(s) for *statement*.

    Returns a list: most commands return a single-element list; intersection
    commands with two solutions return two elements.
    """
    command = statement.command
    arguments = statement.arguments

    # ─── Existing commands ─────────────────────────────────────────────────

    if command == "Point":
        _require_arity(statement, 2)
        x = _parse_number(arguments[0], statement, argument_position=1)
        y = _parse_number(arguments[1], statement, argument_position=2)
        return [Point(id=statement.target, label=statement.target, definition={"type": "free", "x": x, "y": y})]

    if command in ("Line", "Segment", "Circle", "Midpoint"):
        _require_arity(statement, 2)
        first = _resolve_point_argument(arguments[0], statement, symbols, objects, argument_position=1)
        second = _resolve_point_argument(arguments[1], statement, symbols, objects, argument_position=2)
        if command == "Line":
            return [Line(id=statement.target, label=statement.target, definition=LineThroughPointsDefinition(point_a=first.id, point_b=second.id))]
        if command == "Segment":
            return [Segment(id=statement.target, label=statement.target, definition=SegmentBetweenPointsDefinition(point_a=first.id, point_b=second.id))]
        if command == "Circle":
            return [Circle(id=statement.target, label=statement.target, definition=CircleByCenterPointDefinition(center=first.id, point=second.id))]
        if command == "Midpoint":
            return [Midpoint(id=statement.target, label=statement.target, definition=MidpointDefinition(point_a=first.id, point_b=second.id))]

    if command in ("ParallelLine", "PerpendicularLine"):
        _require_arity(statement, 2)
        point_arg = _resolve_point_argument(arguments[0], statement, symbols, objects, argument_position=1)
        line_arg = _resolve_reference(arguments[1], statement, symbols, argument_position=2)
        _require_kind(line_arg, "line", statement, 2)
        if command == "ParallelLine":
            return [ParallelLine(id=statement.target, label=statement.target, definition=ParallelLineDefinition(point=point_arg.id, line=line_arg.id))]
        return [PerpendicularLine(id=statement.target, label=statement.target, definition=PerpendicularLineDefinition(point=point_arg.id, line=line_arg.id))]

    # ─── New: intersections ────────────────────────────────────────────────

    if command == "IntersectionLL":
        _require_arity(statement, 2)
        lA = _resolve_reference(arguments[0], statement, symbols, argument_position=1)
        _require_kind(lA, "line", statement, 1)
        lB = _resolve_reference(arguments[1], statement, symbols, argument_position=2)
        _require_kind(lB, "line", statement, 2)
        return [IntersectionLL(id=statement.target, label=statement.target, definition=IntersectionLLDefinition(line_a=lA.id, line_b=lB.id))]

    if command == "IntersectionLC":
        _require_arity(statement, 3)
        ln = _resolve_reference(arguments[0], statement, symbols, argument_position=1)
        _require_kind(ln, "line", statement, 1)
        cr = _resolve_reference(arguments[1], statement, symbols, argument_position=2)
        _require_kind(cr, "circle", statement, 2)
        idx = _parse_index(arguments[2], statement, argument_position=3)
        return [IntersectionLC(id=statement.target, label=statement.target, definition=IntersectionLCDefinition(line=ln.id, circle=cr.id, index=idx))]

    if command == "IntersectionCC":
        _require_arity(statement, 3)
        cA = _resolve_reference(arguments[0], statement, symbols, argument_position=1)
        _require_kind(cA, "circle", statement, 1)
        cB = _resolve_reference(arguments[1], statement, symbols, argument_position=2)
        _require_kind(cB, "circle", statement, 2)
        idx = _parse_index(arguments[2], statement, argument_position=3)
        return [IntersectionCC(id=statement.target, label=statement.target, definition=IntersectionCCDefinition(circle_a=cA.id, circle_b=cB.id, index=idx))]

    if command == "Intersection":
        if len(arguments) not in (2, 3):
            _raise(
                "invalid_arity",
                "Command 'Intersection' expects 2 or 3 arguments",
                statement.line,
                statement.source_line,
            )
        first = _resolve_reference(arguments[0], statement, symbols, argument_position=1)
        second = _resolve_reference(arguments[1], statement, symbols, argument_position=2)
        if first.kind == "line" and second.kind == "line":
            if len(arguments) != 2:
                _raise(
                    "invalid_arity",
                    "Line-line Intersection expects exactly 2 arguments",
                    statement.line,
                    statement.source_line,
                )
            return [IntersectionLL(id=statement.target, label=statement.target, definition=IntersectionLLDefinition(line_a=first.id, line_b=second.id))]
        if len(arguments) != 3:
            _raise(
                "invalid_arity",
                "Circle intersections require a selector",
                statement.line,
                statement.source_line,
            )
        if {first.kind, second.kind} == {"line", "circle"}:
            selector = _parse_selector(
                arguments[2],
                statement,
                allowed=("first", "second", "left", "right"),
            )
            line = first if first.kind == "line" else second
            circle = first if first.kind == "circle" else second
            return [IntersectionLC(id=statement.target, label=statement.target, definition=IntersectionLCDefinition(line=line.id, circle=circle.id, selector=selector))]
        if first.kind == "circle" and second.kind == "circle":
            selector = _parse_selector(
                arguments[2],
                statement,
                allowed=("upper", "lower", "left", "right"),
            )
            return [IntersectionCC(id=statement.target, label=statement.target, definition=IntersectionCCDefinition(circle_a=first.id, circle_b=second.id, selector=selector))]
        _raise(
            "invalid_reference_type",
            "Intersection requires line-line, line-circle, or circle-circle parents",
            statement.line,
            statement.source_line,
        )

    # ─── New: bisectors / circumcircle ────────────────────────────────────

    if command == "PerpendicularBisector":
        _require_arity(statement, 2)
        pA = _resolve_point_argument(arguments[0], statement, symbols, objects, argument_position=1)
        pB = _resolve_point_argument(arguments[1], statement, symbols, objects, argument_position=2)
        return [PerpendicularBisectorLine(id=statement.target, label=statement.target, definition=PerpendicularBisectorDefinition(point_a=pA.id, point_b=pB.id))]

    if command == "AngleBisector":
        _require_arity(statement, 3)
        arm_a = _resolve_point_argument(arguments[0], statement, symbols, objects, argument_position=1)
        vertex = _resolve_point_argument(arguments[1], statement, symbols, objects, argument_position=2)
        arm_b = _resolve_point_argument(arguments[2], statement, symbols, objects, argument_position=3)
        return [AngleBisectorLine(id=statement.target, label=statement.target, definition=AngleBisectorDefinition(arm_a=arm_a.id, vertex=vertex.id, arm_b=arm_b.id))]

    if command == "Circumcircle":
        _require_arity(statement, 3)
        pA = _resolve_point_argument(arguments[0], statement, symbols, objects, argument_position=1)
        pB = _resolve_point_argument(arguments[1], statement, symbols, objects, argument_position=2)
        pC = _resolve_point_argument(arguments[2], statement, symbols, objects, argument_position=3)
        return [CircumscribedCircle(id=statement.target, label=statement.target, definition=CircumscribedDefinition(point_a=pA.id, point_b=pB.id, point_c=pC.id))]

    # ─── New: smart-dispatch transformations ───────────────────────────────

    if command == "Reflection":
        _require_arity(statement, 2)
        source = _resolve_reference(arguments[0], statement, symbols, argument_position=1)
        mirror = _resolve_reference(arguments[1], statement, symbols, argument_position=2)
        if mirror.kind == "line":
            if source.kind not in {"point", "line", "segment", "circle", "polygon"}:
                _raise(
                    "invalid_reference_type",
                    f"Argument 1 of Reflection must reference a reflectable object, but '{source.id}' is a {source.kind}",
                    statement.line, statement.source_line, source.id,
                )
            return [ReflectionOverLine(id=statement.target, label=statement.target, kind=source.kind, definition=ReflectionOverLineDefinition(object_id=source.id, line=mirror.id))]
        if mirror.kind == "point":
            if source.kind not in {"point", "line", "segment", "circle", "polygon"}:
                _raise(
                    "invalid_reference_type",
                    f"Argument 1 of Reflection must reference a reflectable object, but '{source.id}' is a {source.kind}",
                    statement.line, statement.source_line, source.id,
                )
            return [ReflectionOverPoint(id=statement.target, label=statement.target, kind=source.kind, definition=ReflectionOverPointDefinition(object_id=source.id, center=mirror.id))]
        _raise(
            "invalid_reference_type",
            f"Argument 2 of Reflection must reference a line or point, but '{mirror.id}' is a {mirror.kind}",
            statement.line, statement.source_line, mirror.id,
        )

    if command == "Homothety":
        _require_arity(statement, 3)
        center = _resolve_point_argument(arguments[0], statement, symbols, objects, argument_position=1)
        src = _resolve_point_argument(arguments[1], statement, symbols, objects, argument_position=2)
        # 3rd argument: numeric ratio or point identifier
        if _NUMBER_PATTERN.fullmatch(arguments[2]) is not None:
            ratio = _parse_number(arguments[2], statement, argument_position=3)
            return [HomothetyScalar(id=statement.target, label=statement.target, definition=HomothetyScalarDefinition(center=center.id, point=src.id, ratio=ratio))]
        ratio_pt = _resolve_reference(arguments[2], statement, symbols, argument_position=3)
        _require_kind(ratio_pt, "point", statement, 3)
        return [HomothetyPoint(id=statement.target, label=statement.target, definition=HomothetyPointDefinition(center=center.id, point=src.id, ratio_point=ratio_pt.id))]

    if command == "Inversion":
        _require_arity(statement, 2)
        pt = _resolve_point_argument(arguments[0], statement, symbols, objects, argument_position=1)
        cr = _resolve_reference(arguments[1], statement, symbols, argument_position=2)
        _require_kind(cr, "circle", statement, 2)
        return [InversionInCircle(id=statement.target, label=statement.target, definition=InversionInCircleDefinition(point=pt.id, circle=cr.id))]

    if command == "Translation":
        _require_arity(statement, 3)
        pt = _resolve_point_argument(arguments[0], statement, symbols, objects, argument_position=1)
        from_pt = _resolve_point_argument(arguments[1], statement, symbols, objects, argument_position=2)
        to_pt = _resolve_point_argument(arguments[2], statement, symbols, objects, argument_position=3)
        return [TranslatedPoint(id=statement.target, label=statement.target, definition=TranslationDefinition(point=pt.id, from_=from_pt.id, to=to_pt.id))]

    if command == "Rotation":
        _require_arity(statement, 3)
        source = _resolve_reference(arguments[0], statement, symbols, argument_position=1)
        if source.kind not in {"point", "line", "segment", "circle", "polygon"}:
            _raise(
                "invalid_reference_type",
                f"Argument 1 of Rotation must reference a rotatable object, but '{source.id}' is a {source.kind}",
                statement.line, statement.source_line, source.id,
            )
        center = _resolve_point_argument(arguments[1], statement, symbols, objects, argument_position=2)
        degrees = _parse_number(arguments[2], statement, argument_position=3)
        return [RotatedObject(id=statement.target, label=statement.target, kind=source.kind, definition=RotationDefinition(object_id=source.id, center=center.id, degrees=degrees))]

    # ─── New: polygons ─────────────────────────────────────────────────────────

    if command == "Polygon":
        # Polygon(A, B, C, …)               → basic polygon (≥3 point args)
        # Polygon(A, B, n)                  → regular polygon when last arg is int ≥3
        if len(arguments) < 3:
            _raise(
                "invalid_arity",
                "Command 'Polygon' requires at least 3 arguments",
                statement.line,
                statement.source_line,
            )
        # Detect regular polygon: last arg is a plain integer ≥3
        last_token = arguments[-1].strip()
        is_int_literal = re.fullmatch(r"\d+", last_token) is not None
        if is_int_literal and len(arguments) == 3:
            sides = int(last_token)
            if sides < 3:
                _raise(
                    "invalid_arity",
                    "Regular polygon requires at least 3 sides",
                    statement.line,
                    statement.source_line,
                )
            pA = _resolve_point_argument(arguments[0], statement, symbols, objects, argument_position=1)
            pB = _resolve_point_argument(arguments[1], statement, symbols, objects, argument_position=2)
            return [Polygon(
                id=statement.target,
                label=statement.target,
                definition=RegularPolygonDefinition(point_a=pA.id, point_b=pB.id, sides=sides),
            )]
        # Basic polygon: all args are point references/coordinates
        point_objs = []
        for i, arg in enumerate(arguments):
            pt = _resolve_point_argument(arg, statement, symbols, objects, argument_position=i + 1)
            point_objs.append(pt)
        return [Polygon(
            id=statement.target,
            label=statement.target,
            definition=PolygonDefinition(point_ids=[p.id for p in point_objs]),
        )]

    if command == "VectorPolygon":
        # VectorPolygon(anchor, (dx1,dy1), (dx2,dy2), …)
        if len(arguments) < 3:
            _raise(
                "invalid_arity",
                "Command 'VectorPolygon' requires an anchor point and at least 2 offset vectors",
                statement.line,
                statement.source_line,
            )
        anchor = _resolve_point_argument(arguments[0], statement, symbols, objects, argument_position=1)
        offsets: list[Coordinate] = []
        for i, arg in enumerate(arguments[1:], start=2):
            coord_match = _COORDINATE_PATTERN.fullmatch(arg.strip())
            if coord_match is None:
                _raise(
                    "expected_coordinate",
                    f"Argument {i} of VectorPolygon must be an (x, y) offset coordinate",
                    statement.line,
                    statement.source_line,
                    arg,
                )
            offsets.append(Coordinate(x=float(coord_match.group("x")), y=float(coord_match.group("y"))))
        return [Polygon(
            id=statement.target,
            label=statement.target,
            definition=VectorPolygonDefinition(anchor=anchor.id, offsets=offsets),
        )]

    _raise("unknown_command", f"Unknown command '{command}'", statement.line, statement.source_line)


def _resolve_point_argument(
    token: str,
    statement: ParsedStatement,
    symbols: dict[str, GeometryObject],
    objects: list[GeometryObject],
    *,
    argument_position: int,
) -> GeometryObject:
    coord_match = _COORDINATE_PATTERN.fullmatch(token)
    if coord_match is not None:
        x = float(coord_match.group("x"))
        y = float(coord_match.group("y"))
        occupied: set[str] = set()
        for obj in objects:
            occupied.add(obj.id)
            occupied.add(obj.label)
        occupied.update(symbols.keys())
        label = _next_inline_point_label(occupied)
        inline_point = Point(id=label, label=label, definition={"type": "free", "x": x, "y": y})
        objects.append(inline_point)
        symbols[label] = inline_point
        return inline_point

    obj = _resolve_reference(token, statement, symbols, argument_position=argument_position)
    _require_kind(obj, "point", statement, argument_position)
    return obj


def _require_arity(statement: ParsedStatement, expected: int) -> None:
    if len(statement.arguments) != expected:
        _raise(
            "invalid_arity",
            f"Command '{statement.command}' expects {expected} arguments, received {len(statement.arguments)}",
            statement.line,
            statement.source_line,
        )


def _parse_number(token: str, statement: ParsedStatement, *, argument_position: int) -> float:
    if _NUMBER_PATTERN.fullmatch(token) is None:
        _raise(
            "expected_number",
            f"Argument {argument_position} of {statement.command} must be a number, received '{token}'",
            statement.line,
            statement.source_line,
            token,
        )
    value = float(token)
    if value in (float("inf"), float("-inf")):
        _raise(
            "number_out_of_range",
            f"Argument {argument_position} is outside the supported numeric range",
            statement.line,
            statement.source_line,
            token,
        )
    return value


def _parse_index(token: str, statement: ParsedStatement, *, argument_position: int) -> Literal[1, 2]:
    """Parse a literal "1" or "2" used as an intersection solution index."""
    if token.strip() not in ("1", "2"):
        _raise(
            "expected_index",
            f"Argument {argument_position} of {statement.command} must be 1 or 2, received '{token}'",
            statement.line,
            statement.source_line,
            token,
        )
    return 1 if token.strip() == "1" else 2


def _parse_selector(
    token: str,
    statement: ParsedStatement,
    *,
    allowed: tuple[str, ...],
) -> str:
    selector = token.strip().lower()
    if selector not in allowed:
        _raise(
            "expected_selector",
            f"Argument 3 of Intersection must be one of {', '.join(allowed)}, received '{token}'",
            statement.line,
            statement.source_line,
            token,
        )
    return selector


def _resolve_reference(
    token: str,
    statement: ParsedStatement,
    symbols: dict[str, GeometryObject],
    *,
    argument_position: int,
) -> GeometryObject:
    if _IDENTIFIER_PATTERN.fullmatch(token) is None:
        _raise(
            "expected_reference",
            f"Argument {argument_position} of {statement.command} must be an object name",
            statement.line,
            statement.source_line,
            token,
        )
    referenced = symbols.get(token)
    if referenced is None:
        _raise(
            "undefined_reference",
            f"Object '{token}' must be defined before it is used",
            statement.line,
            statement.source_line,
            token,
        )
    return referenced


def _require_kind(
    obj: GeometryObject,
    expected_kind: str,
    statement: ParsedStatement,
    argument_position: int,
) -> None:
    if obj.kind != expected_kind:
        _raise(
            "invalid_reference_type",
            f"Argument {argument_position} of {statement.command} must reference a {expected_kind}, but '{obj.id}' is a {obj.kind}",
            statement.line,
            statement.source_line,
            obj.id,
        )


def _raise(
    code: str,
    message: str,
    line: int,
    source_line: str,
    token: str | None = None,
) -> None:
    column = source_line.rfind(token) + 1 if token and token in source_line else 1
    raise ConstructionScriptError(
        ScriptDiagnostic(code=code, message=message, line=line, column=column, source_line=source_line)
    )
