function registerChatSocket(io) {
  io.on('connection', (socket) => {
    socket.on('chat:join', (roomId = 'general') => {
      socket.join(roomId);
    });

    socket.on('chat:leave', (roomId = 'general') => {
      socket.leave(roomId);
    });

    socket.on('chat:message', (payload = {}) => {
      const roomId = payload.roomId || 'general';
      io.to(roomId).emit('chat:message', {
        ...payload,
        roomId,
        ts: Date.now(),
      });
    });
  });
}

module.exports = {
  registerChatSocket,
};
