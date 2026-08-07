import {useTranslations} from "next-intl";

import {Link} from "@/i18n/navigation";
import {Container} from "@/components/ui/Container";

import styles from "./Hero.module.css";

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 19 6v5c0 4.5-2.9 8.2-7 10-4.1-1.8-7-5.5-7-10V6l7-3Z" />
      <path d="m9.2 12.1 1.8 1.8 3.9-4" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5M10 12h5M10 16h5" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.4 3.5 5.4 3.5 9S14.4 18.6 12 21M12 3C9.6 5.4 8.5 8.4 8.5 12S9.6 18.6 12 21" />
    </svg>
  );
}

export function Hero() {
  const t = useTranslations("Hero");

  return (
    <section className={styles.hero}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.image} aria-hidden="true" />

      <Container className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>{t("eyebrow")}</p>

          <h1>
            {t("title")}
            <em>{t("titleAccent")}</em>
          </h1>

          <p className={styles.lead}>{t("description")}</p>

          <div className={styles.ctas}>
            <Link href="/marketplace" className={styles.primary}>
              {t("exploreMarketplace")}
              <span aria-hidden="true">→</span>
            </Link>

            <Link href="/dealers" className={styles.secondary}>
              {t("discoverDealers")}
            </Link>
          </div>

          <div className={styles.proofs} aria-label={t("benefitsLabel")}>
            <span>
              <ShieldIcon />
              {t("verifiedDealers")}
            </span>

            <i aria-hidden="true" />

            <span>
              <DocumentIcon />
              {t("transparentInformation")}
            </span>

            <i aria-hidden="true" />

            <span>
              <GlobeIcon />
              {t("europeanReach")}
            </span>
          </div>
        </div>
      </Container>
    </section>
  );
}