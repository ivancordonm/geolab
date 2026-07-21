# Internationalization

UI copy lives in `locales/<language>.ts` and is consumed through
`react-i18next`. English is the reference catalog; every other catalog uses
`TranslationShape<typeof en>` so TypeScript reports missing or extra keys.

To add a language:

1. Copy and translate the English catalog.
2. Add the catalog, language code, and native display name to `languages.ts`.

The settings menu is generated from that registry. `index.ts` initializes
i18next, falls back to English, persists the selected language in
`sessionStorage`, and synchronizes `<html lang>`.

Use semantic keys rather than visible strings. Dynamic values belong in
i18next interpolation (`{{value}}`), and count-dependent text must use the
CLDR plural forms required by the locale (`_one`, `_many`, `_other`, etc.).
The catalog type guarantees the reference key structure; `i18n.test.ts` also
checks that every registered locale supplies all plural categories returned by
`Intl.PluralRules`.
