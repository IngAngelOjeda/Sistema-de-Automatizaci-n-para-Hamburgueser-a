import { Server } from 'socket.io';
import { botState } from '../bot/state.js';

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    // Enviar estado actual del bot al cliente que recién se conecta
    socket.emit('bot_status', { status: botState.status, qr: botState.qr });
    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}
