# Share Diagram Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public, revocable share link so anyone with the URL can open and locally interact with a saved diagram without signing in.

**Architecture:** A secret `share_token` column on the `documents` row gates a public read endpoint (`GET /documents/shared/{token}`). Owners toggle sharing via authed `POST`/`DELETE /documents/{id}/share`. The SPA detects `?share=<token>` on startup and loads the diagram read-locally with a banner; nothing persists back to the owner.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (backend), React + TypeScript + Vitest (frontend). Design spec: `docs/superpowers/specs/2026-07-10-share-diagram-link-design.md`.

## Global Constraints

- Backend near-zero comparisons and geometry unaffected; this is a persistence/API feature.
- Token generation: `secrets.token_urlsafe(16)`.
- The public endpoint is the ONLY documents route without `Depends(get_current_user)`.
- Ownership failures return `404` (never reveal existence), matching `_get_owned_document`.
- Pydantic schemas extend `GeometryModel` (camelCase aliases on the wire); serialize with `by_alias`.
- Frontend API calls use `credentials: "include"` and `API_BASE = import.meta.env.VITE_API_BASE_URL ?? ""`.
- Test DB schema is built from models via `Base.metadata.create_all` (see `backend/tests/conftest.py`), so a new model column is testable through endpoints without running Alembic. The Alembic migration is a production artifact only.
- Run backend tests from `backend/` with the venv active; frontend tests from `frontend/`.

---

### Task 1: Backend — `share_token` column and Alembic migration

**Files:**
- Modify: `backend/app/models.py` (add column to `Document`)
- Create: `backend/alembic/versions/0002_document_share_token.py`
- Test: `backend/tests/test_api_documents.py` (add one test that persists and queries by token through the ORM via the app's DB session override)

**Interfaces:**
- Produces: `Document.share_token: Mapped[str | None]` (unique, indexed, nullable).

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_api_documents.py`:

```python
def test_document_share_token_column_defaults_to_none(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    create_response = client.post(
        "/documents", json={"title": "T", "document": _sample_document()}
    )
    assert create_response.status_code == 201
    # A freshly created document is not shared yet.
    from app.models import Document
    from app.db import get_db

    override = app.dependency_overrides[get_db]
    session = next(override())
    try:
        document = session.query(Document).one()
        assert document.share_token is None
    finally:
        session.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_api_documents.py::test_document_share_token_column_defaults_to_none -v`
Expected: FAIL with `AttributeError: ... 'Document' ... has no attribute 'share_token'`.

- [ ] **Step 3: Add the column to the model**

In `backend/app/models.py`, inside `class Document`, after the `data` column add:

```python
    share_token: Mapped[str | None] = mapped_column(
        String(64), unique=True, nullable=True, index=True
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_api_documents.py::test_document_share_token_column_defaults_to_none -v`
Expected: PASS

- [ ] **Step 5: Create the Alembic migration (production artifact)**

Create `backend/alembic/versions/0002_document_share_token.py`:

```python
"""add share_token to documents

Revision ID: 0002_document_share_token
Revises: 0001_initial
Create Date: 2026-07-10

"""

from alembic import op
import sqlalchemy as sa

revision = "0002_document_share_token"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("share_token", sa.String(length=64), nullable=True))
    op.create_index("ix_documents_share_token", "documents", ["share_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_documents_share_token", table_name="documents")
    op.drop_column("documents", "share_token")
```

- [ ] **Step 6: Verify the full suite still passes**

Run: `pytest -q`
Expected: PASS (no regressions).

- [ ] **Step 7: Commit**

```bash
git add backend/app/models.py backend/alembic/versions/0002_document_share_token.py backend/tests/test_api_documents.py
git commit -m "feat(documents): add share_token column and migration"
```

---

### Task 2: Backend — share/unshare endpoints and `shared` flag

**Files:**
- Modify: `backend/app/documents/schemas.py` (add `ShareResponse`; add `shared` to `DocumentDetail`)
- Modify: `backend/app/documents/router.py` (add endpoints; set `shared` in `_detail`)
- Test: `backend/tests/test_api_documents.py`

**Interfaces:**
- Consumes: `Document.share_token` (Task 1), `_get_owned_document`, `_detail`.
- Produces:
  - `POST /documents/{document_id}/share` → `201`? No — `200` with `{ "token": str }`.
  - `DELETE /documents/{document_id}/share` → `204`.
  - `DocumentDetail.shared: bool`.
  - `ShareResponse { token: str }`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_api_documents.py`:

```python
def test_share_generates_token_and_is_idempotent(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    doc_id = client.post(
        "/documents", json={"title": "T", "document": _sample_document()}
    ).json()["id"]

    first = client.post(f"/documents/{doc_id}/share")
    assert first.status_code == 200
    token = first.json()["token"]
    assert token

    second = client.post(f"/documents/{doc_id}/share")
    assert second.status_code == 200
    assert second.json()["token"] == token

    detail = client.get(f"/documents/{doc_id}").json()
    assert detail["shared"] is True


def test_unshare_clears_token(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    doc_id = client.post(
        "/documents", json={"title": "T", "document": _sample_document()}
    ).json()["id"]
    client.post(f"/documents/{doc_id}/share")

    revoke = client.delete(f"/documents/{doc_id}/share")
    assert revoke.status_code == 204

    detail = client.get(f"/documents/{doc_id}").json()
    assert detail["shared"] is False


def test_share_other_users_document_is_not_found(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    doc_id = client.post(
        "/documents", json={"title": "T", "document": _sample_document()}
    ).json()["id"]
    _login(client, monkeypatch, sub="user-b", email="b@example.com")

    assert client.post(f"/documents/{doc_id}/share").status_code == 404
    assert client.delete(f"/documents/{doc_id}/share").status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_api_documents.py -k "share or unshare" -v`
Expected: FAIL (404 from unmatched routes / missing `shared` key).

- [ ] **Step 3: Add schemas**

In `backend/app/documents/schemas.py`:

```python
class DocumentDetail(GeometryModel):
    id: str
    title: str
    document: GeometryDocument
    updated_at: datetime
    shared: bool = False


class ShareResponse(GeometryModel):
    token: str
```

- [ ] **Step 4: Update `_detail` and add endpoints**

In `backend/app/documents/router.py`, update the import and `_detail`, and add the endpoints. Change the schema import to include `ShareResponse`:

```python
from app.documents.schemas import (
    DocumentDetail,
    DocumentSummary,
    SaveDocumentRequest,
    ShareResponse,
    UpdateDocumentRequest,
)
```

Update `_detail` to set `shared`:

```python
def _detail(document: Document) -> DocumentDetail:
    geometry_document = GeometryDocument.model_validate(document.data).model_copy(
        update={"title": document.title}
    )
    return DocumentDetail(
        id=document.id,
        title=document.title,
        document=geometry_document,
        updated_at=document.updated_at,
        shared=document.share_token is not None,
    )
```

Add a token helper near the top (after imports):

```python
import secrets
```

Add the endpoints (place them after `delete_document`):

```python
@router.post("/{document_id}/share", response_model=ShareResponse)
def share_document(
    document_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> ShareResponse:
    document = _get_owned_document(session, user, document_id)
    if document.share_token is None:
        document.share_token = secrets.token_urlsafe(16)
        session.commit()
        session.refresh(document)
    return ShareResponse(token=document.share_token)


@router.delete("/{document_id}/share", status_code=status.HTTP_204_NO_CONTENT)
def unshare_document(
    document_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> None:
    document = _get_owned_document(session, user, document_id)
    document.share_token = None
    session.commit()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_api_documents.py -k "share or unshare" -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/documents/schemas.py backend/app/documents/router.py backend/tests/test_api_documents.py
git commit -m "feat(documents): add share/unshare endpoints and shared flag"
```

---

### Task 3: Backend — public read endpoint

**Files:**
- Modify: `backend/app/documents/schemas.py` (add `PublicDocument`)
- Modify: `backend/app/documents/router.py` (add public GET; register `get_current_user_optional`-free route)
- Test: `backend/tests/test_api_documents.py`

**Interfaces:**
- Consumes: `Document.share_token`, `GeometryDocument`.
- Produces: `GET /documents/shared/{token}` → `PublicDocument { title, document, updatedAt }` or `404`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_api_documents.py`:

```python
def test_public_read_returns_shared_document_without_auth(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    doc_id = client.post(
        "/documents", json={"title": "Shared", "document": _sample_document()}
    ).json()["id"]
    token = client.post(f"/documents/{doc_id}/share").json()["token"]

    # New client with no session cookie.
    from fastapi.testclient import TestClient
    anon = TestClient(app)
    response = anon.get(f"/documents/shared/{token}")
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Shared"
    assert body["document"]["objects"] == []
    assert "id" not in body  # internal row id not exposed


def test_public_read_of_revoked_token_is_not_found(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    doc_id = client.post(
        "/documents", json={"title": "T", "document": _sample_document()}
    ).json()["id"]
    token = client.post(f"/documents/{doc_id}/share").json()["token"]
    client.delete(f"/documents/{doc_id}/share")

    assert client.get(f"/documents/shared/{token}").status_code == 404


def test_public_read_of_unknown_token_is_not_found(client) -> None:
    assert client.get("/documents/shared/does-not-exist").status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_api_documents.py -k "public_read" -v`
Expected: FAIL (404 for all — route not defined — but the "unknown token" test would spuriously pass; the shared/revoked ones fail).

- [ ] **Step 3: Add the schema**

In `backend/app/documents/schemas.py`:

```python
class PublicDocument(GeometryModel):
    title: str
    document: GeometryDocument
    updated_at: datetime
```

- [ ] **Step 4: Add the public endpoint**

In `backend/app/documents/router.py`, import `PublicDocument` in the schemas import block, then add (place it BEFORE `get_document` so `/documents/shared/{token}` is registered as a distinct two-segment route; ordering is not strictly required since paths differ in segment count, but keep public routes grouped at the top for clarity):

```python
@router.get("/shared/{token}", response_model=PublicDocument)
def read_shared_document(
    token: str,
    session: Session = Depends(get_db),
) -> PublicDocument:
    document = session.query(Document).filter_by(share_token=token).one_or_none()
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    geometry_document = GeometryDocument.model_validate(document.data).model_copy(
        update={"title": document.title}
    )
    return PublicDocument(
        title=document.title,
        document=geometry_document,
        updated_at=document.updated_at,
    )
```

Note: this route has NO `Depends(get_current_user)` — it is intentionally public.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_api_documents.py -k "public_read" -v`
Expected: PASS

- [ ] **Step 6: Verify the full backend suite passes**

Run: `pytest -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/documents/schemas.py backend/app/documents/router.py backend/tests/test_api_documents.py
git commit -m "feat(documents): add public shared-document read endpoint"
```

---

### Task 4: Frontend — documents API client and types

**Files:**
- Modify: `frontend/src/types/documents.ts` (add `shared` to `DocumentDetail`; add `PublicDocumentDetail`)
- Modify: `frontend/src/api/documentsApi.ts` (add `shareDocument`, `unshareDocument`, `fetchSharedDocument`)
- Test: `frontend/src/api/documentsApi.test.ts`

**Interfaces:**
- Consumes: backend `POST/DELETE /documents/{id}/share`, `GET /documents/shared/{token}`.
- Produces:
  - `shareDocument(id: string): Promise<{ token: string }>`
  - `unshareDocument(id: string): Promise<void>`
  - `fetchSharedDocument(token: string): Promise<PublicDocumentDetail>`
  - `DocumentDetail.shared: boolean`
  - `PublicDocumentDetail { title: string; document: GeometryDocument; updatedAt: string }`

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/api/documentsApi.test.ts` (extend the import to include the new functions):

```typescript
import {
  DocumentsApiError,
  createDocument,
  deleteDocument,
  fetchSharedDocument,
  getDocument,
  listDocuments,
  shareDocument,
  unshareDocument,
  updateDocument,
} from "./documentsApi";
```

```typescript
it("shares a document and returns the token", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ token: "abc123" }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await shareDocument("doc-1");

  expect(fetchMock).toHaveBeenCalledWith(
    "/documents/doc-1/share",
    expect.objectContaining({ method: "POST", credentials: "include" }),
  );
  expect(result).toEqual({ token: "abc123" });
});

it("unshares a document", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);

  await unshareDocument("doc-1");

  expect(fetchMock).toHaveBeenCalledWith(
    "/documents/doc-1/share",
    expect.objectContaining({ method: "DELETE", credentials: "include" }),
  );
});

it("fetches a shared document by token", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        title: "Shared",
        document: sampleDocument,
        updatedAt: "2026-01-01T00:00:00Z",
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await fetchSharedDocument("tok");

  expect(fetchMock).toHaveBeenCalledWith(
    "/documents/shared/tok",
    expect.objectContaining({ credentials: "include" }),
  );
  expect(result.title).toBe("Shared");
});

it("throws DocumentsApiError for an unknown shared token", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(fetchSharedDocument("nope")).rejects.toBeInstanceOf(DocumentsApiError);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- documentsApi`
Expected: FAIL (exports not found).

- [ ] **Step 3: Add types**

In `frontend/src/types/documents.ts`:

```typescript
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
```

- [ ] **Step 4: Add API functions**

In `frontend/src/api/documentsApi.ts`, update the type import and add functions:

```typescript
import type {
  DocumentDetail,
  DocumentSummary,
  PublicDocumentDetail,
} from "../types/documents";
```

```typescript
export function shareDocument(id: string): Promise<{ token: string }> {
  return request<{ token: string }>(`/documents/${id}/share`, { method: "POST" });
}

export function unshareDocument(id: string): Promise<void> {
  return request<void>(`/documents/${id}/share`, { method: "DELETE" });
}

export function fetchSharedDocument(token: string): Promise<PublicDocumentDetail> {
  return request<PublicDocumentDetail>(`/documents/shared/${token}`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- documentsApi`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (If existing code constructs `DocumentDetail` object literals without `shared`, none should — it is only produced by the API. If typecheck flags a test mock, add `shared: false` there.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/documents.ts frontend/src/api/documentsApi.ts frontend/src/api/documentsApi.test.ts
git commit -m "feat(documents): add share API client functions and types"
```

---

### Task 5: Frontend — Share / Stop sharing UI and wiring

**Files:**
- Modify: `frontend/src/components/persistence/PersistenceControls.tsx` (add menu items + props)
- Modify: `frontend/src/App.tsx` (handlers, share state, pass props)
- Test: none new (UI wiring; covered manually and by Task 6 startup test). Typecheck + existing `App.test.tsx` must pass.

**Interfaces:**
- Consumes: `shareDocument`, `unshareDocument` (Task 4); `cloud.cloudId`, `saveAsNewCloudDocument`.
- Produces: `PersistenceControls` props `shared: boolean`, `onShare: () => void`, `onStopSharing: () => void`.

- [ ] **Step 1: Add props to PersistenceControls**

In `frontend/src/components/persistence/PersistenceControls.tsx`, extend the props interface and destructuring:

```typescript
  cloudEnabled?: boolean;
  shared?: boolean;
  onSaveToCloud?: () => void;
  onSaveAsNewToCloud?: () => void;
  onOpenCloudPanel?: () => void;
  onShare?: () => void;
  onStopSharing?: () => void;
```

Add `shared = false`, `onShare`, `onStopSharing` to the destructured params (with the other cloud props).

- [ ] **Step 2: Add the Share menu item and import the icon**

Add `Share2` to the `lucide-react` import. Inside the `cloudEnabled` block in the menu, after the "Open" item, add:

```tsx
              {shared ? (
                <MenuItem
                  icon={<Share2 size={16} aria-hidden />}
                  onClick={() => run(() => onStopSharing?.())}
                >
                  Stop sharing
                </MenuItem>
              ) : (
                <MenuItem
                  icon={<Share2 size={16} aria-hidden />}
                  onClick={() => run(() => onShare?.())}
                >
                  Share...
                </MenuItem>
              )}
```

- [ ] **Step 3: Add share state and handlers in App**

In `frontend/src/App.tsx`, add imports:

```typescript
import { shareDocument, unshareDocument } from "./api/documentsApi";
```

Add state near the other `useState` declarations:

```typescript
const [shared, setShared] = useState(false);
```

Add handlers (after `handleSaveAsNewToCloud`):

```typescript
const handleShare = useCallback(() => {
  void (async () => {
    let id = cloudId;
    if (id === null) {
      const title = window.prompt("Title for this construction:", geometry.document.title);
      if (title === null || title.trim() === "") return;
      const result = await saveAsNewCloudDocument(title.trim(), currentDocument());
      if (result.status !== "success") {
        if (result.status === "error") setPersistenceNotice({ message: null, error: result.error });
        return;
      }
      setGeometryDocumentTitle(result.value.title);
      id = result.value.id;
    }
    try {
      const { token } = await shareDocument(id);
      const url = `${window.location.origin}/?share=${token}`;
      try {
        await navigator.clipboard.writeText(url);
        setPersistenceNotice({ message: "Share link copied.", error: null });
      } catch {
        setPersistenceNotice({ message: url, error: null });
      }
      setShared(true);
    } catch (error) {
      reportPersistenceError(asError(error, "Unable to share construction."));
    }
  })();
}, [cloudId, currentDocument, geometry.document.title, reportPersistenceError, saveAsNewCloudDocument, setGeometryDocumentTitle]);

const handleStopSharing = useCallback(() => {
  if (cloudId === null) return;
  void (async () => {
    try {
      await unshareDocument(cloudId);
      setShared(false);
      setPersistenceNotice({ message: "Sharing stopped.", error: null });
    } catch (error) {
      reportPersistenceError(asError(error, "Unable to stop sharing."));
    }
  })();
}, [cloudId, reportPersistenceError]);
```

- [ ] **Step 4: Reset `shared` when detaching / opening a different cloud doc**

In `handleOpenCloudDocument`, after a successful open set the flag from the loaded detail:

```typescript
      if (result.status === "success") {
        replaceConstruction(result.value.document);
        setShared(result.value.shared);
        setPersistenceNotice({ message: "Cloud construction loaded.", error: null });
      }
```

And set `setShared(false)` inside `handleClear`, `handleLoad`, and `handleImportJson` (right after their `detachCloudDocument()` calls) so a non-cloud document never shows as shared.

- [ ] **Step 5: Pass the new props to PersistenceControls**

In the `toolbarControls` JSX, add to `<PersistenceControls ...>`:

```tsx
        cloudEnabled={auth.user !== null}
        shared={shared}
        onSaveToCloud={handleSaveToCloud}
        onSaveAsNewToCloud={handleSaveAsNewToCloud}
        onOpenCloudPanel={openCloudPanel}
        onShare={handleShare}
        onStopSharing={handleStopSharing}
```

- [ ] **Step 6: Typecheck and run existing tests**

Run: `npm run typecheck && npm run test -- App`
Expected: no type errors; `App.test.tsx` passes.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/persistence/PersistenceControls.tsx frontend/src/App.tsx
git commit -m "feat(app): add Share / Stop sharing actions"
```

---

### Task 6: Frontend — open a shared link on startup

**Files:**
- Create: `frontend/src/persistence/sharedLink.ts` (pure helper to read + strip the token)
- Modify: `frontend/src/App.tsx` (startup effect + banner)
- Test: `frontend/src/persistence/sharedLink.test.ts`

**Interfaces:**
- Consumes: `fetchSharedDocument` (Task 4), `replaceConstruction`, `detachCloudDocument`.
- Produces: `readShareTokenFromLocation(location: { search: string }): string | null`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/persistence/sharedLink.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { readShareTokenFromLocation } from "./sharedLink";

describe("readShareTokenFromLocation", () => {
  it("returns the token when present", () => {
    expect(readShareTokenFromLocation({ search: "?share=abc123" })).toBe("abc123");
  });

  it("returns null when absent", () => {
    expect(readShareTokenFromLocation({ search: "" })).toBeNull();
    expect(readShareTokenFromLocation({ search: "?foo=1" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- sharedLink`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helper**

Create `frontend/src/persistence/sharedLink.ts`:

```typescript
export function readShareTokenFromLocation(location: { search: string }): string | null {
  const params = new URLSearchParams(location.search);
  const token = params.get("share");
  return token !== null && token.trim() !== "" ? token : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- sharedLink`
Expected: PASS

- [ ] **Step 5: Wire the startup effect and banner in App**

In `frontend/src/App.tsx`, add imports:

```typescript
import { fetchSharedDocument } from "./api/documentsApi";
import { readShareTokenFromLocation } from "./persistence/sharedLink";
```

(Note: `shareDocument`/`unshareDocument` already imported in Task 5 — extend that import line rather than duplicating.)

Add state:

```typescript
const [viewingShared, setViewingShared] = useState(false);
```

Add the effect (after the existing keydown effect):

```typescript
useEffect(() => {
  const token = readShareTokenFromLocation(window.location);
  if (token === null) return;
  window.history.replaceState(null, "", window.location.pathname);
  void (async () => {
    try {
      const shared = await fetchSharedDocument(token);
      detachCloudDocument();
      replaceConstruction(shared.document);
      setShared(false);
      setViewingShared(true);
    } catch {
      setPersistenceNotice({ message: null, error: "This shared link is no longer available." });
    }
  })();
  // Run once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

Add the banner near the top of the returned JSX, right after the opening `<div className="relative h-screen w-screen overflow-hidden">`:

```tsx
      {viewingShared && (
        <div
          className="absolute left-1/2 top-3 z-20 -translate-x-1/2 max-w-[90vw] rounded-card border border-edge bg-surface/95 px-4 py-2 text-sm text-muted shadow-card backdrop-blur"
          role="status"
        >
          Viewing a shared construction. Changes are not saved to the original — sign in and use
          &ldquo;Save as new&rdquo; to keep a copy.
          <button
            type="button"
            onClick={() => setViewingShared(false)}
            className="ml-3 rounded-md border border-edge px-2 py-0.5 text-xs font-semibold text-muted hover:text-content"
          >
            Dismiss
          </button>
        </div>
      )}
```

- [ ] **Step 6: Typecheck and run the frontend suite**

Run: `npm run typecheck && npm run test`
Expected: PASS across the suite.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/persistence/sharedLink.ts frontend/src/persistence/sharedLink.test.ts frontend/src/App.tsx
git commit -m "feat(app): open shared diagrams from ?share links"
```

---

## Manual verification (after implementation)

1. Backend: `pytest -q` green; frontend: `npm run test` and `npm run typecheck` green.
2. Run the stack locally. Sign in, save a construction to the cloud, choose **Share…**, confirm the link is copied.
3. Open the copied `http://localhost:5173/?share=<token>` in a private window (no session) → the diagram loads with the banner; dragging a free point works and nothing persists to the owner.
4. Back as the owner, choose **Stop sharing**, reload the private window's link → "This shared link is no longer available."
5. Production only: after deploy, run `alembic upgrade head` on the backend.

## Notes

- No `frontend/vercel.json` change: `/documents/{id}/share` and `/documents/shared/{token}` are two-segment paths already covered by the `/documents/:path*` rewrite.
- No new environment variables.
