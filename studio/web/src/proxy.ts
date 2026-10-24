import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL ||
  process.env.NEXT_PUBLIC_ADMIN_EMAIL ||
  "simonallanachuka@gmail.com"
).toLowerCase();

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Direct Server-Side Redirects & Dashboard Protection
  const firebaseUid = req.cookies.get("firebase_uid")?.value;

  if (pathname === "/") {
    if (!firebaseUid) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }
    return NextResponse.redirect(new URL("/dashboard/default", req.url));
  }

  if (pathname.startsWith("/dashboard")) {
    if (!firebaseUid) {
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(signInUrl);
    }
    if (pathname === "/dashboard") {
      return NextResponse.redirect(new URL("/dashboard/default", req.url));
    }
  }

  // 2. API Proxying to Rust Voice Server and Python Backend API
  if (pathname.startsWith("/api-proxy/")) {
    // 2a. Voice Server / WebRTC Signaling
    if (pathname.startsWith("/api-proxy/voice/") || pathname.startsWith("/api-proxy/rtc/")) {
      const voiceServerBase =
        process.env.INTERNAL_VOICE_SERVER_URL ||
        process.env.VOICE_SERVER_URL ||
        "http://voice-server:8300";
      const subpath = pathname.replace(/^\/api-proxy/, "");
      const targetUrl = new URL(
        subpath.startsWith("/") ? subpath.slice(1) : subpath,
        voiceServerBase.endsWith("/") ? voiceServerBase : `${voiceServerBase}/`
      );
      targetUrl.search = req.nextUrl.search;
      return NextResponse.rewrite(targetUrl, {
        request: { headers: req.headers },
      });
    }

    // 2b. FastAPI Studio Backend
    const firebaseUid = req.cookies.get("firebase_uid")?.value || req.headers.get("X-User-Id") || null;
    const firebaseRole = req.cookies.get("firebase_role")?.value || req.headers.get("X-Role") || "";
    const firebaseEmail = (req.cookies.get("firebase_email")?.value || "").toLowerCase();

    const isFirebaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    );
    const isDev = process.env.NODE_ENV !== "production";
    const isAdmin =
      !isFirebaseConfigured ||
      isDev ||
      firebaseRole === "admin" ||
      (Boolean(firebaseEmail) && firebaseEmail === ADMIN_EMAIL);

    const apiKey = process.env.STUDIO_API_KEY;
    const backendUrlString = process.env.BACKEND_API_URL || "http://studio-api:8000";
    let subpath = pathname.replace(/^\/api-proxy/, "");
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
    if (firebaseUid) requestHeaders.set("X-User-Id", firebaseUid);

    return NextResponse.rewrite(targetUrl, {
      request: { headers: requestHeaders },
    });
  }

  // 3. Admin Route Protection
  if (pathname.startsWith("/admin")) {
    const firebaseRole = req.cookies.get("firebase_role")?.value || "";
    const firebaseEmail = (req.cookies.get("firebase_email")?.value || "").toLowerCase();
    const isFirebaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    );
    const isDev = process.env.NODE_ENV !== "production";

    const isAdmin =
      !isFirebaseConfigured ||
      isDev ||
      firebaseRole === "admin" ||
      (Boolean(firebaseEmail) && firebaseEmail === ADMIN_EMAIL);

    if (!isAdmin) {
      return NextResponse.redirect(new URL("/dashboard/default", req.url));
    }
  }

  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css)$).*)",
  ],
};
