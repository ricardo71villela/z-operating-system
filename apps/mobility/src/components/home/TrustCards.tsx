import { useTranslations } from "next-intl";

import { Container } from "@/components/ui/Container";
import styles from "./TrustCards.module.css";

const items = [
  {
    number: "01",
    titleKey: "verifiedDealersTitle",
    textKey: "verifiedDealersText",
    icon: "shield",
  },
  {
    number: "02",
    titleKey: "curatedVehiclesTitle",
    textKey: "curatedVehiclesText",
    icon: "car",
  },
  {
    number: "03",
    titleKey: "europeanReachTitle",
    textKey: "europeanReachText",
    icon: "globe",
  },
] as const;

function Icon({ name }: { name: (typeof items)[number]["icon"] }) {
  if (name === "shield") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 19 6v5c0 4.5-2.9 8.2-7 10-4.1-1.8-7-5.5-7-10V6l7-3Z" />
        <path d="m9.2 12.1 1.8 1.8 3.9-4" />
      </svg>
    );
  }

  if (name === "car") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 10 1.6-4h10.8L19 10" />
        <path d="M4 10h16v7H4zM7 17v2M17 17v2" />
        <circle cx="7.5" cy="13.5" r="1" />
        <circle cx="16.5" cy="13.5" r="1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.4 3.5 5.4 3.5 9S14.4 18.6 12 21M12 3C9.6 5.4 8.5 8.4 8.5 12S9.6 18.6 12 21" />
    </svg>
  );
}

export function TrustCards() {
  const t = useTranslations("Benefits");

  return (
    <section className={styles.section} aria-label={t("ariaLabel")}>
      <Container>
        <div className={styles.grid}>
          {items.map((item) => (
            <article key={item.number}>
              <div className={styles.icon}>
                <Icon name={item.icon} />
              </div>
              <div>
                <span>{item.number}</span>
                <h2>{t(item.titleKey)}</h2>
                <p>{t(item.textKey)}</p>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
