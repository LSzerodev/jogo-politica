// Log da live: guarda os ultimos eventos em memoria (o painel mostra em tempo
// real), escreve no console e em data/server.log.
//   tipos : tiktok | chat | gift | join | like | enquete | painel | teste | erro
//   niveis: info | ok | warn | error
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const MAX = 1500;
const entries = [];
const listeners = [];
let nextId = 1;
const counters = { chat: 0, gift: 0, like: 0, join: 0, share: 0, follow: 0, ignored: 0 };
let lastTiktokEventAt = 0;

fs.mkdirSync(DATA_DIR, { recursive: true });
const file = fs.createWriteStream(path.join(DATA_DIR, 'server.log'), { flags: 'a' });

function add(level, type, msg, data) {
  const e = { id: nextId++, t: Date.now(), level, type, msg: String(msg) };
  if (data !== undefined) e.data = data;
  entries.push(e);
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  const line = `${new Date(e.t).toLocaleTimeString('pt-BR')} [${type}] ${e.msg}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  file.write(line + '\n');
  for (const fn of listeners) fn(e);
  return e;
}

const info = (type, msg, data) => add('info', type, msg, data);
const ok = (type, msg, data) => add('ok', type, msg, data);
const warn = (type, msg, data) => add('warn', type, msg, data);
const error = (type, msg, data) => add('error', type, msg, data);

// conta eventos que chegam do TikTok (mesmo os ignorados), para o painel mostrar
function count(kind) {
  counters[kind] = (counters[kind] || 0) + 1;
  if (kind !== 'ignored') lastTiktokEventAt = Date.now();
}

const since = (id = 0) => entries.filter((e) => e.id > id);
const stats = () => ({ ...counters, lastTiktokEventAt });
const clear = () => {
  entries.length = 0;
};
const onAdd = (fn) => listeners.push(fn);

module.exports = { info, ok, warn, error, count, since, stats, clear, onAdd };
