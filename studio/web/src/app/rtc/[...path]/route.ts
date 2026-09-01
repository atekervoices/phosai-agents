import { NextRequest, NextResponse } from "next/server";

const getVoiceServerHost = () =>
  process.env.INTERNAL_VOICE_SERVER_URL ||
  process.env.VOICE_SERVER_URL ||
  "http://voice-server:8300";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await context.params;
    const subpath = path.join("/");
    const targetUrl = new URL(
      `/rtc/${subpath}`,
      getVoiceServerHost().replace(/\/$/, "") + "/"
    );
    targetUrl.search = request.nextUrl.search;

    const res = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: request.headers,
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
      return NextResponse.json(data, { status: res.status });
    } catch {
      return new NextResponse(text, {
        status: res.status,
        headers: { "Content-Type": res.headers.get("Content-Type") || "text/plain" },
      });
    }
  } catch (error) {
    console.error("[RTC Proxy] GET failed:", error);
    return NextResponse.json({ error: "RTC server unavailable" }, { status: 502 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await context.params;
    const subpath = path.join("/");
    const targetUrl = new URL(
      `/rtc/${subpath}`,
      getVoiceServerHost().replace(/\/$/, "") + "/"
    );
    targetUrl.search = request.nextUrl.search;

    const body = await request.text();

    const res = await fetch(targetUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: body || undefined,
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
      return NextResponse.json(data, { status: res.status });
    } catch {
      return new NextResponse(text, {
        status: res.status,
        headers: { "Content-Type": res.headers.get("Content-Type") || "text/plain" },
      });
    }
  } catch (error) {
    console.error("[RTC Proxy] POST failed:", error);
    return NextResponse.json({ error: "RTC server unavailable" }, { status: 502 });
  }
}
