import type { Metadata } from "next";
import { PlatformPage } from "@/components/ui/PlatformPage";

export const metadata: Metadata = { title: "Manage stock, leads and performance. | Z Mobility", description: "The dealer dashboard is being prepared as the operational centre for trusted partners." };

export default function Page() {
  return <PlatformPage eyebrow="Dealer workspace" title="Manage stock, leads and performance." description="The dealer dashboard is being prepared as the operational centre for trusted partners." primaryHref="/dealers" primaryLabel="Explore dealer network" index="D" />;
}
