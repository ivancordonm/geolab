import type {
  GeometryDocument,
  GeometryObject,
  HomothetyPoint,
  ReflectionOverLine,
  ReflectionOverPoint,
  RotatedObject,
  TranslatedObject,
} from "../../types/geometry";
import { nextObjectId, requireObject } from "./shared";

/** Handles the "reflect_line"/"reflect_point"/"homothety"/"translation"/"rotation" construction tools. */

export type ReflectableObject = Extract<GeometryObject, { kind: "point" | "line" | "segment" | "circle" | "polygon" }>;
export type ReflectionObject = ReflectionOverLine | ReflectionOverPoint;

export function isReflectableObject(object: GeometryObject): object is ReflectableObject {
  return object.kind === "point" || object.kind === "line" || object.kind === "segment" || object.kind === "circle" || object.kind === "polygon";
}

function makeReflectionOverLine<K extends ReflectableObject["kind"]>(
  id: string,
  objectId: string,
  lineId: string,
  kind: K,
): Extract<GeometryObject, { definition: { type: "reflection_over_line" }; kind: K }> {
  return {
    id,
    label: id,
    kind,
    visible: true,
    definition: { type: "reflection_over_line", object: objectId, line: lineId },
  } as Extract<GeometryObject, { definition: { type: "reflection_over_line" }; kind: K }>;
}

function makeReflectionOverPoint<K extends ReflectableObject["kind"]>(
  id: string,
  objectId: string,
  centerId: string,
  kind: K,
): Extract<GeometryObject, { definition: { type: "reflection_over_point" }; kind: K }> {
  return {
    id,
    label: id,
    kind,
    visible: true,
    definition: { type: "reflection_over_point", object: objectId, center: centerId },
  } as Extract<GeometryObject, { definition: { type: "reflection_over_point" }; kind: K }>;
}

export function createReflectionOverLine(
  first: string,
  second: string,
  document: GeometryDocument,
): readonly GeometryObject[] {
  const id = nextObjectId(document, "rf");
  const source = requireObject(document, first);
  if (!isReflectableObject(source)) {
    throw new Error("Reflection requires a point, line, segment, circle, or polygon");
  }
  return [makeReflectionOverLine(id, first, second, source.kind)];
}

export function createReflectionOverPoint(
  first: string,
  second: string,
  document: GeometryDocument,
): readonly GeometryObject[] {
  const id = nextObjectId(document, "rp");
  const source = requireObject(document, first);
  if (!isReflectableObject(source)) {
    throw new Error("Reflection requires a point, line, segment, circle, or polygon");
  }
  return [makeReflectionOverPoint(id, first, second, source.kind)];
}

export function createHomothety(
  first: string,
  second: string,
  third: string,
  document: GeometryDocument,
): readonly GeometryObject[] {
  const id = nextObjectId(document, "ht");
  const obj: HomothetyPoint = { id, label: id, kind: "point", visible: true, definition: { type: "homothety_point", center: first, point: second, ratioPoint: third } };
  return [obj];
}

export function createTranslation(
  first: string,
  second: string,
  third: string,
  document: GeometryDocument,
): readonly GeometryObject[] {
  const id = nextObjectId(document, "tr");
  const source = requireObject(document, first);
  if (!isReflectableObject(source)) {
    throw new Error("Translation requires a point, line, segment, circle, or polygon");
  }
  const obj: TranslatedObject = {
    id,
    label: id,
    kind: source.kind,
    visible: true,
    definition: { type: "translation", object: first, from: second, to: third },
  };
  return [obj as GeometryObject];
}

export function createRotation(
  first: string,
  second: string,
  document: GeometryDocument,
  rotationAngle: number,
): readonly GeometryObject[] {
  const id = nextObjectId(document, "rot");
  const source = requireObject(document, first);
  if (!isReflectableObject(source)) {
    throw new Error("Rotation requires a point, line, segment, circle, or polygon");
  }
  const obj: RotatedObject = {
    id,
    label: id,
    kind: source.kind,
    visible: true,
    definition: { type: "rotation", object: first, center: second, degrees: rotationAngle },
  };
  return [obj as GeometryObject];
}
