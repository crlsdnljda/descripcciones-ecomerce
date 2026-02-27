import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { projects, descriptions, translations, products } from "@/core/db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { DescriptionOutput } from "@/core/db/schema/descriptions";
import { toHtmlParagraphs } from "@/lib/format";

// GET /api/projects/[projectId]/export/csv
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

    // Build headers
    const headers = ["Referencia", "es_des", "es_mat"];
    for (const lang of langs) {
      headers.push(`${lang}_des`, `${lang}_mat`);
    }

    // Get reviewed descriptions
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

    const allTranslations = await db
      .select()
      .from(translations)
      .where(
        sql`${translations.descriptionId} IN (
          SELECT id FROM descriptions WHERE project_id = ${projectId}
        )`
      );

    // Build CSV rows (comma-separated)
    const csvLines: string[] = [headers.map(escapeCsvField).join(",")];

    for (const desc of reviewedDescs) {
      const es = desc.outputJson as DescriptionOutput | null;
      const values: string[] = [
        desc.externalId,
        es ? toHtmlParagraphs(es.descripcion) : "",
        es?.materiales ? JSON.stringify(es.materiales) : "",
      ];

      for (const lang of langs) {
        const trans = allTranslations.find(
          (t) => t.descriptionId === desc.descId && t.language === lang
        );
        const output = trans?.outputJson as DescriptionOutput | null;
        values.push(output ? toHtmlParagraphs(output.descripcion) : "");
        values.push(output?.materiales ? JSON.stringify(output.materiales) : "");
      }

      csvLines.push(values.map(escapeCsvField).join(","));
    }

    const csv = csvLines.join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="export-${projectId}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting CSV:", error);
    return NextResponse.json({ error: "Error exporting" }, { status: 500 });
  }
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
