import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Z Intelligence",
  description: "Z Intelligence — ZOS vertical product (scaffold).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
