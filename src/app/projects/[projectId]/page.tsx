"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, Search, Download, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { useColumnsStore } from "@/stores/columns-store";

interface Product {
  id: string;
  externalId: string;
  rawData: Record<string, unknown>;
  imageUrl: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function ProductsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [products, setProducts] = useState<Product[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const { setVisibleCols, toggleColumn: toggleColumnStore, getVisibleCols } = useColumnsStore();
  const visibleCols = getVisibleCols(projectId);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 50, total: 0, totalPages: 0,
  });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Use refs to always have latest sort values available
  const sortColRef = useRef(sortCol);
  const sortDirRef = useRef(sortDir);
  const searchRef = useRef(search);
  sortColRef.current = sortCol;
  sortDirRef.current = sortDir;
  searchRef.current = search;

  const fetchProducts = async (page = 1) => {
    setLoading(true);
    try {
      const qp = new URLSearchParams({
        page: String(page),
        limit: "50",
        search: searchRef.current,
      });
      if (sortColRef.current) {
        qp.set("sortCol", sortColRef.current);
        qp.set("sortDir", sortDirRef.current);
      }
      const res = await fetch(
        `/api/projects/${projectId}/products?${qp.toString()}`
      );
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products);
        setPagination(data.pagination);
      }
    } catch {
      toast.error("Error al cargar productos");
    } finally {
      setLoading(false);
    }
  };

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  // Re-fetch from page 1 when sort changes (server-side sorting across ALL products)
  useEffect(() => {
    if (sortCol) {
      fetchProducts(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortCol, sortDir]);

  const fetchColumns = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/columns`);
      if (res.ok) {
        const data = await res.json();
        setColumns(data.columns);
        // Read live from store to avoid stale closure
        const currentVisible = useColumnsStore.getState().visibleCols[projectId];
        if ((!currentVisible || currentVisible.length === 0) && data.columns.length > 0) {
          setVisibleCols(projectId, data.columns.slice(0, 8));
        }
      }
    } catch {}
  };

  const importFeed = async () => {
    setImporting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/import`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        fetchProducts();
        fetchColumns();
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error("Error al importar feed");
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchColumns();
  }, [projectId]);

  const toggleColumn = (col: string) => {
    toggleColumnStore(projectId, col);
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={importFeed}
          disabled={importing}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {importing ? "Importando..." : "Importar Feed"}
        </button>

        <button
          onClick={() => fetchProducts(pagination.page)}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" />
          Refrescar
        </button>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchProducts(1)}
            placeholder="Buscar referencia..."
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        <span className="text-sm text-muted-foreground">
          {pagination.total} productos
        </span>
      </div>

      {/* Column selector */}
      {columns.length > 0 && (
        <div className="mb-4">
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              Columnas visibles ({visibleCols.length}/{columns.length})
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {columns.map((col) => (
                <button
                  key={col}
                  onClick={() => toggleColumn(col)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    visibleCols.includes(col)
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {col}
                </button>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Dynamic table */}
      {loading ? (
        <div className="py-10 text-center text-muted-foreground">Cargando...</div>
      ) : products.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-muted-foreground">No hay productos. Importa un feed para empezar.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th
                  className="px-3 py-2 text-left font-medium cursor-pointer select-none hover:bg-muted/80"
                  onClick={() => toggleSort("__ref")}
                >
                  <span className="flex items-center gap-1">
                    Ref
                    {sortCol === "__ref" ? (
                      sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
                    )}
                  </span>
                </th>
                {visibleCols.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-left font-medium whitespace-nowrap cursor-pointer select-none hover:bg-muted/80"
                    onClick={() => toggleSort(col)}
                  >
                    <span className="flex items-center gap-1">
                      {col}
                      {sortCol === col ? (
                        sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-border hover:bg-muted/30"
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    {product.externalId}
                  </td>
                  {visibleCols.map((col) => {
                    const val = product.rawData[col];
                    const display =
                      val === null || val === undefined
                        ? ""
                        : typeof val === "object"
                        ? JSON.stringify(val)
                        : String(val);

                    // Check if it's an image URL
                    const isImage =
                      typeof display === "string" &&
                      /\.(jpg|jpeg|png|gif|webp)/i.test(display);

                    return (
                      <td
                        key={col}
                        className="max-w-[200px] truncate px-3 py-2 text-xs"
                        title={display}
                      >
                        {isImage ? (
                          <img
                            src={display}
                            alt=""
                            className="h-12 w-12 rounded object-cover"
                          />
                        ) : (
                          display
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => fetchProducts(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="rounded border border-border px-3 py-1 text-sm disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-muted-foreground">
            Página {pagination.page} de {pagination.totalPages}
          </span>
          <button
            onClick={() => fetchProducts(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            className="rounded border border-border px-3 py-1 text-sm disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
