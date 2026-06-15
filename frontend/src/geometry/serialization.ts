import { GeometryGraph } from "./engine";
import type { GeometryDocument } from "../types/geometry";

export function serializeGeometryDocument(document: GeometryDocument): string {
  new GeometryGraph(document);
  return JSON.stringify(document, null, 2);
}

export function deserializeGeometryDocument(json: string): GeometryDocument {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null) {
    throw new TypeError("Geometry document JSON must contain an object");
  }
  const document = parsed as GeometryDocument;
  new GeometryGraph(document);
  return document;
}

