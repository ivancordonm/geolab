import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsMenu } from "./SettingsMenu";
import { LanguageProvider, useLanguage } from "../i18n/useLanguage";

function LanguageProbe() {
  const { language, setLanguage } = useLanguage();
  return <><span>{language}</span><button type="button" onClick={() => setLanguage("es")}>change</button></>;
}

describe("SettingsMenu", () => {
  it("offers theme and language controls", async () => {
    const user = userEvent.setup();
    const changeLanguage = vi.fn();
    const toggleTheme = vi.fn();
    render(<SettingsMenu language="es" onLanguageChange={changeLanguage} theme="light" onThemeToggle={toggleTheme} />);
    await user.click(screen.getByRole("button", { name: "Ajustes" }));
    await user.click(screen.getByRole("button", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Cambiar a tema oscuro" }));
    expect(changeLanguage).toHaveBeenCalledWith("en");
    expect(toggleTheme).toHaveBeenCalledOnce();
  });
});

describe("LanguageProvider", () => {
  it("changes and persists the selected browser-session language", async () => {
    const user = userEvent.setup();
    sessionStorage.clear();
    render(<LanguageProvider><LanguageProbe /></LanguageProvider>);
    expect(screen.getByText("en")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "change" }));
    expect(screen.getByText("es")).toBeInTheDocument();
    expect(sessionStorage.getItem("geolab-language")).toBe("es");
    expect(document.documentElement.lang).toBe("es");
  });
});
