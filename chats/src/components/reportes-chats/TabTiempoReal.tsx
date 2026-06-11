"use client";



import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {

  getConversacionesActivas,

  getMensajes,

  getAgentes,

  enviarMensajeSupervisor,

  formatAgenteEtiqueta,

  resolveAgente,

  type Agente,

  type ConversacionActiva,

  type MensajeChat,

} from "@/lib/reportesChatsApi";

import { useAuth } from "@/context/AuthContext";

import TransferirConversacionModal, {

  type ConversacionTransferible,

} from "./TransferirConversacionModal";

import {

  agruparPorDia,

  emisorLabel,

  estiloBurbuja,

  formatDia,

  formatHora,

  etiquetaConversacionActiva,

  textoMensaje,

} from "./chatMessageUtils";



function agenteLabel(conv: ConversacionActiva, agentes: Agente[]) {
  const id = String(conv.agenteId || "").trim();
  if (!id || id === "—") return "Sin asignar";
  return formatAgenteEtiqueta(
    resolveAgente(conv.agenteId, agentes, conv.agenteNombre),
  );
}



function estadoLabel(estado: string) {
  const e = String(estado || "").toLowerCase();
  if (e === "abierta" || e === "activa") return "Abierta";
  if (e === "nuevo") return "Nuevo";
  if (e === "pendiente") return "Pendiente";
  return estado || "—";
}

function esEnVivo(conv: ConversacionActiva) {
  if (conv.sesionRuntime) return true;
  const estado = String(conv.estado || "").toLowerCase();
  const id = String(conv.agenteId || "").trim();
  const conAgente = Boolean(id && id !== "—");
  return conAgente && (estado === "abierta" || estado === "activa");
}

function MarcaConversacion({ conv }: { conv: ConversacionActiva }) {
  if (conv.enVivo ?? esEnVivo(conv)) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        En vivo
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-400">
      Activa
    </span>
  );
}

function transferenciaTexto(conv: ConversacionActiva, agentes: Agente[]) {
  if (!conv.transferido) return null;

  const etiqueta = (id?: string, nombre?: string) =>
    id
      ? formatAgenteEtiqueta(resolveAgente(id, agentes, nombre))
      : nombre || "—";

  const ultima = conv.ultimaTransferencia;
  if (ultima?.desde || ultima?.hacia) {
    const desde = etiqueta(ultima.desde, ultima.desdeNombre);
    const hacia = etiqueta(ultima.hacia, ultima.haciaNombre);
    return `Transferida: ${desde} → ${hacia}`;
  }

  const lista = conv.transferencias || [];
  if (!lista.length) return "Con transferencia";

  const t = lista[lista.length - 1];
  const desde = etiqueta(t.desde, t.desdeNombre);
  const hacia = etiqueta(t.hacia, t.haciaNombre);
  if (desde !== "—" && hacia !== "—") {
    return `Transferida: ${desde} → ${hacia}`;
  }
  return "Con transferencia";
}



export default function TabTiempoReal() {

  const { user } = useAuth();

  const [activas, setActivas] = useState<ConversacionActiva[]>([]);

  const [agentes, setAgentes] = useState<Agente[]>([]);

  const [selected, setSelected] = useState<ConversacionActiva | null>(null);

  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);

  const [nuevoMensaje, setNuevoMensaje] = useState("");

  const [loading, setLoading] = useState(false);

  const [enviando, setEnviando] = useState(false);

  const [error, setError] = useState("");

  const [transferOpen, setTransferOpen] = useState(false);

  const [transferTarget, setTransferTarget] =

    useState<ConversacionTransferible | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedIdRef = useRef<string | null>(null);



  useEffect(() => {

    getAgentes().then(setAgentes).catch(() => {});

  }, []);



  const cargarActivas = useCallback(async () => {

    try {

      const data = await getConversacionesActivas();

      setActivas(data);

      const currentId = selectedIdRef.current;

      if (currentId) {

        const updated = data.find((c) => c.id === currentId);

        if (updated) setSelected(updated);

      }

    } catch (e) {

      setError(e instanceof Error ? e.message : "Error al cargar conversaciones");

    }

  }, []);



  const cargarMensajes = useCallback(async (convId: string, silent = false) => {

    if (!silent) setLoading(true);

    try {

      const data = await getMensajes(convId);

      setMensajes(data);

      setError("");

    } catch (e) {

      setError(e instanceof Error ? e.message : "Error al cargar mensajes");

    } finally {

      if (!silent) setLoading(false);

    }

  }, []);



  useEffect(() => {

    cargarActivas();

    const interval = setInterval(cargarActivas, 5000);

    return () => clearInterval(interval);

  }, [cargarActivas]);



  useEffect(() => {

    selectedIdRef.current = selected?.id || null;

    if (!selected) {

      setMensajes([]);

      return;

    }



    cargarMensajes(selected.id);

    const interval = setInterval(() => cargarMensajes(selected.id, true), 3000);

    return () => clearInterval(interval);

  }, [selected, cargarMensajes]);



  useEffect(() => {

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  }, [mensajes]);



  const gruposMensajes = useMemo(() => agruparPorDia(mensajes), [mensajes]);



  const seleccionar = (conv: ConversacionActiva) => {

    setSelected(conv);

    setError("");

  };



  const abrirTransferencia = (conv: ConversacionActiva) => {

    setTransferTarget({

      id: conv.id,

      telefono: conv.telefono,

      nombre: etiquetaConversacionActiva(conv),

      agenteId: conv.agenteId,

      agenteNombre: agenteLabel(conv, agentes),

      cola: conv.cola,

      estado: conv.estado,

    });

    setTransferOpen(true);

  };



  const enviarSupervisor = async () => {

    if (!selected || !nuevoMensaje.trim()) return;

    setEnviando(true);

    try {

      await enviarMensajeSupervisor({

        conversacionId: selected.id,

        mensaje: nuevoMensaje.trim(),

        supervisorId: user?.usuario || "supervisor",

      });

      setNuevoMensaje("");

      await cargarMensajes(selected.id, true);

    } catch (e) {

      setError(e instanceof Error ? e.message : "Error al enviar mensaje");

    } finally {

      setEnviando(false);

    }

  };



  const inputClass =

    "h-11 flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";



  return (

    <div className="grid gap-4 lg:grid-cols-5">

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 lg:col-span-2">

        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">

          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">

            Conversaciones en vivo

          </h3>

          <span className="text-xs text-gray-500">{activas.length} activas</span>

        </div>

        <div className="max-h-[560px] overflow-y-auto">

          {activas.length === 0 ? (

            <p className="p-4 text-sm text-gray-400">No hay conversaciones activas</p>

          ) : (

            <table className="min-w-full">

              <thead>

                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">

                  <th className="px-2 py-2 text-center text-xs font-semibold uppercase text-gray-400">

                    Transferir

                  </th>

                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-400">

                    Conversación

                  </th>

                </tr>

              </thead>

              <tbody>

                {activas.map((c) => {

                  const nombre = etiquetaConversacionActiva(c);

                  const agente = agenteLabel(c, agentes);

                  const transferencia = transferenciaTexto(c, agentes);

                  return (

                    <tr

                      key={c.id}

                      className={`border-b border-gray-100 transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/30 ${

                        selected?.id === c.id ? "bg-gray-100 dark:bg-gray-800/50" : ""

                      }`}

                    >

                      <td className="px-2 py-2 text-center">

                        <button

                          type="button"

                          onClick={() => abrirTransferencia(c)}

                          title="Transferir conversación"

                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"

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

                      <td className="px-3 py-2">

                        <button

                          type="button"

                          onClick={() => seleccionar(c)}

                          className="w-full text-left"

                        >

                          <div className="flex items-center gap-2">

                            <span className="text-sm font-medium text-gray-800 dark:text-white">

                              {nombre}

                            </span>

                            <MarcaConversacion conv={c} />

                          </div>

                          <p className="text-xs text-gray-500">

                            {estadoLabel(c.estado)} · Agente: {agente}

                            {c.cola && c.cola !== "—" ? ` · Cola: ${c.cola}` : ""}

                          </p>

                          {transferencia && (

                            <p className="text-xs text-amber-700 dark:text-amber-400">

                              {transferencia}

                            </p>

                          )}

                        </button>

                      </td>

                    </tr>

                  );

                })}

              </tbody>

            </table>

          )}

        </div>

      </div>



      <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 lg:col-span-3">

        {selected ? (

          <>

            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">

              <div>

                <div className="flex flex-wrap items-center gap-2">

                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white">

                    {etiquetaConversacionActiva(selected)}

                  </h3>

                  <MarcaConversacion conv={selected} />

                </div>

                <p className="text-xs text-gray-500">

                  {estadoLabel(selected.estado)} · Agente:{" "}

                  {agenteLabel(selected, agentes)}

                  {selected.cola && selected.cola !== "—"

                    ? ` · Cola: ${selected.cola}`

                    : ""}

                </p>

                {transferenciaTexto(selected, agentes) && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {transferenciaTexto(selected, agentes)}
                  </p>
                )}

              </div>

              <button

                type="button"

                onClick={() => abrirTransferencia(selected)}

                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"

              >

                <svg

                  className="h-3.5 w-3.5"

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

                Transferir

              </button>

            </div>



            <div

              className="flex-1 space-y-4 overflow-y-auto bg-gray-100/70 p-4 dark:bg-gray-900/40"

              style={{ minHeight: 420, maxHeight: 480 }}

            >

              {loading && mensajes.length === 0 ? (

                <p className="py-10 text-center text-sm text-gray-400">

                  Cargando mensajes...

                </p>

              ) : mensajes.length === 0 ? (

                <p className="py-10 text-center text-sm text-gray-400">

                  Sin mensajes aún

                </p>

              ) : (

                gruposMensajes.map((grupo, gi) => (

                  <div key={gi}>

                    {grupo.dia && (

                      <div className="my-3 flex items-center gap-3">

                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />

                        <span className="text-xs text-gray-400 capitalize">

                          {formatDia(grupo.dia)}

                        </span>

                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />

                      </div>

                    )}

                    <div className="space-y-3">

                      {grupo.items.map((m) => {

                        const estilo = estiloBurbuja(m.emisor, m.origen);

                        const contenido = textoMensaje(m);



                        return (

                          <div

                            key={m.id}

                            className={`flex ${estilo.alineacion}`}

                          >

                            <div

                              className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${estilo.clase}`}

                            >

                              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">

                                {emisorLabel(m.emisor, m.origen)} ·{" "}

                                {formatHora(m.fecha)}

                              </p>

                              {m.archivoUrl &&

                              String(m.tipo || "")

                                .toLowerCase()

                                .includes("image") ? (

                                <div className="mt-2 space-y-2">

                                  {/* eslint-disable-next-line @next/next/no-img-element */}

                                  <img

                                    src={m.archivoUrl}

                                    alt="Imagen adjunta"

                                    className="max-h-48 rounded-lg object-cover"

                                  />

                                  {contenido !== "📷 Imagen" &&

                                    contenido !== "[Imagen]" && (

                                    <p className="whitespace-pre-wrap leading-relaxed">

                                      {contenido}

                                    </p>

                                  )}

                                </div>

                              ) : (

                                <p className="mt-1 whitespace-pre-wrap leading-relaxed">

                                  {contenido}

                                </p>

                              )}

                            </div>

                          </div>

                        );

                      })}

                    </div>

                  </div>

                ))

              )}

              <div ref={messagesEndRef} />

            </div>



            {error && (

              <p className="border-t border-gray-200 px-4 py-2 text-sm text-red-600 dark:border-gray-700">

                {error}

              </p>

            )}



            <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">

              <p className="mb-2 text-xs font-medium text-gray-500">

                Intervención de supervisor

              </p>

              <div className="flex gap-2">

                <input

                  type="text"

                  className={inputClass}

                  value={nuevoMensaje}

                  onChange={(e) => setNuevoMensaje(e.target.value)}

                  placeholder="Escribe un mensaje de supervisor..."

                  onKeyDown={(e) => e.key === "Enter" && enviarSupervisor()}

                />

                <button

                  type="button"

                  onClick={enviarSupervisor}

                  disabled={enviando || !nuevoMensaje.trim()}

                  className="shrink-0 rounded-lg bg-gray-800 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-900 disabled:opacity-50 dark:bg-gray-700"

                >

                  {enviando ? "..." : "Enviar"}

                </button>

              </div>

            </div>

          </>

        ) : (

          <div className="flex h-[560px] items-center justify-center bg-gray-50/50 dark:bg-gray-900/20">

            <p className="text-sm text-gray-400">

              Selecciona una conversación para ver los mensajes

            </p>

          </div>

        )}

      </div>



      <TransferirConversacionModal

        isOpen={transferOpen}

        onClose={() => setTransferOpen(false)}

        conversacion={transferTarget}

        onTransferido={() => {

          cargarActivas();

          if (selected && transferTarget?.id === selected.id) {

            cargarMensajes(selected.id, true);

          }

        }}

      />

    </div>

  );

}

