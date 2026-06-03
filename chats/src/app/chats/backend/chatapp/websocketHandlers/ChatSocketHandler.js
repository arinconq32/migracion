class ChatSocketHandler {
  constructor(
    io,
    chatModel,
    chatUtils,
    getCache = null,
    setCache = null,
    options = {},
  ) {
    this.io = io;
    this.chatModel = chatModel;
    this.chatUtils = chatUtils;
    this.getCache = getCache;
    this.setCache = setCache;
    this.MAX_ACTIVE = options.maxActive || 3;
    this.runtimeService = options.runtimeService || null;
  }

  async emitActiveConversationsCountForUser(uid) {
    if (!uid) return;

    const count = await this.chatModel.countActiveConversations(uid);
    for (const s of this.io.sockets.sockets.values()) {
      if (String(s.data.userId || "") === String(uid)) {
        s.emit("active_conversations_count", {
          count,
          max: this.MAX_ACTIVE,
          source: "memory",
          ts: Date.now(),
        });
      }
    }
  }

  handleConnection(socket) {
    console.log("Socket conectado:", socket.id);

    socket.on("login", async ({ userId, exten }) => {
      if (!userId && !exten) {
        socket.emit("error_msg", "userId es requerido");
        return;
      }

      socket.data.userId = userId ? String(userId) : null;
      socket.data.exten = exten || null;

      if (this.runtimeService) {
        this.runtimeService.registerSocketKeys(socket, { userId, exten });
      }

      const state = await this.chatUtils.getState(
        socket.data.userId || socket.data.exten,
      );
      socket.emit("init_state", state);
      await this.emitActiveConversationsCountForUser(
        socket.data.userId || socket.data.exten,
      );

      if (this.runtimeService) {
        const agenteInternoId = this.runtimeService.getInternalAgentId({
          userId,
          exten,
          socketId: socket.id,
        });
        socket.data.agenteInternoId = agenteInternoId;
        this.runtimeService.registerInternalAgentSocket(
          agenteInternoId,
          socket.id,
        );
        socket.emit("internal_agent_identity", { agentId: agenteInternoId });
        this.io.emit("estado_agente_interno", {
          agentId: agenteInternoId,
          estado: "online",
        });
        this.runtimeService.emitInternalAgentsList();
        await this.runtimeService.restoreActiveRoomsForAgent(
          socket,
          exten || userId,
        );
        await this.runtimeService.emitCatalogs(socket);
      }
    });

    socket.on(
      "request_active_conversations_count",
      async (payload, callback) => {
        const uid = payload?.userId || socket.data.userId;
        if (!uid) {
          if (typeof callback === "function")
            callback({ success: false, error: "userId no disponible" });
          return;
        }

        const count = await this.chatModel.countActiveConversations(uid);
        const response = {
          success: true,
          count,
          max: this.MAX_ACTIVE,
          source: "memory",
          ts: Date.now(),
        };
        socket.emit("active_conversations_count", response);
        if (typeof callback === "function") callback(response);
      },
    );

    socket.on("open_chat", async ({ convId, userId }, callback) => {
      try {
        const uid = String(userId || socket.data.userId || "");
        if (!uid) {
          const errPayload = {
            success: false,
            error: "userId no disponible para abrir chat",
          };
          socket.emit("error_msg", errPayload.error);
          if (typeof callback === "function") callback(errPayload);
          return;
        }

        const activeCount = await this.chatModel.countActiveConversations(uid);
        if (activeCount >= this.MAX_ACTIVE) {
          const errPayload = {
            success: false,
            error: `Máximo de ${this.MAX_ACTIVE} chats activos alcanzado`,
            count: activeCount,
            max: this.MAX_ACTIVE,
          };
          socket.emit("error_msg", errPayload.error);
          if (typeof callback === "function") callback(errPayload);
          return;
        }

        await this.chatModel.updateConversationState(
          convId,
          "abierta",
          uid,
          true,
        );
        socket.join(String(convId));
        socket.data.currentConvId = String(convId);

        await this.chatUtils.broadcast();
        await this.emitActiveConversationsCountForUser(uid);

        if (typeof callback === "function") {
          callback({ success: true, convId, estado: "abierta" });
        }
      } catch (error) {
        const errMessage =
          error?.message === "ACTIVE_LIMIT_REACHED"
            ? `Máximo de ${this.MAX_ACTIVE} chats activos alcanzado`
            : "Error al abrir el chat";
        socket.emit("error_msg", errMessage);
        if (typeof callback === "function")
          callback({ success: false, error: errMessage });
      }
    });

    socket.on("close_chat", async ({ convId }, callback) => {
      try {
        const uid = socket.data.userId;
        if (!uid) {
          if (typeof callback === "function")
            callback({ success: false, error: "No autenticado" });
          return;
        }

        await this.chatModel.updateConversationState(
          convId,
          "cerrada",
          uid,
          false,
        );

        const systemMsg = {
          id: `sys_${Date.now()}`,
          conversacion_id: convId,
          emisor: "sistema",
          mensaje: "Conversación finalizada por el agente",
          tipo: "sistema",
          timestamp: Date.now(),
        };

        this.io
          .to(String(convId))
          .emit("chat_message", { convId, msg: systemMsg });
        socket.leave(String(convId));

        await this.chatUtils.assignNext(uid);
        await this.chatUtils.broadcast();
        await this.emitActiveConversationsCountForUser(uid);

        if (typeof callback === "function") callback({ success: true });
      } catch (error) {
        console.error("Error cerrando chat:", error.message);
        if (typeof callback === "function")
          callback({
            success: false,
            error: "No se pudo cerrar la conversación",
          });
      }
    });

    socket.on("cargar_mensajes", async ({ convId }, callback) => {
      try {
        const agenteId = socket.handshake.query.userId || socket.userId;
        const mensajes = await this.chatModel.getMensajes(convId, agenteId);
        if (typeof callback === "function") callback(mensajes);
      } catch (error) {
        if (typeof callback === "function") callback([]);
      }
    });

    socket.on("chat_message", async ({ convId, text, msg }) => {
      try {
        const texto = String(text || msg?.mensaje || "").trim();
        if (!texto) return;

        const messageId = await this.chatModel.insertMessage(
          convId,
          "agente",
          texto,
          "texto",
        );

        const outgoing = {
          id: messageId,
          conversacion_id: Number(convId),
          emisor: "agente",
          mensaje: texto,
          text: texto,
          tipo: "texto",
          timestamp: Date.now(),
          origen: "web",
        };

        socket.emit("message_confirmed", {
          convId: Number(convId),
          msg: outgoing,
          tempId: msg?.tempId || null,
        });

        socket.to(String(convId)).emit("chat_message", {
          convId: Number(convId),
          msg: outgoing,
        });

        await this.chatUtils.broadcast();
      } catch (error) {
        console.error("Error en chat_message:", error.message);
        socket.emit("error_msg", "Error al procesar el mensaje");
      }
    });

    socket.on("obtener_agentes_internos", (callback) => {
      if (!this.runtimeService) {
        if (typeof callback === "function") callback({ agentes: [] });
        return;
      }

      const agentes = this.runtimeService.getInternalAgentsList(
        socket.data.agenteInternoId || null,
      );
      if (typeof callback === "function") {
        callback({ agentes });
      }
      socket.emit("lista_agentes_internos", { agentes });
    });

    socket.on("internal_chat_join", async (payload, callback) => {
      if (!this.runtimeService) {
        if (typeof callback === "function")
          callback({ ok: false, error: "runtime no configurado" });
        return;
      }

      const response = await this.runtimeService.openInternalChat(
        socket,
        payload || {},
      );
      if (typeof callback === "function") callback(response);
    });

    socket.on("internal_chat_historial", async (payload, callback) => {
      if (!this.runtimeService) {
        if (typeof callback === "function")
          callback({ ok: false, mensajes: [] });
        return;
      }

      const response = await this.runtimeService.getInternalHistory(
        socket,
        payload || {},
      );
      if (typeof callback === "function") callback(response);
    });

    socket.on("internal_chat_message", async (payload, callback) => {
      if (!this.runtimeService) {
        if (typeof callback === "function")
          callback({ ok: false, error: "runtime no configurado" });
        return;
      }

      const response = await this.runtimeService.sendInternalMessage(
        socket,
        payload || {},
      );
      if (!response.ok) {
        socket.emit("internal_chat_error", {
          error: response.error || "No se pudo guardar el mensaje interno",
        });
      }
      if (typeof callback === "function") callback(response);
    });

    socket.on("agente_disponible", async (payload) => {
      if (!this.runtimeService) return;

      const response = await this.runtimeService.assignSupportRequest({
        socket,
        ...(payload || {}),
      });
      if (!response.ok) {
        if (response.code === "ACTIVE_LIMIT_REACHED") {
          socket.emit("limite_conversaciones", {
            mensaje: response.error,
            maximo: this.MAX_ACTIVE,
          });
          return;
        }

        if (response.code === "REQUEST_TAKEN") {
          socket.emit("cliente_ya_asignado", { from: payload?.from });
          return;
        }

        if (response.code === "REQUEST_EXPIRED") {
          socket.emit("solicitud_expirada", {
            from: payload?.from,
            mensaje: response.error,
          });
          return;
        }

        socket.emit(
          "error_msg",
          response.error || "No se pudo asignar la conversación",
        );
      }
    });

    socket.on("obtener_conversaciones_activas", async ({ agenteNum } = {}) => {
      if (!this.runtimeService) return;

      const conversaciones =
        await this.runtimeService.getActiveConversationsForAgent(
          agenteNum || socket.data.exten || socket.data.userId,
        );
      socket.emit("conversaciones_activas_lista", {
        agente: agenteNum || socket.data.exten || socket.data.userId,
        conversaciones,
        total: conversaciones.length,
        maximo: this.MAX_ACTIVE,
      });
    });

    socket.on("enviar_mensaje_agente", async (payload) => {
      if (!this.runtimeService) return;

      const response = await this.runtimeService.sendAgentMessage({
        socket,
        ...(payload || {}),
      });
      if (!response.ok) {
        socket.emit("error_sala", {
          mensaje: response.error || "No se pudo enviar el mensaje",
        });
      }
    });

    socket.on("finalizar_conversacion", async (payload = {}) => {
      if (!this.runtimeService) return;

      const response = await this.runtimeService.finalizeConversation({
        socket,
        salaId: payload.salaId,
        motivo: payload.motivo,
      });

      if (!response.ok) {
        socket.emit("error_finalizacion", {
          salaId: payload.salaId,
          mensaje: response.error || "No se pudo finalizar la conversación",
        });
      }
    });

    socket.on("disconnect", () => {
      if (this.runtimeService) {
        this.runtimeService.unregisterSocketKeys(socket.id);
        const internalState = this.runtimeService.removeInternalAgentSocket(
          socket.id,
        );
        if (internalState.agentId) {
          this.io.emit("estado_agente_interno", {
            agentId: internalState.agentId,
            estado: internalState.stillConnected ? "online" : "offline",
          });
          this.runtimeService.emitInternalAgentsList();
        }
      }

      console.log(`Socket desconectado: ${socket.id}`);
    });
  }
}

module.exports = ChatSocketHandler;
