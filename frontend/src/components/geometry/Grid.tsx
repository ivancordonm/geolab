import { chooseGridStep, getWorldBounds, worldToScreen } from "../../geometry/viewport";
import type { CanvasSize } from "../../geometry/viewport";
import type { GeometryViewport } from "../../types/geometry";

interface GridProps {
  viewport: GeometryViewport;
  size: CanvasSize;
}

interface GridLine {
  key: string;
  position: number;
  worldValue: number;
}

const AXIS_MARGIN = 18;
const TICK_HALF = 4;

export function Grid({ viewport, size }: GridProps) {
  const bounds = getWorldBounds(viewport, size);
  const step = chooseGridStep(viewport.scale);
  const origin = worldToScreen({ x: 0, y: 0 }, viewport, size);
  const axisXVisible = origin.x >= 0 && origin.x <= size.width;
  const axisYVisible = origin.y >= 0 && origin.y <= size.height;
  const axisX = clamp(origin.x, AXIS_MARGIN, size.width - AXIS_MARGIN);
  const axisY = clamp(origin.y, AXIS_MARGIN, size.height - AXIS_MARGIN);

  const verticalLines = gridValues(bounds.minX, bounds.maxX, step).map((worldValue) => ({
    key: `x-${worldValue}`,
    position: worldToScreen({ x: worldValue, y: 0 }, viewport, size).x,
    worldValue,
  }));
  const horizontalLines = gridValues(bounds.minY, bounds.maxY, step).map((worldValue) => ({
    key: `y-${worldValue}`,
    position: worldToScreen({ x: 0, y: worldValue }, viewport, size).y,
    worldValue,
  }));

  return (
    <g className="coordinate-grid" aria-hidden="true">
      {verticalLines.map((line) => (
        <GridVerticalLine key={line.key} line={line} height={size.height} />
      ))}
      {horizontalLines.map((line) => (
        <GridHorizontalLine key={line.key} line={line} width={size.width} />
      ))}

      {axisXVisible ? (
        <line className="axis-line" x1={origin.x} y1={0} x2={origin.x} y2={size.height} />
      ) : null}
      {axisYVisible ? (
        <line className="axis-line" x1={0} y1={origin.y} x2={size.width} y2={origin.y} />
      ) : null}

      {axisYVisible &&
        verticalLines.map((line) => (
          <g key={`${line.key}-tick`}>
            <line
              className="axis-tick"
              x1={line.position}
              y1={origin.y - TICK_HALF}
              x2={line.position}
              y2={origin.y + TICK_HALF}
            />
            <text
              className="axis-text"
              x={line.position}
              y={origin.y + 16}
              textAnchor="middle"
            >
              {formatTick(line.worldValue)}
            </text>
          </g>
        ))}

      {axisXVisible &&
        horizontalLines.map((line) => (
          <g key={`${line.key}-tick`}>
            <line
              className="axis-tick"
              x1={origin.x - TICK_HALF}
              y1={line.position}
              x2={origin.x + TICK_HALF}
              y2={line.position}
            />
            {Math.abs(line.worldValue) > 1e-9 ? (
              <text
                className="axis-text"
                x={origin.x - 8}
                y={line.position + 4}
                textAnchor="end"
              >
                {formatTick(line.worldValue)}
              </text>
            ) : null}
          </g>
        ))}

      {axisXVisible && axisYVisible ? (
        <text className="axis-text" x={origin.x - 8} y={origin.y + 16} textAnchor="end">
          0
        </text>
      ) : null}

      {axisYVisible ? (
        <text className="axis-name" x={size.width - 12} y={axisY - 8} textAnchor="end">
          x
        </text>
      ) : null}
      {axisXVisible ? (
        <text className="axis-name" x={axisX + 8} y={14}>
          y
        </text>
      ) : null}
    </g>
  );
}

function GridVerticalLine({ line, height }: { line: GridLine; height: number }) {
  const isAxis = Math.abs(line.worldValue) < 1e-9;
  return isAxis ? null : (
    <line className="grid-line" x1={line.position} y1={0} x2={line.position} y2={height} />
  );
}

function GridHorizontalLine({ line, width }: { line: GridLine; width: number }) {
  const isAxis = Math.abs(line.worldValue) < 1e-9;
  return isAxis ? null : (
    <line className="grid-line" x1={0} y1={line.position} x2={width} y2={line.position} />
  );
}

function gridValues(min: number, max: number, step: number): number[] {
  const first = Math.ceil(min / step) * step;
  const values: number[] = [];
  for (let value = first; value <= max + step * 0.25 && values.length < 100; value += step) {
    values.push(Number(value.toPrecision(12)));
  }
  return values;
}

function formatTick(value: number): string {
  if (Math.abs(value) < 1e-9) return "0";
  return Number(value.toPrecision(6)).toString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
