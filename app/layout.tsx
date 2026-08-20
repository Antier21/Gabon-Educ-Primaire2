import type { Metadata } from "next";
import "./globals.css";
import { PRODUCT } from "@/lib/product-edition";

export const metadata: Metadata = {
  title: `${PRODUCT.name} — L'éducation gabonaise augmentée`,
  description: `Plateforme APC pour les ${PRODUCT.audience} du Gabon.`,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
