"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { Check, Search, ChevronLeft, ChevronRight, Loader2, RefreshCw, X, Plus } from "lucide-react";
import { toast } from "sonner";
import type { DescriptionOutput } from "@/core/db/schema/descriptions";

interface Description {
  id: string;
  externalId: string;
  imageUrl: string | null;
  outputJson: DescriptionOutput | null;
  status: string;
}

export default function ReviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [descriptions, setDescriptions] = useState<Description[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"generated" | "reviewed">("generated");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editDesc, setEditDesc] = useState("");
  const [editMat, setEditMat] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  // Materials library for autocomplete
  const [materialsLib, setMaterialsLib] = useState<Record<string, string[]>>({});
  const [addingTo, setAddingTo] = useState<string | null>(null); // zone name currently adding to
  const [addInput, setAddInput] = useState("");
  const [addingZone, setAddingZone] = useState(false);
  const [zoneInput, setZoneInput] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const zoneInputRef = useRef<HTMLInputElement>(null);

  // Generation job progress
  const [genProgress, setGenProgress] = useState({ total: 0, completed: 0, errors: 0 });
  const [genRunning, setGenRunning] = useState(false);
  const genPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPending = async (status?: string) => {
    setLoading(true);
    const s = status || statusFilter;
    try {
      const res = await fetch(
        `/api/projects/${projectId}/descriptions?status=${s}&search=${search}`
      );
      if (res.ok) {
        const data = await res.json();
        setDescriptions(data);
        if (data.length > 0) {
          setCurrentIndex(0);
          loadDescription(data[0]);
        }
      }
    } catch {
      toast.error("Error al cargar pendientes");
    } finally {
      setLoading(false);
    }
  };

  const loadDescription = (desc: Description) => {
    const output = desc.outputJson;
    setEditDesc(output?.descripcion || "");
    setEditMat(output?.materiales && typeof output.materiales === "object" ? output.materiales : {});
  };

  // Check for running generation jobs and poll progress
  const startGenPolling = (jobId: string) => {
    if (genPollingRef.current) clearInterval(genPollingRef.current);
    setGenRunning(true);
    genPollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/jobs?id=${jobId}`);
        if (!res.ok) return;
        const job = await res.json();
        setGenProgress({ total: job.total, completed: job.completed, errors: job.errors });
        if (job.status === "completed" || job.status === "failed") {
          clearInterval(genPollingRef.current!);
          genPollingRef.current = null;
          setGenRunning(false);
          if (job.status === "completed") {
            toast.success(`Generación completada: ${job.completed} descripciones`);
          }
          // Refresh pending descriptions when generation finishes
          fetchPending();
        }
      } catch {}
    }, 2000);
  };

  const checkRunningJob = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/jobs`);
      if (!res.ok) return;
      const recentJobs = await res.json();
      const running = recentJobs.find(
        (j: { type: string; status: string }) => j.type === "generate" && j.status === "running"
      );
      if (running) {
        setGenProgress({ total: running.total, completed: running.completed, errors: running.errors });
        startGenPolling(running.id);
      }
    } catch {}
  };

  const fetchMaterialsLib = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/materials`);
      if (res.ok) setMaterialsLib(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchPending();
    checkRunningJob();
    fetchMaterialsLib();
    return () => {
      if (genPollingRef.current) clearInterval(genPollingRef.current);
    };
  }, [projectId]);

  useEffect(() => {
    fetchPending();
  }, [statusFilter]);

  const current = descriptions[currentIndex];

  const goTo = (index: number) => {
    if (index >= 0 && index < descriptions.length) {
      setCurrentIndex(index);
      loadDescription(descriptions[index]);
    }
  };

  const regenerate = async () => {
    if (!current || regenerating) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descriptionId: current.id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${current.externalId} regenerada`);
        const output = data.outputJson as DescriptionOutput;
        if (statusFilter === "reviewed") {
          // Description moved back to "generated" — remove from reviewed list
          const updated = descriptions.filter((_, i) => i !== currentIndex);
          setDescriptions(updated);
          if (updated.length > 0) {
            const nextIdx = Math.min(currentIndex, updated.length - 1);
            setCurrentIndex(nextIdx);
            loadDescription(updated[nextIdx]);
          }
        } else {
          // Still in generated view — update in place
          setEditDesc(output?.descripcion || "");
          setEditMat(output?.materiales && typeof output.materiales === "object" ? output.materiales : {});
          setDescriptions((prev) =>
            prev.map((d) =>
              d.id === current.id ? { ...d, outputJson: output } : d
            )
          );
        }
      } else {
        toast.error(data.error || "Error al regenerar");
      }
    } catch {
      toast.error("Error de conexión al regenerar");
    } finally {
      setRegenerating(false);
    }
  };

  const saveAndApprove = async () => {
    if (!current) return;

    const outputJson: DescriptionOutput = {
      descripcion: editDesc,
      materiales: editMat,
    };

    try {
      const res = await fetch(`/api/projects/${projectId}/descriptions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: current.id,
          outputJson,
          status: "reviewed",
        }),
      });

      if (res.ok) {
        toast.success(`${current.externalId} marcada como revisada`);
        // Remove from list and go to next
        const updated = descriptions.filter((_, i) => i !== currentIndex);
        setDescriptions(updated);
        if (updated.length > 0) {
          const nextIdx = Math.min(currentIndex, updated.length - 1);
          setCurrentIndex(nextIdx);
          loadDescription(updated[nextIdx]);
        }
      } else {
        toast.error("Error al guardar");
      }
    } catch {
      toast.error("Error de conexión");
    }
  };

  if (loading) {
    return <div className="py-10 text-center text-muted-foreground">Cargando...</div>;
  }

  if (!descriptions.length) {
    return (
      <div>
        {genRunning && genProgress.total > 0 && (
          <div className="mb-4 rounded-lg border border-accent/30 bg-accent/5 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Generación en curso...
              </span>
              <span className="text-muted-foreground">
                {genProgress.completed + genProgress.errors} / {genProgress.total}
                {genProgress.errors > 0 && (
                  <span className="ml-1 text-destructive">({genProgress.errors} errores)</span>
                )}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{
                  width: `${Math.round(((genProgress.completed + genProgress.errors) / genProgress.total) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Las nuevas descripciones aparecerán aquí cuando termine la generación.
            </p>
          </div>
        )}
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">
            No hay descripciones pendientes de revisión
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {genRunning
              ? "Se están generando descripciones, aparecerán aquí al terminar."
              : "Genera descripciones primero en la pestaña \"Generar\""}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Generation in progress banner */}
      {genRunning && genProgress.total > 0 && (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent/5 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              Generación en curso...
            </span>
            <span className="text-muted-foreground">
              {genProgress.completed + genProgress.errors} / {genProgress.total}
              {genProgress.errors > 0 && (
                <span className="ml-1 text-destructive">({genProgress.errors} errores)</span>
              )}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{
                width: `${Math.round(((genProgress.completed + genProgress.errors) / genProgress.total) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Las nuevas descripciones aparecerán aquí cuando termine la generación.
          </p>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-border p-1 w-fit">
        <button
          onClick={() => setStatusFilter("generated")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            statusFilter === "generated"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Pendientes
        </button>
        <button
          onClick={() => setStatusFilter("reviewed")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            statusFilter === "reviewed"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Revisadas
        </button>
      </div>

      {/* Navigation bar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => goTo(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="rounded border border-border p-1.5 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">
            {currentIndex + 1} / {descriptions.length}{" "}
            {statusFilter === "generated" ? "pendientes" : "revisadas"}
          </span>
          <button
            onClick={() => goTo(currentIndex + 1)}
            disabled={currentIndex >= descriptions.length - 1}
            className="rounded border border-border p-1.5 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchPending()}
            placeholder="Filtrar por referencia..."
            className="rounded-md border border-border py-1.5 pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* Review card */}
      {current && (
        <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
          {/* Product image + info */}
          <div className="space-y-3">
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="mb-2 font-mono text-lg font-bold">{current.externalId}</p>
              {current.imageUrl ? (
                <img
                  src={current.imageUrl}
                  alt={current.externalId}
                  className="mx-auto h-48 w-48 rounded object-contain"
                />
              ) : (
                <div className="mx-auto flex h-48 w-48 items-center justify-center rounded bg-muted text-sm text-muted-foreground">
                  Sin imagen
                </div>
              )}
            </div>

            {/* Quick list of other pending */}
            <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border p-2">
              {descriptions.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => goTo(i)}
                  className={`block w-full rounded px-2 py-1 text-left text-xs font-mono ${
                    i === currentIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {d.externalId}
                </button>
              ))}
            </div>
          </div>

          {/* Edit form */}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Descripción</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={8}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Separa párrafos con saltos de línea. Se convertirán a &lt;p&gt; tags en el export.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Materiales</label>
              <div className="space-y-3 rounded-md border border-border p-3">
                {Object.entries(editMat).map(([zone, materials]) => (
                  <div key={zone}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{zone}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = { ...editMat };
                          delete updated[zone];
                          setEditMat(updated);
                        }}
                        className="text-xs text-muted-foreground hover:text-destructive"
                        title="Eliminar zona"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {materials.map((mat, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                        >
                          {mat}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = { ...editMat };
                              updated[zone] = materials.filter((_, j) => j !== i);
                              if (updated[zone].length === 0) delete updated[zone];
                              setEditMat(updated);
                            }}
                            className="ml-0.5 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      {addingTo === zone ? (
                        <div className="relative">
                          <input
                            ref={addInputRef}
                            type="text"
                            value={addInput}
                            onChange={(e) => setAddInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && addInput.trim()) {
                                setEditMat({ ...editMat, [zone]: [...materials, addInput.trim()] });
                                setAddInput("");
                                setAddingTo(null);
                              }
                              if (e.key === "Escape") { setAddingTo(null); setAddInput(""); }
                            }}
                            onBlur={() => setTimeout(() => { setAddingTo(null); setAddInput(""); }, 150)}
                            placeholder="Escribir material..."
                            className="w-36 rounded-full border border-accent bg-background px-2.5 py-1 text-xs focus:outline-none"
                            autoFocus
                          />
                          {/* Suggestions dropdown */}
                          {materialsLib[zone]?.filter(
                            (m) => !materials.includes(m) && m.toLowerCase().includes(addInput.toLowerCase())
                          ).length > 0 && (
                            <div className="absolute left-0 top-full z-10 mt-1 max-h-32 w-48 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
                              {materialsLib[zone]
                                .filter((m) => !materials.includes(m) && m.toLowerCase().includes(addInput.toLowerCase()))
                                .map((suggestion) => (
                                  <button
                                    key={suggestion}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setEditMat({ ...editMat, [zone]: [...materials, suggestion] });
                                      setAddInput("");
                                      setAddingTo(null);
                                    }}
                                    className="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
                                  >
                                    {suggestion}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setAddingTo(zone); setAddInput(""); }}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-accent hover:text-accent"
                        >
                          <Plus className="h-3 w-3" />
                          Añadir
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {Object.keys(editMat).length === 0 && (
                  <p className="text-xs text-muted-foreground">Sin materiales</p>
                )}
                {addingZone ? (
                  <div className="relative">
                    <input
                      ref={zoneInputRef}
                      type="text"
                      value={zoneInput}
                      onChange={(e) => setZoneInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && zoneInput.trim()) {
                          setEditMat({ ...editMat, [zoneInput.trim()]: [] });
                          setZoneInput("");
                          setAddingZone(false);
                        }
                        if (e.key === "Escape") { setAddingZone(false); setZoneInput(""); }
                      }}
                      onBlur={() => setTimeout(() => { setAddingZone(false); setZoneInput(""); }, 150)}
                      placeholder="Nombre de zona..."
                      className="w-44 rounded-md border border-accent bg-background px-3 py-1.5 text-xs focus:outline-none"
                      autoFocus
                    />
                    {/* Zone suggestions */}
                    {Object.keys(materialsLib)
                      .filter((z) => !(z in editMat) && z.toLowerCase().includes(zoneInput.toLowerCase()))
                      .length > 0 && (
                      <div className="absolute left-0 top-full z-10 mt-1 max-h-32 w-48 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
                        {Object.keys(materialsLib)
                          .filter((z) => !(z in editMat) && z.toLowerCase().includes(zoneInput.toLowerCase()))
                          .map((z) => (
                            <button
                              key={z}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setEditMat({ ...editMat, [z]: [] });
                                setZoneInput("");
                                setAddingZone(false);
                              }}
                              className="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
                            >
                              {z}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setAddingZone(true); setZoneInput(""); }}
                    className="flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-accent hover:text-accent"
                  >
                    <Plus className="h-3 w-3" />
                    Nueva zona
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {statusFilter === "generated" && (
                <button
                  onClick={saveAndApprove}
                  disabled={regenerating}
                  className="flex items-center gap-2 rounded-md bg-success px-6 py-2.5 text-sm font-medium text-white hover:bg-success/90 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Aprobar y Siguiente
                </button>
              )}
              <button
                onClick={regenerate}
                disabled={regenerating}
                className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {regenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {regenerating ? "Regenerando..." : "Regenerar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
