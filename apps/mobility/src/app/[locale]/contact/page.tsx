import type { Metadata } from "next";
import { PlatformPage } from "@/components/ui/PlatformPage";

export const metadata: Metadata = { title: "A direct line to Z Mobility. | Z Mobility", description: "Speak with our team about sourcing, selling, dealer partnerships or the future of premium mobility." };

export default function Page() {
  return <PlatformPage eyebrow="Private client services" title="A direct line to Z Mobility." description="Speak with our team about sourcing, selling, dealer partnerships or the future of premium mobility." primaryHref="mailto:hello@zmobility.eu" primaryLabel="Contact Z Mobility" index="C" />;
}
