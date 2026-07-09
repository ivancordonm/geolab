import type { GeometryDocument } from "./geometry";

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface DocumentDetail {
  id: string;
  title: string;
  document: GeometryDocument;
  updatedAt: string;
}
