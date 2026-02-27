import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionToken } from "@/core/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key } = body as { key: string };

    const accessKey = process.env.ACCESS_KEY;
    if (!accessKey) {
      return NextResponse.json(
        { error: "ACCESS_KEY not configured" },
        { status: 500 }
      );
    }

    if (key !== accessKey) {
      return NextResponse.json({ error: "Invalid key" }, { status: 401 });
    }

    const cookieStore = await cookies();
    cookieStore.set("session", getSessionToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
