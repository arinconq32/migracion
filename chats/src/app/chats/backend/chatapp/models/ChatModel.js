const { v4: uuidv4 } = require("uuid");
const redis = require("redis");

let redisClient = null;
let redisReadyPromise = null;
let redisDisabled = false;

function shouldUseRedis() {
  return (
    String(process.env.REDIS_ENABLED || "true")
      .trim()
      .toLowerCase() !== "false"
  );
}

function getRedisUrl() {
  return process.env.REDIS_URL || null;
}

async function ensureRedisClient() {
  if (redisDisabled || !shouldUseRedis()) {
    redisDisabled = true;
    return null;
  }

  if (redisClient?.isOpen) {
    return redisClient;
  }

  if (!redisClient) {
    const url = getRedisUrl();
    redisClient = url ? redis.createClient({ url }) : redis.createClient();
    redisClient.on("error", (error) => {
      console.error("Redis Client Error", error.message);
    });
  }

  if (!redisReadyPromise) {
    redisReadyPromise = redisClient
      .connect()
      .then(() => {
        console.log("Redis conectado");
        return redisClient;
      })
      .catch((error) => {
        console.error(
          "No se pudo conectar a Redis, se continúa sin caché:",
          error.message,
        );
        redisDisabled = true;
        redisReadyPromise = null;
        try {
          redisClient.quit();
        } catch (_error) {
          // noop
        }
        redisClient = null;
        return null;
      });
  }

  return redisReadyPromise;
}

const CACHE_TTL = {
  CONVERSACIONES: 30,
  MENSAJES: 300,
  CONTADORES: 30,
  ETIQUETAS: 300,
  FILTROS: 300,
};

async function getCache(key) {
  try {
    const client = await ensureRedisClient();
    if (!client) {
      return null;
    }

    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Error en getCache:", error.message);
    return null;
  }
}

async function setCache(key, value, ttl = 30) {
  try {
    const client = await ensureRedisClient();
    if (!client) {
      return false;
    }

    await client.set(key, JSON.stringify(value), { EX: ttl });
    return true;
  } catch (error) {
    console.error("Error en setCache:", error.message);
    return false;
  }
}

async function deleteCacheKeys(keys) {
  try {
    const client = await ensureRedisClient();
    if (!client || !Array.isArray(keys) || keys.length === 0) {
      return;
    }

    await client.del(keys.filter(Boolean));
  } catch (error) {
    console.error("Error invalidando cachés:", error.message);
  }
}

async function invalidateRelatedCaches(convId, agentId = null) {
  const keysToDelete = [];

  if (convId !== null && convId !== undefined) {
    keysToDelete.push(`mensajes:${convId}`);
  }

  if (agentId) {
    keysToDelete.push(
      `conversaciones:${agentId}:nuevo`,
      `conversaciones:${agentId}:abierta`,
      `conversaciones:${agentId}:cerrada`,
      `activeConversations:${agentId}`,
    );
  }

  keysToDelete.push(
    "conversaciones:pendientes",
    "etiquetas:all",
    "filtros:all",
  );
  await deleteCacheKeys(keysToDelete);
}

class ChatModel {
  constructor(dbPool) {
    this.pool = dbPool.pool;
    this.poolTipificaciones = dbPool.poolTipificaciones || dbPool.pool;
    this.poolUsuariosB = dbPool.poolUsuariosB || dbPool.pool;
    this.poolColas = dbPool.poolColas || dbPool.pool;
    this.MAX_ACTIVE_CONVERSATIONS = Number(
      process.env.MAX_ACTIVE_CONVERSATIONS || 3,
    );
    this._allowedSchemaTables = new Set([
      "conversaciones_agente",
      "mensajes_internos",
    ]);
  }

  _isEmptyTagValue(value) {
    const v = String(value ?? "")
      .trim()
      .toLowerCase();
    return !v || v === "null" || v === "undefined";
  }

  _applyInheritedLabel(conv, previous) {
    if (!conv || !previous) return;
    if (!this._isEmptyTagValue(conv.etiqueta)) return;

    const srcEtiqueta = !this._isEmptyTagValue(previous.etiqueta)
      ? previous.etiqueta
      : !this._isEmptyTagValue(previous.etiqueta_2)
        ? previous.etiqueta_2
        : null;
    const srcColor = previous.color || null;

    if (srcEtiqueta) {
      conv.etiqueta = srcEtiqueta;
      if (!conv.color && srcColor) conv.color = srcColor;
    }
  }

  _syncDisplayEtiqueta(conv) {
    if (
      !conv ||
      !this._isEmptyTagValue(conv.etiqueta) ||
      this._isEmptyTagValue(conv.etiqueta_2)
    ) {
      return;
    }

    conv.etiqueta = conv.etiqueta_2;
  }

  _buildDisplayName(row) {
    const nombreBase = row.contacto_nombre || row.nombre || row.telefono || "";
    return String(nombreBase)
      .split("|")[0]
      .split(" ")
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  _normalizeAgent(value) {
    if (value === null || value === undefined) return "";
    let normalized = String(value).trim().toLowerCase();
    if (normalized.includes("/")) normalized = normalized.split("/").pop();
    if (normalized.includes("@")) normalized = normalized.split("@")[0];
    return normalized;
  }

  _normalizeQueue(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim().toLowerCase();
  }

  async isSoporteActivo(from, userId) {
    if (!from) return false;
    try {
      const [rows] = await this.pool.query(
        `SELECT id FROM conversaciones WHERE (contacto_id = ? OR telefono = ?) AND estado = 'abierta' AND agente_id = ? LIMIT 1`,
        [from, from, userId],
      );
      return rows.length > 0;
    } catch (error) {
      console.error("Error en isSoporteActivo:", error.message);
      return false;
    }
  }

  async asignarAgenteAConversacion(telefono, agenteId, salaId = null) {
    if (!telefono || !agenteId) {
      return { success: false, message: "telefono y agenteId son requeridos" };
    }

    try {
      let [rows] = await this.pool.query(
        `SELECT id, agente_id, estado
         FROM conversaciones
         WHERE telefono = ?
           AND estado IN ('abierta', 'pendiente', 'nuevo')
           AND (agente_id IS NULL OR agente_id = 'SISTEMA' OR agente_id = '')
         ORDER BY id DESC
         LIMIT 1`,
        [telefono],
      );

      if (rows.length === 0) {
        [rows] = await this.pool.query(
          `SELECT id, agente_id, estado
           FROM conversaciones
           WHERE telefono = ?
             AND estado IN ('abierta', 'pendiente', 'nuevo')
           ORDER BY id DESC
           LIMIT 1`,
          [telefono],
        );
      }

      if (rows.length === 0) {
        return {
          success: false,
          message: "No hay conversación pendiente para asignar",
        };
      }

      const convId = rows[0].id;
      await this.pool.execute(
        `UPDATE conversaciones SET agente_id = ?, estado = 'abierta', sala_id = ? WHERE id = ?`,
        [agenteId, salaId, convId],
      );
      await invalidateRelatedCaches(convId, agenteId);

      return { success: true, convId };
    } catch (error) {
      console.error("Error en asignarAgenteAConversacion:", error.message);
      return { success: false, message: error.message };
    }
  }

  async getConversacionActivaPorTelefono(telefono) {
    if (!telefono) return null;

    try {
      const [rows] = await this.pool.query(
        `SELECT id FROM conversaciones WHERE telefono = ? AND estado = 'abierta' ORDER BY id DESC LIMIT 1`,
        [telefono],
      );
      return rows.length > 0 ? rows[0].id : null;
    } catch (error) {
      console.error(
        "Error en getConversacionActivaPorTelefono:",
        error.message,
      );
      return null;
    }
  }

  async generateShortConversationId(db = this.pool) {
    const [rows] = await db.query(
      `SELECT COALESCE(MAX(CAST(id AS UNSIGNED)), 0) AS maxId
       FROM conversaciones
       WHERE id REGEXP '^[0-9]{1,6}$'`,
    );
    const maxId = Number(rows?.[0]?.maxId || 0);
    const nextId = maxId + 1;
    const width = Math.max(3, String(nextId).length);
    return String(nextId).padStart(width, "0");
  }

  async withAgentActiveLock(agentId, callback) {
    if (!agentId || agentId === "SISTEMA") {
      return callback(this.pool);
    }

    const conn = await this.pool.getConnection();
    const lockName = `chat_active_limit_${agentId}`;

    try {
      const [lockRows] = await conn.query("SELECT GET_LOCK(?, 10) AS lock_ok", [
        lockName,
      ]);
      if (!lockRows?.[0]?.lock_ok) {
        throw new Error(`No se pudo obtener lock para agente ${agentId}`);
      }

      return await callback(conn);
    } finally {
      try {
        await conn.query("SELECT RELEASE_LOCK(?)", [lockName]);
      } catch (error) {
        console.error(
          "Error liberando lock de conversaciones activas:",
          error.message,
        );
      }
      conn.release();
    }
  }

  async getConversacionesAgenteGeneral(asesorId) {
    const [rows] = await this.pool.execute(
      `SELECT c.*, ct.nombre AS contacto_nombre, ct.tels, ct.direccion, ct.ciudad, ct.entidad, ct.dni, ct.email
       FROM conversaciones c
       LEFT JOIN gestioncomercial.contactos ct ON ct.data = c.contacto_id
       INNER JOIN (
         SELECT telefono, MAX(id) AS max_id
         FROM conversaciones
         WHERE agente_id = ?
         GROUP BY telefono
       ) ultimas ON c.id = ultimas.max_id
       ORDER BY c.inicio DESC, c.id DESC`,
      [asesorId],
    );

    for (const conv of rows) {
      const necesitaEtiqueta = this._isEmptyTagValue(conv.etiqueta);
      const necesitaMarca = this._isEmptyTagValue(conv.marca);

      if (necesitaEtiqueta || necesitaMarca) {
        const [anteriores] = await this.pool.execute(
          `SELECT etiqueta, etiqueta_2, color, marca
           FROM conversaciones
           WHERE telefono = ? AND id < ? AND agente_id = ?
           ORDER BY id DESC LIMIT 1`,
          [conv.telefono, conv.id, asesorId],
        );
        if (anteriores.length > 0) {
          if (necesitaEtiqueta) this._applyInheritedLabel(conv, anteriores[0]);
          if (necesitaMarca && !this._isEmptyTagValue(anteriores[0].marca)) {
            conv.marca = anteriores[0].marca;
          }
        }
      }

      this._syncDisplayEtiqueta(conv);
    }

    return rows.map((row) => ({
      ...row,
      nombre_mostrar: this._buildDisplayName(row),
    }));
  }

  async getConversaciones(asesorId, estado) {
    const [rows] = await this.pool.execute(
      `SELECT c.*, ct.nombre AS contacto_nombre,
              ct.tels, ct.direccion, ct.ciudad, ct.entidad, ct.dni, ct.email,
              COALESCE(NULLIF(c.telefono, ''), c.contacto_id) AS phone_key
       FROM conversaciones c
       LEFT JOIN gestioncomercial.contactos ct ON ct.data = c.contacto_id
       INNER JOIN (
         SELECT COALESCE(NULLIF(telefono, ''), contacto_id) AS phone_key, MAX(id) AS max_id
         FROM conversaciones
         WHERE agente_id = ? AND estado = ?
         GROUP BY COALESCE(NULLIF(telefono, ''), contacto_id)
       ) ultimas ON c.id = ultimas.max_id
       WHERE c.agente_id = ? AND c.estado = ?`,
      [asesorId, estado, asesorId, estado],
    );

    for (const conv of rows) {
      const necesitaEtiqueta = this._isEmptyTagValue(conv.etiqueta);
      const necesitaMarca = this._isEmptyTagValue(conv.marca);

      if (!necesitaEtiqueta && !necesitaMarca) {
        this._syncDisplayEtiqueta(conv);
        continue;
      }

      const phoneKey = conv.phone_key || conv.telefono || conv.contacto_id;
      if (!phoneKey) {
        this._syncDisplayEtiqueta(conv);
        continue;
      }

      const [anteriores] = await this.pool.execute(
        `SELECT etiqueta, etiqueta_2, color, marca
         FROM conversaciones
         WHERE COALESCE(NULLIF(telefono, ''), contacto_id) = ?
           AND id < ?
         ORDER BY id DESC
         LIMIT 1`,
        [phoneKey, conv.id],
      );

      if (anteriores.length > 0) {
        if (necesitaEtiqueta) this._applyInheritedLabel(conv, anteriores[0]);
        if (necesitaMarca && !this._isEmptyTagValue(anteriores[0].marca)) {
          conv.marca = anteriores[0].marca;
        }
      }

      this._syncDisplayEtiqueta(conv);
    }

    return rows.map((row) => ({
      ...row,
      nombre_mostrar: this._buildDisplayName(row),
    }));
  }

  async invalidateCacheForConversation(convId, agentId = null) {
    await invalidateRelatedCaches(convId, agentId);
  }

  async getConversacionById(convId) {
    try {
      const [rows] = await this.pool.execute(
        `SELECT c.*, ct.tels, ct.nombre AS contacto_nombre
         FROM conversaciones c
         LEFT JOIN gestioncomercial.contactos ct ON ct.data = c.contacto_id
         WHERE c.id = ?`,
        [convId],
      );

      if (!rows[0]) return null;
      return { ...rows[0], nombre_mostrar: this._buildDisplayName(rows[0]) };
    } catch (error) {
      console.error("Error en getConversacionById:", error.message);
      return null;
    }
  }

  async getLatestConversationIdForReopen({
    telefono = null,
    contactoId = null,
    agenteId = null,
  }) {
    try {
      const where = [];
      const params = [];

      if (telefono) {
        where.push("telefono = ?");
        params.push(telefono);
      }

      if (contactoId) {
        where.push("contacto_id = ?");
        params.push(contactoId);
      }

      if (where.length === 0) {
        return null;
      }

      let sql = `SELECT id FROM conversaciones WHERE (${where.join(" OR ")})`;
      if (agenteId) {
        sql += " AND agente_id = ?";
        params.push(agenteId);
      }
      sql += " ORDER BY id DESC LIMIT 1";

      const [rows] = await this.pool.execute(sql, params);
      return rows?.[0]?.id || null;
    } catch (error) {
      console.error(
        "Error en getLatestConversationIdForReopen:",
        error.message,
      );
      return null;
    }
  }

  async depurarCache(agentId) {
    const estados = ["nuevo", "abierta", "cerrada"];
    const resultados = {};

    for (const estado of estados) {
      const cacheKey = `conversaciones:${agentId}:${estado}`;
      const cached = await getCache(cacheKey);
      const [rows] = await this.pool.execute(
        "SELECT id, estado FROM conversaciones WHERE agente_id = ? AND estado = ?",
        [agentId, estado],
      );

      resultados[estado] = {
        enCache: cached ? cached.length : 0,
        idsCache: cached ? cached.map((item) => item.id) : [],
        enBD: rows.length,
        idsBD: rows.map((item) => item.id),
      };
    }

    return resultados;
  }

  async getPendientes() {
    const [rows] = await this.pool.execute(
      `SELECT c.*, ct.nombre AS contacto_nombre,
              ct.tels, ct.direccion, ct.ciudad, ct.entidad, ct.dni, ct.email,
              COALESCE(NULLIF(c.telefono, ''), c.contacto_id) AS phone_key
       FROM conversaciones c
       LEFT JOIN gestioncomercial.contactos ct ON ct.data = c.contacto_id
       INNER JOIN (
         SELECT COALESCE(NULLIF(telefono, ''), contacto_id) AS phone_key, MAX(id) AS max_id
         FROM conversaciones
         WHERE estado = 'nuevo'
         GROUP BY COALESCE(NULLIF(telefono, ''), contacto_id)
       ) ultimas ON c.id = ultimas.max_id`,
    );

    for (const conv of rows) {
      const necesitaEtiqueta = this._isEmptyTagValue(conv.etiqueta);
      const necesitaMarca = this._isEmptyTagValue(conv.marca);

      if (!necesitaEtiqueta && !necesitaMarca) {
        this._syncDisplayEtiqueta(conv);
        continue;
      }

      const phoneKey = conv.phone_key || conv.telefono || conv.contacto_id;
      if (!phoneKey) {
        this._syncDisplayEtiqueta(conv);
        continue;
      }

      const [anteriores] = await this.pool.execute(
        `SELECT etiqueta, etiqueta_2, color, marca
         FROM conversaciones
         WHERE COALESCE(NULLIF(telefono, ''), contacto_id) = ?
           AND id < ?
         ORDER BY id DESC
         LIMIT 1`,
        [phoneKey, conv.id],
      );

      if (anteriores.length > 0) {
        if (necesitaEtiqueta) this._applyInheritedLabel(conv, anteriores[0]);
        if (necesitaMarca && !this._isEmptyTagValue(anteriores[0].marca)) {
          conv.marca = anteriores[0].marca;
        }
      }

      this._syncDisplayEtiqueta(conv);
    }

    return rows.map((row) => ({
      ...row,
      nombre_mostrar: this._buildDisplayName(row),
    }));
  }

  async getMensajes(conversacionId) {
    const cacheKey = `mensajes:${conversacionId}`;
    const cached = await getCache(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached.sort((a, b) => a.timestamp - b.timestamp);
    }

    const [rows] = await this.pool.execute(
      `SELECT id, conversacion_id, emisor, mensaje, tipo, archivo_url, origen,
              UNIX_TIMESTAMP(ts) * 1000 AS timestamp
       FROM mensajes
       WHERE conversacion_id = ?
       ORDER BY ts ASC`,
      [conversacionId],
    );

    const mensajes = rows.map((row) => ({
      id: row.id,
      conversacion_id: row.conversacion_id,
      emisor: row.emisor,
      mensaje: row.mensaje,
      text: row.mensaje,
      tipo: row.tipo,
      archivo_url: row.archivo_url,
      timestamp: row.timestamp,
      origen: row.origen,
    }));

    if (mensajes.length > 0) {
      await setCache(cacheKey, mensajes, CACHE_TTL.MENSAJES);
    }

    return mensajes;
  }

  async getHistorialClientePorConvId(
    convId,
    maxRegistros = 300,
    dniCliente = null,
  ) {
    try {
      const convIdNormalizado = String(convId || "").trim();
      const dniNormalizado = String(dniCliente || "").trim() || null;
      const limite =
        Number(maxRegistros) > 0 ? Math.min(Number(maxRegistros), 1000) : 300;

      if (!convIdNormalizado && !dniNormalizado) {
        return { persona: null, registros: [] };
      }

      const [baseRows] = await this.pool.execute(
        `SELECT c.id, c.contacto_id, c.agente_id, c.cola, c.origen, c.telefono, c.tipificaciones, c.observaciones, c.inicio, c.fin,
                ct.nombre AS contacto_nombre, ct.tels, ct.entidad AS contacto_entidad, ct.data AS contacto_data, ct.dni AS contacto_dni
         FROM conversaciones c
         LEFT JOIN gestioncomercial.contactos ct ON (ct.data = c.contacto_id OR ct.tels = c.telefono)
         WHERE c.id = ?
         LIMIT 1`,
        [convIdNormalizado],
      );

      let base = baseRows[0] || null;

      if (!base && dniNormalizado) {
        const [byDni] = await this.pool.execute(
          `SELECT c.id, c.contacto_id, c.agente_id, c.cola, c.origen, c.telefono, c.tipificaciones, c.observaciones, c.inicio, c.fin,
                  ct.nombre AS contacto_nombre, ct.tels, ct.entidad AS contacto_entidad, ct.data AS contacto_data, ct.dni AS contacto_dni
           FROM conversaciones c
           LEFT JOIN gestioncomercial.contactos ct ON (ct.data = c.contacto_id OR ct.tels = c.telefono)
           WHERE ct.dni = ?
           ORDER BY c.inicio DESC
           LIMIT 1`,
          [dniNormalizado],
        );
        base = byDni[0] || null;
      }

      if (!base) {
        return { persona: null, registros: [] };
      }

      const contactoId = String(base.contacto_id || "").trim() || null;
      const telefono = String(base.tels || base.telefono || "").trim() || null;
      const data =
        String(base.contacto_data || base.contacto_id || "").trim() || null;
      const dni =
        String(dniNormalizado || base.contacto_dni || "").trim() || null;

      const persona = {
        nombre: (base.contacto_nombre || "").split("|")[0].trim() || "-",
        telefono: telefono || "-",
        canal: base.origen ? String(base.origen).toUpperCase() : "-",
        entidad: base.contacto_entidad || "-",
        data: data || "-",
        dni: dni || "-",
        agente: base.agente_id || "-",
        convId: base.id,
      };

      const [convRows] = await this.pool.execute(
        `SELECT c.id, c.contacto_id, c.agente_id, c.cola, c.origen, c.telefono, c.tipificaciones, c.observaciones, c.inicio, c.fin,
                ct.nombre AS contacto_nombre, ct.tels, ct.entidad AS contacto_entidad, ct.data AS contacto_data, ct.dni AS contacto_dni
         FROM conversaciones c
         LEFT JOIN gestioncomercial.contactos ct ON (ct.data = c.contacto_id OR ct.tels = c.telefono)
         WHERE c.id = ?
            OR (? IS NOT NULL AND c.contacto_id = ?)
            OR (? IS NOT NULL AND c.telefono = ?)
            OR (? IS NOT NULL AND ct.data = ?)
            OR (? IS NOT NULL AND ct.tels = ?)
            OR (? IS NOT NULL AND ct.dni = ?)
         ORDER BY c.inicio DESC
         LIMIT 100`,
        [
          convIdNormalizado,
          contactoId,
          contactoId,
          telefono,
          telefono,
          data,
          data,
          telefono,
          telefono,
          dni,
          dni,
        ],
      );

      if (!convRows.length) {
        return { persona, registros: [] };
      }

      const convIds = [...new Set(convRows.map((row) => String(row.id)))];
      const colaPorConversacion = new Map(
        convRows.map((row) => [String(row.id), row.cola || "-"]),
      );
      const placeholders = convIds.map(() => "?").join(",");

      const [msgRows] = await this.pool.execute(
        `SELECT m.id, m.conversacion_id, UNIX_TIMESTAMP(m.ts) * 1000 AS timestamp, m.mensaje, m.tipo, m.emisor,
                c.contacto_id, c.agente_id, c.tipificaciones, c.observaciones, c.cola, c.origen, c.telefono,
                ct.tels, ct.entidad AS contacto_entidad, ct.data AS contacto_data
         FROM mensajes m
         INNER JOIN conversaciones c ON c.id = m.conversacion_id
         LEFT JOIN gestioncomercial.contactos ct ON (ct.data = c.contacto_id OR ct.tels = c.telefono)
         WHERE m.conversacion_id IN (${placeholders})
         ORDER BY m.ts DESC
         LIMIT ?`,
        [...convIds, limite],
      );

      const [comentariosRows] = await this.poolTipificaciones.execute(
        `SELECT idConv, data, UNIX_TIMESTAMP(fecha) * 1000 AS timestamp, resultado1, resultado2, entidad, usuario, telefono, tipo_contacto
         FROM comentarios_chats
         WHERE idConv IN (${placeholders})
            OR (? IS NOT NULL AND data = ?)
            OR (? IS NOT NULL AND data = ?)
            OR (? IS NOT NULL AND telefono = ?)
         ORDER BY fecha DESC
         LIMIT ?`,
        [...convIds, data, data, dni, dni, telefono, telefono, limite],
      );

      const isCall = (tipo, mensaje) => {
        const tipoLower = String(tipo || "").toLowerCase();
        const mensajeLower = String(mensaje || "").toLowerCase();
        return (
          tipoLower.includes("llamada") ||
          tipoLower.includes("call") ||
          mensajeLower.includes("llamada") ||
          mensajeLower.includes("videollamada") ||
          mensajeLower.includes("📞")
        );
      };

      const resolveHistoryType = (tipo, mensaje, tipoContacto) => {
        const values = [tipo, mensaje, tipoContacto].map((value) =>
          String(value || "").toLowerCase(),
        );
        return values.some(
          (value) =>
            value.includes("llamada") ||
            value.includes("call") ||
            value.includes("video"),
        )
          ? "Llamada"
          : "Conversación";
      };

      const registrosMensajes = msgRows
        .filter((row) => isCall(row.tipo, row.mensaje))
        .map((row) => ({
          data: row.contacto_data || row.contacto_id || persona.data || "-",
          fecha: row.timestamp || 0,
          comentario: row.mensaje || "-",
          tipificacion: row.tipificaciones || row.tipo || "-",
          entidad: row.contacto_entidad || persona.entidad || "-",
          gestiono:
            row.emisor === "agente"
              ? row.agente_id || persona.agente || "-"
              : row.emisor || "-",
          cola: row.cola || "-",
          telefono: row.tels || row.telefono || persona.telefono || "-",
          tipoContacto: row.origen || "webchat",
          tipo: resolveHistoryType(row.tipo, row.mensaje),
          conversacion: row.conversacion_id || "-",
          ordenTs: row.timestamp || 0,
        }));

      const registrosComentarios = comentariosRows.map((row) => ({
        data: row.data || persona.data || "-",
        fecha: row.timestamp || 0,
        comentario: row.resultado2 || "Sin comentario",
        tipificacion: row.resultado1 || "-",
        entidad: row.entidad || persona.entidad || "-",
        gestiono: row.usuario || persona.agente || "-",
        cola: colaPorConversacion.get(String(row.idConv || "")) || "-",
        telefono: row.telefono || persona.telefono || "-",
        tipoContacto: row.tipo_contacto || "webchat",
        tipo: resolveHistoryType(null, null, row.tipo_contacto),
        conversacion: row.idConv || "-",
        ordenTs: row.timestamp || 0,
      }));

      const convConObs = convRows
        .filter((row) => row.observaciones || row.tipificaciones)
        .map((row) => {
          const ts = row.fin
            ? new Date(row.fin).getTime()
            : new Date(row.inicio).getTime();
          return {
            data: row.contacto_data || row.contacto_id || persona.data || "-",
            fecha: Number.isFinite(ts) ? ts : 0,
            comentario: row.observaciones || "Sin comentario",
            tipificacion: row.tipificaciones || "-",
            entidad: row.contacto_entidad || persona.entidad || "-",
            gestiono: row.agente_id || persona.agente || "-",
            cola: row.cola || "-",
            telefono: row.tels || row.telefono || persona.telefono || "-",
            tipoContacto: row.origen || "webchat",
            tipo: "Conversación",
            conversacion: row.id || "-",
            ordenTs: Number.isFinite(ts) ? ts : 0,
          };
        });

      const registros = [
        ...registrosMensajes,
        ...registrosComentarios,
        ...convConObs,
      ]
        .sort((a, b) => (b.ordenTs || 0) - (a.ordenTs || 0))
        .slice(0, limite);

      return { persona, registros };
    } catch (error) {
      console.error("Error en getHistorialClientePorConvId:", error.message);
      return { persona: null, registros: [] };
    }
  }

  async persistTemporaryMessages(convId) {
    const cacheKey = `mensajes:${convId}`;
    let messages = await getCache(cacheKey);
    if (!messages || messages.length === 0) {
      return;
    }

    const uniqueMessages = [];
    const seenIds = new Set();
    for (const msg of messages) {
      if (!msg.id || seenIds.has(msg.id)) continue;
      seenIds.add(msg.id);
      uniqueMessages.push(msg);
    }

    for (const msg of uniqueMessages) {
      if (typeof msg.id !== "string") continue;

      const [existing] = await this.pool.query(
        `SELECT id FROM mensajes WHERE conversacion_id = ? AND emisor = ? AND mensaje = ? AND ts = FROM_UNIXTIME(?)`,
        [
          msg.conversacion_id,
          msg.emisor,
          msg.mensaje,
          Math.floor(msg.timestamp / 1000),
        ],
      );

      if (existing.length > 0) {
        continue;
      }

      await this.pool.query(
        `INSERT INTO mensajes (conversacion_id, emisor, mensaje, tipo, ts, archivo_url, origen)
         VALUES (?, ?, ?, ?, FROM_UNIXTIME(?), ?, ?)`,
        [
          msg.conversacion_id,
          msg.emisor,
          msg.mensaje,
          msg.tipo,
          Math.floor(msg.timestamp / 1000),
          msg.archivo_url,
          msg.origen,
        ],
      );
    }

    await deleteCacheKeys([cacheKey]);
    const mensajesOrdenados = await this.getMensajes(convId);
    await setCache(cacheKey, mensajesOrdenados, CACHE_TTL.MENSAJES);
  }

  async insertConversation(
    convId,
    contactoId,
    agenteId,
    origenDetectado,
    telefono,
    registrarBaseDatos,
    salaId = null,
    colaOrigen = null,
    etiqueta2 = null,
    marca = null,
  ) {
    if (!registrarBaseDatos) {
      const convIdForTemp =
        convId || (await this.generateShortConversationId());
      return { conversationId: convIdForTemp, nuevaConversacion: false };
    }

    return this.withAgentActiveLock(agenteId, async (db) => {
      let convIdFinal = convId;
      for (let intento = 0; intento < 10; intento += 1) {
        if (!convIdFinal) {
          convIdFinal = await this.generateShortConversationId(db);
        }

        const [existing] = await db.execute(
          "SELECT id FROM conversaciones WHERE id = ? LIMIT 1",
          [convIdFinal],
        );
        if (existing.length > 0) {
          if (convId) {
            return { conversationId: convIdFinal, nuevaConversacion: false };
          }

          const nextNum = Number(convIdFinal) + 1;
          convIdFinal = String(nextNum).padStart(
            Math.max(3, String(nextNum).length),
            "0",
          );
          continue;
        }

        let estadoInicial = "nuevo";
        const tieneAgenteReal = !!agenteId && agenteId !== "SISTEMA";
        if (tieneAgenteReal) {
          const activas = await this.countActiveConversations(agenteId, db);
          estadoInicial =
            activas < this.MAX_ACTIVE_CONVERSATIONS ? "abierta" : "nuevo";
        }

        const marcaFinal = marca || "normal";
        const etiquetaFinal = etiqueta2 || "etiqueta2";

        const [result] = await db.query(
          `INSERT INTO conversaciones (id, contacto_id, agente_id, estado, estado_conexion, marca, inicio, fin, tipificaciones, etiqueta_2, observaciones, origen, telefono, sala_id, cola)
           VALUES (?, ?, ?, ?, 'ausente', ?, NOW(), NOW(), 'tipificaciones', ?, 'observacion', ?, ?, ?, ?)`,
          [
            convIdFinal,
            contactoId,
            agenteId,
            estadoInicial,
            marcaFinal,
            etiquetaFinal,
            origenDetectado,
            telefono,
            salaId,
            colaOrigen,
          ],
        );

        await invalidateRelatedCaches(convIdFinal, agenteId);
        return {
          conversationId: result.insertId || convIdFinal,
          nuevaConversacion: true,
        };
      }

      throw new Error("No se pudo generar un ID único de conversación");
    });
  }

  async insertConversationContacto(
    convId,
    contactoId,
    agenteId,
    estado,
    origenDetectado,
    telefono,
    registrarBaseDatos,
    colaOrigen = null,
  ) {
    return this.insertConversation(
      convId,
      contactoId,
      agenteId,
      origenDetectado,
      telefono,
      registrarBaseDatos,
      null,
      colaOrigen,
    );
  }

  async insertMessage(
    convId,
    emisor,
    mensaje,
    tipo = "texto",
    archivo_url = null,
    origenDetectado = "web",
    timestamp = null,
  ) {
    const fechaEnvio = timestamp ? new Date(timestamp) : new Date();
    const [result] = await this.pool.query(
      `INSERT INTO mensajes (conversacion_id, emisor, mensaje, tipo, ts, archivo_url, origen)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        convId,
        emisor,
        mensaje,
        tipo,
        fechaEnvio,
        archivo_url,
        origenDetectado || "web",
      ],
    );

    const nuevoMensaje = {
      id: result.insertId,
      conversacion_id: Number(convId),
      emisor,
      mensaje,
      text: mensaje,
      tipo,
      archivo_url,
      timestamp: fechaEnvio.getTime(),
      origen: origenDetectado || "web",
    };

    const cacheKey = `mensajes:${convId}`;
    const cached = (await getCache(cacheKey)) || [];
    cached.push(nuevoMensaje);
    await setCache(cacheKey, cached, CACHE_TTL.MENSAJES);
    return result.insertId;
  }

  async getOrCreateConversation(sender, origen) {
    const [rows] = await this.pool.execute(
      `SELECT id FROM conversaciones WHERE contacto_id = ? AND origen = ? AND estado != 'cerrada' LIMIT 1`,
      [sender, origen],
    );

    if (rows.length > 0) {
      return rows[0].id;
    }

    const convId = uuidv4();
    await this.pool.query(
      `INSERT INTO conversaciones (id, contacto_id, estado, origen) VALUES (?, ?, 'nuevo', ?)`,
      [convId, sender, origen],
    );
    await deleteCacheKeys(["conversaciones:pendientes"]);
    return convId;
  }

  async updateConversationState(
    convId,
    newState,
    agentId,
    registrarBaseDatos,
    tipificacion = null,
    observaciones = null,
  ) {
    if (registrarBaseDatos) {
      const lockAgent = agentId && agentId !== "SISTEMA" ? agentId : null;
      await this.withAgentActiveLock(lockAgent, async (db) => {
        if (agentId) {
          await db.execute(
            `UPDATE conversaciones SET estado = ?, agente_id = ?, tipificaciones = ?, observaciones = ? WHERE id = ?`,
            [
              newState,
              agentId,
              tipificacion ?? null,
              observaciones ?? null,
              convId,
            ],
          );
        } else {
          await db.execute(
            `UPDATE conversaciones SET estado = ? WHERE id = ?`,
            [newState, convId],
          );
        }
      });
    }

    await this.updateConversationInCaches(convId, newState, agentId);
  }

  async updateConversationInCaches(convId, newState, agentId = null) {
    if (!agentId) return;

    const [rows] = await this.pool.query(
      `SELECT c.*, ct.nombre AS contacto_nombre, ct.tels, ct.direccion, ct.ciudad, ct.entidad, ct.dni, ct.email
       FROM conversaciones c
       LEFT JOIN gestioncomercial.contactos ct ON ct.data = c.contacto_id
       WHERE c.id = ?`,
      [convId],
    );

    if (rows.length === 0) return;

    const conversationData = {
      ...rows[0],
      nombre_mostrar: this._buildDisplayName(rows[0]),
      estado: newState,
      agente_id: agentId,
    };

    for (const estado of ["nuevo", "abierta", "cerrada"]) {
      const key = `conversaciones:${agentId}:${estado}`;
      const cached = await getCache(key);
      if (!cached || !Array.isArray(cached)) continue;

      const nextCached = cached.filter((item) => item.id !== convId);
      await setCache(key, nextCached, CACHE_TTL.CONVERSACIONES);
    }

    const newKey = `conversaciones:${agentId}:${newState}`;
    const targetCached = (await getCache(newKey)) || [];
    const withoutDuplicate = targetCached.filter((item) => item.id !== convId);
    withoutDuplicate.push(conversationData);
    await setCache(newKey, withoutDuplicate, CACHE_TTL.CONVERSACIONES);

    await this.updatePendientesCache(convId, newState, conversationData);
  }

  async updatePendientesCache(convId, newState, conversationData) {
    const pendingKey = "conversaciones:pendientes";
    const pending = (await getCache(pendingKey)) || [];
    const filtered = pending.filter((item) => item.id !== convId);

    if (newState === "nuevo" && conversationData) {
      filtered.push(conversationData);
    }

    await setCache(pendingKey, filtered, CACHE_TTL.CONVERSACIONES);
  }

  async sincronizarCacheConBD(agentId, estado) {
    const rows = await this.getConversaciones(agentId, estado);
    await setCache(
      `conversaciones:${agentId}:${estado}`,
      rows,
      CACHE_TTL.CONVERSACIONES,
    );
    return rows;
  }

  async countActiveConversations(agentId, db = null) {
    const executor = db || this.pool;
    const [[{ count }]] = await executor.execute(
      `SELECT COUNT(*) AS count FROM conversaciones WHERE agente_id = ? AND estado = 'abierta'`,
      [agentId],
    );
    return Number(count || 0);
  }

  async getNextPendingConversation(agentId = null) {
    let rows;
    if (agentId) {
      [rows] = await this.pool.query(
        `SELECT id FROM conversaciones WHERE estado = 'nuevo' AND agente_id = ? ORDER BY inicio ASC LIMIT 1`,
        [agentId],
      );

      if (!rows.length) {
        [rows] = await this.pool.query(
          `SELECT id FROM conversaciones WHERE estado = 'nuevo' AND (agente_id IS NULL OR agente_id = '') ORDER BY inicio ASC LIMIT 1`,
        );
      }
    } else {
      [rows] = await this.pool.query(
        `SELECT id FROM conversaciones WHERE estado = 'nuevo' ORDER BY inicio ASC LIMIT 1`,
      );
    }

    return rows.length > 0 ? rows[0].id : null;
  }

  async getOrInsert(pool, table, nombre) {
    const [rows] = await pool.query(
      `SELECT id FROM ${table} WHERE nombre = ? LIMIT 1`,
      [nombre],
    );
    if (rows.length > 0) {
      return rows[0].id;
    }

    const [result] = await pool.query(
      `INSERT INTO ${table} (nombre) VALUES (?)`,
      [nombre],
    );
    return result.insertId;
  }

  async tipificacionesYComentarios(tipificacion, observaciones, uid) {
    const lvl1Id = await this.getOrInsert(
      this.poolTipificaciones,
      "tpfslvl1",
      String(tipificacion).trim(),
    );
    const planId = await this.getOrInsert(
      this.poolTipificaciones,
      "tpfsplan",
      uid,
    );
    await this.poolTipificaciones.execute(
      `INSERT INTO tpfsrels (plantilla, lvl1, lvl2)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE lvl2 = CONCAT(tpfsrels.lvl2, '|', VALUES(lvl2))`,
      [planId, lvl1Id, observaciones],
    );
    return true;
  }

  async getTipificaciones() {
    const [rows] = await this.poolTipificaciones.execute(
      "SELECT * FROM tpfslvl2",
    );
    return rows;
  }

  async getFiltros() {
    const cacheKey = "filtros:all";
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    const [etiquetas] = await this.pool.execute(
      "SELECT nombre FROM etiquetas ORDER BY nombre ASC",
    );
    const [marcas] = await this.pool.execute(
      `SELECT DISTINCT marca FROM conversaciones WHERE marca IS NOT NULL AND marca != '' ORDER BY marca ASC`,
    );
    const filtrosMap = new Map();

    etiquetas.forEach((etiqueta) => {
      filtrosMap.set(String(etiqueta.nombre).toLowerCase(), {
        nombre: etiqueta.nombre,
        tipo: "etiqueta",
      });
    });

    marcas.forEach((marca) => {
      const key = String(marca.marca).toLowerCase();
      if (!filtrosMap.has(key)) {
        filtrosMap.set(key, { nombre: marca.marca, tipo: "marca" });
      }
    });

    const resultado = Array.from(filtrosMap.values()).sort((left, right) =>
      left.nombre.localeCompare(right.nombre),
    );
    await setCache(cacheKey, resultado, CACHE_TTL.FILTROS);
    return resultado;
  }

  async getMotivosCierre() {
    const [rows] = await this.poolTipificaciones.execute(
      "SELECT * FROM tpfslvl1",
    );
    return rows;
  }

  async getEtiquetas() {
    const cacheKey = "etiquetas:all";
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    const [rows] = await this.pool.execute(
      "SELECT id, nombre, color FROM etiquetas ORDER BY id ASC",
    );
    await setCache(cacheKey, rows, CACHE_TTL.ETIQUETAS);
    return rows;
  }

  async getEtiquetasForConv(convId, telefono = null) {
    if (telefono) {
      const [rows] = await this.pool.query(
        `SELECT id, etiqueta, color
         FROM conversaciones
         WHERE telefono = ?
         ORDER BY CASE WHEN etiqueta IS NULL OR TRIM(etiqueta) = '' THEN 1 ELSE 0 END ASC, id DESC
         LIMIT 1`,
        [telefono],
      );
      return rows;
    }

    const [rows] = await this.pool.query(
      `SELECT id, etiqueta, color FROM conversaciones WHERE id = ?`,
      [convId],
    );
    return rows;
  }

  async getMarcaForConv(convId, telefono = null) {
    if (telefono) {
      const [rows] = await this.pool.query(
        `SELECT id, marca
         FROM conversaciones
         WHERE telefono = ?
         ORDER BY CASE
                    WHEN LOWER(TRIM(marca)) IN ('bloqueado', 'destacado') THEN 0
                    WHEN marca IS NULL OR TRIM(marca) = '' THEN 2
                    ELSE 1
                  END ASC,
                  id DESC
         LIMIT 1`,
        [telefono],
      );
      return rows;
    }

    const [rows] = await this.pool.query(
      "SELECT id, marca FROM conversaciones WHERE id = ? LIMIT 1",
      [convId],
    );
    return rows;
  }

  async getMultimediaById(convId) {
    const [imagenes] = await this.pool.query(
      `SELECT archivo_url FROM mensajes WHERE conversacion_id = ? AND tipo = 'image'`,
      [convId],
    );
    const [documentos] = await this.pool.query(
      `SELECT archivo_url FROM mensajes WHERE conversacion_id = ? AND tipo = 'document'`,
      [convId],
    );
    const [video] = await this.pool.query(
      `SELECT archivo_url FROM mensajes WHERE conversacion_id = ? AND tipo = 'video'`,
      [convId],
    );
    const [audio] = await this.pool.query(
      `SELECT archivo_url FROM mensajes WHERE conversacion_id = ? AND tipo = 'audio'`,
      [convId],
    );
    return { imagenes, documentos, video, audio };
  }

  async createEtiqueta(nombre, color) {
    try {
      const [existing] = await this.pool.query(
        `SELECT id FROM etiquetas WHERE nombre = ? AND color = ?`,
        [nombre, color],
      );
      if (existing.length > 0) {
        return {
          success: false,
          message: `Ya existe una etiqueta '${nombre}' con ese color`,
        };
      }

      const [result] = await this.pool.query(
        `INSERT INTO etiquetas (nombre, color) VALUES (?, ?)`,
        [nombre, color],
      );
      await deleteCacheKeys(["etiquetas:all", "filtros:all"]);
      return {
        success: true,
        message: "Etiqueta creada exitosamente",
        id: result.insertId,
        nombre,
        color,
      };
    } catch (error) {
      console.error("Error creando etiqueta:", error.message);
      return { success: false, message: error.message };
    }
  }

  async etiquetaSeleccionada(etiquetas, convId, telefono = null) {
    const usarTelefono = Boolean(telefono);
    const whereSql = usarTelefono ? "telefono = ?" : "id = ?";
    const whereValor = usarTelefono ? telefono : convId;

    if (!etiquetas || etiquetas.length === 0) {
      await this.pool.query(
        `UPDATE conversaciones SET etiqueta = NULL, color = NULL WHERE ${whereSql}`,
        [whereValor],
      );
      return true;
    }

    const etiquetasValidas = etiquetas.filter(
      (item) => item.nombre && item.color,
    );
    if (etiquetasValidas.length === 0) {
      return false;
    }

    etiquetasValidas.sort((left, right) => (left.id || 0) - (right.id || 0));
    const nombres = etiquetasValidas
      .map((item) => String(item.nombre).trim())
      .join("|");
    const colores = etiquetasValidas
      .map((item) => {
        let color = String(item.color).trim();
        if (!color.startsWith("#")) color = `#${color}`;
        return color;
      })
      .join("|");

    await this.pool.query(
      `UPDATE conversaciones SET etiqueta = ?, color = ? WHERE ${whereSql}`,
      [nombres, colores, whereValor],
    );
    if (!usarTelefono) {
      await this.actualizarCacheEtiquetas(convId, etiquetasValidas);
    }
    return true;
  }

  async actualizarCacheEtiquetas(convId, etiquetas) {
    const [convData] = await this.pool.query(
      "SELECT agente_id FROM conversaciones WHERE id = ?",
      [convId],
    );
    if (convData.length === 0) return;

    const agentId = convData[0].agente_id;
    for (const estado of ["nuevo", "abierta", "cerrada"]) {
      const cacheKey = `conversaciones:${agentId}:${estado}`;
      const cached = await getCache(cacheKey);
      if (!cached || !Array.isArray(cached)) continue;

      const index = cached.findIndex((item) => item.id == convId);
      if (index === -1) continue;

      cached[index].etiquetas = etiquetas.map((item) => ({
        id: item.id,
        nombre: item.nombre,
        color: item.color,
      }));
      cached[index].etiqueta = etiquetas.map((item) => item.nombre).join("|");
      cached[index].color = etiquetas.map((item) => item.color).join("|");
      await setCache(cacheKey, cached, CACHE_TTL.CONVERSACIONES);
    }
  }

  async insertEntrantesId(mensajeId, numero) {
    const [result] = await this.pool.query(
      `INSERT INTO entrantesId (mensaje_id, numero)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [mensajeId, numero],
    );
    return result.insertId;
  }

  async insertContacto(nombre, telefono) {
    const [existing] = await this.poolTipificaciones.execute(
      "SELECT nombre, data FROM contactos WHERE data = ? LIMIT 1",
      [telefono],
    );

    if (existing.length > 0) {
      const nombreActual = existing[0].nombre || "";
      const nombreNuevo = nombre || "";
      if (
        nombreNuevo &&
        nombreNuevo !== "Desconocido" &&
        (!nombreActual || nombreActual === "Desconocido")
      ) {
        await this.poolTipificaciones.execute(
          "UPDATE contactos SET nombre = ? WHERE data = ?",
          [nombreNuevo, telefono],
        );
      }
      return telefono;
    }

    await this.poolTipificaciones.execute(
      "INSERT INTO contactos (nombre, data, tels) VALUES (?, ?, ?)",
      [nombre, telefono, telefono],
    );
    return telefono;
  }

  async editarContacto(
    nombre,
    dni,
    telefono,
    email,
    ciudad,
    direccion,
    entidad,
  ) {
    try {
      if (!nombre || !telefono) {
        throw new Error("Nombre y teléfono son campos requeridos");
      }

      const [result] = await this.poolTipificaciones.execute(
        `UPDATE contactos
         SET nombre = ?, dni = ?, tels = ?, email = ?, ciudad = ?, direccion = ?, entidad = ?
         WHERE data LIKE ? AND tels = ?`,
        [
          nombre,
          dni,
          telefono,
          email,
          ciudad,
          direccion,
          entidad,
          telefono,
          telefono,
        ],
      );

      if (!result || result.affectedRows === 0) {
        throw new Error("No se pudo actualizar el contacto");
      }

      const [contacto] = await this.poolTipificaciones.execute(
        "SELECT * FROM contactos WHERE data LIKE ? AND tels = ? LIMIT 1",
        [telefono, telefono],
      );

      return {
        success: true,
        mensaje: "Contacto actualizado correctamente",
        contacto: contacto[0],
      };
    } catch (error) {
      return { success: false, mensaje: error.message, error };
    }
  }

  async crearContactoComentarios(
    convId,
    identificacion,
    tipificacion,
    observaciones,
    entidad,
    agenteIdParaComentarios,
    telefono,
    uniqueId,
    origen,
  ) {
    let entidadFinal = String(entidad || "")
      .trim()
      .toUpperCase();
    if (!entidadFinal || entidadFinal === "CHAT") {
      const [rowsConv] = await this.pool.execute(
        "SELECT cola FROM conversaciones WHERE id = ? LIMIT 1",
        [convId],
      );
      entidadFinal =
        String(rowsConv?.[0]?.cola || "")
          .trim()
          .toUpperCase() || "CHAT";
    }

    const [rowsByConv] = await this.poolTipificaciones.execute(
      `SELECT id FROM comentarios_chats WHERE idConv = ? ORDER BY id DESC LIMIT 1`,
      [convId],
    );

    if (rowsByConv?.[0]?.id) {
      const [updateResult] = await this.poolTipificaciones.execute(
        `UPDATE comentarios_chats
         SET data = ?, fecha = NOW(), resultado1 = ?, resultado2 = ?, entidad = ?, colas = ?, usuario = ?, fechaagenda = NOW(),
             fechainicio = NOW(), telefono = ?, uniqueid = ?, linkedid = ?, tipo_contacto = ?
         WHERE id = ?`,
        [
          identificacion,
          tipificacion ?? null,
          observaciones ?? null,
          entidadFinal,
          entidadFinal,
          agenteIdParaComentarios ?? null,
          telefono ?? null,
          uniqueId || null,
          uniqueId || null,
          origen,
          rowsByConv[0].id,
        ],
      );
      return updateResult;
    }

    return this.poolTipificaciones.execute(
      `INSERT INTO comentarios_chats
       (id, idConv, data, fecha, comentario, resultado1, resultado2, entidad, usuario, fechaagenda, unico, fechainicio, telefono, uniqueid, linkedid, datafijos, datapers, tipo_contacto, colas)
       VALUES (NULL, ?, ?, NOW(), 'comentario', ?, ?, ?, ?, NOW(), 'unico', NOW(), ?, ?, ?, 'datafijos', 'datapers', ?, ?)`,
      [
        convId,
        identificacion,
        tipificacion,
        observaciones,
        entidadFinal,
        agenteIdParaComentarios,
        telefono,
        uniqueId,
        uniqueId,
        origen,
        entidadFinal,
      ],
    );
  }

  async registrarTipificacionObservacion(
    convId,
    idTipificacion,
    tipificacion,
    idObservaciones,
    observaciones,
  ) {
    const [existing] = await this.pool.execute(
      "SELECT id FROM idTipificaciones WHERE id_conversacion = ?",
      [convId],
    );
    if (existing.length > 0) {
      const finalId = existing[0].id;
      await this.pool.execute(
        `UPDATE idTipificaciones
         SET id_tipificacion = ?, tipificacion = ?, id_observacion = ?, observacion = ?
         WHERE id = ?`,
        [idTipificacion, tipificacion, idObservaciones, observaciones, finalId],
      );
      return finalId;
    }

    const [result] = await this.pool.execute(
      `INSERT INTO idTipificaciones (id_conversacion, id_tipificacion, tipificacion, id_observacion, observacion)
       VALUES (?, ?, ?, ?, ?)`,
      [convId, idTipificacion, tipificacion, idObservaciones, observaciones],
    );
    return result.insertId;
  }

  async crearContacto(
    nombre,
    identificacion,
    telefono,
    direccion,
    ciudad,
    entidad,
    email,
    idConv,
  ) {
    try {
      const [existing] = await this.poolTipificaciones.execute(
        "SELECT * FROM contactos WHERE nombre LIKE ? AND tels = ? LIMIT 1",
        [`${nombre}%`, telefono],
      );

      if (existing.length > 0) {
        throw new Error(
          `Contacto encontrado. Buscado: nombre='${nombre}%' y telefono='${telefono}'`,
        );
      }

      const [result] = await this.poolTipificaciones.execute(
        `INSERT INTO contactos (nombre, data, tels, direccion, ciudad, entidad, dni, email, idConv)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nombre,
          identificacion,
          telefono,
          direccion,
          ciudad,
          entidad,
          identificacion,
          email,
          idConv,
        ],
      );

      if (!result || result.affectedRows === 0) {
        throw new Error("No se pudo crear el contacto");
      }

      const [contacto] = await this.poolTipificaciones.execute(
        "SELECT * FROM contactos WHERE nombre LIKE ? AND tels = ? LIMIT 1",
        [`${nombre}%`, telefono],
      );

      return {
        success: true,
        mensaje: "Contacto creado correctamente",
        contacto: contacto[0],
      };
    } catch (error) {
      return { success: false, mensaje: error.message, error };
    }
  }

  async obtenerDatosPerfilPrincipal(numeroAgente) {
    try {
      const [rows] = await this.poolUsuariosB.execute(
        "SELECT * FROM crm WHERE id = ? LIMIT 1",
        [numeroAgente],
      );
      if (rows.length === 0) {
        throw new Error(
          `Contacto no encontrado. Buscado: numero de agente='${numeroAgente}'`,
        );
      }

      return {
        success: true,
        mensaje: "Contacto encontrado correctamente",
        contacto: rows[0],
      };
    } catch (error) {
      return { success: false, mensaje: error.message, error };
    }
  }

  async obtenerContactos() {
    const [conversaciones] = await this.pool.execute(
      "SELECT * FROM conversaciones",
    );
    return Promise.all(
      conversaciones.map(async (conv) => {
        if (!conv.contacto_id) {
          return { ...conv, contacto: null };
        }

        const [contacto] = await this.poolTipificaciones.execute(
          "SELECT * FROM contactos WHERE data = ?",
          [conv.contacto_id],
        );
        return { ...conv, contacto: contacto[0] || null };
      }),
    );
  }

  async estadoConexion(uid, conexionActual) {
    await this.pool.execute(
      `INSERT INTO estados_conexion (usuario, estado, fecha_actualizacion)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE estado = VALUES(estado), fecha_actualizacion = NOW()`,
      [uid, conexionActual],
    );

    const [rows] = await this.pool.execute(
      "SELECT estado FROM estados_conexion WHERE usuario = ?",
      [uid],
    );
    return rows[0]?.estado || null;
  }

  async eliminarContacto(data) {
    try {
      const [result1] = await this.pool.execute(
        "DELETE FROM mensajes WHERE conversacion_id = ?",
        [data.id],
      );
      const [result2] = await this.pool.execute(
        "DELETE FROM conversaciones WHERE id = ?",
        [data.id],
      );
      if (result2.affectedRows !== 1) {
        return {
          success: false,
          step: 2,
          message: "Error eliminando conversación (mensajes ya eliminados)",
        };
      }

      const [result3] = await this.poolTipificaciones.execute(
        "DELETE FROM contactos WHERE data = ?",
        [data.contacto_id],
      );
      if (result3.affectedRows !== 1) {
        return {
          success: false,
          step: 3,
          message:
            "Error eliminando contacto (mensajes y conversación ya eliminados)",
        };
      }

      return {
        success: true,
        deletedMessages: result1.affectedRows,
        deletedConversation: result2.affectedRows,
        deletedContact: result3.affectedRows,
      };
    } catch (error) {
      return {
        success: false,
        step: 0,
        message: `Error del sistema: ${error.message}`,
      };
    }
  }

  async actualizarMarca(idConv, dni, tels, marca, estadoConv) {
    try {
      let conversacionesAfectadas = [];
      if (idConv) {
        await this.pool.execute(
          `UPDATE conversaciones SET estado = ?, marca = ? WHERE id = ?`,
          [estadoConv, marca, idConv],
        );
        const [rows] = await this.pool.execute(
          `SELECT id, agente_id, estado, marca, origen, telefono, contacto_id FROM conversaciones WHERE id = ?`,
          [idConv],
        );
        conversacionesAfectadas = rows;
      } else if (dni) {
        await this.pool.execute(
          `UPDATE conversaciones SET estado = ?, marca = ? WHERE contacto_id LIKE ?`,
          [estadoConv, marca, `%${dni}%`],
        );
        const [rows] = await this.pool.execute(
          `SELECT id, agente_id, estado, marca, origen, telefono, contacto_id FROM conversaciones WHERE contacto_id LIKE ?`,
          [`%${dni}%`],
        );
        conversacionesAfectadas = rows;
      } else if (tels) {
        await this.pool.execute(
          `UPDATE conversaciones SET estado = ?, marca = ? WHERE telefono LIKE ?`,
          [estadoConv, marca, `%${tels}%`],
        );
        const [rows] = await this.pool.execute(
          `SELECT id, agente_id, estado, marca, origen, telefono, contacto_id FROM conversaciones WHERE telefono LIKE ?`,
          [`%${tels}%`],
        );
        conversacionesAfectadas = rows;
      } else {
        return {
          success: false,
          mensaje: "Datos insuficientes",
          conversaciones: [],
        };
      }

      for (const conv of conversacionesAfectadas) {
        await invalidateRelatedCaches(conv.id, conv.agente_id);
      }

      return {
        success: true,
        mensaje: "Marca y cache actualizados correctamente",
        conversacionesAfectadas: conversacionesAfectadas.length,
      };
    } catch (error) {
      console.error("Error al actualizar marca y cache:", error.message);
      throw error;
    }
  }

  async colasChat(colaFinal, pausaFinal, agentesOcupados = []) {
    try {
      const conditions = [];
      const params = [];

      if (colaFinal !== null && colaFinal !== undefined && colaFinal !== "") {
        conditions.push("queue_name = ?");
        params.push(colaFinal);
      }

      if (pausaFinal !== null && pausaFinal !== undefined) {
        conditions.push("paused = ?");
        params.push(Number(pausaFinal));
      }

      const whereClause =
        conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
      const [rows] = await this.poolColas.execute(
        `SELECT membername, interface, queue_name, paused, penalty, uniqueid
         FROM queue_member_table
         ${whereClause}
         ORDER BY penalty ASC`,
        params,
      );

      if (!agentesOcupados.length) {
        return rows;
      }

      return rows.filter((agente) => {
        const agenteNum = String(agente.interface || "").replace("Agent/", "");
        return !agentesOcupados.includes(agenteNum);
      });
    } catch (error) {
      console.error("Error en colasChat:", error.message);
      return [];
    }
  }

  async obtenerColaLogueadaAgente(agenteNum) {
    try {
      let agente = String(agenteNum || "")
        .trim()
        .toLowerCase();
      if (!agente) return null;
      if (agente.includes("/")) agente = agente.split("/").pop();
      if (agente.includes("@")) agente = agente.split("@")[0];

      const candidatos = [
        agente,
        `agent/${agente}`,
        `pjsip/${agente}`,
        `sip/${agente}`,
      ];
      const [rows] = await this.poolColas.execute(
        `SELECT queue_name
         FROM queue_member_table
         WHERE LOWER(interface) IN (?, ?, ?, ?)
            OR LOWER(interface) LIKE ?
            OR LOWER(interface) LIKE ?
            OR LOWER(membername) = ?
            OR LOWER(membername) LIKE ?
         ORDER BY queue_name ASC
         LIMIT 1`,
        [...candidatos, `%/${agente}%`, `%${agente}%`, agente, `%${agente}%`],
      );

      const cola = String(rows?.[0]?.queue_name || "").trim();
      return cola || null;
    } catch (error) {
      console.error(
        "Error obteniendo cola logueada del agente:",
        error.message,
      );
      return null;
    }
  }

  async saveWebhookPayload(payload) {
    try {
      let tipo = payload.type || "unknown";
      let gsAppId = null;
      let numeroDestino = null;
      let numeroOrigen = null;
      let mensajeId = null;

      if (payload.entry?.[0]?.changes?.[0]?.value?.messages) {
        tipo = "message";
        const msg = payload.entry[0].changes[0].value.messages[0];
        numeroOrigen = msg.from;
        mensajeId = msg.id;
        gsAppId = payload.entry[0].id;
      } else if (payload.entry?.[0]?.changes?.[0]?.value?.statuses) {
        tipo = "status";
        const status = payload.entry[0].changes[0].value.statuses[0];
        numeroDestino = status.recipient_id;
        mensajeId = status.id;
        gsAppId = payload.entry[0].id;
      } else if (payload.type === "billing-event") {
        tipo = "billing-event";
        gsAppId = payload.app;
        numeroDestino = payload.payload?.destination;
        numeroOrigen = payload.payload?.source;
      } else if (
        payload.type === "agent_assigned" ||
        payload.type === "chat_ended"
      ) {
        numeroDestino = payload.from;
      }

      await this.pool.query(
        `INSERT INTO webhook_payloads (tipo, gs_app_id, numero_destino, numero_origen, mensaje_id, payload)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tipo,
          gsAppId,
          numeroDestino,
          numeroOrigen,
          mensajeId,
          JSON.stringify(payload),
        ],
      );
      return true;
    } catch (error) {
      console.error("Error guardando webhook payload:", error.message);
      return false;
    }
  }

  normalizarNombreTablaMetadata(nombreTabla) {
    const tabla = String(nombreTabla || "")
      .trim()
      .toLowerCase();
    if (!tabla || !/^[a-z0-9_]+$/.test(tabla))
      throw new Error("TABLE_NAME_INVALID");
    if (!this._allowedSchemaTables.has(tabla))
      throw new Error("TABLE_NAME_NOT_ALLOWED");
    return tabla;
  }

  normalizarNombreColumnaMetadata(nombreColumna) {
    const columna = String(nombreColumna || "")
      .trim()
      .toLowerCase();
    if (!columna || !/^[a-z0-9_]+$/.test(columna))
      throw new Error("COLUMN_NAME_INVALID");
    return columna;
  }

  async obtenerColumnasDeTabla(nombreTabla) {
    const tabla = this.normalizarNombreTablaMetadata(nombreTabla);
    this._cacheColumnasTablas = this._cacheColumnasTablas || new Map();
    if (this._cacheColumnasTablas.has(tabla)) {
      return this._cacheColumnasTablas.get(tabla);
    }

    const [rows] = await this.pool.execute(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tabla],
    );

    const columnas = new Map();
    (rows || []).forEach((row) => {
      columnas.set(row.COLUMN_NAME, {
        dataType: row.DATA_TYPE,
        columnType: row.COLUMN_TYPE,
      });
    });
    this._cacheColumnasTablas.set(tabla, columnas);
    return columnas;
  }

  async tablaTieneColumna(nombreTabla, nombreColumna) {
    const tabla = this.normalizarNombreTablaMetadata(nombreTabla);
    const columna = this.normalizarNombreColumnaMetadata(nombreColumna);
    this._cacheExisteColumna = this._cacheExisteColumna || new Map();
    const cacheKey = `${tabla}:${columna}`;

    if (this._cacheExisteColumna.has(cacheKey)) {
      return this._cacheExisteColumna.get(cacheKey);
    }

    const [rows] = await this.pool.execute(
      `SELECT 1 AS existe
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
       LIMIT 1`,
      [tabla, columna],
    );
    const exists = (rows || []).length > 0;
    this._cacheExisteColumna.set(cacheKey, exists);
    return exists;
  }

  async obtenerOCrearConversacionInterna(agenteAExten, agenteBExten) {
    const [a, b] = [String(agenteAExten), String(agenteBExten)].sort();
    const salaInternaKey = `internal-room-${a}-${b}`;
    const usaSalaInternaKey = await this.tablaTieneColumna(
      "conversaciones_agente",
      "sala_interna_key",
    );
    const usaContactoId = await this.tablaTieneColumna(
      "conversaciones_agente",
      "contacto_id",
    );
    const campoSala = usaSalaInternaKey
      ? "sala_interna_key"
      : usaContactoId
        ? "contacto_id"
        : null;
    if (!campoSala) {
      throw new Error(
        "La tabla conversaciones_agente no tiene sala_interna_key ni contacto_id",
      );
    }

    const [rows] = await this.pool.execute(
      `SELECT id, ${campoSala} AS sala_valor FROM conversaciones_agente WHERE ${campoSala} = ? LIMIT 1`,
      [salaInternaKey],
    );
    if (rows.length > 0) {
      return { id: rows[0].id, salaInternaKey: rows[0].sala_valor };
    }

    const columnas = [campoSala];
    const valores = [salaInternaKey];
    if (
      await this.tablaTieneColumna(
        "conversaciones_agente",
        "agente_origen_exten",
      )
    ) {
      columnas.push("agente_origen_exten");
      valores.push(a);
    }
    if (
      await this.tablaTieneColumna(
        "conversaciones_agente",
        "agente_destino_exten",
      )
    ) {
      columnas.push("agente_destino_exten");
      valores.push(b);
    }
    if (await this.tablaTieneColumna("conversaciones_agente", "estado")) {
      columnas.push("estado");
      valores.push("abierta");
    }
    if (await this.tablaTieneColumna("conversaciones_agente", "origen")) {
      columnas.push("origen");
      valores.push("interno");
    }
    if (await this.tablaTieneColumna("conversaciones_agente", "inicio")) {
      columnas.push("inicio");
      valores.push(new Date());
    }
    if (
      await this.tablaTieneColumna("conversaciones_agente", "ultima_actividad")
    ) {
      columnas.push("ultima_actividad");
      valores.push(new Date());
    }

    const placeholders = columnas.map(() => "?").join(", ");
    const [result] = await this.pool.execute(
      `INSERT INTO conversaciones_agente (${columnas.join(", ")}) VALUES (${placeholders})`,
      valores,
    );
    return { id: result.insertId, salaInternaKey };
  }

  async listarMensajesInternosPorConversacion(conversacionId, limite = 50) {
    const limiteSeguro = Math.max(1, Math.min(Number(limite) || 50, 200));
    const tieneEmisorExten = await this.tablaTieneColumna(
      "mensajes_internos",
      "emisor_exten",
    );
    const tieneReceptorExten = await this.tablaTieneColumna(
      "mensajes_internos",
      "receptor_exten",
    );
    const tieneEmisor = await this.tablaTieneColumna(
      "mensajes_internos",
      "emisor",
    );
    const tieneReceptor = await this.tablaTieneColumna(
      "mensajes_internos",
      "receptor",
    );
    const tieneArchivoUrl = await this.tablaTieneColumna(
      "mensajes_internos",
      "archivo_url",
    );
    const tieneDirection = await this.tablaTieneColumna(
      "mensajes_internos",
      "direction",
    );

    const selectEmisor = tieneEmisorExten
      ? "emisor_exten"
      : tieneEmisor
        ? "emisor"
        : `''`;
    const selectReceptor = tieneReceptorExten
      ? "receptor_exten"
      : tieneReceptor
        ? "receptor"
        : `''`;
    const selectArchivo = tieneArchivoUrl ? "archivo_url" : "NULL";
    const selectDirection = tieneDirection ? "direction" : "NULL";

    const [rows] = await this.pool.execute(
      `SELECT id, conversacion_id,
              ${selectEmisor} AS emisor_valor,
              ${selectReceptor} AS receptor_valor,
              mensaje, tipo,
              ${selectArchivo} AS archivo_url,
              ${selectDirection} AS direction,
              UNIX_TIMESTAMP(ts) * 1000 AS timestamp
       FROM mensajes_internos
       WHERE conversacion_id = ?
       ORDER BY ts ASC
       LIMIT ?`,
      [conversacionId, limiteSeguro],
    );

    return rows.map((row) => ({
      id: row.id,
      conversacionId: row.conversacion_id,
      fromAgentId: String(row.emisor_valor || ""),
      toAgentId: String(row.receptor_valor || ""),
      text: row.mensaje || "",
      tipo: row.tipo || "texto",
      archivo_url: row.archivo_url || null,
      direction: row.direction || null,
      timestamp: Number(row.timestamp) || Date.now(),
    }));
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
    const columnas = ["conversacion_id", "mensaje"];
    const valores = [conversacionId, mensaje];
    if (await this.tablaTieneColumna("mensajes_internos", "tipo")) {
      columnas.push("tipo");
      valores.push(tipo);
    }
    if (await this.tablaTieneColumna("mensajes_internos", "direction")) {
      columnas.push("direction");
      valores.push(emisorExten || direction || null);
    }
    if (await this.tablaTieneColumna("mensajes_internos", "archivo_url")) {
      columnas.push("archivo_url");
      valores.push(archivoUrl);
    }
    if (await this.tablaTieneColumna("mensajes_internos", "origen")) {
      columnas.push("origen");
      valores.push("interno");
    }
    if (await this.tablaTieneColumna("mensajes_internos", "emisor_exten")) {
      columnas.push("emisor_exten");
      valores.push(emisorExten);
    } else if (await this.tablaTieneColumna("mensajes_internos", "emisor")) {
      columnas.push("emisor");
      valores.push("agente");
    }
    if (await this.tablaTieneColumna("mensajes_internos", "receptor_exten")) {
      columnas.push("receptor_exten");
      valores.push(receptorExten);
    } else if (await this.tablaTieneColumna("mensajes_internos", "receptor")) {
      columnas.push("receptor");
      valores.push(receptorExten);
    }

    const placeholders = columnas.map(() => "?").join(", ");
    const [result] = await this.pool.execute(
      `INSERT INTO mensajes_internos (${columnas.join(", ")}) VALUES (${placeholders})`,
      valores,
    );
    return result.insertId;
  }

  async getQueueAgents(colaFinal, pausaFinal, agentesOcupados = []) {
    return this.colasChat(colaFinal, pausaFinal, agentesOcupados);
  }

  async getAgentByExten(exten) {
    const [rows] = await this.poolUsuariosB.execute(
      `SELECT * FROM crm WHERE LOWER(TRIM(exten)) = ? LIMIT 1`,
      [this._normalizeAgent(exten)],
    );
    return rows[0] || null;
  }

  async getAgentDisplayName(exten) {
    const [rows] = await this.poolColas.execute(
      `SELECT membername FROM queue_member_table WHERE interface = ? OR interface = ? LIMIT 1`,
      [String(exten || ""), `Agent/${exten}`],
    );
    return rows?.[0]?.membername || String(exten || "Agente");
  }

  async getConversationByPhone(phone) {
    const [rows] = await this.pool.execute(
      `SELECT * FROM conversaciones WHERE telefono = ? ORDER BY id DESC LIMIT 1`,
      [phone],
    );
    return rows[0] || null;
  }

  async getOpenConversationByPhone(phone) {
    const [rows] = await this.pool.execute(
      `SELECT * FROM conversaciones WHERE telefono = ? AND estado IN ('abierta', 'nuevo', 'pendiente') ORDER BY id DESC LIMIT 1`,
      [phone],
    );
    return rows[0] || null;
  }

  async upsertConversationForClient({
    telefono,
    nombre = "Desconocido",
    cola = null,
    agenteId = null,
    salaId = null,
    estado = null,
  }) {
    const existing = await this.getOpenConversationByPhone(telefono);
    const targetState = estado || (agenteId ? "abierta" : "nuevo");

    await this.insertContacto(nombre, telefono);

    if (existing) {
      await this.pool.execute(
        `UPDATE conversaciones
         SET contacto_id = COALESCE(contacto_id, ?),
             telefono = ?,
             cola = COALESCE(?, cola),
             sala_id = COALESCE(?, sala_id),
             agente_id = COALESCE(?, agente_id),
             estado = ?
         WHERE id = ?`,
        [telefono, telefono, cola, salaId, agenteId, targetState, existing.id],
      );
      await invalidateRelatedCaches(
        existing.id,
        agenteId || existing.agente_id,
      );
      return this.getConversacionById(existing.id);
    }

    const inserted = await this.insertConversation(
      null,
      telefono,
      agenteId,
      "whatsapp",
      telefono,
      true,
      salaId,
      cola,
    );
    const convId = inserted.conversationId;
    if (agenteId) {
      await this.updateConversationState(convId, targetState, agenteId, true);
    }
    return this.getConversacionById(convId);
  }

  async attachRoomToConversation(convId, salaId) {
    await this.pool.execute(
      `UPDATE conversaciones SET sala_id = ? WHERE id = ?`,
      [salaId, convId],
    );
    return this.getConversacionById(convId);
  }

  async closeConversation(convId) {
    await this.pool.execute(
      `UPDATE conversaciones SET estado = 'cerrada', fin = NOW() WHERE id = ?`,
      [convId],
    );
    await invalidateRelatedCaches(convId, null);
    return this.getConversacionById(convId);
  }

  async closeConversationByPhone(phone) {
    const current = await this.getOpenConversationByPhone(phone);
    if (!current) return null;
    return this.closeConversation(current.id);
  }
}

module.exports = {
  ChatModel,
  getCache,
  setCache,
};
