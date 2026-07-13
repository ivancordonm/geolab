import type { Circle, CircumscribedCircle, GeometryDocument, GeometryObject } from "../../types/geometry";
import { nextObjectId } from "./shared";

/** Handles the "circle"/"circumcircle" construction tools. */

export function createCircle(first: string, second: string, document: GeometryDocument): readonly GeometryObject[] {
  const id = nextObjectId(document, "c");
  const obj: Circle = { id, label: id, kind: "circle", visible: true, definition: { type: "center_through_point", center: first, point: second } };
  return [obj];
}

export function createCircumcircle(
  first: string,
  second: string,
  third: string,
  document: GeometryDocument,
): readonly GeometryObject[] {
  const id = nextObjectId(document, "cc");
  const obj: CircumscribedCircle = { id, label: id, kind: "circle", visible: true, definition: { type: "circumscribed", pointA: first, pointB: second, pointC: third } };
  return [obj];
}
