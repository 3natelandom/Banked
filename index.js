const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
let lastQr = null;

// قاعدة بيانات البنك
const dbFile = './bank_db.json';
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({}));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_auth');
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) lastQr = await QRCode.toDataURL(qr);
        if (connection === 'open') {
            console.log('✅ تم الاتصال بنجاح!');
            lastQr = null;
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const remoteJid = msg.key.remoteJid;
        const sender = msg.key.participant || remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();

        let db = JSON.parse(fs.readFileSync(dbFile));
        if (!db[sender]) db[sender] = { balance: 1000 };

        if (text === 'بنك') {
            await sock.sendMessage(remoteJid, { text: `💰 رصيدك: ${db[sender].balance} ريال` }, { quoted: msg });
        }
        if (text === 'راتب') {
            db[sender].balance += 500;
            fs.writeFileSync(dbFile, JSON.stringify(db));
            await sock.sendMessage(remoteJid, { text: '✅ أخدت 500 ريال راتب.' }, { quoted: msg });
        }
    });
}

// صفحة الويب لعرض الـ QR
app.get('/', (req, res) => {
    if (lastQr) {
        res.send(`<html><body style="background:#000;display:flex;justify-content:center;align-items:center;height:100vh;"><div style="background:#fff;padding:20px;border-radius:10px;text-align:center;"><img src="${lastQr}"><h2 style="font-family:sans-serif;">Scan Me</h2></div></body></html>`);
    } else {
        res.send('<h1>البوت شغال أو جاري التحميل...</h1>');
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    startBot();
});
