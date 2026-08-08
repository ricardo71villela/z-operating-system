import type {Metadata} from "next";
import type {ReactNode} from "react";
import {notFound} from "next/navigation";
import {hasLocale, NextIntlClientProvider} from "next-intl";
import {setRequestLocale} from "next-intl/server";
import {Cormorant_Garamond, Inter} from "next/font/google";

import {Footer} from "@/components/layout/Footer";
import {Navbar} from "@/components/layout/Navbar";
import {routing} from "@/i18n/routing";

import "../globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Z Mobility — The European Mobility Platform",
  description:
    "Discover verified premium vehicles from professional dealers across Europe.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({
    locale,
  }));
}

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
};

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const {locale} = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${cormorant.variable}`}
    >
      <body>
        <NextIntlClientProvider>
          <Navbar />
          {children}
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}