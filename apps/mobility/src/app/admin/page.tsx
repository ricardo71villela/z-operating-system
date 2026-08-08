import type { Metadata } from "next";
import { PlatformPage } from "@/components/ui/PlatformPage";

export const metadata: Metadata = { title: "Control the Z Mobility ecosystem. | Z Mobility", description: "Vehicle publishing, dealer management, content and intelligence workflows will be managed here." };

export default function Page() {
  return <PlatformPage eyebrow="Platform administration" title="Control the Z Mobility ecosystem." description="Vehicle publishing, dealer management, content and intelligence workflows will be managed here." primaryHref="/" primaryLabel="Return home" index="A" />;
}
