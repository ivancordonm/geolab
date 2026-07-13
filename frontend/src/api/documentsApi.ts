import type {
  DocumentDetail,
  DocumentListResponse,
  PublicDocumentDetail,
} from "../types/documents";
import type { GeometryDocument } from "../types/geometry";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class DocumentsApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DocumentsApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    throw new DocumentsApiError(
      `Request to ${path} failed with status ${response.status}`,
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export function listDocuments(limit = 50, offset = 0): Promise<DocumentListResponse> {
  return request<DocumentListResponse>(`/documents?limit=${limit}&offset=${offset}`);
}

export function getDocument(id: string): Promise<DocumentDetail> {
  return request<DocumentDetail>(`/documents/${id}`);
}

export function createDocument(
  title: string,
  document: GeometryDocument,
): Promise<DocumentDetail> {
  return request<DocumentDetail>("/documents", {
    method: "POST",
    body: JSON.stringify({ title, document }),
  });
}

export function updateDocument(
  id: string,
  changes: { title?: string; document?: GeometryDocument },
): Promise<DocumentDetail> {
  return request<DocumentDetail>(`/documents/${id}`, {
    method: "PUT",
    body: JSON.stringify(changes),
  });
}

export function deleteDocument(id: string): Promise<void> {
  return request<void>(`/documents/${id}`, { method: "DELETE" });
}

export function shareDocument(id: string): Promise<{ token: string }> {
  return request<{ token: string }>(`/documents/${id}/share`, { method: "POST" });
}

export function unshareDocument(id: string): Promise<void> {
  return request<void>(`/documents/${id}/share`, { method: "DELETE" });
}

export function fetchSharedDocument(token: string): Promise<PublicDocumentDetail> {
  return request<PublicDocumentDetail>(`/documents/shared/${token}`);
}
