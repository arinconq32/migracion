const mongoose = require("mongoose");
const {
  lookupContacts,
  formatPhoneDisplay,
  normalizePhoneDigits,
  normalizeContactDoc,
  phoneVariants,
  resolveConversationDisplayName,
} = require("../utils/contactResolver");

function isLikelyContactIdentifier(value, doc = {}) {
  const v = String(value || "").trim();
  if (!v) return true;
  if (/^[a-f0-9]{24}$/i.test(v)) return true;
  if (/^\d+$/.test(v)) return true;

  const data = String(doc.data || doc.dni || doc.documento || "").trim();
  if (data && v === data) return true;

  const id = String(doc._id || doc.id || doc.legacyId || "").trim();
  if (id && v === id) return true;

  const telefono = normalizePhoneDigits(doc.tels || doc.telefono || doc.numero || "");
  if (telefono && normalizePhoneDigits(v) === telefono) return true;

  return false;
}

function isOnlineEstado(estadoConexion) {
  const estado = String(estadoConexion || "")
    .toLowerCase()
    .trim();

  if (!estado) return false;

  if (["online", "activo", "conectado", "disponible"].includes(estado)) {
    return true;
  }

  return false;
}

function normalizeContact(doc = {}, estadoConexion = "") {
  const telefonoRaw = String(doc.tels || doc.telefono || doc.numero || "")
    .replace(/\|+$/, "")
    .trim();

  const nombreRaw = String(
    doc.nombre || doc.desc || doc.nombreWhatsApp || doc.pushName || "",
  ).trim();
  const resolvedNombre = isLikelyContactIdentifier(nombreRaw, doc) ? "" : nombreRaw;
  const estadoConn = String(
    estadoConexion || doc.estadoConexion || doc.estado_conexion || "",
  ).trim();

  return {
    id: String(doc._id || doc.id || doc.data || ""),
    legacyId: doc.legacyId ?? doc.id ?? null,
    nombre: resolvedNombre || "Sin nombre",
    telefono: telefonoRaw,
    email: String(doc.email || "").trim(),
    ciudad: String(doc.ciudad || "").trim(),
    direccion: String(doc.direccion || "").trim(),
    entidad: String(doc.entidad || "").trim(),
    documento: String(doc.dni || doc.documento || doc.data || "").trim(),
    data: String(doc.data || "").trim(),
    activo: doc.activo !== false && doc.activo !== 0,
    estadoConexion: estadoConn,
    online: isOnlineEstado(estadoConn),
    etiquetas: Array.isArray(doc.etiquetas)
      ? doc.etiquetas.map((e) => ({
          nombre: e.nombre || e.etiqueta || "",
          color: e.color || "#7eb83b",
        }))
      : [],
    creadoEn: doc.creadoEn || doc.creado_en || null,
  };
}

function canonicalPhoneKey(value) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return "";
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

function contactDedupeKey(contact) {
  const phone = canonicalPhoneKey(contact.telefono || "");
  if (phone) return `phone:${phone}`;
  const data = String(contact.data || contact.documento || "").trim();
  if (data) return `data:${data}`;
  return `id:${contact.id}`;
}

function contactQualityScore(contact) {
  const nombre = String(contact?.nombre || "").trim();
  if (nombre && nombre !== "Sin nombre" && !isLikelyContactIdentifier(nombre, contact)) return 3;
  return 1;
}

function dedupeContacts(contacts) {
  const map = new Map();
  for (const contact of contacts) {
    const key = contactDedupeKey(contact);
    const current = map.get(key);
    if (!current || contactQualityScore(contact) > contactQualityScore(current)) {
      map.set(key, contact);
    }
  }
  return [...map.values()];
}

function buildAgentFilters(agentId) {
  const uid = String(agentId || "").trim();
  if (!uid) return [];

  const filters = [{ agenteId: uid }, { agente_id: uid }];
  const numeric = Number(uid);
  if (Number.isFinite(numeric)) {
    filters.push({ agenteId: numeric }, { agente_id: numeric });
  }
  return filters;
}

async function getAgentContactContext(db, agentId) {
  const agentFilters = buildAgentFilters(agentId);
  if (!agentFilters.length) {
    return { phones: new Set(), dataIds: new Set(), statusByKey: new Map() };
  }

  const convs = await db
    .collection("conversaciones")
    .find({ $or: agentFilters })
    .project({
      telefono: 1,
      tels: 1,
      contactoId: 1,
      contacto_id: 1,
      data: 1,
      estadoConexion: 1,
      estado_conexion: 1,
      ultima_actividad: 1,
      inicio: 1,
    })
    .toArray();

  const phones = new Set();
  const dataIds = new Set();
  const statusByKey = new Map();

  for (const conv of convs) {
    const phone = normalizePhoneDigits(conv.telefono || conv.tels || "");
    const dataId = String(conv.contactoId || conv.contacto_id || conv.data || "").trim();
    const estadoConexion = String(
      conv.estadoConexion || conv.estado_conexion || "",
    ).trim();
    const ts = new Date(
      conv.ultima_actividad || conv.inicio || 0,
    ).getTime();

    const keys = [];
    if (phone) {
      phones.add(phone);
      keys.push(`phone:${phone}`);
      for (const variant of phoneVariants(conv.telefono || conv.tels || phone)) {
        const normalized = normalizePhoneDigits(variant);
        if (normalized) {
          phones.add(normalized);
          keys.push(`phone:${normalized}`);
        }
      }
    }
    if (dataId) {
      dataIds.add(dataId);
      keys.push(`data:${dataId}`);
    }

    for (const key of keys) {
      const prev = statusByKey.get(key);
      if (!prev || ts >= prev.ts) {
        statusByKey.set(key, { estadoConexion, ts });
      }
    }
  }

  return { phones, dataIds, statusByKey };
}

function resolveContactEstadoConexion(contact, statusByKey) {
  const data = String(contact.data || contact.documento || "").trim();
  if (data) {
    const hit = statusByKey.get(`data:${data}`);
    if (hit?.estadoConexion) return hit.estadoConexion;
  }

  const phone = normalizePhoneDigits(contact.telefono || "");
  if (phone) {
    const direct = statusByKey.get(`phone:${phone}`);
    if (direct?.estadoConexion) return direct.estadoConexion;
  }

  for (const variant of phoneVariants(contact.telefono || "")) {
    const hit = statusByKey.get(`phone:${normalizePhoneDigits(variant)}`);
    if (hit?.estadoConexion) return hit.estadoConexion;
  }

  return "";
}

async function enrichContactsWithConversationNames(db, contacts = []) {
  if (!contacts.length) return contacts;

  const phoneSet = new Set();
  const dataIds = new Set();

  for (const contact of contacts) {
    const data = String(contact.data || contact.documento || "").trim();
    if (data) dataIds.add(data);
    for (const variant of phoneVariants(contact.telefono || "")) {
      phoneSet.add(variant);
    }
  }

  const orFilters = [];
  if (dataIds.size) {
    orFilters.push(
      { contactoId: { $in: [...dataIds] } },
      { contacto_id: { $in: [...dataIds] } },
      { data: { $in: [...dataIds] } },
    );
  }
  for (const phone of phoneSet) {
    orFilters.push({ telefono: phone }, { tels: phone });
  }

  if (!orFilters.length) return contacts;

  const conversations = await db
    .collection("conversaciones")
    .find({ $or: orFilters })
    .limit(5000)
    .toArray();

  return contacts.map((contact) => {
    const hasName =
      contact.nombre &&
      contact.nombre !== "Sin nombre" &&
      !isLikelyContactIdentifier(contact.nombre, contact);
    if (hasName) return contact;

    const phone = normalizePhoneDigits(contact.telefono || "");
    const dataId = String(contact.data || contact.documento || "").trim();

    const conv = conversations.find((item) => {
      const convPhone = normalizePhoneDigits(item.telefono || item.tels || "");
      const convData = String(item.contactoId || item.contacto_id || item.data || "").trim();
      if (dataId && convData && dataId === convData) return true;
      if (phone && convPhone && phone === convPhone) return true;
      return phoneVariants(contact.telefono || "").some((variant) => variant === convPhone);
    });

    if (!conv) return contact;

    const nombre = resolveConversationDisplayName(conv, contact);
    if (
      !nombre ||
      nombre === "Sin nombre" ||
      isLikelyContactIdentifier(nombre, contact) ||
      /^conversacion(\s|$)/i.test(nombre)
    ) {
      return contact;
    }

    return { ...contact, nombre };
  });
}

// Obtener contactos desde MongoDB
exports.getContacts = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
    const search = String(req.query.search || "").trim();
    const agentId = String(req.query.agentId || req.query.userId || "").trim();

    const filter = {};
    if (search) {
      const regex = new RegExp(
        search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      filter.$or = [
        { nombre: regex },
        { tels: regex },
        { data: regex },
        { email: regex },
        { dni: regex },
      ];
    }

    let agentContext = null;
    let queryFilter = { ...filter };

    if (agentId) {
      agentContext = await getAgentContactContext(db, agentId);
      if (!agentContext.phones.size && !agentContext.dataIds.size) {
        return res.json([]);
      }

      const agentContactFilters = [];
      const dataList = [...agentContext.dataIds];
      const phoneList = [...agentContext.phones];

      if (dataList.length) {
        agentContactFilters.push({ data: { $in: dataList } });
      }
      for (const phone of phoneList) {
        const escaped = phone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        agentContactFilters.push(
          { tels: new RegExp(`^${escaped}`) },
          { data: phone },
        );
      }

      queryFilter =
        Object.keys(filter).length > 0
          ? { $and: [filter, { $or: agentContactFilters }] }
          : { $or: agentContactFilters };
    }

    const contacts = await db
      .collection("contactos")
      .find(queryFilter)
      .sort({ nombre: 1, _id: 1 })
      .limit(limit)
      .toArray();

    const normalized = dedupeContacts(
      contacts.map((doc) => {
        const estadoConexion = agentContext
          ? resolveContactEstadoConexion(
              normalizeContactDoc(doc),
              agentContext.statusByKey,
            )
          : "";
        return normalizeContact(doc, estadoConexion);
      }),
    );

    const enriched = await enrichContactsWithConversationNames(db, normalized);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener contactos", details: err });
  }
};

// Crear un nuevo contacto
exports.createContact = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const body = req.body || {};
    const doc = {
      nombre: String(body.nombre || "").trim(),
      tels: String(body.telefono || body.tels || "").trim(),
      email: String(body.email || "").trim(),
      ciudad: String(body.ciudad || "").trim(),
      direccion: String(body.direccion || "").trim(),
      entidad: String(body.entidad || "").trim(),
      dni: String(body.documento || body.dni || body.data || "").trim(),
      data: String(body.data || body.documento || body.dni || "").trim(),
      online: Boolean(body.online),
      etiquetas: Array.isArray(body.etiquetas) ? body.etiquetas : [],
      creadoEn: new Date(),
    };

    const result = await db.collection("contactos").insertOne(doc);
    res.status(201).json(
      normalizeContact({ ...doc, _id: result.insertedId }),
    );
  } catch (err) {
    res.status(400).json({ error: "Error al crear contacto", details: err });
  }
};

// Actualizar contacto
exports.updateContact = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const id = String(req.params.id || "").trim();
    const body = req.body || {};

    const filters = [{ _id: id }, { data: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      filters.unshift({ _id: new mongoose.Types.ObjectId(id) });
    }

    const update = {
      ...(body.nombre !== undefined ? { nombre: String(body.nombre).trim() } : {}),
      ...(body.telefono !== undefined || body.tels !== undefined
        ? { tels: String(body.telefono || body.tels || "").trim() }
        : {}),
      ...(body.email !== undefined ? { email: String(body.email).trim() } : {}),
      ...(body.ciudad !== undefined ? { ciudad: String(body.ciudad).trim() } : {}),
      ...(body.direccion !== undefined
        ? { direccion: String(body.direccion).trim() }
        : {}),
      ...(body.entidad !== undefined ? { entidad: String(body.entidad).trim() } : {}),
      ...(body.documento !== undefined || body.dni !== undefined
        ? {
            dni: String(body.documento || body.dni || "").trim(),
            data: String(body.data || body.documento || body.dni || "").trim(),
          }
        : {}),
    };

    const result = await db
      .collection("contactos")
      .findOneAndUpdate({ $or: filters }, { $set: update }, { returnDocument: "after" });

    if (!result?.value && !result) {
      return res.status(404).json({ error: "Contacto no encontrado" });
    }

    const contact = result?.value || result;
    res.json(normalizeContact(contact));
  } catch (err) {
    res.status(400).json({ error: "Error al actualizar contacto", details: err });
  }
};

// Eliminar contacto
exports.deleteContact = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const id = String(req.params.id || "").trim();
    const filters = [{ _id: id }, { data: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      filters.unshift({ _id: new mongoose.Types.ObjectId(id) });
    }

    const result = await db.collection("contactos").deleteOne({ $or: filters });
    if (!result.deletedCount) {
      return res.status(404).json({ error: "Contacto no encontrado" });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "Error al eliminar contacto", details: err });
  }
};

exports.lookupContacts = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const telefonos = Array.isArray(req.body?.telefonos) ? req.body.telefonos : [];
    const dataIds = Array.isArray(req.body?.dataIds) ? req.body.dataIds : [];
    const result = await lookupContacts(db, { telefonos, dataIds });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Error al buscar contactos", details: err });
  }
};
