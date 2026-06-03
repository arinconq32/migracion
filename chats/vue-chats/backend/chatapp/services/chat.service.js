// Obtener motivos de cierre desde MongoDB
async function getMotivosCierre() {
  if (typeof global.chatModel?.getMotivosCierre === "function") {
    return await global.chatModel.getMotivosCierre();
  }
  return [];
}
const messages = [];

function getMessages() {
  return messages;
}

function sendMessage({ userId, text, roomId }) {
  const message = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    roomId,
    text,
    createdAt: new Date().toISOString(),
  };

  messages.push(message);
  return message;
}

module.exports = {
  getMessages,
  sendMessage,
  getMotivosCierre,
};
