import type { EvaluatedValue, GeometryDocument, GeometryObject } from "./geometry";

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  mutatesGeometryState: boolean;
}

export interface ExecuteToolRequest {
  toolName: string;
  arguments: Record<string, unknown>;
  /** Omit (or null) to start from an empty document. */
  document?: GeometryDocument | null;
}

export interface ExecuteToolResponse {
  toolName: string;
  mutatesGeometryState: boolean;
  output: Record<string, unknown>;
  /** The resulting document; thread this into the next stateless call. */
  document: GeometryDocument;
}

export interface GraphRequest {
  /** Omit (or null) to evaluate an empty document. */
  document?: GeometryDocument | null;
}

export interface GraphResponse {
  graph: GraphView;
  document: GeometryDocument;
}

export interface GraphObjectView {
  object: GeometryObject;
  parentIds: string[];
  value: EvaluatedValue;
}

export interface GraphView {
  documentId: string;
  revision: number;
  objects: GraphObjectView[];
  idMap: Record<string, number>;
  labelMap: Record<string, string>;
}

