import type { GeometryDocument } from "./geometry";

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface DocumentListResponse {
  documents: DocumentSummary[];
  total: number;
  hasMore: boolean;
}

export interface DocumentDetail {
  id: string;
  title: string;
  document: GeometryDocument;
  updatedAt: string;
  shared: boolean;
}

export interface PublicDocumentDetail {
  title: string;
  document: GeometryDocument;
  updatedAt: string;
}
