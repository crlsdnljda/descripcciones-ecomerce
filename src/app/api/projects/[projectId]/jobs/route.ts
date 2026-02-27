import { NextRequest, NextResponse } from "next/server";
import { db } from "@/core/db";
import { jobs } from "@/core/db/schema";
import { eq, and, desc } from "drizzle-orm";

// GET /api/projects/[projectId]/jobs?id=xxx — get job status (single or latest)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const jobId = request.nextUrl.searchParams.get("id");

  try {
    if (jobId) {
      const [job] = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, jobId), eq(jobs.projectId, projectId)));

      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      return NextResponse.json(job);
    }

    // Return latest jobs
    const recent = await db
      .select()
      .from(jobs)
      .where(eq(jobs.projectId, projectId))
      .orderBy(desc(jobs.createdAt))
      .limit(10);

    return NextResponse.json(recent);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return NextResponse.json({ error: "Error fetching jobs" }, { status: 500 });
  }
}
