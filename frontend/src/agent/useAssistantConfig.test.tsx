import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAssistantConfig } from "./useAssistantConfig";
import { PROVIDER_DEFAULTS } from "./types";

describe("useAssistantConfig", () => {
  it("uses the configured default model for each provider", () => {
    const { result } = renderHook(() => useAssistantConfig());

    expect(result.current[0]).toMatchObject({
      provider: "huggingface",
      model: "MiniMaxAI/MiniMax-M3:novita",
    });
    expect(result.current[4]).toEqual({
      huggingface: "MiniMaxAI/MiniMax-M3:novita",
      openai: "gpt-5.4-mini",
      nvidia: "openai/gpt-oss-120b",
    });
  });

  it("persists each provider model across remounts", () => {
    const first = renderHook(() => useAssistantConfig());

    act(() => {
      first.result.current[1](
        { ...PROVIDER_DEFAULTS.openai, model: "gpt-5.1", apiKey: "" },
        true,
      );
    });
    act(() => {
      first.result.current[1](
        { ...PROVIDER_DEFAULTS.huggingface, model: "Qwen/Qwen3-235B-A22B", apiKey: "" },
        true,
      );
    });
    first.unmount();

    const second = renderHook(() => useAssistantConfig());

    expect(second.result.current[0].model).toBe("Qwen/Qwen3-235B-A22B");
    expect(second.result.current[4]).toEqual({
      huggingface: "Qwen/Qwen3-235B-A22B",
      openai: "gpt-5.1",
      nvidia: PROVIDER_DEFAULTS.nvidia.model,
    });
  });
});
