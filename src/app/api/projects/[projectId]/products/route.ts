import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { products } from "@/core/db/schema";
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
    // Build ORDER BY — numeric-aware sorting
    let orderExpr;
    if (sortCol === "__ref" || sortCol === "externalId") {
      // Sort externalId numerically when possible, fallback to text
      orderExpr = sortDir === "desc"
        ? sql`CASE WHEN external_id ~ '^[0-9]+(\.[0-9]+)?$' THEN external_id::numeric ELSE NULL END DESC NULLS LAST, external_id DESC`
        : sql`CASE WHEN external_id ~ '^[0-9]+(\.[0-9]+)?$' THEN external_id::numeric ELSE NULL END ASC NULLS LAST, external_id ASC`;
    } else if (sortCol) {
      const col = sql.raw(`'${sortCol.replace(/'/g, "''")}'`);
      // Sort JSONB field: numeric first, fallback to text
      orderExpr = sortDir === "desc"
        ? sql`CASE WHEN raw_data->>${col} ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_data->>${col})::numeric ELSE NULL END DESC NULLS LAST, raw_data->>${col} DESC NULLS LAST`
        : sql`CASE WHEN raw_data->>${col} ~ '^[0-9]+(\.[0-9]+)?$' THEN (raw_data->>${col})::numeric ELSE NULL END ASC NULLS LAST, raw_data->>${col} ASC NULLS LAST`;
    } else {
      orderExpr = sql`CASE WHEN external_id ~ '^[0-9]+(\.[0-9]+)?$' THEN external_id::numeric ELSE NULL END ASC NULLS LAST, external_id ASC`;
    }

    // Build WHERE with optional search
    const whereClause = search
      ? sql`${products.projectId} = ${projectId} AND (
          ${products.externalId} ILIKE ${`%${search}%`}
          OR raw_data->>'title' ILIKE ${`%${search}%`}
          OR raw_data->>'reference' ILIKE ${`%${search}%`}
          OR raw_data->>'category' ILIKE ${`%${search}%`}
        )`
      : eq(products.projectId, projectId);

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
