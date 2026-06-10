class ChatRuntimeService {
  constructor({ io, chatModel, chatUtils, maxActive = 3 }) {
    this.io = io;
    this.chatModel = chatModel;
    this.chatUtils = chatUtils;
    this.MAX_ACTIVE = maxActive;
    this.TIEMPO_ESPERA_RESPUESTAS = Number(
      process.env.TIMEOUT_SOLICITUD_AGENTE || 30000,
    );
    this.userSessions = new Map();
    this.pendingRequests = new Map();
    this.activeRooms = new Map();
    this.agentRooms = new Map();
    this.clientToRoom = new Map();
    this.connectedSockets = new Map();
    this.internalAgentBySocket = new Map();
    this.socketsByInternalAgent = new Map();
  }

  getLiveConversationIds(agentKey) {
    const normalized = this.normalizeAgentKey(agentKey);
    const liveIds = new Set();

    for (const [key, socketId] of this.connectedSockets.entries()) {
      if (this.normalizeAgentKey(key) !== normalized) continue;
      const socket = this.io?.sockets?.sockets?.get(socketId);
      if (!socket) continue;

      const currentConvId = String(socket.data?.currentConvId || "").trim();
      if (currentConvId) liveIds.add(currentConvId);

      for (const room of socket.rooms || []) {
        if (room === socket.id) continue;
        if (String(room).startsWith("internal-room-")) continue;
        liveIds.add(String(room));
      }
    }

    return liveIds;
  }

  normalizeAgentKey(value) {
    if (value === null || value === undefined) return "";
    let normalized = String(value).trim().toLowerCase();

    if (normalized.includes("/")) {
      normalized = normalized.split("/").pop();
    }

    if (normalized.includes("@")) {
      normalized = normalized.split("@")[0];
    }

    return normalized;
  }

  normalizeQueueName(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim().toLowerCase();
  }

  normalizeInternalAgentId(value) {
    return this.normalizeAgentKey(value);
  }

  getInternalAgentId({ exten, userId, socketId, internalAgentId }) {
    return this.normalizeInternalAgentId(
      internalAgentId || exten || userId || socketId,
    );
  }

  setInternalAgentIdentity(socket, agentId) {
    const normalized = this.normalizeInternalAgentId(agentId);
    if (!normalized || !socket?.id) {
      return { ok: false, error: "ID de agente inválido" };
    }

    this.removeInternalAgentSocket(socket.id);
    socket.data.agenteInternoId = normalized;
    this.registerInternalAgentSocket(normalized, socket.id);
    this.emitInternalAgentsList();

    return { ok: true, agentId: normalized };
  }

  getInternalRoomId(agentA, agentB) {
    const [left, right] = [
      this.normalizeInternalAgentId(agentA),
      this.normalizeInternalAgentId(agentB),
    ].sort();
    return `internal-room-${left}-${right}`;
  }

  saveSessionConfig(from, cola, pausa) {
    const key = String(from || "").trim();
    if (!key) return { cola: null, pausa: null };

    const record = {
      cola: cola ?? null,
      pausa: pausa ?? null,
      timestamp: Date.now(),
      updatedAt: new Date().toISOString(),
    };

    this.userSessions.set(key, record);
    return record;
  }

  getSessionConfig(from) {
    const key = String(from || "").trim();
    const session = this.userSessions.get(key);
    if (!session) {
      return { cola: null, pausa: null };
    }

    if (Date.now() - session.timestamp > 86400000) {
      this.userSessions.delete(key);
      return { cola: null, pausa: null };
    }

    return session;
  }

  registerSocketKeys(socket, { userId, exten }) {
    const keys = [userId, exten]
      .map((value) => this.normalizeAgentKey(value))
      .filter(Boolean);

    keys.forEach((key) => {
      this.connectedSockets.set(key, socket.id);
    });

    socket.data.userId = userId ? String(userId) : socket.data.userId || null;
    socket.data.exten = exten || socket.data.exten || null;
    socket.data.socketKeys = keys;
    if (!socket.data.estadoConexion) {
      socket.data.estadoConexion = "Activo";
    }
    return keys;
  }

  isAgentAvailableForQueue(socket) {
    if (!socket) return false;
    const estado = String(socket.data?.estadoConexion || "Activo").trim();
    const blocked = ["ocupado", "ausente", "sin conexion", "sin conexión"];
    return !blocked.includes(estado.toLowerCase());
  }

  async resolveQueueAgents(cola, pausa) {
    if (typeof this.chatModel.getQueueAgents === "function") {
      const fromModel = await this.chatModel.getQueueAgents(
        this.normalizeQueueName(cola),
        pausa,
        [],
      );
      if (Array.isArray(fromModel) && fromModel.length > 0) {
        return fromModel;
      }
    }
    return this.getConnectedQueueAgents(cola, pausa);
  }

  getConnectedQueueAgents(cola, pausa) {
    if (Number(pausa) === 1) return [];

    const targetQueue = this.normalizeQueueName(cola);
    const seenSocketIds = new Set();
    const agents = [];

    for (const [, socketId] of this.connectedSockets.entries()) {
      if (!socketId || seenSocketIds.has(socketId)) continue;

      const socket = this.io.sockets.sockets.get(socketId);
      if (!socket || !this.isAgentAvailableForQueue(socket)) continue;

      const agentInterface = String(
        socket.data.userId || socket.data.exten || "",
      ).trim();
      if (!agentInterface) continue;

      seenSocketIds.add(socketId);
      agents.push({
        interface: agentInterface,
        exten: String(socket.data.exten || agentInterface).trim(),
        nombre: String(socket.data.nombreAgente || `Agente ${agentInterface}`),
        estado: "online",
        colas: targetQueue ? [targetQueue] : [],
      });
    }

    return agents;
  }

  buildAgentStatusWhatsAppMessage(estado) {
    const normalized = String(estado || "").trim().toLowerCase();
    if (normalized === "activo") {
      return "Tu asesor está disponible nuevamente para continuar contigo.";
    }
    if (normalized === "ocupado") {
      return "Tu asesor se encuentra ocupado en este momento. Responderemos tan pronto como sea posible.";
    }
    if (normalized === "ausente") {
      return "Tu asesor no está disponible por el momento. Hemos registrado tu mensaje y te contactaremos pronto.";
    }
    if (normalized === "sin conexion" || normalized === "sin conexión") {
      return "Tu asesor no está conectado en este momento. Te responderemos cuando vuelva a estar en línea.";
    }
    return null;
  }

  async notifyActiveConversationsAgentStatus(agentKey, estado) {
    const text = this.buildAgentStatusWhatsAppMessage(estado);
    if (!text) {
      return { ok: true, notified: 0 };
    }

    const normalized = this.normalizeAgentKey(agentKey);
    const phones = new Set();

    if (typeof this.chatModel.getConversaciones === "function") {
      const activos = await this.chatModel.getConversaciones(normalized, "abierta");
      for (const conv of activos || []) {
        const phone = String(conv.telefono || conv.tels || "").trim();
        if (phone) phones.add(phone);
      }
    }

    const roomIds = this.agentRooms.get(normalized);
    if (roomIds) {
      for (const roomId of roomIds) {
        const room = this.activeRooms.get(roomId);
        const phone = String(room?.cliente || "").trim();
        if (phone) phones.add(phone);
      }
    }

    let notified = 0;
    for (const phone of phones) {
      const result = await this.sendWhatsAppMessage(phone, text, "text");
      if (result?.success) notified += 1;
    }

    return { ok: true, notified, mensaje: text };
  }

  async handleAgentStatusChange(socket, estado, options = {}) {
    const nextEstado = String(estado || "Activo").trim() || "Activo";
    const previous = String(socket.data.estadoConexion || "Activo").trim();
    const silent = Boolean(options?.silent);
    socket.data.estadoConexion = nextEstado;

    const agentKey = this.normalizeAgentKey(
      socket.data.userId || socket.data.exten,
    );
    if (!agentKey) {
      return { ok: false, error: "Agente no identificado" };
    }

    let notifyResult = { notified: 0 };
    if (
      !silent &&
      previous.toLowerCase() !== nextEstado.toLowerCase()
    ) {
      notifyResult = await this.notifyActiveConversationsAgentStatus(
        agentKey,
        nextEstado,
      );
    }

    return {
      ok: true,
      estado: nextEstado,
      notified: notifyResult.notified || 0,
      mensaje: notifyResult.mensaje || null,
    };
  }

  unregisterSocketKeys(socketId) {
    for (const [key, value] of this.connectedSockets.entries()) {
      if (value === socketId) {
        this.connectedSockets.delete(key);
      }
    }
  }

  getSocketByAgent(agentKey) {
    const socketId = this.connectedSockets.get(
      this.normalizeAgentKey(agentKey),
    );
    return socketId ? this.io.sockets.sockets.get(socketId) || null : null;
  }

  registerInternalAgentSocket(agentId, socketId) {
    const normalized = this.normalizeInternalAgentId(agentId);
    if (!normalized || !socketId) return;

    this.internalAgentBySocket.set(socketId, normalized);

    if (!this.socketsByInternalAgent.has(normalized)) {
      this.socketsByInternalAgent.set(normalized, new Set());
    }

    this.socketsByInternalAgent.get(normalized).add(socketId);
  }

  removeInternalAgentSocket(socketId) {
    const agentId = this.internalAgentBySocket.get(socketId);
    if (!agentId) {
      return { agentId: null, stillConnected: false };
    }

    this.internalAgentBySocket.delete(socketId);
    const socketIds = this.socketsByInternalAgent.get(agentId);

    if (!socketIds) {
      return { agentId, stillConnected: false };
    }

    socketIds.delete(socketId);
    if (socketIds.size === 0) {
      this.socketsByInternalAgent.delete(agentId);
      return { agentId, stillConnected: false };
    }

    return { agentId, stillConnected: true };
  }

  getInternalAgentsList(currentAgentId = null) {
    const current = this.normalizeInternalAgentId(currentAgentId);

    return Array.from(this.socketsByInternalAgent.entries())
      .filter(
        ([agentId, socketIds]) => agentId && socketIds && socketIds.size > 0,
      )
      .filter(
        ([agentId]) =>
          !current || this.normalizeInternalAgentId(agentId) !== current,
      )
      .map(([agentId]) => ({
        id: String(agentId),
        exten: String(agentId),
        nombre: `Agente ${agentId}`,
        estado: "online",
        ultimoMensaje: "",
        ultimoTimestamp: null,
      }));
  }

  emitInternalAgentsList() {
    this.socketsByInternalAgent.forEach((socketIds, agentId) => {
      const agentes = this.getInternalAgentsList(agentId);
      socketIds.forEach((socketId) => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit("lista_agentes_internos", { agentes });
        }
      });
    });
  }

  async restoreActiveRoomsForAgent(socket, agentKey) {
    const salas = this.agentRooms.get(this.normalizeAgentKey(agentKey));
    if (!salas || salas.size === 0) return;

    for (const salaId of salas) {
      const room = this.activeRooms.get(salaId);
      if (!room || room.estado !== "activa") continue;

      room.socketAgente = socket.id;
      room.mensajes = await this.chatModel.getMensajes(room.convId);
      socket.join(room.id);
      socket.emit("restaurar_conversacion_whatsapp", {
        from: room.cliente,
        numero: room.cliente,
        salaId: room.id,
        mensajes: room.mensajes,
        timestamp: room.timestamp,
      });
    }
  }

  async getAgentCapacity(agentKey) {
    const normalized = this.normalizeAgentKey(agentKey);
    if (typeof this.chatModel.repairActiveConversations === "function") {
      await this.chatModel.repairActiveConversations(normalized);
    }
    const modelCount =
      await this.chatModel.countActiveConversations(normalized);

    return {
      agenteNormalizado: normalized,
      salasActivasMemoria: this.agentRooms.get(normalized)?.size || 0,
      cargaModelo: modelCount,
      cargaValidada: modelCount,
      puedeAceptar: modelCount < this.MAX_ACTIVE,
    };
  }

  async filterAgentsByCapacity(agents) {
    const evaluations = await Promise.all(
      (agents || []).map(async (agent) => {
        const capacity = await this.getAgentCapacity(agent.interface);
        return capacity.puedeAceptar ? agent : null;
      }),
    );

    return evaluations.filter(Boolean);
  }

  async emitSupportRequest(from, cola, pausa) {
    const client = String(from || "").trim();
    if (!client) {
      return false;
    }

    const active = this.pendingRequests.get(client);
    if (
      active &&
      !active.asignado &&
      Date.now() - active.timestamp < this.TIEMPO_ESPERA_RESPUESTAS
    ) {
      return true;
    }

    this.saveSessionConfig(client, cola, pausa);

    const available = await this.resolveQueueAgents(cola, pausa);
    const agentes = await this.filterAgentsByCapacity(available);
    if (agentes.length === 0) {
      return false;
    }

    const request = {
      agentes,
      timestamp: Date.now(),
      asignado: false,
      colaFinal: this.normalizeQueueName(cola) || null,
      pausaFinal: pausa ?? null,
    };

    this.pendingRequests.set(client, request);

    agentes.forEach((agente) => {
      const socket = this.getSocketByAgent(agente.interface);
      if (socket) {
        socket.emit("colas", {
          from: client,
          agentes,
          timestamp: Date.now(),
          cola,
          pausa,
          userId: this.normalizeAgentKey(agente.interface),
        });
      }
    });

    setTimeout(() => {
      const pending = this.pendingRequests.get(client);
      if (!pending || pending.asignado) return;

      this.pendingRequests.delete(client);
      pending.agentes.forEach((agente) => {
        const socket = this.getSocketByAgent(agente.interface);
        if (socket) {
          socket.emit("solicitud_expirada", { from: client });
        }
      });
    }, this.TIEMPO_ESPERA_RESPUESTAS);

    return true;
  }

  async assignSupportRequest({ socket, from, agenteId, numero }) {
    const client = String(from || "").trim();
    const agentKey = this.normalizeAgentKey(
      numero || agenteId || socket.data.exten || socket.data.userId,
    );
    if (!client || !agentKey) {
      return { ok: false, error: "Datos inválidos para asignar soporte" };
    }

    const capacity = await this.getAgentCapacity(agentKey);
    if (!capacity.puedeAceptar) {
      return {
        ok: false,
        error: `No puedes aceptar más de ${this.MAX_ACTIVE} salas activas`,
        code: "ACTIVE_LIMIT_REACHED",
      };
    }

    const request = this.pendingRequests.get(client);
    if (!request) {
      return {
        ok: false,
        error: "La solicitud ya no existe",
        code: "REQUEST_EXPIRED",
      };
    }

    if (request.asignado) {
      return {
        ok: false,
        error: "La solicitud ya fue tomada por otro agente",
        code: "REQUEST_TAKEN",
      };
    }

    request.asignado = true;

    const nombre = `Cliente ${client.slice(-4)}`;
    await this.chatModel.insertContacto(nombre, client);
    const conversation = await this.chatModel.upsertConversationForClient({
      telefono: client,
      nombre,
      cola: request.colaFinal,
      agenteId: agentKey,
    });

    const salaId = `${client}-${agentKey}-${conversation.id}`;
    await this.chatModel.attachRoomToConversation(conversation.id, salaId);
    await this.chatModel.updateConversationState(
      conversation.id,
      "abierta",
      agentKey,
      true,
      salaId,
    );

    const mensajes = await this.chatModel.getMensajes(conversation.id);
    const room = {
      id: salaId,
      convId: conversation.id,
      conversacion_id: conversation.id,
      agente: agentKey,
      agenteId: agentKey,
      cliente: client,
      cola: request.colaFinal,
      socketAgente: socket.id,
      timestamp: Date.now(),
      estado: "activa",
      mensajes,
    };

    this.activeRooms.set(salaId, room);
    this.clientToRoom.set(client, salaId);
    if (!this.agentRooms.has(agentKey)) {
      this.agentRooms.set(agentKey, new Set());
    }
    this.agentRooms.get(agentKey).add(salaId);
    socket.join(salaId);

    request.agentes.forEach((agente) => {
      const agenteSocket = this.getSocketByAgent(agente.interface);
      if (agenteSocket && agenteSocket.id !== socket.id) {
        agenteSocket.emit("soporte_asignado", {
          from: client,
          mensaje: "La conversación ya fue tomada por otro agente.",
        });
      }
    });

    const state = await this.chatUtils.getState(agentKey);
    const payload = {
      from: client,
      numero: client,
      mensaje: `Conectado con WhatsApp ${client}`,
      salaId,
      conversacionesActuales:
        await this.chatModel.countActiveConversations(agentKey),
      data: state,
      agenteId: agentKey,
      convId: conversation.id,
    };

    socket.emit("asignacion_confirmada", payload);
    socket.emit("chat_assigned", {
      id: conversation.id,
      convId: conversation.id,
      telefono: client,
      nombre: conversation.nombre,
      estado: "abierta",
      salaId,
      agente_id: agentKey,
    });

    const nombreAgente = await this.chatModel.getAgentDisplayName(agentKey);
    await this.sendWhatsAppMessage(
      client,
      `Hola, soy ${nombreAgente}. Ya tomé tu caso y continúo contigo por este canal.`,
      "text",
    );

    await this.broadcastQueues();
    setTimeout(() => {
      this.pendingRequests.delete(client);
    }, 5000);

    return { ok: true, room, payload };
  }

  async getActiveConversationsForAgent(agentKey) {
    const normalized = this.normalizeAgentKey(agentKey);
    const rooms = this.agentRooms.get(normalized);
    if (!rooms) return [];

    return Array.from(rooms)
      .map((roomId) => this.activeRooms.get(roomId))
      .filter(Boolean)
      .map((room) => ({
        salaId: room.id,
        cliente: room.cliente,
        timestamp: room.timestamp,
        estado: room.estado,
        mensajes: room.mensajes.length,
        duracion: Math.round((Date.now() - room.timestamp) / 1000),
      }));
  }

  async sendAgentMessage({ socket, salaId, mensaje, cliente }) {
    const room = this.activeRooms.get(String(salaId || "").trim());
    if (!room) {
      return { ok: false, error: "Sala no encontrada" };
    }

    if (room.socketAgente !== socket.id) {
      return { ok: false, error: "No perteneces a esta sala" };
    }

    const text = String(mensaje || "").trim();
    if (!text) {
      return { ok: false, error: "Mensaje vacío" };
    }

    const messageId = await this.chatModel.insertMessage(
      room.convId,
      "agente",
      text,
      "texto",
      {
        origen: "web",
      },
    );

    const outgoing = {
      id: messageId,
      conversacion_id: room.convId,
      convId: room.convId,
      emisor: "agente",
      mensaje: text,
      text,
      tipo: "texto",
      timestamp: Date.now(),
      origen: "web",
    };

    room.mensajes.push(outgoing);
    socket.emit("message_confirmed", {
      convId: room.convId,
      msg: outgoing,
      tempId: null,
    });
    socket.emit("mensaje_enviado_confirmado", {
      salaId: room.id,
      mensaje: text,
      cliente: cliente || room.cliente,
      timestamp: new Date(),
      idMensaje: messageId,
    });

    await this.sendWhatsAppMessage(room.cliente, text, "text");
    return { ok: true, message: outgoing };
  }

  removeRoomIndexes(room) {
    this.activeRooms.delete(room.id);
    this.clientToRoom.delete(room.cliente);

    const rooms = this.agentRooms.get(this.normalizeAgentKey(room.agente));
    if (rooms) {
      rooms.delete(room.id);
      if (rooms.size === 0) {
        this.agentRooms.delete(this.normalizeAgentKey(room.agente));
      }
    }
  }

  async closeRoom(
    room,
    { motivo, notifyAgentSocket = null, notifyClient = false } = {},
  ) {
    if (!room) {
      return { ok: false, error: "Sala no encontrada" };
    }

    room.estado = "cerrada";
    await this.chatModel.closeConversation(room.convId);
    this.removeRoomIndexes(room);
    this.io.in(room.id).socketsLeave(room.id);

    const payload = {
      salaId: room.id,
      convId: room.convId,
      cliente: room.cliente,
      motivo: motivo || "finalizada",
      duracion: Math.round((Date.now() - room.timestamp) / 1000),
      totalMensajes: room.mensajes.length,
    };

    if (notifyAgentSocket) {
      notifyAgentSocket.emit("conversacion_finalizada", payload);
    }

    if (notifyClient) {
      await this.sendWhatsAppMessage(
        room.cliente,
        "La conversación ha finalizado. Gracias por contactarnos.",
        "text",
      );
    }

    await this.broadcastQueues();
    return { ok: true, payload };
  }

  async finalizeConversation({ socket, salaId, motivo }) {
    const room = this.activeRooms.get(String(salaId || "").trim());
    if (!room) {
      return { ok: false, error: "Sala no encontrada" };
    }

    if (room.socketAgente !== socket.id) {
      return {
        ok: false,
        error: "No autorizado para finalizar esta conversación",
      };
    }

    if (!String(motivo || "").trim()) {
      return {
        ok: false,
        error: "Debes seleccionar un motivo para finalizar la conversación.",
      };
    }

    return this.closeRoom(room, {
      motivo,
      notifyAgentSocket: socket,
      notifyClient: true,
    });
  }

  async broadcastQueues() {
    await this.chatUtils.broadcast();
  }

  async sendWhatsAppMessage(
    numeroDestino,
    mensaje,
    tipoMensaje,
    datosAdicionales = {},
  ) {
    const to = String(numeroDestino || "").trim();
    const type = String(tipoMensaje || "text")
      .trim()
      .toLowerCase();
    const text = String(mensaje || "").trim();
    if (!to) {
      return { success: false, error: "Número de destino vacío" };
    }

    const endpoint = String(process.env.WHATSAPP_OUTBOUND_URL || "").trim();
    if (endpoint) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, type, text, datosAdicionales }),
        });
        const data = await response.json().catch(() => ({}));

        return {
          success: response.ok,
          status_code: response.status,
          respuesta_api: data,
          payload_enviado: { to, type, text, datosAdicionales },
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          status_code: 500,
          respuesta_api: null,
          payload_enviado: { to, type, text, datosAdicionales },
        };
      }
    }

    const gupshupResult = await this.sendWhatsAppViaGupshup(to, text, type);
    if (gupshupResult) {
      return gupshupResult;
    }

    console.log(`[mock-whatsapp] ${type} -> ${to}: ${text}`);
    return {
      success: true,
      status_code: 200,
      respuesta_api: { mocked: true },
      payload_enviado: { to, type, text, datosAdicionales },
    };
  }

  async sendWhatsAppViaGupshup(numeroDestino, mensaje, tipoMensaje = "text") {
    const apiKey = String(
      process.env.GUPSHUP_API_KEY ||
        process.env.GUPSHUP_API_KEY_FINAL ||
        "",
    )
      .trim()
      .replace(/^Bearer\s+/i, "");
    const source = String(process.env.GUPSHUP_SOURCE || "").trim();
    const appName = String(process.env.GUPSHUP_APP_NAME || "app").trim();
    if (!apiKey || !source) return null;

    const destination = String(numeroDestino || "").replace(/\D/g, "");
    if (!destination) {
      return { success: false, error: "Número de destino inválido" };
    }

    const type = String(tipoMensaje || "text").trim().toLowerCase();
    const text = String(mensaje || "").trim();
    const messagePayload =
      type === "text"
        ? JSON.stringify({ type: "text", text })
        : JSON.stringify({ type, text });

    const body = new URLSearchParams({
      channel: "whatsapp",
      source,
      destination,
      "src.name": appName,
      message: messagePayload,
    });

    try {
      const response = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
        method: "POST",
        headers: {
          apikey: apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
      const data = await response.json().catch(() => ({}));

      return {
        success: response.ok,
        status_code: response.status,
        respuesta_api: data,
        payload_enviado: { destination, type, text },
        provider: "gupshup",
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status_code: 500,
        respuesta_api: null,
        provider: "gupshup",
      };
    }
  }

  buildIncomingMessagePayload(room, data) {
    const tipo = String(data.message_type || data.tipo || "text")
      .trim()
      .toLowerCase();
    const text = String(data.text || data.caption || "").trim();
    return {
      id: data.id || data.msgId || `in_${Date.now()}`,
      conversacion_id: room.convId,
      convId: room.convId,
      emisor: "cliente",
      mensaje: text,
      text,
      tipo,
      archivo_url: data.archivo_url || data.mediaUrl || data.url || null,
      filename: data.filename || null,
      timestamp: Date.now(),
      origen: "whatsapp",
    };
  }

  async handleIncomingMessage(data) {
    const from = String(data.from || "").trim();
    if (!from) {
      return {
        status: 400,
        body: { success: false, error: "from es requerido" },
      };
    }

    if (data.cola !== undefined || data.pausa !== undefined) {
      this.saveSessionConfig(from, data.cola, data.pausa);
    }

    const salaId = this.clientToRoom.get(from);
    if (!salaId) {
      if (data.cola || data.type === "support_request") {
        const emitted = await this.emitSupportRequest(
          from,
          data.cola,
          data.pausa,
        );
        return {
          status: 200,
          body: {
            success: true,
            message: emitted
              ? "Solicitud enviada a agentes"
              : "No hay agentes disponibles",
          },
        };
      }

      await this.chatModel.upsertConversationForClient({
        telefono: from,
        nombre:
          data.name || data.nombre_contacto || `Cliente ${from.slice(-4)}`,
        cola: this.getSessionConfig(from).cola,
      });

      return {
        status: 200,
        body: { success: true, message: "Cliente sin agente asignado" },
      };
    }

    const room = this.activeRooms.get(salaId);
    if (!room || room.estado !== "activa") {
      return {
        status: 200,
        body: { success: true, message: "Sala no activa" },
      };
    }

    const incoming = this.buildIncomingMessagePayload(room, data);
    const incomingId =
      typeof this.chatModel.bufferMessage === "function"
        ? await this.chatModel.bufferMessage(
            room.convId,
            "cliente",
            incoming.mensaje,
            incoming.tipo,
            incoming,
          )
        : await this.chatModel.insertMessage(
            room.convId,
            "cliente",
            incoming.mensaje,
            incoming.tipo,
            incoming,
          );
    incoming.id = incomingId;
    incoming.tempId = incomingId;
    room.mensajes.push(incoming);

    const agentSocket = this.io.sockets.sockets.get(room.socketAgente);
    if (agentSocket) {
      agentSocket.emit("mensaje_cliente", {
        salaId: room.id,
        cliente: from,
        mensaje: incoming.mensaje,
        tipo: incoming.tipo,
        archivo_url: incoming.archivo_url,
        mediaUrl: incoming.archivo_url,
        filename: incoming.filename,
        caption: data.caption || null,
        timestamp: new Date(incoming.timestamp),
        idMensaje: incoming.id,
        id: incoming.id,
      });
      agentSocket.emit("chat_message", { convId: room.convId, msg: incoming });
    }

    return {
      status: 200,
      body: { success: true, message: "Mensaje entregado al agente" },
    };
  }

  async handleExitRequest(data) {
    const from = String(data.from || "").trim();
    const salaId = this.clientToRoom.get(from);
    if (!salaId) {
      return { status: 200, body: { success: true } };
    }

    const room = this.activeRooms.get(salaId);
    if (!room) {
      this.clientToRoom.delete(from);
      return { status: 200, body: { success: true } };
    }

    const systemText =
      "El cliente solicitó finalizar la conversación. Por favor ciérrala desde el panel.";
    const systemMessage = {
      id: `sys_${Date.now()}`,
      conversacion_id: room.convId,
      convId: room.convId,
      emisor: "sistema",
      mensaje: systemText,
      text: systemText,
      tipo: "sistema",
      origen: "interno",
      archivo_url: null,
      timestamp: Date.now(),
      salaId,
      cliente: from,
    };

    await this.chatModel.insertMessage(
      room.convId,
      "sistema",
      systemText,
      "sistema",
      systemMessage,
    );
    room.mensajes.push(systemMessage);

    const agentSocket = this.io.sockets.sockets.get(room.socketAgente);
    if (agentSocket) {
      agentSocket.emit("chat_message", {
        convId: room.convId,
        msg: systemMessage,
      });
      agentSocket.emit("solicitud_cierre_cliente", {
        salaId,
        cliente: from,
        convId: room.convId,
        motivo: data.reason || "user_confirmed_exit_request",
      });
    }

    return { status: 200, body: { success: true } };
  }

  async handleChatEnded(data) {
    const from = String(data.from || "").trim();
    const salaId = this.clientToRoom.get(from);
    if (!salaId) {
      return { status: 200, body: { success: true } };
    }

    const room = this.activeRooms.get(salaId);
    if (!room) {
      this.clientToRoom.delete(from);
      return { status: 200, body: { success: true } };
    }

    const agentSocket = this.io.sockets.sockets.get(room.socketAgente);
    const agentMessage = String(
      data.agentMessage || "El cliente confirmó salida desde el chatbot.",
    ).trim();
    const systemMessage = {
      id: `sys_${Date.now()}`,
      conversacion_id: room.convId,
      convId: room.convId,
      emisor: "sistema",
      mensaje: agentMessage,
      text: agentMessage,
      tipo: "sistema",
      origen: "interno",
      archivo_url: null,
      timestamp: Date.now(),
      salaId,
      cliente: from,
    };

    await this.chatModel.insertMessage(
      room.convId,
      "sistema",
      agentMessage,
      "sistema",
      systemMessage,
    );
    room.mensajes.push(systemMessage);

    if (agentSocket) {
      agentSocket.emit("chat_message", {
        convId: room.convId,
        msg: systemMessage,
      });
    }

    await this.closeRoom(room, {
      motivo: data.reason || "agent_closed",
      notifyAgentSocket: agentSocket,
      notifyClient: false,
    });

    return { status: 200, body: { success: true } };
  }

  async handleWebhook(data) {
    const payload = data || {};
    if (payload.type === "support_request") {
      const emitted = await this.emitSupportRequest(
        payload.from,
        payload.cola,
        payload.pausa,
      );
      return {
        status: 200,
        body: {
          success: true,
          message: emitted
            ? "Solicitud enviada a agentes"
            : "No hay agentes disponibles",
        },
      };
    }

    if (payload.type === "incoming_message" || payload.from) {
      return this.handleIncomingMessage(payload);
    }

    if (payload.type === "exit_request") {
      return this.handleExitRequest(payload);
    }

    if (payload.type === "chat_ended") {
      return this.handleChatEnded(payload);
    }

    return { status: 200, body: { success: true, ignored: true } };
  }

  async openInternalChat(socket, { targetAgentId }) {
    const fromAgentId = this.normalizeInternalAgentId(
      socket.data.agenteInternoId,
    );
    const toAgentId = this.normalizeInternalAgentId(targetAgentId);
    if (!fromAgentId || !toAgentId || fromAgentId === toAgentId) {
      return { ok: false, error: "Agente origen/destino inválido" };
    }

    const salaInternaId = this.getInternalRoomId(fromAgentId, toAgentId);
    const conversation = await this.chatModel.obtenerOCrearConversacionInterna(
      fromAgentId,
      toAgentId,
    );
    const mensajes = await this.chatModel.listarMensajesInternosPorConversacion(
      conversation.id,
      200,
      fromAgentId,
    );

    socket.join(salaInternaId);
    const socketsDestino = this.socketsByInternalAgent.get(toAgentId);
    if (socketsDestino) {
      socketsDestino.forEach((socketId) => {
        const targetSocket = this.io.sockets.sockets.get(socketId);
        if (targetSocket) {
          targetSocket.join(salaInternaId);
        }
      });
    }

    return {
      ok: true,
      salaInternaId,
      conversacionId: conversation.id,
      mensajes,
    };
  }

  async getInternalHistory(socket, { targetAgentId, limit = 50 }) {
    const fromAgentId = this.normalizeInternalAgentId(
      socket.data.agenteInternoId,
    );
    const toAgentId = this.normalizeInternalAgentId(targetAgentId);
    if (!fromAgentId || !toAgentId) {
      return { ok: false, mensajes: [] };
    }

    const salaInternaId = this.getInternalRoomId(fromAgentId, toAgentId);
    const conversation = await this.chatModel.obtenerOCrearConversacionInterna(
      fromAgentId,
      toAgentId,
    );
    const mensajes = await this.chatModel.listarMensajesInternosPorConversacion(
      conversation.id,
      limit,
      fromAgentId,
    );

    return {
      ok: true,
      salaInternaId,
      conversacionId: conversation.id,
      mensajes,
    };
  }

  async sendInternalMessage(socket, payload = {}) {
    const fromAgentId = this.normalizeInternalAgentId(
      socket.data.agenteInternoId || payload.fromAgentId,
    );
    const toAgentId = this.normalizeInternalAgentId(payload.toAgentId);
    const text = String(payload.text || "").trim();
    const tipo = String(payload.tipo || "texto")
      .trim()
      .toLowerCase();
    const archivoUrl = String(payload.archivo_url || "").trim() || null;

    if (
      !fromAgentId ||
      !toAgentId ||
      (!text && !archivoUrl) ||
      fromAgentId === toAgentId
    ) {
      return { ok: false, error: "Datos inválidos para chat interno" };
    }

    const salaInternaId = this.getInternalRoomId(fromAgentId, toAgentId);
    const conversation = await this.chatModel.obtenerOCrearConversacionInterna(
      fromAgentId,
      toAgentId,
    );
    const messageId = await this.chatModel.guardarMensajeInternoEnBaseDatos({
      conversacionId: conversation.id,
      emisorExten: fromAgentId,
      receptorExten: toAgentId,
      mensaje: text || "Archivo interno",
      tipo,
      archivoUrl,
      direction: null,
    });

    const messageBase = {
      id: messageId,
      conversacionId: conversation.id,
      salaInternaId,
      fromAgentId,
      toAgentId,
      text,
      timestamp: Date.now(),
      tipo,
      archivo_url: archivoUrl,
    };

    socket.join(salaInternaId);

    const emitInternalToAgent = (agentId, direction) => {
      const sockets = this.socketsByInternalAgent.get(
        this.normalizeInternalAgentId(agentId),
      );
      if (!sockets) return;
      sockets.forEach((socketId) => {
        const targetSocket = this.io.sockets.sockets.get(socketId);
        if (!targetSocket) return;
        targetSocket.join(salaInternaId);
        targetSocket.emit("internal_chat_message", {
          ...messageBase,
          direction,
        });
      });
    };

    emitInternalToAgent(toAgentId, "in");
    emitInternalToAgent(fromAgentId, "out");

    return {
      ok: true,
      mensaje: {
        ...messageBase,
        direction: "out",
      },
    };
  }

  async emitCatalogs(socket) {
    socket.emit("etiquetas", await this.chatModel.getEtiquetas());
    socket.emit("motivosCierre", await this.chatModel.getMotivosCierre());
    socket.emit("tipificaciones", await this.chatModel.getTipificaciones());
  }

  findRoomByConvId(convId) {
    const target = String(convId || "").trim();
    if (!target) return null;
    for (const room of this.activeRooms.values()) {
      if (String(room.convId || "") === target) return room;
    }
    return null;
  }

  buildTransferMeta({
    conv = {},
    motivo = "",
    desdeNombre = "",
    haciaNombre = "",
    desdeExten = "",
    haciaExten = "",
  } = {}) {
    const contactoNombre = String(
      conv.nombre || conv.nombreContacto || conv.name || "",
    ).trim();
    const telefono = String(conv.telefono || conv.tels || "").trim();
    const motivoTexto = String(motivo || "").trim() || "Sin comentario";

    return {
      motivo: motivoTexto,
      contactoNombre: contactoNombre || telefono || "Conversación",
      telefono,
      desdeNombre: String(desdeNombre || "").trim(),
      haciaNombre: String(haciaNombre || "").trim(),
      desdeExten: String(desdeExten || "").trim(),
      haciaExten: String(haciaExten || "").trim(),
    };
  }

  emitTransferNotifications({
    origenSocket,
    destinoSocket,
    convId,
    conv = {},
    origen,
    destino,
    transferMeta = {},
    salaId = null,
    mensajes = [],
  }) {
    const meta = this.buildTransferMeta(transferMeta);
    const contacto = meta.contactoNombre;

    if (origenSocket) {
      origenSocket.emit("conversacion_transferida", {
        convId,
        salaId,
        hacia: destino,
        haciaNombre: meta.haciaNombre,
        haciaExten: meta.haciaExten,
        telefono: meta.telefono,
        contactoNombre: contacto,
        motivo: meta.motivo,
        mensaje: `Conversación transferida a ${meta.haciaNombre || destino}.`,
      });
    }

    if (destinoSocket) {
      destinoSocket.emit("chat_assigned", {
        id: convId,
        convId,
        telefono: meta.telefono || conv.telefono || conv.tels || "",
        nombre: contacto,
        estado: "abierta",
        salaId,
        agente_id: destino,
        agenteId: destino,
        transferida: true,
        transferOrigenId: origen,
        agente_origen_exten: meta.desdeExten || null,
        metadata: {
          ...(conv.metadata || {}),
          transferencias: Array.isArray(conv.metadata?.transferencias)
            ? conv.metadata.transferencias
            : [],
        },
      });
      destinoSocket.emit("conversacion_recibida", {
        convId,
        salaId,
        desde: origen,
        desdeNombre: meta.desdeNombre,
        desdeExten: meta.desdeExten,
        telefono: meta.telefono,
        contactoNombre: contacto,
        motivo: meta.motivo,
        mensajes: Array.isArray(mensajes) ? mensajes : [],
        mensaje: `Recibes una conversación de ${meta.desdeNombre || origen}.`,
      });
    }
  }

  async notifyConversationTransfer({
    convId,
    conv = {},
    agenteOrigen,
    agenteDestino,
    motivo = "",
    desdeNombre = "",
    haciaNombre = "",
    desdeExten = "",
    haciaExten = "",
  }) {
    const transferMeta = {
      motivo,
      desdeNombre,
      haciaNombre,
      desdeExten,
      haciaExten,
    };

    const room = this.findRoomByConvId(convId);
    if (room) {
      return this.transferActiveRoom({
        convId,
        agenteOrigen,
        agenteDestino,
        ...transferMeta,
      });
    }

    const origen = this.normalizeAgentKey(agenteOrigen);
    const destino = this.normalizeAgentKey(agenteDestino);
    if (!destino) {
      return { ok: false, error: "Agente destino inválido" };
    }

    this.emitTransferNotifications({
      origenSocket: this.getSocketByAgent(origen),
      destinoSocket: this.getSocketByAgent(destino),
      convId,
      conv,
      origen,
      destino,
      transferMeta,
      mensajes: [],
    });

    return { ok: true, notified: true };
  }

  async transferActiveRoom({
    convId,
    agenteOrigen,
    agenteDestino,
    motivo = "",
    desdeNombre = "",
    haciaNombre = "",
    desdeExten = "",
    haciaExten = "",
  }) {
    const room = this.findRoomByConvId(convId);
    if (!room) {
      return { ok: false, error: "Sala activa no encontrada" };
    }

    const origen = this.normalizeAgentKey(agenteOrigen || room.agente);
    const destino = this.normalizeAgentKey(agenteDestino);
    if (!destino) {
      return { ok: false, error: "Agente destino inválido" };
    }

    const origenRooms = this.agentRooms.get(origen);
    if (origenRooms) origenRooms.delete(room.id);

    room.agente = destino;
    room.agenteId = destino;

    if (!this.agentRooms.has(destino)) {
      this.agentRooms.set(destino, new Set());
    }
    this.agentRooms.get(destino).add(room.id);

    const origenSocket = this.getSocketByAgent(origen);
    const destinoSocket = this.getSocketByAgent(destino);

    if (origenSocket) {
      origenSocket.leave(room.id);
    }

    if (destinoSocket) {
      destinoSocket.join(room.id);
      room.socketAgente = destinoSocket.id;
    }

    this.emitTransferNotifications({
      origenSocket,
      destinoSocket,
      convId: room.convId,
      conv: {
        telefono: room.cliente,
        nombre: room.nombre || room.cliente,
      },
      origen,
      destino,
      transferMeta: {
        motivo,
        desdeNombre,
        haciaNombre,
        desdeExten,
        haciaExten,
      },
      salaId: room.id,
      mensajes: room.mensajes,
    });

    const systemText = `Conversación transferida de ${origen} a ${destino}.`;
    const systemMessage = {
      id: `sys_transfer_${Date.now()}`,
      conversacion_id: room.convId,
      convId: room.convId,
      emisor: "sistema",
      mensaje: systemText,
      text: systemText,
      tipo: "sistema",
      origen: "interno",
      timestamp: Date.now(),
    };

    await this.chatModel.insertMessage(
      room.convId,
      "sistema",
      systemText,
      "sistema",
      systemMessage,
    );
    room.mensajes.push(systemMessage);

    if (destinoSocket) {
      destinoSocket.emit("chat_message", {
        convId: room.convId,
        msg: systemMessage,
      });
    }

    return { ok: true };
  }

  async sendSupervisorMessage({
    convId,
    mensaje,
    supervisorId,
    agenteId,
    cliente,
  }) {
    const text = String(mensaje || "").trim();
    if (!text) {
      return { ok: false, error: "Mensaje vacío" };
    }

    const room = this.findRoomByConvId(convId);
    const agenteKey = String(
      agenteId || room?.agente || room?.agenteId || "",
    ).trim();
    const messageId = await this.chatModel.insertMessage(
      convId,
      "agente",
      text,
      "texto",
      { origen: "supervisor", emisor_exten: agenteKey || supervisorId },
    );

    const outgoing = {
      id: messageId,
      conversacion_id: convId,
      convId,
      emisor: "agente",
      mensaje: text,
      text,
      tipo: "texto",
      timestamp: Date.now(),
      origen: "supervisor",
    };

    if (room) {
      room.mensajes.push(outgoing);
      const agentSocket = this.io.sockets.sockets.get(room.socketAgente);
      if (agentSocket) {
        agentSocket.emit("chat_message", { convId, msg: outgoing });
        agentSocket.emit("mensaje_supervisor", {
          convId,
          salaId: room.id,
          mensaje: text,
          supervisorId,
        });
      }
    }

    const phone = String(cliente || room?.cliente || "").trim();
    if (phone) {
      await this.sendWhatsAppMessage(phone, text, "text");
    }

    return { ok: true, messageId, message: outgoing };
  }
}

module.exports = ChatRuntimeService;
