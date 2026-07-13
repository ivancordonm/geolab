"""Concurrency-safety tests for the stateless /geometry/graph and
/agent/execute-tool endpoints.

Task 5 removed the process-global ``geometry_workspace`` singleton so that
two callers hitting these endpoints with different documents can no longer
corrupt each other's state. The most direct way to demonstrate the absence
of shared state is to fire real concurrent requests carrying two distinct
documents from multiple threads and confirm each response only ever reflects
its own request's document — never the other caller's. We use a
``ThreadPoolExecutor`` (rather than ``asyncio.gather`` against an
``AsyncClient``) because FastAPI's ``TestClient`` dispatches synchronous
route handlers onto worker threads already (see ``tests/conftest.py``), so
real OS-thread concurrency is a faithful, dependency-free stand-in for two
simultaneous HTTP callers and avoids pulling in async test wiring the rest
of this suite doesn't use.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_point(object_id: str, label: str, x: float, y: float) -> dict:
    response = client.post(
        "/agent/execute-tool",
        json={
            "toolName": "create_point",
            "arguments": {"objectId": object_id, "label": label, "x": x, "y": y},
        },
    )
    assert response.status_code == 200
    return response.json()["document"]


def test_concurrent_graph_requests_with_different_documents_dont_interfere() -> None:
    """Two distinct documents, queried concurrently, must not leak into each other."""

    doc_a = _create_point("point_a", "A", 1, 2)
    doc_b = _create_point("point_z", "Z", -9, 5)
    assert doc_a["id"] != doc_b["id"] or doc_a["objects"] != doc_b["objects"]

    def fetch_graph(document: dict) -> dict:
        response = client.post("/geometry/graph", json={"document": document})
        assert response.status_code == 200
        return response.json()

    # Interleave many requests across both documents from multiple threads so
    # a shared-state bug (e.g. a reintroduced global workspace) would show up
    # as a request returning the other document's objects.
    documents = [doc_a, doc_b] * 25
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(fetch_graph, documents))

    for requested_document, result in zip(documents, results):
        assert result["document"]["objects"] == requested_document["objects"]
        assert result["graph"]["idMap"] == (
            {"point_a": 0} if requested_document is doc_a else {"point_z": 0}
        )


def test_concurrent_execute_tool_calls_build_independent_documents() -> None:
    """Two independent construction chains, interleaved, must stay isolated."""

    def build_chain(seed: int) -> dict:
        document = None
        for index in range(5):
            payload = {
                "toolName": "create_point",
                "arguments": {
                    "objectId": f"seed{seed}_p{index}",
                    "x": float(seed * 10 + index),
                    "y": float(index),
                },
            }
            if document is not None:
                payload["document"] = document
            response = client.post("/agent/execute-tool", json=payload)
            assert response.status_code == 200
            document = response.json()["document"]
        return document

    with ThreadPoolExecutor(max_workers=4) as pool:
        final_documents = list(pool.map(build_chain, [1, 2, 3, 4]))

    for seed, document in zip([1, 2, 3, 4], final_documents):
        ids = [obj["id"] for obj in document["objects"]]
        assert ids == [f"seed{seed}_p{index}" for index in range(5)]
