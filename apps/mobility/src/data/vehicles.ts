import type { MarketplaceVehicle } from "@z-mobility/automotive-domain";

/**
 * Development-only marketplace fixtures using the same contract as production.
 * The UI no longer defines a second Vehicle type.
 */
export const vehicles: MarketplaceVehicle[] = [
  {
    id: "fixture-porsche-911-turbo-s-2024",
    versionId: null,
    dealerOrganizationId: null,
    slug: "porsche-911-turbo-s-2024",
    brand: "Porsche",
    model: "911",
    versionName: "Turbo S",
    year: 2024,
    mileageKm: 4800,
    powerHp: 650,
    powerKw: null,
    fuel: "Petrol",
    transmission: "Automatic",
    country: "Portugal",
    city: "Porto",
    price: 289900,
    currency: "EUR",
    verificationStatus: "verified",
    featured: true,
    status: "published",
    mainImageUrl: null,
    createdAt: "",
    updatedAt: "",
  },
];
