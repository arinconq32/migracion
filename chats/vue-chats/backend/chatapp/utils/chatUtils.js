let ioInstance;
let chatModelInstance;

const setInstances = (io, chatModel) => {
  ioInstance = io;
  chatModelInstance = chatModel;
};

const getSocketUserId = (socket) =>
  socket?.data?.userId || socket?.data?.exten || null;

const {
  dedupeConversationsByPhone,
} = require("../utils/conversationDedup");

const getState = async (userId) => {
  if (!chatModelInstance) {
    console.error("Error: chatModelInstance not set in chatUtils.");
    return { activos: [], nuevos: [], cerrados: [] };
  }

  const activosRaw = await chatModelInstance.getConversaciones(userId, "abierta");
  const cerradosRaw = await chatModelInstance.getConversaciones(userId, "cerrada");
  const nuevosRaw = await chatModelInstance.getPendientes();

  const deduped = dedupeConversationsByPhone([
    ...activosRaw,
    ...cerradosRaw,
    ...nuevosRaw,
  ]);

  const activos = deduped.filter((c) => c.estado === "abierta");
  const nuevos = deduped.filter((c) => c.estado === "nuevo");
  const cerrados = deduped.filter((c) => c.estado === "cerrada");

  console.log(`🔍 getState para usuario ${userId}:`);
  console.log(
    `   - Activos: ${activos.length} → IDs: [${activos.map((conversation) => conversation.id).join(",")}]`,
  );
  console.log(
    `   - Cerrados: ${cerrados.length} → IDs: [${cerrados.map((conversation) => conversation.id).join(",")}]`,
  );
  console.log(
    `   - Nuevos: ${nuevos.length} → IDs: [${nuevos.map((conversation) => conversation.id).join(",")}]`,
  );

  for (const conversation of deduped) {
    conversation.messages = await chatModelInstance.getMensajes(
      conversation.id,
    );
  }

  return { activos, nuevos, cerrados };
};

const broadcast = async () => {
  if (!ioInstance || !chatModelInstance) {
    console.error(
      "Error: ioInstance or chatModelInstance not set in chatUtils.",
    );
    return;
  }

  for (const socket of ioInstance.sockets.sockets.values()) {
    const uid = getSocketUserId(socket);
    if (!uid) {
      continue;
    }

    const state = await getState(uid);
    socket.emit("update_queues", state);
  }
};

const assignNext = async (uid) => {
  console.log(`🔄 EJECUTANDO assignNext para usuario ${uid}`);

  if (!chatModelInstance || !ioInstance) {
    console.error(
      "Error: chatModelInstance or ioInstance not set in chatUtils.",
    );
    return;
  }

  const nextId = await chatModelInstance.getNextPendingConversation(uid);
  console.log(`🔍 NextId obtenido: ${nextId}`);

  if (!nextId) {
    console.log("ℹ️ No hay conversaciones pendientes para asignar");
    return;
  }

  console.log(`🎯 Asignando conversación ${nextId} a usuario ${uid}`);

  try {
    await chatModelInstance.updateConversationState(
      nextId,
      "abierta",
      uid,
      true,
    );
  } catch (error) {
    if (error?.message === "ACTIVE_LIMIT_REACHED") {
      console.log(
        `ℹ️ assignNext omitido: agente ${uid} ya está en el límite de activas.`,
      );
      return;
    }

    throw error;
  }

  setTimeout(async () => {
    console.log("📢 Ejecutando broadcast con delay...");
    await broadcast();
  }, 100);
};

const broadcastEtiquetasCatalog = async () => {
  if (!ioInstance || !chatModelInstance?.getEtiquetas) {
    return;
  }

  const etiquetas = await chatModelInstance.getEtiquetas();
  ioInstance.emit("etiquetas", etiquetas);
};

module.exports = {
  setInstances,
  getState,
  broadcast,
  assignNext,
  broadcastEtiquetasCatalog,
};
