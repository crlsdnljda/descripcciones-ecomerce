import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { products, projects } from "@/core/db/schema";
import { eq, sql, asc, desc } from "drizzle-orm";

// GET /api/projects/[projectId]/products — list products with pagination + search + sort
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const search = searchParams.get("search") || "";
  const sortCol = searchParams.get("sortCol") || "";
  const sortDir = searchParams.get("sortDir") || "asc";
  const offset = (page - 1) * limit;

  try {
    // Fetch project to get idColumn mapping
    const [project] = await db
      .select({ idColumn: projects.idColumn })
      .from(projects)
      .where(eq(projects.id, projectId));
    const idColumn = project?.idColumn;

    // Build ORDER BY — numeric-aware sorting
    let orderExpr;
    if (sortCol === "__ref" || sortCol === "externalId") {
      if (idColumn) {
        // Sort by mapped reference (rawData[idColumn])
        const safeCol = sql.raw(`'${idColumn.replace(/'/g, "''")}'`);
        orderExpr = sortDir === "desc"
          ? sql`CASE WHEN raw_data->>${safeCol} ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_data->>${safeCol})::numeric ELSE NULL END DESC NULLS LAST, raw_data->>${safeCol} DESC NULLS LAST`
          : sql`CASE WHEN raw_data->>${safeCol} ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_data->>${safeCol})::numeric ELSE NULL END ASC NULLS LAST, raw_data->>${safeCol} ASC NULLS LAST`;
      } else {
        // Fallback to externalId
        orderExpr = sortDir === "desc"
          ? sql`CASE WHEN external_id ~ '^[0-9]+(\.[0-9]+)?$' THEN external_id::numeric ELSE NULL END DESC NULLS LAST, external_id DESC`
          : sql`CASE WHEN external_id ~ '^[0-9]+(\.[0-9]+)?$' THEN external_id::numeric ELSE NULL END ASC NULLS LAST, external_id ASC`;
      }
    } else if (sortCol) {
      const col = sql.raw(`'${sortCol.replace(/'/g, "''")}'`);
      // Sort JSONB field: numeric first, fallback to text
      orderExpr = sortDir === "desc"
        ? sql`CASE WHEN raw_data->>${col} ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_data->>${col})::numeric ELSE NULL END DESC NULLS LAST, raw_data->>${col} DESC NULLS LAST`
        : sql`CASE WHEN raw_data->>${col} ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_data->>${col})::numeric ELSE NULL END ASC NULLS LAST, raw_data->>${col} ASC NULLS LAST`;
    } else {
      if (idColumn) {
        const safeCol = sql.raw(`'${idColumn.replace(/'/g, "''")}'`);
        orderExpr = sql`CASE WHEN raw_data->>${safeCol} ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_data->>${safeCol})::numeric ELSE NULL END ASC NULLS LAST, raw_data->>${safeCol} ASC NULLS LAST`;
      } else {
        orderExpr = sql`CASE WHEN external_id ~ '^[0-9]+(\.[0-9]+)?$' THEN external_id::numeric ELSE NULL END ASC NULLS LAST, external_id ASC`;
      }
    }

    // Build WHERE with optional search — include mapped idColumn
    let whereClause;
    if (search) {
      const searchConditions = [
        sql`${products.externalId} ILIKE ${`%${search}%`}`,
        sql`raw_data->>'title' ILIKE ${`%${search}%`}`,
        sql`raw_data->>'reference' ILIKE ${`%${search}%`}`,
        sql`raw_data->>'category' ILIKE ${`%${search}%`}`,
      ];
      if (idColumn) {
        const safeCol = sql.raw(`'${idColumn.replace(/'/g, "''")}'`);
        searchConditions.push(sql`raw_data->>${safeCol} ILIKE ${`%${search}%`}`);
      }
      whereClause = sql`${products.projectId} = ${projectId} AND (${sql.join(searchConditions, sql` OR `)})`;
    } else {
      whereClause = eq(products.projectId, projectId);
    }

    const allProducts = await db
      .select()
      .from(products)
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(limit)
      .offset(offset);

    // Get total count (with search filter)
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(whereClause);

    return NextResponse.json({
      products: allProducts,
      idColumn: idColumn || null,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ error: "Error fetching products" }, { status: 500 });
  }
}
