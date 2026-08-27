/** Retire les éléments qui ne font pas partie du chemin URL. */
function pathnameOnly(value: string): string {
  return value.split(/[?#]/, 1)[0] || "/";
}

/**
 * Un préfixe correspond à sa route exacte ou à une véritable sous-route.
 * Ainsi, `/notes` couvre `/notes/classe-a`, mais jamais `/notes-inconnues`.
 */
export function matchesRoutePath(pathname: string, prefix: string): boolean {
  const path = pathnameOnly(pathname);
  return path === prefix || path.startsWith(`${prefix}/`);
}
