"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { Save, X, Plus } from "lucide-react";
import { toast } from "sonner";

export default function ProjectSettingsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [form, setForm] = useState({
    name: "",
    description: "",
    feedUrl: "",
    feedType: "json",
    idColumn: "",
    imageColumn: "",
    openaiModelGeneration: "gpt-4o",
    openaiModelTranslation: "gpt-4o-mini",
    systemPrompt: "",
    languages: "",
  });

  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Materials library
  const [materialsLib, setMaterialsLib] = useState<Record<string, string[]>>({});
  const [matManual, setMatManual] = useState<Record<string, string[]>>({});
  const [addingMatTo, setAddingMatTo] = useState<string | null>(null);
  const [matInput, setMatInput] = useState("");
  const [addingMatZone, setAddingMatZone] = useState(false);
  const [matZoneInput, setMatZoneInput] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}/columns`).then((r) => r.json()).catch(() => ({ columns: [] })),
      fetch(`/api/projects/${projectId}/materials`).then((r) => r.json()).catch(() => ({})),
    ]).then(([project, colData, libData]) => {
      setForm({
        name: project.name || "",
        description: project.description || "",
        feedUrl: project.feedUrl || "",
        feedType: project.feedType || "json",
        idColumn: project.idColumn || "",
        imageColumn: project.imageColumn || "",
        openaiModelGeneration: project.openaiModelGeneration || "gpt-4o",
        openaiModelTranslation: project.openaiModelTranslation || "gpt-4o-mini",
        systemPrompt: project.systemPrompt || "",
        languages: (project.languages || []).join(", "),
      });
      setColumns(colData.columns || []);
      setMatManual(project.materialsLibrary || {});
      setMaterialsLib(libData || {});
      setLoading(false);
    });
  }, [projectId]);

  const save = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          languages: form.languages.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean),
        }),
      });
      if (res.ok) {
        toast.success("Configuración guardada");
      } else {
        toast.error("Error al guardar");
      }
    } catch {
      toast.error("Error de conexión");
    }
  };

  const saveMaterials = async (updated: Record<string, string[]>) => {
    setMatManual(updated);
    try {
      const res = await fetch(`/api/projects/${projectId}/materials`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        toast.success("Biblioteca de materiales actualizada");
        // Refresh merged library
        const libRes = await fetch(`/api/projects/${projectId}/materials`);
        if (libRes.ok) setMaterialsLib(await libRes.json());
      } else {
        toast.error("Error al guardar materiales");
      }
    } catch {
      toast.error("Error de conexión");
    }
  };

  if (loading) {
    return <div className="py-10 text-center text-muted-foreground">Cargando...</div>;
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium">Nombre</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Descripción</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">URL del Feed</label>
        <input
          type="url"
          value={form.feedUrl}
          onChange={(e) => setForm({ ...form, feedUrl: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Tipo de Feed</label>
          <select
            value={form.feedType}
            onChange={(e) => setForm({ ...form, feedType: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="xml">XML</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Idiomas</label>
          <input
            type="text"
            value={form.languages}
            onChange={(e) => setForm({ ...form, languages: e.target.value })}
            placeholder="fr, pt, de, it"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* Column mapping */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-3 font-medium">Mapeo de Columnas</h3>
        {columns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Importa el feed primero para ver las columnas disponibles.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Columna ID / Referencia</label>
              <select
                value={form.idColumn}
                onChange={(e) => setForm({ ...form, idColumn: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">-- Seleccionar --</option>
                {columns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Columna Imagen</label>
              <select
                value={form.imageColumn}
                onChange={(e) => setForm({ ...form, imageColumn: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">-- Seleccionar --</option>
                {columns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* OpenAI Models */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-3 font-medium">Modelos OpenAI</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Modelo Generación</label>
            <select
              value={form.openaiModelGeneration}
              onChange={(e) => setForm({ ...form, openaiModelGeneration: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4.1">gpt-4.1</option>
              <option value="gpt-4.1-mini">gpt-4.1-mini</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Modelo Traducción</label>
            <select
              value={form.openaiModelTranslation}
              onChange={(e) => setForm({ ...form, openaiModelTranslation: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-4.1-mini">gpt-4.1-mini</option>
              <option value="gpt-4.1-nano">gpt-4.1-nano</option>
            </select>
          </div>
        </div>
      </div>

      {/* System Prompt */}
      <div>
        <label className="mb-1 block text-sm font-medium">
          System Prompt (adicional al prompt base)
        </label>
        <textarea
          value={form.systemPrompt}
          onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
          rows={5}
          placeholder="Instrucciones adicionales para la IA..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>

      {/* Materials Library */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-1 font-medium">Biblioteca de Materiales</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Materiales manuales + recopilados de descripciones revisadas. La IA los usará para mantener consistencia.
        </p>
        <div className="space-y-3">
          {Object.entries(materialsLib).map(([zone, materials]) => (
            <div key={zone}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{zone}</span>
                {matManual[zone] !== undefined && (
                  <button
                    type="button"
                    onClick={() => {
                      const updated = { ...matManual };
                      delete updated[zone];
                      saveMaterials(updated);
                    }}
                    className="text-xs text-muted-foreground hover:text-destructive"
                    title="Eliminar zona manual"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {materials.map((mat) => (
                  <span
                    key={mat}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                  >
                    {mat}
                    {matManual[zone]?.includes(mat) && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = { ...matManual };
                          updated[zone] = (updated[zone] || []).filter((m) => m !== mat);
                          if (updated[zone].length === 0) delete updated[zone];
                          saveMaterials(updated);
                        }}
                        className="ml-0.5 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
                {addingMatTo === zone ? (
                  <div className="relative">
                    <input
                      type="text"
                      value={matInput}
                      onChange={(e) => setMatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && matInput.trim()) {
                          const updated = { ...matManual };
                          updated[zone] = [...(updated[zone] || []), matInput.trim()];
                          saveMaterials(updated);
                          setMatInput("");
                          setAddingMatTo(null);
                        }
                        if (e.key === "Escape") { setAddingMatTo(null); setMatInput(""); }
                      }}
                      onBlur={() => setTimeout(() => { setAddingMatTo(null); setMatInput(""); }, 150)}
                      placeholder="Nuevo material..."
                      className="w-36 rounded-full border border-accent bg-background px-2.5 py-1 text-xs focus:outline-none"
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setAddingMatTo(zone); setMatInput(""); }}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-accent hover:text-accent"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {Object.keys(materialsLib).length === 0 && (
            <p className="text-xs text-muted-foreground">
              Sin materiales todavía. Se irán añadiendo al revisar descripciones.
            </p>
          )}
          {addingMatZone ? (
            <div className="relative">
              <input
                type="text"
                value={matZoneInput}
                onChange={(e) => setMatZoneInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matZoneInput.trim()) {
                    const updated = { ...matManual, [matZoneInput.trim()]: [] };
                    saveMaterials(updated);
                    setMatZoneInput("");
                    setAddingMatZone(false);
                  }
                  if (e.key === "Escape") { setAddingMatZone(false); setMatZoneInput(""); }
                }}
                onBlur={() => setTimeout(() => { setAddingMatZone(false); setMatZoneInput(""); }, 150)}
                placeholder="Nombre de zona..."
                className="w-44 rounded-md border border-accent bg-background px-3 py-1.5 text-xs focus:outline-none"
                autoFocus
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setAddingMatZone(true); setMatZoneInput(""); }}
              className="flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-accent hover:text-accent"
            >
              <Plus className="h-3 w-3" />
              Nueva zona
            </button>
          )}
        </div>
      </div>

      <button
        onClick={save}
        className="flex items-center gap-2 rounded-md bg-accent px-6 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90"
      >
        <Save className="h-4 w-4" />
        Guardar Configuración
      </button>
    </div>
  );
}
