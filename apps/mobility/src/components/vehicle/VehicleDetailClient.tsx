"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useLocale } from "next-intl";

import type {
  MarketplaceVehicle,
  MarketplaceVehicleDetail,
} from "@z-mobility/automotive-domain";

import styles from "./VehicleDetail.module.css";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("en-GB");

type VehicleDetail = MarketplaceVehicleDetail & {
  zScore?: number;
  marketPosition?: string;
  description?: string;
  highlights?: string[];
  equipment?: Record<string, string[]>;
  dealer?: string;
  dealerResponse?: string;
};

type Props = {
  vehicle: VehicleDetail;
  similar: MarketplaceVehicle[];
};

export function VehicleDetailClient({
  vehicle,
  similar,
}: Props) {
  const [activeImage, setActiveImage] = useState(0);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(
    "Performance",
  );
  const [sent, setSent] = useState(false);

  const locale = useLocale();

  const galleryImages =
    vehicle.images.length > 0
      ? vehicle.images
      : [
          {
            id: "fallback",
            vehicleId: vehicle.id,
            storagePath: null,
            imageUrl:
              vehicle.mainImageUrl || "/hero/hero-car.webp",
            altText: `${vehicle.brand} ${vehicle.model}`,
            width: null,
            height: null,
            position: 0,
            isPrimary: true,
            createdAt: "",
          },
        ];

  const currentImage =
    galleryImages[activeImage] ?? galleryImages[0];

  const facts = [
    ["Year", String(vehicle.year)],
    ["Mileage", `${number.format(vehicle.mileageKm)} km`],
    [
      "Power",
      vehicle.powerHp ? `${vehicle.powerHp} hp` : "—",
    ],
    ["Fuel", vehicle.fuel],
    ["Transmission", vehicle.transmission],
  ];

  const vehicleName = [
    vehicle.brand,
    vehicle.model,
    vehicle.versionName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={styles.page}>
      <section className={styles.galleryShell}>
        <div className={styles.galleryTopline}>
          <Link
            href={`/${locale}/marketplace`}
            className={styles.back}
          >
            ← Back to marketplace
          </Link>

          <div className={styles.galleryActions}>
            <button
              type="button"
              onClick={() => setSaved((value) => !value)}
              className={saved ? styles.saved : ""}
              aria-pressed={saved}
            >
              <span aria-hidden="true">
                {saved ? "♥" : "♡"}
              </span>
              {saved ? "Saved" : "Save"}
            </button>

            <button
              type="button"
              onClick={() =>
                navigator.clipboard?.writeText(
                  window.location.href,
                )
              }
            >
              ↗ Share
            </button>
          </div>
        </div>

        <div className={styles.gallery}>
          <div className={styles.mainImage}>
            <Image
              src={currentImage.imageUrl}
              alt={
                currentImage.altText ??
                `${vehicle.brand} ${vehicle.model}`
              }
              fill
              priority
              sizes="100vw"
              style={{ objectFit: "cover" }}
            />

            <div className={styles.imageShade} />

            <span className={styles.photoCount}>
              {String(activeImage + 1).padStart(2, "0")} /{" "}
              {String(galleryImages.length).padStart(2, "0")}
            </span>

            <span className={styles.preview}>
              Preview photography
            </span>
          </div>

          <div className={styles.thumbnails}>
            {galleryImages.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setActiveImage(index)}
                className={
                  activeImage === index
                    ? styles.thumbActive
                    : ""
                }
                aria-label={`Open image ${index + 1}`}
                aria-pressed={activeImage === index}
              >
                <Image
                  src={image.imageUrl}
                  alt={image.altText ?? ""}
                  fill
                  sizes="180px"
                  style={{ objectFit: "cover" }}
                />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.primary}>
          <div className={styles.eyebrowRow}>
            {vehicle.verificationStatus === "verified" ? (
              <span className={styles.verified}>
                ◆ Z Verified
              </span>
            ) : (
              <span>Verification pending</span>
            )}

            <span>
              {vehicle.city
                ? `${vehicle.city}, ${vehicle.country}`
                : vehicle.country}
            </span>
          </div>

          <div className={styles.titleRow}>
            <div>
              <p className={styles.brand}>{vehicle.brand}</p>

              <h1>
                {vehicle.model}{" "}
                {vehicle.versionName ? (
                  <em>{vehicle.versionName}</em>
                ) : null}
              </h1>
            </div>

            <p className={styles.price}>
              {money.format(vehicle.price)}
            </p>
          </div>

          <p className={styles.reference}>
            Reference ZM-{vehicle.year}-
            {vehicle.slug.slice(-4).toUpperCase()} · VAT status
            available on request
          </p>

          <div className={styles.facts}>
            {facts.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <section className={styles.intelligence}>
            <div className={styles.score}>
              <span>Z Score™</span>
              <strong>{vehicle.zScore ?? 9.0}</strong>
              <small>/ 10</small>
            </div>

            <div>
              <p>Z Intelligence</p>

              <h2>
                {vehicle.marketPosition ??
                  "Strong positioning within its European market segment"}
              </h2>

              <span>
                Based on age, mileage, specification, provenance
                and advertised price. Indicative insight, not a
                valuation.
              </span>
            </div>
          </section>

          <section className={styles.section}>
            <p className={styles.kicker}>The vehicle</p>

            <h2>Performance without compromise.</h2>

            <p className={styles.description}>
              {vehicle.description ??
                `A carefully selected ${vehicleName}, presented by a verified European dealer with documented specification and provenance.`}
            </p>

            <div className={styles.highlights}>
              {(
                vehicle.highlights ?? [
                  "Verified dealer",
                  "Documented history",
                  "European vehicle",
                  "Inspection available",
                ]
              ).map((item) => (
                <span key={item}>✓ {item}</span>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <p className={styles.kicker}>Equipment</p>

            <h2>A considered specification.</h2>

            <div className={styles.accordion}>
              {Object.entries(
                vehicle.equipment ?? {
                  Performance: [
                    "Detailed equipment available on request",
                  ],
                  Comfort: [
                    "Premium interior specification",
                  ],
                  Assistance: [
                    "Driver assistance systems",
                  ],
                },
              ).map(([group, items]) => (
                <div
                  key={group}
                  className={styles.accordionItem}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded(
                        expanded === group ? null : group,
                      )
                    }
                    aria-expanded={expanded === group}
                  >
                    <span>{group}</span>
                    <span>
                      {expanded === group ? "−" : "+"}
                    </span>
                  </button>

                  {expanded === group ? (
                    <ul>
                      {items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.contactCard}>
            <p className={styles.cardKicker}>
              Verified partner
            </p>

            <h2>
              {vehicle.dealer ??
                "Z Mobility Verified Dealer"}
            </h2>

            <p className={styles.response}>
              ●{" "}
              {vehicle.dealerResponse ??
                "Usually replies within 30 minutes"}
            </p>

            <div className={styles.dealerStats}>
              <div>
                <strong>4.9</strong>
                <span>Dealer rating</span>
              </div>

              <div>
                <strong>32</strong>
                <span>Premium vehicles</span>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                setSent(true);
              }}
            >
              <label>
                Name
                <input
                  required
                  name="name"
                  placeholder="Your full name"
                />
              </label>

              <label>
                Email
                <input
                  required
                  type="email"
                  name="email"
                  placeholder="you@example.com"
                />
              </label>

              <label>
                Message
                <textarea
                  name="message"
                  defaultValue={`I am interested in the ${vehicleName}.`}
                />
              </label>

              <button type="submit">
                {sent
                  ? "Request sent ✓"
                  : "Request full details"}
              </button>
            </form>

            <div className={styles.secondaryActions}>
              <button type="button">
                Book a video call
              </button>

              <button type="button">
                Request test drive
              </button>
            </div>

            <p className={styles.disclaimer}>
              Your enquiry is sent securely to the verified
              dealer. Z Mobility does not share your details
              with unrelated third parties.
            </p>
          </div>

          <div className={styles.financeCard}>
            <span>Finance illustration</span>

            <strong>
              From{" "}
              {money.format(
                Math.round(vehicle.price * 0.0124),
              )}{" "}
              / month
            </strong>

            <p>
              Indicative only, subject to deposit, term and
              credit approval.
            </p>

            <button type="button">
              Explore finance
            </button>
          </div>
        </aside>
      </section>

      <section className={styles.similarSection}>
        <div className={styles.similarHeader}>
          <div>
            <p className={styles.kicker}>
              Curated alternatives
            </p>
            <h2>Similar vehicles</h2>
          </div>

          <Link href={`/${locale}/marketplace`}>
            View all vehicles →
          </Link>
        </div>

        <div className={styles.similarGrid}>
          {similar.map((item) => {
            const similarName = [
              item.model,
              item.versionName,
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <Link
                href={`/${locale}/vehicles/${item.slug}`}
                key={item.slug}
                className={styles.similarCard}
              >
                <div className={styles.similarMedia}>
                  <Image
                    src={
                      item.mainImageUrl ||
                      "/hero/hero-car.webp"
                    }
                    alt={`${item.brand} ${similarName}`}
                    fill
                    sizes="(max-width: 800px) 100vw, 33vw"
                    style={{ objectFit: "cover" }}
                  />
                </div>

                <div>
                  <span>{item.brand}</span>

                  <h3>
                    {item.model}{" "}
                    {item.versionName ? (
                      <em>{item.versionName}</em>
                    ) : null}
                  </h3>

                  <p>
                    {item.year} ·{" "}
                    {number.format(item.mileageKm)} km
                  </p>

                  <strong>
                    {money.format(item.price)}
                  </strong>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}