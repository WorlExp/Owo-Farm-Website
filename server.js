const express = require('express');
const path = require('path');
const { Client } = require('discord.js-selfbot-v13');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const PANEL_KEY = process.env.PANEL_KEY || 'degistir-bunu';  // Panele giriş şifresi
const OWO_BOT_ID = process.env.OWO_BOT_ID || '408785106942164992';
const BASLANGIC = parseInt(process.env.BASLANGIC_COOLDOWN || '15', 10);
const ARTIS = parseInt(process.env.COOLDOWN_ARTIS || '1', 10);
const KOMUTLAR = (process.env.KOMUTLAR || 'owo hunt,owo battle,owo pray')
  .split(',').map(k => k.trim()).filter(Boolean);

// { token: { client, cooldown, muteUntil, kanalId, durum, user } }
const hesaplar = new Map();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// -------------------------------------------------------------------
// TEK BİR HESABI BAŞLAT
// -------------------------------------------------------------------
async function hesapBaslat(token, kanalId) {
  if (hesaplar.has(token)) {
    throw new Error('Bu token zaten ekli.');
  }

  const client = new Client({ checkUpdate: false });
  const kayit = {
    client,
    cooldown: BASLANGIC,
    muteUntil: 0,
    kanalId,
    durum: 'bağlanıyor',
    user: null,
  };
  hesaplar.set(token, kayit);

  let cooldownDegisken = BASLANGIC;
  let muteUntil = 0;

  client.on('ready', async () => {
    kayit.user = client.user.tag;
    kayit.durum = 'çalışıyor';
    console.log(`[SELF] ${client.user.tag} giriş yaptı`);

    const kanal = await client.channels.fetch(kanalId).catch(() => null);
    if (!kanal) {
      console.log(`[SELF] ${client.user.tag} kanal bulunamadı: ${kanalId}`);
      kayit.durum = 'kanal yok';
      return;
    }
    console.log(`[SELF] ${client.user.tag} → #${kanal.name}`);
    kasDongusu(client, kanal, kayit);
  });

  client.on('messageCreate', (message) => {
    if (message.author.id !== OWO_BOT_ID) return;
    const icerik = message.content.toLowerCase();
    const now = Date.now();

    const cdMatch = icerik.match(/in (\d+)\s*seconds/);
    if (cdMatch) console.log(`[OWO/${kayit.user}] cooldown: ${cdMatch[1]}s`);

    if (icerik.includes('muted')) {
      const m = icerik.match(/muted for (\d+)\s*(minute|second|hour|min|sec)/);
      if (m) {
        const adet = parseInt(m[1], 10);
        const brm = m[2];
        let sn;
        if (brm.includes('hour')) sn = adet * 3600;
        else if (brm.includes('min')) sn = adet * 60;
        else sn = adet;
        kayit.muteUntil = now + sn * 1000;
        console.log(`[OWO/${kayit.user}] MUTE: ${sn}s`);
      } else {
        kayit.muteUntil = now + 300 * 1000;
        console.log(`[OWO/${kayit.user}] MUTE (süresiz): 300s`);
      }
    }

    if (icerik.includes("you can't use") || icerik.includes('slow down')) {
      kayit.muteUntil = now + 5000;
    }
  });

  client.on('error', (e) => {
    console.log(`[SELF/${kayit.user}] hata: ${e.message}`);
    kayit.durum = 'hata';
  });

  await client.login(token);
  return kayit;
}

// -------------------------------------------------------------------
// KASMA DÖNGÜSÜ (her hesap için ayrı çalışır)
// -------------------------------------------------------------------
async function kasDongusu(client, kanal, kayit) {
  while (client.isReady()) {
    const now = Date.now();
    if (now < kayit.muteUntil) {
      await sleep(kayit.muteUntil - now);
      continue;
    }
    await sleep(kayit.cooldown * 1000);
    if (Date.now() < kayit.muteUntil) continue;

    const komut = KOMUTLAR[Math.floor(Math.random() * KOMUTLAR.length)];
    try {
      await kanal.send(komut);
      console.log(`[${kayit.user}] → ${komut} (cd=${kayit.cooldown}s)`);
    } catch (e) {
      console.log(`[${kayit.user}] gönderim hatası: ${e.message}`);
      await sleep(5000);
      continue;
    }
    kayit.cooldown += ARTIS;
    await sleep(2000);
  }
}

// -------------------------------------------------------------------
// API
// -------------------------------------------------------------------
function auth(req, res, next) {
  const key = req.headers['x-panel-key'] || req.body?.panelKey;
  if (key !== PANEL_KEY) return res.status(401).json({ error: 'Yetkisiz' });
  next();
}

app.post('/api/add', auth, async (req, res) => {
  const { token, kanalId } = req.body;
  if (!token || !kanalId) return res.json({ error: 'token ve kanalId zorunlu' });
  try {
    await hesapBaslat(token, kanalId);
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/remove', auth, async (req, res) => {
  const { token } = req.body;
  const k = hesaplar.get(token);
  if (!k) return res.json({ error: 'Yok' });
  try { await k.client.destroy(); } catch {}
  hesaplar.delete(token);
  res.json({ ok: true });
});

app.get('/api/list', auth, (req, res) => {
  const liste = [];
  for (const [token, k] of hesaplar.entries()) {
    liste.push({
      tokenSon: token.slice(-8),
      tokenTam: token,
      user: k.user,
      kanalId: k.kanalId,
      durum: k.durum,
      cooldown: k.cooldown,
    });
  }
  res.json({ hesaplar: liste });
});

app.listen(PORT, () => {
  console.log(`[PANEL] http://localhost:${PORT}`);
});
