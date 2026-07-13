import type { GeometryDocument, GeometryObject } from "../../types/geometry";

/** Common id/label helpers used by every `createConstruction` family file. */

export function requireObject(document: GeometryDocument, objectId: string): GeometryObject {
  const object = document.objects.find((candidate) => candidate.id === objectId);
  if (object === undefined) {
    throw new Error(`Unknown object '${objectId}'`);
  }
  return object;
}

export function nextPointLabel(document: GeometryDocument): string {
  const occupied = new Set(document.objects.flatMap((object) => [object.id, object.label]));
  for (let code = 65; code <= 90; code += 1) {
    const label = String.fromCharCode(code);
    if (!occupied.has(label)) {
      return label;
    }
  }
  return nextObjectId(document, "P");
}

export function nextObjectId(document: GeometryDocument, prefix: string): string {
  const occupied = new Set(document.objects.flatMap((object) => [object.id, object.label]));
  let index = 1;
  while (occupied.has(`${prefix}${index}`)) {
    index += 1;
  }
  return `${prefix}${index}`;
}
