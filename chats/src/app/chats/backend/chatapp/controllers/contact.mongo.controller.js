const mongoose = require("mongoose");
const {
  lookupContacts,
  formatPhoneDisplay,
  normalizePhoneDigits,
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

function normalizeContact(doc = {}) {
  const telefonoRaw = String(doc.tels || doc.telefono || doc.numero || "")
    .replace(/\|+$/, "")
    .trim();

  const nombreRaw = String(
    doc.nombre || doc.desc || doc.nombreWhatsApp || doc.pushName || "",
  ).trim();
  const resolvedNombre = isLikelyContactIdentifier(nombreRaw, doc) ? "" : nombreRaw;
  const estadoRaw = String(doc.estado || "").trim().toLowerCase();

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
    activo: doc.activo !== false && doc.activo !== 0 && estadoRaw !== "inactivo",
    online: Boolean(
      doc.online ||
        doc.activo === true ||
        estadoRaw === "online" ||
        estadoRaw === "activo",
    ),
    etiquetas: Array.isArray(doc.etiquetas)
      ? doc.etiquetas.map((e) => ({
          nombre: e.nombre || e.etiqueta || "",
          color: e.color || "#7eb83b",
        }))
      : [],
    creadoEn: doc.creadoEn || doc.creado_en || null,
  };
}

function contactDedupeKey(contact) {
  const phone = normalizePhoneDigits(contact.telefono || "");
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

    const contacts = await db
      .collection("contactos")
      .find(filter)
      .sort({ nombre: 1, _id: 1 })
      .limit(limit)
      .toArray();

    const normalized = dedupeContacts(contacts.map(normalizeContact));
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
