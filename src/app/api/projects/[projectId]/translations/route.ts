import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { projects, descriptions, translations, products, jobs } from "@/core/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { translateDescription } from "@/core/services/openai";
import type { DescriptionOutput } from "@/core/db/schema/descriptions";
import type { JobResult } from "@/core/db/schema/jobs";

// GET /api/projects/[projectId]/translations — list all translations
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
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

    const result = reviewedDescs.map((desc) => {
      const descTranslations = allTranslations.filter(
        (t) => t.descriptionId === desc.descId
      );
      const translationMap: Record<string, DescriptionOutput | null> = {};
      for (const t of descTranslations) {
        translationMap[t.language] = t.outputJson;
      }
      return {
        descriptionId: desc.descId,
        referencia: desc.externalId,
        es: desc.outputJson,
        translations: translationMap,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching translations:", error);
    return NextResponse.json({ error: "Error fetching translations" }, { status: 500 });
  }
}

// Background processor for translations
async function processTranslations(
  jobId: string,
  reviewedDescs: { id: string; outputJson: DescriptionOutput | null }[],
  langs: string[],
  apiKey: string,
  model: string
) {
  const results: JobResult[] = [];
  let completed = 0;
  let errorCount = 0;

  for (const desc of reviewedDescs) {
    if (!desc.outputJson) continue;

    for (const lang of langs) {
      try {
        const output = await translateDescription(
          desc.outputJson,
          lang,
          apiKey,
          model
        );

        // Delete old translation if exists, then insert new one
        await db
          .delete(translations)
          .where(
            and(
              eq(translations.descriptionId, desc.id),
              eq(translations.language, lang)
            )
          );

        await db.insert(translations).values({
          id: generateId(),
          descriptionId: desc.id,
          language: lang,
          outputJson: output,
        });

        completed++;
        results.push({ ref: `${desc.id}→${lang}`, status: "ok" });
      } catch (error) {
        errorCount++;
        const msg = error instanceof Error ? error.message : "Unknown error";
        results.push({ ref: `${desc.id}→${lang}`, status: "error", error: msg });
      }

      await db
        .update(jobs)
        .set({ completed, errors: errorCount, results, updatedAt: new Date() })
        .where(eq(jobs.id, jobId));
    }
  }

  await db
    .update(jobs)
    .set({ status: "completed", completed, errors: errorCount, results, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

// POST /api/projects/[projectId]/translations — trigger background translation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const body = await request.json();
    const { languages: requestedLangs } = body as { languages?: string[] };

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.openaiApiKey) {
      return NextResponse.json(
        { error: "No OpenAI API key configured" },
        { status: 400 }
      );
    }

    const langs = requestedLangs || (project.languages as string[]) || [];
    if (!langs.length) {
      return NextResponse.json(
        { error: "No languages configured for this project" },
        { status: 400 }
      );
    }

    // Get reviewed descriptions
    const reviewedDescs = await db
      .select()
      .from(descriptions)
      .where(
        and(
          eq(descriptions.projectId, projectId),
          sql`${descriptions.status} = 'reviewed'`
        )
      );

    if (!reviewedDescs.length) {
      return NextResponse.json({
        message: "No hay descripciones revisadas para traducir",
        translated: 0,
      });
    }

    // Count total work (descriptions × languages)
    const totalWork = reviewedDescs.length * langs.length;

    // Create job
    const jobId = generateId();
    await db.insert(jobs).values({
      id: jobId,
      projectId,
      type: "translate",
      status: "running",
      total: totalWork,
      completed: 0,
      errors: 0,
      results: [],
    });

    // Fire-and-forget
    processTranslations(
      jobId,
      reviewedDescs,
      langs,
      project.openaiApiKey,
      project.openaiModelTranslation || "gpt-4o-mini"
    ).catch((err) => {
      console.error("Background translation failed:", err);
      db.update(jobs)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(jobs.id, jobId))
        .catch(() => {});
    });

    return NextResponse.json({
      jobId,
      message: `Traducción iniciada: ${reviewedDescs.length} descripciones × ${langs.length} idiomas`,
      total: totalWork,
    });
  } catch (error) {
    console.error("Error starting translation:", error);
    return NextResponse.json({ error: "Error starting translation" }, { status: 500 });
  }
}
