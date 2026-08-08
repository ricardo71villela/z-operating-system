import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VehicleDetailClient } from "@/components/vehicle/VehicleDetailClient";
import {
  getVehicleBySlug,
  getVehicles,
} from "@/services/vehicles";

type VehiclePageProps = {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
};

export const revalidate = 60;

export async function generateMetadata({
  params,
}: VehiclePageProps): Promise<Metadata> {
  const { slug } = await params;
  const vehicle = await getVehicleBySlug(slug);

  if (!vehicle) {
    return {
      title: "Vehicle not found | Z Mobility",
    };
  }

  const vehicleName = [
    vehicle.brand,
    vehicle.model,
    vehicle.versionName,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title: `${vehicleName} for Sale | Z Mobility`,
    description: `${vehicle.year} ${vehicleName} with ${vehicle.mileageKm.toLocaleString(
      "en-GB",
    )} km, available in ${
      vehicle.city
        ? `${vehicle.city}, ${vehicle.country}`
        : vehicle.country
    }.`,
  };
}

export default async function VehiclePage({
  params,
}: VehiclePageProps) {
  const { slug } = await params;

  const [vehicle, vehicles] = await Promise.all([
    getVehicleBySlug(slug),
    getVehicles(),
  ]);

  if (!vehicle) {
    notFound();
  }

  const similar = vehicles
    .filter((item) => item.slug !== vehicle.slug)
    .sort((a, b) => {
      const aScore =
        Number(a.brand === vehicle.brand) * 2 +
        Number(a.fuel === vehicle.fuel);

      const bScore =
        Number(b.brand === vehicle.brand) * 2 +
        Number(b.fuel === vehicle.fuel);

      return bScore - aScore;
    })
    .slice(0, 3);

  return (
    <VehicleDetailClient
      vehicle={vehicle}
      similar={similar}
    />
  );
}