import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { projects, products, descriptions, translations } from "@/core/db/schema";
import { eq, and } from "drizzle-orm";
import { generateDescription } from "@/core/services/openai";

// POST /api/projects/[projectId]/regenerate — regenerate a single description
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const body = await request.json();
    const { descriptionId } = body as { descriptionId: string };

    if (!descriptionId) {
      return NextResponse.json(
        { error: "descriptionId is required" },
        { status: 400 }
      );
    }

    // Get description
    const [desc] = await db
      .select()
      .from(descriptions)
      .where(
        and(eq(descriptions.id, descriptionId), eq(descriptions.projectId, projectId))
      );

    if (!desc) {
      return NextResponse.json({ error: "Description not found" }, { status: 404 });
    }

    // Get product
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, desc.productId));

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Get project for API key and model
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Use the stored prompt
    const prompt = desc.promptUsed || "";
    if (!prompt) {
      return NextResponse.json(
        { error: "No prompt found for this description" },
        { status: 400 }
      );
    }

    // Call OpenAI
    const output = await generateDescription(
      prompt,
      product.imageUrl,
      project.openaiModelGeneration || "gpt-4o",
      project.systemPrompt,
      (project.materialsLibrary as Record<string, string[]>) || null
    );

    // Delete old translations (they're based on the old description)
    await db
      .delete(translations)
      .where(eq(translations.descriptionId, descriptionId));

    // Update description with new output, reset status to generated
    const [updated] = await db
      .update(descriptions)
      .set({
        outputJson: output,
        status: "generated",
        updatedAt: new Date(),
      })
      .where(eq(descriptions.id, descriptionId))
      .returning();

    return NextResponse.json({
      id: updated.id,
      outputJson: updated.outputJson,
      status: updated.status,
    });
  } catch (error) {
    console.error("Error regenerating description:", error);
    const msg = error instanceof Error ? error.message : "Error regenerating";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
