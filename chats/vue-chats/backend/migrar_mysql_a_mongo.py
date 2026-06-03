"""
Migración: omnicanalidad (MariaDB/MySQL) → MongoDB
Requiere:
  pip install pymysql pymongo python-dotenv

Variables de entorno (.env):
  MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB
  MONGO_URI, MONGO_DB
"""

import os
import re
from datetime import timezone
from dotenv import load_dotenv
import pymysql
import pymysql.cursors
from pymongo import MongoClient, UpdateOne, ASCENDING
from bson import ObjectId

load_dotenv()

def get_mysql():
    return pymysql.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        port=int(os.getenv("MYSQL_PORT", 3306)),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", ""),
        database=os.getenv("MYSQL_DB", "omnicanalidad"),
        cursorclass=pymysql.cursors.DictCursor,
        charset="utf8mb4",
    )

def get_mongo():
    client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"))
    return client[os.getenv("MONGO_DB", "omnicanalidad")]

def parse_etiquetas(etiqueta_str, color_str):
    if not etiqueta_str:
        return []
    nombres = [n.strip() for n in etiqueta_str.split("|") if n.strip()]
    colores = [c.strip() for c in (color_str or "").split("|") if c.strip()]
    return [
        {"nombre": n, "color": colores[i] if i < len(colores) else None}
        for i, n in enumerate(nombres)
    ]

def to_utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

def migrate_etiquetas(mysql_conn, mongo_db):
    print("→ Migrando etiquetas...")
    col = mongo_db["etiquetas"]
    col.drop()
    col.create_index([("nombre", ASCENDING)], unique=True)
    with mysql_conn.cursor() as cur:
        cur.execute("SELECT * FROM etiquetas")
        rows = cur.fetchall()
    docs = [
        {
            "legacyId": r["id"],
            "nombre": r["nombre"],
            "color": r["color"],
        }
        for r in rows
    ]
    if docs:
        col.insert_many(docs)
    print(f"   {len(docs)} etiquetas insertadas.")

def migrate_entrantes(mysql_conn, mongo_db):
    print("→ Migrando entrantesId...")
    col = mongo_db["entrantes"]
    col.drop()
    col.create_index([("numero", ASCENDING)], unique=True)
    with mysql_conn.cursor() as cur:
        cur.execute("SELECT * FROM entrantesId")
        rows = cur.fetchall()
    docs = [
        {
            "legacyId": r["id"],
            "mensajeId": r["mensaje_id"],
            "numero": r["numero"],
        }
        for r in rows
    ]
    if docs:
        col.insert_many(docs)
    print(f"   {len(docs)} entrantesId insertados.")

def migrate_estados_conexion(mysql_conn, mongo_db):
    print("→ Migrando estados_conexion...")
    col = mongo_db["estados_conexion"]
    col.drop()
    col.create_index([("usuario", ASCENDING)], unique=True)
    with mysql_conn.cursor() as cur:
        cur.execute("SELECT * FROM estados_conexion")
        rows = cur.fetchall()
    docs = [
        {
            "legacyId": r["id"],
            "usuario": r["usuario"],
            "estado": r["estado"],
            "fechaActualizacion": to_utc(r["fecha_actualizacion"]),
        }
        for r in rows
    ]
    if docs:
        col.insert_many(docs)
    print(f"   {len(docs)} estados insertados.")

def migrate_respuestas_rapidas(mysql_conn, mongo_db):
    print("→ Migrando respuestas_rapidas...")
    col = mongo_db["respuestas_rapidas"]
    col.drop()
    col.create_index([("agenteId", ASCENDING), ("comando", ASCENDING)], unique=True)
    with mysql_conn.cursor() as cur:
        cur.execute("SELECT * FROM respuestas_rapidas")
        rows = cur.fetchall()
    docs = [
        {
            "legacyId": r["id"],
            "agenteId": r["agente_id"],
            "comando": r["comando"],
            "respuesta": r["respuesta"],
            "createdAt": to_utc(r["created_at"]),
        }
        for r in rows
    ]
    if docs:
        col.insert_many(docs)
    print(f"   {len(docs)} respuestas rápidas insertadas.")

def migrate_conversaciones_agente(mysql_conn, mongo_db):
    print("→ Migrando conversaciones_agente...")
    col = mongo_db["conversaciones_agente"]
    col.drop()
    col.create_index([("salaInternaKey", ASCENDING)], unique=True)
    col.create_index([("agenteOrigen", ASCENDING)])
    col.create_index([("agenteDestino", ASCENDING)])
    with mysql_conn.cursor() as cur:
        cur.execute("SELECT * FROM conversaciones_agente")
        rows = cur.fetchall()
    id_map = {}
    docs = []
    for r in rows:
        oid = ObjectId()
        id_map[r["id"]] = oid
        docs.append({
            "_id": oid,
            "legacyId": r["id"],
            "salaInternaKey": r["sala_interna_key"],
            "agenteOrigen": r["agente_origen_exten"],
            "agenteDestino": r["agente_destino_exten"],
            "estado": r["estado"],
            "inicio": to_utc(r["inicio"]),
            "fin": to_utc(r["fin"]),
            "ultimaActividad": to_utc(r["ultima_actividad"]),
        })
    if docs:
        col.insert_many(docs)
    print(f"   {len(docs)} conversaciones_agente insertadas.")
    return id_map

def migrate_mensajes_internos(mysql_conn, mongo_db, conv_agente_id_map):
    print("→ Migrando mensajes_internos...")
    col = mongo_db["mensajes_internos"]
    col.drop()
    col.create_index([("conversacionId", ASCENDING), ("ts", ASCENDING)])
    col.create_index([("emisorExten", ASCENDING)])
    col.create_index([("receptorExten", ASCENDING)])
    with mysql_conn.cursor() as cur:
        cur.execute("SELECT * FROM mensajes_internos")
        rows = cur.fetchall()
    docs = [
        {
            "legacyId": r["id"],
            "conversacionId": conv_agente_id_map.get(r["conversacion_id"], r["conversacion_id"]),
            "emisorExten": r["emisor_exten"],
            "receptorExten": r["receptor_exten"],
            "mensaje": r["mensaje"],
            "tipo": r["tipo"],
            "ts": to_utc(r["ts"]),
            "archivoUrl": r["archivo_url"],
            "leidoEn": to_utc(r["leido_en"]),
        }
        for r in rows
    ]
    if docs:
        col.insert_many(docs)
    print(f"   {len(docs)} mensajes_internos insertados.")

def migrate_conversaciones(mysql_conn, mongo_db):
    print("→ Migrando conversaciones...")
    with mysql_conn.cursor() as cur:
        cur.execute("SELECT * FROM idTipificaciones")
        tipifs_raw = cur.fetchall()
    tipif_map = {
        str(t["id_conversacion"]): {
            "texto": t["tipificacion"],
            "observacion": t["observacion"],
        }
        for t in tipifs_raw
    }
    col = mongo_db["conversaciones"]
    col.drop()
    col.create_index([("legacyId", ASCENDING)], unique=True)
    col.create_index([("contactoId", ASCENDING)])
    col.create_index([("agenteId", ASCENDING)])
    col.create_index([("estado", ASCENDING)])
    col.create_index([("origen", ASCENDING)])
    col.create_index([("inicio", ASCENDING)])
    col.create_index([("agenteId", ASCENDING), ("telefono", ASCENDING), ("salaId", ASCENDING)], unique=True, sparse=True)
    with mysql_conn.cursor() as cur:
        cur.execute("SELECT * FROM conversaciones")
        rows = cur.fetchall()
    id_map = {}
    docs = []
    for r in rows:
        oid = ObjectId()
        id_map[r["id"]] = oid
        key = str(r["id"])
        tipif = tipif_map.get(key)
        docs.append({
            "_id": oid,
            "legacyId": r["id"],
            "contactoId": r["contacto_id"],
            "agenteId": r["agente_id"],
            "estado": r["estado"],
            "estadoConexion": r["estado_conexion"],
            "marca": r["marca"],
            "inicio": to_utc(r["inicio"]),
            "fin": to_utc(r["fin"]),
            "tipificacion": tipif,
            "etiquetas": parse_etiquetas(r["etiqueta"], r["color"]),
            "etiqueta2": r["etiqueta_2"],
            "observaciones": r["observaciones"],
            "origen": r["origen"],
            "telefono": r["telefono"],
            "salaId": r["sala_id"],
            "cola": r["cola"],
        })
    if docs:
        col.insert_many(docs)
    print(f"   {len(docs)} conversaciones insertadas.")
    return id_map

def migrate_mensajes(mysql_conn, mongo_db, conv_id_map):
    print("→ Migrando mensajes...")
    col = mongo_db["mensajes"]
    col.drop()
    col.create_index([("conversacionId", ASCENDING), ("ts", ASCENDING)])
    col.create_index([("legacyId", ASCENDING)])
    with mysql_conn.cursor() as cur:
        cur.execute("SELECT * FROM mensajes")
        rows = cur.fetchall()
    BATCH = 500
    total = 0
    batch = []
    for r in rows:
        legacy_conv = r["conversacion_id"]
        conv_oid = conv_id_map.get(legacy_conv, legacy_conv)
        batch.append({
            "legacyId": r["id"],
            "conversacionId": conv_oid,
            "emisor": r["emisor"],
            "mensaje": r["mensaje"],
            "tipo": r["tipo"],
            "ts": to_utc(r["ts"]),
            "archivoUrl": r["archivo_url"],
            "origen": r["origen"],
        })
        if len(batch) >= BATCH:
            col.insert_many(batch)
            total += len(batch)
            batch = []
    if batch:
        col.insert_many(batch)
        total += len(batch)
    print(f"   {total} mensajes insertados.")

def main():
    print("=== Migración MySQL → MongoDB: omnicanalidad ===\n")
    mysql = get_mysql()
    mongo = get_mongo()
    try:
        migrate_etiquetas(mysql, mongo)
        migrate_entrantes(mysql, mongo)
        migrate_estados_conexion(mysql, mongo)
        migrate_respuestas_rapidas(mysql, mongo)
        conv_agente_map = migrate_conversaciones_agente(mysql, mongo)
        migrate_mensajes_internos(mysql, mongo, conv_agente_map)
        conv_map = migrate_conversaciones(mysql, mongo)
        migrate_mensajes(mysql, mongo, conv_map)
        print("\n✅ Migración completada exitosamente.")
        print(f"   Base MongoDB: {mongo.name}")
        print(f"   Colecciones: {mongo.list_collection_names()}")
    finally:
        mysql.close()

if __name__ == "__main__":
    main()
