// Motor da enquete: rodadas, votos (chat, curtidas, presentes), quem votou em
// quem e a simulacao. O jogo e o painel so mostram o que sai daqui.
//   eventos: vote | phase | sound | notice   (+ "dirty" para o placar)
const EventEmitter = require('events');
const settings = require('./settings');
const log = require('./log');

const COUNTDOWN_MS = 2100;
const SIDES = ['22', '13'];
const fold = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SIM_USERS = {
  22: ['joaosilva_sp', 'marianalima', 'pedro_oliveira', 'rafa.costa', 'bruno_mg', 'juliana.r', 'felipe_rj', 'camila_santos', 'diego.am', 'leticia_pr'],
  13: ['carlosfaria', 'beatrizsouza', 'lucasribeiro', 'ana.paula', 'tiago_pe', 'renata.ba', 'gustavo_ce', 'fernanda.m', 'marcos_pa', 'vanessa_rn'],
};
const SIM_LINES = { 22: ['22', 'Vai 22!', '22 na frente!', 'Bora, 22!', '22 22 22'], 13: ['13', 'É 13!', '13 neles!', 'Bora, 13!', '13 13 13'] };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

class Poll extends EventEmitter {
  constructor() {
    super();
    this.teams = new Map(); // usuario -> lado em que votou no chat (vale para curtidas e presentes)
    this.likeAcc = new Map();
    this.lastChat = new Map();
    this.pending = []; // presentes que chegaram fora da enquete: contam quando a proxima comecar
    this.recentGifts = new Map(); // nome -> { name, coins, last } para o painel
    this.isLive = () => false;
    this.simBias = 0.5;
    this.simNext = 0;
    this.clear();
    this.phase = 'idle';
    setInterval(() => this.tick(), 200);
  }

  clear() {
    this.v = { 22: 0, 13: 0 };
    this.by = { 22: new Map(), 13: new Map() };
    this.winner = 0;
    this.endsAt = 0;
    this.restartAt = 0;
  }

  setPhase(phase, extra = {}) {
    this.phase = phase;
    this.emit('phase', { phase, ...extra });
    this.emit('dirty');
  }

  start() {
    clearTimeout(this.restartT);
    clearTimeout(this.countT);
    this.clear();
    this.setPhase('count');
    this.countT = setTimeout(() => {
      const d = settings.get().round.duration;
      this.endsAt = d ? Date.now() + d * 1000 : 0;
      this.setPhase('play');
      log.ok('enquete', d ? `enquete começou (${d} s)` : 'enquete começou (sem limite de tempo)');
      const queued = this.pending.splice(0);
      for (const p of queued) this.addVotes(p.side, p.amount, p.user, p.kind, p.text);
      if (queued.length) log.info('enquete', `${queued.length} presente(s) recebido(s) no intervalo foram contados agora`);
    }, COUNTDOWN_MS);
  }

  end() {
    if (this.phase !== 'play' && this.phase !== 'count') return;
    clearTimeout(this.countT);
    const w = this.v[22] === this.v[13] ? 0 : this.v[22] > this.v[13] ? 22 : 13;
    this.winner = w;
    const top = w ? this.top(w, 1)[0] : null;
    const r = settings.get().round;
    if (r.autoRestart) {
      this.restartAt = Date.now() + r.restartDelay * 1000;
      this.restartT = setTimeout(() => this.start(), r.restartDelay * 1000);
    }
    log.ok('enquete', `fim: ${w ? w + ' venceu' : 'empate'} (${this.v[22]} x ${this.v[13]})${top ? `, quem mais votou: ${top.name} (${top.n})` : ''}`);
    this.setPhase('end', { winner: w, top });
  }

  stop() {
    clearTimeout(this.restartT);
    clearTimeout(this.countT);
    this.clear();
    this.setPhase('idle');
    log.warn('enquete', 'enquete parada pelo painel');
  }

  tick() {
    if (this.phase === 'play' && this.endsAt && Date.now() >= this.endsAt) this.end();
    this.simTick();
  }

  top(side, n = 3) {
    return [...this.by[side].values()].sort((a, b) => b.n - a.n).slice(0, n);
  }

  snapshot() {
    const s = settings.get();
    return {
      phase: this.phase,
      v: this.v,
      top: { 22: this.top(22), 13: this.top(13) },
      remaining: this.phase === 'play' && this.endsAt ? Math.max(0, this.endsAt - Date.now()) : null,
      duration: s.round.duration,
      winner: this.winner,
      restartIn: this.restartAt ? Math.max(0, this.restartAt - Date.now()) : null,
      sides: s.sides,
      audio: s.audio,
      pending: this.pending.length,
    };
  }

  userKey(u) {
    return u.userId || u.uniqueId || u.nickname;
  }

  addVotes(side, amount, user, kind, text) {
    side = String(side);
    amount = Math.round(amount);
    if (!SIDES.includes(side) || !(amount > 0)) return false;
    if (this.phase !== 'play') {
      if (kind === 'gift' || kind === 'manual') this.pending.push({ side, amount, user, kind, text });
      return false;
    }
    this.v[side] += amount;
    const k = this.userKey(user);
    const e = this.by[side].get(k) || { name: user.nickname || user.uniqueId, avatar: '', n: 0 };
    // votos dados pelo painel nao entram no ranking de quem mais comentou
    if (kind !== 'manual') {
      e.n += amount;
      if (user.avatarUrl) e.avatar = user.avatarUrl;
      this.by[side].set(k, e);
    }
    this.emit('vote', { side: Number(side), amount, name: e.name, avatar: e.avatar, kind, text });
    this.emit('dirty');
    return true;
  }

  // lado citado no comentario: vale o que aparece primeiro ("22 nao, 13!" conta como 22)
  sideFromText(text) {
    const t = fold(text);
    let best = null;
    for (const side of SIDES) {
      for (const kw of settings.get().sides[side].keywords) {
        const k = fold(kw);
        if (!k) continue;
        // numeros: aceita "2222" mas nao "122"; palavras: aceita "lulaaa"
        const re = /^\d+$/.test(k) ? new RegExp(`(?:^|\\D)(?:${escRe(k)})+(?:\\D|$)`) : new RegExp(`(?:^|[^a-z0-9])${escRe(k)}`);
        const m = re.exec(t);
        if (m && (!best || m.index < best.index)) best = { side, index: m.index };
      }
    }
    return best && best.side;
  }

  onChat({ user, comment }) {
    const side = this.sideFromText(comment);
    if (!side) return;
    const k = this.userKey(user);
    this.teams.set(k, side);
    const s = settings.get();
    if (s.chat.cooldown) {
      const now = Date.now();
      if (now - (this.lastChat.get(k) || 0) < s.chat.cooldown * 1000) return;
      this.lastChat.set(k, now);
    }
    this.addVotes(side, s.chat.votes, user, 'chat', comment);
  }

  onLike({ user, count }) {
    const { every, votes } = settings.get().likes;
    if (!every || !votes) return;
    const k = this.userKey(user);
    const side = this.teams.get(k);
    if (!side) return;
    const acc = (this.likeAcc.get(k) || 0) + count;
    const units = Math.floor(acc / every);
    this.likeAcc.set(k, acc % every);
    if (units) this.addVotes(side, units * votes, user, 'like', `curtiu ${units * every}x`);
  }

  onGift(g) {
    const s = settings.get();
    const rule = settings.ruleFor(g.giftName);
    const prev = this.recentGifts.get(g.giftName) || { name: g.giftName, coins: g.coinValue, n: 0 };
    this.recentGifts.set(g.giftName, { ...prev, coins: g.coinValue || prev.coins, n: prev.n + g.count, last: Date.now() });

    const votes = rule ? rule.votes * g.count : s.otherGifts.votesPerCoin * g.totalCoins;
    const sideMode = rule ? rule.side : s.otherGifts.side;
    if (rule && rule.audio) this.emit('sound', { url: '/audios/' + encodeURIComponent(rule.audio), volume: rule.volume });

    const side = sideMode === 'user' ? this.teams.get(this.userKey(g.user)) : sideMode;
    const text = `mandou ${g.giftName}${g.count > 1 ? ' x' + g.count : ''}`;
    const name = g.user.nickname || g.user.uniqueId;
    if (!votes) return;
    if (!side) {
      const [k22, k13] = SIDES.map((sd) => s.sides[sd].keywords[0] || sd);
      log.info('enquete', `${name} ${text}, mas ainda não escolheu um lado (não contou)`);
      this.emit('notice', { name, text: `${text} · comente ${k22} ou ${k13} para escolher seu lado!` });
      return;
    }
    if (this.addVotes(side, votes, g.user, 'gift', text)) log.ok('enquete', `${name} ${text}: +${votes} votos no ${side}`);
    else log.info('enquete', `${name} ${text}: +${votes} no ${side} quando a próxima enquete começar`);
  }

  // ---------------------------------------------------------------- simulacao
  // gera comentarios falsos enquanto nao ha live conectada (para testar e para o OBS nao ficar vazio)
  simTick() {
    if (!settings.get().simulation || this.isLive() || this.phase !== 'play') return;
    const dt = 0.2;
    this.simBias = Math.min(0.8, Math.max(0.2, this.simBias + (Math.random() - 0.5) * dt * 0.9 + (0.5 - this.simBias) * dt * 0.15));
    if ((this.simNext -= dt) > 0) return;
    this.simNext = 0.18 + Math.random() * 0.3;
    const side = Math.random() < this.simBias ? '22' : '13';
    const id = SIM_USERS[side][Math.floor(Math.pow(Math.random(), 1.8) * SIM_USERS[side].length)];
    const user = { userId: 'sim-' + id, uniqueId: id, nickname: '@' + id, avatarUrl: '' };
    if (Math.random() < 0.02) this.onGift({ user, giftName: 'Rose', count: 1, coinValue: 1, totalCoins: 1 });
    else this.onChat({ user, comment: pick(SIM_LINES[side]) });
  }
}

module.exports = new Poll();
