import type {
  GeometryDocument,
  GeometryObjectGroup,
  GeometryObjectId,
} from "../types/geometry";

export function validateObjectGroups(document: GeometryDocument): void {
  const objectIds = new Set(document.objects.map((object) => object.id));
  const groupIds = new Set<string>();
  const groupedObjectIds = new Set<string>();

  for (const group of document.groups ?? []) {
    if (!group.id.trim() || groupIds.has(group.id)) {
      throw new Error(`Invalid or duplicate geometry group id '${group.id}'`);
    }
    groupIds.add(group.id);
    if (!group.label.trim()) throw new Error(`Geometry group '${group.id}' must have a label`);
    if (group.members.length < 2) throw new Error(`Geometry group '${group.id}' must contain at least two objects`);
    let primaryCount = 0;
    const localIds = new Set<string>();
    for (const member of group.members) {
      if (!objectIds.has(member.objectId)) throw new Error(`Geometry group '${group.id}' references unknown object '${member.objectId}'`);
      if (localIds.has(member.objectId) || groupedObjectIds.has(member.objectId)) {
        throw new Error(`Geometry object '${member.objectId}' belongs to more than one group`);
      }
      if (!["primary", "input", "helper"].includes(member.role)) {
        throw new Error(`Geometry group '${group.id}' contains invalid role '${String(member.role)}'`);
      }
      localIds.add(member.objectId);
      groupedObjectIds.add(member.objectId);
      if (member.role === "primary") primaryCount += 1;
    }
    if (primaryCount === 0) throw new Error(`Geometry group '${group.id}' must contain a primary object`);
  }
}

export function nextObjectGroupId(document: Pick<GeometryDocument, "groups">): string {
  const occupied = new Set((document.groups ?? []).map((group) => group.id));
  let index = 1;
  while (occupied.has(`g${index}`)) index += 1;
  return `g${index}`;
}

export function groupForObject(document: GeometryDocument, objectId: GeometryObjectId): GeometryObjectGroup | undefined {
  return document.groups?.find((group) => group.members.some((member) => member.objectId === objectId));
}

export function normalizeObjectGroups(
  groups: readonly GeometryObjectGroup[] | undefined,
  survivingObjectIds: ReadonlySet<string>,
): GeometryObjectGroup[] | undefined {
  const normalized = (groups ?? []).flatMap((group) => {
    const members = group.members.filter((member) => survivingObjectIds.has(member.objectId));
    if (members.length < 2 || !members.some((member) => member.role === "primary")) return [];
    return [{ ...group, members }];
  });
  return normalized.length > 0 ? normalized : undefined;
}

export function mergeObjectGroups(
  current: GeometryDocument,
  incoming: GeometryDocument,
  newObjectIds: ReadonlySet<string>,
): GeometryObjectGroup[] | undefined {
  const validObjectIds = new Set(incoming.objects.map((object) => object.id));
  const kept = normalizeObjectGroups(current.groups, validObjectIds) ?? [];
  const occupiedObjects = new Set(kept.flatMap((group) => group.members.map((member) => member.objectId)));
  const result = [...kept];
  for (const candidate of incoming.groups ?? []) {
    if (!candidate.members.some((member) => newObjectIds.has(member.objectId))) continue;
    if (candidate.members.some((member) => occupiedObjects.has(member.objectId))) continue;
    const id = nextObjectGroupId({ groups: result });
    const group = { ...candidate, id };
    result.push(group);
    group.members.forEach((member) => occupiedObjects.add(member.objectId));
  }
  return result.length > 0 ? result : undefined;
}

export function mergeCommandDocument(
  current: GeometryDocument,
  incoming: GeometryDocument,
): GeometryDocument {
  const incomingById = new Map(incoming.objects.map((object) => [object.id, object]));
  const oldToNewId = new Map<string, string>();
  const currentByIncomingId = new Map<string, GeometryDocument["objects"][number]>();
  for (const object of current.objects) {
    const returnedId = incomingById.has(object.id)
      ? object.id
      : incomingById.has(object.label) ? object.label : undefined;
    if (returnedId === undefined || currentByIncomingId.has(returnedId)) continue;
    oldToNewId.set(object.id, returnedId);
    currentByIncomingId.set(returnedId, object);
  }
  const objects = incoming.objects.map((object) => {
    const existing = currentByIncomingId.get(object.id);
    if (existing === undefined) return object;
    return {
      ...object,
      label: existing.label,
      visible: existing.visible,
      style: existing.style,
    } as typeof object;
  });
  const newObjectIds = new Set(objects.filter((object) => !currentByIncomingId.has(object.id)).map((object) => object.id));
  const document = { ...incoming, objects };
  const remappedCurrent: GeometryDocument = {
    ...current,
    objects,
    groups: current.groups?.map((group) => ({
      ...group,
      members: group.members.flatMap((member) => {
        const objectId = oldToNewId.get(member.objectId);
        return objectId === undefined ? [] : [{ ...member, objectId }];
      }),
    })),
  };
  return {
    ...document,
    groups: mergeObjectGroups(remappedCurrent, document, newObjectIds),
  };
}
