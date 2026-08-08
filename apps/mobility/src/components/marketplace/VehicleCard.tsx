"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale } from "next-intl";
import type { MarketplaceVehicle } from "@z-mobility/automotive-domain";
import styles from "./VehicleCard.module.css";

type VehicleCardProps = {
  vehicle: MarketplaceVehicle;
  view: "grid" | "list";
  favorite: boolean;
  onFavorite: (slug: string) => void;
};

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("en-GB");

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 19 6v5c0 4.5-2.9 8.2-7 10-4.1-1.8-7-5.5-7-10V6l7-3Z" />
      <path d="m9.2 12.1 1.8 1.8 3.9-4" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    </svg>
  );
}

export function VehicleCard({
  vehicle,
  view,
  favorite,
  onFavorite,
}: VehicleCardProps) {
  const locale = useLocale();

  const modelName = [vehicle.model, vehicle.versionName]
    .filter(Boolean)
    .join(" ");

  const vehicleHref = `/${locale}/vehicles/${vehicle.slug}`;

  return (
    <article
      className={`${styles.card} ${
        view === "list" ? styles.list : ""
      }`}
    >
      <div className={styles.mediaWrap}>
        <Link
          href={vehicleHref}
          className={styles.media}
          aria-label={`View ${vehicle.brand} ${modelName}`}
        >
          <Image
            src={vehicle.mainImageUrl || "/hero/hero-car.webp"}
            alt={`${vehicle.brand} ${modelName}`}
            fill
            priority={Boolean(vehicle.featured)}
            sizes={
              view === "list"
                ? "(max-width: 900px) 100vw, 720px"
                : "(max-width: 760px) 100vw, (max-width: 1180px) 50vw, 38vw"
            }
            className={styles.image}
          />

          <div className={styles.imageShade} />

          <div className={styles.badges}>
            {vehicle.featured ? (
              <span className={styles.featured}>Featured</span>
            ) : null}

            {vehicle.fuel !== "Petrol" ? (
              <span className={styles.secondaryBadge}>
                {vehicle.fuel}
              </span>
            ) : null}
          </div>
        </Link>

        <button
          className={`${styles.favorite} ${
            favorite ? styles.favoriteActive : ""
          }`}
          type="button"
          onClick={() => onFavorite(vehicle.slug)}
          aria-label={
            favorite
              ? "Remove from favourites"
              : "Add to favourites"
          }
          aria-pressed={favorite}
        >
          <HeartIcon />
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.identityRow}>
          <div>
            <p className={styles.brand}>{vehicle.brand}</p>

            <h2>
              <Link href={vehicleHref}>{modelName}</Link>
            </h2>
          </div>

          <p className={styles.price}>
            {money.format(vehicle.price)}
          </p>
        </div>

        <div className={styles.assuranceRow}>
          {vehicle.verificationStatus === "verified" ? (
            <span className={styles.verified}>
              <ShieldIcon />
              Z Verified
            </span>
          ) : (
            <span />
          )}

          <span className={styles.location}>
            {vehicle.city
              ? `${vehicle.city}, ${vehicle.country}`
              : vehicle.country}
          </span>
        </div>

        <div
          className={styles.specs}
          aria-label="Vehicle specifications"
        >
          <span>{vehicle.year}</span>
          <i aria-hidden="true" />

          <span>{number.format(vehicle.mileageKm)} km</span>
          <i aria-hidden="true" />

          <span>
            {vehicle.powerHp
              ? `${vehicle.powerHp} hp`
              : "—"}
          </span>
          <i aria-hidden="true" />

          <span>{vehicle.transmission}</span>
        </div>

        <Link href={vehicleHref} className={styles.cta}>
          <span>View vehicle</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}