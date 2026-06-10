let ioInstance;
let chatModelInstance;

const setInstances = (io, chatModel) => {
  ioInstance = io;
  chatModelInstance = chatModel;
};

const getSocketUserId = (socket) =>
  socket?.data?.userId || socket?.data?.exten || null;

const {
  dedupeConversationsByPhonePerEstado,
} = require("../utils/conversationDedup");

const getState = async (userId, options = {}) => {
  const includeMessages = options.includeMessages === true;
  if (!chatModelInstance) {
    console.error("Error: chatModelInstance not set in chatUtils.");
    return { activos: [], nuevos: [], cerrados: [] };
  }

  if (typeof chatModelInstance.getVisibleQueueState === "function") {
    const visible = await chatModelInstance.getVisibleQueueState(userId);
    const activos = visible.activos || [];
    const nuevos = visible.nuevos || [];
    const cerrados = visible.cerrados || [];

    if (options.log !== false) {
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
    }

    if (includeMessages) {
      for (const conversation of [...activos, ...nuevos, ...cerrados]) {
        conversation.messages = await chatModelInstance.getMensajes(
          conversation.id,
        );
      }
    }

    return { activos, nuevos, cerrados };
  }

  const activosRaw = await chatModelInstance.getConversaciones(userId, "abierta");
  const cerradosRaw = await chatModelInstance.getConversaciones(userId, "cerrada");
  const nuevosRaw = userId
    ? await chatModelInstance.getConversaciones(userId, "nuevo")
    : [];

  const deduped = dedupeConversationsByPhonePerEstado([
    ...activosRaw,
    ...cerradosRaw,
    ...nuevosRaw,
  ]);

  const activos = deduped.filter((c) => c.estado === "abierta");
  const nuevos = deduped.filter((c) => c.estado === "nuevo");
  const cerrados = deduped.filter((c) => c.estado === "cerrada");

  if (options.log !== false) {
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
  }

  if (includeMessages) {
    for (const conversation of deduped) {
      conversation.messages = await chatModelInstance.getMensajes(
        conversation.id,
      );
    }
  }

  return { activos, nuevos, cerrados };
};

function socketMatchesAgentRef(socket, agentRef) {
  const target = String(agentRef || "").trim();
  if (!target) return false;
  const userId = String(socket?.data?.userId || "").trim();
  const exten = String(socket?.data?.exten || "").trim();
  return target === userId || target === exten;
}

function emitStateToUserSockets(userId, state) {
  if (!ioInstance) return;
  for (const socket of ioInstance.sockets.sockets.values()) {
    if (!socketMatchesAgentRef(socket, userId)) continue;
    socket.emit("update_queues", state);
  }
}

const broadcast = async (options = {}) => {
  if (!ioInstance || !chatModelInstance) {
    console.error(
      "Error: ioInstance or chatModelInstance not set in chatUtils.",
    );
    return;
  }

  const users = new Set();
  for (const socket of ioInstance.sockets.sockets.values()) {
    const uid = getSocketUserId(socket);
    if (uid) users.add(String(uid));
  }

  await Promise.all(
    [...users].map(async (uid) => {
      const state = await getState(uid, {
        includeMessages: options.includeMessages === true,
        log: options.log !== false,
      });
      emitStateToUserSockets(uid, state);
    }),
  );
};

const broadcastForUser = async (userId, options = {}) => {
  if (!chatModelInstance) return null;
  const uid = String(userId || "").trim();
  if (!uid) return null;

  const state = await getState(uid, {
    includeMessages: options.includeMessages === true,
    log: false,
  });
  emitStateToUserSockets(uid, state);
  return state;
};

const broadcastForAgentRefs = async (agentRefs = [], options = {}) => {
  if (!chatModelInstance) return [];
  const refs = [
    ...new Set(
      agentRefs.map((ref) => String(ref || "").trim()).filter(Boolean),
    ),
  ];
  if (!refs.length) return [];

  const results = [];
  for (const ref of refs) {
    const state = await getState(ref, {
      includeMessages: options.includeMessages === true,
      log: false,
    });
    emitStateToUserSockets(ref, state);
    results.push({ ref, state });
  }
  return results;
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

  try {
    await broadcastForUser(uid);
    await broadcast({ log: false });
  } catch (error) {
    console.warn("broadcast tras assignNext:", error.message);
  }
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
  broadcastForUser,
  broadcastForAgentRefs,
  emitStateToUserSockets,
  assignNext,
  broadcastEtiquetasCatalog,
};
