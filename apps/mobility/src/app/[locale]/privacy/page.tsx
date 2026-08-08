import type { Metadata } from "next";
import { PlatformPage } from "@/components/ui/PlatformPage";

export const metadata: Metadata = { title: "Privacy at Z Mobility. | Z Mobility", description: "Our privacy framework will explain how personal information is protected and used across the platform." };

export default function Page() {
  return <PlatformPage eyebrow="Legal" title="Privacy at Z Mobility." description="Our privacy framework will explain how personal information is protected and used across the platform." primaryHref="/contact" primaryLabel="Contact us" index="P" />;
}
