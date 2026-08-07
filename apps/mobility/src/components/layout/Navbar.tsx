"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { Container } from "@/components/ui/Container";

import styles from "./Navbar.module.css";

const primaryLinks = [
  { href: "/intelligence", key: "intelligence" },
  { href: "/magazine", key: "magazine" },
  { href: "/about", key: "about" },
  { href: "/contact", key: "contact" },
] as const;

export function Navbar() {
  const t = useTranslations("Navigation");
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [desktopMenu, setDesktopMenu] = useState<
    "marketplace" | "dealers" | null
  >(null);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <header
      className={styles.header}
      onMouseLeave={() => setDesktopMenu(null)}
    >
      <Container className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label={t("brandAriaLabel")}>
          <span className={styles.logoFrame}>
            <Image
              src="/branding/z-logo-gold.png"
              alt=""
              width={54}
              height={54}
              className={styles.logo}
              priority
            />
          </span>
          <span className={styles.wordmark}>Z MOBILITY</span>
        </Link>

        <nav className={styles.nav} aria-label={t("primaryNavigation")}>
          <button
            type="button"
            className={`${styles.navTrigger} ${isActive("/marketplace") ? styles.active : ""}`}
            onMouseEnter={() => setDesktopMenu("marketplace")}
            onFocus={() => setDesktopMenu("marketplace")}
            aria-expanded={desktopMenu === "marketplace"}
          >
            {t("marketplace")}
          </button>

          <button
            type="button"
            className={`${styles.navTrigger} ${isActive("/dealers") ? styles.active : ""}`}
            onMouseEnter={() => setDesktopMenu("dealers")}
            onFocus={() => setDesktopMenu("dealers")}
            aria-expanded={desktopMenu === "dealers"}
          >
            {t("dealers")}
          </button>

          {primaryLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(link.href) ? styles.active : undefined}
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <Link href="/sign-in" className={styles.signIn}>{t("signIn")}</Link>
          <Link href="/sell" className={styles.sell}>
            {t("sellYourCar")} <span aria-hidden="true">→</span>
          </Link>
          <button
            type="button"
            className={`${styles.menuButton} ${open ? styles.menuButtonOpen : ""}`}
            aria-label={open ? t("closeNavigation") : t("openNavigation")}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen((value) => !value)}
          >
            <span />
            <span />
          </button>
        </div>
      </Container>

      <button
        type="button"
        className={`${styles.desktopOverlay} ${
          desktopMenu ? styles.desktopOverlayVisible : ""
        }`}
        aria-label={t("closeMenu")}
        tabIndex={desktopMenu ? 0 : -1}
        onClick={() => setDesktopMenu(null)}
      />

      <div
        className={`${styles.megaMenu} ${desktopMenu ? styles.megaMenuOpen : ""}`}
        onMouseEnter={() => desktopMenu && setDesktopMenu(desktopMenu)}
      >
        {desktopMenu === "marketplace" ? (
          <Container className={styles.megaInner}>
            <div className={styles.megaIntro}>
              <span>{t("marketplace")}</span>
              <h2>{t("megaMarketplaceTitle")}</h2>
              <p>
                {t("megaMarketplaceDescription")}
              </p>

              <Link
                href="/marketplace"
                className={styles.megaPrimaryCta}
                onClick={() => setDesktopMenu(null)}
              >
                {t("megaMarketplaceCta")}
                <span>→</span>
              </Link>
            </div>

            <div className={styles.megaCards}>
              <section className={styles.megaCard}>
                <div className={styles.megaCardHeader}>
                  <span>01</span>
                  <h3>{t("megaBrowse")}</h3>
                </div>

                <div className={styles.megaCardLinks}>
                  <Link
                    href="/marketplace"
                    onClick={() => setDesktopMenu(null)}
                  >
                    {t("allVehicles")}
                    <span>→</span>
                  </Link>

                  <Link
                    href="/marketplace?sort=newest"
                    onClick={() => setDesktopMenu(null)}
                  >
                    {t("newArrivals")}
                    <span>→</span>
                  </Link>

                  <Link
                    href="/marketplace?verified=true"
                    onClick={() => setDesktopMenu(null)}
                  >
                    {t("zVerified")}
                    <span>→</span>
                  </Link>
                </div>
              </section>

              <section className={styles.megaCard}>
                <div className={styles.megaCardHeader}>
                  <span>02</span>
                  <h3>{t("megaCategories")}</h3>
                </div>

                <div className={styles.megaCardLinks}>
                  <Link
                    href="/marketplace?fuel=electric"
                    onClick={() => setDesktopMenu(null)}
                  >
                    {t("electric")}
                    <span>→</span>
                  </Link>

                  <Link
                    href="/marketplace?body=suv"
                    onClick={() => setDesktopMenu(null)}
                  >
                    {t("premiumSuvs")}
                    <span>→</span>
                  </Link>

                  <Link
                    href="/marketplace?category=performance"
                    onClick={() => setDesktopMenu(null)}
                  >
                    {t("performance")}
                    <span>→</span>
                  </Link>

                  <Link
                    href="/marketplace?category=collector"
                    onClick={() => setDesktopMenu(null)}
                  >
                    {t("collectorCars")}
                    <span>→</span>
                  </Link>
                </div>
              </section>

              <section className={`${styles.megaCard} ${styles.megaCardFeatured}`}>
                <div className={styles.megaCardHeader}>
                  <span>03</span>
                  <h3>{t("megaFeatured")}</h3>
                </div>

                <div className={styles.megaCardLinks}>
                  <Link
                    href="/marketplace?maxPrice=100000"
                    onClick={() => setDesktopMenu(null)}
                  >
                    {t("under100k")}
                    <span>→</span>
                  </Link>

                  <Link
                    href="/marketplace?category=european-icons"
                    onClick={() => setDesktopMenu(null)}
                  >
                    {t("europeanIcons")}
                    <span>→</span>
                  </Link>

                  <Link
                    href="/marketplace?featured=true"
                    onClick={() => setDesktopMenu(null)}
                  >
                    {t("editorsPicks")}
                    <span>→</span>
                  </Link>
                </div>
              </section>
            </div>
          </Container>
        ) : null}

        {desktopMenu === "dealers" ? (
          <Container className={styles.megaInner}>
            <div className={styles.megaIntro}>
              <span>{t("dealerNetworkLabel")}</span>

              <h2>{t("megaDealersTitle")}</h2>

              <p>
                {t("megaDealersDescription")}
              </p>

              <Link
                href="/dealers"
                className={styles.megaPrimaryCta}
                onClick={() => setDesktopMenu(null)}
              >
                {t("megaDealersCta")}
                <span>→</span>
              </Link>
            </div>

            <div className={styles.megaCards}>
              <section className={styles.megaCard}>
                <div className={styles.megaCardHeader}>
                  <span>01</span>
                  <h3>{t("megaCountries")}</h3>
                </div>

                <div className={styles.megaCardLinks}>
                  <Link href="/dealers/germany">{t("countryGermany")}<span>→</span></Link>
                  <Link href="/dealers/france">{t("countryFrance")}<span>→</span></Link>
                  <Link href="/dealers/italy">{t("countryItaly")}<span>→</span></Link>
                  <Link href="/dealers/spain">{t("countrySpain")}<span>→</span></Link>
                  <Link href="/dealers/portugal">{t("countryPortugal")}<span>→</span></Link>
                  <Link href="/dealers/united-kingdom">{t("countryUnitedKingdom")}<span>→</span></Link>
                </div>
              </section>

              <section className={styles.megaCard}>
                <div className={styles.megaCardHeader}>
                  <span>02</span>
                  <h3>{t("megaNetwork")}</h3>
                </div>

                <div className={styles.megaCardLinks}>
                  <Link href="/dealers">{t("allDealers")}<span>→</span></Link>
                  <Link href="/dealers?verified=true">{t("verifiedDealers")}<span>→</span></Link>
                  <Link href="/dealers?premium=true">{t("premiumPartners")}<span>→</span></Link>
                  <Link href="/dealers?recent=true">{t("recentlyJoined")}<span>→</span></Link>
                </div>
              </section>

              <section className={`${styles.megaCard} ${styles.megaCardFeatured}`}>
                <div className={styles.megaCardHeader}>
                  <span>03</span>
                  <h3>{t("megaProfessionals")}</h3>
                </div>

                <div className={styles.megaCardLinks}>
                  <Link href="/sell">{t("becomeDealer")}<span>→</span></Link>
                  <Link href="/dealer-benefits">{t("dealerBenefits")}<span>→</span></Link>
                  <Link href="/standards">{t("dealerStandards")}<span>→</span></Link>
                  <Link href="/contact">{t("contactTeam")}<span>→</span></Link>
                </div>
              </section>
            </div>
          </Container>
        ) : null}

      </div>

      <button
        type="button"
        className={`${styles.scrim} ${open ? styles.scrimVisible : ""}`}
        aria-label={t("closeNavigation")}
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
      />

      <aside
        id="mobile-navigation"
        className={`${styles.mobilePanel} ${open ? styles.mobilePanelOpen : ""}`}
        aria-hidden={!open}
      >
        <div className={styles.mobileTop}>
          <span>{t("exploreZMobility")}</span>
          <button type="button" onClick={() => setOpen(false)} aria-label={t("closeNavigation")}>×</button>
        </div>

      <nav className={styles.mobileNav} aria-label={t("mobileNavigation")}>
        {[
          { href: "/marketplace", key: "marketplace" },
          { href: "/dealers", key: "dealers" },
          ...primaryLinks,
        ].map((link, index) => (
          <Link
            key={link.href}
            href={link.href}
            className={isActive(link.href) ? styles.mobileActive : undefined}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {t(link.key)}
          </Link>
        ))}
        </nav>

        <div className={styles.mobileActions}>
          <Link href="/sell" className={styles.mobileSell}>
            {t("sellYourCar")} <span aria-hidden="true">→</span>
          </Link>
          <Link href="/sign-in" className={styles.mobileSignIn}>{t("signIn")}</Link>
        </div>

        <p className={styles.mobileTagline}>{t("tagline")}</p>
      </aside>
    </header>
  );
}
