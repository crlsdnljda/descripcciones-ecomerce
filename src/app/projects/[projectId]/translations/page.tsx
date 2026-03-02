"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Languages, RefreshCw, Search, Trash2, Eye, X, ChevronLeft, ChevronRight } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; ref: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewRow, setViewRow] = useState<TranslationRow | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
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

  const deleteTranslations = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/translations?descriptionId=${deleteTarget.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.deleted} traducciones eliminadas de ${deleteTarget.ref}`);
        fetchData();
      } else {
        toast.error(data.error || "Error al eliminar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const filteredRows = search
    ? rows.filter((r) => r.referencia.toLowerCase().includes(search.toLowerCase()))
    : rows;

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (loading) {
    return <div className="py-10 text-center text-muted-foreground">Cargando...</div>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
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

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar referencia..."
            className="rounded-md border border-border py-1.5 pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        <span className="text-sm text-muted-foreground">
          {filteredRows.length} de {rows.length} descripciones | Idiomas: {languages.join(", ") || "ninguno"}
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

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg">
            <h3 className="mb-2 text-sm font-semibold">Eliminar traducciones</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              ¿Eliminar todas las traducciones de <span className="font-mono font-bold">{deleteTarget.ref}</span>?
              Esta acción no se puede deshacer.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={deleteTranslations}
                disabled={deleting}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {viewRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setViewRow(null)}>
          <div
            className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setViewRow(null)}
              className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="mb-4 font-mono text-lg font-bold">{viewRow.referencia}</h3>

            {/* ES description */}
            <div className="mb-4">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">es — Descripción</h4>
              <div className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">
                {viewRow.es?.descripcion || <span className="italic text-muted-foreground">Sin descripción</span>}
              </div>
            </div>

            {/* ES materials */}
            {viewRow.es?.materiales && Object.keys(viewRow.es.materiales).length > 0 && (
              <div className="mb-4">
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">es — Materiales</h4>
                <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
                  {Object.entries(viewRow.es.materiales).map(([zone, mats]) => (
                    <div key={zone}>
                      <span className="font-semibold">{zone}:</span>{" "}
                      <span className="text-muted-foreground">{(mats as string[]).join(", ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Translations */}
            {languages.map((lang) => {
              const t = viewRow.translations[lang];
              return (
                <div key={lang} className="mb-4">
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">{lang} — Descripción</h4>
                  <div className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">
                    {t?.descripcion || <span className="italic text-muted-foreground">Pendiente de traducir</span>}
                  </div>
                  {t?.materiales && Object.keys(t.materiales).length > 0 && (
                    <div className="mt-2">
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">{lang} — Materiales</h4>
                      <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
                        {Object.entries(t.materiales).map(([zone, mats]) => (
                          <div key={zone}>
                            <span className="font-semibold">{zone}:</span>{" "}
                            <span className="text-muted-foreground">{(mats as string[]).join(", ")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
        <>
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
                <th className="px-3 py-2 text-center font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row) => {
                const hasTranslations = Object.values(row.translations).some((t) => t !== null);
                return (
                  <tr key={row.descriptionId} className="border-b border-border hover:bg-muted/30 cursor-pointer" onClick={() => setViewRow(row)}>
                    <td className="px-3 py-2 font-mono text-xs font-bold">
                      <span className="flex items-center gap-1.5">
                        <Eye className="h-3 w-3 text-muted-foreground" />
                        {row.referencia}
                      </span>
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
                    <td className="px-3 py-2 text-center">
                      {hasTranslations && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: row.descriptionId, ref: row.referencia }); }}
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                          title="Eliminar traducciones"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredRows.length)} de {filteredRows.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="rounded-md border border-border p-1.5 text-sm hover:bg-muted disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3 text-sm">
                {safePage} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="rounded-md border border-border p-1.5 text-sm hover:bg-muted disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}
