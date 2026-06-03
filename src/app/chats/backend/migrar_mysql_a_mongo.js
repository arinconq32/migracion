// migrar_mysql_a_mongo.js
// Migración avanzada de omnicanalidad (MySQL/MariaDB) a MongoDB
// Ejecuta: node migrar_mysql_a_mongo.js
// Requiere: npm install mysql2 mongoose dotenv

require("dotenv").config();
const mysql = require("mysql2/promise");
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");

// Configuración desde .env o valores por defecto
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || "localhost",
  port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DB || "omnicanalidad",
};
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB = process.env.MONGO_DB || "omnicanalidad";

function parseEtiquetas(etiquetaStr, colorStr) {
  if (!etiquetaStr) return [];
  const nombres = etiquetaStr
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  const colores = (colorStr || "").split("|").map((s) => s.trim());
  return nombres.map((nombre, i) => ({ nombre, color: colores[i] || null }));
}

function toDateUTC(dt) {
  if (!dt) return null;
  if (dt instanceof Date) return dt;
  return new Date(dt + "Z");
}

async function main() {
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
  // Conectar solo a la URI base
  const mongoConn = await mongoose.connect(MONGO_URI);
  // Seleccionar la base de datos deseada
  const db = mongoose.connection.useDb(MONGO_DB).db;

  // Utilidad para limpiar y crear índices
  async function resetCollection(name, indexes = []) {
    const col = db.collection(name);
    await col.deleteMany({});
    for (const idx of indexes) {
      await col.createIndex(idx.fields, idx.options || {});
    }
    return col;
  }

  // 1. Etiquetas
  const etiquetasCol = await resetCollection("etiquetas", [
    { fields: { nombre: 1 }, options: { unique: true } },
  ]);
  const [etiquetas] = await mysqlConn.execute("SELECT * FROM etiquetas");
  if (etiquetas.length) {
    await etiquetasCol.insertMany(
      etiquetas.map((r) => ({
        legacyId: r.id,
        nombre: r.nombre,
        color: r.color,
      })),
    );
    console.log(`Migradas ${etiquetas.length} etiquetas.`);
  }

  // 2. EntrantesId
  const entrantesCol = await resetCollection("entrantes", [
    { fields: { numero: 1 }, options: { unique: true } },
  ]);
  const [entrantes] = await mysqlConn.execute("SELECT * FROM entrantesId");
  if (entrantes.length) {
    await entrantesCol.insertMany(
      entrantes.map((r) => ({
        legacyId: r.id,
        mensajeId: r.mensaje_id,
        numero: r.numero,
      })),
    );
    console.log(`Migrados ${entrantes.length} entrantesId.`);
  }

  // 3. Estados de conexión
  const estadosCol = await resetCollection("estados_conexion", [
    { fields: { usuario: 1 }, options: { unique: true } },
  ]);
  const [estados] = await mysqlConn.execute("SELECT * FROM estados_conexion");
  if (estados.length) {
    await estadosCol.insertMany(
      estados.map((r) => ({
        legacyId: r.id,
        usuario: r.usuario,
        estado: r.estado,
        fechaActualizacion: toDateUTC(r.fecha_actualizacion),
      })),
    );
    console.log(`Migrados ${estados.length} estados_conexion.`);
  }

  // 4. Respuestas rápidas
  const respuestasCol = await resetCollection("respuestas_rapidas", [
    { fields: { agenteId: 1, comando: 1 }, options: { unique: true } },
  ]);
  const [respuestas] = await mysqlConn.execute(
    "SELECT * FROM respuestas_rapidas",
  );
  if (respuestas.length) {
    await respuestasCol.insertMany(
      respuestas.map((r) => ({
        legacyId: r.id,
        agenteId: r.agente_id,
        comando: r.comando,
        respuesta: r.respuesta,
        createdAt: toDateUTC(r.created_at),
      })),
    );
    console.log(`Migradas ${respuestas.length} respuestas_rapidas.`);
  }

  // 5. Conversaciones entre agentes
  const convAgenteCol = await resetCollection("conversaciones_agente", [
    { fields: { salaInternaKey: 1 }, options: { unique: true } },
    { fields: { agenteOrigen: 1 } },
    { fields: { agenteDestino: 1 } },
  ]);
  const [convAgente] = await mysqlConn.execute(
    "SELECT * FROM conversaciones_agente",
  );
  const convAgenteIdMap = {};
  if (convAgente.length) {
    const docs = convAgente.map((r) => {
      const oid = new ObjectId();
      convAgenteIdMap[r.id] = oid;
      return {
        _id: oid,
        legacyId: r.id,
        salaInternaKey: r.sala_interna_key,
        agenteOrigen: r.agente_origen_exten,
        agenteDestino: r.agente_destino_exten,
        estado: r.estado,
        inicio: toDateUTC(r.inicio),
        fin: toDateUTC(r.fin),
        ultimaActividad: toDateUTC(r.ultima_actividad),
      };
    });
    await convAgenteCol.insertMany(docs);
    console.log(`Migradas ${docs.length} conversaciones_agente.`);
  }

  // 6. Mensajes internos
  const mensajesInternosCol = await resetCollection("mensajes_internos", [
    { fields: { conversacionId: 1, ts: 1 } },
    { fields: { emisorExten: 1 } },
    { fields: { receptorExten: 1 } },
  ]);
  const [mensajesInternos] = await mysqlConn.execute(
    "SELECT * FROM mensajes_internos",
  );
  if (mensajesInternos.length) {
    await mensajesInternosCol.insertMany(
      mensajesInternos.map((r) => ({
        legacyId: r.id,
        conversacionId: convAgenteIdMap[r.conversacion_id] || r.conversacion_id,
        emisorExten: r.emisor_exten,
        receptorExten: r.receptor_exten,
        mensaje: r.mensaje,
        tipo: r.tipo,
        ts: toDateUTC(r.ts),
        archivoUrl: r.archivo_url,
        leidoEn: toDateUTC(r.leido_en),
      })),
    );
    console.log(`Migrados ${mensajesInternos.length} mensajes_internos.`);
  }

  // 7. Tipificaciones (indexadas por id_conversacion)
  const [tipifs] = await mysqlConn.execute("SELECT * FROM idTipificaciones");
  const tipifMap = {};
  for (const t of tipifs) {
    tipifMap[String(t.id_conversacion)] = {
      texto: t.tipificacion,
      observacion: t.observacion,
    };
  }

  // 8. Conversaciones (clientes)
  const conversacionesCol = await resetCollection("conversaciones", [
    { fields: { legacyId: 1 }, options: { unique: true } },
    { fields: { contactoId: 1 } },
    { fields: { agenteId: 1 } },
    { fields: { estado: 1 } },
    { fields: { origen: 1 } },
    { fields: { inicio: 1 } },
    {
      fields: { agenteId: 1, telefono: 1, salaId: 1 },
      options: { unique: true, sparse: true },
    },
  ]);
  const [convs] = await mysqlConn.execute("SELECT * FROM conversaciones");
  const convIdMap = {};
  if (convs.length) {
    const docs = convs.map((r) => {
      const oid = new ObjectId();
      convIdMap[r.id] = oid;
      const tipif = tipifMap[String(r.id)];
      return {
        _id: oid,
        legacyId: r.id,
        contactoId: r.contacto_id,
        agenteId: r.agente_id,
        estado: r.estado,
        estadoConexion: r.estado_conexion,
        marca: r.marca,
        inicio: toDateUTC(r.inicio),
        fin: toDateUTC(r.fin),
        tipificacion: tipif,
        etiquetas: parseEtiquetas(r.etiqueta, r.color),
        etiqueta2: r.etiqueta_2,
        observaciones: r.observaciones,
        origen: r.origen,
        telefono: r.telefono,
        salaId: r.sala_id,
        cola: r.cola,
      };
    });
    await conversacionesCol.insertMany(docs);
    console.log(`Migradas ${docs.length} conversaciones.`);
  }

  // 9. Mensajes
  const mensajesCol = await resetCollection("mensajes", [
    { fields: { conversacionId: 1, ts: 1 } },
    { fields: { legacyId: 1 } },
  ]);
  const [mensajes] = await mysqlConn.execute("SELECT * FROM mensajes");
  if (mensajes.length) {
    const BATCH = 500;
    let total = 0;
    let batch = [];
    for (const r of mensajes) {
      const legacyConv = r.conversacion_id;
      const convOid = convIdMap[legacyConv] || legacyConv;
      batch.push({
        legacyId: r.id,
        conversacionId: convOid,
        emisor: r.emisor,
        mensaje: r.mensaje,
        tipo: r.tipo,
        ts: toDateUTC(r.ts),
        archivoUrl: r.archivo_url,
        origen: r.origen,
      });
      if (batch.length >= BATCH) {
        await mensajesCol.insertMany(batch);
        total += batch.length;
        batch = [];
      }
    }
    if (batch.length) {
      await mensajesCol.insertMany(batch);
      total += batch.length;
    }
    console.log(`Migrados ${total} mensajes.`);
  }

  await mysqlConn.end();
  await mongoose.disconnect();
  console.log("\n✅ Migración completada exitosamente.");
}

main().catch((err) => {
  console.error("Error en la migración:", err);
  process.exit(1);
});
