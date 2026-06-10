function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function phoneVariants(value) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return [];

  const variants = new Set([digits]);
  if (digits.length === 12 && digits.startsWith("57")) {
    variants.add(digits.slice(2));
  }
  if (digits.length === 10) {
    variants.add(`57${digits}`);
  }
  return [...variants];
}

function formatPhoneDisplay(value) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return "";

  if (digits.length === 12 && digits.startsWith("57")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 10) {
    return `+57 ${digits.slice(0, 3)} ${digits.slice(3)}`;
  }
  return digits;
}

function normalizeContactDoc(doc = {}) {
  const telefonoRaw = String(doc.tels || doc.telefono || doc.numero || "")
    .replace(/\|+$/, "")
    .trim();
  const nombreRaw = String(doc.nombre || "").trim();

  return {
    id: String(doc._id || doc.id || doc.data || ""),
    data: String(doc.data || "").trim(),
    nombre: nombreRaw,
    telefono: telefonoRaw,
    email: String(doc.email || "").trim(),
    ciudad: String(doc.ciudad || "").trim(),
    direccion: String(doc.direccion || "").trim(),
    entidad: String(doc.entidad || "").trim(),
    documento: String(doc.dni || doc.documento || doc.data || "").trim(),
  };
}

function isGenericConversationName(name, convId, conv = {}) {
  const value = String(name || "").trim();
  if (!value) return true;
  if (/^conversacion(\s|$)/i.test(value)) return true;
  if (convId && value === String(convId)) return true;
  if (/^[a-f0-9]{24}$/i.test(value)) return true;
  if (/^\d+$/.test(value)) return true;
  if (/^cliente(\s|$)/i.test(value)) return true;
  if (/^contacto\s+desconocido/i.test(value)) return true;

  const contactoId = String(conv.contactoId || conv.contacto_id || conv.data || "").trim();
  if (contactoId && value === contactoId) return true;

  const telefono = normalizePhoneDigits(conv.telefono || conv.tels || conv.metadata?.telefono || "");
  if (telefono && normalizePhoneDigits(value) === telefono) return true;

  return false;
}

function pickDisplayName(candidates, telefono, convId, conv = {}) {
  const phoneDigits = normalizePhoneDigits(telefono);

  for (const raw of candidates) {
    let name = String(raw || "").split("|")[0].trim();
    const commaParts = name.split(",");
    if (
      commaParts.length > 1 &&
      /^\d+[a-z]?$/i.test(String(commaParts[1] || "").trim())
    ) {
      name = commaParts[0].trim();
    }
    if (!name) continue;
    if (normalizePhoneDigits(name) === phoneDigits) continue;
    if (isGenericConversationName(name, convId, conv)) continue;
    return name;
  }

  return "";
}

function resolveConversationDisplayName(conv = {}, contact = null) {
  const meta = conv.metadata || {};
  const telefono = conv.telefono || conv.tels || meta.telefono || contact?.telefono || "";
  const convId = conv.id || conv._id || "";

  const resolved = pickDisplayName(
    [
      contact?.nombre,
      conv.nombre,
      conv.name,
      meta.nombreWhatsApp,
      meta.pushName,
      meta.nombre,
      meta.profileName,
    ],
    telefono,
    convId,
    conv,
  );

  if (resolved) return resolved;

  const formattedPhone = formatPhoneDisplay(telefono);
  if (formattedPhone) return formattedPhone;

  return convId ? `Conversacion ${String(convId).slice(-4)}` : "Sin nombre";
}

async function buildContactLookup(db, conversations = []) {
  const dataIds = new Set();
  const phoneSet = new Set();

  for (const conv of conversations) {
    const contactoId = String(conv.contactoId || conv.contacto_id || conv.data || "").trim();
    const telefono = String(conv.telefono || conv.tels || "").trim();

    if (contactoId) dataIds.add(contactoId);
    for (const variant of phoneVariants(telefono)) phoneSet.add(variant);
    for (const variant of phoneVariants(contactoId)) phoneSet.add(variant);
  }

  const orFilters = [];
  if (dataIds.size) {
    const ids = [...dataIds];
    orFilters.push(
      { data: { $in: ids } },
      { dni: { $in: ids } },
      { contactoId: { $in: ids } },
    );
  }
  if (phoneSet.size) {
    const phones = [...phoneSet];
    orFilters.push(
      { tels: { $in: phones } },
      { telefono: { $in: phones } },
      { data: { $in: phones } },
    );
  }

  const byData = new Map();
  const byPhone = new Map();

  if (!orFilters.length) {
    return { byData, byPhone };
  }

  const contacts = await db
    .collection("contactos")
    .find({ $or: orFilters })
    .limit(5000)
    .toArray();

  for (const doc of contacts) {
    const normalized = normalizeContactDoc(doc);
    if (normalized.data) {
      byData.set(normalized.data, normalized);
    }
    const phoneParts = String(normalized.telefono || "")
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!phoneParts.length && normalized.telefono) phoneParts.push(normalized.telefono);
    for (const part of phoneParts) {
      for (const variant of phoneVariants(part)) {
        if (!byPhone.has(variant)) {
          byPhone.set(variant, normalized);
        }
      }
    }
  }

  return { byData, byPhone };
}

function findContactForConversation(conv = {}, lookup = {}) {
  const byData = lookup.byData || new Map();
  const byPhone = lookup.byPhone || new Map();
  const contactoId = String(conv.contactoId || conv.contacto_id || conv.data || "").trim();
  const telefono = String(conv.telefono || conv.tels || "").trim();

  if (contactoId && byData.has(contactoId)) {
    return byData.get(contactoId);
  }

  for (const variant of phoneVariants(telefono)) {
    if (byPhone.has(variant)) return byPhone.get(variant);
  }
  for (const variant of phoneVariants(contactoId)) {
    if (byPhone.has(variant)) return byPhone.get(variant);
  }

  return null;
}

function resolveContactNameFromContact(contact, conv = {}) {
  const convId = conv.id || conv._id || "";
  const telefono = conv.telefono || conv.tels || "";

  if (contact?.nombre) {
    const fromContact = pickDisplayName(
      [contact.nombre],
      telefono,
      convId,
      conv,
    );
    if (fromContact) return fromContact;
  }

  return "Sin nombre";
}

function enrichConversation(conv = {}, lookup = {}) {
  const contact = findContactForConversation(conv, lookup);
  const nombre = resolveContactNameFromContact(contact, conv);
  const telefono = String(
    conv.telefono || conv.tels || contact?.telefono || "",
  ).trim();

  return {
    ...conv,
    telefono: telefono || conv.telefono,
    contactoId: conv.contactoId || conv.contacto_id || contact?.data || conv.data,
    nombre,
    name: nombre,
    email: conv.email || contact?.email || "",
    ciudad: conv.ciudad || contact?.ciudad || "",
    direccion: conv.direccion || contact?.direccion || "",
    entidad: conv.entidad || contact?.entidad || "",
    data: conv.data || contact?.data || contact?.documento || "",
    metadata: {
      ...(conv.metadata || {}),
      contactoId: conv.contactoId || conv.contacto_id || contact?.data || "",
      telefono,
    },
  };
}

async function enrichConversationsWithContacts(db, conversations = []) {
  const lookup = await buildContactLookup(db, conversations);
  return conversations.map((conv) => enrichConversation(conv, lookup));
}

async function lookupContacts(db, { telefonos = [], dataIds = [] } = {}) {
  const pseudoConversations = [
    ...telefonos.map((telefono) => ({ telefono })),
    ...dataIds.map((contactoId) => ({ contactoId })),
  ];
  const lookup = await buildContactLookup(db, pseudoConversations);

  const byData = {};
  const byPhone = {};

  for (const [key, value] of lookup.byData.entries()) {
    byData[key] = value;
  }
  for (const [key, value] of lookup.byPhone.entries()) {
    byPhone[key] = value;
  }

  return { byData, byPhone };
}

module.exports = {
  normalizePhoneDigits,
  phoneVariants,
  formatPhoneDisplay,
  normalizeContactDoc,
  resolveConversationDisplayName,
  resolveContactNameFromContact,
  findContactForConversation,
  enrichConversation,
  enrichConversationsWithContacts,
  buildContactLookup,
  lookupContacts,
};
