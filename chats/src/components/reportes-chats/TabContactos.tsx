"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  deleteContactoReporte,
  getContactosReporte,
  type ContactoReporte,
} from "@/lib/reportesChatsApi";

const PAGE_SIZE = 100;

const thClass =
  "border-b border-gray-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400";

const tdClass =
  "border-b border-gray-100 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300";

function estadoBadgeClass(estado: string) {
  const e = String(estado || "").toLowerCase();
  if (e === "abierta") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";
  }
  if (e === "cerrada") {
    return "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400";
  }
  if (e === "nuevo") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400";
  }
  if (e === "pendiente") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400";
  }
  return "bg-gray-100 text-gray-500 dark:bg-gray-500/10 dark:text-gray-500";
}

export default function TabContactos() {
  const [contactos, setContactos] = useState<ContactoReporte[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getContactosReporte({
        search: search || undefined,
        limite: PAGE_SIZE,
        skip: page * PAGE_SIZE,
      });
      setContactos(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar contactos");
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const aplicarBusqueda = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
  };

  const eliminar = async (contacto: ContactoReporte) => {
    const ok = window.confirm(
      `¿Eliminar el contacto "${contacto.nombre}"?\n\nEsta acción no se puede deshacer.`,
    );
    if (!ok) return;

    setDeletingId(contacto.id);
    setError("");
    try {
      await deleteContactoReporte(contacto.id);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const hasta = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Contactos
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Listado de contactos registrados con el estado de su última
            conversación.
          </p>
        </div>

        <form onSubmit={aplicarBusqueda} className="flex gap-2">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nombre, teléfono, documento..."
            className="w-full min-w-[220px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white sm:min-w-[280px]"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            Buscar
          </button>
        </form>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={thClass}>Nombre</th>
              <th className={thClass}>Teléfono</th>
              <th className={thClass}>Documento</th>
              <th className={thClass}>Entidad</th>
              <th className={thClass}>Estado</th>
              <th className={thClass}>Conexión</th>
              <th className={thClass}>Activo</th>
              <th className={thClass}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && contactos.length === 0 ? (
              <tr>
                <td colSpan={8} className={`${tdClass} text-center text-gray-500`}>
                  Cargando contactos...
                </td>
              </tr>
            ) : contactos.length === 0 ? (
              <tr>
                <td colSpan={8} className={`${tdClass} text-center text-gray-500`}>
                  No hay contactos para mostrar.
                </td>
              </tr>
            ) : (
              contactos.map((c) => (
                <tr key={c.id}>
                  <td className={tdClass}>{c.nombre}</td>
                  <td className={tdClass}>{c.telefono}</td>
                  <td className={tdClass}>{c.documento}</td>
                  <td className={tdClass}>{c.entidad}</td>
                  <td className={tdClass}>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${estadoBadgeClass(c.estado)}`}
                    >
                      {c.estado}
                    </span>
                  </td>
                  <td className={tdClass}>{c.estadoConexion}</td>
                  <td className={tdClass}>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.activo
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-500/10 dark:text-gray-500"
                      }`}
                    >
                      {c.activo ? "Sí" : "No"}
                    </span>
                  </td>
                  <td className={tdClass}>
                    <button
                      type="button"
                      onClick={() => eliminar(c)}
                      disabled={deletingId === c.id}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                      {deletingId === c.id ? "Eliminando..." : "Eliminar"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
        <span>
          {total === 0
            ? "0 contactos"
            : `Mostrando ${desde}–${hasta} de ${total} contactos`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-gray-700"
          >
            Anterior
          </button>
          <span>
            Página {page + 1} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1 || loading}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-gray-700"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
