import type { Metadata } from "next";
import { PlatformPage } from "@/components/ui/PlatformPage";

export const metadata: Metadata = { title: "Your Z Mobility account. | Z Mobility", description: "Dealer and client access will centralise inventory, enquiries, saved vehicles and platform services." };

export default function Page() {
  return <PlatformPage eyebrow="Secure access" title="Your Z Mobility account." description="Dealer and client access will centralise inventory, enquiries, saved vehicles and platform services." primaryHref="/contact" primaryLabel="Request access" index="A" />;
}
