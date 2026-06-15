from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.mcp_widget import GEOMETRY_WIDGET_MIME_TYPE, GEOMETRY_WIDGET_URI
from app.services import geometry_workspace

MCP_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}


@pytest.fixture(scope="module")
def mcp_client() -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client


@pytest.fixture(autouse=True)
def reset_workspace() -> None:
    geometry_workspace.reset()


def rpc(client: TestClient, method: str, params: dict[str, Any], request_id: int = 1):
    return client.post(
        "/mcp",
        headers=MCP_HEADERS,
        json={"jsonrpc": "2.0", "id": request_id, "method": method, "params": params},
    )


def test_mcp_initializes_at_exact_public_endpoint(mcp_client: TestClient) -> None:
    response = rpc(
        mcp_client,
        "initialize",
        {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "geolab-tests", "version": "1.0"},
        },
    )

    assert response.status_code == 200
    assert response.history == []
    payload = response.json()["result"]
    assert payload["serverInfo"]["name"] == "GeoLab"
    assert payload["capabilities"]["tools"]["listChanged"] is False


def test_mcp_lists_registered_tools_with_safety_annotations(mcp_client: TestClient) -> None:
    response = rpc(mcp_client, "tools/list", {}, request_id=2)

    assert response.status_code == 200
    tools = {tool["name"]: tool for tool in response.json()["result"]["tools"]}
    assert len(tools) == 10
    assert tools["get_current_graph"]["annotations"]["readOnlyHint"] is True
    assert tools["get_current_graph"]["description"] == (
        "Returns the current validated geometry graph and triggers the GeoLab SVG widget "
        "inside ChatGPT to render the construction visually."
    )
    assert tools["create_point"]["annotations"]["readOnlyHint"] is False
    assert tools["evaluate_script"]["annotations"]["destructiveHint"] is True
    assert tools["get_current_graph"]["_meta"]["ui"]["resourceUri"] == GEOMETRY_WIDGET_URI
    assert tools["create_line"]["inputSchema"]["required"] == [
        "object_id",
        "point_a",
        "point_b",
    ]


def test_mcp_tool_call_uses_existing_validated_registry(mcp_client: TestClient) -> None:
    response = rpc(
        mcp_client,
        "tools/call",
        {
            "name": "create_point",
            "arguments": {"object_id": "point_a", "label": "A", "x": 1, "y": 2},
        },
        request_id=3,
    )

    assert response.status_code == 200
    result = response.json()["result"]
    assert result["isError"] is False
    assert result["structuredContent"]["revision"] == 1
    assert result["structuredContent"]["createdObject"]["label"] == "A"
    assert geometry_workspace.document_snapshot().objects[0].id == "point_a"


def test_mcp_exposes_svg_widget_resource(mcp_client: TestClient) -> None:
    listed = rpc(mcp_client, "resources/list", {}, request_id=4)
    assert listed.status_code == 200
    resources = listed.json()["result"]["resources"]
    widget = next(resource for resource in resources if resource["uri"] == GEOMETRY_WIDGET_URI)
    assert widget["mimeType"] == GEOMETRY_WIDGET_MIME_TYPE
    assert widget["_meta"]["ui"]["prefersBorder"] is True

    read = rpc(mcp_client, "resources/read", {"uri": GEOMETRY_WIDGET_URI}, request_id=5)
    assert read.status_code == 200
    content = read.json()["result"]["contents"][0]
    assert content["mimeType"] == GEOMETRY_WIDGET_MIME_TYPE
    assert content["_meta"]["ui"]["csp"] == {"connectDomains": [], "resourceDomains": []}
    assert "ui/notifications/tool-result" in content["text"]
    assert "<svg" not in content["text"]  # SVG is generated safely from structured data.
