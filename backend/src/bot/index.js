import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import P from 'pino';
import { rm } from 'fs/promises';
import { handleMessage } from './handlers.js';
import { botState } from './state.js';

function emitStatus(io, status, qr = null) {
  botState.status = status;
  botState.qr = qr;
  io.emit('bot_status', { status, qr });
}

// Convierte el mensaje crudo de Baileys a la estructura interna que usa handlers.js
function normalizeMessage(raw) {
  const from = resolveJid(raw.key.remoteJid);
  const fromMe = raw.key.fromMe || false;
  const msg = raw.message;

  if (!msg) return null;

  // Desenvolver wrappers de mensajes efímeros o de vista única
  const unwrapped = msg.ephemeralMessage?.message
    || msg.viewOnceMessageV2?.message
    || msg.viewOnceMessage?.message
    || msg;

  const msgType = Object.keys(unwrapped)[0];

  let body = '';
  let type = 'text';
  let lat = null;
  let lng = null;

  switch (msgType) {
    case 'conversation':
      body = unwrapped.conversation || '';
      break;
    case 'extendedTextMessage':
      body = unwrapped.extendedTextMessage?.text || '';
      break;
    case 'locationMessage':
      type = 'location';
      lat = unwrapped.locationMessage?.degreesLatitude ?? null;
      lng = unwrapped.locationMessage?.degreesLongitude ?? null;
      break;
    default:
      console.log(`[Bot] Tipo de mensaje ignorado: ${msgType} de ${from}`);
      return null;
  }

  return {
    from,
    fromMe,
    body,
    type,
    lat,
    lng,
    isGroupMsg: from?.endsWith('@g.us') || false,
    sender: { pushname: raw.pushName || '' },
    t: Number(raw.messageTimestamp),
  };
}

// Mapa persistente de LID → JID real (e.g. "21741225136297@lid" → "595981123456@s.whatsapp.net")
const lidMap = new Map();

function resolveJid(jid) {
  if (jid?.endsWith('@lid') && lidMap.has(jid)) {
    return lidMap.get(jid);
  }
  return jid;
}

export async function initBot(io) {
  emitStatus(io, 'connecting');

  const { state, saveCreds } = await useMultiFileAuthState(
    process.env.WA_SESSION_PATH || './wa-session'
  );

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: P({ level: 'silent' }),
  });

  // Adaptador con la misma API que usamos en handlers.js
  const client = {
    sendText: (jid, text) => sock.sendMessage(jid, { text }),
  };

  botState.client = client;

  sock.ev.on('creds.update', saveCreds);

  // Construir el mapa LID → JID real a medida que llegan contactos
  sock.ev.on('contacts.upsert', (contacts) => {
    for (const c of contacts) {
      if (c.id && c.lid) {
        lidMap.set(c.lid, c.id);
      }
    }
  });

  sock.ev.on('connection.update', async (update) => {
    try {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const base64 = await QRCode.toDataURL(qr);
        emitStatus(io, 'qr', base64);
      }

      if (connection === 'open') {
        console.log('[Bot] WhatsApp conectado y listo.');
        emitStatus(io, 'connected');
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          console.warn('[Bot] Sesión cerrada. Eliminando credenciales y generando nuevo QR...');
          const sessionPath = process.env.WA_SESSION_PATH || './wa-session';
          await rm(sessionPath, { recursive: true, force: true });
          setTimeout(() => initBot(io), 1000);
        } else {
          console.log('[Bot] Reconectando en 5s...');
          setTimeout(() => initBot(io), 5000);
        }
      }
    } catch (err) {
      console.error('[Bot] Error en connection.update:', err);
      setTimeout(() => initBot(io), 5000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const raw of messages) {
      const message = normalizeMessage(raw);
      if (!message) continue;

      const now = Math.floor(Date.now() / 1000);
      if (now - message.t > 30) continue;

      handleMessage(client, message, io).catch((err) =>
        console.error('[Bot] Error handling message:', err)
      );
    }
  });

  return sock;
}
