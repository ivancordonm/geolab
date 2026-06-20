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

});
