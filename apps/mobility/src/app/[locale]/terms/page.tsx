import type { Metadata } from "next";
import { PlatformPage } from "@/components/ui/PlatformPage";

export const metadata: Metadata = { title: "Terms of use. | Z Mobility", description: "The platform terms will define access, listings, dealer participation and use of Z Mobility services." };

export default function Page() {
  return <PlatformPage eyebrow="Legal" title="Terms of use." description="The platform terms will define access, listings, dealer participation and use of Z Mobility services." primaryHref="/contact" primaryLabel="Contact us" index="T" />;
}
