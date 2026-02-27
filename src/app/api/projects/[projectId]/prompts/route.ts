import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { prompts } from "@/core/db/schema";
import { eq, and } from "drizzle-orm";
import { generateId } from "@/lib/utils";

// GET /api/projects/[projectId]/prompts
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const allPrompts = await db
      .select()
      .from(prompts)
      .where(eq(prompts.projectId, projectId))
      .orderBy(prompts.createdAt);

    return NextResponse.json(allPrompts);
  } catch (error) {
    console.error("Error fetching prompts:", error);
    return NextResponse.json({ error: "Error fetching prompts" }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/prompts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const body = await request.json();

    const [prompt] = await db
      .insert(prompts)
      .values({
        id: generateId(),
        projectId,
        name: body.name,
        content: body.content,
      })
      .returning();

    return NextResponse.json(prompt, { status: 201 });
  } catch (error) {
    console.error("Error creating prompt:", error);
    return NextResponse.json({ error: "Error creating prompt" }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/prompts (with ?id=...)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const promptId = request.nextUrl.searchParams.get("id");

  if (!promptId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const [deleted] = await db
      .delete(prompts)
      .where(and(eq(prompts.id, promptId), eq(prompts.projectId, projectId)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting prompt:", error);
    return NextResponse.json({ error: "Error deleting prompt" }, { status: 500 });
  }
}
