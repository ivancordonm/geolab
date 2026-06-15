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
        config={PROVIDER_DEFAULTS.huggingface}
        remember
        onChange={vi.fn()}
        apiKeys={{ huggingface: "", openai: "", nvidia: "" }}
        models={{ huggingface: "Qwen/Qwen3-235B-A22B", openai: "gpt-5.1", nvidia: "nemotron-custom" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Configure assistant provider" }));

    expect(screen.getByRole("dialog", { name: "Assistant settings" })).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toHaveValue(PROVIDER_DEFAULTS.huggingface.model);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByText("Proveedor")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "OpenAI" }));

    expect(screen.getByLabelText("Model")).toHaveValue("gpt-5.1");
  });

  it("shows a provider-specific API key link only when the key is empty", async () => {
    const user = userEvent.setup();
    render(
      <ConfigPopover
        config={PROVIDER_DEFAULTS.huggingface}
        remember
        onChange={vi.fn()}
        apiKeys={{ huggingface: "", openai: "", nvidia: "" }}
        models={{
          huggingface: PROVIDER_DEFAULTS.huggingface.model,
          openai: PROVIDER_DEFAULTS.openai.model,
          nvidia: PROVIDER_DEFAULTS.nvidia.model,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Configure assistant provider" }));

    expect(screen.getByRole("link", { name: "Get HuggingFace API key" })).toHaveAttribute(
      "href",
      "https://huggingface.co/settings/tokens",
    );

    await user.click(screen.getByRole("button", { name: "OpenAI" }));
    expect(screen.getByRole("link", { name: "Get OpenAI API key" })).toHaveAttribute(
      "href",
      "https://platform.openai.com/api-keys",
    );

    await user.click(screen.getByRole("button", { name: "Nvidia" }));
    expect(screen.getByRole("link", { name: "Get Nvidia API key" })).toHaveAttribute(
      "href",
      "https://build.nvidia.com/settings/api-keys",
    );

    await user.type(screen.getByLabelText("API key"), "nvapi-test");
    expect(screen.queryByRole("link", { name: "Get Nvidia API key" })).not.toBeInTheDocument();
  });
});
