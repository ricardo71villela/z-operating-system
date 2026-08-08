"use client";

import { useMemo, useState } from "react";
import type { MarketplaceVehicle } from "@z-mobility/automotive-domain";
import { VehicleCard } from "./VehicleCard";
import styles from "./Marketplace.module.css";

type View = "grid" | "list";
type Sort = "recommended" | "price-asc" | "price-desc" | "newest";

type Props = {
  vehicles: MarketplaceVehicle[];
};

export function MarketplaceClient({ vehicles }: Props) {
  const [brand, setBrand] = useState("All brands");
  const [country, setCountry] = useState("All Europe");
  const [fuel, setFuel] = useState("All powertrains");
  const [maxPrice, setMaxPrice] = useState("300000");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recommended");
  const [view, setView] = useState<View>("grid");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [mobileFilters, setMobileFilters] = useState(false);

  const brands = useMemo(
    () => [
      "All brands",
      ...Array.from(
        new Set(vehicles.map((vehicle) => vehicle.brand)),
      ).sort(),
    ],
    [vehicles],
  );

  const countries = useMemo(
    () => [
      "All Europe",
      ...Array.from(
        new Set(vehicles.map((vehicle) => vehicle.country)),
      ).sort(),
    ],
    [vehicles],
  );

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    const filtered = vehicles.filter((vehicle) => {
      const searchableText = [
        vehicle.brand,
        vehicle.model,
        vehicle.versionName ?? "",
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery =
        !normalized || searchableText.includes(normalized);

      const matchesBrand =
        brand === "All brands" || vehicle.brand === brand;

      const matchesCountry =
        country === "All Europe" || vehicle.country === country;

      const matchesFuel =
        fuel === "All powertrains" || vehicle.fuel === fuel;

      const matchesPrice =
        vehicle.price <= Number(maxPrice);

      return (
        matchesQuery &&
        matchesBrand &&
        matchesCountry &&
        matchesFuel &&
        matchesPrice
      );
    });

    return [...filtered].sort((a, b) => {
      if (sort === "price-asc") {
        return a.price - b.price;
      }

      if (sort === "price-desc") {
        return b.price - a.price;
      }

      if (sort === "newest") {
        return b.year - a.year || a.mileageKm - b.mileageKm;
      }

      return (
        Number(Boolean(b.featured)) -
        Number(Boolean(a.featured))
      );
    });
  }, [
    vehicles,
    brand,
    country,
    fuel,
    maxPrice,
    query,
    sort,
  ]);

  const toggleFavorite = (slug: string) => {
    setFavorites((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug],
    );
  };

  const reset = () => {
    setBrand("All brands");
    setCountry("All Europe");
    setFuel("All powertrains");
    setMaxPrice("300000");
    setQuery("");
  };

  return (
    <div className={styles.shell}>
      <button
        className={styles.mobileFilterButton}
        type="button"
        onClick={() => setMobileFilters(true)}
      >
        Filters <span>{results.length}</span>
      </button>

      <aside
        className={`${styles.filters} ${
          mobileFilters ? styles.filtersOpen : ""
        }`}
        aria-label="Vehicle filters"
      >
        <div className={styles.filterHeading}>
          <div>
            <span>Refine your search</span>
            <h2>Filters</h2>
          </div>

          <button
            type="button"
            onClick={() => setMobileFilters(false)}
            aria-label="Close filters"
          >
            ×
          </button>
        </div>

        <label className={styles.searchField}>
          <span>Search</span>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Brand, model or variant"
          />
        </label>

        <label>
          <span>Brand</span>

          <select
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
          >
            {brands.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Country</span>

          <select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          >
            {countries.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Powertrain</span>

          <select
            value={fuel}
            onChange={(event) => setFuel(event.target.value)}
          >
            <option>All powertrains</option>
            <option>Petrol</option>
            <option>Diesel</option>
            <option>Hybrid</option>
            <option>Plug-in Hybrid</option>
            <option>Electric</option>
            <option>Hydrogen</option>
            <option>Other</option>
          </select>
        </label>

        <label>
          <span>Maximum price</span>

          <select
            value={maxPrice}
            onChange={(event) =>
              setMaxPrice(event.target.value)
            }
          >
            <option value="150000">€150,000</option>
            <option value="200000">€200,000</option>
            <option value="250000">€250,000</option>
            <option value="300000">€300,000+</option>
          </select>
        </label>

        <div className={styles.filterActions}>
          <button type="button" onClick={reset}>
            Reset filters
          </button>

          <button
            type="button"
            onClick={() => setMobileFilters(false)}
          >
            Show {results.length} vehicles
          </button>
        </div>
      </aside>

      {mobileFilters ? (
        <button
          className={styles.scrim}
          type="button"
          aria-label="Close filters"
          onClick={() => setMobileFilters(false)}
        />
      ) : null}

      <section className={styles.results}>
        <div className={styles.toolbar}>
          <div>
            <p>
              <strong>{results.length}</strong>{" "}
              Exceptional Vehicles
            </p>

            <span>
              Selected from trusted professional dealers across
              Europe
            </span>
          </div>

          <div className={styles.toolbarActions}>
            <label>
              Sort by{" "}
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as Sort)
                }
              >
                <option value="recommended">
                  Recommended
                </option>
                <option value="newest">Newest</option>
                <option value="price-asc">
                  Price: low to high
                </option>
                <option value="price-desc">
                  Price: high to low
                </option>
              </select>
            </label>

            <div
              className={styles.viewToggle}
              aria-label="View style"
            >
              <button
                type="button"
                className={
                  view === "grid" ? styles.active : ""
                }
                onClick={() => setView("grid")}
                aria-label="Grid view"
              >
                ▦
              </button>

              <button
                type="button"
                className={
                  view === "list" ? styles.active : ""
                }
                onClick={() => setView("list")}
                aria-label="List view"
              >
                ☷
              </button>
            </div>
          </div>
        </div>

        {results.length ? (
          <div
            className={`${styles.cards} ${
              view === "list" ? styles.cardsList : ""
            }`}
          >
            {results.map((vehicle) => (
              <VehicleCard
                key={vehicle.slug}
                vehicle={vehicle}
                view={view}
                favorite={favorites.includes(vehicle.slug)}
                onFavorite={toggleFavorite}
              />
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <span>0 results</span>
            <h2>No vehicles match these filters.</h2>

            <p>
              Broaden the search or reset the filters to explore
              the complete selection.
            </p>

            <button type="button" onClick={reset}>
              Reset filters
            </button>
          </div>
        )}
      </section>
    </div>
  );
}