import { useTranslations } from "next-intl";

import { Container } from "@/components/ui/Container";
import styles from "./SearchPanel.module.css";

const fields = [
  {
    labelKey: "brand",
    name: "brand",
    firstKey: "anyBrand",
    options: ["Porsche", "Ferrari", "Mercedes-Benz", "BMW"],
  },
  {
    labelKey: "model",
    name: "model",
    firstKey: "anyModel",
    options: [],
  },
  {
    labelKey: "country",
    name: "country",
    firstKey: "allEurope",
    options: ["Portugal", "Germany", "France", "Italy"],
  },
  {
    labelKey: "maxPrice",
    name: "maxPrice",
    firstKey: "anyPrice",
    options: ["€50,000", "€100,000", "€250,000"],
  },
] as const;

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function SearchPanel() {
  const t = useTranslations("Search");

  return (
    <section className={styles.wrap} aria-label={t("ariaLabel")}>
      <Container>
        <form className={styles.panel} action="/marketplace" method="get">
          {fields.map((field) => (
            <label key={field.name}>
              <span>{t(field.labelKey)}</span>
              <select name={field.name} defaultValue="">
                <option value="">{t(field.firstKey)}</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))}

          <button type="submit">
            <SearchIcon /> {t("submit")}
          </button>
        </form>
      </Container>
    </section>
  );
}
