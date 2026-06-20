import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { saveDocument } from "./persistence/documentPersistence";
import type { EvaluateScriptResponse } from "./types/script";

const successfulResponse: EvaluateScriptResponse = {
  document: {
    schemaVersion: 1,
    id: "canvas_script",
    title: "Script construction",
    viewport: { centerX: 0, centerY: 0, scale: 50 },
    objects: [
      {
        id: "P",
        label: "P",
        kind: "point",
        visible: true,
        definition: { type: "free", x: 1, y: 2 },
      },
      {
        id: "Q",
        label: "Q",
        kind: "point",
        visible: true,
        definition: { type: "free", x: 3, y: 4 },
      },
      {
        id: "PQ",
        label: "PQ",
        kind: "segment",
        visible: true,
        definition: { type: "between_points", pointA: "P", pointB: "Q" },
      },
    ],
  },
  values: {
    P: { type: "point", x: 1, y: 2 },
    Q: { type: "point", x: 3, y: 4 },
    PQ: { type: "segment", start: { x: 1, y: 2 }, end: { x: 3, y: 4 } },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("script editor flow", () => {
  it("clears the script editor without changing the current construction", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Script" }));
    expect(screen.getByLabelText("Construction script")).not.toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Clear script" }));

    expect(screen.getByLabelText("Construction script")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Run script" })).toBeDisabled();
    expect(screen.getByLabelText("9 objects")).toBeInTheDocument();
  });

  it("restores the last locally saved construction on page load", () => {
    saveDocument({
      schemaVersion: 1,
      id: "restored",
      title: "Restored construction",
      objects: [
        {
          id: "R",
          label: "R",
          kind: "point",
          visible: true,
          definition: { type: "free", x: 8, y: -3 },
        },
      ],
    });

    render(<App />);

    expect(screen.getByLabelText("1 objects")).toBeInTheDocument();
    expect(document.querySelector('[data-object-id="R"]')).not.toBeNull();
    expect(document.querySelector('[data-object-id="A"]')).toBeNull();
  });

  it("shows a clear validation error for an invalid imported JSON document", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.upload(
      screen.getByLabelText("Choose geometry JSON file"),
      new File(['{"schemaVersion":1,"id":"bad"}'], "bad.json", {
        type: "application/json",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("document.title");
    expect(screen.getByLabelText("9 objects")).toBeInTheDocument();
  });

  it("calls the backend and replaces the current canvas construction", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(successfulResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Script" }));
    const editor = screen.getByLabelText("Construction script");
    await user.clear(editor);
    await user.type(editor, "P = Point(1, 2)\nQ = Point(3, 4)\nPQ = Segment(P, Q)");
    await user.click(screen.getByRole("button", { name: "Run script" }));

    expect(await screen.findByText("Created 3 objects successfully.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Objects" }));
    const objectsRegion = screen.getByRole("region", { name: "Objects" });
    expect(within(objectsRegion).getByText("PQ")).toBeInTheDocument();
    expect(within(objectsRegion).queryByText("circumference")).not.toBeInTheDocument();
    expect(screen.getByLabelText("3 objects")).toBeInTheDocument();
    expect(document.querySelector('[data-object-id="PQ"]')).not.toBeNull();
    expect(document.querySelector('[data-object-id="altitude"]')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/geometry/evaluate-script",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string).script).toContain("PQ = Segment(P, Q)");
  });

  it("displays parser errors with line and source context", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: {
              code: "undefined_reference",
              message: "Object 'B' must be defined before it is used",
              line: 2,
              column: 14,
              sourceLine: "AB = Line(A, B)",
            },
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Script" }));
    await user.clear(screen.getByLabelText("Construction script"));
    await user.type(screen.getByLabelText("Construction script"), "A = Point(0, 0)\nAB = Line(A, B)");
    await user.click(screen.getByRole("button", { name: "Run script" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Line 2, column 14");
    expect(alert).toHaveTextContent("Object 'B' must be defined before it is used");
    expect(alert).toHaveTextContent("AB = Line(A, B)");
    await waitFor(() => expect(screen.getByLabelText("9 objects")).toBeInTheDocument());
  });

  it("toggles object visibility without deleting the construction", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(document.querySelector('[data-object-id="A"]')).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Hide A" }));
    expect(document.querySelector('[data-object-id="A"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Show A" })).toBeInTheDocument();
    expect(screen.getByLabelText("9 objects")).toBeInTheDocument();
  });

  it("deletes the selected object when pressing Delete", async () => {
    const user = userEvent.setup();
    render(<App />);

    const objectsRegion = screen.getByRole("region", { name: "Objects" });
    const selectA = within(objectsRegion).getByText("A").closest("button");
    expect(selectA).not.toBeNull();
    await user.click(selectA!);
    await user.keyboard("{Delete}");

    expect(screen.getByLabelText("2 objects")).toBeInTheDocument();
    expect(document.querySelector('[data-object-id="A"]')).toBeNull();
  });

  it("undoes a visibility change from the toolbar button", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Hide A" }));
    expect(document.querySelector('[data-object-id="A"]')).toBeNull();

    const undoButton = screen.getByRole("button", { name: "Undo last change" });
    expect(undoButton).toBeEnabled();
    await user.click(undoButton);

    expect(document.querySelector('[data-object-id="A"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Hide A" })).toBeInTheDocument();
  });

  it("adds a function from the Objects panel without showing a separate button", async () => {
    const user = userEvent.setup();
    render(<App />);

    const commandInput = screen.getByLabelText("Add object command");
    expect(screen.queryByRole("button", { name: /add object command/i })).toBeNull();
    await user.type(commandInput, "f = Function(y = sin(x) + sqrt(abs(x))){Enter}");

    expect(await screen.findByText("f")).toBeInTheDocument();
    expect(screen.getByText("Function graph")).toBeInTheDocument();
    expect(screen.getByLabelText("10 objects")).toBeInTheDocument();
    expect(document.querySelector('[data-object-id="f"]')).not.toBeNull();
  });
});

describe("assistant flow", () => {
  it("renders a generated script preview and applies it through script evaluation", async () => {
    const user = userEvent.setup();
    const agentResponse = {
      reasoning: "I created two points and connected them with a deterministic segment.",
      plan: ["Create points P and Q.", "Draw segment PQ."],
      generatedScript: "P = Point(1, 2)\nQ = Point(3, 4)\nPQ = Segment(P, Q)",
      warnings: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(agentResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(successfulResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Assistant" }));
    await user.type(screen.getByLabelText("Describe a geometry construction"), "Draw segment PQ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    const preview = await screen.findByRole("region", { name: "Generated construction preview" });
    expect(preview).toHaveTextContent("P = Point(1, 2)");
    expect(preview).toHaveTextContent("PQ = Segment(P, Q)");
    expect(screen.getByText("I created two points and connected them with a deterministic segment."))
      .toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("/agent/plan");
    const planRequest = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(planRequest.userRequest).toBe("Draw segment PQ");
    expect(planRequest.currentScript).toContain("A = Point(-2, -1)");
    expect(planRequest.config.temperature).toBe(1);

    await user.click(screen.getByRole("button", { name: "Apply Script" }));

    expect(await screen.findByText("The reviewed script was applied.")).toBeInTheDocument();
    expect(screen.getByLabelText("3 objects")).toBeInTheDocument();
    expect(document.querySelector('[data-object-id="PQ"]')).not.toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe("/geometry/evaluate-script");
  });

  it("shows deterministic planner errors for unsupported requests", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: {
              code: "unsupported_request",
              message: "I can currently plan supported classical geometry constructions.",
            },
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Assistant" }));
    await user.type(screen.getByLabelText("Describe a geometry construction"), "Prove a theorem");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "I can currently plan supported classical geometry constructions.",
    );
  });

  it("clears the assistant and starts a new conversation", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            reasoning: "A completed assistant response.",
            plan: ["Create point P."],
            generatedScript: "P = Point(1, 2)",
            warnings: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Assistant" }));
    await user.type(screen.getByLabelText("Describe a geometry construction"), "Create P");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("A completed assistant response.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start a new conversation" }));

    expect(screen.queryByText("A completed assistant response.")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Generated construction preview" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Describe a geometry construction")).toHaveValue("");
    expect(screen.getByText(/Describe a construction in natural language/)).toBeInTheDocument();
  });
});
