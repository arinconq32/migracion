"use client";

import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  getConversacionDetalle,
  type ConversacionReporte,
  type ConversacionDetalle,
} from "@/lib/reportesChatsApi";
import MensajesConversacionModal from "./MensajesConversacionModal";

interface DetalleConversacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversacion: ConversacionReporte | null;
}

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
  "border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400";

const tdLabelClass =
  "border-b border-gray-100 px-4 py-2.5 text-sm font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400 w-1/3";

const tdValueClass =
  "border-b border-gray-100 px-4 py-2.5 text-sm text-gray-800 dark:border-gray-800 dark:text-gray-200";

function DetalleTabla({
  titulo,
  filas,
}: {
  titulo: string;
  filas: { label: string; value: React.ReactNode }[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-900/40">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
          {titulo}
        </h4>
      </div>
      <table className="min-w-full">
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.label} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/20">
              <td className={tdLabelClass}>{fila.label}</td>
              <td className={tdValueClass}>{fila.value || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DetalleConversacionModal({
  isOpen,
  onClose,
  conversacion,
}: DetalleConversacionModalProps) {
  const [detalle, setDetalle] = useState<ConversacionDetalle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mensajesOpen, setMensajesOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !conversacion?.id) {
      setDetalle(null);
      setMensajesOpen(false);
      return;
    }
    setLoading(true);
    setError("");
    getConversacionDetalle(conversacion.id)
      .then(setDetalle)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen, conversacion?.id]);

  const data = detalle || conversacion;

  const filasConversacion = data
    ? [
        { label: "ID", value: data.id },
        { label: "Cliente", value: data.nombre },
        { label: "Teléfono", value: data.telefono },
        { label: "Estado", value: esAbierta(data.estado) ? "Abierto" : "Cerrado" },
        { label: "Agente", value: data.agente },
        { label: "Cola", value: data.cola },
        { label: "Entidad", value: data.entidad },
        { label: "Origen", value: "origen" in data ? data.origen : "—" },
        { label: "Duración", value: data.duracion },
        { label: "Inicio", value: formatFecha(data.inicio) },
        { label: "Fin", value: formatFecha(data.fin) },
        {
          label: "Última actividad",
          value:
            "ultimaActividad" in data && data.ultimaActividad
              ? formatFecha(data.ultimaActividad)
              : "—",
        },
        { label: "Tipificación", value: data.tipificacion },
        { label: "Etiqueta", value: "etiqueta" in data ? data.etiqueta : "—" },
        {
          label: "Total mensajes",
          value: "totalMensajes" in data ? String(data.totalMensajes) : "—",
        },
        {
          label: "Observaciones",
          value: "observaciones" in data ? data.observaciones : "—",
        },
      ]
    : [];

  const filasContacto =
    data && "contacto" in data && data.contacto
      ? [
          { label: "Documento", value: data.contacto.documento },
          { label: "Email", value: data.contacto.email },
          { label: "Ciudad", value: data.contacto.ciudad },
          { label: "Dirección", value: data.contacto.direccion },
        ]
      : [];

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        className="max-w-3xl p-0"
        overlayClassName="bg-black/30"
      >
        <div className="max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900">
          <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
            <h3 className="pr-10 text-lg font-semibold text-gray-800 dark:text-white">
              Detalle de conversación
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {data?.nombre} · {data?.telefono}
            </p>
          </div>

          <div className="px-6 py-5">
            {loading ? (
              <p className="py-10 text-center text-sm text-gray-400">
                Cargando detalle...
              </p>
            ) : error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </p>
            ) : data ? (
              <div className="space-y-5">
                <DetalleTabla titulo="Información general" filas={filasConversacion} />

                {filasContacto.length > 0 && (
                  <DetalleTabla titulo="Datos del contacto" filas={filasContacto} />
                )}

                {"transferido" in data &&
                  data.transferido &&
                  data.transferencias?.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="border-b border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-900/40">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                          Historial de transferencias
                        </h4>
                      </div>
                      <table className="min-w-full">
                        <thead>
                          <tr>
                            <th className={thClass}>Desde</th>
                            <th className={thClass}>Hacia</th>
                            <th className={thClass}>Fecha</th>
                            <th className={thClass}>Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.transferencias.map((t, i) => (
                            <tr key={i}>
                              <td className={tdValueClass}>{t.desde}</td>
                              <td className={tdValueClass}>{t.hacia}</td>
                              <td className={tdValueClass}>
                                {t.fecha ? formatFecha(t.fecha) : "—"}
                              </td>
                              <td className={tdValueClass}>{t.motivo || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setMensajesOpen(true)}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
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
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                    Ver mensajes
                    {"totalMensajes" in data && (
                      <span className="text-xs text-gray-500">
                        ({data.totalMensajes})
                      </span>
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Modal>

      <MensajesConversacionModal
        isOpen={mensajesOpen}
        onClose={() => setMensajesOpen(false)}
        conversacion={detalle}
      />
    </>
  );
}
