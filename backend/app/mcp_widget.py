"""Inline MCP App widget that renders GeoLab graph results as SVG."""

GEOMETRY_WIDGET_URI = "ui://widget/geolab-geometry-v2.html"
GEOMETRY_WIDGET_MIME_TYPE = "text/html;profile=mcp-app"

GEOMETRY_WIDGET_HTML = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 12px; background: transparent; color: #172033; }
    .card { overflow: hidden; border: 1px solid #d7dce5; border-radius: 14px; background: #fff; }
    .header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
      padding: 11px 14px; border-bottom: 1px solid #e6e9ef; }
    .title { font-size: 14px; font-weight: 700; }
    .meta { font-size: 11px; color: #657087; }
    svg { display: block; width: 100%; min-height: 280px; background: #fbfcfe; }
    .empty { display: grid; min-height: 220px; place-items: center; padding: 24px; color: #657087; }
    .grid { stroke: #e8ebf1; stroke-width: 1; }
    .axis { stroke: #a8b0c0; stroke-width: 1.25; }
    .geometry { fill: none; stroke: #2563eb; stroke-width: 2.25; vector-effect: non-scaling-stroke; }
    .point { fill: #2563eb; stroke: #fff; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
    .label { fill: #172033; font-size: 12px; font-weight: 650; paint-order: stroke;
      stroke: #fff; stroke-width: 3px; stroke-linejoin: round; }
    @media (prefers-color-scheme: dark) {
      body { color: #eef2ff; }
      .card { border-color: #343b4a; background: #171a21; }
      .header { border-color: #303644; }
      .meta, .empty { color: #aab2c3; }
      svg { background: #11141a; }
      .grid { stroke: #242a35; }
      .axis { stroke: #596274; }
      .geometry { stroke: #60a5fa; }
      .point { fill: #60a5fa; stroke: #11141a; }
      .label { fill: #eef2ff; stroke: #11141a; }
    }
  </style>
</head>
<body>
  <section class="card">
    <header class="header">
      <span class="title">GeoLab construction</span>
      <span class="meta" id="meta">Waiting for geometry…</span>
    </header>
    <div id="canvas" class="empty">The geometric figure will appear here.</div>
  </section>
  <script>
    const WIDTH = 720, HEIGHT = 440, MARGIN = 34;
    const canvas = document.getElementById("canvas");
    const meta = document.getElementById("meta");
    const svgNS = "http://www.w3.org/2000/svg";

    function el(name, attrs = {}) {
      const node = document.createElementNS(svgNS, name);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      return node;
    }

    function graphFrom(data) {
      if (!data || typeof data !== "object") return null;
      return data.graph || (data.documentId && Array.isArray(data.objects) ? data : null);
    }

    function finite(value) { return Number.isFinite(value); }

    function boundsFor(objects) {
      const xs = [], ys = [];
      const add = (x, y) => { if (finite(x) && finite(y)) { xs.push(x); ys.push(y); } };
      for (const item of objects) {
        const value = item.value || {};
        if (value.type === "point") add(value.x, value.y);
        if (value.type === "segment") { add(value.start?.x, value.start?.y); add(value.end?.x, value.end?.y); }
        if (value.type === "circle" && finite(value.radius)) {
          add(value.center.x - value.radius, value.center.y - value.radius);
          add(value.center.x + value.radius, value.center.y + value.radius);
        }
      }
      if (!xs.length) return { minX: -5, maxX: 5, minY: -4, maxY: 4 };
      let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      if (maxX - minX < 2) { minX -= 1; maxX += 1; }
      if (maxY - minY < 2) { minY -= 1; maxY += 1; }
      const pad = Math.max(maxX - minX, maxY - minY) * 0.16;
      return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
    }

    function lineEndpoints(line, box) {
      const points = [], { a, b, c } = line;
      const add = (x, y) => {
        if (finite(x) && finite(y) && x >= box.minX - 1e-7 && x <= box.maxX + 1e-7 &&
            y >= box.minY - 1e-7 && y <= box.maxY + 1e-7 &&
            !points.some(p => Math.hypot(p.x - x, p.y - y) < 1e-7)) points.push({ x, y });
      };
      if (Math.abs(b) > 1e-12) {
        add(box.minX, -(a * box.minX + c) / b);
        add(box.maxX, -(a * box.maxX + c) / b);
      }
      if (Math.abs(a) > 1e-12) {
        add(-(b * box.minY + c) / a, box.minY);
        add(-(b * box.maxY + c) / a, box.maxY);
      }
      return points.slice(0, 2);
    }

    function render(data) {
      const graph = graphFrom(data);
      const objects = graph
        ? (graph.objects || []).filter(item => item.object?.visible !== false && item.value?.type !== "undefined")
        : [];
      if (graph) meta.textContent = `${objects.length} object${objects.length === 1 ? "" : "s"} · revision ${graph.revision ?? 0}`;
      if (!objects.length) {
        canvas.className = "empty";
        canvas.textContent = "This construction does not contain visible objects yet.";
        return;
      }

      const box = boundsFor(objects);
      const scale = Math.min((WIDTH - 2 * MARGIN) / (box.maxX - box.minX), (HEIGHT - 2 * MARGIN) / (box.maxY - box.minY));
      const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
      const sx = x => WIDTH / 2 + (x - cx) * scale;
      const sy = y => HEIGHT / 2 - (y - cy) * scale;
      const svg = el("svg", { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, role: "img", "aria-label": "Geometric construction" });

      const gridStepRaw = 70 / scale;
      const power = 10 ** Math.floor(Math.log10(gridStepRaw));
      const gridStep = [1, 2, 5, 10].map(n => n * power).find(n => n >= gridStepRaw) || 10 * power;
      for (let x = Math.ceil(box.minX / gridStep) * gridStep; x <= box.maxX; x += gridStep)
        svg.appendChild(el("line", { x1: sx(x), y1: MARGIN, x2: sx(x), y2: HEIGHT - MARGIN, class: Math.abs(x) < 1e-9 ? "axis" : "grid" }));
      for (let y = Math.ceil(box.minY / gridStep) * gridStep; y <= box.maxY; y += gridStep)
        svg.appendChild(el("line", { x1: MARGIN, y1: sy(y), x2: WIDTH - MARGIN, y2: sy(y), class: Math.abs(y) < 1e-9 ? "axis" : "grid" }));

      const pointLabels = [];
      for (const item of objects) {
        const value = item.value, object = item.object || {}, color = object.style?.color || null;
        const style = color ? `stroke:${color}` : null;
        if (value.type === "line") {
          const ends = lineEndpoints(value, box);
          if (ends.length === 2) svg.appendChild(el("line", { x1: sx(ends[0].x), y1: sy(ends[0].y), x2: sx(ends[1].x), y2: sy(ends[1].y), class: "geometry", ...(style ? { style } : {}) }));
        } else if (value.type === "segment") {
          svg.appendChild(el("line", { x1: sx(value.start.x), y1: sy(value.start.y), x2: sx(value.end.x), y2: sy(value.end.y), class: "geometry", ...(style ? { style } : {}) }));
        } else if (value.type === "circle") {
          svg.appendChild(el("circle", { cx: sx(value.center.x), cy: sy(value.center.y), r: value.radius * scale, class: "geometry", ...(style ? { style } : {}) }));
        } else if (value.type === "point") {
          pointLabels.push({ value, object, color });
        }
      }
      for (const { value, object, color } of pointLabels) {
        svg.appendChild(el("circle", { cx: sx(value.x), cy: sy(value.y), r: 5, class: "point", ...(color ? { style: `fill:${color}` } : {}) }));
        const label = el("text", { x: sx(value.x) + 8, y: sy(value.y) - 8, class: "label" });
        label.textContent = object.label || object.id || "";
        svg.appendChild(label);
      }
      canvas.className = "";
      canvas.replaceChildren(svg);
    }

    window.addEventListener("message", event => {
      if (event.source !== window.parent || event.data?.jsonrpc !== "2.0") return;
      if (event.data.method === "ui/notifications/tool-result") render(event.data.params?.structuredContent);
    }, { passive: true });

    if (window.openai?.toolOutput) render(window.openai.toolOutput);
  </script>
</body>
</html>"""
