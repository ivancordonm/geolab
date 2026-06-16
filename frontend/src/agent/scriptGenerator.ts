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
    case "polygon_vertex":
      return `${object.id} = Vertex(${definition.polygon}, ${definition.index})`;
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
      return definition.selector != null
        ? `${object.id} = Intersection(${definition.line}, ${definition.circle}, ${definition.selector})`
        : `${object.id} = IntersectionLC(${definition.line}, ${definition.circle}, ${definition.index})`;
    case "intersection_cc":
      return definition.selector != null
        ? `${object.id} = Intersection(${definition.circleA}, ${definition.circleB}, ${definition.selector})`
        : `${object.id} = IntersectionCC(${definition.circleA}, ${definition.circleB}, ${definition.index})`;
    case "perpendicular_bisector":
      return `${object.id} = PerpendicularBisector(${definition.pointA}, ${definition.pointB})`;
    case "angle_bisector":
      return `${object.id} = AngleBisector(${definition.armA}, ${definition.vertex}, ${definition.armB})`;
    case "circumscribed":
      return `${object.id} = Circumcircle(${definition.pointA}, ${definition.pointB}, ${definition.pointC})`;
    case "reflection_over_line":
      return `${object.id} = Reflection(${definition.object ?? definition.point}, ${definition.line})`;
    case "reflection_over_point":
      return `${object.id} = Reflection(${definition.object ?? definition.point}, ${definition.center})`;
    case "homothety_scalar":
      return `${object.id} = Homothety(${definition.center}, ${definition.point}, ${formatNumber(definition.ratio)})`;
    case "homothety_point":
      return `${object.id} = Homothety(${definition.center}, ${definition.point}, ${definition.ratioPoint})`;
    case "inversion_in_circle":
      return `${object.id} = Inversion(${definition.point}, ${definition.circle})`;
    case "translation":
      return `${object.id} = Translation(${definition.object ?? definition.point}, ${definition.from}, ${definition.to})`;
    case "rotation":
      return `${object.id} = Rotation(${definition.object ?? definition.point}, ${definition.center}, ${formatNumber(definition.degrees)})`;
    case "arc_through_points":
      return `${object.id} = Arc(${definition.pointA}, ${definition.pointMid}, ${definition.pointB})`;
    case "polygon":
      return `${object.id} = Polygon(${definition.points.join(", ")})`;
    case "regular_polygon":
      return `${object.id} = Polygon(${definition.pointA}, ${definition.pointB}, ${definition.sides})`;
    case "vector_polygon": {
      const offsetArgs = definition.offsets.map((o) => `(${formatNumber(o.x)}, ${formatNumber(o.y)})`).join(", ");
      return `${object.id} = VectorPolygon(${definition.anchor}, ${offsetArgs})`;
    }
  }
}

function formatNumber(value: number): string {
  return Number(value.toFixed(10)).toString();
}
