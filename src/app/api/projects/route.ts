import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { projects, products, descriptions } from "@/core/db/schema";
import { generateId } from "@/lib/utils";
import { eq, sql, count } from "drizzle-orm";

// GET /api/projects — list all projects with counts
export async function GET() {
  try {
    const allProjects = await db.select().from(projects).orderBy(projects.createdAt);

    const result = await Promise.all(
      allProjects.map(async (p) => {
        const [productCount] = await db
          .select({ count: count() })
          .from(products)
          .where(eq(products.projectId, p.id));

        const [descCount] = await db
          .select({ count: count() })
          .from(descriptions)
          .where(eq(descriptions.projectId, p.id));

        const [reviewedCount] = await db
          .select({ count: count() })
          .from(descriptions)
          .where(
            sql`${descriptions.projectId} = ${p.id} AND ${descriptions.status} = 'reviewed'`
          );

        return {
          ...p,
          _count: {
            products: productCount?.count ?? 0,
            descriptions: descCount?.count ?? 0,
            reviewed: reviewedCount?.count ?? 0,
          },
        };
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json({ error: "Error fetching projects" }, { status: 500 });
  }
}

// POST /api/projects — create new project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = generateId();

    const [project] = await db
      .insert(projects)
      .values({
        id,
        name: body.name,
        description: body.description || null,
        feedUrl: body.feedUrl || null,
        feedType: body.feedType || "json",
        openaiApiKey: body.openaiApiKey || null,
        openaiModelGeneration: body.openaiModelGeneration || "gpt-4o",
        openaiModelTranslation: body.openaiModelTranslation || "gpt-4o-mini",
        systemPrompt: body.systemPrompt || null,
        languages: body.languages || ["fr", "pt", "de", "it"],
      })
      .returning();

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json({ error: "Error creating project" }, { status: 500 });
  }
}
