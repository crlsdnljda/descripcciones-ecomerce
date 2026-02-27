import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { projects, descriptions, translations, products } from "@/core/db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { DescriptionOutput } from "@/core/db/schema/descriptions";
import { toHtmlParagraphs } from "@/lib/format";

// GET /api/projects/[projectId]/export/json
export async function GET(
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

    const langs = (project.languages as string[]) || [];

    // Get reviewed descriptions with product info
    const reviewedDescs = await db
      .select({
        descId: descriptions.id,
        externalId: products.externalId,
        outputJson: descriptions.outputJson,
      })
      .from(descriptions)
      .innerJoin(products, eq(descriptions.productId, products.id))
      .where(
        and(
          eq(descriptions.projectId, projectId),
          sql`${descriptions.status} = 'reviewed'`
        )
      );

    // Get all translations for this project
    const allTranslations = await db
      .select()
      .from(translations)
      .where(
        sql`${translations.descriptionId} IN (
          SELECT id FROM descriptions WHERE project_id = ${projectId}
        )`
      );

    // Build output rows
    const rows = reviewedDescs.map((desc) => {
      const es = desc.outputJson as DescriptionOutput | null;
      const row: Record<string, unknown> = {
        Referencia: desc.externalId,
        es_des: es ? toHtmlParagraphs(es.descripcion) : "",
        es_mat: es?.materiales || {},
      };

      for (const lang of langs) {
        const trans = allTranslations.find(
          (t) => t.descriptionId === desc.descId && t.language === lang
        );
        const output = trans?.outputJson as DescriptionOutput | null;
        row[`${lang}_des`] = output ? toHtmlParagraphs(output.descripcion) : "";
        row[`${lang}_mat`] = output?.materiales || {};
      }

      return row;
    });

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error exporting JSON:", error);
    return NextResponse.json({ error: "Error exporting" }, { status: 500 });
  }
}
