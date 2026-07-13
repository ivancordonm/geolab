import type { GeometryDocument, GeometryObject, Midpoint } from "../../types/geometry";
import { nextObjectId } from "./shared";

/** Handles the "midpoint" construction tool. */

export function createMidpoint(first: string, second: string, document: GeometryDocument): readonly GeometryObject[] {
  const id = nextObjectId(document, "M");
  const obj: Midpoint = { id, label: id, kind: "point", visible: true, definition: { type: "midpoint", pointA: first, pointB: second } };
  return [obj];
}
