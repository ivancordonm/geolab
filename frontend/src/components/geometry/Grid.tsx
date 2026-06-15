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

export function Grid({ viewport, size }: GridProps) {
  const bounds = getWorldBounds(viewport, size);
  const step = chooseGridStep(viewport.scale);
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
  const axisX = worldToScreen({ x: 0, y: 0 }, viewport, size).x;
  const axisY = worldToScreen({ x: 0, y: 0 }, viewport, size).y;

  return (
    <g className="coordinate-grid" aria-hidden="true">
      {verticalLines.map((line) => (
        <GridVerticalLine key={line.key} line={line} height={size.height} />
      ))}
      {horizontalLines.map((line) => (
        <GridHorizontalLine key={line.key} line={line} width={size.width} />
      ))}
      {axisX >= 0 && axisX <= size.width ? (
        <line className="axis-line" x1={axisX} y1={0} x2={axisX} y2={size.height} />
      ) : null}
      {axisY >= 0 && axisY <= size.height ? (
        <line className="axis-line" x1={0} y1={axisY} x2={size.width} y2={axisY} />
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

