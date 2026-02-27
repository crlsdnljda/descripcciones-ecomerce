"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Languages, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { DescriptionOutput } from "@/core/db/schema/descriptions";

interface TranslationRow {
  descriptionId: string;
  referencia: string;
  es: DescriptionOutput | null;
  translations: Record<string, DescriptionOutput | null>;
}

export default function TranslationsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [rows, setRows] = useState<TranslationRow[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [translating, setTranslating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ total: 0, completed: 0, errors: 0 });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [transRes, projRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/translations`),
        fetch(`/api/projects/${projectId}`),
      ]);
      if (transRes.ok) setRows(await transRes.json());
      if (projRes.ok) {
        const proj = await projRes.json();
        setLanguages(proj.languages || []);
      }
    } catch {
      toast.error("Error al cargar traducciones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const startPolling = (jobId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/jobs?id=${jobId}`);
        if (!res.ok) return;
        const job = await res.json();
        setProgress({ total: job.total, completed: job.completed, errors: job.errors });
        if (job.status === "completed" || job.status === "failed") {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setTranslating(false);
          if (job.status === "completed") {
            toast.success(`Traducidas ${job.completed - job.errors}, ${job.errors} errores`);
          } else {
            toast.error("La traducción falló");
          }
          fetchData();
        }
      } catch {}
    }, 2000);
  };

  const translate = async () => {
    setTranslating(true);
    setProgress({ total: 0, completed: 0, errors: 0 });
    try {
      const res = await fetch(`/api/projects/${projectId}/translations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languages }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.jobId) {
          setProgress((p) => ({ ...p, total: data.total }));
          toast.success(data.message);
          startPolling(data.jobId);
        } else {
          // No job created (nothing to translate)
          toast.success(data.message);
          setTranslating(false);
        }
      } else {
        toast.error(data.error || "Error al traducir");
        setTranslating(false);
      }
    } catch {
      toast.error("Error de conexión");
      setTranslating(false);
    }
  };

  if (loading) {
    return <div className="py-10 text-center text-muted-foreground">Cargando...</div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={translate}
          disabled={translating}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
        >
          <Languages className="h-4 w-4" />
          {translating ? "Traduciendo..." : "Traducir Pendientes"}
        </button>

        <button
          onClick={fetchData}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" />
        </button>

        <span className="text-sm text-muted-foreground">
          {rows.length} descripciones revisadas | Idiomas: {languages.join(", ") || "ninguno"}
        </span>
      </div>

      {/* Progress bar */}
      {translating && progress.total > 0 && (
        <div className="mb-4 rounded-lg border border-border p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Traduciendo...</span>
            <span className="text-muted-foreground">
              {progress.completed + progress.errors} / {progress.total}
              {progress.errors > 0 && (
                <span className="ml-1 text-destructive">({progress.errors} errores)</span>
              )}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{
                width: `${Math.round(((progress.completed + progress.errors) / progress.total) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Procesando en segundo plano... Puedes navegar a otras pestañas.
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-muted-foreground">
            No hay descripciones revisadas para traducir.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Revisa descripciones en la pestaña &quot;Revisar&quot; primero.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">Ref</th>
                <th className="px-3 py-2 text-left font-medium">es_des</th>
                <th className="px-3 py-2 text-left font-medium">es_mat</th>
                {languages.map((lang) => (
                  <th key={`${lang}_h`} className="px-3 py-2 text-left font-medium" colSpan={2}>
                    {lang}_des / {lang}_mat
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.descriptionId} className="border-b border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs font-bold">
                    {row.referencia}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-xs" title={row.es?.descripcion}>
                    {row.es?.descripcion?.slice(0, 80)}...
                  </td>
                  <td className="max-w-[150px] truncate px-3 py-2 text-xs font-mono">
                    {row.es?.materiales ? JSON.stringify(row.es.materiales).slice(0, 60) + "..." : ""}
                  </td>
                  {languages.map((lang) => {
                    const t = row.translations[lang];
                    return (
                      <td
                        key={`${lang}_cell`}
                        colSpan={2}
                        className={`max-w-[300px] truncate px-3 py-2 text-xs ${!t ? "text-muted-foreground italic" : ""}`}
                        title={t?.descripcion}
                      >
                        {t ? (t.descripcion?.slice(0, 60) + "...") : "pendiente"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
