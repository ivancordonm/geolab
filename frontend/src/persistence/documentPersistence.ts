import { GeometryGraph, getParentIds } from "../geometry/engine";
import type { GeometryDocument, GeometryObject } from "../types/geometry";

export const GEOMETRY_STORAGE_KEY = "mathllm.geometry-document.v1";

export interface DocumentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class DocumentPersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DocumentPersistenceError";
  }
}

export function saveDocument(
  document: GeometryDocument,
  storage: DocumentStorage = window.localStorage,
): void {
  storage.setItem(GEOMETRY_STORAGE_KEY, exportDocumentJson(document));
}

export function loadDocument(
  storage: DocumentStorage = window.localStorage,
): GeometryDocument | null {
  const serialized = storage.getItem(GEOMETRY_STORAGE_KEY);
  return serialized === null ? null : importDocumentJson(serialized);
}

export function clearDocument(storage: DocumentStorage = window.localStorage): void {
  storage.removeItem(GEOMETRY_STORAGE_KEY);
}

export function exportDocumentJson(document: GeometryDocument): string {
  const validated = validateDocument(document);
  return JSON.stringify(validated, null, 2);
}

export function importDocumentJson(serialized: string): GeometryDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new DocumentPersistenceError("Import failed: the file is not valid JSON.", {
      cause: error,
    });
  }
  return validateDocument(parsed);
}

export function documentToScript(document: GeometryDocument): string {
  const validated = validateDocument(document);
  if (validated.objects.length === 0) {
    return "# Empty construction\n";
  }

  const orderedObjects = topologicallySortObjects(validated.objects);
  const variableById = createVariableMap(orderedObjects);
  return `${orderedObjects
    .map((object) => objectToScript(object, variableById))
    .join("\n")}\n`;
}

function validateDocument(value: unknown): GeometryDocument {
  if (!isRecord(value)) {
    throw new DocumentPersistenceError("Import failed: the document must be a JSON object.");
  }
  if (value.schemaVersion !== 1) {
    throw new DocumentPersistenceError("Import failed: only geometry schema version 1 is supported.");
  }
  if (typeof value.id !== "string" || value.id.trim() === "") {
    throw new DocumentPersistenceError("Import failed: document.id must be a non-empty string.");
  }
  if (typeof value.title !== "string" || value.title.trim() === "") {
    throw new DocumentPersistenceError("Import failed: document.title must be a non-empty string.");
  }
  if (!Array.isArray(value.objects)) {
    throw new DocumentPersistenceError("Import failed: document.objects must be an array.");
  }
  if (value.viewport !== undefined) {
    if (
      !isRecord(value.viewport) ||
      !isFiniteNumber(value.viewport.centerX) ||
      !isFiniteNumber(value.viewport.centerY) ||
      !isFiniteNumber(value.viewport.scale) ||
      value.viewport.scale <= 0
    ) {
      throw new DocumentPersistenceError(
        "Import failed: document.viewport must contain finite centerX, centerY, and a positive scale.",
      );
    }
  }
  for (const [index, object] of value.objects.entries()) {
    if (
      !isRecord(object) ||
      typeof object.id !== "string" ||
      typeof object.label !== "string" ||
      !["point", "line", "segment", "circle"].includes(String(object.kind)) ||
      typeof object.visible !== "boolean" ||
      !isRecord(object.definition)
    ) {
      throw new DocumentPersistenceError(
        `Import failed: object at index ${index} does not match the geometry object format.`,
      );
    }
  }

  try {
    return new GeometryGraph(value as unknown as GeometryDocument).document;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown validation error";
    throw new DocumentPersistenceError(`Import failed: ${detail}.`, { cause: error });
  }
}

function topologicallySortObjects(objects: readonly GeometryObject[]): GeometryObject[] {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const visited = new Set<string>();
  const ordered: GeometryObject[] = [];

  const visit = (object: GeometryObject): void => {
    if (visited.has(object.id)) {
      return;
    }
    for (const parentId of getParentIds(object)) {
      const parent = byId.get(parentId);
      if (parent !== undefined) {
        visit(parent);
      }
    }
    visited.add(object.id);
    ordered.push(object);
  };

  for (const object of objects) {
    visit(object);
  }
  return ordered;
}

function createVariableMap(objects: readonly GeometryObject[]): ReadonlyMap<string, string> {
  const used = new Set<string>();
  const variables = new Map<string, string>();
  objects.forEach((object, index) => {
    const candidates = [object.label, object.id];
    let variable = candidates.find((candidate) => isIdentifier(candidate) && !used.has(candidate));
    if (variable === undefined) {
      let suffix = index + 1;
      do {
        variable = `object_${suffix}`;
        suffix += 1;
      } while (used.has(variable));
    }
    used.add(variable);
    variables.set(object.id, variable);
  });
  return variables;
}

function objectToScript(
  object: GeometryObject,
  variableById: ReadonlyMap<string, string>,
): string {
  const variable = requireVariable(variableById, object.id);
  const reference = (id: string): string => requireVariable(variableById, id);
  switch (object.definition.type) {
    case "free":
      return `${variable} = Point(${formatNumber(object.definition.x)}, ${formatNumber(object.definition.y)})`;
    case "through_points":
      return `${variable} = Line(${reference(object.definition.pointA)}, ${reference(object.definition.pointB)})`;
    case "between_points":
      return `${variable} = Segment(${reference(object.definition.pointA)}, ${reference(object.definition.pointB)})`;
    case "center_through_point":
      return `${variable} = Circle(${reference(object.definition.center)}, ${reference(object.definition.point)})`;
    case "midpoint":
      return `${variable} = Midpoint(${reference(object.definition.pointA)}, ${reference(object.definition.pointB)})`;
    case "parallel_through":
      return `${variable} = ParallelLine(${reference(object.definition.point)}, ${reference(object.definition.line)})`;
    case "perpendicular_through":
      return `${variable} = PerpendicularLine(${reference(object.definition.point)}, ${reference(object.definition.line)})`;
    case "intersection_ll":
      return `${variable} = IntersectionLL(${reference(object.definition.lineA)}, ${reference(object.definition.lineB)})`;
    case "intersection_lc":
      return `${variable} = IntersectionLC(${reference(object.definition.line)}, ${reference(object.definition.circle)}, ${object.definition.index})`;
    case "intersection_cc":
      return `${variable} = IntersectionCC(${reference(object.definition.circleA)}, ${reference(object.definition.circleB)}, ${object.definition.index})`;
    case "perpendicular_bisector":
      return `${variable} = PerpendicularBisector(${reference(object.definition.pointA)}, ${reference(object.definition.pointB)})`;
    case "angle_bisector":
      return `${variable} = AngleBisector(${reference(object.definition.armA)}, ${reference(object.definition.vertex)}, ${reference(object.definition.armB)})`;
    case "circumscribed":
      return `${variable} = Circumcircle(${reference(object.definition.pointA)}, ${reference(object.definition.pointB)}, ${reference(object.definition.pointC)})`;
    case "reflection_over_line":
      return `${variable} = Reflection(${reference(object.definition.point)}, ${reference(object.definition.line)})`;
    case "reflection_over_point":
      return `${variable} = Reflection(${reference(object.definition.point)}, ${reference(object.definition.center)})`;
    case "homothety_scalar":
      return `${variable} = Homothety(${reference(object.definition.center)}, ${reference(object.definition.point)}, ${formatNumber(object.definition.ratio)})`;
    case "homothety_point":
      return `${variable} = Homothety(${reference(object.definition.center)}, ${reference(object.definition.point)}, ${reference(object.definition.ratioPoint)})`;
    case "inversion_in_circle":
      return `${variable} = Inversion(${reference(object.definition.point)}, ${reference(object.definition.circle)})`;
    case "translation":
      return `${variable} = Translation(${reference(object.definition.point)}, ${reference(object.definition.from)}, ${reference(object.definition.to)})`;
    case "rotation":
      return `${variable} = Rotation(${reference(object.definition.point)}, ${reference(object.definition.center)}, ${formatNumber(object.definition.degrees)})`;
  }
}

function requireVariable(variableById: ReadonlyMap<string, string>, objectId: string): string {
  const variable = variableById.get(objectId);
  if (variable === undefined) {
    throw new DocumentPersistenceError(`Cannot export script: unknown object '${objectId}'.`);
  }
  return variable;
}

function formatNumber(value: number): string {
  return Object.is(value, -0) ? "0" : Number(value.toPrecision(15)).toString();
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
