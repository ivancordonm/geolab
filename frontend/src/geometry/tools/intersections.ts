import type { GeometryDocument, GeometryObject, IntersectionCC, IntersectionLC, IntersectionLL } from "../../types/geometry";
import { nextObjectId } from "./shared";

/** Handles the "intersection" construction tool (line-line, line-circle, circle-circle). */

export function createIntersection(
  first: string,
  second: string,
  document: GeometryDocument,
): readonly GeometryObject[] {
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
