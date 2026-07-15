import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("uses the native color picker instead of a hexadecimal text field", async () => {
    const user = userEvent.setup();
    const graph = new GeometryGraph(exampleGeometryDocument);
    const onSetObjectColor = vi.fn();

    render(
      <ObjectList
        document={graph.document}
        values={graph.values}
        selectedObjectId={null}
        onSelectObject={() => undefined}
        onToggleVisibility={() => undefined}
        onSetObjectLabel={() => undefined}
        onSetObjectColor={onSetObjectColor}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit A" }));
    const picker = screen.getByLabelText("Color personalizado");

    expect(picker).toHaveAttribute("type", "color");
    expect(screen.queryByPlaceholderText("#rrggbb")).not.toBeInTheDocument();
    fireEvent.change(picker, { target: { value: "#123456" } });
    expect(onSetObjectColor).toHaveBeenCalledWith("A", "#123456");
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

  it("renders, collapses, and delegates actions for a construction group", async () => {
    const user = userEvent.setup();
    const document = {
      schemaVersion: 1 as const,
      id: "grouped-circle",
      title: "Grouped circle",
      objects: [
        { id: "A", label: "A", kind: "point" as const, visible: true, definition: { type: "free" as const, x: 0, y: 0 } },
        { id: "B", label: "B", kind: "point" as const, visible: true, definition: { type: "free" as const, x: 2, y: 0 } },
        { id: "c1", label: "c1", kind: "circle" as const, visible: true, definition: { type: "center_through_point" as const, center: "A", point: "B" } },
      ],
      groups: [{ id: "g1", label: "Circle", members: [
        { objectId: "A", role: "input" as const },
        { objectId: "B", role: "input" as const },
        { objectId: "c1", role: "primary" as const },
      ] }],
    };
    const graph = new GeometryGraph(document);
    const onToggleGroupVisibility = vi.fn();
    const onDeleteGroup = vi.fn();
    render(<ObjectList document={graph.document} values={graph.values} selectedObjectId={null} onSelectObject={() => undefined} onToggleVisibility={() => undefined} onToggleGroupVisibility={onToggleGroupVisibility} onDeleteObject={() => undefined} onDeleteGroup={onDeleteGroup} />);

    expect(screen.getByText("c1")).toBeInTheDocument();
    expect(screen.getByText("A").closest("li")).toHaveClass("ml-5");
    await user.click(screen.getByRole("button", { name: "Collapse c1" }));
    expect(screen.queryByText("A")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand c1" }));
    expect(screen.getByText("A")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide c1" }));
    expect(onToggleGroupVisibility).toHaveBeenCalledWith("g1");
    await user.click(screen.getByRole("button", { name: "Edit c1" }));
    await user.click(screen.getByRole("button", { name: "Delete object" }));
    expect(onDeleteGroup).toHaveBeenCalledWith("g1");
  });

  it("opens the edit menu and triggers actions when double-clicking the object card", async () => {
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

    const selectA = screen.getByText("A").closest("button");
    expect(selectA).not.toBeNull();
    await user.dblClick(selectA!);
    await user.click(screen.getByRole("button", { name: "Delete object" }));

    expect(onDeleteObject).toHaveBeenCalledWith("A");
  });

});
