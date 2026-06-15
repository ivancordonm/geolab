import type {
  AngleBisectorLine,
  Circle,
  CircumscribedCircle,
  GeometryDocument,
  GeometryObject,
  HomothetyPoint,
  IntersectionCC,
  IntersectionLC,
  IntersectionLL,
  InversionInCircle,
  Line,
  Midpoint,
  ParallelLine,
  PerpendicularBisectorLine,
  PerpendicularLine,
  Point,
  Polygon,
  ReflectionOverLine,
  ReflectionOverPoint,
  RotatedPoint,
  Segment,
  TranslatedPoint,
} from "../types/geometry";
import type { Coordinate } from "./viewport";

export type ConstructionTool =
  | "select"
  | "point"
  | "segment"
  | "line"
  | "circle"
  | "midpoint"
  | "parallel"
  | "perpendicular"
  | "intersection"
  | "perp_bisector"
  | "angle_bisector"
  | "circumcircle"
  | "reflect_line"
  | "reflect_point"
  | "homothety"
  | "inversion"
  | "translation"
  | "rotation90"
  | "polygon"
  | "regular_polygon"
  | "vector_polygon";

export interface ConstructionToolState {
  activeTool: ConstructionTool;
  selectedObjectIds: readonly string[];
  pointerWorld: Coordinate | null;
  error: string | null;
  /** Number of sides for the regular_polygon tool. */
  regularPolygonSides: number;
}

export interface ConstructionToolResult {
  state: ConstructionToolState;
  createdObjects?: readonly GeometryObject[];
  selectedObjectId?: string;
}

export const TOOL_INSTRUCTIONS: Record<ConstructionTool, string> = {
  select: "Select objects. Drag circular free points to move them.",
  point: "Click anywhere on the coordinate plane to create a free point.",
  segment: "Click two points or empty spots to define a segment.",
  line: "Click two distinct points or empty spots to create an infinite line.",
  circle: "Click the center point or an empty spot, then a point on the circle.",
  midpoint: "Click two points or empty spots to construct their midpoint.",
  parallel: "Select a point or click an empty spot, then select an existing line.",
  perpendicular: "Select a point or click an empty spot, then select an existing line.",
  intersection: "Click two lines or circles to compute their intersection.",
  perp_bisector: "Click two points to draw their perpendicular bisector.",
  angle_bisector: "Click the first arm point, then the vertex, then the second arm point.",
  circumcircle: "Click three points to draw the circumscribed circle.",
  reflect_line: "Select the point to reflect, then select the mirror line.",
  reflect_point: "Select the point to reflect, then select the center of symmetry.",
  homothety: "Click center, then source point, then a point defining the ratio.",
  inversion: "Select the point to invert, then select the inversion circle.",
  translation: "Click the point to translate, then the start of the translation vector, then the end.",
  rotation90: "Click the point to rotate, then the rotation center (90° counter-clockwise).",
  polygon: "Click 3+ points to define a polygon. Click the first point again or press Enter to close.",
  regular_polygon: "Click two adjacent vertices, then set the number of sides in the toolbar.",
  vector_polygon: "Click an anchor point and then additional vertices; drag the anchor to translate the whole polygon.",
};

type RequiredKind = "point" | "line" | "circle" | "line_or_circle";

const MULTI_STEP_REQUIREMENTS: Partial<Record<ConstructionTool, readonly RequiredKind[]>> = {
  segment: ["point", "point"],
  line: ["point", "point"],
  circle: ["point", "point"],
  midpoint: ["point", "point"],
  parallel: ["point", "line"],
  perpendicular: ["point", "line"],
  intersection: ["line_or_circle", "line_or_circle"],
  perp_bisector: ["point", "point"],
  angle_bisector: ["point", "point", "point"],
  circumcircle: ["point", "point", "point"],
  reflect_line: ["point", "line"],
  reflect_point: ["point", "point"],
  homothety: ["point", "point", "point"],
  inversion: ["point", "circle"],
  translation: ["point", "point", "point"],
  rotation90: ["point", "point"],
};

function kindMatches(kind: GeometryObject["kind"], required: RequiredKind): boolean {
  if (required === "line_or_circle") return kind === "line" || kind === "circle";
  return kind === required;
}

function formatKind(required: RequiredKind): string {
  return required === "line_or_circle" ? "line or circle" : required;
}

export class ConstructionToolController {
  private stateValue: ConstructionToolState = {
    activeTool: "select",
    selectedObjectIds: [],
    pointerWorld: null,
    error: null,
    regularPolygonSides: 5,
  };

  get state(): ConstructionToolState {
    return cloneState(this.stateValue);
  }

  activate(tool: ConstructionTool): ConstructionToolState {
    this.stateValue = {
      activeTool: tool,
      selectedObjectIds: [],
      pointerWorld: null,
      error: null,
      regularPolygonSides: this.stateValue.regularPolygonSides,
    };
    return this.state;
  }

  cancel(): ConstructionToolState {
    this.stateValue = { ...this.stateValue, selectedObjectIds: [], pointerWorld: null, error: null };
    return this.state;
  }

  setRegularPolygonSides(sides: number): ConstructionToolState {
    if (sides < 3) return this.state;
    this.stateValue = { ...this.stateValue, regularPolygonSides: sides };
    return this.state;
  }

  /**
   * Finish a variable-arity polygon construction (polygon / vector_polygon).
   * Requires ≥3 accumulated points. For regular_polygon this is automatic.
   */
  finish(document: GeometryDocument): ConstructionToolResult {
    const tool = this.stateValue.activeTool;
    if (tool !== "polygon" && tool !== "vector_polygon") {
      return { state: this.state };
    }
    const selected = [...this.stateValue.selectedObjectIds];
    if (selected.length < 3) {
      return this.fail("Select at least 3 points before closing the polygon.");
    }
    const constructions = createConstruction(tool, selected, document);
    this.stateValue = { ...this.stateValue, selectedObjectIds: [], pointerWorld: null, error: null };
    return {
      state: this.state,
      createdObjects: constructions,
      selectedObjectId: constructions[constructions.length - 1]?.id,
    };
  }

  updatePointer(world: Coordinate | null): ConstructionToolState {
    this.stateValue = { ...this.stateValue, pointerWorld: world, error: null };
    return this.state;
  }

  handleCanvasClick(world: Coordinate, document: GeometryDocument): ConstructionToolResult {
    if (this.stateValue.activeTool === "select") {
      return { state: this.state };
    }

    if (this.stateValue.activeTool === "point") {
      const label = nextPointLabel(document);
      const point: Point = {
        id: label,
        label,
        kind: "point",
        visible: true,
        definition: { type: "free", x: world.x, y: world.y },
      };
      this.stateValue = { ...this.stateValue, error: null };
      return { state: this.state, createdObjects: [point], selectedObjectId: point.id };
    }

    // ─── Variable-arity polygon tools ───────────────────────────────────────
    const activeTool = this.stateValue.activeTool;
    if (activeTool === "polygon" || activeTool === "vector_polygon") {
      const label = nextPointLabel(document);
      const newPoint: Point = { id: label, label, kind: "point", visible: true, definition: { type: "free", x: world.x, y: world.y } };
      const selected = [...this.stateValue.selectedObjectIds, newPoint.id];
      this.stateValue = { ...this.stateValue, selectedObjectIds: selected, error: null };
      return { state: this.state, createdObjects: [newPoint], selectedObjectId: newPoint.id };
    }

    if (activeTool === "regular_polygon") {
      const label = nextPointLabel(document);
      const newPoint: Point = { id: label, label, kind: "point", visible: true, definition: { type: "free", x: world.x, y: world.y } };
      const selected = [...this.stateValue.selectedObjectIds, newPoint.id];
      if (selected.length < 2) {
        this.stateValue = { ...this.stateValue, selectedObjectIds: selected, error: null };
        return { state: this.state, createdObjects: [newPoint], selectedObjectId: newPoint.id };
      }
      const candidateDoc: GeometryDocument = { ...document, objects: [...document.objects, newPoint] };
      const constructions = createConstruction(activeTool, selected, candidateDoc, this.stateValue.regularPolygonSides);
      this.stateValue = { ...this.stateValue, selectedObjectIds: [], pointerWorld: null, error: null };
      return { state: this.state, createdObjects: [newPoint, ...constructions], selectedObjectId: constructions[constructions.length - 1]?.id };
    }

    const requirements = MULTI_STEP_REQUIREMENTS[this.stateValue.activeTool];
    if (requirements === undefined) {
      return { state: this.state };
    }

    const step = this.stateValue.selectedObjectIds.length;
    const requiredKind = requirements[step];

    if (requiredKind !== "point") {
      return this.fail(`Select an existing ${formatKind(requiredKind)} for step ${step + 1}.`);
    }

    const label = nextPointLabel(document);
    const newPoint: Point = {
      id: label,
      label,
      kind: "point",
      visible: true,
      definition: { type: "free", x: world.x, y: world.y },
    };

    const selected = [...this.stateValue.selectedObjectIds, newPoint.id];

    if (selected.length < requirements.length) {
      this.stateValue = { ...this.stateValue, selectedObjectIds: selected, error: null };
      return { state: this.state, createdObjects: [newPoint], selectedObjectId: newPoint.id };
    }

    const candidateDoc: GeometryDocument = {
      ...document,
      objects: [...document.objects, newPoint],
    };
    const constructions = createConstruction(this.stateValue.activeTool, selected, candidateDoc);
    this.stateValue = { ...this.stateValue, selectedObjectIds: [], pointerWorld: null, error: null };
    return {
      state: this.state,
      createdObjects: [newPoint, ...constructions],
      selectedObjectId: constructions[constructions.length - 1]?.id,
    };
  }

  handleObjectClick(objectId: string, document: GeometryDocument): ConstructionToolResult {
    const object = document.objects.find((candidate) => candidate.id === objectId);
    if (object === undefined) {
      return this.fail(`Unknown geometry object '${objectId}'.`);
    }
    if (this.stateValue.activeTool === "select") {
      return { state: this.state, selectedObjectId: objectId };
    }
    if (this.stateValue.activeTool === "point") {
      return { state: this.state };
    }

    // ─── Variable-arity polygon tools ───────────────────────────────────────
    const activeTool2 = this.stateValue.activeTool;
    if (activeTool2 === "polygon" || activeTool2 === "vector_polygon") {
      if (object.kind !== "point") {
        return this.fail("Select a point to add as a polygon vertex.");
      }
      const accumulated = this.stateValue.selectedObjectIds;
      // Close polygon if the user clicks the first vertex again (and ≥3 points).
      if (accumulated.length >= 3 && accumulated[0] === objectId) {
        const constructions = createConstruction(activeTool2, [...accumulated], document);
        this.stateValue = { ...this.stateValue, selectedObjectIds: [], pointerWorld: null, error: null };
        return { state: this.state, createdObjects: constructions, selectedObjectId: constructions[constructions.length - 1]?.id };
      }
      if (accumulated.includes(objectId)) {
        return this.fail("Point already added. Click the first point to close the polygon.");
      }
      const selected2 = [...accumulated, objectId];
      this.stateValue = { ...this.stateValue, selectedObjectIds: selected2, error: null };
      return { state: this.state, selectedObjectId: objectId };
    }

    if (activeTool2 === "regular_polygon") {
      if (object.kind !== "point") {
        return this.fail("Select a point as a polygon vertex.");
      }
      const selected2 = [...this.stateValue.selectedObjectIds, objectId];
      if (selected2.length < 2) {
        this.stateValue = { ...this.stateValue, selectedObjectIds: selected2, error: null };
        return { state: this.state, selectedObjectId: objectId };
      }
      const constructions = createConstruction(activeTool2, selected2, document, this.stateValue.regularPolygonSides);
      this.stateValue = { ...this.stateValue, selectedObjectIds: [], pointerWorld: null, error: null };
      return { state: this.state, createdObjects: constructions, selectedObjectId: constructions[constructions.length - 1]?.id };
    }

    const requirements = MULTI_STEP_REQUIREMENTS[this.stateValue.activeTool];
    if (requirements === undefined) {
      return { state: this.state };
    }
    const step = this.stateValue.selectedObjectIds.length;
    const requiredKind = requirements[step];

    if (!kindMatches(object.kind, requiredKind)) {
      return this.fail(`Select a ${formatKind(requiredKind)} for step ${step + 1}.`);
    }
    if (requiredKind === "point" && this.stateValue.selectedObjectIds.includes(objectId)) {
      return this.fail("Select two distinct points.");
    }

    const selected = [...this.stateValue.selectedObjectIds, objectId];
    if (selected.length < requirements.length) {
      this.stateValue = { ...this.stateValue, selectedObjectIds: selected, error: null };
      return { state: this.state, selectedObjectId: objectId };
    }

    const constructions = createConstruction(this.stateValue.activeTool, selected, document);
    this.stateValue = { ...this.stateValue, selectedObjectIds: [], pointerWorld: null, error: null };
    return {
      state: this.state,
      createdObjects: constructions,
      selectedObjectId: constructions[constructions.length - 1]?.id,
    };
  }

  private fail(message: string): ConstructionToolResult {
    this.stateValue = { ...this.stateValue, error: message };
    return { state: this.state };
  }
}

function createConstruction(
  tool: ConstructionTool,
  selected: readonly string[],
  document: GeometryDocument,
  regularPolygonSides = 5,
): readonly GeometryObject[] {
  const [first, second, third] = selected;

  switch (tool) {
    case "segment": {
      const id = nextObjectId(document, "s");
      const obj: Segment = { id, label: id, kind: "segment", visible: true, definition: { type: "between_points", pointA: first, pointB: second } };
      return [obj];
    }
    case "line": {
      const id = nextObjectId(document, "l");
      const obj: Line = { id, label: id, kind: "line", visible: true, definition: { type: "through_points", pointA: first, pointB: second } };
      return [obj];
    }
    case "circle": {
      const id = nextObjectId(document, "c");
      const obj: Circle = { id, label: id, kind: "circle", visible: true, definition: { type: "center_through_point", center: first, point: second } };
      return [obj];
    }
    case "midpoint": {
      const id = nextObjectId(document, "M");
      const obj: Midpoint = { id, label: id, kind: "point", visible: true, definition: { type: "midpoint", pointA: first, pointB: second } };
      return [obj];
    }
    case "parallel": {
      const id = nextObjectId(document, "p");
      const obj: ParallelLine = { id, label: id, kind: "line", visible: true, definition: { type: "parallel_through", point: first, line: second } };
      return [obj];
    }
    case "perpendicular": {
      const id = nextObjectId(document, "h");
      const obj: PerpendicularLine = { id, label: id, kind: "line", visible: true, definition: { type: "perpendicular_through", point: first, line: second } };
      return [obj];
    }

    // ─── New: intersections ─────────────────────────────────────────────

    case "intersection": {
      const objA = document.objects.find((o) => o.id === first);
      const objB = document.objects.find((o) => o.id === second);
      if (objA === undefined || objB === undefined) {
        throw new Error("Intersection: parent objects not found in document");
      }
      if (objA.kind === "line" && objB.kind === "line") {
        const id = nextObjectId(document, "Q");
        const pt: IntersectionLL = { id, label: id, kind: "point", visible: true, definition: { type: "intersection_ll", lineA: first, lineB: second } };
        return [pt];
      }
      // Two-solution case (LC or CC): allocate two IDs
      const id1 = nextObjectId(document, "Q");
      const fakeDoc: GeometryDocument = { ...document, objects: [...document.objects, { id: id1, label: id1 } as unknown as GeometryObject] };
      const id2 = nextObjectId(fakeDoc, "Q");
      if (objA.kind !== "circle" || objB.kind !== "circle") {
        const [lineId, circleId] = objA.kind === "line" ? [first, second] : [second, first];
        const p1: IntersectionLC = { id: id1, label: id1, kind: "point", visible: true, definition: { type: "intersection_lc", line: lineId, circle: circleId, index: 1 } };
        const p2: IntersectionLC = { id: id2, label: id2, kind: "point", visible: true, definition: { type: "intersection_lc", line: lineId, circle: circleId, index: 2 } };
        return [p1, p2];
      }
      const p1: IntersectionCC = { id: id1, label: id1, kind: "point", visible: true, definition: { type: "intersection_cc", circleA: first, circleB: second, index: 1 } };
      const p2: IntersectionCC = { id: id2, label: id2, kind: "point", visible: true, definition: { type: "intersection_cc", circleA: first, circleB: second, index: 2 } };
      return [p1, p2];
    }

    // ─── New: bisectors / circumcircle ──────────────────────────────────

    case "perp_bisector": {
      const id = nextObjectId(document, "pb");
      const obj: PerpendicularBisectorLine = { id, label: id, kind: "line", visible: true, definition: { type: "perpendicular_bisector", pointA: first, pointB: second } };
      return [obj];
    }
    case "angle_bisector": {
      const id = nextObjectId(document, "ab");
      const obj: AngleBisectorLine = { id, label: id, kind: "line", visible: true, definition: { type: "angle_bisector", armA: first, vertex: second, armB: third } };
      return [obj];
    }
    case "circumcircle": {
      const id = nextObjectId(document, "cc");
      const obj: CircumscribedCircle = { id, label: id, kind: "circle", visible: true, definition: { type: "circumscribed", pointA: first, pointB: second, pointC: third } };
      return [obj];
    }

    // ─── New: reflections ───────────────────────────────────────────────

    case "reflect_line": {
      const id = nextObjectId(document, "rf");
      const obj: ReflectionOverLine = { id, label: id, kind: "point", visible: true, definition: { type: "reflection_over_line", point: first, line: second } };
      return [obj];
    }
    case "reflect_point": {
      const id = nextObjectId(document, "rp");
      const obj: ReflectionOverPoint = { id, label: id, kind: "point", visible: true, definition: { type: "reflection_over_point", point: first, center: second } };
      return [obj];
    }

    // ─── New: other transformations ─────────────────────────────────────

    case "homothety": {
      const id = nextObjectId(document, "ht");
      const obj: HomothetyPoint = { id, label: id, kind: "point", visible: true, definition: { type: "homothety_point", center: first, point: second, ratioPoint: third } };
      return [obj];
    }
    case "inversion": {
      const id = nextObjectId(document, "iv");
      const obj: InversionInCircle = { id, label: id, kind: "point", visible: true, definition: { type: "inversion_in_circle", point: first, circle: second } };
      return [obj];
    }
    case "translation": {
      const id = nextObjectId(document, "tr");
      const obj: TranslatedPoint = { id, label: id, kind: "point", visible: true, definition: { type: "translation", point: first, from: second, to: third } };
      return [obj];
    }
    case "rotation90": {
      const id = nextObjectId(document, "rot");
      const obj: RotatedPoint = { id, label: id, kind: "point", visible: true, definition: { type: "rotation", point: first, center: second, degrees: 90 } };
      return [obj];
    }

    // ─── Polygons ──────────────────────────────────────────────────────────
    case "polygon": {
      const id = nextObjectId(document, "poly");
      const obj: Polygon = {
        id,
        label: id,
        kind: "polygon",
        visible: true,
        definition: { type: "polygon", points: [...selected] },
      };
      return [obj];
    }
    case "regular_polygon": {
      const id = nextObjectId(document, "poly");
      const obj: Polygon = {
        id,
        label: id,
        kind: "polygon",
        visible: true,
        definition: { type: "regular_polygon", pointA: first, pointB: second, sides: regularPolygonSides },
      };
      return [obj];
    }
    case "vector_polygon": {
      // The first selected point is the anchor. We don't know its coords
      // (they live in the document values), so we store a basic polygon here;
      // the evaluation engine converts it to a PolygonValue with relative offsets
      // computed from the document. For the interactive tool we model it as a
      // basic polygon whose anchor is the first clicked point.
      const id = nextObjectId(document, "vpoly");
      // Compute offsets relative to the first (anchor) point using world coords.
      // This requires looking up the point definitions; for free points we can do it directly.
      const anchorObj = document.objects.find((o) => o.id === first);
      if (anchorObj?.kind === "point" && anchorObj.definition.type === "free") {
        const ax = anchorObj.definition.x;
        const ay = anchorObj.definition.y;
        const offsets = selected.slice(1).map((pid) => {
          const pObj = document.objects.find((o) => o.id === pid);
          if (pObj?.kind === "point" && pObj.definition.type === "free") {
            return { x: pObj.definition.x - ax, y: pObj.definition.y - ay };
          }
          return { x: 0, y: 0 };
        });
        const obj: Polygon = { id, label: id, kind: "polygon", visible: true, definition: { type: "vector_polygon", anchor: first, offsets } };
        return [obj];
      }
      // Fallback: basic polygon
      const obj: Polygon = { id, label: id, kind: "polygon", visible: true, definition: { type: "polygon", points: [...selected] } };
      return [obj];
    }

    default:
      throw new Error(`Tool '${tool}' does not create a multi-step construction`);
  }
}

function nextPointLabel(document: GeometryDocument): string {
  const occupied = new Set(document.objects.flatMap((object) => [object.id, object.label]));
  for (let code = 65; code <= 90; code += 1) {
    const label = String.fromCharCode(code);
    if (!occupied.has(label)) {
      return label;
    }
  }
  return nextObjectId(document, "P");
}

function nextObjectId(document: GeometryDocument, prefix: string): string {
  const occupied = new Set(document.objects.flatMap((object) => [object.id, object.label]));
  let index = 1;
  while (occupied.has(`${prefix}${index}`)) {
    index += 1;
  }
  return `${prefix}${index}`;
}

function cloneState(state: ConstructionToolState): ConstructionToolState {
  return {
    ...state,
    selectedObjectIds: [...state.selectedObjectIds],
    pointerWorld: state.pointerWorld === null ? null : { ...state.pointerWorld },
    regularPolygonSides: state.regularPolygonSides,
  };
}
