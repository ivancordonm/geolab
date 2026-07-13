import type { GeometryDocument, GeometryObject, Point } from "../types/geometry";
import type { Coordinate } from "./viewport";
import { createSegment, createLine, createParallel, createPerpendicular, createPerpendicularBisector, createAngleBisector } from "./tools/lines";
import { createCircle, createCircumcircle } from "./tools/circles";
import { createMidpoint } from "./tools/points";
import { createIntersection } from "./tools/intersections";
import { createPolygon, createRegularPolygon, createVectorPolygon } from "./tools/polygons";
import {
  createReflectionOverLine,
  createReflectionOverPoint,
  createHomothety,
  createTranslation,
  createRotation,
} from "./tools/transformations";
import { createInversionConstruction } from "./tools/inversion";
import { nextPointLabel } from "./tools/shared";

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
  | "rotation"
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
  /** Angle in degrees for rotation tool. */
  rotationAngle: number;
}

export interface ConstructionToolResult {
  state: ConstructionToolState;
  createdObjects?: readonly GeometryObject[];
  removedObjectIds?: readonly string[];
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
  reflect_line: "Select the object to reflect, then select the mirror line.",
  reflect_point: "Select the object to reflect, then select the center of symmetry.",
  homothety: "Click center, then source point, then a point defining the ratio.",
  inversion: "Select the object to invert, then select the inversion circle.",
  translation: "Select the object to translate, then the start of the translation vector, then the end.",
  rotation: "Click the object to rotate, then select the center of rotation.",
  polygon: "Click 3+ points to define a polygon. Click the first point again or press Enter to close.",
  regular_polygon: "Click two adjacent vertices, then set the number of sides in the toolbar.",
  vector_polygon: "Click an anchor point and then additional vertices; drag the anchor to translate the whole polygon.",
};

type RequiredKind = "point" | "line" | "circle" | "line_or_circle" | "invertible";

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
  reflect_line: ["invertible", "line"],
  reflect_point: ["invertible", "point"],
  homothety: ["point", "point", "point"],
  inversion: ["invertible", "circle"],
  translation: ["invertible", "point", "point"],
  rotation: ["invertible", "point"],
};

function kindMatches(kind: GeometryObject["kind"], required: RequiredKind): boolean {
  if (required === "invertible") {
    return kind === "point" || kind === "line" || kind === "circle" || kind === "segment" || kind === "polygon";
  }
  if (required === "line_or_circle") return kind === "line" || kind === "circle";
  return kind === required;
}

function formatKind(required: RequiredKind): string {
  if (required === "line_or_circle") return "line or circle";
  if (required === "invertible") return "point, line, circle, segment, or polygon";
  return required;
}

export class ConstructionToolController {
  private vectorPolygonCreatedPointIds = new Set<string>();

  private stateValue: ConstructionToolState = {
    activeTool: "select",
    selectedObjectIds: [],
    pointerWorld: null,
    error: null,
    regularPolygonSides: 5,
    rotationAngle: 45,
  };

  get state(): ConstructionToolState {
    return cloneState(this.stateValue);
  }

  activate(tool: ConstructionTool): ConstructionToolState {
    this.vectorPolygonCreatedPointIds.clear();
    this.stateValue = {
      activeTool: tool,
      selectedObjectIds: [],
      pointerWorld: null,
      error: null,
      regularPolygonSides: this.stateValue.regularPolygonSides,
      rotationAngle: this.stateValue.rotationAngle,
    };
    return this.state;
  }

  cancel(): ConstructionToolState {
    this.vectorPolygonCreatedPointIds.clear();
    this.stateValue = { ...this.stateValue, selectedObjectIds: [], pointerWorld: null, error: null };
    return this.state;
  }

  setRegularPolygonSides(sides: number): ConstructionToolState {
    if (sides < 3) return this.state;
    this.stateValue = { ...this.stateValue, regularPolygonSides: sides };
    return this.state;
  }

  setRotationAngle(angle: number): ConstructionToolState {
    this.stateValue = { ...this.stateValue, rotationAngle: angle };
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
    const removedObjectIds = this.vectorPolygonAuxiliaryPointIds(tool, selected);
    this.vectorPolygonCreatedPointIds.clear();
    this.stateValue = { ...this.stateValue, selectedObjectIds: [], pointerWorld: null, error: null };
    return {
      state: this.state,
      createdObjects: constructions,
      removedObjectIds,
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
      if (activeTool === "vector_polygon") {
        this.vectorPolygonCreatedPointIds.add(newPoint.id);
      }
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
    const constructions = createConstruction(
      this.stateValue.activeTool,
      selected,
      candidateDoc,
      this.stateValue.regularPolygonSides,
      this.stateValue.rotationAngle,
    );
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
        const removedObjectIds = this.vectorPolygonAuxiliaryPointIds(activeTool2, accumulated);
        this.vectorPolygonCreatedPointIds.clear();
        this.stateValue = { ...this.stateValue, selectedObjectIds: [], pointerWorld: null, error: null };
        return {
          state: this.state,
          createdObjects: constructions,
          removedObjectIds,
          selectedObjectId: constructions[constructions.length - 1]?.id,
        };
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

    const constructions = createConstruction(
      this.stateValue.activeTool,
      selected,
      document,
      this.stateValue.regularPolygonSides,
      this.stateValue.rotationAngle,
    );
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

  private vectorPolygonAuxiliaryPointIds(
    tool: ConstructionTool,
    selected: readonly string[],
  ): readonly string[] {
    if (tool !== "vector_polygon") return [];
    return selected
      .slice(1)
      .filter((objectId) => this.vectorPolygonCreatedPointIds.has(objectId));
  }
}

/**
 * Slim dispatcher for the interactive construction tools. Each case
 * delegates to the corresponding family function under `./tools/*`; see
 * that directory for the actual construction logic (previously one ~800
 * line switch here).
 */
function createConstruction(
  tool: ConstructionTool,
  selected: readonly string[],
  document: GeometryDocument,
  regularPolygonSides = 5,
  rotationAngle = 90,
): readonly GeometryObject[] {
  const [first, second, third] = selected;

  switch (tool) {
    case "segment":
      return createSegment(first, second, document);
    case "line":
      return createLine(first, second, document);
    case "circle":
      return createCircle(first, second, document);
    case "midpoint":
      return createMidpoint(first, second, document);
    case "parallel":
      return createParallel(first, second, document);
    case "perpendicular":
      return createPerpendicular(first, second, document);

    case "intersection":
      return createIntersection(first, second, document);

    case "perp_bisector":
      return createPerpendicularBisector(first, second, document);
    case "angle_bisector":
      return createAngleBisector(first, second, third, document);
    case "circumcircle":
      return createCircumcircle(first, second, third, document);

    case "reflect_line":
      return createReflectionOverLine(first, second, document);
    case "reflect_point":
      return createReflectionOverPoint(first, second, document);

    case "homothety":
      return createHomothety(first, second, third, document);
    case "inversion":
      return createInversionConstruction(document, first, second);
    case "translation":
      return createTranslation(first, second, third, document);
    case "rotation":
      return createRotation(first, second, document, rotationAngle);

    case "polygon":
      return createPolygon(selected, document);
    case "regular_polygon":
      return createRegularPolygon(first, second, document, regularPolygonSides);
    case "vector_polygon":
      return createVectorPolygon(selected, document);

    default:
      throw new Error(`Tool '${tool}' does not create a multi-step construction`);
  }
}

function cloneState(state: ConstructionToolState): ConstructionToolState {
  return {
    ...state,
    selectedObjectIds: [...state.selectedObjectIds],
    pointerWorld: state.pointerWorld === null ? null : { ...state.pointerWorld },
    regularPolygonSides: state.regularPolygonSides,
  };
}
