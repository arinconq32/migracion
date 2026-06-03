export function isLikelyContactIdentifier(value, entity = {}) {
  const v = String(value || "").trim();
  if (!v) return true;
  if (/^[a-f0-9]{24}$/i.test(v)) return true;
  if (/^\d+$/.test(v)) return true;

  const data = String(entity.data || entity.documento || entity.dni || "").trim();
  if (data && v === data) return true;

  const id = String(entity.id || entity.legacyId || entity._id || "").trim();
  if (id && v === id) return true;

  const telefono = normalizePhoneDigits(
    entity.telefono || entity.tels || entity.numero || "",
  );
  if (telefono && normalizePhoneDigits(v) === telefono) return true;

  return false;
}

export function resolveContactDisplayName(contact = {}) {
  return resolveContactNameOnly(contact);
}

export function findConversationForContact(contact = {}, conversations = []) {
  const phone = normalizePhoneDigits(
    contact.telefono || contact.tels || contact.numero || "",
  );
  const dataId = String(contact.data || contact.documento || contact.dni || "").trim();

  for (const conv of conversations) {
    const convPhone = normalizePhoneDigits(conv.telefono || conv.tels || conv.metadata?.telefono || "");
    const convData = String(
      conv.contactoId || conv.contacto_id || conv.data || conv.metadata?.contactoId || "",
    ).trim();

    if (phone && convPhone && phone === convPhone) return conv;
    if (dataId && convData && dataId === convData) return conv;

    for (const variant of phoneVariants(phone)) {
      if (convPhone && variant === convPhone) return conv;
    }
  }

  return null;
}

export function resolveContactNameOnly(contact = {}, conversations = []) {
  const nombre = String(contact.nombre || "").trim();
  if (nombre && !isLikelyContactIdentifier(nombre, contact) && nombre !== "Sin nombre") {
    return nombre;
  }

  const linkedConv = findConversationForContact(contact, conversations);
  if (linkedConv) {
    const convName = resolveConversationDisplayName(linkedConv, contact);
    if (
      convName &&
      convName !== "Sin nombre" &&
      !isLikelyContactIdentifier(convName, contact) &&
      !/^conversacion(\s|$)/i.test(convName)
    ) {
      return convName;
    }
  }

  return "Sin nombre";
}

export function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function phoneVariants(value) {
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

export function formatPhoneDisplay(value) {
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

function isGenericConversationName(name, convId, conv = {}) {
  const value = String(name || "").trim();
  if (!value) return true;
  if (/^conversacion(\s|$)/i.test(value)) return true;
  if (convId && value === String(convId)) return true;
  if (/^[a-f0-9]{24}$/i.test(value)) return true;
  if (/^\d+$/.test(value)) return true;

  const contactoId = String(
    conv.contactoId || conv.contacto_id || conv.data || conv.metadata?.contactoId || "",
  ).trim();
  if (contactoId && value === contactoId) return true;

  const telefono = normalizePhoneDigits(
    conv.telefono || conv.tels || conv.metadata?.telefono || "",
  );
  if (telefono && normalizePhoneDigits(value) === telefono) return true;

  return false;
}

function pickDisplayName(candidates, telefono, convId, conv = {}) {
  const phoneDigits = normalizePhoneDigits(telefono);

  for (const raw of candidates) {
    const name = String(raw || "").split("|")[0].trim();
    if (!name) continue;
    if (normalizePhoneDigits(name) === phoneDigits) continue;
    if (isGenericConversationName(name, convId, conv)) continue;
    return name;
  }

  return "";
}

export function findContactFromLookup(conv = {}, lookup = {}) {
  const byData = lookup.byData || {};
  const byPhone = lookup.byPhone || {};
  const contactoId = String(
    conv.contactoId || conv.contacto_id || conv.data || conv.metadata?.contactoId || "",
  ).trim();
  const telefono = String(conv.telefono || conv.tels || conv.metadata?.telefono || "").trim();

  if (contactoId && byData[contactoId]) {
    return byData[contactoId];
  }

  for (const variant of phoneVariants(telefono)) {
    if (byPhone[variant]) return byPhone[variant];
  }
  for (const variant of phoneVariants(contactoId)) {
    if (byPhone[variant]) return byPhone[variant];
  }

  return null;
}

export function resolveConversationDisplayName(conv = {}, contact = null) {
  const meta = conv.metadata || {};
  const telefono =
    conv.telefono || conv.tels || meta.telefono || contact?.telefono || "";
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

export function enrichConversationWithContact(conv = {}, contact = null) {
  const nombre = resolveConversationDisplayName(conv, contact);
  const telefono = String(
    conv.telefono || conv.tels || contact?.telefono || "",
  ).trim();

  return {
    ...conv,
    telefono: telefono || conv.telefono,
    contactoId:
      conv.contactoId || conv.contacto_id || contact?.data || conv.data || "",
    nombre,
    name: nombre,
    email: conv.email || contact?.email || "",
    ciudad: conv.ciudad || contact?.ciudad || "",
    direccion: conv.direccion || contact?.direccion || "",
    entidad: conv.entidad || contact?.entidad || "",
    data: conv.data || contact?.data || contact?.documento || "",
    metadata: {
      ...(conv.metadata || {}),
      contactoId:
        conv.contactoId || conv.contacto_id || contact?.data || "",
      telefono,
    },
  };
}

export function buildContactLookupFromList(contacts = []) {
  const byData = {};
  const byPhone = {};

  for (const raw of contacts) {
    const contact = {
      nombre: String(raw?.nombre || "").trim(),
      telefono: String(raw?.telefono || raw?.tels || "").trim(),
      data: String(raw?.data || raw?.documento || "").trim(),
      email: String(raw?.email || "").trim(),
      ciudad: String(raw?.ciudad || "").trim(),
      direccion: String(raw?.direccion || "").trim(),
      entidad: String(raw?.entidad || "").trim(),
      documento: String(raw?.documento || raw?.dni || raw?.data || "").trim(),
    };

    if (contact.data) byData[contact.data] = contact;
    if (contact.documento && contact.documento !== contact.data) {
      byData[contact.documento] = contact;
    }

    for (const variant of phoneVariants(contact.telefono)) {
      if (!byPhone[variant]) byPhone[variant] = contact;
    }
  }

  return { byData, byPhone };
}

export function collectConversationLookupKeys(conversations = []) {
  const telefonos = new Set();
  const dataIds = new Set();

  for (const conv of conversations) {
    const contactoId = String(
      conv.contactoId || conv.contacto_id || conv.data || conv.metadata?.contactoId || "",
    ).trim();
    const telefono = String(conv.telefono || conv.tels || conv.metadata?.telefono || "").trim();

    if (contactoId) dataIds.add(contactoId);
    for (const variant of phoneVariants(telefono)) telefonos.add(variant);
    for (const variant of phoneVariants(contactoId)) telefonos.add(variant);
  }

  return {
    telefonos: [...telefonos],
    dataIds: [...dataIds],
  };
}
