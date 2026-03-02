import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { descriptions, products, projects } from "@/core/db/schema";
import { eq, and, sql } from "drizzle-orm";

// GET /api/projects/[projectId]/descriptions — list descriptions with filters
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status"); // pending | generated | reviewed
  const search = searchParams.get("search") || "";

  try {
    const [project] = await db
      .select({ idColumn: projects.idColumn })
      .from(projects)
      .where(eq(projects.id, projectId));
    const idColumn = project?.idColumn;

    const allDescs = await db
      .select({
        id: descriptions.id,
        productId: descriptions.productId,
        externalId: products.externalId,
        rawData: products.rawData,
        imageUrl: products.imageUrl,
        categoria: sql<string | null>`COALESCE(${products.rawData}->>'categoria', ${products.rawData}->>'category', ${products.rawData}->>'product_type')`.as("categoria"),
        promptUsed: descriptions.promptUsed,
        outputJson: descriptions.outputJson,
        status: descriptions.status,
        createdAt: descriptions.createdAt,
        updatedAt: descriptions.updatedAt,
      })
      .from(descriptions)
      .innerJoin(products, eq(descriptions.productId, products.id))
      .where(
        status
          ? and(
              eq(descriptions.projectId, projectId),
              sql`${descriptions.status} = ${status}`
            )
          : eq(descriptions.projectId, projectId)
      )
      .orderBy(descriptions.createdAt);

    // Map externalId to the configured idColumn value
    const mapped = allDescs.map((d) => {
      const raw = d.rawData as Record<string, unknown>;
      const ref = idColumn && raw[idColumn] != null
        ? String(raw[idColumn])
        : d.externalId;
      return { ...d, externalId: ref };
    });

    const filtered = search
      ? mapped.filter((d) =>
          d.externalId.toLowerCase().includes(search.toLowerCase())
        )
      : mapped;

    return NextResponse.json(filtered);
  } catch (error) {
    console.error("Error fetching descriptions:", error);
    return NextResponse.json({ error: "Error fetching descriptions" }, { status: 500 });
  }
}

// PUT /api/projects/[projectId]/descriptions — update a description (review/correct)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const body = await request.json();
    const { id, outputJson, status: newStatus } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (outputJson) updateData.outputJson = outputJson;
    if (newStatus) updateData.status = newStatus;

    const [updated] = await db
      .update(descriptions)
      .set(updateData)
      .where(
        and(eq(descriptions.id, id), eq(descriptions.projectId, projectId))
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Description not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating description:", error);
    return NextResponse.json({ error: "Error updating description" }, { status: 500 });
  }
}
