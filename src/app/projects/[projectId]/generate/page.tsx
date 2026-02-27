"use client";

import { useEffect, useState, useRef, KeyboardEvent } from "react";
import { useParams } from "next/navigation";
import { Sparkles, Save, Trash2, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useColumnsStore } from "@/stores/columns-store";

interface Prompt {
  id: string;
  name: string;
  content: string;
}

export default function GeneratePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const getVisibleCols = useColumnsStore((s) => s.getVisibleCols);
  const visibleCols = getVisibleCols(projectId);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [promptText, setPromptText] = useState("");
  const [promptName, setPromptName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [refInput, setRefInput] = useState("");
  const [refStatuses, setRefStatuses] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ total: 0, completed: 0, errors: 0 });
  const [results, setResults] = useState<{ ref: string; status: string; error?: string }[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchPrompts();
  }, [projectId]);

  // Fetch description status for each tag (debounced)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (tags.length === 0) {
      setRefStatuses({});
      return;
    }
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/ref-status?refs=${tags.join(",")}`
        );
        if (res.ok) {
          const data = await res.json();
          setRefStatuses(data.statuses || {});
        }
      } catch {}
    }, 300);
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, [tags, projectId]);

  const fetchPrompts = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/prompts`);
      const data = await res.json();
      setPrompts(data);
    } catch {}
  };

  const insertVariable = (col: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = promptText;
    const variable = `{{${col}}}`;
    setPromptText(text.slice(0, start) + variable + text.slice(end));
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  // --- Tag management ---
  const addRefs = (input: string) => {
    const newRefs = input
      .split(/[\n,;\s]+/)
      .map((r) => r.trim())
      .filter(Boolean);
    if (newRefs.length === 0) return;
    setTags((prev) => {
      const set = new Set(prev);
      newRefs.forEach((r) => set.add(r));
      return [...set];
    });
    setRefInput("");
  };

  const removeTag = (ref: string) => {
    setTags((prev) => prev.filter((t) => t !== ref));
  };

  const clearAllTags = () => setTags([]);

  const handleRefKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault();
      addRefs(refInput);
    }
    // Backspace on empty input removes last tag
    if (e.key === "Backspace" && refInput === "" && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  const handleRefPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    addRefs(pasted);
  };

  // --- Prompts ---
  const savePrompt = async () => {
    if (!promptName.trim() || !promptText.trim()) {
      toast.error("Nombre y contenido son obligatorios");
      return;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: promptName, content: promptText }),
      });
      if (res.ok) {
        toast.success("Prompt guardado");
        setPromptName("");
        fetchPrompts();
      }
    } catch {
      toast.error("Error al guardar prompt");
    }
  };

  const loadPrompt = (id: string) => {
    const p = prompts.find((pr) => pr.id === id);
    if (p) {
      setPromptText(p.content);
      setSelectedPrompt(id);
    }
  };

  const deletePrompt = async (id: string) => {
    try {
      await fetch(`/api/projects/${projectId}/prompts?id=${id}`, { method: "DELETE" });
      toast.success("Prompt eliminado");
      fetchPrompts();
      if (selectedPrompt === id) {
        setSelectedPrompt("");
        setPromptText("");
      }
    } catch {
      toast.error("Error al eliminar");
    }
  };

  // --- Polling for job progress ---
  const startPolling = (id: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/jobs?id=${id}`);
        if (!res.ok) return;
        const job = await res.json();
        setProgress({ total: job.total, completed: job.completed, errors: job.errors });
        setResults(job.results || []);
        if (job.status === "completed" || job.status === "failed") {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setGenerating(false);
          setJobId(null);
          if (job.status === "completed") {
            toast.success(`Generadas ${job.completed} descripciones, ${job.errors} errores`);
          } else {
            toast.error("La generación falló");
          }
        }
      } catch {}
    }, 2000);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // --- Generate ---
  const generate = async () => {
    const pending = refInput
      .split(/[\n,;\s]+/)
      .map((r) => r.trim())
      .filter(Boolean);
    const allRefs = [...new Set([...tags, ...pending])];

    if (!allRefs.length) {
      toast.error("Añade al menos una referencia");
      return;
    }
    if (!promptText.trim()) {
      toast.error("Escribe un prompt");
      return;
    }

    setGenerating(true);
    setResults([]);
    setProgress({ total: allRefs.length, completed: 0, errors: 0 });

    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          references: allRefs,
          promptTemplate: promptText,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.jobId) {
          setJobId(data.jobId);
          setProgress((p) => ({ ...p, total: data.total }));
          toast.success(data.message);
          startPolling(data.jobId);
        } else {
          // All refs already have descriptions
          toast.info(data.message);
          setGenerating(false);
        }
      } else if (res.status === 409 && data.runningJobId) {
        // There's already a running job — attach to it
        toast.info("Ya hay una generación en curso. Mostrando progreso...");
        setJobId(data.runningJobId);
        startPolling(data.runningJobId);
      } else {
        toast.error(data.error);
        setGenerating(false);
      }
    } catch {
      toast.error("Error al generar");
      setGenerating(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      {/* Main area — prompt */}
      <div className="space-y-5">
        {/* Prompt management */}
        <div>
          <label className="mb-2 block text-sm font-medium">Prompts Guardados</label>
          <div className="flex flex-wrap gap-2">
            {prompts.map((p) => (
              <div key={p.id} className="flex items-center gap-1">
                <button
                  onClick={() => loadPrompt(p.id)}
                  className={`rounded-md border px-3 py-1 text-xs transition-colors ${
                    selectedPrompt === p.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {p.name}
                </button>
                <button
                  onClick={() => deletePrompt(p.id)}
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Variable chips */}
        <div>
          <label className="mb-2 block text-sm font-medium">
            Variables disponibles (clic para insertar)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {visibleCols.map((col) => (
              <button
                key={col}
                onClick={() => insertVariable(col)}
                className="rounded-full bg-muted px-2.5 py-1 text-xs font-mono text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {`{{${col}}}`}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt editor */}
        <div>
          <label className="mb-1 block text-sm font-medium">Prompt</label>
          <textarea
            ref={textareaRef}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={10}
            placeholder="Escribe el prompt aquí. Usa {{variable}} para insertar datos del producto.&#10;&#10;Ejemplo: Genera una descripción para el calzado {{titulo}} de la marca {{marca}}. Es de color {{color}}, precio {{precio}}€."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Save prompt */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={promptName}
            onChange={(e) => setPromptName(e.target.value)}
            placeholder="Nombre del prompt..."
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          <button
            onClick={savePrompt}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <Save className="h-4 w-4" />
            Guardar
          </button>
        </div>

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-2 rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {generating ? "Generando..." : `Generar (${tags.length} refs)`}
        </button>

        {/* Progress bar */}
        {generating && progress.total > 0 && (
          <div className="rounded-lg border border-border p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">Progreso</span>
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

        {/* Results */}
        {!generating && results.length > 0 && (
          <div className="rounded-lg border border-border p-4">
            <h3 className="mb-2 font-medium">Resultados</h3>
            <div className="max-h-[300px] space-y-1 overflow-y-auto">
              {results.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-sm ${
                    r.status === "ok" ? "text-green-600" : "text-destructive"
                  }`}
                >
                  <span className="font-mono">{r.ref}</span>
                  <span>{r.status === "ok" ? "OK" : r.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar — references as tags */}
      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">Referencias ({tags.length})</h3>
          {tags.length > 0 && (
            <button
              onClick={clearAllTags}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Status alert */}
        {tags.length > 0 && Object.keys(refStatuses).length > 0 && (() => {
          const blocked = tags.filter((t) => refStatuses[t] === "generated");
          const regen = tags.filter((t) => refStatuses[t] === "reviewed");
          const ok = tags.filter((t) => refStatuses[t] === "none" || !refStatuses[t]);
          return (
            <div className="mb-3 space-y-1.5 text-xs">
              {blocked.length > 0 && (
                <div className="flex items-start gap-1.5 rounded-md bg-red-500/10 px-2.5 py-1.5 text-red-600 dark:text-red-400">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span><strong>{blocked.length}</strong> en revisión (no se generarán)</span>
                </div>
              )}
              {regen.length > 0 && (
                <div className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-amber-600 dark:text-amber-400">
                  <strong>{regen.length}</strong> ya revisadas (se re-generarán)
                </div>
              )}
              {ok.length > 0 && (
                <div className="rounded-md bg-green-500/10 px-2.5 py-1.5 text-green-600 dark:text-green-400">
                  <strong>{ok.length}</strong> nuevas (se generarán)
                </div>
              )}
            </div>
          );
        })()}

        {/* Tag input */}
        <div
          className="mb-3 flex min-h-[44px] max-h-[500px] flex-wrap items-start gap-1.5 overflow-y-auto rounded-md border border-border bg-background px-2 py-1.5 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent cursor-text"
          onClick={() => refInputRef.current?.focus()}
        >
          {tags.map((tag) => {
            const st = refStatuses[tag];
            const colorClass =
              st === "generated"
                ? "bg-red-500/15 text-red-600 dark:text-red-400 line-through"
                : st === "reviewed"
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-accent/15 text-accent";
            return (
              <span
                key={tag}
                className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-mono ${colorClass}`}
                title={
                  st === "generated"
                    ? "En revisión — no se generará"
                    : st === "reviewed"
                    ? "Ya revisada — se re-generará"
                    : "Nueva — se generará"
                }
              >
                {tag}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTag(tag);
                  }}
                  className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          <input
            ref={refInputRef}
            type="text"
            value={refInput}
            onChange={(e) => setRefInput(e.target.value)}
            onKeyDown={handleRefKeyDown}
            onPaste={handleRefPaste}
            onBlur={() => {
              if (refInput.trim()) addRefs(refInput);
            }}
            placeholder={tags.length === 0 ? "Escribe refs..." : ""}
            className="min-w-[80px] flex-1 bg-transparent py-1 text-sm font-mono outline-none placeholder:text-muted-foreground"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Enter, coma o pega una lista.
        </p>
      </div>
    </div>
  );
}
