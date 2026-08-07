import { Hero } from "@/components/home/Hero";
import { SearchPanel } from "@/components/home/SearchPanel";
import { TrustCards } from "@/components/home/TrustCards";

export default function Home() {
  return (
    <>
      <main>
        <Hero />
        <SearchPanel />
        <TrustCards />
      </main>
    </>
  );
}