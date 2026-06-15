"""Validated geometry state and immutable graph snapshots for agent access."""

from __future__ import annotations

from dataclasses import dataclass
from threading import RLock
from types import MappingProxyType
from typing import Mapping

from app.geometry.engine import GeometryGraph, get_parent_ids
from app.geometry.models import (
    EvaluatedValue,
    GeometryDocument,
    GeometryObject,
    GeometryViewport,
)


class GeometryWorkspaceError(ValueError):
    """Raised when a requested workspace operation is invalid."""


@dataclass(frozen=True, slots=True)
class GraphObjectAccess:
    """One immutable node in the agent-facing graph access map."""

    object: GeometryObject
    parent_ids: tuple[str, ...]
    value: EvaluatedValue


class GraphAccessMap:
    """Read-only ID/label indexes over an immutable graph snapshot."""

    __slots__ = ("document_id", "revision", "_by_id", "_id_by_label")

    def __init__(
        self,
        *,
        document_id: str,
        revision: int,
        by_id: dict[str, GraphObjectAccess],
        id_by_label: dict[str, str],
    ) -> None:
        self.document_id = document_id
        self.revision = revision
        self._by_id: Mapping[str, GraphObjectAccess] = MappingProxyType(by_id.copy())
        self._id_by_label: Mapping[str, str] = MappingProxyType(id_by_label.copy())

    @property
    def by_id(self) -> Mapping[str, GraphObjectAccess]:
        return self._by_id

    @property
    def id_by_label(self) -> Mapping[str, str]:
        return self._id_by_label

    def resolve(self, object_id_or_label: str) -> GraphObjectAccess:
        """Resolve an exact ID first, then a unique label without exposing state."""

        node = self._by_id.get(object_id_or_label)
        if node is not None:
            return node
        object_id = self._id_by_label.get(object_id_or_label)
        if object_id is None:
            raise GeometryWorkspaceError(f"Unknown geometry object '{object_id_or_label}'")
        return self._by_id[object_id]


class GeometryWorkspace:
    """In-memory graph whose mutations are validated atomically before commit."""

    def __init__(self, document: GeometryDocument | None = None) -> None:
        self._lock = RLock()
        self._document = document or GeometryDocument(
            id="current_graph",
            title="Current construction",
            objects=[],
            viewport=GeometryViewport(),
        )
        GeometryGraph(self._document)
        self._revision = 0

    @property
    def revision(self) -> int:
        with self._lock:
            return self._revision

    def document_snapshot(self) -> GeometryDocument:
        with self._lock:
            return self._document.model_copy(deep=True)

    def graph_access_map(self) -> GraphAccessMap:
        with self._lock:
            return build_graph_access_map(self._document, revision=self._revision)

    def add_object(self, obj: GeometryObject) -> GraphAccessMap:
        """Validate a candidate document and commit only if the full graph is valid."""

        with self._lock:
            candidate = self._document.model_copy(
                update={"objects": [*self._document.objects, obj]},
                deep=True,
            )
            # Re-validate Pydantic invariants skipped by model_copy(update=...).
            candidate = GeometryDocument.model_validate(candidate.model_dump(by_alias=True))
            GeometryGraph(candidate)
            self._document = candidate
            self._revision += 1
            return self.graph_access_map()

    def replace_document(self, document: GeometryDocument) -> GraphAccessMap:
        """Validate and atomically replace the current construction."""

        with self._lock:
            candidate = GeometryDocument.model_validate(document.model_dump(by_alias=True))
            GeometryGraph(candidate)
            self._document = candidate.model_copy(deep=True)
            self._revision += 1
            return self.graph_access_map()

    def reset(self, document: GeometryDocument | None = None) -> None:
        """Reset workspace state; intended for isolated tests and local sessions."""

        with self._lock:
            self._document = document or GeometryDocument(
                id="current_graph",
                title="Current construction",
                objects=[],
                viewport=GeometryViewport(),
            )
            GeometryGraph(self._document)
            self._revision = 0


def build_graph_access_map(document: GeometryDocument, *, revision: int) -> GraphAccessMap:
    """Build an immutable access map from an independently validated document."""

    graph = GeometryGraph(document)
    values = graph.values
    by_id = {
        obj.id: GraphObjectAccess(
            object=obj.model_copy(deep=True),
            parent_ids=tuple(get_parent_ids(obj)),
            value=values[obj.id].model_copy(deep=True),
        )
        for obj in document.objects
    }
    return GraphAccessMap(
        document_id=document.id,
        revision=revision,
        by_id=by_id,
        id_by_label={obj.label: obj.id for obj in document.objects},
    )
