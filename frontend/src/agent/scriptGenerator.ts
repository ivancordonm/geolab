import type { GeometryDocument, GeometryObject } from "../types/geometry";

export interface ConstructionScriptGenerator {
  generate(document: GeometryDocument): string;
}

export class GeometryDocumentScriptGenerator implements ConstructionScriptGenerator {
  generate(document: GeometryDocument): string {
    return document.objects.map(objectToStatement).join("\n");
  }
}

export const scriptGenerator: ConstructionScriptGenerator = new GeometryDocumentScriptGenerator();

function objectToStatement(object: GeometryObject): string {
  const definition = object.definition;
  switch (definition.type) {
    case "free":
      return `${object.id} = Point(${formatNumber(definition.x)}, ${formatNumber(definition.y)})`;
    case "through_points":
      return `${object.id} = Line(${definition.pointA}, ${definition.pointB})`;
    case "between_points":
      return `${object.id} = Segment(${definition.pointA}, ${definition.pointB})`;
    case "center_through_point":
      return `${object.id} = Circle(${definition.center}, ${definition.point})`;
    case "midpoint":
      return `${object.id} = Midpoint(${definition.pointA}, ${definition.pointB})`;
    case "parallel_through":
      return `${object.id} = ParallelLine(${definition.point}, ${definition.line})`;
    case "perpendicular_through":
      return `${object.id} = PerpendicularLine(${definition.point}, ${definition.line})`;
    case "intersection_ll":
      return `${object.id} = IntersectionLL(${definition.lineA}, ${definition.lineB})`;
    case "intersection_lc":
      return `${object.id} = IntersectionLC(${definition.line}, ${definition.circle}, ${definition.index})`;
    case "intersection_cc":
      return `${object.id} = IntersectionCC(${definition.circleA}, ${definition.circleB}, ${definition.index})`;
    case "perpendicular_bisector":
      return `${object.id} = PerpendicularBisector(${definition.pointA}, ${definition.pointB})`;
    case "angle_bisector":
      return `${object.id} = AngleBisector(${definition.armA}, ${definition.vertex}, ${definition.armB})`;
    case "circumscribed":
      return `${object.id} = Circumcircle(${definition.pointA}, ${definition.pointB}, ${definition.pointC})`;
    case "reflection_over_line":
      return `${object.id} = Reflection(${definition.point}, ${definition.line})`;
    case "reflection_over_point":
      return `${object.id} = Reflection(${definition.point}, ${definition.center})`;
    case "homothety_scalar":
      return `${object.id} = Homothety(${definition.center}, ${definition.point}, ${formatNumber(definition.ratio)})`;
    case "homothety_point":
      return `${object.id} = Homothety(${definition.center}, ${definition.point}, ${definition.ratioPoint})`;
    case "inversion_in_circle":
      return `${object.id} = Inversion(${definition.point}, ${definition.circle})`;
    case "translation":
      return `${object.id} = Translation(${definition.point}, ${definition.from}, ${definition.to})`;
    case "rotation":
      return `${object.id} = Rotation(${definition.point}, ${definition.center}, ${formatNumber(definition.degrees)})`;
  }
}

function formatNumber(value: number): string {
  return Number(value.toFixed(10)).toString();
}

