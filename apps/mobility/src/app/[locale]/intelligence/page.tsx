import type { Metadata } from "next";
import { PlatformPage } from "@/components/ui/PlatformPage";

export const metadata: Metadata = { title: "Clarity for every premium vehicle decision. | Z Mobility", description: "Z Intelligence will combine market context, valuation signals and vehicle-specific insight in one premium decision layer." };

export default function Page() {
  return <PlatformPage eyebrow="Data-led mobility" title="Clarity for every premium vehicle decision." description="Z Intelligence will combine market context, valuation signals and vehicle-specific insight in one premium decision layer." primaryHref="/marketplace" primaryLabel="Explore the marketplace" index="I" />;
}
