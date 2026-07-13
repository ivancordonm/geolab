import type {
  AngleBisectorLine,
  GeometryDocument,
  GeometryObject,
  Line,
  ParallelLine,
  PerpendicularBisectorLine,
  PerpendicularLine,
  Segment,
} from "../../types/geometry";
import { nextObjectId } from "./shared";

/** Handles the "segment"/"line"/"parallel"/"perpendicular"/bisector construction tools. */

export function createSegment(first: string, second: string, document: GeometryDocument): readonly GeometryObject[] {
  const id = nextObjectId(document, "s");
  const obj: Segment = { id, label: id, kind: "segment", visible: true, definition: { type: "between_points", pointA: first, pointB: second } };
  return [obj];
}

export function createLine(first: string, second: string, document: GeometryDocument): readonly GeometryObject[] {
  const id = nextObjectId(document, "l");
  const obj: Line = { id, label: id, kind: "line", visible: true, definition: { type: "through_points", pointA: first, pointB: second } };
  return [obj];
}

export function createParallel(first: string, second: string, document: GeometryDocument): readonly GeometryObject[] {
  const id = nextObjectId(document, "p");
  const obj: ParallelLine = { id, label: id, kind: "line", visible: true, definition: { type: "parallel_through", point: first, line: second } };
  return [obj];
}

export function createPerpendicular(first: string, second: string, document: GeometryDocument): readonly GeometryObject[] {
  const id = nextObjectId(document, "h");
  const obj: PerpendicularLine = { id, label: id, kind: "line", visible: true, definition: { type: "perpendicular_through", point: first, line: second } };
  return [obj];
}

export function createPerpendicularBisector(
  first: string,
  second: string,
  document: GeometryDocument,
): readonly GeometryObject[] {
  const id = nextObjectId(document, "pb");
  const obj: PerpendicularBisectorLine = { id, label: id, kind: "line", visible: true, definition: { type: "perpendicular_bisector", pointA: first, pointB: second } };
  return [obj];
}

export function createAngleBisector(
  first: string,
  second: string,
  third: string,
  document: GeometryDocument,
): readonly GeometryObject[] {
  const id = nextObjectId(document, "ab");
  const obj: AngleBisectorLine = { id, label: id, kind: "line", visible: true, definition: { type: "angle_bisector", armA: first, vertex: second, armB: third } };
  return [obj];
}
