import type { Metadata } from "next";
import { PlatformPage } from "@/components/ui/PlatformPage";

export const metadata: Metadata = { title: "Compare exceptional vehicles with clarity. | Z Mobility", description: "Place specifications, market context and ownership essentials side by side before making your decision." };

export default function Page() {
  return <PlatformPage eyebrow="Vehicle comparison" title="Compare exceptional vehicles with clarity." description="Place specifications, market context and ownership essentials side by side before making your decision." primaryHref="/marketplace" primaryLabel="Select vehicles" index="C" />;
}
