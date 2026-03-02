import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { projects, descriptions, translations, products, jobs } from "@/core/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { translateDescriptionBatch } from "@/core/services/openai";
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

// Collect existing translated materials per language for consistency reference
async function getExistingMaterialsRef(
  projectId: string,
  langs: string[]
): Promise<Record<string, Record<string, string[]>>> {
  const allTrans = await db
    .select({ language: translations.language, outputJson: translations.outputJson })
    .from(translations)
    .where(
      sql`${translations.descriptionId} IN (
        SELECT id FROM descriptions WHERE project_id = ${projectId}
      ) AND ${translations.language} IN (${sql.join(langs.map((l) => sql`${l}`), sql`, `)})`
    );

  const ref: Record<string, Record<string, string[]>> = {};
  for (const t of allTrans) {
    if (!t.outputJson?.materiales) continue;
    if (!ref[t.language]) ref[t.language] = {};
    for (const [zone, vals] of Object.entries(t.outputJson.materiales)) {
      const arr = Array.isArray(vals) ? vals as string[] : [String(vals)];
      if (!ref[t.language][zone]) {
        ref[t.language][zone] = [...arr];
      } else {
        for (const v of arr) {
          if (!ref[t.language][zone].includes(v)) ref[t.language][zone].push(v);
        }
      }
    }
  }
  return ref;
}

// Background processor for translations — one API call per product for all languages
async function processTranslations(
  jobId: string,
  projectId: string,
  reviewedDescs: { id: string; outputJson: DescriptionOutput | null }[],
  langs: string[],
  model: string
) {
  const results: JobResult[] = [];
  let completed = 0;
  let errorCount = 0;

  // Gather existing translated materials for consistency
  let existingMatsRef: Record<string, Record<string, string[]>> = {};
  try {
    existingMatsRef = await getExistingMaterialsRef(projectId, langs);
  } catch { /* ignore, just won't have reference */ }

  for (const desc of reviewedDescs) {
    if (!desc.outputJson) continue;

    // Find which languages still need translation for this description
    const existing = await db
      .select({ language: translations.language })
      .from(translations)
      .where(eq(translations.descriptionId, desc.id));
    const existingLangs = new Set(existing.map((e) => e.language));
    const missingLangs = langs.filter((l) => !existingLangs.has(l));

    if (!missingLangs.length) {
      completed += langs.length;
      for (const lang of langs) {
        results.push({ ref: `${desc.id}→${lang}`, status: "ok" });
      }
      await db
        .update(jobs)
        .set({ completed, errors: errorCount, results, updatedAt: new Date() })
        .where(eq(jobs.id, jobId));
      continue;
    }

    try {
      const batch = await translateDescriptionBatch(
        desc.outputJson,
        missingLangs,
        model,
        existingMatsRef
      );

      for (const lang of missingLangs) {
        const output = batch[lang];
        if (!output) {
          errorCount++;
          results.push({ ref: `${desc.id}→${lang}`, status: "error", error: "Missing from batch response" });
          continue;
        }

        await db.insert(translations).values({
          id: generateId(),
          descriptionId: desc.id,
          language: lang,
          outputJson: output,
        });

        // Update reference with new materials for next products
        if (output.materiales) {
          if (!existingMatsRef[lang]) existingMatsRef[lang] = {};
          for (const [zone, vals] of Object.entries(output.materiales)) {
            const arr = Array.isArray(vals) ? vals as string[] : [String(vals)];
            if (!existingMatsRef[lang][zone]) {
              existingMatsRef[lang][zone] = [...arr];
            } else {
              for (const v of arr) {
                if (!existingMatsRef[lang][zone].includes(v)) existingMatsRef[lang][zone].push(v);
              }
            }
          }
        }

        completed++;
        results.push({ ref: `${desc.id}→${lang}`, status: "ok" });
      }

      // Count already-existing langs as completed too
      completed += langs.length - missingLangs.length;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      for (const lang of missingLangs) {
        errorCount++;
        results.push({ ref: `${desc.id}→${lang}`, status: "error", error: msg });
      }
      completed += langs.length - missingLangs.length;
    }

    await db
      .update(jobs)
      .set({ completed, errors: errorCount, results, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
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
      projectId,
      reviewedDescs,
      langs,
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

// DELETE /api/projects/[projectId]/translations?descriptionId=xxx — delete all translations for a description
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const descriptionId = request.nextUrl.searchParams.get("descriptionId");

  if (!descriptionId) {
    return NextResponse.json({ error: "descriptionId is required" }, { status: 400 });
  }

  try {
    // Verify the description belongs to this project
    const [desc] = await db
      .select({ id: descriptions.id })
      .from(descriptions)
      .where(and(eq(descriptions.id, descriptionId), eq(descriptions.projectId, projectId)));

    if (!desc) {
      return NextResponse.json({ error: "Description not found" }, { status: 404 });
    }

    const deleted = await db
      .delete(translations)
      .where(eq(translations.descriptionId, descriptionId))
      .returning({ id: translations.id });

    return NextResponse.json({ deleted: deleted.length });
  } catch (error) {
    console.error("Error deleting translations:", error);
    return NextResponse.json({ error: "Error deleting translations" }, { status: 500 });
  }
}
