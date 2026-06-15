import pytest

from app.geometry.script import ConstructionScriptError, evaluate_script, parse_script

VALID_SCRIPT = """# A triangle with dependent constructions
A = Point(0, 0)
B = Point(4, 0)
C = Point(2, 3)
AB = Line(A, B)
base = Segment(A, B)
M = Midpoint(A, B)
p = ParallelLine(C, AB)
h = PerpendicularLine(C, AB)
c1 = Circle(A, C)
"""


def test_parser_preserves_statement_line_numbers_and_ignores_comments() -> None:
    statements = parse_script(VALID_SCRIPT)

    assert [statement.target for statement in statements] == [
        "A",
        "B",
        "C",
        "AB",
        "base",
        "M",
        "p",
        "h",
        "c1",
    ]
    assert statements[0].line == 2
    assert statements[3].command == "Line"
    assert statements[3].arguments == ("A", "B")


def test_valid_script_converts_to_shared_model_and_evaluates() -> None:
    document, values = evaluate_script(
        VALID_SCRIPT,
        document_id="triangle_doc",
        title="Triangle",
    )

    assert document.id == "triangle_doc"
    assert document.title == "Triangle"
    assert [obj.id for obj in document.objects] == [
        "A",
        "B",
        "C",
        "AB",
        "base",
        "M",
        "p",
        "h",
        "c1",
    ]
    assert document.objects[3].definition.type == "through_points"
    assert values["M"].model_dump() == {"type": "point", "x": 2.0, "y": 0.0}
    assert values["h"].model_dump() == {"type": "line", "a": 1.0, "b": 0.0, "c": -2.0}
    assert values["c1"].type == "circle"


@pytest.mark.parametrize(
    ("script", "code", "line"),
    [
        ("A Point(0, 0)", "invalid_syntax", 1),
        ("A = Hexagon(0, 0)", "unknown_command", 1),
        ("A = Point(0)", "invalid_arity", 1),
        ("A = Point(x, 0)", "expected_number", 1),
        ("AB = Line(A, B)", "undefined_reference", 1),
        ("A = Point(0, 0)\nA = Point(1, 1)", "duplicate_assignment", 2),
        (
            "A = Point(0, 0)\nB = Point(1, 0)\ns = Segment(A, B)\np = ParallelLine(A, s)",
            "invalid_reference_type",
            4,
        ),
        ("# comments only", "empty_script", 1),
    ],
)
def test_invalid_scripts_return_structured_line_numbered_errors(
    script: str,
    code: str,
    line: int,
) -> None:
    with pytest.raises(ConstructionScriptError) as error_info:
        evaluate_script(script)

    diagnostic = error_info.value.diagnostic
    assert diagnostic.code == code
    assert diagnostic.line == line
    assert diagnostic.column >= 1


def test_references_must_be_defined_before_use() -> None:
    script = "AB = Line(A, B)\nA = Point(0, 0)\nB = Point(1, 0)"

    with pytest.raises(ConstructionScriptError) as error_info:
        evaluate_script(script)

    diagnostic = error_info.value.diagnostic
    assert diagnostic.code == "undefined_reference"
    assert diagnostic.line == 1
    assert "defined before" in diagnostic.message


# ─── Conformance: polygon construction variants ──────────────────────────────

import math  # noqa: E402 (conformance fixtures share the module)


def test_basic_polygon_evaluates_to_triangle_vertices() -> None:
    """Polígono básico — 3 puntos libres, vértices copiados tal cual."""
    script = "A = Point(0, 0)\nB = Point(4, 0)\nC = Point(2, 3)\npoly = Polygon(A, B, C)"
    _, values = evaluate_script(script)

    v = values["poly"]
    assert v.type == "polygon"
    assert len(v.vertices) == 3
    assert v.vertices[0].model_dump() == pytest.approx({"x": 0.0, "y": 0.0}, abs=1e-9)
    assert v.vertices[1].model_dump() == pytest.approx({"x": 4.0, "y": 0.0}, abs=1e-9)
    assert v.vertices[2].model_dump() == pytest.approx({"x": 2.0, "y": 3.0}, abs=1e-9)


def test_regular_polygon_square_vertices_are_correct() -> None:
    """Polígono regular — cuadrado a partir de A=(0,0), B=(1,0), 4 lados.
    Vértices esperados (CCW exterior angle = 2π/4 = π/2):
      v0=(0,0), v1=(1,0), v2=(1,1), v3=(0,1)
    """
    script = "A = Point(0, 0)\nB = Point(1, 0)\npoly = Polygon(A, B, 4)"
    _, values = evaluate_script(script)

    v = values["poly"]
    assert v.type == "polygon"
    assert len(v.vertices) == 4
    assert v.vertices[0].model_dump() == pytest.approx({"x": 0.0, "y": 0.0}, abs=1e-9)
    assert v.vertices[1].model_dump() == pytest.approx({"x": 1.0, "y": 0.0}, abs=1e-9)
    assert v.vertices[2].model_dump() == pytest.approx({"x": 1.0, "y": 1.0}, abs=1e-9)
    assert v.vertices[3].model_dump() == pytest.approx({"x": 0.0, "y": 1.0}, abs=1e-9)


def test_regular_polygon_equilateral_triangle_side_length() -> None:
    """Triángulo equilátero: todos los lados tienen la misma longitud."""
    script = "A = Point(0, 0)\nB = Point(2, 0)\npoly = Polygon(A, B, 3)"
    _, values = evaluate_script(script)

    verts = values["poly"].vertices
    assert len(verts) == 3
    for i in range(3):
        j = (i + 1) % 3
        dist = math.sqrt((verts[j].x - verts[i].x) ** 2 + (verts[j].y - verts[i].y) ** 2)
        assert dist == pytest.approx(2.0, abs=1e-9)


def test_vector_polygon_vertices_relative_to_anchor() -> None:
    """Polígono vectorial — ancla en (1,1), offsets relativos (1,0) y (0,1)."""
    script = "A = Point(1, 1)\npoly = VectorPolygon(A, (1, 0), (0, 1))"
    _, values = evaluate_script(script)

    v = values["poly"]
    assert v.type == "polygon"
    assert len(v.vertices) == 3
    assert v.vertices[0].model_dump() == pytest.approx({"x": 1.0, "y": 1.0}, abs=1e-9)
    assert v.vertices[1].model_dump() == pytest.approx({"x": 2.0, "y": 1.0}, abs=1e-9)
    assert v.vertices[2].model_dump() == pytest.approx({"x": 1.0, "y": 2.0}, abs=1e-9)


# ---------------------------------------------------------------------------
# Inline coordinate tuple tests
# ---------------------------------------------------------------------------


def test_segment_from_two_inline_coordinates_produces_three_objects() -> None:
    document, values = evaluate_script("s = Segment((1, 2), (3, 4))")

    ids = [obj.id for obj in document.objects]
    # Two auto-named points + the segment.
    assert len(ids) == 3
    point_ids = ids[:2]
    segment_id = ids[2]
    assert segment_id == "s"
    # All three objects evaluated successfully.
    for pid in point_ids:
        assert values[pid].type == "point"
    seg_val = values["s"]
    assert seg_val.type == "segment"
    assert seg_val.start.x == pytest.approx(1.0)
    assert seg_val.start.y == pytest.approx(2.0)
    assert seg_val.end.x == pytest.approx(3.0)
    assert seg_val.end.y == pytest.approx(4.0)
    # Segment definition references the auto-created point ids.
    seg_def = document.objects[2].definition
    assert seg_def.type == "between_points"
    assert seg_def.point_a == point_ids[0]
    assert seg_def.point_b == point_ids[1]


def test_line_from_two_inline_coordinates() -> None:
    document, values = evaluate_script("L = Line((0, 0), (1, 0))")

    assert len(document.objects) == 3
    assert document.objects[2].id == "L"
    line_val = values["L"]
    assert line_val.type == "line"
    # Horizontal line y=0: b=1, c=0 (normalized).
    assert line_val.b == pytest.approx(1.0) or line_val.a == pytest.approx(0.0)


def test_circle_inline_center_and_existing_point() -> None:
    script = "A = Point(5, 0)\nc = Circle((0, 0), A)"
    document, values = evaluate_script(script)

    # A (explicit) + auto-named center point + circle = 3 objects.
    assert len(document.objects) == 3
    circle_val = values["c"]
    assert circle_val.type == "circle"
    assert circle_val.radius == pytest.approx(5.0)


def test_reflection_can_transform_a_segment_and_circle() -> None:
    script = "\n".join(
        [
            "A = Point(1, 1)",
            "B = Point(3, 1)",
            "C = Point(0, 0)",
            "D = Point(0, 2)",
            "axis = Line(C, D)",
            "s = Segment(A, B)",
            "sr = Reflection(s, axis)",
            "cr = Circle(A, B)",
            "cr2 = Reflection(cr, C)",
        ]
    )
    document, values = evaluate_script(script)

    reflected_segment = next(obj for obj in document.objects if obj.id == "sr")
    assert reflected_segment.kind == "segment"
    assert values["sr"].type == "segment"
    assert values["sr"].start.model_dump() == pytest.approx({"x": -1.0, "y": 1.0}, abs=1e-9)
    assert values["sr"].end.model_dump() == pytest.approx({"x": -3.0, "y": 1.0}, abs=1e-9)

    reflected_circle = next(obj for obj in document.objects if obj.id == "cr2")
    assert reflected_circle.kind == "circle"
    assert values["cr2"].type == "circle"
    assert values["cr2"].center.model_dump() == pytest.approx({"x": -1.0, "y": -1.0}, abs=1e-9)
    assert values["cr2"].radius == pytest.approx(2.0, abs=1e-9)


def test_midpoint_from_inline_coordinates() -> None:
    document, values = evaluate_script("M = Midpoint((0, 0), (4, 2))")

    assert len(document.objects) == 3
    mid_val = values["M"]
    assert mid_val.type == "point"
    assert mid_val.x == pytest.approx(2.0)
    assert mid_val.y == pytest.approx(1.0)


def test_inline_point_ids_do_not_collide_with_existing_labels() -> None:
    # A, B, C already used — auto labels should start at D.
    script = "A = Point(0,0)\nB = Point(1,0)\nC = Point(2,0)\ns = Segment((3,0),(4,0))"
    document, _values = evaluate_script(script)

    auto_ids = {obj.id for obj in document.objects if obj.id not in ("A", "B", "C", "s")}
    assert auto_ids.isdisjoint({"A", "B", "C", "s"})
    # Labels must be unique.
    all_ids = [obj.id for obj in document.objects]
    assert len(all_ids) == len(set(all_ids))


def test_inline_point_ids_do_not_collide_with_each_other() -> None:
    # Both inline points in the same statement must get distinct labels.
    script = "s = Segment((0, 0), (1, 1))"
    document, _values = evaluate_script(script)

    point_objects = [obj for obj in document.objects if obj.kind == "point"]
    point_ids = [obj.id for obj in point_objects]
    assert len(point_ids) == len(set(point_ids)), "Inline point ids must be unique"


def test_coordinate_comma_is_not_split_as_top_level_argument() -> None:
    """(1, 2) must be treated as a single argument, not two."""
    # If the comma inside the tuple were split, we'd get arity 3 → invalid_arity error.
    document, _values = evaluate_script("s = Segment((1, 2), (3, 4))")
    assert len(document.objects) == 3  # 2 inline points + segment


def test_coordinate_tuple_in_line_position_raises_error() -> None:
    """A coordinate tuple cannot be auto-desugared to a line."""
    script = "A = Point(0, 0)\nB = Point(1, 0)\nAB = Line(A, B)\np = ParallelLine(A, (1, 0))"

    with pytest.raises(ConstructionScriptError) as error_info:
        evaluate_script(script)

    # The token "(1, 0)" is not a valid identifier for a line argument.
    diagnostic = error_info.value.diagnostic
    assert diagnostic.code == "expected_reference"
    assert diagnostic.line == 4


def test_parallel_line_with_inline_point_coordinate() -> None:
    """ParallelLine should accept an inline (x,y) for its point argument."""
    script = "A = Point(0, 0)\nB = Point(1, 0)\nAB = Line(A, B)\np = ParallelLine((0, 3), AB)"
    document, values = evaluate_script(script)

    # A, B, auto-point, AB, p = 5 objects.
    assert len(document.objects) == 5
    assert values["p"].type == "line"


def test_script_with_inline_coordinates_is_deterministic() -> None:
    """Running the same script twice must produce identical object ids."""
    script = "s = Segment((1, 2), (3, 4))"
    doc1, _ = evaluate_script(script, document_id="d1")
    doc2, _ = evaluate_script(script, document_id="d2")

    ids1 = [obj.id for obj in doc1.objects]
    ids2 = [obj.id for obj in doc2.objects]
    assert ids1 == ids2


def test_generic_intersection_builds_equilateral_triangle_without_manual_coordinates() -> None:
    script = """A = Point(0,0)
B = Point(4,0)
cA = Circle(A,B)
cB = Circle(B,A)
C = Intersection(cA,cB,upper)
AB = Segment(A,B)
AC = Segment(A,C)
BC = Segment(B,C)"""

    document, values = evaluate_script(script)

    assert document.objects[4].definition.selector == "upper"
    assert values["C"].type == "point"
    assert values["C"].x == pytest.approx(2)
    assert values["C"].y == pytest.approx(3.464101615)


def test_generic_intersection_rejects_ambiguous_direction() -> None:
    script = """A = Point(0,0)
B = Point(4,0)
cA = Circle(A,B)
cB = Circle(B,A)
C = Intersection(cA,cB,left)"""

    with pytest.raises(ConstructionScriptError) as error_info:
        evaluate_script(script)

    assert error_info.value.diagnostic.code == "ambiguous_selector"
    assert error_info.value.diagnostic.line == 5


def test_legacy_numeric_intersection_script_remains_supported() -> None:
    script = """A = Point(0,0)
B = Point(4,0)
cA = Circle(A,B)
cB = Circle(B,A)
C = IntersectionCC(cA,cB,1)"""

    document, values = evaluate_script(script)

    assert document.objects[-1].definition.index == 1
    assert document.objects[-1].definition.selector is None
    assert values["C"].type == "point"
