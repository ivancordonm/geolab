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
    assert len(tools) == 19
    assert "get_current_graph" not in tools
    assert tools["render_current_graph"]["annotations"]["readOnlyHint"] is True
    assert "Always use this tool" in tools["render_current_graph"]["description"]
    assert tools["create_point"]["annotations"]["readOnlyHint"] is False
    assert tools["evaluate_script"]["annotations"]["destructiveHint"] is True
    assert tools["render_current_graph"]["_meta"]["ui"]["resourceUri"] == GEOMETRY_WIDGET_URI
    assert "_meta" not in tools["validate_construction"]
    assert "does not render" in tools["validate_construction"]["description"].lower()
    assert tools["create_line"]["inputSchema"]["required"] == [
        "object_id",
        "point_a",
        "point_b",
    ]
    selector = tools["create_circle_circle_intersection"]["inputSchema"]["properties"]["selector"]
    assert selector["enum"] == ["upper", "lower", "left", "right"]


def call_tool(
    client: TestClient,
    name: str,
    arguments: dict[str, Any],
    request_id: int,
) -> dict[str, Any]:
    response = rpc(
        client,
        "tools/call",
        {"name": name, "arguments": arguments},
        request_id=request_id,
    )
    assert response.status_code == 200
    result = response.json()["result"]
    assert result["isError"] is False
    return result


def test_mcp_tools_chain_documents_without_touching_global_workspace(
    mcp_client: TestClient,
) -> None:
    first = call_tool(
        mcp_client,
        "create_point",
        {"object_id": "A", "x": 0, "y": 0},
        3,
    )
    document = first["structuredContent"]["document"]
    second = call_tool(
        mcp_client,
        "create_point",
        {"object_id": "B", "x": 4, "y": 0, "document": document},
        4,
    )
    assert [item["id"] for item in second["structuredContent"]["document"]["objects"]] == [
        "A",
        "B",
    ]
    assert geometry_workspace.document_snapshot().objects == []


def test_mcp_constructs_validates_and_renders_equilateral_triangle(
    mcp_client: TestClient,
) -> None:
    document: dict[str, Any] | None = None
    calls = [
        ("create_point", {"object_id": "A", "x": 0, "y": 0}),
        ("create_point", {"object_id": "B", "x": 4, "y": 0}),
        ("create_circle", {"object_id": "cA", "center": "A", "point": "B"}),
        ("create_circle", {"object_id": "cB", "center": "B", "point": "A"}),
        (
            "create_circle_circle_intersection",
            {"object_id": "C", "circle_a": "cA", "circle_b": "cB", "selector": "upper"},
        ),
        ("create_segment", {"object_id": "AB", "point_a": "A", "point_b": "B"}),
        ("create_segment", {"object_id": "AC", "point_a": "A", "point_b": "C"}),
        ("create_segment", {"object_id": "BC", "point_a": "B", "point_b": "C"}),
    ]
    for request_id, (name, arguments) in enumerate(calls, start=10):
        if document is not None:
            arguments["document"] = document
        result = call_tool(mcp_client, name, arguments, request_id)
        document = result["structuredContent"]["document"]

    assert document is not None
    validation = call_tool(mcp_client, "validate_construction", {"document": document}, 30)
    assert validation["structuredContent"]["valid"] is True
    rendered = call_tool(mcp_client, "render_current_graph", {"document": document}, 31)
    assert rendered["structuredContent"]["svg"].startswith("<svg")
    assert "GeoLab geometric construction" in rendered["structuredContent"]["svg"]


def test_mcp_inline_exports(mcp_client: TestClient) -> None:
    created = call_tool(
        mcp_client,
        "create_point",
        {"object_id": "A", "x": 1, "y": 2},
        40,
    )
    document = created["structuredContent"]["document"]
    svg = call_tool(mcp_client, "export_svg", {"document": document}, 41)
    png = call_tool(mcp_client, "export_png", {"document": document}, 42)
    exported_json = call_tool(mcp_client, "export_json", {"document": document}, 43)
    assert svg["content"][1]["resource"]["mimeType"] == "image/svg+xml"
    assert png["content"][0]["mimeType"] == "image/png"
    assert exported_json["content"][0]["resource"]["mimeType"] == "application/json"


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
