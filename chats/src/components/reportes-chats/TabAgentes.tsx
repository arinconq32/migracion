"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import FiltrosForm from "./FiltrosForm";
import {
  getActividadAgentes,
  getAgentes,
  getEntidades,
  getColas,
  formatAgenteEtiqueta,
  formatAgenteLineaPrincipal,
  resolveAgente,
  type Agente,
  type FiltrosReporte,
  type ActividadAgente,
} from "@/lib/reportesChatsApi";
import TransferirConversacionModal, {
  type ConversacionTransferible,
} from "./TransferirConversacionModal";

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

const ESTADO_TABS = [
  { id: "", label: "Todos" },
  { id: "abierta", label: "Abierto" },
  { id: "cerrada", label: "Cerrado" },
] as const;

const thClass =
  "border-b border-gray-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400";

const tdClass =
  "border-b border-gray-100 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300";

export default function TabAgentes() {
  const [filtros, setFiltros] = useState<FiltrosReporte>({});
  const [entidades, setEntidades] = useState<string[]>([]);
  const [colas, setColas] = useState<string[]>([]);
  const [actividad, setActividad] = useState<ActividadAgente[]>([]);
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [transferTarget, setTransferTarget] =
    useState<ConversacionTransferible | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    Promise.all([getEntidades(), getColas(), getAgentes()])
      .then(([e, c, ag]) => {
        setEntidades(e);
        setColas(c);
        setAgentes(ag);
      })
      .catch(() => {});
  }, []);

  const buscar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getActividadAgentes({ ...filtros, limite: 100 });
      setActividad(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  const resumen = useMemo(() => {
    const abiertas = actividad.filter((a) => esAbierta(a.estado)).length;
    const transferidas = actividad.filter((a) => a.transferido).length;
    return { total: actividad.length, abiertas, transferidas };
  }, [actividad]);

  const setEstadoRapido = (estado: string) => {
    setFiltros((prev) => ({ ...prev, estado: estado || undefined }));
  };

  const abrirTransferencia = (item: ActividadAgente) => {
    setTransferTarget({
      id: item.id,
      telefono: item.telefono,
      nombre: item.nombre,
      agenteId: item.agenteId,
      agenteNombre: item.agenteNombre,
      cola: item.cola,
      estado: item.estado,
    });
    setModalOpen(true);
  };

  const tieneHistorial = (item: ActividadAgente) =>
    item.transferido || item.transferencias.length > 0;

  const toggleHistorial = (id: string) => {
    setHistorialAbierto((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const labelAgente = (id: string, nombre?: string) =>
    formatAgenteEtiqueta(resolveAgente(id, agentes, nombre));

  const nombreAgente = (id: string, nombre?: string) =>
    formatAgenteLineaPrincipal(resolveAgente(id, agentes, nombre));

  return (
    <div className="space-y-6">
      <FiltrosForm
        filtros={filtros}
        entidades={entidades}
        colas={colas}
        onChange={setFiltros}
        onBuscar={buscar}
        loading={loading}
        showEstado
      />

      <div className="flex flex-wrap items-center gap-2">
        {ESTADO_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setEstadoRapido(tab.id)}
            className={`rounded-md border px-4 py-1.5 text-sm font-medium transition ${
              (filtros.estado || "") === tab.id
                ? "border-gray-400 bg-gray-800 text-white dark:border-gray-500 dark:bg-gray-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Resumen de actividad
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/40">
                <th className={thClass}>Registros</th>
                <th className={thClass}>Abiertas</th>
                <th className={thClass}>Con transferencia</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={tdClass}>{loading ? "—" : resumen.total}</td>
                <td className={tdClass}>{loading ? "—" : resumen.abiertas}</td>
                <td className={tdClass}>{loading ? "—" : resumen.transferidas}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Actividad de agentes
          </h3>
          <span className="text-xs text-gray-500">{actividad.length} registros</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/40">
                <th className={`${thClass} text-center`}>Transferir</th>
                <th className={thClass}>Agente</th>
                <th className={thClass}>Extensión</th>
                <th className={thClass}>Cliente</th>
                <th className={thClass}>Teléfono</th>
                <th className={thClass}>Cola</th>
                <th className={thClass}>Estado</th>
                <th className={thClass}>Inicio</th>
                <th className={thClass}>Fin</th>
                <th className={thClass}>Duración</th>
                <th className={thClass}>Transferido</th>
                <th className={thClass}>Historial</th>
              </tr>
            </thead>
            <tbody>
              {loading && actividad.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-sm text-gray-400">
                    Cargando registros...
                  </td>
                </tr>
              ) : actividad.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-sm text-gray-400">
                    No hay registros con los filtros seleccionados
                  </td>
                </tr>
              ) : (
                actividad.map((a) => {
                  const historialVisible = historialAbierto.has(a.id);
                  const mostrarHistorial = tieneHistorial(a);

                  return (
                    <React.Fragment key={a.id}>
                      <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                        <td className={`${tdClass} text-center`}>
                          <button
                            type="button"
                            onClick={() => abrirTransferencia(a)}
                            title={
                              esAbierta(a.estado)
                                ? "Transferir conversación"
                                : "Transferir conversación (cerrada)"
                            }
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
                                d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4"
                              />
                            </svg>
                          </button>
                        </td>
                        <td className={`${tdClass} font-medium`}>
                          {nombreAgente(a.agenteId, a.agenteNombre)}
                        </td>
                        <td className={tdClass}>
                          {resolveAgente(a.agenteId, agentes, a.agenteNombre)
                            .extension || "—"}
                        </td>
                        <td className={tdClass}>{a.nombre}</td>
                        <td className={tdClass}>{a.telefono}</td>
                        <td className={tdClass}>{a.cola}</td>
                        <td className={tdClass}>
                          {esAbierta(a.estado) ? "Abierto" : "Cerrado"}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap`}>
                          {formatFecha(a.inicio)}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap`}>
                          {formatFecha(a.fin)}
                        </td>
                        <td className={tdClass}>{a.duracion}</td>
                        <td className={tdClass}>{a.transferido ? "Sí" : "No"}</td>
                        <td className={tdClass}>
                          {mostrarHistorial ? (
                            <button
                              type="button"
                              onClick={() => toggleHistorial(a.id)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                            >
                              <svg
                                className={`h-3.5 w-3.5 transition-transform ${historialVisible ? "rotate-180" : ""}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                              {historialVisible ? "Ocultar" : "Ver historial"}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>

                      {historialVisible && mostrarHistorial && (
                        <tr className="bg-gray-50/80 dark:bg-gray-900/40">
                          <td colSpan={12} className="px-4 py-4">
                            <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/60">
                              <div>
                                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                  Transferencias
                                </h4>
                                {a.transferencias.length === 0 ? (
                                  <p className="text-sm text-gray-400">
                                    Sin transferencias registradas
                                  </p>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                      <thead>
                                        <tr className="border-b border-gray-200 dark:border-gray-700">
                                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-400">
                                            Fecha
                                          </th>
                                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-400">
                                            Desde
                                          </th>
                                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-400">
                                            Hacia
                                          </th>
                                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-400">
                                            Comentario
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {a.transferencias.map((t, index) => (
                                          <tr
                                            key={`${a.id}-t-${index}`}
                                            className="border-b border-gray-100 dark:border-gray-800"
                                          >
                                            <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">
                                              {formatFecha(t.fecha)}
                                            </td>
                                            <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                              {labelAgente(t.desde, t.desdeNombre)}
                                            </td>
                                            <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                              {labelAgente(t.hacia, t.haciaNombre)}
                                            </td>
                                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                              {t.comentario || "—"}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <TransferirConversacionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        conversacion={transferTarget}
        onTransferido={() => {
          if (transferTarget?.id) {
            setHistorialAbierto((prev) => new Set(prev).add(transferTarget.id));
          }
          buscar();
        }}
      />
    </div>
  );
}
