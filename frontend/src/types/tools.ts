import type { EvaluatedValue, GeometryObject } from "./geometry";

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
}

export interface ExecuteToolResponse {
  toolName: string;
  mutatesGeometryState: boolean;
  output: Record<string, unknown>;
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

