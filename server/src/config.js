const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..'); // pasta server
const APP_ROOT = path.resolve(ROOT, '..'); // pasta do jogo (game-polit)

// .env minimalista (sem dependencia extra)
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const env = (k, d = '') => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);

module.exports = {
  ROOT,
  APP_ROOT,
  DATA_DIR: path.join(ROOT, 'data'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  // musica de quem esta ganhando: o primeiro audio de cada pasta
  MUSIC_DIR: path.join(APP_ROOT, 'audio-quem-ta-ganhando'),
  // audios que o streamer escolhe para cada presente
  GIFT_AUDIO_DIR: path.join(APP_ROOT, 'audios-presentes'),
  PORT: Number(env('PORT', '9595')),
  TIKTOK_USERNAME: env('TIKTOK_USERNAME'),
  TIKTOK_PROXY: env('TIKTOK_PROXY'),
};
