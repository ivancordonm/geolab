import type { EvaluatedValue, GeometryDocument } from "./geometry";

export interface EvaluateScriptRequest {
  script: string;
  documentId?: string;
  title?: string;
}

export interface EvaluateScriptResponse {
  document: GeometryDocument;
  values: Record<string, EvaluatedValue>;
}

export interface ScriptErrorDetail {
  code: string;
  message: string;
  line: number;
  column: number;
  sourceLine: string;
}

