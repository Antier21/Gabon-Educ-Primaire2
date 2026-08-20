import Link from "next/link";
import styles from "./PreproductionDock.module.css";
const links=[["/gabon-educ/synchronisation","Synchronisation"],["/gabon-educ/notifications","Notifications"],["/gabon-educ/import-export","Import / export"],["/gabon-educ/journal-audit","Audit"],["/gabon-educ/diagnostic","Diagnostic"]];
export function PreproductionDock(){return <nav className={styles.dock} aria-label="Outils de préproduction">{links.map(([href,label])=><Link key={href} href={href}>{label}</Link>)}</nav>}
