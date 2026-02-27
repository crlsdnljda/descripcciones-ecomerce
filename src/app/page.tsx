"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FolderOpen,
  Plus,
  Package,
  FileText,
  Languages,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface Project {
  id: string;
  name: string;
  description: string | null;
  feedUrl: string | null;
  createdAt: string;
  _count: {
    products: number;
    descriptions: number;
    reviewed: number;
  };
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch {
      toast.error("Error al cargar proyectos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const deleteProject = async (id: string, name: string) => {
    if (!confirm(`Eliminar proyecto "${name}"? Se borrarán todos los productos y descripciones.`)) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Proyecto eliminado");
        fetchProjects();
      } else {
        toast.error("Error al eliminar");
      }
    } catch {
      toast.error("Error de conexión");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground">Cargando proyectos...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proyectos</h1>
          <p className="text-muted-foreground">
            Gestiona tus feeds de productos y genera descripciones con IA
          </p>
        </div>
        <Link
          href="/projects/new"
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo Proyecto
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-medium">No hay proyectos</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Crea tu primer proyecto para empezar a generar descripciones
          </p>
          <Link
            href="/projects/new"
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90"
          >
            <Plus className="h-4 w-4" />
            Crear proyecto
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group relative rounded-lg border border-border bg-card p-5 transition-shadow hover:shadow-md"
            >
              <button
                onClick={() => deleteProject(project.id, project.name)}
                className="absolute right-3 top-3 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                title="Eliminar proyecto"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <Link href={`/projects/${project.id}`}>
                <h3 className="mb-1 font-semibold">{project.name}</h3>
                {project.description && (
                  <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
                    {project.description}
                  </p>
                )}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" />
                    {project._count.products} productos
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {project._count.descriptions} descripciones
                  </span>
                  <span className="flex items-center gap-1">
                    <Languages className="h-3.5 w-3.5" />
                    {project._count.reviewed} revisadas
                  </span>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
