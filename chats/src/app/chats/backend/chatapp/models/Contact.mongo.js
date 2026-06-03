const { Schema, model } = require("mongoose");

const ContactSchema = new Schema({
  id: Number,
  mensaje_id: String,
  numero: String,
});

const Contact = model("Contact", ContactSchema, "contactos");

module.exports = Contact;
