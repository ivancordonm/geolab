"""Canonical server-side rendering for GeoLab SVG and PNG exports."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from math import ceil, floor, log10
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFont

from app.agent.models import GraphView

WIDTH = 720
HEIGHT = 440
MARGIN = 34


@dataclass(frozen=True, slots=True)
class RenderBounds:
    min_x: float
    max_x: float
    min_y: float
    max_y: float


@dataclass(frozen=True, slots=True)
class RenderTransform:
    bounds: RenderBounds
    scale: float
    center_x: float
    center_y: float

    def point(self, x: float, y: float) -> tuple[float, float]:
        return (
            WIDTH / 2 + (x - self.center_x) * self.scale,
            HEIGHT / 2 - (y - self.center_y) * self.scale,
        )


def render_graph_svg(graph: GraphView) -> str:
    """Render a validated graph as a self-contained SVG document."""

    transform = _transform(graph)
    elements = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" '
        'role="img" aria-label="GeoLab geometric construction">',
        '<rect width="100%" height="100%" fill="#fbfcfe"/>',
    ]
    elements.extend(_svg_grid(transform))
    labels: list[tuple[float, float, str, str]] = []
    for item in graph.objects:
        if not item.object.visible or item.value.type == "undefined":
            continue
        color = item.object.style.color if item.object.style and item.object.style.color else "#2563eb"
        value = item.value
        if value.type == "line":
            endpoints = _line_endpoints(value.a, value.b, value.c, transform.bounds)
            if endpoints is not None:
                (x1, y1), (x2, y2) = endpoints
                sx1, sy1 = transform.point(x1, y1)
                sx2, sy2 = transform.point(x2, y2)
                elements.append(_svg_line(sx1, sy1, sx2, sy2, color))
        elif value.type == "segment":
            x1, y1 = transform.point(value.start.x, value.start.y)
            x2, y2 = transform.point(value.end.x, value.end.y)
            elements.append(_svg_line(x1, y1, x2, y2, color))
        elif value.type == "circle":
            cx, cy = transform.point(value.center.x, value.center.y)
            elements.append(
                f'<circle cx="{cx:.3f}" cy="{cy:.3f}" r="{value.radius * transform.scale:.3f}" '
                f'fill="none" stroke="{escape(color)}" stroke-width="2.25"/>'
            )
        elif value.type == "point":
            x, y = transform.point(value.x, value.y)
            labels.append((x, y, item.object.label, color))
    for x, y, label, color in labels:
        elements.append(
            f'<circle cx="{x:.3f}" cy="{y:.3f}" r="5" fill="{escape(color)}" '
            'stroke="#fff" stroke-width="1.5"/>'
        )
        elements.append(
            f'<text x="{x + 8:.3f}" y="{y - 8:.3f}" fill="#172033" font-size="12" '
            f'font-family="system-ui,sans-serif" font-weight="650">{escape(label)}</text>'
        )
    elements.append("</svg>")
    return "".join(elements)


def render_graph_png(graph: GraphView) -> bytes:
    """Render the same canonical scene as an inline PNG."""

    transform = _transform(graph)
    image = Image.new("RGB", (WIDTH, HEIGHT), "#fbfcfe")
    draw = ImageDraw.Draw(image)
    _draw_grid(draw, transform)
    points: list[tuple[float, float, str, str]] = []
    for item in graph.objects:
        if not item.object.visible or item.value.type == "undefined":
            continue
        color = item.object.style.color if item.object.style and item.object.style.color else "#2563eb"
        value = item.value
        if value.type == "line":
            endpoints = _line_endpoints(value.a, value.b, value.c, transform.bounds)
            if endpoints is not None:
                draw.line([transform.point(*endpoints[0]), transform.point(*endpoints[1])], fill=color, width=2)
        elif value.type == "segment":
            draw.line(
                [transform.point(value.start.x, value.start.y), transform.point(value.end.x, value.end.y)],
                fill=color,
                width=2,
            )
        elif value.type == "circle":
            cx, cy = transform.point(value.center.x, value.center.y)
            radius = value.radius * transform.scale
            draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=color, width=2)
        elif value.type == "point":
            x, y = transform.point(value.x, value.y)
            points.append((x, y, item.object.label, color))
    font = ImageFont.load_default()
    for x, y, label, color in points:
        draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=color, outline="white", width=1)
        draw.text((x + 8, y - 14), label, fill="#172033", font=font)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _transform(graph: GraphView) -> RenderTransform:
    bounds = _bounds(graph)
    scale = min(
        (WIDTH - 2 * MARGIN) / (bounds.max_x - bounds.min_x),
        (HEIGHT - 2 * MARGIN) / (bounds.max_y - bounds.min_y),
    )
    return RenderTransform(
        bounds=bounds,
        scale=scale,
        center_x=(bounds.min_x + bounds.max_x) / 2,
        center_y=(bounds.min_y + bounds.max_y) / 2,
    )


def _bounds(graph: GraphView) -> RenderBounds:
    xs: list[float] = []
    ys: list[float] = []
    for item in graph.objects:
        if not item.object.visible or item.value.type == "undefined":
            continue
        value = item.value
        if value.type == "point":
            xs.append(value.x)
            ys.append(value.y)
        elif value.type == "segment":
            xs.extend((value.start.x, value.end.x))
            ys.extend((value.start.y, value.end.y))
        elif value.type == "circle":
            xs.extend((value.center.x - value.radius, value.center.x + value.radius))
            ys.extend((value.center.y - value.radius, value.center.y + value.radius))
    if not xs:
        return RenderBounds(-5, 5, -4, 4)
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    if max_x - min_x < 2:
        min_x -= 1
        max_x += 1
    if max_y - min_y < 2:
        min_y -= 1
        max_y += 1
    padding = max(max_x - min_x, max_y - min_y) * 0.16
    return RenderBounds(min_x - padding, max_x + padding, min_y - padding, max_y + padding)


def _line_endpoints(
    a: float,
    b: float,
    c: float,
    bounds: RenderBounds,
) -> tuple[tuple[float, float], tuple[float, float]] | None:
    candidates: list[tuple[float, float]] = []

    def add(x: float, y: float) -> None:
        if (
            bounds.min_x - 1e-7 <= x <= bounds.max_x + 1e-7
            and bounds.min_y - 1e-7 <= y <= bounds.max_y + 1e-7
            and all(abs(px - x) > 1e-7 or abs(py - y) > 1e-7 for px, py in candidates)
        ):
            candidates.append((x, y))

    if abs(b) > 1e-12:
        add(bounds.min_x, -(a * bounds.min_x + c) / b)
        add(bounds.max_x, -(a * bounds.max_x + c) / b)
    if abs(a) > 1e-12:
        add(-(b * bounds.min_y + c) / a, bounds.min_y)
        add(-(b * bounds.max_y + c) / a, bounds.max_y)
    return (candidates[0], candidates[1]) if len(candidates) >= 2 else None


def _grid_step(transform: RenderTransform) -> float:
    raw = 70 / transform.scale
    power = 10 ** floor(log10(raw))
    return next(candidate * power for candidate in (1, 2, 5, 10) if candidate * power >= raw)


def _svg_grid(transform: RenderTransform) -> list[str]:
    elements: list[str] = []
    step = _grid_step(transform)
    x = ceil(transform.bounds.min_x / step) * step
    while x <= transform.bounds.max_x:
        sx, _ = transform.point(x, 0)
        elements.append(_svg_line(sx, MARGIN, sx, HEIGHT - MARGIN, "#a8b0c0" if abs(x) < 1e-9 else "#e8ebf1", 1.25 if abs(x) < 1e-9 else 1))
        x += step
    y = ceil(transform.bounds.min_y / step) * step
    while y <= transform.bounds.max_y:
        _, sy = transform.point(0, y)
        elements.append(_svg_line(MARGIN, sy, WIDTH - MARGIN, sy, "#a8b0c0" if abs(y) < 1e-9 else "#e8ebf1", 1.25 if abs(y) < 1e-9 else 1))
        y += step
    return elements


def _draw_grid(draw: ImageDraw.ImageDraw, transform: RenderTransform) -> None:
    step = _grid_step(transform)
    x = ceil(transform.bounds.min_x / step) * step
    while x <= transform.bounds.max_x:
        sx, _ = transform.point(x, 0)
        draw.line((sx, MARGIN, sx, HEIGHT - MARGIN), fill="#a8b0c0" if abs(x) < 1e-9 else "#e8ebf1", width=1)
        x += step
    y = ceil(transform.bounds.min_y / step) * step
    while y <= transform.bounds.max_y:
        _, sy = transform.point(0, y)
        draw.line((MARGIN, sy, WIDTH - MARGIN, sy), fill="#a8b0c0" if abs(y) < 1e-9 else "#e8ebf1", width=1)
        y += step


def _svg_line(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    color: str,
    width: float = 2.25,
) -> str:
    return (
        f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" '
        f'stroke="{escape(color)}" stroke-width="{width}"/>'
    )
