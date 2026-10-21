import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { refreshSession } from "./lib/supabase/middleware";

const intlMiddleware = createMiddleware(routing);

// Pages that need a signed-in ZOS account. The landing page (/fr) and
// /login stay public.
const PROTECTED = new Set(["today", "inbox", "tasks", "calendar", "personnel", "contacts", "leads", "team", "settings", "welcome", "invite"]);

export default async function proxy(request: NextRequest) {
  const response = intlMiddleware(request);
  // Locale redirects (/ -> /fr, /today -> /fr/today) go out as they are.
  if (response.headers.get("location")) return response;

  const userId = await refreshSession(request, response);
  const [, locale, section] = request.nextUrl.pathname.split("/");
  if (userId === null && section && PROTECTED.has(section)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  return response;
}

export const config = {
  // Corre em todos os caminhos exceto ficheiros estáticos, API e internos do Next.js
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
