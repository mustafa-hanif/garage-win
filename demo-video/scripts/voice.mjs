// Generates one voice-over clip per scene with ElevenLabs, then writes clip durations to src/timing.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const KEY = env.ELEVENLABS_API_KEY;
const VOICE = 'cjVigY5qzO86Huf0OWal'; // Eric: smooth, trustworthy
const scenes = JSON.parse(readFileSync(new URL('../src/scenes.json', import.meta.url), 'utf8'));

const timing = {};
for (const s of scenes) {
  const out = new URL(`../public/voice/${s.id}.mp3`, import.meta.url).pathname;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text: s.text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true } }),
  });
  if (!res.ok) { console.error(s.id, res.status, (await res.text()).slice(0, 300)); process.exit(1); }
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  const probe = execFileSync('npx', ['remotion', 'ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
  timing[s.id] = Number(probe);
  console.log(s.id, timing[s.id].toFixed(2) + 's');
}
writeFileSync(new URL('../src/timing.json', import.meta.url), JSON.stringify(timing, null, 2));
