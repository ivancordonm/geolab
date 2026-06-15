import type { GeometryDocument, GeometryObjectId } from "../types/geometry";

import { getParentIds } from "./engine";

export function collectFreePointAncestorIds(
  document: GeometryDocument,
  objectId: GeometryObjectId,
): GeometryObjectId[] {
  const objectsById = new Map(document.objects.map((object) => [object.id, object]));
  const freePointIds = new Set<GeometryObjectId>();
  const visited = new Set<GeometryObjectId>();

  const visit = (candidateId: GeometryObjectId): void => {
    if (visited.has(candidateId)) return;
    visited.add(candidateId);
    const object = objectsById.get(candidateId);
    if (object === undefined) return;
    if (object.kind === "point" && object.definition.type === "free") {
      freePointIds.add(candidateId);
      return;
    }
    for (const parentId of getParentIds(object)) {
      visit(parentId);
    }
  };

  visit(objectId);
  return [...freePointIds];
}

export function translateObjectDocument(
  document: GeometryDocument,
  objectId: GeometryObjectId,
  dx: number,
  dy: number,
): GeometryDocument {
  if (dx === 0 && dy === 0) return document;

  const freePointIds = new Set(collectFreePointAncestorIds(document, objectId));
  if (freePointIds.size === 0) return document;

  return {
    ...document,
    objects: document.objects.map((object) => {
      if (
        !freePointIds.has(object.id) ||
        object.kind !== "point" ||
        object.definition.type !== "free"
      ) {
        return object;
      }
      return {
        ...object,
        definition: {
          type: "free" as const,
          x: object.definition.x + dx,
          y: object.definition.y + dy,
        },
      };
    }),
  };
}
