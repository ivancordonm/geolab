# Generalize Point-Ratio Homothety to Objects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the `Homothety(center, object, ratioPoint)` "point-ratio" construction so `object` can be a line, segment, circle, or polygon (not only a point), in both the Python and TypeScript geometry runtimes.

**Architecture:** Mirror the pattern already used by the sibling `Homothety(center, object, numericRatio)` ("scalar") construction end to end: schema field rename with a backward-compatible alias, parser/validator relaxed to the existing "invertible" kind set, and a new small per-kind "reference point" helper that lets the evaluator derive a scalar ratio `k` and then delegate to the already-generic `_scale_value`/`scaleValue` reconstruction function. No new construction type, no new UI interaction step.

**Tech Stack:** Python 3 / Pydantic (backend), TypeScript / Vitest (frontend). No new dependencies.

## Global Constraints

- Both runtimes must produce results within `1e-9` (`GEOMETRY_EPSILON`) of each other — verified by the shared conformance fixture in `shared/fixtures/transformations.json`.
- Documents saved with the legacy `point` field on `homothety_point` definitions must keep loading unchanged (no migration): use the same `validation_alias=AliasChoices("object", "point")` / `serialization_alias="object"` pattern already used by `HomothetyScalarDefinition`.
- Ratio semantics: `k = distance(center, ratioPoint) / distance(center, referencePoint)`, where `referencePoint` is: the point itself (`point`), the circle's own center (`circle`), the segment's midpoint (`segment`), the foot of the perpendicular from `center` to the line (`line`), or the arithmetic-mean centroid of the vertices (`polygon`). This was confirmed with the user in `docs/superpowers/specs/2026-07-14-homothety-point-ratio-objects-design.md`.
- `k == 0` on a non-point object is invalid (matches the existing rule for the scalar variant), but must be detected at evaluation time (a runtime `UndefinedValue`, code `zero_ratio`), not at validation time, because `k` depends on live point positions.

---

### Task 1: Backend — generalize schema, parser, validator, evaluator

**Files:**
- Modify: `backend/app/geometry/models.py:198-202` (`HomothetyPointDefinition`), `backend/app/geometry/models.py:344-346` (`HomothetyPoint`)
- Modify: `backend/app/geometry/engine.py:111-112` (`get_parent_ids`), `backend/app/geometry/engine.py:293-296` (`_validate_parent_kinds`), `backend/app/geometry/engine.py:579-596` (evaluator), and add a new helper function near `_scale_value` (currently ending at `backend/app/geometry/engine.py:977`)
- Modify: `backend/app/geometry/script.py:584-587` (`Homothety` parser, point-ratio branch)
- Test: `backend/tests/test_geometry_script.py`, `backend/tests/test_geometry_models.py`

**Interfaces:**
- Produces: `HomothetyPointDefinition.object_id: str` (JSON alias `"object"`, reads legacy `"point"`), `HomothetyPoint.kind: Literal["point","line","segment","circle","polygon"]`, `_reference_point_for_ratio(value: EvaluatedValue, center: PointValue) -> PointValue` (module-level function in `engine.py`).
- Consumes: existing `_scale_value(value, center, ratio)` (`backend/app/geometry/engine.py:955`), existing `GEOMETRY_EPSILON`, `_clean_zero`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_geometry_script.py` (near `test_numeric_homothety_scales_a_segment_and_preserves_legacy_point_field`):

```python
def test_point_ratio_homothety_scales_a_segment() -> None:
    script = """B = Point(0, 0)
A = Point(1, 1)
D = Point(2, -1)
V = Point(3, 0)
S = Segment(A, D)
HP = Homothety(B, S, V)"""

    document, values = evaluate_script(script)

    scaled = document.objects[-1]
    assert scaled.kind == "segment"
    assert scaled.definition.type == "homothety_point"
    assert scaled.definition.object_id == "S"
    assert values["HP"].model_dump() == {
        "type": "segment",
        "start": {"x": 2.0, "y": 2.0},
        "end": {"x": 4.0, "y": -2.0},
    }

    restored = geometry_document_from_json(
        '{"schemaVersion":1,"id":"legacy","title":"Legacy","objects":['
        '{"id":"B","label":"B","kind":"point","visible":true,"definition":{"type":"free","x":0,"y":0}},'
        '{"id":"A","label":"A","kind":"point","visible":true,"definition":{"type":"free","x":1,"y":0}},'
        '{"id":"V","label":"V","kind":"point","visible":true,"definition":{"type":"free","x":2,"y":0}},'
        '{"id":"H","label":"H","kind":"point","visible":true,"definition":'
        '{"type":"homothety_point","center":"B","point":"A","ratioPoint":"V"}}]}'
    )
    assert restored.objects[-1].definition.object_id == "A"


def test_point_ratio_homothety_rejects_non_transformable_object() -> None:
    script = """B = Point(0, 0)
V = Point(2, 0)
f = Function(y = x)
HP = Homothety(B, f, V)"""

    with pytest.raises(ConstructionScriptError) as error_info:
        evaluate_script(script)

    assert error_info.value.diagnostic.code == "invalid_reference_type"


def test_point_ratio_homothety_zero_ratio_is_undefined_for_non_point() -> None:
    script = """B = Point(0, 0)
A = Point(1, 1)
D = Point(2, -1)
S = Segment(A, D)
HP = Homothety(B, S, B)"""

    document, values = evaluate_script(script)

    assert values["HP"].code == "zero_ratio"


def test_point_ratio_homothety_coincident_reference_point_is_undefined() -> None:
    script = """B = Point(0, 0)
P1 = Point(1, 0)
C = Circle(B, P1)
V = Point(2, 0)
HP = Homothety(B, C, V)"""

    document, values = evaluate_script(script)

    assert values["HP"].code == "coincident_points"
```

Add to `backend/tests/test_geometry_models.py` (near the other `GeometryGraph`/`GeometryValidationError` tests):

```python
def test_point_ratio_homothety_rejects_kind_mismatch() -> None:
    document = geometry_document_from_json(
        '{"schemaVersion":1,"id":"mismatch","title":"Mismatch","objects":['
        '{"id":"B","label":"B","kind":"point","visible":true,"definition":{"type":"free","x":0,"y":0}},'
        '{"id":"A","label":"A","kind":"point","visible":true,"definition":{"type":"free","x":1,"y":0}},'
        '{"id":"D","label":"D","kind":"point","visible":true,"definition":{"type":"free","x":2,"y":1}},'
        '{"id":"S","label":"S","kind":"segment","visible":true,'
        '"definition":{"type":"between_points","pointA":"A","pointB":"D"}},'
        '{"id":"V","label":"V","kind":"point","visible":true,"definition":{"type":"free","x":3,"y":0}},'
        '{"id":"HP","label":"HP","kind":"point","visible":true,'
        '"definition":{"type":"homothety_point","center":"B","object":"S","ratioPoint":"V"}}]}'
    )
    with pytest.raises(GeometryValidationError, match="must keep the scaled kind"):
        GeometryGraph(document)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_geometry_script.py tests/test_geometry_models.py -k "point_ratio_homothety" -v`
Expected: FAIL — `test_point_ratio_homothety_scales_a_segment` and `test_point_ratio_homothety_rejects_kind_mismatch` fail because argument 2 is currently forced through `_resolve_point_argument` (a segment is rejected as "not a point" today, and `HomothetyPointDefinition` has no `object_id`/no non-point `kind`); `test_point_ratio_homothety_zero_ratio_is_undefined_for_non_point` and `..._coincident_reference_point_is_undefined` fail for the same reason (the script itself won't parse `Homothety(B, S, ...)`/`Homothety(B, C, ...)`); `test_point_ratio_homothety_rejects_non_transformable_object` currently fails too, because today argument 2 is resolved via `_resolve_point_argument`, which raises `invalid_reference_type` for a different reason (not a point) rather than the new "not transformable" message — the diagnostic code happens to match, so pin this down after Step 4 rather than trusting a coincidental pass now.

- [ ] **Step 3: Update the schema (`models.py`)**

Replace `backend/app/geometry/models.py:198-202`:

```python
class HomothetyPointDefinition(GeometryModel):
    type: Literal["homothety_point"] = "homothety_point"
    center: str
    object_id: str = Field(
        validation_alias=AliasChoices("object", "point"),
        serialization_alias="object",
    )
    ratio_point: str
```

Replace `backend/app/geometry/models.py:344-346`:

```python
class HomothetyPoint(GeometryObjectBase):
    kind: Literal["point", "line", "segment", "circle", "polygon"]
    definition: HomothetyPointDefinition
```

- [ ] **Step 4: Update the parser (`script.py`)**

Replace `backend/app/geometry/script.py:584-587`:

```python
        src = _resolve_reference(arguments[1], statement, symbols, argument_position=2)
        if src.kind not in {"point", "line", "segment", "circle", "polygon"}:
            _raise(
                "invalid_reference_type",
                f"Argument 2 of Homothety must reference a transformable object, but '{src.id}' is a {src.kind}",
                statement.line, statement.source_line, src.id,
            )
        ratio_pt = _resolve_reference(arguments[2], statement, symbols, argument_position=3)
        _require_kind(ratio_pt, "point", statement, 3)
        return [HomothetyPoint(id=statement.target, label=statement.target, kind=src.kind, definition=HomothetyPointDefinition(center=center.id, object_id=src.id, ratio_point=ratio_pt.id))]
```

- [ ] **Step 5: Update `get_parent_ids` (`engine.py`)**

Replace `backend/app/geometry/engine.py:111-112`:

```python
    if isinstance(definition, HomothetyPointDefinition):
        return [definition.center, definition.object_id, definition.ratio_point]
```

- [ ] **Step 6: Update the validator (`engine.py`)**

Replace `backend/app/geometry/engine.py:293-296`:

```python
        elif isinstance(definition, HomothetyPointDefinition):
            require_kind(definition.center, "point")
            actual = self._objects_by_id[definition.object_id].kind
            if actual not in {"point", "line", "segment", "circle", "polygon"}:
                raise GeometryValidationError(
                    f"Object '{obj.id}' requires parent '{definition.object_id}' to be scalable"
                )
            if obj.kind != actual:
                raise GeometryValidationError(
                    f"Object '{obj.id}' must keep the scaled kind '{actual}'"
                )
            require_kind(definition.ratio_point, "point")
```

- [ ] **Step 7: Add the reference-point helper and update the evaluator (`engine.py`)**

Insert immediately after `_scale_value` (right after the closing `raise GeometryValidationError(...)` line that ends that function, `backend/app/geometry/engine.py:977`):

```python
def _reference_point_for_ratio(value: EvaluatedValue, center: PointValue) -> PointValue:
    if isinstance(value, PointValue):
        return value
    if isinstance(value, LineValue):
        d = value.a * center.x + value.b * center.y + value.c
        return PointValue(x=_clean_zero(center.x - value.a * d), y=_clean_zero(center.y - value.b * d))
    if isinstance(value, SegmentValue):
        return PointValue(
            x=_clean_zero((value.start.x + value.end.x) / 2),
            y=_clean_zero((value.start.y + value.end.y) / 2),
        )
    if isinstance(value, CircleValue):
        return PointValue(x=value.center.x, y=value.center.y)
    if isinstance(value, PolygonValue):
        count = len(value.vertices)
        return PointValue(
            x=_clean_zero(sum(vertex.x for vertex in value.vertices) / count),
            y=_clean_zero(sum(vertex.y for vertex in value.vertices) / count),
        )
    raise GeometryValidationError(f"Homothety is unsupported for evaluated type '{value.type}'")
```

Replace the evaluator block at `backend/app/geometry/engine.py:579-596`:

```python
        if isinstance(definition, HomothetyPointDefinition):
            ctr = self._require_value(obj.id, definition.center, "point")
            if isinstance(ctr, UndefinedValue):
                return ctr
            assert isinstance(ctr, PointValue)
            source = self._require_value(obj.id, definition.object_id, obj.kind)
            if isinstance(source, UndefinedValue):
                return source
            rp = self._require_value(obj.id, definition.ratio_point, "point")
            if isinstance(rp, UndefinedValue):
                return rp
            assert isinstance(rp, PointValue)
            ref = _reference_point_for_ratio(source, ctr)
            dop = hypot(ref.x - ctr.x, ref.y - ctr.y)
            if dop <= GEOMETRY_EPSILON:
                return UndefinedValue(code="coincident_points", message="Center and reference point coincide")
            k = hypot(rp.x - ctr.x, rp.y - ctr.y) / dop
            if k == 0 and source.type != "point":
                return UndefinedValue(code="zero_ratio", message="A zero homothety ratio is only supported for points")
            return _scale_value(source, ctr, k)
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_geometry_script.py tests/test_geometry_models.py -k "point_ratio_homothety" -v`
Expected: PASS (5 tests)

- [ ] **Step 9: Run the full backend suite and lint**

Run: `cd backend && source .venv/bin/activate && pytest && ruff check app tests`
Expected: PASS, no lint errors (this also catches any other place in the backend that pattern-matched on `HomothetyPointDefinition.point`)

- [ ] **Step 10: Commit**

```bash
git add backend/app/geometry/models.py backend/app/geometry/engine.py backend/app/geometry/script.py backend/tests/test_geometry_script.py backend/tests/test_geometry_models.py
git commit -m "feat: generalize point-ratio homothety to non-point objects (backend)"
```

---

### Task 2: Backend — add a point-ratio homothety case to the shared conformance fixture

**Files:**
- Modify: `backend/fixtures-src/transformations.txt`
- Modify (generated, do not hand-edit): `shared/fixtures/transformations.json`
- Test: `backend/tests/test_geometry_models.py`

**Interfaces:**
- Consumes: Task 1's parser/evaluator changes (a point-ratio `Homothety` over a `segment` must already work).
- Produces: fixture object `HP` (kind `segment`) in `shared/fixtures/transformations.json`, consumed by `frontend/src/geometry/conformance.test.ts` in Task 3.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_geometry_models.py`, alongside the existing `FIXTURE_PATH` constant:

```python
TRANSFORMATIONS_FIXTURE_PATH = (
    Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "transformations.json"
)


def test_transformations_fixture_includes_point_ratio_homothety_on_a_segment() -> None:
    fixture = json.loads(TRANSFORMATIONS_FIXTURE_PATH.read_text())
    document = GeometryDocument.model_validate(fixture["document"])
    values = evaluate_geometry_document(document)

    assert values["HP"].model_dump() == {
        "type": "segment",
        "start": {"x": 2.0, "y": 2.0},
        "end": {"x": 4.0, "y": -2.0},
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_geometry_models.py -k transformations_fixture_includes_point_ratio -v`
Expected: FAIL with `KeyError: 'HP'` (no such object in the current fixture)

- [ ] **Step 3: Extend the fixture source script**

Append to `backend/fixtures-src/transformations.txt` (after the existing `Inv = Inversion(P, c1)` line):

```
V = Point(3, 0)
S2 = Segment(A, D)
HP = Homothety(B, S2, V)
```

- [ ] **Step 4: Regenerate the fixture**

Run: `cd backend && source .venv/bin/activate && python scripts/generate_conformance_fixture.py fixtures-src/transformations.txt ../shared/fixtures/transformations.json`
Expected output: `Wrote ../shared/fixtures/transformations.json with 17 evaluated values`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_geometry_models.py -k transformations_fixture_includes_point_ratio -v`
Expected: PASS

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && source .venv/bin/activate && pytest`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/fixtures-src/transformations.txt shared/fixtures/transformations.json backend/tests/test_geometry_models.py
git commit -m "test: add point-ratio homothety segment case to the transformations fixture"
```

---

### Task 3: Frontend — generalize types and `engine.ts`

**Files:**
- Modify: `frontend/src/types/geometry.ts:139-142` (`HomothetyPoint`)
- Modify: `frontend/src/geometry/engine.ts:69-70` (`getParentIds`), `frontend/src/geometry/engine.ts:337-341` (`validate`), `frontend/src/geometry/engine.ts:650-668` (`evaluate`), and add a new exported helper near `scaleValue` (currently ending at `frontend/src/geometry/engine.ts:1112`)
- Test: `frontend/src/geometry/engine.test.ts`, `frontend/src/geometry/conformance.test.ts` (no code changes, just must now pass)

**Interfaces:**
- Produces: `HomothetyPoint` (generic union over `ReflectableKind`, same shape pattern as `HomothetyScalar`), `export function referencePointForRatio(value: EvaluatedValue, center: PointValue): PointValue` (exported from `engine.ts`; Task 5 imports it in `ObjectList.tsx`).
- Consumes: existing `scaleValue`, `GEOMETRY_EPSILON`, `cleanZero`, `isUndefined`.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/geometry/engine.test.ts`, near the existing `"scales complete objects with a numeric homothety"` test:

```ts
  it("scales a complete object with a point-ratio homothety", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "point-ratio-homothety-objects",
      title: "Point-ratio homothety objects",
      objects: [
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 1 } },
        { id: "D", label: "D", kind: "point", visible: true, definition: { type: "free", x: 2, y: -1 } },
        { id: "V", label: "V", kind: "point", visible: true, definition: { type: "free", x: 3, y: 0 } },
        { id: "S", label: "S", kind: "segment", visible: true, definition: { type: "between_points", pointA: "A", pointB: "D" } },
        { id: "HP", label: "HP", kind: "segment", visible: true, definition: { type: "homothety_point", center: "B", object: "S", ratioPoint: "V" } },
      ],
    };

    expect(new GeometryGraph(document).values.get("HP")).toEqual({
      type: "segment", start: { x: 2, y: 2 }, end: { x: 4, y: -2 },
    });
  });

  it("marks a point-ratio homothety zero_ratio for a non-point with a coincident ratio point", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "zero-point-ratio-homothety",
      title: "Zero point-ratio homothety",
      objects: [
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 1 } },
        { id: "D", label: "D", kind: "point", visible: true, definition: { type: "free", x: 2, y: -1 } },
        { id: "S", label: "S", kind: "segment", visible: true, definition: { type: "between_points", pointA: "A", pointB: "D" } },
        { id: "HP", label: "HP", kind: "segment", visible: true, definition: { type: "homothety_point", center: "B", object: "S", ratioPoint: "B" } },
      ],
    };

    const value = new GeometryGraph(document).values.get("HP");
    expect(value?.type).toBe("undefined");
    expect((value as { code: string }).code).toBe("zero_ratio");
  });

  it("rejects a point-ratio homothety kind mismatch", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "mismatch-point-ratio-homothety",
      title: "Mismatch point-ratio homothety",
      objects: [
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 0 } },
        { id: "D", label: "D", kind: "point", visible: true, definition: { type: "free", x: 2, y: 1 } },
        { id: "V", label: "V", kind: "point", visible: true, definition: { type: "free", x: 3, y: 0 } },
        { id: "S", label: "S", kind: "segment", visible: true, definition: { type: "between_points", pointA: "A", pointB: "D" } },
        { id: "HP", label: "HP", kind: "point", visible: true, definition: { type: "homothety_point", center: "B", object: "S", ratioPoint: "V" } },
      ],
    };

    expect(() => new GeometryGraph(document)).toThrow("must keep the scaled kind");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- engine.test.ts -t "point-ratio homothety"`
Expected: FAIL — `TS2322`-style type errors or, once those are worked around, runtime failures: today `HomothetyPoint.kind` is fixed to `"point"` and `validate()`/`evaluate()` for `homothety_point` only ever read `def.point`/require `"point"` kind.

- [ ] **Step 3: Update the type (`types/geometry.ts`)**

Replace `frontend/src/types/geometry.ts:139-142`:

```ts
interface HomothetyPointForKind<K extends ReflectableKind> extends GeometryObjectBase {
  kind: K;
  /** `point` is retained only to read documents saved before point-ratio homotheties supported all transformable objects. */
  definition:
    | { type: "homothety_point"; center: GeometryObjectId; object: GeometryObjectId; point?: GeometryObjectId; ratioPoint: GeometryObjectId }
    | { type: "homothety_point"; center: GeometryObjectId; point: GeometryObjectId; object?: GeometryObjectId; ratioPoint: GeometryObjectId };
}

export type HomothetyPoint = {
  [K in ReflectableKind]: HomothetyPointForKind<K>;
}[ReflectableKind];
```

(No change needed to the `GeometryObject` union — `HomothetyPoint` is already referenced bare, the same way `HomothetyScalar` is.)

- [ ] **Step 4: Update `getParentIds` (`engine.ts`)**

Replace `frontend/src/geometry/engine.ts:69-70`:

```ts
    case "homothety_point":
      return [object.definition.center, object.definition.object ?? object.definition.point!, object.definition.ratioPoint];
```

- [ ] **Step 5: Update `validate` (`engine.ts`)**

Replace `frontend/src/geometry/engine.ts:337-341`:

```ts
      case "homothety_point":
        {
          const sourceId = def.object ?? def.point!;
          requireKind(def.center, "point");
          const parent = this.objectsById.get(sourceId);
          const actual = parent?.kind;
          if (actual === undefined || !["point", "line", "segment", "circle", "polygon"].includes(actual)) {
            throw new GeometryValidationError(
              `Object '${object.id}' requires parent '${sourceId}' to be scalable`,
            );
          }
          if (object.kind !== actual) {
            throw new GeometryValidationError(`Object '${object.id}' must keep the scaled kind '${actual}'`);
          }
          requireKind(def.ratioPoint, "point");
        }
        return;
```

- [ ] **Step 6: Add the reference-point helper and update `evaluate` (`engine.ts`)**

Insert immediately after the `scaleValue` function (right after its closing `}` at `frontend/src/geometry/engine.ts:1112`):

```ts
export function referencePointForRatio(value: EvaluatedValue, center: PointValue): PointValue {
  switch (value.type) {
    case "point":
      return value;
    case "line": {
      const d = value.a * center.x + value.b * center.y + value.c;
      return { type: "point", x: cleanZero(center.x - value.a * d), y: cleanZero(center.y - value.b * d) };
    }
    case "segment":
      return {
        type: "point",
        x: cleanZero((value.start.x + value.end.x) / 2),
        y: cleanZero((value.start.y + value.end.y) / 2),
      };
    case "circle":
      return { type: "point", x: value.center.x, y: value.center.y };
    case "polygon": {
      const count = value.vertices.length;
      return {
        type: "point",
        x: cleanZero(value.vertices.reduce((sum, vertex) => sum + vertex.x, 0) / count),
        y: cleanZero(value.vertices.reduce((sum, vertex) => sum + vertex.y, 0) / count),
      };
    }
    default:
      throw new GeometryValidationError(`Homothety is unsupported for evaluated type '${value.type}'`);
  }
}
```

Replace the evaluator block at `frontend/src/geometry/engine.ts:650-668`:

```ts
      case "homothety_point": {
        const ctr = this.requireValue<PointValue>(object.id, def.center, "point");
        if (isUndefined(ctr)) return ctr;
        const source = this.requireValue<EvaluatedValue>(
          object.id,
          def.object ?? def.point!,
          object.kind as EvaluatedValue["type"],
        );
        if (isUndefined(source)) return source;
        const rp = this.requireValue<PointValue>(object.id, def.ratioPoint, "point");
        if (isUndefined(rp)) return rp;
        const ref = referencePointForRatio(source, ctr);
        const dop = Math.hypot(ref.x - ctr.x, ref.y - ctr.y);
        if (dop <= GEOMETRY_EPSILON) {
          return { type: "undefined", code: "coincident_points", message: "Center and reference point coincide" };
        }
        const k = Math.hypot(rp.x - ctr.x, rp.y - ctr.y) / dop;
        if (k === 0 && source.type !== "point") {
          return { type: "undefined", code: "zero_ratio", message: "A zero homothety ratio is only supported for points" };
        }
        return scaleValue(source, ctr, k);
      }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npm run test -- engine.test.ts -t "point-ratio homothety"`
Expected: PASS (3 tests)

- [ ] **Step 8: Run the conformance suite and typecheck**

Run: `cd frontend && npm run test -- conformance.test.ts && npm run typecheck`
Expected: PASS — the `HP` object added to `shared/fixtures/transformations.json` in Task 2 now evaluates identically in both runtimes.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/types/geometry.ts frontend/src/geometry/engine.ts frontend/src/geometry/engine.test.ts
git commit -m "feat: generalize point-ratio homothety to non-point objects (frontend engine)"
```

---

### Task 4: Frontend — construction tool UI (click sequence, exclusion sets)

**Files:**
- Modify: `frontend/src/geometry/constructionTools.ts:104` (`TOOL_INSTRUCTIONS.homothety`), `:129` (`MULTI_STEP_REQUIREMENTS.homothety`), `:64-67` (`SourceLineObject`/`SourceCircleObject`/`SourceSegmentObject`/`SourcePolygonObject`), `:545-548` (case `"homothety"`), `:1116-1130` (`isSourceLineObject`/`isSourceCircleObject`/`isSourceSegmentObject`/`isSourcePolygonObject`)
- Test: `frontend/src/geometry/constructionTools.test.ts`

**Interfaces:**
- Consumes: `HomothetyPoint` type and `isReflectableObject` (both already used by the neighboring `"homothety_scalar"` case).
- Produces: `ConstructionToolController` continues to expose the same `"homothety"` tool name and 3-click interaction; only the second click's accepted kinds change.

Note on scope: `frontend/src/geometry/tools/inversion.ts` and `frontend/src/geometry/tools/transformations.ts` contain near-identical, but **unimported, dead** duplicates of this logic (confirmed via `grep -rn "tools/inversion\|tools/transformations" frontend/src` — no importers). They are not touched by this task.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/geometry/constructionTools.test.ts`, near the existing `"creates a numeric homothety of a complete transformable object"` test:

```ts
  it("creates a point-ratio homothety of a complete transformable object", () => {
    const controller = new ConstructionToolController();
    controller.activate("homothety");

    controller.handleObjectClick("A", baseDocument);
    controller.handleObjectClick("AB", baseDocument);
    const result = controller.handleObjectClick("C", baseDocument);

    expect(result.createdObjects).toEqual([
      expect.objectContaining({
        kind: "line",
        definition: { type: "homothety_point", center: "A", object: "AB", ratioPoint: "C" },
      }),
    ]);
    expectValidAdditions(baseDocument, result.createdObjects!);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- constructionTools.test.ts -t "point-ratio homothety of a complete"`
Expected: FAIL — step 2 of the click sequence requires `"point"` today, so clicking the line `"AB"` is rejected before a third object is ever created (`result.createdObjects` stays `undefined` after the second click).

- [ ] **Step 3: Update the tool instructions and step requirements**

Replace `frontend/src/geometry/constructionTools.ts:104`:

```ts
  homothety: "Click center, then the object to transform, then a point defining the ratio.",
```

Replace `frontend/src/geometry/constructionTools.ts:129`:

```ts
  homothety: ["point", "invertible", "point"],
```

- [ ] **Step 4: Update the source-object exclusion sets**

Replace `frontend/src/geometry/constructionTools.ts:64-67`:

```ts
type SourceLineObject = Exclude<LineObject, ReflectionObject | RotatedObject | TranslatedObject | HomothetyScalar | HomothetyPoint>;
type SourceCircleObject = Exclude<CircleObject, ReflectionObject | RotatedObject | TranslatedObject | HomothetyScalar | HomothetyPoint>;
type SourceSegmentObject = Exclude<SegmentObject, ReflectionObject | RotatedObject | TranslatedObject | HomothetyScalar | HomothetyPoint>;
type SourcePolygonObject = Exclude<PolygonObject, ReflectionObject | RotatedObject | TranslatedObject | HomothetyScalar | HomothetyPoint>;
```

Replace `frontend/src/geometry/constructionTools.ts:1116-1130`:

```ts
function isSourceLineObject(object: GeometryObject): object is SourceLineObject {
  return object.kind === "line" && object.definition.type !== "reflection_over_line" && object.definition.type !== "reflection_over_point" && object.definition.type !== "rotation" && object.definition.type !== "translation" && object.definition.type !== "homothety_scalar" && object.definition.type !== "homothety_point";
}

function isSourceCircleObject(object: GeometryObject): object is SourceCircleObject {
  return object.kind === "circle" && object.definition.type !== "reflection_over_line" && object.definition.type !== "reflection_over_point" && object.definition.type !== "rotation" && object.definition.type !== "translation" && object.definition.type !== "homothety_scalar" && object.definition.type !== "homothety_point";
}

function isSourceSegmentObject(object: GeometryObject): object is SourceSegmentObject {
  return object.kind === "segment" && object.definition.type !== "reflection_over_line" && object.definition.type !== "reflection_over_point" && object.definition.type !== "rotation" && object.definition.type !== "translation" && object.definition.type !== "homothety_scalar" && object.definition.type !== "homothety_point";
}

function isSourcePolygonObject(object: GeometryObject): object is SourcePolygonObject {
  return object.kind === "polygon" && object.definition.type !== "reflection_over_line" && object.definition.type !== "reflection_over_point" && object.definition.type !== "rotation" && object.definition.type !== "translation" && object.definition.type !== "homothety_scalar" && object.definition.type !== "homothety_point";
}
```

(This keeps `Inversion` refusing to operate on a homothety-point-derived line/circle/segment/polygon, exactly as it already refuses on a homothety-scalar-derived one — without it, a point-ratio-homothety line could reach `createLineInversion` and silently bypass the "not supported by the construction tool" restriction the other transformations already enforce.)

- [ ] **Step 5: Update the `"homothety"` construction case**

Replace `frontend/src/geometry/constructionTools.ts:545-548`:

```ts
    case "homothety": {
      const id = nextObjectId(document, "ht");
      const source = requireObject(document, second);
      if (!isReflectableObject(source)) {
        throw new Error("Homothety requires a point, line, segment, circle, or polygon");
      }
      const obj = {
        id,
        label: id,
        kind: source.kind,
        visible: true,
        definition: { type: "homothety_point", center: first, object: second, ratioPoint: third },
      } as HomothetyPoint;
      return [obj];
    }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm run test -- constructionTools.test.ts -t "point-ratio homothety of a complete"`
Expected: PASS

- [ ] **Step 7: Run the full frontend suite and typecheck**

Run: `cd frontend && npm run test && npm run typecheck`
Expected: PASS (including the pre-existing `"edits a graphical homothety into a numeric one and supports undo"` test, unaffected since it exercises the `kind: "point"` path)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/geometry/constructionTools.ts frontend/src/geometry/constructionTools.test.ts
git commit -m "feat: allow the homothety construction tool to target any transformable object"
```

---

### Task 5: Frontend — object list ratio display/edit and undo-history field

**Files:**
- Modify: `frontend/src/geometry/useGeometryState.ts:289-312` (`updateHomothetyRatio`)
- Modify: `frontend/src/components/panel/ObjectList.tsx:5` (import), `:395-405` (`homothetyRatio`)
- Test: `frontend/src/geometry/constructionTools.test.ts` (existing `useGeometryState` describe block), `frontend/src/components/panel/ObjectList.test.tsx`

**Interfaces:**
- Consumes: `referencePointForRatio` exported from `frontend/src/geometry/engine.ts` in Task 3.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/components/panel/ObjectList.test.tsx`, near the existing `"shows and commits the ratio of a homothety"` test:

```ts
  it("shows the ratio of a point-ratio homothety over a non-point object", () => {
    const document = {
      ...exampleGeometryDocument,
      objects: [
        ...exampleGeometryDocument.objects,
        { id: "V", label: "V", kind: "point" as const, visible: true, definition: { type: "free" as const, x: 1, y: 11 } },
        {
          id: "H",
          label: "H",
          kind: "segment" as const,
          visible: true,
          definition: { type: "homothety_point" as const, center: "C", object: "base", ratioPoint: "V" },
        },
      ],
    };
    const graph = new GeometryGraph(document);

    render(
      <ObjectList
        document={graph.document}
        values={graph.values}
        selectedObjectId={null}
        onSelectObject={() => undefined}
        onToggleVisibility={() => undefined}
        onUpdateHomothetyRatio={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Ratio for H")).toHaveValue(2);
  });
```

(`base` is the segment `Segment(A, B)` already in `exampleGeometryDocument`, with `A = (-2, -1)`, `B = (4, -1)`; its midpoint is `(1, -1)`. Center `C = (1, 3)`, so the reference distance is `hypot(0, -4) = 4`. `V = (1, 11)` is `hypot(0, 8) = 8` from `C`, giving `k = 8 / 4 = 2`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- ObjectList.test.tsx -t "point-ratio homothety over a non-point"`
Expected: FAIL — `homothetyRatio()` today reads `values.get(object.definition.point)` and asserts it is a `PointValue`; for a `segment` source this either reads `undefined` (once `object.definition.point` no longer exists on the new field shape) or, before Task 3/4 land, mismatches types, so the ratio input renders empty instead of `2`.

- [ ] **Step 3: Update `homothetyRatio` (`ObjectList.tsx`)**

Replace the import at `frontend/src/components/panel/ObjectList.tsx:5`:

```ts
import { getParentIds, referencePointForRatio } from "../../geometry/engine";
```

Replace `frontend/src/components/panel/ObjectList.tsx:395-405`:

```ts
function homothetyRatio(object: GeometryObject, values: EvaluationMap): number | null {
  if (object.definition.type === "homothety_scalar") return object.definition.ratio;
  if (object.definition.type !== "homothety_point") return null;
  const center = values.get(object.definition.center);
  const sourceId = object.definition.object ?? object.definition.point;
  const source = sourceId === undefined ? undefined : values.get(sourceId);
  const ratioPoint = values.get(object.definition.ratioPoint);
  if (center?.type !== "point" || source === undefined || source.type === "undefined" || ratioPoint?.type !== "point") return null;
  const reference = referencePointForRatio(source, center);
  const sourceDistance = Math.hypot(reference.x - center.x, reference.y - center.y);
  if (sourceDistance === 0) return null;
  return Math.hypot(ratioPoint.x - center.x, ratioPoint.y - center.y) / sourceDistance;
}
```

- [ ] **Step 4: Simplify `updateHomothetyRatio` (`useGeometryState.ts`)**

Replace `frontend/src/geometry/useGeometryState.ts:289-312`:

```ts
  const updateHomothetyRatio = useCallback((objectId: GeometryObjectId, ratio: number) => {
    if (!Number.isFinite(ratio)) return;
    const currentDocument = graphRef.current!.document;
    const target = currentDocument.objects.find((object) => object.id === objectId);
    if (target === undefined || (target.definition.type !== "homothety_scalar" && target.definition.type !== "homothety_point")) return;
    if (target.definition.type === "homothety_scalar" && target.definition.ratio === ratio) return;
    const centerId = target.definition.center;
    const sourceId = target.definition.object ?? target.definition.point;
    if (sourceId === undefined || (ratio === 0 && target.kind !== "point")) return;
    recordDocumentChange();
    const nextDocument: GeometryDocument = {
      ...currentDocument,
      objects: currentDocument.objects.map((object) => {
        if (object.id !== objectId) return object;
        return {
          ...object,
          definition: { type: "homothety_scalar", center: centerId, object: sourceId, ratio },
        } as GeometryObject;
      }),
    };
    applyDocument(nextDocument);
  }, [applyDocument, recordDocumentChange]);
```

(This collapses the previous `target.definition.type === "homothety_scalar" ? ... : target.definition.point` ternary into a single `object ?? point` lookup, since both definition shapes now expose the same two fields — a direct consequence of Task 3's type change, not a new behavior.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm run test -- ObjectList.test.tsx -t "point-ratio homothety over a non-point"`
Expected: PASS

- [ ] **Step 6: Run the full frontend suite, typecheck, and build**

Run: `cd frontend && npm run test && npm run typecheck && npm run build`
Expected: PASS — including the pre-existing `"edits a graphical homothety into a numeric one and supports undo"` test in `constructionTools.test.ts`, which still uses the legacy `point` field literal and must keep working unchanged.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/geometry/useGeometryState.ts frontend/src/components/panel/ObjectList.tsx frontend/src/components/panel/ObjectList.test.tsx
git commit -m "feat: display and edit point-ratio homothety ratios for non-point objects"
```

---

## Self-Review

**Spec coverage:**
- Ratio semantics per kind (§1 of the spec) → Task 1 Step 7 (`_reference_point_for_ratio`) and Task 3 Step 6 (`referencePointForRatio`). ✓
- Schema field rename with legacy alias (§2) → Task 1 Step 3 (`models.py`) and Task 3 Step 3 (`types/geometry.ts`). ✓
- Parser (§3) → Task 1 Step 4. ✓
- Validator (§4) → Task 1 Step 6 and Task 3 Step 5. ✓
- Evaluator (§5) → Task 1 Step 7 and Task 3 Step 6. ✓
- UI (§6) → Task 4. ✓
- Conformance fixture (§6 of the spec, "no fixture exists") → **corrected during planning**: `shared/fixtures/transformations.json` already exists and already covers `homothety_scalar`; Task 2 extends it with a `homothety_point` case instead of creating a new file, which is more consistent with the existing one-fixture-per-topic convention and is what `frontend/src/geometry/conformance.test.ts` already iterates over.
- Out-of-scope items (agent/MCP `create_homothety` tool) → intentionally not covered by any task, per the spec.
- Two additional necessary changes not called out in the spec, discovered while reading the code: `get_parent_ids`/`getParentIds` (both runtimes) and the `constructionTools.ts` `isSource*Object`/`Source*Object` exclusion sets, plus `useGeometryState.ts`/`ObjectList.tsx` (the ratio-display duplication the user's own in-progress `ObjectList.tsx` diff sits next to). These are direct, mechanical consequences of the field rename and kind generalization already approved in the spec, not new design decisions — covered by Tasks 1, 3, 4, and 5 respectively.

**Placeholder scan:** no TBD/TODO markers; every step has complete, exact code.

**Type consistency:** `object_id`/`object` (Python/TS field), `ratio_point`/`ratioPoint`, `_reference_point_for_ratio`/`referencePointForRatio`, `zero_ratio`/`coincident_points` codes, and `HomothetyPointDefinition`/`HomothetyPoint` kind literals are used identically across all five tasks.
