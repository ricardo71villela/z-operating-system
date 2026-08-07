import type { Metadata } from "next";
import { PlatformPage } from "@/components/ui/PlatformPage";

export const metadata: Metadata = { title: "Present your vehicle to Europe’s premium market. | Z Mobility", description: "A refined selling experience supported by professional presentation, qualified demand and trusted expertise." };

export default function Page() {
  return <PlatformPage eyebrow="Sell with confidence" title="Present your vehicle to Europe’s premium market." description="A refined selling experience supported by professional presentation, qualified demand and trusted expertise." primaryHref="/contact" primaryLabel="Request a valuation" index="S" />;
}
