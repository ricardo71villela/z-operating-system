export type MarketplaceFuel =
  | "Petrol"
  | "Diesel"
  | "Hybrid"
  | "Plug-in Hybrid"
  | "Electric"
  | "Hydrogen"
  | "Other";

export type MarketplaceTransmission =
  | "Automatic"
  | "Manual"
  | "Semi-Automatic";

export type MarketplaceVehicleStatus =
  | "draft"
  | "pending"
  | "published"
  | "reserved"
  | "sold"
  | "archived";

export type MarketplaceVerificationStatus =
  | "verified"
  | "partially_verified"
  | "unverified"
  | "unknown";

export type MarketplaceVehicleImage = {
  id: string;
  vehicleId: string;
  storagePath: string | null;
  imageUrl: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  position: number;
  isPrimary: boolean;
  createdAt: string;
};

export type MarketplaceVehicle = {
  id: string;
  versionId: string | null;
  dealerOrganizationId: string | null;
  slug: string;
  brand: string;
  model: string;
  versionName: string | null;
  year: number;
  mileageKm: number;
  powerHp: number | null;
  powerKw: number | null;
  fuel: MarketplaceFuel;
  transmission: MarketplaceTransmission;
  country: string;
  city: string | null;
  price: number;
  currency: string;
  verificationStatus: MarketplaceVerificationStatus;
  featured: boolean;
  status: MarketplaceVehicleStatus;
  mainImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceVehicleDetail = MarketplaceVehicle & {
  images: MarketplaceVehicleImage[];
};
