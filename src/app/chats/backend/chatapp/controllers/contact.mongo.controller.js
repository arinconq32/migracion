const Contact = require("../models/Contact.mongo");

// Obtener todos los contactos
exports.getContacts = async (req, res) => {
  try {
    const contacts = await Contact.find();
    console.log("Contactos desde MongoDB:", contacts);
    // Normaliza los campos a camelCase
    const normalized = contacts.map((c) => ({
      id: c.id || c._id,
      nombre: c.nombre,
      telefono: c.telefono,
      email: c.email,
      ciudad: c.ciudad,
      direccion: c.direccion,
      entidad: c.entidad,
      documento: c.documento,
      online: c.online,
      etiquetas: (c.etiquetas || []).map((e) => ({
        nombre: e.nombre,
        color: e.color,
      })),
      creadoEn: c.creadoEn || c.creado_en,
    }));
    console.log("Contactos normalizados:", normalized);
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener contactos", details: err });
  }
};

// Crear un nuevo contacto
exports.createContact = async (req, res) => {
  try {
    const contact = new Contact(req.body);
    await contact.save();
    // Normaliza la respuesta
    res.status(201).json({
      id: contact.id || contact._id,
      nombre: contact.nombre,
      telefono: contact.telefono,
      email: contact.email,
      ciudad: contact.ciudad,
      direccion: contact.direccion,
      entidad: contact.entidad,
      documento: contact.documento,
      online: contact.online,
      etiquetas: (contact.etiquetas || []).map((e) => ({
        nombre: e.nombre,
        color: e.color,
      })),
      creadoEn: contact.creadoEn || contact.creado_en,
    });
  } catch (err) {
    res.status(400).json({ error: "Error al crear contacto", details: err });
  }
};

// Actualizar contacto
exports.updateContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    // Normaliza la respuesta
    res.json({
      id: contact.id || contact._id,
      nombre: contact.nombre,
      telefono: contact.telefono,
      email: contact.email,
      ciudad: contact.ciudad,
      direccion: contact.direccion,
      entidad: contact.entidad,
      documento: contact.documento,
      online: contact.online,
      etiquetas: (contact.etiquetas || []).map((e) => ({
        nombre: e.nombre,
        color: e.color,
      })),
      creadoEn: contact.creadoEn || contact.creado_en,
    });
  } catch (err) {
    res
      .status(400)
      .json({ error: "Error al actualizar contacto", details: err });
  }
};

// Eliminar contacto
exports.deleteContact = async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "Error al eliminar contacto", details: err });
  }
};
