import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import geometry_workspace

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_workspace() -> None:
    geometry_workspace.reset()


def test_agent_tool_discovery_endpoint() -> None:
    response = client.get("/agent/tools")

    assert response.status_code == 200
    tools = {item["name"]: item for item in response.json()}
    assert len(tools) == 10
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
    second = client.post(
        "/agent/execute-tool",
        json={
            "toolName": "create_point",
            "arguments": {"objectId": "point_b", "label": "B", "x": 3, "y": 4},
        },
    )
    line = client.post(
        "/agent/execute-tool",
        json={
            "toolName": "create_line",
            "arguments": {"objectId": "line_ab", "label": "AB", "pointA": "A", "pointB": "B"},
        },
    )

    assert first.status_code == second.status_code == line.status_code == 200
    assert line.json()["output"]["createdObject"]["definition"]["type"] == "through_points"

    graph = client.get("/geometry/graph")
    assert graph.status_code == 200
    payload = graph.json()
    assert payload["revision"] == 3
    assert payload["idMap"] == {"point_a": 0, "point_b": 1, "line_ab": 2}
    assert payload["labelMap"] == {"A": "point_a", "B": "point_b", "AB": "line_ab"}
    assert payload["objects"][2]["parentIds"] == ["point_a", "point_b"]


def test_invalid_calls_return_errors_without_partial_mutation() -> None:
    unknown = client.post(
        "/agent/execute-tool",
        json={"toolName": "unknown", "arguments": {}},
    )
    invalid_input = client.post(
        "/agent/execute-tool",
        json={"toolName": "create_point", "arguments": {"objectId": "A", "x": 0}},
    )
    invalid_reference = client.post(
        "/agent/execute-tool",
        json={
            "toolName": "create_line",
            "arguments": {"objectId": "AB", "pointA": "A", "pointB": "B"},
        },
    )

    assert unknown.status_code == 404
    assert unknown.json()["detail"]["code"] == "unknown_tool"
    assert invalid_input.status_code == 422
    assert invalid_input.json()["detail"]["code"] == "invalid_tool_arguments"
    assert invalid_reference.status_code == 422
    assert invalid_reference.json()["detail"]["code"] == "tool_execution_failed"
    assert client.get("/geometry/graph").json()["revision"] == 0

