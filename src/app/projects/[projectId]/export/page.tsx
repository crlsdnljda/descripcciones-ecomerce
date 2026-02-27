"use client";

import { useParams } from "next/navigation";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";

export default function ExportPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const jsonUrl = `/api/projects/${projectId}/export/json`;
  const csvUrl = `/api/projects/${projectId}/export/csv`;

  return (
    <div className="max-w-2xl">
      <h2 className="mb-2 text-lg font-semibold">Exportar Datos</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Descarga las descripciones revisadas y traducciones en formato JSON o CSV.
        Solo se exportan las descripciones con estado &quot;Revisada&quot;.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* JSON Export */}
        <div className="rounded-lg border border-border p-5">
          <FileJson className="mb-3 h-8 w-8 text-accent" />
          <h3 className="mb-1 font-medium">Export JSON</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Array JSON con todas las descripciones y traducciones.
            Formato: Referencia, es_des, es_mat, fr_des, fr_mat, ...
          </p>
          <a
            href={jsonUrl}
            target="_blank"
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 w-fit"
          >
            <Download className="h-4 w-4" />
            Descargar JSON
          </a>
          <div className="mt-3">
            <p className="text-xs text-muted-foreground">URL para otras apps:</p>
            <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-xs">
              {typeof window !== "undefined" ? window.location.origin : ""}{jsonUrl}
            </code>
          </div>
        </div>

        {/* CSV Export */}
        <div className="rounded-lg border border-border p-5">
          <FileSpreadsheet className="mb-3 h-8 w-8 text-success" />
          <h3 className="mb-1 font-medium">Export CSV</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Archivo CSV (tab-separated) importable en Excel, Google Sheets,
            Informax u otras aplicaciones.
          </p>
          <a
            href={csvUrl}
            target="_blank"
            className="flex items-center gap-2 rounded-md bg-success px-4 py-2 text-sm font-medium text-white hover:bg-success/90 w-fit"
          >
            <Download className="h-4 w-4" />
            Descargar CSV
          </a>
          <div className="mt-3">
            <p className="text-xs text-muted-foreground">URL para otras apps:</p>
            <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-xs">
              {typeof window !== "undefined" ? window.location.origin : ""}{csvUrl}
            </code>
          </div>
        </div>
      </div>

      {/* Output format documentation */}
      <div className="mt-8 rounded-lg border border-border p-5">
        <h3 className="mb-3 font-medium">Formato de Salida</h3>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-1 text-left">Columna</th>
                <th className="px-2 py-1 text-left">Formato</th>
                <th className="px-2 py-1 text-left">Ejemplo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="px-2 py-1 font-mono">Referencia</td>
                <td className="px-2 py-1">ID del producto</td>
                <td className="px-2 py-1">53057</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-2 py-1 font-mono">{`{lang}_des`}</td>
                <td className="px-2 py-1">HTML con tags &lt;p&gt;</td>
                <td className="px-2 py-1">&lt;p&gt;Zapatilla deportiva...&lt;/p&gt;</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-mono">{`{lang}_mat`}</td>
                <td className="px-2 py-1">{`JSON {"Zona": ["mat1", "mat2"]}`}</td>
                <td className="px-2 py-1 font-mono">{`{"Empeine":["piel"]}`}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
