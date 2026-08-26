import createMiddleware from "next-intl/middleware";
import { routing } from "./src/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Corre em todos os caminhos exceto ficheiros estáticos, API e internos do Next.js
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
