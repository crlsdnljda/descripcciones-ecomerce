import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { projects, descriptions } from "@/core/db/schema";
import { eq, sql } from "drizzle-orm";
import type { DescriptionOutput } from "@/core/db/schema/descriptions";

// GET /api/projects/[projectId]/materials — get merged materials library
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    // Get project's manual materials library
    const [project] = await db
      .select({ materialsLibrary: projects.materialsLibrary })
      .from(projects)
      .where(eq(projects.id, projectId));

    const manualLib = (project?.materialsLibrary as Record<string, string[]>) || {};

    // Get all materials from reviewed descriptions
    const reviewedDescs = await db
      .select({ outputJson: descriptions.outputJson })
      .from(descriptions)
      .where(
        sql`${descriptions.projectId} = ${projectId} AND ${descriptions.status} = 'reviewed'`
      );

    // Merge: collect all unique materials per zone
    const merged: Record<string, Set<string>> = {};

    // Add from manual library first
    for (const [zone, mats] of Object.entries(manualLib)) {
      if (!merged[zone]) merged[zone] = new Set();
      for (const m of mats) merged[zone].add(m);
    }

    // Add from reviewed descriptions
    for (const desc of reviewedDescs) {
      const output = desc.outputJson as DescriptionOutput | null;
      if (!output?.materiales) continue;
      for (const [zone, mats] of Object.entries(output.materiales)) {
        if (!merged[zone]) merged[zone] = new Set();
        if (Array.isArray(mats)) {
          for (const m of mats) merged[zone].add(m);
        }
      }
    }

    // Convert sets to sorted arrays
    const result: Record<string, string[]> = {};
    for (const [zone, mats] of Object.entries(merged)) {
      result[zone] = Array.from(mats).sort();
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching materials:", error);
    return NextResponse.json({ error: "Error fetching materials" }, { status: 500 });
  }
}

// PUT /api/projects/[projectId]/materials — update manual materials library
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const body = await request.json();
    await db
      .update(projects)
      .set({ materialsLibrary: body, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating materials library:", error);
    return NextResponse.json({ error: "Error updating materials" }, { status: 500 });
  }
}
