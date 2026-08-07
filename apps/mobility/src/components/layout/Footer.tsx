import Link from "next/link";
import { useTranslations } from "next-intl";

import { Container } from "@/components/ui/Container";
import styles from "./Footer.module.css";

const footerColumns = [
  {
    titleKey: "explore",
    links: [
      ["/marketplace", "Navigation.marketplace"],
      ["/dealers", "Navigation.dealers"],
      ["/intelligence", "Navigation.intelligence"],
      ["/magazine", "Navigation.magazine"],
    ],
  },
  {
    titleKey: "services",
    links: [
      ["/sell", "Navigation.sellYourCar"],
      ["/contact", "Footer.privateConcierge"],
      ["/sign-in", "Footer.dealerSignIn"],
      ["/compare", "Footer.compareVehicles"],
    ],
  },
  {
    titleKey: "company",
    links: [
      ["/about", "Navigation.about"],
      ["/contact", "Navigation.contact"],
      ["/privacy", "Footer.privacy"],
      ["/terms", "Footer.terms"],
    ],
  },
] as const;

export function Footer() {
  const t = useTranslations();

  return (
    <footer className={styles.footer}>
      <Container>
        <div className={styles.top}>
          <div className={styles.identity}>
            <span className={styles.eyebrow}>Z Mobility</span>
            <h2>{t("Footer.taglineTitle1")}<br />{t("Footer.taglineTitle2")}</h2>
            <p>{t("Footer.platformTagline")}</p>
          </div>

          <div className={styles.columns}>
            {footerColumns.map((column) => (
              <div key={column.titleKey}>
                <h3>{t(`Footer.${column.titleKey}`)}</h3>
                {column.links.map(([href, labelKey]) => (
                  <Link key={href} href={href}>{t(labelKey)}</Link>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.newsletter}>
          <div>
            <span>{t("Footer.newsletterLabel")}</span>
            <strong>{t("Footer.newsletterTitle")}</strong>
          </div>
          <form>
            <label>
              <span className={styles.srOnly}>{t("Footer.emailAddress")}</span>
              <input type="email" placeholder={t("Footer.emailAddress")} />
            </label>
            <button type="submit">{t("Footer.joinList")} <span aria-hidden="true">→</span></button>
          </form>
        </div>

        <div className={styles.bottom}>
          <span>{t("Footer.copyright")}</span>
          <span>{t("Footer.bottomTagline")}</span>
        </div>
      </Container>
    </footer>
  );
}
