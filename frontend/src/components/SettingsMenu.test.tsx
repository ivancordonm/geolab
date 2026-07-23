import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsMenu } from "./SettingsMenu";
import { i18n, languages } from "../i18n";

describe("SettingsMenu", () => {
  it("offers theme and language controls", async () => {
    const user = userEvent.setup();
    const toggleTheme = vi.fn();
    await i18n.changeLanguage("es");
    render(<SettingsMenu theme="light" onThemeToggle={toggleTheme} />);
    await user.click(screen.getByRole("button", { name: "Ajustes" }));
    await user.click(screen.getByRole("button", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(i18n.resolvedLanguage).toBe("en");
    expect(toggleTheme).toHaveBeenCalledOnce();
  });

  it("renders registered languages and persists changes across browser sessions", async () => {
    localStorage.clear();
    await i18n.changeLanguage("en");
    const user = userEvent.setup();
    render(<SettingsMenu theme="light" onThemeToggle={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("group", { name: "Language" }).querySelector(".grid-cols-2")).not.toBeNull();
    for (const { nativeName } of languages) expect(screen.getByRole("button", { name: nativeName })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Español" }));
    expect(localStorage.getItem("geolab-language")).toBe("es");
    expect(document.documentElement.lang).toBe("es");
  });
});
