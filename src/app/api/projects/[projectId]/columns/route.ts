import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { products } from "@/core/db/schema";
import { eq, sql } from "drizzle-orm";

// GET /api/projects/[projectId]/columns — get dynamic columns from product raw_data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    // Get a sample of products to extract column names
    const sampleProducts = await db
      .select({ rawData: products.rawData })
      .from(products)
      .where(eq(products.projectId, projectId))
      .limit(100);

    if (!sampleProducts.length) {
      return NextResponse.json({ columns: [] });
    }

    // Extract all unique keys from raw_data
    const columnSet = new Set<string>();
    for (const p of sampleProducts) {
      if (p.rawData && typeof p.rawData === "object") {
        Object.keys(p.rawData as Record<string, unknown>).forEach((k) =>
          columnSet.add(k)
        );
      }
    }

    const columns = Array.from(columnSet).sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );

    return NextResponse.json({ columns });
  } catch (error) {
    console.error("Error fetching columns:", error);
    return NextResponse.json({ error: "Error fetching columns" }, { status: 500 });
  }
}
