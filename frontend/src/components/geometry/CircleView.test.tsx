import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CircleView } from "./CircleView";

const value = { type: "circle" as const, center: { x: 0, y: 0 }, radius: 3 };

describe("CircleView", () => {
  it("renders ordinary circles with circle elements", () => {
    const { container } = render(
      <svg>
        <CircleView
          objectId="c1"
          label="c1"
          value={value}
          center={{ x: 100, y: 80 }}
          radius={60}
          selected={false}
          onPointerDown={vi.fn()}
        />
      </svg>,
    );

    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(container.querySelectorAll("line")).toHaveLength(0);
  });

  it("ignores an approximation that has too few points", () => {
    const { container } = render(
      <svg>
        <CircleView
          objectId="c1"
          label="c1"
          value={value}
          center={{ x: 100, y: 80 }}
          radius={60}
          screenPolylineApproximation={{ points: [{ x: 10, y: 10 }] }}
          selected={false}
          onPointerDown={vi.fn()}
        />
      </svg>,
    );

    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(container.querySelectorAll("polyline")).toHaveLength(0);
  });

  it("renders a bounded polyline while preserving circle behavior for huge circles", () => {
    const onPointerDown = vi.fn();
    const { container } = render(
      <svg>
        <CircleView
          objectId="ivc1"
          label="ivc1"
          value={value}
          center={{ x: 344_000, y: -114_000 }}
          radius={362_400}
          screenPolylineApproximation={{
            points: [
              { x: 10, y: 0 },
              { x: 125, y: 145 },
              { x: 250, y: 300 },
            ],
          }}
          color="#2563eb"
          strokeWidth={3}
          strokeDash="dashed"
          selected={false}
          onPointerDown={onPointerDown}
        />
      </svg>,
    );

    const group = container.querySelector('[data-object-id="ivc1"]');
    const visiblePolyline = container.querySelector(".geometry-circle");
    expect(group).toHaveAttribute("data-object-kind", "circle");
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    expect(container.querySelectorAll("line")).toHaveLength(0);
    expect(container.querySelectorAll("polyline")).toHaveLength(2);
    expect(visiblePolyline).toHaveAttribute("points", "10,0 125,145 250,300");
    expect(visiblePolyline).toHaveAttribute("stroke-width", "3");
    expect(visiblePolyline).toHaveAttribute("stroke-dasharray", "10 6");
    expect(visiblePolyline).toHaveAttribute("aria-label", "Circle ivc1, radius 3.00");

    fireEvent.pointerDown(group!);
    expect(onPointerDown).toHaveBeenCalledWith("ivc1", expect.anything());
  });
});
