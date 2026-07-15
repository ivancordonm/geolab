import { describe, expect, it } from "vitest";

import type { GeometryDocument } from "../types/geometry";
import { GeometryGraph } from "./engine";
import { mergeCommandDocument, mergeObjectGroups } from "./objectGroups";

const groupedCircle: GeometryDocument = {
  schemaVersion: 1,
  id: "groups",
  title: "Groups",
  objects: [
    { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
    { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 2, y: 0 } },
    { id: "c1", label: "c1", kind: "circle", visible: true, definition: { type: "center_through_point", center: "A", point: "B" } },
  ],
  groups: [{ id: "g1", label: "Circle", members: [
    { objectId: "A", role: "input" },
    { objectId: "B", role: "input" },
    { objectId: "c1", role: "primary" },
  ] }],
};

describe("object groups", () => {
  it("preserves existing groups and renumbers a new command group", () => {
    const incoming: GeometryDocument = {
      ...groupedCircle,
      objects: [
        ...groupedCircle.objects,
        { id: "D", label: "D", kind: "point", visible: true, definition: { type: "free", x: 4, y: 0 } },
        { id: "E", label: "E", kind: "point", visible: true, definition: { type: "free", x: 6, y: 0 } },
        { id: "s1", label: "s1", kind: "segment", visible: true, definition: { type: "between_points", pointA: "D", pointB: "E" } },
      ],
      groups: [{ id: "g1", label: "Segment", members: [
        { objectId: "D", role: "input" },
        { objectId: "E", role: "input" },
        { objectId: "s1", role: "primary" },
      ] }],
    };

    const groups = mergeObjectGroups(groupedCircle, incoming, new Set(["D", "E", "s1"]));
    expect(groups?.map((group) => [group.id, group.label])).toEqual([["g1", "Circle"], ["g2", "Segment"]]);
    expect(() => new GeometryGraph({ ...incoming, groups })).not.toThrow();
  });

  it("rejects overlapping group membership", () => {
    expect(() => new GeometryGraph({
      ...groupedCircle,
      groups: [...groupedCircle.groups!, { id: "g2", label: "Other", members: [
        { objectId: "A", role: "input" },
        { objectId: "B", role: "primary" },
      ] }],
    })).toThrow(/more than one group/);
  });

  it("restores labels, styles, and visibility after a command round-trip", () => {
    const current: GeometryDocument = {
      ...groupedCircle,
      objects: groupedCircle.objects.map((object) => object.id === "A"
        ? { ...object, label: "Center", visible: false, style: { color: "#ef4444" } }
        : { ...object, visible: false }),
    };
    const incoming: GeometryDocument = {
      ...groupedCircle,
      objects: [
        { ...groupedCircle.objects[0], id: "Center", label: "Center" },
        groupedCircle.objects[1],
        { id: "c1", label: "c1", kind: "circle", visible: true, definition: { type: "center_through_point", center: "Center", point: "B" } },
        { id: "F", label: "F", kind: "function", visible: true, definition: { type: "function_expression", expression: "x" } },
      ],
      groups: [],
    };

    const merged = mergeCommandDocument(current, incoming);
    expect(merged.objects.find((object) => object.id === "Center")).toMatchObject({ label: "Center", visible: false, style: { color: "#ef4444" } });
    expect(merged.objects.find((object) => object.id === "c1")?.visible).toBe(false);
    expect(merged.groups?.[0].members[0].objectId).toBe("Center");
  });
});
