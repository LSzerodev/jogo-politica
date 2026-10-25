// Configuracoes que o streamer muda pelo painel. Ficam em data/settings.json.
const fs = require('fs');
const path = require('path');
const { DATA_DIR, TIKTOK_USERNAME } = require('./config');

const FILE = path.join(DATA_DIR, 'settings.json');

// Presentes comuns: "name" e o nome que o TikTok manda no evento; "pt" e como
// aparece no app em portugues (tambem aceito na hora de comparar).
const GIFT_CATALOG = [
  { name: 'Rose', pt: 'Rosa', coins: 1 },
  { name: 'TikTok', pt: 'TikTok', coins: 1 },
  { name: 'GG', pt: 'GG', coins: 1 },
  { name: 'Ice Cream Cone', pt: 'Sorvete', coins: 1 },
  { name: 'Heart Me', pt: 'Coração', coins: 1 },
  { name: 'Finger Heart', pt: 'Coração de dedo', coins: 5 },
  { name: 'Friendship Necklace', pt: 'Colar da amizade', coins: 10 },
  { name: 'Perfume', pt: 'Perfume', coins: 20 },
  { name: 'Doughnut', pt: 'Rosquinha', coins: 30 },
  { name: 'Hand Hearts', pt: 'Mãos de coração', coins: 100 },
  { name: 'Confetti', pt: 'Confete', coins: 100 },
  { name: 'Sunglasses', pt: 'Óculos de sol', coins: 199 },
  { name: 'Corgi', pt: 'Corgi', coins: 299 },
  { name: 'Money Gun', pt: 'Arma de dinheiro', coins: 500 },
  { name: 'Galaxy', pt: 'Galáxia', coins: 1000 },
  { name: 'Lion', pt: 'Leão', coins: 29999 },
  { name: 'Universe', pt: 'Universo', coins: 34999 },
];

const DEFAULTS = {
  tiktokUsername: TIKTOK_USERNAME,
  round: { duration: 60, autoRestart: true, restartDelay: 8 },
  sides: {
    22: { label: 'Flávio', keywords: ['22', 'flavio', 'bolsonaro'] },
    13: { label: 'Lula', keywords: ['13', 'lula'] },
  },
  chat: { votes: 1, cooldown: 0 },
  likes: { every: 10, votes: 1 },
  // side: "user" = vai para o lado em que a pessoa votou no chat; "22" ou "13" = sempre esse lado
  gifts: [{ name: 'Rose', aliases: 'Rosa', votes: 10, side: 'user', audio: '', volume: 100 }],
  otherGifts: { votesPerCoin: 10, side: 'user' },
  audio: { music: 80, gifts: 100 },
  simulation: true,
};

const clampN = (v, min, max, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
};
const sideOf = (v, d = 'user') => (['user', '22', '13'].includes(String(v)) ? String(v) : d);
const words = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(','))
    .map((w) => String(w).trim())
    .filter(Boolean)
    .slice(0, 20);

// aceita qualquer coisa vinda do painel e devolve um objeto valido
function normalize(s) {
  const d = DEFAULTS;
  s = s && typeof s === 'object' ? s : {};
  const r = s.round || {}, c = s.chat || {}, l = s.likes || {}, o = s.otherGifts || {}, a = s.audio || {}, sd = s.sides || {};
  return {
    tiktokUsername: String(s.tiktokUsername ?? d.tiktokUsername).replace(/^@/, '').trim().slice(0, 40),
    round: {
      duration: clampN(r.duration, 0, 3600, d.round.duration),
      autoRestart: r.autoRestart === undefined ? d.round.autoRestart : Boolean(r.autoRestart),
      restartDelay: clampN(r.restartDelay, 3, 600, d.round.restartDelay),
    },
    sides: Object.fromEntries(
      ['22', '13'].map((k) => {
        const x = sd[k] || {};
        return [k, { label: String(x.label ?? d.sides[k].label).slice(0, 30), keywords: x.keywords === undefined ? d.sides[k].keywords : words(x.keywords) }];
      })
    ),
    chat: { votes: clampN(c.votes, 0, 1000, d.chat.votes), cooldown: clampN(c.cooldown, 0, 600, d.chat.cooldown) },
    likes: { every: clampN(l.every, 0, 10000, d.likes.every), votes: clampN(l.votes, 0, 1000, d.likes.votes) },
    gifts: (Array.isArray(s.gifts) ? s.gifts : d.gifts)
      .filter((g) => g && String(g.name || '').trim())
      .slice(0, 100)
      .map((g) => ({
        name: String(g.name).trim().slice(0, 60),
        aliases: String(g.aliases || '').slice(0, 200),
        votes: clampN(g.votes, 0, 1000000, 10),
        side: sideOf(g.side),
        audio: path.basename(String(g.audio || '')),
        volume: clampN(g.volume, 0, 100, 100),
      })),
    otherGifts: { votesPerCoin: clampN(o.votesPerCoin, 0, 10000, d.otherGifts.votesPerCoin), side: sideOf(o.side) },
    audio: { music: clampN(a.music, 0, 100, d.audio.music), gifts: clampN(a.gifts, 0, 100, d.audio.gifts) },
    simulation: s.simulation === undefined ? d.simulation : Boolean(s.simulation),
  };
}

let current = normalize(DEFAULTS);
try {
  current = normalize(JSON.parse(fs.readFileSync(FILE, 'utf8')));
} catch {
  /* primeira vez: fica o padrao */
}

const get = () => current;
function save(next) {
  current = normalize({ ...current, ...next });
  fs.writeFileSync(FILE, JSON.stringify(current, null, 2));
  return current;
}

// "Ice Cream Cone" -> "icecreamcone", "Coração" -> "coracao"
const giftKey = (name) =>
  String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

function ruleFor(giftName) {
  const k = giftKey(giftName);
  return current.gifts.find((g) => [g.name, ...g.aliases.split(',')].some((n) => n.trim() && giftKey(n) === k)) || null;
}

module.exports = { get, save, ruleFor, giftKey, GIFT_CATALOG };
