import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n, LANGUAGE_STORAGE_KEY, languages, readStoredLanguage, syncLanguage } from ".";

afterEach(() => vi.unstubAllGlobals());

describe("i18n", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("registers every declared language and exposes its catalog", () => {
    for (const { code } of languages) {
      expect(i18n.hasResourceBundle(code, "translation")).toBe(true);
    }
  });

  it("provides every CLDR plural category required by each registered locale", () => {
    const englishKeys = flattenKeys(languages.find(({ code }) => code === "en")!.translation);
    const pluralBases = new Set(
      englishKeys
        .filter((key) => /_(one|other)$/.test(key))
        .map((key) => key.replace(/_(one|other)$/, "")),
    );
    for (const { code, translation } of languages) {
      const keys = new Set(flattenKeys(translation));
      for (const base of pluralBases) {
        for (const category of new Intl.PluralRules(code).resolvedOptions().pluralCategories) {
          expect(keys, `${code} is missing ${base}_${category}`).toContain(`${base}_${category}`);
        }
      }
    }
  });

  it("supports interpolation and plural forms", () => {
    expect(i18n.t("objectsPanel.count", { count: 1 })).toBe("1 object");
    expect(i18n.t("objectsPanel.count", { count: 2 })).toBe("2 objects");
    expect(i18n.t("app.notices.objectsCreated", { count: 2 })).toBe("Created 2 objects successfully.");
  });

  it("persists a language change and synchronizes the document language", async () => {
    await i18n.changeLanguage("es");

    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("es");
    expect(document.documentElement.lang).toBe("es");
    expect(i18n.t("objectsPanel.count", { count: 1 })).toBe("1 objeto");
    expect(i18n.t("objectsPanel.count", { count: 1_000_000 })).toBe("1000000 objetos");
    expect(i18n.t("app.notices.objectsCreated", { count: 1_000_000 })).toBe("Se crearon 1000000 objetos correctamente.");
  });

  it("can initialize and synchronize without browser globals", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);

    expect(readStoredLanguage()).toBe("en");
    expect(() => syncLanguage("es")).not.toThrow();
  });
});

function flattenKeys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "string" ? [path] : flattenKeys(child as object, path);
  });
}
