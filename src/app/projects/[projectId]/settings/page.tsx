"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Save } from "lucide-react";
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

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}/columns`).then((r) => r.json()).catch(() => ({ columns: [] })),
    ]).then(([project, colData]) => {
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
