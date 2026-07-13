import type { GeometryDocument, GeometryObject, Polygon } from "../../types/geometry";
import { nextObjectId } from "./shared";

/** Handles the "polygon"/"regular_polygon"/"vector_polygon" construction tools. */

export function createPolygon(selected: readonly string[], document: GeometryDocument): readonly GeometryObject[] {
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

export function createRegularPolygon(
  first: string,
  second: string,
  document: GeometryDocument,
  regularPolygonSides: number,
): readonly GeometryObject[] {
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

export function createVectorPolygon(selected: readonly string[], document: GeometryDocument): readonly GeometryObject[] {
  const [first] = selected;
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
