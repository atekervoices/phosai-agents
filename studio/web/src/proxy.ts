import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/dashboard(.*)",
  "/admin(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health",
  "/embed(.*)",
  "/embed.js",
  "/(.*).(png|jpg|jpeg|svg|ico|css|js)",
]);

const clerkHandler = clerkMiddleware(async (auth, req) => {
  // Direct Server-Side Redirects for Root and Dashboard Base
  if (req.nextUrl.pathname === "/" || req.nextUrl.pathname === "/dashboard") {
    return NextResponse.redirect(new URL("/dashboard/default", req.url));
  }

  if (req.nextUrl.pathname.startsWith("/api-proxy/")) {
    // 1. Direct proxy to Rust voice-server for sessions and WebRTC signaling
    if (req.nextUrl.pathname.startsWith("/api-proxy/voice/") || req.nextUrl.pathname.startsWith("/api-proxy/rtc/")) {
      const voiceServerBase = process.env.INTERNAL_VOICE_SERVER_URL || process.env.VOICE_SERVER_URL || "http://voice-server:8300";
      const subpath = req.nextUrl.pathname.replace(/^\/api-proxy/, "");
      const targetUrl = new URL(subpath.startsWith("/") ? subpath.slice(1) : subpath, voiceServerBase.endsWith("/") ? voiceServerBase : `${voiceServerBase}/`);
      targetUrl.search = req.nextUrl.search;
      return NextResponse.rewrite(targetUrl, {
        request: { headers: req.headers },
      });
    }

    let userId: string | null = null;
    let orgId: string | null = null;
    let isAdmin = false;
    try {
      const authObj = await auth();
      userId = authObj.userId ?? null;
      orgId = authObj.orgId ?? null;
      const sessionClaims = authObj.sessionClaims;
      const publicRole = String(
        (sessionClaims as any)?.metadata?.role ||
          (sessionClaims as any)?.publicMetadata?.role ||
          ""
      ).toLowerCase();
      const userEmail = String(
        (sessionClaims as any)?.email ||
          (sessionClaims as any)?.email_address ||
          ""
      );
      const adminEmail = (
        process.env.ADMIN_EMAIL ||
        process.env.NEXT_PUBLIC_ADMIN_EMAIL ||
        "simonallanachuka@gmail.com"
      ).toLowerCase();
      isAdmin =
        publicRole === "admin" ||
        (Boolean(userEmail) && userEmail.toLowerCase() === adminEmail);
    } catch {
      /* fallback */
    }
    const apiKey = process.env.STUDIO_API_KEY;
    const backendUrlString = process.env.BACKEND_API_URL || "http://studio-api:8000";
    let subpath = req.nextUrl.pathname.replace(/^\/api-proxy/, "");
    if (!subpath.startsWith("/api/")) {
      subpath = `/api${subpath.startsWith("/") ? subpath : `/${subpath}`}`;
    }
    const baseUrl = backendUrlString.endsWith("/") ? backendUrlString : `${backendUrlString}/`;
    const relativePath = subpath.startsWith("/") ? subpath.slice(1) : subpath;
    const targetUrl = new URL(relativePath, baseUrl);
    targetUrl.search = req.nextUrl.search;

    const requestHeaders = new Headers(req.headers);
    if (apiKey) requestHeaders.set("X-API-Key", apiKey);
    if (isAdmin) {
      const superAdminKey = process.env.STUDIO_SUPERADMIN_API_KEY || apiKey;
      if (superAdminKey) requestHeaders.set("X-SuperAdmin-Key", superAdminKey);
      requestHeaders.set("X-Role", "admin");
    }
    if (userId) requestHeaders.set("X-User-Id", userId);
    if (orgId) requestHeaders.set("X-Organization-Id", orgId);

    return NextResponse.rewrite(targetUrl, {
      request: { headers: requestHeaders },
    });
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  let userId: string | null = null;
  let orgId: string | null = null;
  let isAdmin = false;
  try {
    const authObj = await auth();
    userId = authObj.userId ?? null;
    orgId = authObj.orgId ?? null;
    const sessionClaims = authObj.sessionClaims;
    const publicRole = String((sessionClaims as any)?.metadata?.role || (sessionClaims as any)?.publicMetadata?.role || "").toLowerCase();
    const userEmail = String((sessionClaims as any)?.email || (sessionClaims as any)?.email_address || "");
    const hasClerkKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_SECRET_KEY);
    const adminEmail = (process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || "simonallanachuka@gmail.com").toLowerCase();
    const isDev = process.env.NODE_ENV !== "production";
    isAdmin = !hasClerkKey || isDev || publicRole === "admin" || (Boolean(userEmail) && userEmail.toLowerCase() === adminEmail);
  } catch {
    isAdmin = true;
  }

  if (req.nextUrl.pathname.startsWith("/admin") && !isAdmin) {
    return NextResponse.redirect(new URL("/dashboard/default", req.url));
  }

  return NextResponse.next();
});

export async function proxy(request: NextRequest, event: any) {
  return clerkHandler(request, event);
}

export default proxy;

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css)$).*)",
  ],
};
