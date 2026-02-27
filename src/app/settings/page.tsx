"use client";

export default function GlobalSettingsPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold">Configuración Global</h1>
      <p className="mb-6 text-muted-foreground">
        Configuración general de la aplicación. Las opciones específicas de cada proyecto
        se configuran en la pestaña &quot;Config&quot; de cada proyecto.
      </p>

      <div className="rounded-lg border border-border p-5">
        <h3 className="mb-3 font-medium">Información</h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Versión: 0.1.0</p>
          <p>Stack: Next.js 16 + PostgreSQL + OpenAI</p>
          <p>
            Cada proyecto gestiona su propia API Key de OpenAI, modelos,
            idiomas y configuración de feed de forma independiente.
          </p>
        </div>
      </div>
    </div>
  );
}
