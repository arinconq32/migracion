"use client";

import React, { useCallback, useEffect, useState } from "react";
import FiltrosForm from "./FiltrosForm";
import DetalleConversacionModal from "./DetalleConversacionModal";
import {
  getResumen,
  getConversaciones,
  getEntidades,
  getColas,
  type FiltrosReporte,
  type ConversacionReporte,
  type MetricasResumen,
} from "@/lib/reportesChatsApi";

function formatFecha(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function esAbierta(estado: string) {
  const e = String(estado || "").toLowerCase();
  return ["abierta", "nuevo", "pendiente", "activa"].includes(e);
}

const thClass =
  "border-b border-gray-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400";

const tdClass =
  "border-b border-gray-100 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300";

export default function TabResumen() {
  const [filtros, setFiltros] = useState<FiltrosReporte>({});
  const [entidades, setEntidades] = useState<string[]>([]);
  const [colas, setColas] = useState<string[]>([]);
  const [metricas, setMetricas] = useState<MetricasResumen | null>(null);
  const [conversaciones, setConversaciones] = useState<ConversacionReporte[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [selected, setSelected] = useState<ConversacionReporte | null>(null);

  useEffect(() => {
    Promise.all([getEntidades(), getColas()])
      .then(([e, c]) => {
        setEntidades(e);
        setColas(c);
      })
      .catch(() => {});
  }, []);

  const buscar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [resumen, convs] = await Promise.all([
        getResumen(filtros),
        getConversaciones({ ...filtros, limite: 50 }),
      ]);
      setMetricas(resumen.metricas);
      setConversaciones(convs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  const abrirDetalle = (conv: ConversacionReporte) => {
    setSelected(conv);
    setDetalleOpen(true);
  };

  return (
    <div className="space-y-6">
      <FiltrosForm
        filtros={filtros}
        entidades={entidades}
        colas={colas}
        onChange={setFiltros}
        onBuscar={buscar}
        loading={loading}
      />

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Resumen de métricas
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/40">
                <th className={thClass}>Conversaciones</th>
                <th className={thClass}>Activas</th>
                <th className={thClass}>Cerradas hoy</th>
                <th className={thClass}>Duración promedio</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={tdClass}>{metricas?.total ?? "—"}</td>
                <td className={tdClass}>{metricas?.activas ?? "—"}</td>
                <td className={tdClass}>{metricas?.cerradasHoy ?? "—"}</td>
                <td className={tdClass}>{metricas?.promedioDuracion ?? "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Conversaciones
          </h3>
          <span className="text-xs text-gray-500">
            {conversaciones.length} registros
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/40">
                <th className={`${thClass} text-center`}>Detalle</th>
                <th className={thClass}>Cliente</th>
                <th className={thClass}>DNI</th>
                <th className={thClass}>Teléfono</th>
                <th className={thClass}>Entidad</th>
                <th className={thClass}>Agente</th>
                <th className={thClass}>Cola</th>
                <th className={thClass}>Estado</th>
                <th className={thClass}>Tipificación</th>
                <th className={thClass}>Comentario</th>
                <th className={thClass}>Inicio</th>
                <th className={thClass}>Fin</th>
                <th className={thClass}>Duración</th>
              </tr>
            </thead>
            <tbody>
              {loading && conversaciones.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-sm text-gray-400">
                    Cargando conversaciones...
                  </td>
                </tr>
              ) : conversaciones.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-sm text-gray-400">
                    No hay conversaciones con los filtros seleccionados
                  </td>
                </tr>
              ) : (
                conversaciones.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-900/30"
                  >
                    <td className={`${tdClass} text-center`}>
                      <button
                        type="button"
                        onClick={() => abrirDetalle(c)}
                        title="Ver detalle"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                    </td>
                    <td className={`${tdClass} font-medium text-gray-800 dark:text-white/90`}>
                      {c.nombre}
                    </td>
                    <td className={tdClass}>{c.dni || "—"}</td>
                    <td className={tdClass}>{c.telefono || "—"}</td>
                    <td className={tdClass}>{c.entidad}</td>
                    <td className={tdClass}>{c.agente}</td>
                    <td className={tdClass}>{c.cola}</td>
                    <td className={tdClass}>
                      {esAbierta(c.estado) ? "Abierto" : "Cerrado"}
                    </td>
                    <td className={tdClass}>{c.tipificacion}</td>
                    <td className={`${tdClass} max-w-xs truncate`} title={c.observaciones}>
                      {c.observaciones || "—"}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {formatFecha(c.inicio)}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {formatFecha(c.fin)}
                    </td>
                    <td className={tdClass}>{c.duracion}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DetalleConversacionModal
        isOpen={detalleOpen}
        onClose={() => setDetalleOpen(false)}
        conversacion={selected}
      />
    </div>
  );
}
