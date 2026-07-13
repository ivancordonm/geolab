import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentPlanningError, planStream } from "./planner";
import type { PlanStreamEvent, ToolCallPlanRequest } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Builds a fake `fetch` Response whose body streams the given chunks, one
 * `reader.read()` call per array entry, mirroring how a real network stream
 * delivers arbitrary byte boundaries. */
function streamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status });
}

async function collect(request: ToolCallPlanRequest): Promise<PlanStreamEvent[]> {
  const events: PlanStreamEvent[] = [];
  for await (const event of planStream(request)) {
    events.push(event);
  }
  return events;
}

const request: ToolCallPlanRequest = { userRequest: "draw a triangle" };

describe("planStream", () => {
  it("parses a single frame delivered in one chunk", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamResponse(['event: thinking\ndata: {"delta":"hi"}\n\n'])),
    );

    const events = await collect(request);

    expect(events).toEqual([{ event: "thinking", data: { delta: "hi" } }]);
  });

  it("parses a single frame split across two separate stream chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse(['event: thinking\ndata: {"delta"', ': "hi"}\n\n']),
      ),
    );

    const events = await collect(request);

    expect(events).toEqual([{ event: "thinking", data: { delta: "hi" } }]);
  });

  it("parses multiple frames delivered in a single chunk, in order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse([
          'event: thinking\ndata: {"delta":"hi"}\n\n' +
            'event: done\ndata: {"reasoning":"r","toolCalls":[]}\n\n',
        ]),
      ),
    );

    const events = await collect(request);

    expect(events).toEqual([
      { event: "thinking", data: { delta: "hi" } },
      { event: "done", data: { reasoning: "r", toolCalls: [] } },
    ]);
  });

  it("throws AgentPlanningError for a non-2xx response before streaming starts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: { code: "bad_request", message: "nope" } }), {
          status: 400,
        }),
      ),
    );

    await expect(collect(request)).rejects.toBeInstanceOf(AgentPlanningError);
  });

  it("flushes a final complete frame that has no trailing blank line", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse([
          'event: thinking\ndata: {"delta":"hi"}\n\n' +
            'event: done\ndata: {"reasoning":"r","toolCalls":[]}',
        ]),
      ),
    );

    const events = await collect(request);

    expect(events).toEqual([
      { event: "thinking", data: { delta: "hi" } },
      { event: "done", data: { reasoning: "r", toolCalls: [] } },
    ]);
  });
});
