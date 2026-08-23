import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Z Desk",
  description: "Agenda unificada e-mail + WhatsApp da ZOS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
