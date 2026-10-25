// Servidor da Enquete 22 x 13.
//   painel ................ GET  /                 (so acesso local)
//   jogo (fonte do OBS) ... GET  /jogo
//   tempo real ............ GET  /events           (Server-Sent Events: placar, votos, sons, log)
//   API do painel ......... /api/*
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const log = require('./log');
const settings = require('./settings');
const poll = require('./poll');
const { TikTokMonitor } = require('./tiktok');

fs.mkdirSync(cfg.GIFT_AUDIO_DIR, { recursive: true });
const monitor = new TikTokMonitor();
poll.isLive = () => monitor.state.listening;
let stopped = true; // so conecta quando o streamer pedir

// ---------------------------------------------------------------- tempo real (SSE)
const clients = new Set();
function send(c, event, data) {
  c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function broadcast(event, data, onlyPanel = false) {
  for (const c of clients) if (!onlyPanel || c.panel) send(c, event, data);
}
const status = () => ({
  tiktok: { ...monitor.state, stopped },
  events: log.stats(),
  games: [...clients].filter((c) => !c.panel).length,
});

let dirty = true;
poll.on('dirty', () => (dirty = true));
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  broadcast('state', poll.snapshot());
}, 150);
setInterval(() => broadcast('status', status(), true), 2000);
for (const ev of ['vote', 'phase', 'sound', 'notice']) poll.on(ev, (d) => broadcast(ev, d));
log.onAdd((e) => broadcast('log', e, true));

// ---------------------------------------------------------------- TikTok -> enquete
monitor.on('chat', (d) => poll.onChat(d));
monitor.on('like', (d) => poll.onLike(d));
monitor.on('gift', (d) => poll.onGift(d));
monitor.on('status', (st) => {
  if (st.listening && settings.get().simulation) log.info('enquete', 'live conectada: a simulação para sozinha enquanto a live estiver ouvindo');
  broadcast('status', status(), true);
});

// ---------------------------------------------------------------- audios
const AUDIO_EXT = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.webm': 'audio/webm' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', ...AUDIO_EXT };
const isAudio = (f) => Boolean(AUDIO_EXT[path.extname(f).toLowerCase()]);
const listAudios = (dir) => {
  try {
    return fs.readdirSync(dir).filter(isAudio).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
};
// nome de arquivo seguro, sem pastas
const safeName = (n) =>
  path
    .basename(String(n || ''))
    .replace(/[^\w.\- ()]+/g, '_')
    .slice(0, 80);

// serve arquivo com suporte a Range (o <audio> do navegador pede pedacos)
function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, { ok: false });
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-cache' });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------------------------------------------------------------- API
const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const readRaw = (req, limit) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('arquivo grande demais'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
const readBody = async (req) => {
  try {
    return JSON.parse((await readRaw(req, 256 * 1024)).toString('utf8') || '{}');
  } catch {
    return {};
  }
};

const routes = {
  'GET /api/state': () => ({
    settings: settings.get(),
    catalog: settings.GIFT_CATALOG,
    status: status(),
    poll: poll.snapshot(),
    audios: listAudios(cfg.GIFT_AUDIO_DIR),
    music: { 22: listAudios(path.join(cfg.MUSIC_DIR, 'direita'))[0] || '', 13: listAudios(path.join(cfg.MUSIC_DIR, 'esquerda'))[0] || '' },
    recentGifts: [...poll.recentGifts.values()].sort((a, b) => b.last - a.last).slice(0, 30),
    logs: log.since(0).slice(-300),
    port: cfg.PORT,
  }),
  'POST /api/settings': (b) => {
    const s = settings.save(b);
    log.ok('painel', 'configurações salvas');
    dirty = true;
    return { ok: true, settings: s };
  },
  'POST /api/connect': (b) => {
    const name = String(b.username || settings.get().tiktokUsername || '').replace(/^@/, '').trim();
    if (!/^[\w.]{2,30}$/.test(name)) {
      log.warn('tiktok', 'informe um usuário do TikTok válido para conectar');
      return { ok: false, error: 'usuario invalido' };
    }
    settings.save({ tiktokUsername: name });
    stopped = false;
    monitor.start(name).catch((e) => log.error('tiktok', e.message));
    return { ok: true };
  },
  'POST /api/disconnect': () => {
    stopped = true;
    monitor.stop();
    monitor.state = { listening: false, error: '', username: monitor.state.username };
    log.warn('tiktok', 'desconectado da live pelo painel');
    broadcast('status', status(), true);
    return { ok: true };
  },
  'POST /api/round/start': () => (poll.start(), { ok: true }),
  'POST /api/round/end': () => (poll.end(), { ok: true }),
  'POST /api/round/stop': () => (poll.stop(), { ok: true }),
  'POST /api/votes': (b) => {
    const amount = Math.max(1, Math.min(100000, Math.round(Number(b.amount) || 1)));
    const ok = poll.addVotes(String(b.side), amount, { nickname: 'Painel' }, 'manual', `+${amount} pelo painel`);
    log.info('painel', ok ? `+${amount} votos no ${b.side}` : `+${amount} no ${b.side} quando a enquete começar`);
    return { ok: true };
  },
  // testa um presente como se tivesse chegado da live (usa as regras e o audio)
  'POST /api/test/gift': (b) => {
    const count = Math.max(1, Math.min(999, Math.round(Number(b.count) || 1)));
    const side = ['22', '13'].includes(String(b.side)) ? String(b.side) : '22';
    const user = { userId: 'teste-' + side, uniqueId: 'teste_' + side, nickname: `Teste (${side})`, avatarUrl: '' };
    poll.teams.set(user.userId, side);
    const coins = (settings.GIFT_CATALOG.find((g) => settings.giftKey(g.name) === settings.giftKey(b.name)) || {}).coins || 1;
    log.info('teste', `presente de teste: ${b.name} x${count} para o ${side}`);
    poll.onGift({ user, giftName: String(b.name || 'Rose'), count, coinValue: coins, totalCoins: coins * count });
    return { ok: true };
  },
  'POST /api/test/chat': (b) => {
    const user = { userId: 'teste-chat', uniqueId: 'teste_chat', nickname: 'Teste', avatarUrl: '' };
    poll.onChat({ user, comment: String(b.comment || '') });
    return { ok: true };
  },
  'POST /api/logs/clear': () => (log.clear(), { ok: true }),
};

async function handleApi(req, res, url) {
  // upload de audio: corpo cru, nome no ?name=
  if (req.method === 'POST' && url.pathname === '/api/audios') {
    const name = safeName(url.searchParams.get('name'));
    if (!name || !isAudio(name)) return json(res, 400, { ok: false, error: 'use mp3, wav, ogg, m4a, aac ou webm' });
    try {
      fs.writeFileSync(path.join(cfg.GIFT_AUDIO_DIR, name), await readRaw(req, 30 * 1024 * 1024));
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
    log.ok('painel', `áudio adicionado: ${name}`);
    return json(res, 200, { ok: true, name, audios: listAudios(cfg.GIFT_AUDIO_DIR) });
  }
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/audios/')) {
    const name = safeName(decodeURIComponent(url.pathname.slice('/api/audios/'.length)));
    try {
      fs.unlinkSync(path.join(cfg.GIFT_AUDIO_DIR, name));
      log.warn('painel', `áudio apagado: ${name}`);
    } catch {
      /* ja nao existia */
    }
    return json(res, 200, { ok: true, audios: listAudios(cfg.GIFT_AUDIO_DIR) });
  }
  const fn = routes[`${req.method} ${url.pathname}`];
  if (!fn) return json(res, 404, { ok: false });
  return json(res, 200, await fn(req.method === 'POST' ? await readBody(req) : {}, url));
}

// so a propria maquina (e a rede local, para o OBS em outro PC) acessa
const isLocal = (req) => /^(::1|127\.|::ffff:127\.|10\.|192\.168\.|::ffff:10\.|::ffff:192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::ffff:172\.(1[6-9]|2\d|3[01])\.)/.test(req.socket.remoteAddress || '');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (!isLocal(req)) return json(res, 403, { ok: false });
    const p = url.pathname;
    if (p === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      const c = { res, panel: url.searchParams.get('c') === 'panel' };
      clients.add(c);
      send(c, 'state', poll.snapshot());
      if (c.panel) send(c, 'status', status());
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(c);
      });
      return;
    }
    if (p.startsWith('/api/')) return await handleApi(req, res, url);
    if (p === '/' || p === '/painel') return sendFile(req, res, path.join(__dirname, 'panel.html'));
    if (p === '/jogo') return sendFile(req, res, path.join(cfg.PUBLIC_DIR, 'jogo.html'));
    if (p.startsWith('/assets/')) {
      const f = path.join(cfg.PUBLIC_DIR, path.normalize(decodeURIComponent(p)).replace(/^([\\/]|\.\.)+/, ''));
      if (!f.startsWith(cfg.PUBLIC_DIR)) return json(res, 403, { ok: false });
      return sendFile(req, res, f);
    }
    // musica de quem esta ganhando: /musica/direita (22) e /musica/esquerda (13)
    const m = /^\/musica\/(direita|esquerda)$/.exec(p);
    if (m) {
      const dir = path.join(cfg.MUSIC_DIR, m[1]);
      const f = listAudios(dir)[0];
      return f ? sendFile(req, res, path.join(dir, f)) : json(res, 404, { ok: false });
    }
    if (p.startsWith('/audios/')) return sendFile(req, res, path.join(cfg.GIFT_AUDIO_DIR, safeName(decodeURIComponent(p.slice(8)))));
    json(res, 404, { ok: false });
  } catch (e) {
    log.error('erro', `${req.method} ${url.pathname}: ${e.message}`);
    if (!res.headersSent) json(res, 500, { ok: false, error: e.message });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') log.error('erro', `a porta ${cfg.PORT} já está em uso. Feche o outro programa ou mude PORT em server\\.env`);
  else log.error('erro', e.message);
  process.exit(1);
});
server.listen(cfg.PORT, '0.0.0.0', () => {
  log.ok('painel', `painel: http://127.0.0.1:${cfg.PORT}   jogo (OBS): http://127.0.0.1:${cfg.PORT}/jogo`);
  poll.start();
  const u = settings.get().tiktokUsername;
  if (u) log.info('tiktok', `última live usada: @${u}. Clique em CONECTAR no painel quando estiver ao vivo`);
});
