import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { projects, products } from "@/core/db/schema";
import { eq } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { importFeed } from "@/core/services/feed-importer";

// POST /api/projects/[projectId]/import — import feed into products
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.feedUrl) {
      return NextResponse.json(
        { error: "No feed URL configured for this project" },
        { status: 400 }
      );
    }

    // Import the feed
    const feed = await importFeed(project.feedUrl, project.feedType || "json");

    if (!feed.records.length) {
      return NextResponse.json({
        imported: 0,
        columns: feed.columns,
        message: "Feed imported but no records found",
      });
    }

    // Determine ID column
    const idCol = project.idColumn || "id";

    // Delete existing products for this project (re-import)
    await db.delete(products).where(eq(products.projectId, projectId));

    // Insert products in batches of 100
    const batchSize = 100;
    let imported = 0;

    for (let i = 0; i < feed.records.length; i += batchSize) {
      const batch = feed.records.slice(i, i + batchSize);
      const values = batch.map((record) => {
        const externalId = String(record[idCol] ?? record["id"] ?? record["reference"] ?? `row-${i + imported}`);
        // Try configured image column, then common fallbacks
        const imageCol = project.imageColumn;
        let imageUrl: string | null = null;
        if (imageCol && record[imageCol]) {
          imageUrl = String(record[imageCol]);
        } else if (record["featured_image"]) {
          imageUrl = String(record["featured_image"]);
        } else if (record["image"]) {
          imageUrl = String(record["image"]);
        } else if (record["images[0].src"]) {
          imageUrl = String(record["images[0].src"]);
        }

        return {
          id: generateId(),
          projectId,
          externalId,
          rawData: record,
          imageUrl,
        };
      });

      await db.insert(products).values(values);
      imported += batch.length;
    }

    // Save detected columns to project if not set
    if (!project.columnMapping) {
      await db
        .update(projects)
        .set({
          columnMapping: Object.fromEntries(feed.columns.map((c) => [c, c])),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));
    }

    return NextResponse.json({
      imported,
      columns: feed.columns,
      path: feed.path,
      message: `${imported} productos importados correctamente`,
    });
  } catch (error) {
    console.error("Error importing feed:", error);
    return NextResponse.json(
      { error: `Error importing feed: ${error instanceof Error ? error.message : "Unknown"}` },
      { status: 500 }
    );
  }
}
