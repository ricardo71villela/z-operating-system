import Link from "next/link";
import styles from "./PlatformPage.module.css";

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  index?: string;
};

export function PlatformPage({ eyebrow, title, description, primaryHref, primaryLabel, index = "Z" }: Props) {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.glow} />
        <div className={styles.content}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1>{title}</h1>
          <p className={styles.description}>{description}</p>
          <div className={styles.actions}>
            <Link href={primaryHref} className={styles.primary}>{primaryLabel} <span aria-hidden="true">→</span></Link>
            <Link href="/contact" className={styles.secondary}>Speak with our team</Link>
          </div>
        </div>
        <span className={styles.index} aria-hidden="true">{index}</span>
      </section>
      <section className={styles.statement}><p>Designed for the next chapter of premium European mobility.</p></section>
    </main>
  );
}
