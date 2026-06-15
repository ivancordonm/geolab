"""MCP adapter exposing GeoLab's deterministic geometry tools to ChatGPT."""

from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations

from app.services import tool_registry


mcp = FastMCP(
    "GeoLab",
    instructions=(
        "Use GeoLab tools for deterministic Euclidean geometry. Read the current graph before "
        "adding objects that reference existing points or lines. Prefer evaluate_script when a "
        "complete construction can be expressed atomically. Validate constructions before making "
        "mathematical claims about them."
    ),
    website_url="https://geolab-seven.vercel.app",
    host="0.0.0.0",
    json_response=True,
    stateless_http=True,
    streamable_http_path="/mcp",
)


def _execute(tool_name: str, arguments: dict[str, object]) -> dict[str, Any]:
    """Execute a registered domain tool and return its validated output model."""

    _, output = tool_registry.execute(tool_name, arguments)
    return output.model_dump(by_alias=True)


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


@mcp.tool(annotations=CREATE)
def create_point(
    object_id: str,
    x: float,
    y: float,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a free point with finite Cartesian coordinates."""

    return _execute(
        "create_point",
        {"objectId": object_id, "label": label, "x": x, "y": y},
    )


@mcp.tool(annotations=CREATE)
def create_line(
    object_id: str,
    point_a: str,
    point_b: str,
    label: str | None = None,
) -> dict[str, Any]:
    """Create an infinite line through two existing points, referenced by ID or label."""

    return _execute(
        "create_line",
        {"objectId": object_id, "label": label, "pointA": point_a, "pointB": point_b},
    )


@mcp.tool(annotations=CREATE)
def create_segment(
    object_id: str,
    point_a: str,
    point_b: str,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a segment between two existing points, referenced by ID or label."""

    return _execute(
        "create_segment",
        {"objectId": object_id, "label": label, "pointA": point_a, "pointB": point_b},
    )


@mcp.tool(annotations=CREATE)
def create_circle(
    object_id: str,
    center: str,
    point: str,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a circle using an existing center and an existing point on the circle."""

    return _execute(
        "create_circle",
        {"objectId": object_id, "label": label, "center": center, "point": point},
    )


@mcp.tool(annotations=CREATE)
def create_midpoint(
    object_id: str,
    point_a: str,
    point_b: str,
    label: str | None = None,
) -> dict[str, Any]:
    """Create the midpoint of two existing points."""

    return _execute(
        "create_midpoint",
        {"objectId": object_id, "label": label, "pointA": point_a, "pointB": point_b},
    )


@mcp.tool(annotations=CREATE)
def create_parallel_line(
    object_id: str,
    point: str,
    line: str,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a line through an existing point parallel to an existing line."""

    return _execute(
        "create_parallel_line",
        {"objectId": object_id, "label": label, "point": point, "line": line},
    )


@mcp.tool(annotations=CREATE)
def create_perpendicular_line(
    object_id: str,
    point: str,
    line: str,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a line through an existing point perpendicular to an existing line."""

    return _execute(
        "create_perpendicular_line",
        {"objectId": object_id, "label": label, "point": point, "line": line},
    )


@mcp.tool(annotations=READ_ONLY)
def validate_construction(document: dict[str, Any] | None = None) -> dict[str, Any]:
    """Validate a supplied GeoLab document, or the current graph when omitted."""

    arguments: dict[str, object] = {}
    if document is not None:
        arguments["document"] = document
    return _execute("validate_construction", arguments)


@mcp.tool(annotations=REPLACE_GRAPH)
def evaluate_script(
    script: str,
    document_id: str = "script_document",
    title: str = "Script construction",
) -> dict[str, Any]:
    """Parse a GeoLab construction script and atomically replace the current graph if valid."""

    return _execute(
        "evaluate_script",
        {"script": script, "documentId": document_id, "title": title},
    )


@mcp.tool(annotations=READ_ONLY)
def get_current_graph() -> dict[str, Any]:
    """Return the current validated geometry graph, including values and dependency indexes."""

    return _execute("get_current_graph", {})


mcp_http_app = mcp.streamable_http_app()
