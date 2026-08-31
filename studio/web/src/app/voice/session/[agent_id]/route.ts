import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ agent_id: string }> }
) {
  try {
    const { agent_id } = await context.params;
    const voiceServerHost =
      process.env.INTERNAL_VOICE_SERVER_URL ||
      process.env.VOICE_SERVER_URL ||
      "http://voice-server:8300";

    const targetUrl = `${voiceServerHost.replace(/\/$/, "")}/voice/session/${agent_id}`;

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[Voice Proxy] Failed to register session:", error);
    return NextResponse.json(
      { error: "Failed to connect to voice server" },
      { status: 502 }
    );
  }
}
