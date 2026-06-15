"""Stateless MCP adapter exposing deterministic GeoLab geometry tools."""

from __future__ import annotations

import base64
from typing import Any, Literal

from mcp.server.fastmcp import FastMCP
from mcp.types import (
    CallToolResult,
    EmbeddedResource,
    ImageContent,
    TextContent,
    TextResourceContents,
    ToolAnnotations,
)

from app.agent.tools import create_geometry_tool_registry, graph_view_from_access_map
from app.geometry.models import GeometryDocument, GeometryViewport
from app.geometry.rendering import render_graph_png, render_graph_svg
from app.geometry.script import evaluate_script as evaluate_geometry_script
from app.geometry.workspace import GeometryWorkspace
from app.mcp_widget import GEOMETRY_WIDGET_HTML, GEOMETRY_WIDGET_MIME_TYPE, GEOMETRY_WIDGET_URI

mcp = FastMCP(
    "GeoLab",
    instructions=(
        "GeoLab is a deterministic Euclidean geometry engine. Every creation tool is stateless: "
        "pass document=null to start, then pass the exact returned document to the next tool. "
        "Never calculate derived intersection coordinates manually; use the explicit intersection "
        "tools. Validate the final document, then always call render_current_graph when the user "
        "asks to show, draw, display, or visualize the figure."
    ),
    website_url="https://geolab-seven.vercel.app",
    host="0.0.0.0",
    json_response=True,
    stateless_http=True,
    streamable_http_path="/mcp",
)

READ_ONLY = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)
CREATE = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=False,
    idempotentHint=False,
    openWorldHint=False,
)
REPLACE_GRAPH = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=True,
    idempotentHint=True,
    openWorldHint=False,
)
WIDGET_META = {"ui": {"resourceUri": GEOMETRY_WIDGET_URI}}


@mcp.resource(
    GEOMETRY_WIDGET_URI,
    name="GeoLab geometry viewer",
    title="GeoLab geometry viewer",
    description="SVG rendering of a validated GeoLab construction.",
    mime_type=GEOMETRY_WIDGET_MIME_TYPE,
    meta={"ui": {"prefersBorder": True, "csp": {"connectDomains": [], "resourceDomains": []}}},
)
def geometry_widget() -> str:
    return GEOMETRY_WIDGET_HTML


def _new_document() -> GeometryDocument:
    return GeometryDocument(
        id="chatgpt_construction",
        title="ChatGPT construction",
        objects=[],
        viewport=GeometryViewport(),
    )


def _workspace(document: GeometryDocument | None) -> GeometryWorkspace:
    return GeometryWorkspace(document or _new_document())


def _mutate(
    document: GeometryDocument | None,
    tool_name: str,
    arguments: dict[str, object],
) -> dict[str, Any]:
    workspace = _workspace(document)
    registry = create_geometry_tool_registry(workspace)
    _, output = registry.execute(tool_name, arguments)
    return {
        **output.model_dump(by_alias=True),
        "document": workspace.document_snapshot().model_dump(by_alias=True),
    }


@mcp.tool(annotations=CREATE)
def create_point(
    object_id: str,
    x: float,
    y: float,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a free point. Pass the returned document to the next construction tool."""

    return _mutate(document, "create_point", {"objectId": object_id, "label": label, "x": x, "y": y})


@mcp.tool(annotations=CREATE)
def create_line(
    object_id: str,
    point_a: str,
    point_b: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a line through two points in the supplied document."""

    return _mutate(document, "create_line", {"objectId": object_id, "label": label, "pointA": point_a, "pointB": point_b})


@mcp.tool(annotations=CREATE)
def create_segment(
    object_id: str,
    point_a: str,
    point_b: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a segment between two points in the supplied document."""

    return _mutate(document, "create_segment", {"objectId": object_id, "label": label, "pointA": point_a, "pointB": point_b})


@mcp.tool(annotations=CREATE)
def create_circle(
    object_id: str,
    center: str,
    point: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a circle centered at one point and passing through another."""

    return _mutate(document, "create_circle", {"objectId": object_id, "label": label, "center": center, "point": point})


@mcp.tool(annotations=CREATE)
def create_midpoint(
    object_id: str,
    point_a: str,
    point_b: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create the midpoint of two points without calculating coordinates manually."""

    return _mutate(document, "create_midpoint", {"objectId": object_id, "label": label, "pointA": point_a, "pointB": point_b})


@mcp.tool(annotations=CREATE)
def create_parallel_line(
    object_id: str,
    point: str,
    line: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a line through a point parallel to an existing line."""

    return _mutate(document, "create_parallel_line", {"objectId": object_id, "label": label, "point": point, "line": line})


@mcp.tool(annotations=CREATE)
def create_perpendicular_line(
    object_id: str,
    point: str,
    line: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a line through a point perpendicular to an existing line."""

    return _mutate(document, "create_perpendicular_line", {"objectId": object_id, "label": label, "point": point, "line": line})


@mcp.tool(annotations=CREATE)
def create_line_line_intersection(
    object_id: str,
    line_a: str,
    line_b: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create the exact intersection point of two lines; never approximate its coordinates."""

    return _mutate(document, "create_line_line_intersection", {"objectId": object_id, "label": label, "lineA": line_a, "lineB": line_b})


@mcp.tool(annotations=CREATE)
def create_circle_line_intersection(
    object_id: str,
    circle: str,
    line: str,
    selector: Literal["first", "second", "left", "right"],
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create one exact circle-line intersection selected by first, second, left, or right."""

    return _mutate(document, "create_circle_line_intersection", {"objectId": object_id, "label": label, "circle": circle, "line": line, "selector": selector})


@mcp.tool(annotations=CREATE)
def create_circle_circle_intersection(
    object_id: str,
    circle_a: str,
    circle_b: str,
    selector: Literal["upper", "lower", "left", "right"],
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create one exact circle-circle intersection selected by upper, lower, left, or right."""

    return _mutate(document, "create_circle_circle_intersection", {"objectId": object_id, "label": label, "circleA": circle_a, "circleB": circle_b, "selector": selector})


@mcp.tool(annotations=CREATE)
def create_perpendicular_bisector(
    object_id: str,
    point_a: str,
    point_b: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create the perpendicular bisector of two existing points."""

    return _mutate(document, "create_perpendicular_bisector", {"objectId": object_id, "label": label, "pointA": point_a, "pointB": point_b})


@mcp.tool(annotations=CREATE)
def create_angle_bisector(
    object_id: str,
    arm_a: str,
    vertex: str,
    arm_b: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create the angle bisector defined by arm point, vertex, and arm point."""

    return _mutate(document, "create_angle_bisector", {"objectId": object_id, "label": label, "pointA": arm_a, "pointB": vertex, "pointC": arm_b})


@mcp.tool(annotations=CREATE)
def create_circumcircle(
    object_id: str,
    point_a: str,
    point_b: str,
    point_c: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create the exact circle through three non-collinear points."""

    return _mutate(document, "create_circumcircle", {"objectId": object_id, "label": label, "pointA": point_a, "pointB": point_b, "pointC": point_c})


@mcp.tool(
    description="Checks geometric consistency only. Does not render anything.",
    annotations=READ_ONLY,
)
def validate_construction(document: GeometryDocument) -> dict[str, Any]:
    workspace = _workspace(document)
    graph = graph_view_from_access_map(workspace.graph_access_map())
    return {"valid": True, "document": document.model_dump(by_alias=True), "graph": graph.model_dump(by_alias=True)}


@mcp.tool(annotations=REPLACE_GRAPH)
def evaluate_script(
    script: str,
    document_id: str = "script_document",
    title: str = "Script construction",
) -> dict[str, Any]:
    """Evaluate a complete deterministic script and return its document without rendering it."""

    document, _ = evaluate_geometry_script(script, document_id=document_id, title=title)
    workspace = GeometryWorkspace(document)
    graph = graph_view_from_access_map(workspace.graph_access_map())
    return {"document": document.model_dump(by_alias=True), "graph": graph.model_dump(by_alias=True)}


@mcp.tool(
    description=(
        "Returns the current graph and triggers the SVG viewer. Always use this tool after "
        "finishing a construction when the user asks to show, draw, display, or visualize a figure."
    ),
    annotations=READ_ONLY,
    meta=WIDGET_META,
)
def render_current_graph(document: GeometryDocument) -> dict[str, Any]:
    workspace = _workspace(document)
    graph = graph_view_from_access_map(workspace.graph_access_map())
    return {
        "document": document.model_dump(by_alias=True),
        "graph": graph.model_dump(by_alias=True),
        "svg": render_graph_svg(graph),
    }


@mcp.tool(annotations=READ_ONLY)
def export_svg(document: GeometryDocument) -> CallToolResult:
    """Export the validated construction as inline SVG content."""

    graph = graph_view_from_access_map(_workspace(document).graph_access_map())
    svg = render_graph_svg(graph)
    return CallToolResult(
        content=[
            TextContent(type="text", text="GeoLab SVG export"),
            EmbeddedResource(
                type="resource",
                resource=TextResourceContents(
                    uri=f"geolab://exports/{document.id}.svg",
                    mimeType="image/svg+xml",
                    text=svg,
                ),
            ),
        ]
    )


@mcp.tool(annotations=READ_ONLY)
def export_png(document: GeometryDocument) -> CallToolResult:
    """Export the validated construction as inline PNG image content."""

    graph = graph_view_from_access_map(_workspace(document).graph_access_map())
    encoded = base64.b64encode(render_graph_png(graph)).decode("ascii")
    return CallToolResult(content=[ImageContent(type="image", data=encoded, mimeType="image/png")])


@mcp.tool(annotations=READ_ONLY)
def export_json(document: GeometryDocument) -> CallToolResult:
    """Export the validated versioned GeoLab document as inline JSON content."""

    validated = _workspace(document).document_snapshot()
    payload = validated.model_dump_json(by_alias=True, indent=2)
    return CallToolResult(
        content=[
            EmbeddedResource(
                type="resource",
                resource=TextResourceContents(
                    uri=f"geolab://exports/{validated.id}.json",
                    mimeType="application/json",
                    text=payload,
                ),
            )
        ]
    )


mcp_http_app = mcp.streamable_http_app()
