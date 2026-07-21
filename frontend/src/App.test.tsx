import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App, nextFunctionId } from "./App";
import { exampleGeometryDocument } from "./geometry/example";
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

/**
 * App now calls `fetchCurrentUser()` (GET /auth/me) on mount via `useAuth`.
 * Every fetch mock in this file must answer that call (with a guest 401) in
 * addition to whatever URL the test itself cares about.
 */
function withAuthFallback(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response,
) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/auth/me") {
      return Promise.resolve(new Response(null, { status: 401 }));
    }
    return handler(input, init);
  });
}

function cloudDetail(title: string) {
  return {
    id: "cloud-1",
    title,
    document: { ...exampleGeometryDocument, title },
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

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

  it("loads the script in the script editor when exporting a script", async () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Script" }));
    
    // Clear the script so we can check that it gets updated/filled on export
    await user.click(screen.getByRole("button", { name: "Clear script" }));
    expect(screen.getByLabelText("Construction script")).toHaveValue("");

    // Open the Actions menu and export the script
    await user.click(screen.getByRole("button", { name: "Construction actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Export Script" }));

    // Verify it is filled with the exported script
    const editor = screen.getByLabelText("Construction script") as HTMLTextAreaElement;
    expect(editor).not.toHaveValue("");
    expect(editor.value).toContain("A = Point(-2, -1)");
    expect(editor.value).toContain("Circle(A, C)");
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
    const fetchMock = withAuthFallback(() =>
      Promise.resolve(
        new Response(JSON.stringify(successfulResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
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
    const scriptCall = fetchMock.mock.calls.find(([url]) => url === "/geometry/evaluate-script");
    expect(scriptCall).toBeDefined();
    const request = scriptCall![1] as RequestInit;
    expect(JSON.parse(request.body as string).script).toContain("PQ = Segment(P, Q)");
  });

  it("displays parser errors with line and source context", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      withAuthFallback(() =>
        Promise.resolve(
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

  it("activates the Select tool when pressing P", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Basic shapes" }));
    await user.click(screen.getByRole("menuitem", { name: "Point" }));
    expect(screen.getByRole("button", { name: "Basic shapes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.keyboard("p");

    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Basic shapes" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("ignores the P shortcut while typing in the script editor", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Basic shapes" }));
    await user.click(screen.getByRole("menuitem", { name: "Point" }));
    await user.click(screen.getByRole("tab", { name: "Script" }));
    await user.click(screen.getByLabelText("Construction script"));
    await user.keyboard("p");

    expect(screen.getByRole("button", { name: "Basic shapes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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

  it("uses shared tooltips for undo, redo, and reset view", async () => {
    const user = userEvent.setup();
    render(<App />);

    const controls = [
      ["Undo last change", "Revert the last change"],
      ["Redo last change", "Restore the last undone change"],
      ["Reset viewport", "Center and reset the zoom"],
    ] as const;

    for (const [name, tooltipText] of controls) {
      const button = screen.getByRole("button", { name });
      expect(button).not.toHaveAttribute("title");
      await user.hover(button);
      expect(await screen.findByRole("tooltip")).toHaveTextContent(tooltipText);
      await user.unhover(button);
    }
  });

  it("adds a function from the Objects panel without showing a separate button", async () => {
    const user = userEvent.setup();
    render(<App />);

    const commandInput = screen.getByLabelText("Add object command");
    expect(screen.queryByRole("button", { name: /add object command/i })).toBeNull();
    await user.type(commandInput, "f = Function(y = sin(x) + sqrt(abs(x))){Enter}");

    expect(await screen.findByText("f")).toBeInTheDocument();
    expect(screen.getByText("sin(x) + sqrt(abs(x))")).toBeInTheDocument();
    expect(screen.getByText("function", { exact: true })).toBeInTheDocument();
    expect(screen.getByLabelText("10 objects")).toBeInTheDocument();
    expect(document.querySelector('[data-object-id="f"]')).not.toBeNull();
  });

  it("assigns sequential automatic names for unnamed functions", () => {
    const documentWithFunctions = {
      schemaVersion: 1 as const,
      id: "doc",
      title: "Doc",
      viewport: { centerX: 0, centerY: 0, scale: 60 },
      objects: [
        { id: "A", label: "A", kind: "point" as const, visible: true, definition: { type: "free" as const, x: 0, y: 0 } },
        { id: "f_1", label: "f_1", kind: "function" as const, visible: true, definition: { type: "function_expression" as const, expression: "x" } },
      ],
    };

    expect(nextFunctionId(documentWithFunctions)).toBe("f_2");
  });
});

describe("cloud document title flow", () => {
  it("keeps the canonical title after save-as-new, open, and active rename", async () => {
    const user = userEvent.setup();
    let cloudTitle = "Saved title";
    const prompt = vi
      .fn()
      .mockReturnValueOnce(cloudTitle)
      .mockReturnValueOnce(null);
    vi.stubGlobal("prompt", prompt);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/auth/me") {
          return new Response(
            JSON.stringify({
              id: "user-1",
              email: "ada@example.com",
              name: "Ada",
              pictureUrl: null,
            }),
            { status: 200 },
          );
        }
        if (url === "/documents" && init?.method === "POST") {
          cloudTitle = JSON.parse(init.body as string).title as string;
          return new Response(JSON.stringify(cloudDetail(cloudTitle)), { status: 201 });
        }
        if (url.startsWith("/documents?") && init?.method === undefined) {
          return new Response(
            JSON.stringify({
              documents: [
                { id: "cloud-1", title: cloudTitle, updatedAt: "2026-01-01T00:00:00Z" },
              ],
              total: 1,
              hasMore: false,
            }),
            { status: 200 },
          );
        }
        if (url === "/documents/cloud-1" && init?.method === undefined) {
          return new Response(JSON.stringify(cloudDetail(cloudTitle)), { status: 200 });
        }
        if (url === "/documents/cloud-1" && init?.method === "PUT") {
          cloudTitle = JSON.parse(init.body as string).title as string;
          return new Response(JSON.stringify(cloudDetail(cloudTitle)), { status: 200 });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<App />);
    await screen.findByRole("button", { name: "Account menu" });

    await user.click(screen.getByRole("button", { name: "Construction actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Save as new..." }));
    expect(await screen.findByRole("status")).toHaveTextContent("saved to the cloud");

    await user.click(screen.getByRole("button", { name: "Construction actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Open" }));
    await user.click(await screen.findByRole("button", { name: /^Saved title/ }));

    await user.click(screen.getByRole("button", { name: "Construction actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Open" }));
    await user.click(await screen.findByRole("button", { name: "Rename Saved title" }));
    const titleInput = screen.getByDisplayValue("Saved title");
    await user.clear(titleInput);
    await user.type(titleInput, "Renamed title{Enter}");
    await screen.findByRole("button", { name: "Rename Renamed title" });
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: "Construction actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Save as new..." }));
    expect(prompt).toHaveBeenLastCalledWith(
      "Title for the new construction:",
      "Renamed title",
    );
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
    const otherResponses = [
      new Response(JSON.stringify(agentResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      new Response(JSON.stringify(successfulResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ];
    let otherCallIndex = 0;
    const fetchMock = withAuthFallback(() => {
      const response = otherResponses[otherCallIndex];
      otherCallIndex += 1;
      return Promise.resolve(response);
    });
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
    const planCallIndex = fetchMock.mock.calls.findIndex(([url]) => url === "/agent/plan");
    expect(planCallIndex).toBeGreaterThanOrEqual(0);
    const planRequest = JSON.parse(
      (fetchMock.mock.calls[planCallIndex][1] as RequestInit).body as string,
    );
    expect(planRequest.userRequest).toBe("Draw segment PQ");
    expect(planRequest.currentScript).toContain("A = Point(-2, -1)");
    expect(planRequest.config.temperature).toBe(1);

    await user.click(screen.getByRole("button", { name: "Apply Script" }));

    expect(await screen.findByText("The reviewed script was applied.")).toBeInTheDocument();
    expect(screen.getByLabelText("3 objects")).toBeInTheDocument();
    expect(document.querySelector('[data-object-id="PQ"]')).not.toBeNull();
    const scriptCallIndex = fetchMock.mock.calls.findIndex(
      ([url]) => url === "/geometry/evaluate-script",
    );
    expect(scriptCallIndex).toBeGreaterThan(planCallIndex);
  });

  it("shows deterministic planner errors for unsupported requests", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      withAuthFallback(() =>
        Promise.resolve(
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
      withAuthFallback(() =>
        Promise.resolve(
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

describe("footer credit", () => {
  it("shows the build version above the Anticentro Lab credit", () => {
    render(<App />);

    const versionEl = screen.getByText(/^v\.\d+$/);
    const creditEl = screen.getByText("An Anticentro Lab project");

    expect(versionEl).toBeInTheDocument();
    expect(creditEl).toBeInTheDocument();
    // Both lines must live in the same container, with the version
    // immediately preceding the credit line in the DOM.
    expect(versionEl.parentElement).toBe(creditEl.parentElement);
    expect(versionEl.nextElementSibling).toBe(creditEl);
    expect(
      versionEl.compareDocumentPosition(creditEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
