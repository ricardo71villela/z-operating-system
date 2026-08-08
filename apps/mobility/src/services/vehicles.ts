import { createClient } from "@/lib/supabase/server";
import type {
  MarketplaceVehicle,
  MarketplaceVehicleDetail,
  MarketplaceVehicleImage,
} from "@z-mobility/automotive-domain";

export type { MarketplaceVehicle, MarketplaceVehicleDetail };

/** @deprecated Use MarketplaceVehicle. */
export type SupabaseVehicle = MarketplaceVehicle;
/** @deprecated Use MarketplaceVehicleDetail. */
export type SupabaseVehicleDetail = MarketplaceVehicleDetail;

type VehicleRow = {
  id: string;
  version_id: string | null;
  dealer_organization_id: string | null;
  dealer_id: string | null;
  slug: string;
  brand: string;
  model: string;
  variant: string | null;
  year: number;
  mileage: number;
  power_hp: number | null;
  power_kw: number | null;
  fuel: MarketplaceVehicle["fuel"];
  transmission: MarketplaceVehicle["transmission"];
  country: string;
  city: string | null;
  price: number;
  currency: string;
  verified: boolean;
  featured: boolean;
  status: MarketplaceVehicle["status"];
  main_image_url: string | null;
  created_at: string;
  updated_at: string;
};

type VehicleImageRow = {
  id: string;
  vehicle_id: string;
  storage_path: string | null;
  image_url: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  position: number;
  is_primary: boolean;
  created_at: string;
};

const vehicleSelect = `
  id,
  version_id,
  dealer_organization_id,
  dealer_id,
  slug,
  brand,
  model,
  variant,
  year,
  mileage,
  power_hp,
  power_kw,
  fuel,
  transmission,
  country,
  city,
  price,
  currency,
  verified,
  featured,
  status,
  main_image_url,
  created_at,
  updated_at
`;

function mapVehicleRow(row: VehicleRow): MarketplaceVehicle {
  return {
    id: row.id,
    versionId: row.version_id ?? null,
    dealerOrganizationId: row.dealer_organization_id ?? row.dealer_id ?? null,
    slug: row.slug,
    brand: row.brand,
    model: row.model,
    versionName: row.variant,
    year: row.year,
    mileageKm: row.mileage,
    powerHp: row.power_hp,
    powerKw: row.power_kw,
    fuel: row.fuel,
    transmission: row.transmission,
    country: row.country,
    city: row.city,
    price: Number(row.price),
    currency: row.currency,
    // Compatibility projection only. Trust becomes authoritative later.
    verificationStatus: row.verified ? "verified" : "unknown",
    featured: row.featured,
    status: row.status,
    mainImageUrl: row.main_image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapImageRow(row: VehicleImageRow): MarketplaceVehicleImage {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    storagePath: row.storage_path,
    imageUrl: row.image_url,
    altText: row.alt_text,
    width: row.width,
    height: row.height,
    position: row.position,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
  };
}

export async function getVehicles(): Promise<MarketplaceVehicle[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vehicles")
    .select(vehicleSelect)
    .eq("status", "published")
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Unable to load vehicles:", error);
    return [];
  }

  return (data ?? []).map((row) => mapVehicleRow(row as VehicleRow));
}

export async function getVehicleBySlug(
  slug: string,
): Promise<MarketplaceVehicleDetail | null> {
  const supabase = await createClient();

  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select(vehicleSelect)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (vehicleError) {
    console.error(`Unable to load vehicle "${slug}":`, vehicleError);
    return null;
  }

  if (!vehicle) return null;

  const { data: images, error: imagesError } = await supabase
    .from("vehicle_images")
    .select(`
      id,
      vehicle_id,
      storage_path,
      image_url,
      alt_text,
      width,
      height,
      position,
      is_primary,
      created_at
    `)
    .eq("vehicle_id", vehicle.id)
    .order("is_primary", { ascending: false })
    .order("position", { ascending: true });

  if (imagesError) {
    console.error(`Unable to load images for vehicle "${slug}":`, imagesError);
  }

  return {
    ...mapVehicleRow(vehicle as VehicleRow),
    images: (images ?? []).map((row) => mapImageRow(row as VehicleImageRow)),
  };
}
