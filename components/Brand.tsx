import Image from "next/image";
import Link from "next/link";
import { PRODUCT } from "@/lib/product-edition";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/gabon-educ" aria-label={`Accueil ${PRODUCT.name}`}>
      <Image
        className="brand-logo"
        src="/branding/logo-gabon-educ-plus-v2.png"
        alt={`Logo ${PRODUCT.name}`}
        width={64}
        height={64}
        priority
      />
      {!compact && <span>Gabon <strong>Éduc+</strong> <small>{PRODUCT.edition === "primary" ? "Primaire" : "Secondaire"}</small></span>}
    </Link>
  );
}
