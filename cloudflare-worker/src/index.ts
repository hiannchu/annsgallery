// Reverse proxy for annchu.me/annsgallery/* -> the "annsgallery" Cloudflare Pages
// project. Strips the /annsgallery prefix before forwarding, since the Pages
// project itself is deployed at its own root (annsgallery.pages.dev/...).
//
// Deploy with: wrangler deploy (from this directory), after setting
// PAGES_ORIGIN in wrangler.jsonc to your Pages project's *.pages.dev domain,
// and adding a Route for annchu.me/annsgallery* in the Cloudflare dashboard
// (or via the "routes" field in wrangler.jsonc).

export interface Env {
  PAGES_ORIGIN: string // e.g. "annsgallery.pages.dev"
}

const PREFIX = '/annsgallery'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === PREFIX) {
      // Normalize /annsgallery -> /annsgallery/ so relative links behave.
      url.pathname = `${PREFIX}/`
      return Response.redirect(url.toString(), 308)
    }

    const originPath = url.pathname.startsWith(PREFIX)
      ? url.pathname.slice(PREFIX.length) || '/'
      : url.pathname

    const originUrl = new URL(originPath + url.search, `https://${env.PAGES_ORIGIN}`)

    const originRequest = new Request(originUrl.toString(), request)
    originRequest.headers.set('Host', env.PAGES_ORIGIN)

    return fetch(originRequest)
  },
}
