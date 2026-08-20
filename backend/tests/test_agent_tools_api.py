from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_agent_tool_discovery_endpoint() -> None:
    response = client.get("/agent/tools")

    assert response.status_code == 200
    tools = {item["name"]: item for item in response.json()}
    assert len(tools) == 38
    assert tools["create_point"]["mutatesGeometryState"] is True
    assert tools["get_current_graph"]["mutatesGeometryState"] is False
    assert tools["create_line"]["inputSchema"]["properties"]["pointA"]["type"] == "string"


def test_execute_tool_and_graph_endpoints_return_read_only_snapshots() -> None:
    first = client.post(
        "/agent/execute-tool",
        json={
            "toolName": "create_point",
            "arguments": {"objectId": "point_a", "label": "A", "x": 1, "y": 2},
        },
    )
    document = first.json()["document"]
    second = client.post(
        "/agent/execute-tool",
        json={
            "toolName": "create_point",
            "arguments": {"objectId": "point_b", "label": "B", "x": 3, "y": 4},
            "document": document,
        },
    )
    document = second.json()["document"]
    line = client.post(
        "/agent/execute-tool",
        json={
            "toolName": "create_line",
            "arguments": {"objectId": "line_ab", "label": "AB", "pointA": "A", "pointB": "B"},
            "document": document,
        },
    )
    document = line.json()["document"]

    assert first.status_code == second.status_code == line.status_code == 200
    assert line.json()["output"]["createdObject"]["definition"]["type"] == "through_points"
    # Each call now builds its own fresh, single-mutation workspace, so the
    # per-call "revision" in the output no longer accumulates across calls
    # the way it did against the old process-global workspace — it always
    # reports exactly the one mutation applied within that stateless request.
    assert first.json()["output"]["revision"] == 1
    assert second.json()["output"]["revision"] == 1
    assert line.json()["output"]["revision"] == 1

    graph = client.post("/geometry/graph", json={"document": document})
    assert graph.status_code == 200
    payload = graph.json()["graph"]
    # /geometry/graph performs no mutation, so its fresh read-only workspace
    # always reports revision 0 -- the accumulated construction is instead
    # verified below through the document's own id/label/parent bookkeeping.
    assert payload["revision"] == 0
    assert payload["idMap"] == {"point_a": 0, "point_b": 1, "line_ab": 2}
    assert payload["labelMap"] == {"A": "point_a", "B": "point_b", "AB": "line_ab"}
    assert payload["objects"][2]["parentIds"] == ["point_a", "point_b"]


def test_invalid_calls_return_errors_without_partial_mutation() -> None:
    # Seed a populated, non-empty document. The invalid calls below are fed
    # this SAME document, so if a future bug let a failed call commit partial
    # state (or fall back to some shared/global workspace instead of a fresh
    # per-request one), it would show up either as a leaked object/changed
    # error code here, or as a divergent result in the "replay" section below.
    seed = client.post(
        "/agent/execute-tool",
        json={
            "toolName": "create_point",
            "arguments": {"objectId": "point_a", "label": "A", "x": 1, "y": 2},
        },
    )
    assert seed.status_code == 200
    populated_document = seed.json()["document"]

    unknown = client.post(
        "/agent/execute-tool",
        json={"toolName": "unknown", "arguments": {}, "document": populated_document},
    )
    invalid_input = client.post(
        "/agent/execute-tool",
        json={
            "toolName": "create_point",
            "arguments": {"objectId": "point_b", "x": 0},
            "document": populated_document,
        },
    )
    invalid_reference = client.post(
        "/agent/execute-tool",
        json={
            "toolName": "create_line",
            "arguments": {"objectId": "line_ab", "pointA": "A", "pointB": "B"},
            "document": populated_document,
        },
    )

    assert unknown.status_code == 404
    assert unknown.json()["detail"]["code"] == "unknown_tool"
    assert invalid_input.status_code == 422
    assert invalid_input.json()["detail"]["code"] == "invalid_tool_arguments"
    assert invalid_reference.status_code == 422
    assert invalid_reference.json()["detail"]["code"] == "tool_execution_failed"

    # None of the failed calls ever produced a document: the error path raises
    # inside registry.execute() before router.execute_tool() builds an
    # ExecuteToolResponse (and thus before workspace.document_snapshot() is
    # ever called), so there is no output for a caller to (accidentally)
    # thread forward.
    assert "document" not in unknown.json()
    assert "document" not in invalid_input.json()
    assert "document" not in invalid_reference.json()

    # The atomicity property that actually matters in the stateless world:
    # replaying the ORIGINAL populated document, after all three failed calls,
    # behaves exactly as if those calls had never happened. Each
    # /agent/execute-tool request builds its own fresh workspace from the
    # supplied document, so a genuine bug here would be a regression back to
    # some shared/global workspace, or a handler that mutates state before
    # fully validating -- either would make this next call see extra objects,
    # a name collision, or an unexpected revision/object count.
    replay = client.post(
        "/agent/execute-tool",
        json={
            "toolName": "create_point",
            "arguments": {"objectId": "point_b", "label": "B", "x": 3, "y": 4},
            "document": populated_document,
        },
    )
    assert replay.status_code == 200
    assert replay.json()["output"]["revision"] == 1
    replay_document = replay.json()["document"]
    assert [obj["id"] for obj in replay_document["objects"]] == ["point_a", "point_b"]

    graph = client.post("/geometry/graph", json={"document": replay_document})
    assert graph.status_code == 200
    assert graph.json()["graph"]["idMap"] == {"point_a": 0, "point_b": 1}
