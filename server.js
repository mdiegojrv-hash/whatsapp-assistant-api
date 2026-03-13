const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('baileys');
const QRCode = require('qrcode');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

let qrCode = null;
let socket = null;
let isConnected = false;
let messages = [];

// Rota para obter QR Code
app.get('/qr', async (req, res) => {
  if (qrCode) {
    res.json({ qr: qrCode });
  } else {
    res.json({ qr: null, status: 'Aguardando QR Code...' });
  }
});

// Rota para obter status
app.get('/status', (req, res) => {
  res.json({ 
    connected: isConnected,
    messagesCount: messages.length
  });
});

// Rota para obter mensagens
app.get('/messages', (req, res) => {
  res.json({ messages });
});

// Rota de saúde
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Inicializar WhatsApp
async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  
  socket = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      qrCode = await QRCode.toDataURL(qr);
      console.log('✅ QR Code gerado!');
    }

    if (connection === 'open') {
      isConnected = true;
      console.log('✅ WhatsApp conectado!');
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        startWhatsApp();
      }
    }
  });

  socket.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.key.fromMe) {
      messages.push({
        from: msg.key.remoteJid,
        text: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[Arquivo/Mídia]',
        timestamp: new Date(msg.messageTimestamp * 1000),
        id: msg.key.id
      });
      
      console.log(`📨 Mensagem recebida de ${msg.key.remoteJid}`);
    }
  });

  socket.ev.on('creds.update', saveCreds);
}

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  startWhatsApp();
});
