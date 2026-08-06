// Resolves a public/ asset name against the configured base path (import.meta.env.BASE_URL),
// so absolute-looking references still work when the app is served from a subpath.
export function asset(name: string): string {
  return `${import.meta.env.BASE_URL}${name.replace(/^\//, '')}`
}
