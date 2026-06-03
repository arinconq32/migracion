const http = require("http");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const chatRoutes = require("./chatapp/routes/chat.routes");
const usuarioRoutes = require("./chatapp/routes/usuario.routes");
const contactMongoRoutes = require("./chatapp/routes/contact.mongo.routes");
const conversationMongoRoutes = require("./chatapp/routes/conversation.mongo.routes");
const mediaRoutes = require("./chatapp/routes/media.routes");
const uploadRoutes = require("./chatapp/routes/upload.routes");
const chatController = require("./chatapp/controllers/chat.controller");
const chatUtils = require("./chatapp/utils/chatUtils");
const { connectMongo } = require("./chatapp/config/db.mongo");
const redisClient = require("./chatapp/config/redis");
const ChatModelMongo = require("./chatapp/models/ChatModel.mongo");
const InMemoryChatModel = require("./chatapp/models/InMemoryChatModel");
const ChatRuntimeService = require("./chatapp/services/chatRuntime.service");
const ChatSocketHandler = require("./chatapp/websocketHandlers/ChatSocketHandler");

let PORT = Number(process.env.SOCKET_PORT || 3001);
const MAX_PORT_TRIES = 10;
let portTries = 0;
const FRONT_ORIGIN = process.env.FRONT_ORIGIN || "http://localhost:3000,http://localhost:5173";
const ALLOWED_ORIGINS = FRONT_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  "/storage/chat-files",
  express.static(path.resolve(__dirname, "storage/chat-files"), {
    setHeaders(res) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    },
  }),
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "chat-backend", ts: Date.now() });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

let chatModel;

function bootWithModel(model, label) {
  chatModel = model;
  global.chatModel = chatModel;

  const getCacheFn = null;
  const setCacheFn = null;
  chatUtils.setInstances(io, chatModel);

  const runtimeService = new ChatRuntimeService({
    io,
    chatModel,
    chatUtils,
    maxActive: 3,
  });

  chatController.setRuntimeService(runtimeService);
  app.use("/", uploadRoutes);
  app.use("/", chatRoutes);
  app.use("/api", usuarioRoutes);
  app.use("/api/contacts", contactMongoRoutes);
  app.use("/api/conversations", conversationMongoRoutes);
  app.use("/api/media", mediaRoutes);

  const socketHandler = new ChatSocketHandler(
    io,
    chatModel,
    chatUtils,
    null,
    null,
    {
      maxActive: 3,
      runtimeService,
    },
  );

  socketHandler.getCache = getCacheFn;
  socketHandler.setCache = setCacheFn;

  io.on("connection", (socket) => {
    socketHandler.handleConnection(socket);
  });

  server.listen(PORT, () => {
    console.log(`Chat backend escuchando en http://localhost:${PORT}`);
    console.log(`Socket.IO listo (CORS origenes: ${ALLOWED_ORIGINS.join(", ")})`);
    console.log(`Modelo activo: ${label}`);
  });
}

async function clearStaleConversationCache() {
  try {
    const keys = await redisClient.keys("conversaciones:*");
    if (keys?.length) {
      await redisClient.del(keys);
      console.log(`Cache Redis limpiada (${keys.length} claves conversaciones)`);
    }
  } catch (err) {
    console.warn("No se pudo limpiar cache Redis:", err.message);
  }
}

async function startServer() {
  try {
    await connectMongo();
    await clearStaleConversationCache();
    bootWithModel(new ChatModelMongo(), "mongo");
  } catch (error) {
    console.error("No se pudo conectar a MongoDB, usando memoria:", error.message);
    bootWithModel(
      new InMemoryChatModel({
        maxActive: Number(process.env.MAX_ACTIVE_CONVERSATIONS || 3),
      }),
      "memory",
    );
  }
}

startServer();

// Manejar error de puerto en uso
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    portTries++;
    if (portTries < MAX_PORT_TRIES) {
      console.warn(
        `\u26A0\uFE0F El puerto ${PORT} está en uso. Intentando con el puerto ${PORT + 1}...`,
      );
      PORT++;
      setTimeout(() => startServer(), 500);
    } else {
      console.error(
        `\u274C No se pudo encontrar un puerto libre después de ${MAX_PORT_TRIES} intentos.`,
      );
      process.exit(1);
    }
  } else {
    throw err;
  }
});
