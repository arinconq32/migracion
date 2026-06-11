"use client";

import React, { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import {
  formatAgenteEtiqueta,
  formatAgenteLineaPrincipal,
  formatAgenteLineaSecundaria,
  getAgentes,
  resolveAgente,
  transferirConversacion,
  type Agente,
} from "@/lib/reportesChatsApi";

export interface ConversacionTransferible {
  id: string;
  telefono: string;
  nombre?: string;
  agenteId: string;
  agenteNombre?: string;
  cola: string;
  estado: string;
}

interface TransferirConversacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversacion: ConversacionTransferible | null;
  onTransferido?: () => void;
}

function esAbierta(estado: string) {
  const e = String(estado || "").toLowerCase();
  return ["abierta", "nuevo", "pendiente", "activa"].includes(e);
}

export default function TransferirConversacionModal({
  isOpen,
  onClose,
  conversacion,
  onTransferido,
}: TransferirConversacionModalProps) {
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [agenteDestino, setAgenteDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [transferiendo, setTransferiendo] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      getAgentes().then(setAgentes).catch(() => {});
      setAgenteDestino("");
      setMotivo("");
      setError("");
    }
  }, [isOpen]);

  const confirmar = async () => {
    if (!conversacion || !agenteDestino) return;
    setTransferiendo(true);
    setError("");
    try {
      await transferirConversacion({
        conversacionId: conversacion.id,
        agenteDestino,
        agenteOrigen: conversacion.agenteId,
        motivo,
      });
      onClose();
      onTransferido?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al transferir");
    } finally {
      setTransferiendo(false);
    }
  };

  const agenteOrigenInfo = conversacion
    ? resolveAgente(
        conversacion.agenteId,
        agentes,
        conversacion.agenteNombre,
      )
    : null;

  const agenteDestinoResuelto = agenteDestino
    ? resolveAgente(agenteDestino, agentes)
    : null;

  const selectClass =
    "h-11 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

  const nombre =
    conversacion?.nombre && conversacion.nombre !== "—"
      ? conversacion.nombre
      : conversacion?.telefono;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="mx-4 w-full max-w-lg p-0"
      overlayClassName="bg-black/30"
    >
      <div className="rounded-2xl bg-white dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 py-4 text-center dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
            Transferir conversación
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Reasigna esta conversación a otro agente
          </p>
        </div>

        <div className="px-6 py-5">
          {conversacion && (
            <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-center dark:border-gray-700 dark:bg-gray-800/50">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Conversación
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white">
                {nombre}
              </p>
              <p className="text-xs text-gray-500">
                {conversacion.telefono} · Cola: {conversacion.cola} ·{" "}
                {esAbierta(conversacion.estado) ? "Abierto" : "Cerrado"}
              </p>
            </div>
          )}

          <div className="flex items-stretch gap-3">
            <div className="flex-1 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Desde
              </p>
              <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-white">
                {agenteOrigenInfo
                  ? formatAgenteLineaPrincipal(agenteOrigenInfo)
                  : "—"}
              </p>
              {agenteOrigenInfo &&
                formatAgenteLineaSecundaria(agenteOrigenInfo) && (
                  <p className="text-xs text-gray-500">
                    {formatAgenteLineaSecundaria(agenteOrigenInfo)}
                  </p>
                )}
            </div>

            <div className="flex shrink-0 items-center text-gray-400">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </div>

            <div className="flex-1 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Hacia
              </p>
              {agenteDestino && agenteDestinoResuelto ? (
                <>
                  <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-white">
                    {formatAgenteLineaPrincipal(agenteDestinoResuelto)}
                  </p>
                  {formatAgenteLineaSecundaria(agenteDestinoResuelto) && (
                    <p className="text-xs text-gray-500">
                      {formatAgenteLineaSecundaria(agenteDestinoResuelto)}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-gray-400">Selecciona un agente</p>
              )}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500">
                Agente destino
              </label>
              <select
                className={selectClass}
                value={agenteDestino}
                onChange={(e) => setAgenteDestino(e.target.value)}
              >
                <option value="">Seleccionar agente</option>
                {agentes
                  .filter((ag) => {
                    const current = String(conversacion?.agenteId || "").trim();
                    if (!current) return true;
                    const keys = [ag.id, ag.exten, ag.usuario]
                      .map((k) => String(k ?? "").trim())
                      .filter(Boolean);
                    return !keys.includes(current);
                  })
                  .map((ag) => (
                    <option key={String(ag.id)} value={String(ag.id)}>
                      {formatAgenteEtiqueta(resolveAgente(ag.id, agentes))}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500">
                Comentario (opcional)
              </label>
              <input
                type="text"
                className={selectClass}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Comentario de la transferencia"
              />
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <button
              type="button"
              onClick={confirmar}
              disabled={!agenteDestino || transferiendo}
              className="inline-flex items-center justify-center rounded-lg bg-gray-800 px-5 py-3.5 text-sm font-medium text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              {transferiendo ? "Transferiendo..." : "Confirmar transferencia"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
