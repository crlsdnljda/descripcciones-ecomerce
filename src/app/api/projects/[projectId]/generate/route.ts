import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { projects, products, descriptions, jobs } from "@/core/db/schema";
import { eq, and } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { generateDescription } from "@/core/services/openai";
import type { JobResult } from "@/core/db/schema/jobs";

// Background processor — runs after the response is sent
async function processGeneration(
  jobId: string,
  projectId: string,
  matchedProducts: { id: string; externalId: string; rawData: unknown; imageUrl: string | null }[],
  promptTemplate: string,
  model: string,
  systemPrompt: string | null,
  materialsLibrary: Record<string, string[]> | null
) {
  const results: JobResult[] = [];
  let completed = 0;
  let errorCount = 0;

  for (const product of matchedProducts) {
    try {
      // Replace {{variables}} in prompt
      let prompt = promptTemplate;
      const rawData = product.rawData as Record<string, unknown>;
      for (const [key, value] of Object.entries(rawData)) {
        prompt = prompt.replaceAll(`{{${key}}}`, String(value ?? ""));
      }

      const output = await generateDescription(
        prompt,
        product.imageUrl,
        model,
        systemPrompt,
        materialsLibrary
      );

      await db.insert(descriptions).values({
        id: generateId(),
        projectId,
        productId: product.id,
        promptUsed: prompt,
        outputJson: output,
        status: "generated",
      });

      completed++;
      results.push({ ref: product.externalId, status: "ok" });
    } catch (error) {
      errorCount++;
      const msg = error instanceof Error ? error.message : "Unknown error";
      results.push({ ref: product.externalId, status: "error", error: msg });
    }

    // Update job progress after each product
    await db
      .update(jobs)
      .set({ completed, errors: errorCount, results, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
  }

  // Mark job as completed
  await db
    .update(jobs)
    .set({ status: "completed", completed, errors: errorCount, results, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

// POST /api/projects/[projectId]/generate — start background generation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const body = await request.json();
    const { references, promptTemplate } = body as {
      references: string[];
      promptTemplate: string;
    };

    if (!references?.length || !promptTemplate) {
      return NextResponse.json(
        { error: "references and promptTemplate are required" },
        { status: 400 }
      );
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check for running generation jobs
    const [runningJob] = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.projectId, projectId),
          eq(jobs.type, "generate"),
          eq(jobs.status, "running")
        )
      );

    if (runningJob) {
      return NextResponse.json(
        { error: "Ya hay una generación en curso. Espera a que termine.", runningJobId: runningJob.id },
        { status: 409 }
      );
    }

    // Get products matching references
    const allProducts = await db
      .select()
      .from(products)
      .where(eq(products.projectId, projectId));

    const matchedProducts = allProducts.filter((p) =>
      references.includes(p.externalId)
    );

    const notFoundCount = references.length - matchedProducts.length;

    if (!matchedProducts.length) {
      return NextResponse.json(
        { error: `No se encontraron productos. ${notFoundCount} referencias no coinciden con ningún producto.` },
        { status: 404 }
      );
    }

    // Check existing descriptions — skip products that already have a description
    const existingDescs = await db
      .select({ id: descriptions.id, productId: descriptions.productId, status: descriptions.status })
      .from(descriptions)
      .where(eq(descriptions.projectId, projectId));

    const existingProductIds = new Set(existingDescs.map((d) => d.productId));

    // Only allow products that do NOT have any description yet
    const allowedProducts = matchedProducts.filter((p) => !existingProductIds.has(p.id));
    const skippedCount = matchedProducts.length - allowedProducts.length;

    if (!allowedProducts.length) {
      return NextResponse.json({
        jobId: null,
        message: `Las ${matchedProducts.length} referencias ya tienen descripciones (generadas o revisadas)`,
        total: 0,
        skipped: skippedCount,
      });
    }

    // Create job record
    const jobId = generateId();
    await db.insert(jobs).values({
      id: jobId,
      projectId,
      type: "generate",
      status: "running",
      total: allowedProducts.length,
      completed: 0,
      errors: 0,
      results: [],
    });

    // Fire-and-forget: start processing in background
    processGeneration(
      jobId,
      projectId,
      allowedProducts,
      promptTemplate,
      project.openaiModelGeneration || "gpt-4o",
      project.systemPrompt,
      (project.materialsLibrary as Record<string, string[]>) || null
    ).catch((err) => {
      console.error("Background generation failed:", err);
      db.update(jobs)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(jobs.id, jobId))
        .catch(() => {});
    });

    // Return immediately with job ID
    const skippedMsg = skippedCount > 0 ? ` | ${skippedCount} ya existentes` : "";
    const notFoundMsg = notFoundCount > 0 ? ` | ${notFoundCount} no encontradas` : "";
    return NextResponse.json({
      jobId,
      message: `Generación iniciada: ${allowedProducts.length} productos${skippedMsg}${notFoundMsg}`,
      total: allowedProducts.length,
      skipped: skippedCount,
      notFound: notFoundCount,
    });
  } catch (error) {
    console.error("Error starting generation:", error);
    return NextResponse.json(
      { error: "Error starting generation" },
      { status: 500 }
    );
  }
}
