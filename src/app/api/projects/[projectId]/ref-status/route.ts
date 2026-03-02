import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { products, descriptions, jobs, projects } from "@/core/db/schema";
import { eq, and } from "drizzle-orm";

// GET /api/projects/[projectId]/ref-status?refs=ref1,ref2,...
// Returns the description status for each reference
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const refsParam = request.nextUrl.searchParams.get("refs") || "";
  const refs = refsParam.split(",").filter(Boolean);

  if (!refs.length) return NextResponse.json({ statuses: {}, running: false });

  const [project] = await db
    .select({ idColumn: projects.idColumn })
    .from(projects)
    .where(eq(projects.id, projectId));
  const idColumn = project?.idColumn;

  // Get products for this project
  const prods = await db
    .select({ id: products.id, externalId: products.externalId, rawData: products.rawData })
    .from(products)
    .where(eq(products.projectId, projectId));

  // Primary index: externalId → productId
  const prodMap = new Map(prods.map((p) => [p.externalId, p.id]));

  // Secondary index: rawData[idColumn] → productId (mapped reference)
  const mappedRefMap = new Map<string, string>();
  if (idColumn) {
    for (const p of prods) {
      const rawData = p.rawData as Record<string, unknown>;
      const ref = rawData[idColumn] != null ? String(rawData[idColumn]).trim() : "";
      if (ref && !prodMap.has(ref) && !mappedRefMap.has(ref)) {
        mappedRefMap.set(ref, p.id);
      }
    }
  }

  // Get descriptions for this project
  const descs = await db
    .select({ productId: descriptions.productId, status: descriptions.status })
    .from(descriptions)
    .where(eq(descriptions.projectId, projectId));

  const descMap = new Map(descs.map((d) => [d.productId, d.status]));

  // Check for running generation job
  const [runningJob] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.projectId, projectId),
        eq(jobs.type, "generate"),
        eq(jobs.status, "running")
      )
    );

  // "none" = no description, can generate
  // "generated" = pending review, BLOCKED
  // "reviewed" = reviewed/translated, can RE-generate
  // "not_found" = reference not in products
  const statuses: Record<string, string> = {};
  for (const ref of refs) {
    const productId = prodMap.get(ref) || mappedRefMap.get(ref);
    if (!productId) {
      statuses[ref] = "not_found";
      continue;
    }
    const status = descMap.get(productId);
    if (!status) {
      statuses[ref] = "none";
    } else {
      statuses[ref] = status; // "generated" or "reviewed"
    }
  }

  return NextResponse.json({ statuses, running: !!runningJob });
}
