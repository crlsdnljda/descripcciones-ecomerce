import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { products } from "@/core/db/schema";
import { eq } from "drizzle-orm";

// GET /api/projects/[projectId]/refs — return all externalIds for the project
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const rows = await db
    .select({ externalId: products.externalId })
    .from(products)
    .where(eq(products.projectId, projectId));

  const refs = rows.map((r) => r.externalId);
  return NextResponse.json({ refs, total: refs.length });
}
