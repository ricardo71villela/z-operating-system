import { MarketplaceClient } from "@/components/marketplace/MarketplaceClient";
import { Container } from "@/components/ui/Container";
import { getVehicles } from "@/services/vehicles";
import styles from "./page.module.css";

export const metadata = {
  title: "Premium Vehicle Marketplace | Z Mobility",
  description:
    "Discover verified premium vehicles offered by professional dealers across Europe.",
};

export default async function MarketplacePage() {
  const vehicles = await getVehicles();

  return (
    <main className={styles.main}>
      <section className={styles.intro}>
        <Container>
          <p className={styles.eyebrow}>Curated Collection</p>

          <div className={styles.titleRow}>
            <h1>Europe&apos;s finest vehicles.</h1>

            <p>
              Discover a carefully selected collection of verified premium
              vehicles from the continent&apos;s most trusted professional
              dealers.
            </p>
          </div>
        </Container>
      </section>

      <Container className={styles.content}>
        <MarketplaceClient vehicles={vehicles} />
      </Container>
    </main>
  );
}