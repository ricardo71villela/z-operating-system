import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { routing } from "@/i18n/routing";
import { DeskShell } from "@/components/desk-shell";
import "../globals.css";
import "../completion.css";
import "../brand-leads.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap", weight: ["300", "400", "500"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], variable: "--font-cormorant", display: "swap", weight: ["400", "500"], style: ["normal", "italic"] });
export const metadata: Metadata = { title: "Z Desk", description: "ZOS unified inbox and intelligent operational workspace" };
export function generateStaticParams() { return routing.locales.map((locale) => ({ locale })); }

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('Nav');
  return <html lang={locale} className={`${dmSans.variable} ${cormorant.variable}`}><body><NextIntlClientProvider><DeskShell locale={locale} labels={{ today:t('today'), inbox:t('inbox'), tasks:t('tasks'), calendar:t('calendar'), personnel:t('personnel'), contacts:t('contacts'), team:t('team'), settings:t('settings'), workspace:t('workspace'), skipToContent:t('skipToContent') }}>{children}</DeskShell></NextIntlClientProvider></body></html>;
}
