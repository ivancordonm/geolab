import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PROVIDER_DEFAULTS } from "../../agent/types";
import { ConfigPopover } from "./ConfigPopover";

describe("ConfigPopover", () => {
  it("uses English labels and restores the saved model for each provider", async () => {
    const user = userEvent.setup();
    render(
      <ConfigPopover
        config={PROVIDER_DEFAULTS.ollama}
        remember
        onChange={vi.fn()}
        apiKeys={{ ollama: "", openai: "", nvidia: "" }}
        models={{ ollama: "qwen3:14b", openai: "gpt-5.1", nvidia: "nemotron-custom" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Configure assistant provider" }));

    expect(screen.getByRole("dialog", { name: "Assistant settings" })).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toHaveValue(PROVIDER_DEFAULTS.ollama.model);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByText("Proveedor")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "OpenAI" }));

    expect(screen.getByLabelText("Model")).toHaveValue("gpt-5.1");
  });
});
