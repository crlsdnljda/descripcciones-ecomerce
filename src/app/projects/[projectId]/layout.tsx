"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProjectTabs } from "@/components/layout/project-tabs";

interface Project {
  id: string;
  name: string;
  description: string | null;
}

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then(setProject)
      .catch(() => {});
  }, [projectId]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">
            {project?.name || "Cargando..."}
          </h1>
          {project?.description && (
            <p className="text-sm text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>
      </div>
      <ProjectTabs projectId={projectId} />
      {children}
    </div>
  );
}
