class InMemoryChatModel {
  constructor(options = {}) {
    this.MAX_ACTIVE = options.maxActive || 3;
    this.nextConversationId = 5;
    this.nextInternalConversationId = 1;
    this.contacts = new Map();
    this.internalConversationsByKey = new Map();
    this.internalConversationsById = new Map();

    this.conversations = [
      {
        id: 1,
        estado: "abierta",
        agente_id: "1001",
        telefono: "573001112233",
        nombre: "Juan Perez",
        cola: "soporte",
        sala_id: "573001112233-1001-1",
      },
      {
        id: 2,
        estado: "nuevo",
        agente_id: null,
        telefono: "573009998877",
        nombre: "Ana Torres",
        cola: "soporte",
        sala_id: null,
      },
      {
        id: 3,
        estado: "cerrada",
        agente_id: "1001",
        telefono: "573004445566",
        nombre: "Maria Gomez",
        cola: "soporte",
        sala_id: "573004445566-1001-3",
      },
      {
        id: 4,
        estado: "nuevo",
        agente_id: null,
        telefono: "573003336666",
        nombre: "Cliente Web",
        cola: "ventas",
        sala_id: null,
      },
    ];

    this.messages = new Map([
      [
        1,
        [
          {
            id: "m1",
            conversacion_id: 1,
            emisor: "contacto",
            mensaje: "Hola",
            text: "Hola",
            tipo: "texto",
            timestamp: Date.now() - 60000,
          },
          {
            id: "m2",
            conversacion_id: 1,
            emisor: "agente",
            mensaje: "Hola, te ayudo",
            text: "Hola, te ayudo",
            tipo: "texto",
            timestamp: Date.now() - 30000,
          },
        ],
      ],
      [
        2,
        [
          {
            id: "m3",
            conversacion_id: 2,
            emisor: "contacto",
            mensaje: "Necesito soporte",
            text: "Necesito soporte",
            tipo: "texto",
            timestamp: Date.now() - 10000,
          },
        ],
      ],
      [
        3,
        [
          {
            id: "m4",
            conversacion_id: 3,
            emisor: "sistema",
            mensaje: "Conversación finalizada",
            text: "Conversación finalizada",
            tipo: "sistema",
            timestamp: Date.now() - 5000,
          },
        ],
      ],
      [4, []],
    ]);

    this.agents = [
      {
        id: "1001",
        interface: "1001",
        exten: "1001",
        nombre: "Laura",
        estado: "online",
        colas: ["soporte", "general"],
      },
      {
        id: "1002",
        interface: "1002",
        exten: "1002",
        nombre: "Carlos",
        estado: "online",
        colas: ["soporte"],
      },
      {
        id: "1003",
        interface: "1003",
        exten: "1003",
        nombre: "Daniela",
        estado: "online",
        colas: ["ventas", "general"],
      },
    ];
  }

  normalizeAgentKey(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim().toLowerCase();
  }

  normalizeQueueName(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim().toLowerCase();
  }

  makeCopy(record) {
    return record ? { ...record } : null;
  }

  async getConversaciones(userId, estado) {
    const uid = this.normalizeAgentKey(userId);

    return this.conversations
      .filter((conversation) => conversation.estado === estado)
      .filter((conversation) => {
        if (estado !== "abierta" && estado !== "cerrada") {
          return true;
        }

        return this.normalizeAgentKey(conversation.agente_id) === uid;
      })
      .map((conversation) => this.makeCopy(conversation));
  }

  async getPendientes() {
    return this.conversations
      .filter((conversation) => conversation.estado === "nuevo")
      .map((conversation) => this.makeCopy(conversation));
  }

  async getMensajes(convId) {
    return [...(this.messages.get(Number(convId)) || [])].map((message) => ({
      ...message,
    }));
  }

  async countActiveConversations(uid) {
    const userId = this.normalizeAgentKey(uid);
    return this.conversations.filter(
      (conversation) =>
        conversation.estado === "abierta" &&
        this.normalizeAgentKey(conversation.agente_id) === userId,
    ).length;
  }

  async getNextPendingConversation(uid) {
    const count = await this.countActiveConversations(uid);
    if (count >= this.MAX_ACTIVE) {
      return null;
    }

    const next = this.conversations.find(
      (conversation) => conversation.estado === "nuevo",
    );
    return next ? next.id : null;
  }

  async updateConversationState(
    convId,
    estado,
    uid,
    enforceLimit = true,
    salaId = null,
  ) {
    const id = Number(convId);
    const index = this.conversations.findIndex(
      (conversation) => conversation.id === id,
    );
    if (index === -1) return null;

    const current = this.conversations[index];
    const normalizedUid = this.normalizeAgentKey(uid || current.agente_id);

    if (estado === "abierta" && enforceLimit && current.estado !== "abierta") {
      const active = await this.countActiveConversations(normalizedUid);
      if (active >= this.MAX_ACTIVE) {
        const error = new Error("ACTIVE_LIMIT_REACHED");
        throw error;
      }
    }

    this.conversations[index] = {
      ...current,
      estado,
      agente_id: estado === "abierta" ? normalizedUid : current.agente_id,
      sala_id: salaId || current.sala_id || null,
    };

    return this.makeCopy(this.conversations[index]);
  }

  async getConversacionById(convId) {
    return this.makeCopy(
      this.conversations.find(
        (conversation) => conversation.id === Number(convId),
      ) || null,
    );
  }

  async getConversationByPhone(phone) {
    const telefono = String(phone || "").trim();
    const matches = this.conversations
      .filter((conversation) => conversation.telefono === telefono)
      .sort((left, right) => right.id - left.id);

    return this.makeCopy(matches[0] || null);
  }

  async getOpenConversationByPhone(phone) {
    const telefono = String(phone || "").trim();
    const matches = this.conversations
      .filter(
        (conversation) =>
          conversation.telefono === telefono &&
          ["abierta", "nuevo"].includes(conversation.estado),
      )
      .sort((left, right) => right.id - left.id);

    return this.makeCopy(matches[0] || null);
  }

  async upsertConversationForClient({
    telefono,
    nombre = "Desconocido",
    cola = null,
    agenteId = null,
    salaId = null,
    estado = null,
  }) {
    const phone = String(telefono || "").trim();
    const normalizedAgent = agenteId ? this.normalizeAgentKey(agenteId) : null;
    const targetState = estado || (normalizedAgent ? "abierta" : "nuevo");
    const existing = await this.getOpenConversationByPhone(phone);

    if (existing) {
      const index = this.conversations.findIndex(
        (conversation) => conversation.id === existing.id,
      );
      this.conversations[index] = {
        ...this.conversations[index],
        nombre: nombre || this.conversations[index].nombre,
        cola:
          this.normalizeQueueName(cola || this.conversations[index].cola) ||
          null,
        sala_id: salaId || this.conversations[index].sala_id || null,
      };

      if (normalizedAgent || targetState !== this.conversations[index].estado) {
        await this.updateConversationState(
          existing.id,
          targetState,
          normalizedAgent || this.conversations[index].agente_id,
          Boolean(normalizedAgent),
          salaId,
        );
      }

      return this.getConversacionById(existing.id);
    }

    const record = {
      id: this.nextConversationId++,
      estado: targetState,
      agente_id: normalizedAgent,
      telefono: phone,
      nombre: nombre || "Desconocido",
      cola: this.normalizeQueueName(cola) || null,
      sala_id: salaId || null,
    };

    this.conversations.push(record);
    this.messages.set(record.id, []);
    return this.makeCopy(record);
  }

  async attachRoomToConversation(convId, salaId) {
    const index = this.conversations.findIndex(
      (conversation) => conversation.id === Number(convId),
    );
    if (index === -1) return null;

    this.conversations[index] = {
      ...this.conversations[index],
      sala_id: salaId,
    };

    return this.makeCopy(this.conversations[index]);
  }

  async closeConversation(convId) {
    const index = this.conversations.findIndex(
      (conversation) => conversation.id === Number(convId),
    );
    if (index === -1) return null;

    this.conversations[index] = {
      ...this.conversations[index],
      estado: "cerrada",
    };

    return this.makeCopy(this.conversations[index]);
  }

  async closeConversationByPhone(phone) {
    const openConversation = await this.getOpenConversationByPhone(phone);
    if (!openConversation) return null;
    return this.closeConversation(openConversation.id);
  }

  async insertMessage(convId, emisor, mensaje, tipo = "texto", extra = {}) {
    const id =
      extra.id || `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      id,
      conversacion_id: Number(convId),
      emisor,
      mensaje,
      text: mensaje,
      tipo,
      timestamp: extra.timestamp || Date.now(),
      ...extra,
    };

    const list = this.messages.get(Number(convId)) || [];
    list.push(record);
    this.messages.set(Number(convId), list);
    return id;
  }

  async insertContacto(nombre, telefono) {
    const phone = String(telefono || "").trim();
    const contact = {
      id: `c_${phone}`,
      nombre: nombre || "Desconocido",
      telefono: phone,
    };

    this.contacts.set(phone, contact);
    return { ...contact };
  }

  async insertEntrantesId(nombre, telefono) {
    const contact = await this.insertContacto(nombre, telefono);
    const conversation = await this.upsertConversationForClient({
      telefono,
      nombre: contact.nombre,
    });
    return conversation.id;
  }

  async getQueueAgents(queueName, _pause = null, occupied = []) {
    const targetQueue = this.normalizeQueueName(queueName);
    const occupiedSet = new Set(
      (occupied || []).map((value) => this.normalizeAgentKey(value)),
    );

    return this.agents
      .filter((agent) => agent.estado === "online")
      .filter((agent) => !targetQueue || agent.colas.includes(targetQueue))
      .filter((agent) => !occupiedSet.has(this.normalizeAgentKey(agent.exten)))
      .map((agent) => ({
        interface: agent.interface,
        exten: agent.exten,
        nombre: agent.nombre,
        estado: agent.estado,
        colas: [...agent.colas],
      }));
  }

  async getAgentByExten(exten) {
    const key = this.normalizeAgentKey(exten);
    return (
      this.agents.find(
        (agent) => this.normalizeAgentKey(agent.exten) === key,
      ) || null
    );
  }

  async getAgentDisplayName(exten) {
    const agent = await this.getAgentByExten(exten);
    return agent?.nombre || String(exten || "Agente");
  }

  async getEtiquetasForConv() {
    return [];
  }

  async getMotivosCierre() {
    return [
      { id: "resuelto", nombre: "Resuelto" },
      { id: "abandono", nombre: "Abandono del cliente" },
      { id: "seguimiento", nombre: "Seguimiento pendiente" },
    ];
  }

  async getTipificaciones() {
    return [
      { id: "consulta", nombre: "Consulta general" },
      { id: "incidente", nombre: "Incidente" },
      { id: "venta", nombre: "Venta" },
    ];
  }

  getInternalConversationKey(agentA, agentB) {
    const [left, right] = [
      this.normalizeAgentKey(agentA),
      this.normalizeAgentKey(agentB),
    ].sort();
    return `internal-room-${left}-${right}`;
  }

  async obtenerOCrearConversacionInterna(agentA, agentB) {
    const key = this.getInternalConversationKey(agentA, agentB);
    if (this.internalConversationsByKey.has(key)) {
      return { ...this.internalConversationsByKey.get(key) };
    }

    const record = {
      id: this.nextInternalConversationId++,
      key,
      participantes: key.replace("internal-room-", "").split("-"),
      mensajes: [],
    };

    this.internalConversationsByKey.set(key, record);
    this.internalConversationsById.set(record.id, record);
    return { ...record };
  }

  async listarMensajesInternosPorConversacion(conversacionId, limit = 50) {
    const record = this.internalConversationsById.get(Number(conversacionId));
    if (!record) return [];
    return record.mensajes
      .slice(-Number(limit) || 50)
      .map((message) => ({ ...message }));
  }

  async guardarMensajeInternoEnBaseDatos({
    conversacionId,
    emisorExten,
    receptorExten,
    mensaje,
    tipo = "texto",
    archivoUrl = null,
    direction = null,
  }) {
    const record = this.internalConversationsById.get(Number(conversacionId));
    if (!record) {
      throw new Error("INTERNAL_CONVERSATION_NOT_FOUND");
    }

    const id = `im_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    record.mensajes.push({
      id,
      conversacionId: Number(conversacionId),
      fromAgentId: this.normalizeAgentKey(emisorExten),
      toAgentId: this.normalizeAgentKey(receptorExten),
      text: mensaje,
      mensaje,
      tipo,
      archivo_url: archivoUrl,
      direction,
      timestamp: Date.now(),
    });

    return id;
  }
}

module.exports = InMemoryChatModel;
