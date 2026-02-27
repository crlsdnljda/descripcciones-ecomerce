"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Clave incorrecta");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <KeyRound className="h-10 w-10 text-accent" />
          <h1 className="text-xl font-bold">Descripciones E-commerce</h1>
          <p className="text-sm text-muted-foreground">Introduce la clave API para acceder</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Clave API"
              autoFocus
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
