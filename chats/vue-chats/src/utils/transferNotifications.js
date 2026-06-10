function clean(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function agentLabel(nombre, fallbackId, exten) {
  const name = clean(nombre) || clean(fallbackId) || "otro agente";
  const ext = clean(exten);
  if (ext) return `${name} (ext. ${ext})`;
  return name;
}

function contactoLabel(payload = {}) {
  return (
    clean(payload.contactoNombre) ||
    clean(payload.telefono) ||
    "la conversación"
  );
}

export function buildTransferOutNotification(payload = {}) {
  const convId = clean(payload.convId);
  const destino = agentLabel(payload.haciaNombre, payload.hacia, payload.haciaExten);
  const contacto = contactoLabel(payload);
  const motivo = clean(payload.motivo) || "Sin comentario";

  return {
    id: `transfer-out-${convId || "conv"}-${Date.now()}`,
    type: "transfer-out",
    title: "Conversación transferida",
    text: `Se transfirió ${contacto} a ${destino}. Motivo: ${motivo}.`,
    persistent: true,
  };
}

export function buildTransferInNotification(payload = {}) {
  const convId = clean(payload.convId);
  const origen = agentLabel(payload.desdeNombre, payload.desde, payload.desdeExten);
  const contacto = contactoLabel(payload);
  const motivo = clean(payload.motivo) || "Sin comentario";

  return {
    id: `transfer-in-${convId || "conv"}-${Date.now()}`,
    type: "transfer-in",
    title: "Conversación recibida",
    text: `Recibes ${contacto} desde ${origen}. Motivo: ${motivo}.`,
    persistent: true,
  };
}
