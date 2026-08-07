import type { Metadata } from "next";
import { PlatformPage } from "@/components/ui/PlatformPage";

export const metadata: Metadata = { title: "Stories, insight and the culture of mobility. | Z Mobility", description: "Independent perspectives on exceptional vehicles, European markets, design, performance and ownership." };

export default function Page() {
  return <PlatformPage eyebrow="Editorial intelligence" title="Stories, insight and the culture of mobility." description="Independent perspectives on exceptional vehicles, European markets, design, performance and ownership." primaryHref="/marketplace" primaryLabel="Discover vehicles" index="M" />;
}
