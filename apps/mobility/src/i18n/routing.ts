import {defineRouting} from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "fr", "de", "es", "pt"],
  defaultLocale: "en",
  localePrefix: "always",
});