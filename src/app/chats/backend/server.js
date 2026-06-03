const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const chatRoutes = require("./chatapp/routes/chat.routes");
const usuarioRoutes = require("./chatapp/routes/usuario.routes");
const contactMongoRoutes = require("./chatapp/routes/contact.mongo.routes");
const conversationMongoRoutes = require("./chatapp/routes/conversation.mongo.routes");
const chatController = require("./chatapp/controllers/chat.controller");
const chatUtils = require("./chatapp/utils/chatUtils");
// const { createDbPoolBundle } = require("./chatapp/config/db");
const { connectMongo } = require("./chatapp/config/db.mongo");
const ChatModelMongo = require("./chatapp/models/ChatModel.mongo");
const ChatRuntimeService = require("./chatapp/services/chatRuntime.service");
const ChatSocketHandler = require("./chatapp/websocketHandlers/ChatSocketHandler");

let PORT = Number(process.env.SOCKET_PORT || 3001);
const MAX_PORT_TRIES = 10;
let portTries = 0;
const FRONT_ORIGIN = process.env.FRONT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: FRONT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "chat-backend", ts: Date.now() });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONT_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Conectar a MongoDB al iniciar el servidor
connectMongo().catch(console.error);

// Usar modelo MongoDB para toda la lógica de chat
const chatModel = new ChatModelMongo();
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
app.use("/", chatRoutes);
app.use("/api", usuarioRoutes);
app.use("/api/contacts", contactMongoRoutes);
app.use("/api/conversations", conversationMongoRoutes);

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

function startServer() {
  server.listen(PORT, () => {
    console.log(`Chat backend escuchando en http://localhost:${PORT}`);
    console.log(`Socket.IO listo (CORS origen: ${FRONT_ORIGIN})`);
  });
}

connectMongo().then(() => {
  startServer();
});

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
