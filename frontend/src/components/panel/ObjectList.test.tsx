import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { exampleGeometryDocument } from "../../geometry/example";
import { GeometryGraph } from "../../geometry/engine";
import { ObjectList } from "./ObjectList";

describe("ObjectList", () => {
  it("renders labels, construction types, and dependencies", () => {
    const graph = new GeometryGraph(exampleGeometryDocument);
    render(
      <ObjectList
        document={graph.document}
        values={graph.values}
        selectedObjectId={null}
        onSelectObject={() => undefined}
        onToggleVisibility={() => undefined}
      />,
    );

    const list = screen.getByRole("list");
    expect(within(list).getByText("A")).toBeInTheDocument();
    expect(within(list).getAllByText("Free point")).toHaveLength(3);
    expect(within(list).getAllByText("Depends on A, B")).toHaveLength(3);
    expect(within(list).getByText("Perpendicular line")).toBeInTheDocument();
  });

  it("highlights selection and delegates visibility changes", async () => {
    const user = userEvent.setup();
    const graph = new GeometryGraph(exampleGeometryDocument);
    const onSelectObject = vi.fn();
    const onToggleVisibility = vi.fn();
    const { rerender } = render(
      <ObjectList
        document={graph.document}
        values={graph.values}
        selectedObjectId={null}
        onSelectObject={onSelectObject}
        onToggleVisibility={onToggleVisibility}
      />,
    );

    const selectA = screen.getByText("A").closest("button");
    expect(selectA).not.toBeNull();
    await user.click(selectA!);
    expect(onSelectObject).toHaveBeenCalledWith("A");

    rerender(
      <ObjectList
        document={graph.document}
        values={graph.values}
        selectedObjectId="A"
        onSelectObject={onSelectObject}
        onToggleVisibility={onToggleVisibility}
      />,
    );
    expect(screen.getByText("A").closest("button")).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Hide A" }));
    expect(onToggleVisibility).toHaveBeenCalledWith("A");
  });

  it("shows a delete action in the three-dot menu", async () => {
    const user = userEvent.setup();
    const graph = new GeometryGraph(exampleGeometryDocument);
    const onDeleteObject = vi.fn();

    render(
      <ObjectList
        document={graph.document}
        values={graph.values}
        selectedObjectId={null}
        onSelectObject={() => undefined}
        onToggleVisibility={() => undefined}
        onSetObjectLabel={() => undefined}
        onDeleteObject={onDeleteObject}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit A" }));
    await user.click(screen.getByRole("button", { name: "Delete object" }));

    expect(onDeleteObject).toHaveBeenCalledWith("A");
  });

  it("submits one-line object commands from the Objects panel", async () => {
    const user = userEvent.setup();
    const graph = new GeometryGraph(exampleGeometryDocument);
    const onSubmitCommand = vi.fn().mockResolvedValue(undefined);

    render(
      <ObjectList
        document={graph.document}
        values={graph.values}
        selectedObjectId={null}
        onSelectObject={() => undefined}
        onToggleVisibility={() => undefined}
        onSubmitCommand={onSubmitCommand}
      />,
    );

    await user.type(screen.getByLabelText("Add object command"), "y = x^2{Enter}");

    expect(onSubmitCommand).toHaveBeenCalledWith("y = x^2");
    expect(screen.queryByRole("button", { name: /add object command/i })).toBeNull();
  });

  it("shows and commits the ratio of a homothety", async () => {
    const user = userEvent.setup();
    const document = {
      ...exampleGeometryDocument,
      objects: [
        ...exampleGeometryDocument.objects,
        {
          id: "H",
          label: "H",
          kind: "point" as const,
          visible: true,
          definition: { type: "homothety_scalar" as const, center: "A", object: "B", ratio: 2 },
        },
      ],
    };
    const graph = new GeometryGraph(document);
    const onUpdateHomothetyRatio = vi.fn();

    render(
      <ObjectList
        document={graph.document}
        values={graph.values}
        selectedObjectId={null}
        onSelectObject={() => undefined}
        onToggleVisibility={() => undefined}
        onUpdateHomothetyRatio={onUpdateHomothetyRatio}
      />,
    );

    const input = screen.getByLabelText("Ratio for H");
    expect(input).toHaveValue(2);
    await user.clear(input);
    await user.type(input, "-3{Enter}");
    expect(onUpdateHomothetyRatio).toHaveBeenCalledWith("H", -3);
  });

  it("cancels a homothety ratio edit with Escape", async () => {
    const user = userEvent.setup();
    const document = {
      ...exampleGeometryDocument,
      objects: [...exampleGeometryDocument.objects, { id: "H", label: "H", kind: "point" as const, visible: true, definition: { type: "homothety_scalar" as const, center: "A", object: "B", ratio: 2 } }],
    };
    const graph = new GeometryGraph(document);
    const onUpdateHomothetyRatio = vi.fn();
    render(<ObjectList document={graph.document} values={graph.values} selectedObjectId={null} onSelectObject={() => undefined} onToggleVisibility={() => undefined} onUpdateHomothetyRatio={onUpdateHomothetyRatio} />);

    const input = screen.getByLabelText("Ratio for H");
    await user.clear(input);
    await user.type(input, "-3{Escape}");
    expect(onUpdateHomothetyRatio).not.toHaveBeenCalled();
    expect(input).toHaveValue(2);
  });

  it("shows the ratio of a point-ratio homothety over a non-point object", () => {
    const document = {
      ...exampleGeometryDocument,
      objects: [
        ...exampleGeometryDocument.objects,
        { id: "V", label: "V", kind: "point" as const, visible: true, definition: { type: "free" as const, x: 1, y: 11 } },
        {
          id: "H",
          label: "H",
          kind: "segment" as const,
          visible: true,
          definition: { type: "homothety_point" as const, center: "C", object: "base", ratioPoint: "V" },
        },
      ],
    };
    const graph = new GeometryGraph(document);

    render(
      <ObjectList
        document={graph.document}
        values={graph.values}
        selectedObjectId={null}
        onSelectObject={() => undefined}
        onToggleVisibility={() => undefined}
        onUpdateHomothetyRatio={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Ratio for H")).toHaveValue(2);
  });

});
