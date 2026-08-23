import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en", "es", "pt", "it", "de"],
  defaultLocale: "fr",
  localePrefix: "always",
});
