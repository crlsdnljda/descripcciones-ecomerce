import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { projects, products } from "@/core/db/schema";
import { eq } from "drizzle-orm";

// GET /api/projects/[projectId]/refs — return mapped references for the project
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const [project] = await db
    .select({ idColumn: projects.idColumn })
    .from(projects)
    .where(eq(projects.id, projectId));

  const idColumn = project?.idColumn;

  const rows = await db
    .select({ externalId: products.externalId, rawData: products.rawData })
    .from(products)
    .where(eq(products.projectId, projectId));

  const refs = rows.map((r) => {
    if (idColumn && r.rawData && (r.rawData as Record<string, unknown>)[idColumn] != null) {
      return String((r.rawData as Record<string, unknown>)[idColumn]);
    }
    return r.externalId;
  });

  return NextResponse.json({ refs, total: refs.length });
}
