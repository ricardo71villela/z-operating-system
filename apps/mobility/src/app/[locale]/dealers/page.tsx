import type { Metadata } from "next";
import { PlatformPage } from "@/components/ui/PlatformPage";

export const metadata: Metadata = { title: "Europe’s trusted automotive professionals. | Z Mobility", description: "Discover a curated network of premium dealers selected for reputation, expertise and quality of stock." };

export default function Page() {
  return <PlatformPage eyebrow="Verified dealer network" title="Europe’s trusted automotive professionals." description="Discover a curated network of premium dealers selected for reputation, expertise and quality of stock." primaryHref="/marketplace" primaryLabel="Explore vehicles" index="D" />;
}
