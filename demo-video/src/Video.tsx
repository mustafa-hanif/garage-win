import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { loadFont } from '@remotion/google-fonts/Geist';
import timing from './timing.json';

const { fontFamily } = loadFont('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] });

export const FPS = 30;
const GREEN = '#116f3c';
const GREEN_LIGHT = '#40b86a';
const BG = '#0c0f0d';
const TRANSITION = 14;
const VOICE_DELAY = 8; // frames of silence before each line
const TAIL = 22; // frames of breathing room after each line

// Screen images, captured at 2x. Width/height are CSS pixels.
const SCREENS: Record<string, { w: number; h: number; title: string }> = {
  Main: { w: 1440, h: 1933, title: 'Dashboard' },
  Intake: { w: 1440, h: 1843, title: 'Service intake' },
  Estimation: { w: 1440, h: 1544, title: 'Estimation EST-0118' },
  JobCard: { w: 1440, h: 3383, title: 'Job card JC1-0042' },
  Inventory: { w: 1440, h: 1656, title: 'Inventory' },
  Purchases: { w: 1440, h: 1444, title: 'Purchase invoice' },
  Billing: { w: 1440, h: 1461, title: 'Billing job card' },
  InvoiceA4: { w: 794, h: 1123, title: 'Tax invoice INV-2026-0031' },
  EInvoicing: { w: 1440, h: 2946, title: 'E-invoicing and Wafeq' },
};

type Rect = { x: number; y: number; w: number; h: number };
type Key = { t: number; r: Rect; ring?: boolean };
type Shot = { screen: string; from: number; to: number; keys: Key[] };
type SceneDef = { id: keyof typeof timing; kicker?: string; headline?: string; shots?: Shot[] };

const TOP: Rect = { x: 0, y: 0, w: 1440, h: 820 };

const SCENES: SceneDef[] = [
  { id: 'title' },
  {
    id: 'intake', kicker: '01  Service intake', headline: 'Check a car in at the counter in under two minutes',
    shots: [{ screen: 'Intake', from: 0, to: 1, keys: [
      { t: 0, r: TOP },
      { t: 0.25, r: { x: 270, y: 165, w: 1148, h: 440 }, ring: true },
      { t: 0.55, r: { x: 280, y: 915, w: 752, h: 450 }, ring: true },
      { t: 0.8, r: { x: 280, y: 1385, w: 752, h: 331 }, ring: true },
    ] }],
  },
  {
    id: 'estimate', kicker: '02  Estimation', headline: 'Three options, approved by the customer on WhatsApp',
    shots: [{ screen: 'Estimation', from: 0, to: 1, keys: [
      { t: 0, r: TOP },
      { t: 0.25, r: { x: 280, y: 377, w: 752, h: 310 }, ring: true },
      { t: 0.62, r: { x: 1056, y: 450, w: 352, h: 348 }, ring: true },
    ] }],
  },
  {
    id: 'jobcard', kicker: '03  Job card and workshop', headline: 'Parts reserved, labour assigned, every bay tracked live',
    shots: [
      { screen: 'JobCard', from: 0, to: 0.62, keys: [
        { t: 0, r: TOP },
        { t: 0.35, r: { x: 280, y: 1282, w: 752, h: 635 }, ring: true },
        { t: 0.75, r: { x: 280, y: 1937, w: 752, h: 321 }, ring: true },
      ] },
      { screen: 'Main', from: 0.62, to: 1, keys: [
        { t: 0, r: { x: 280, y: 1300, w: 1128, h: 600 } },
        { t: 0.4, r: { x: 280, y: 1513, w: 1128, h: 380 }, ring: true },
      ] },
    ],
  },
  {
    id: 'stock', kicker: '04  Inventory and purchases', headline: 'Reorder suggestions and a three-way match before you pay',
    shots: [
      { screen: 'Inventory', from: 0, to: 0.55, keys: [
        { t: 0, r: TOP },
        { t: 0.4, r: { x: 280, y: 296, w: 1128, h: 520 }, ring: true },
      ] },
      { screen: 'Purchases', from: 0.55, to: 1, keys: [
        { t: 0, r: TOP },
        { t: 0.4, r: { x: 1076, y: 577, w: 332, h: 337 }, ring: true },
      ] },
    ],
  },
  {
    id: 'billing', kicker: '05  Billing', headline: 'A numbered, VAT-correct tax invoice in one click',
    shots: [
      { screen: 'Billing', from: 0, to: 0.52, keys: [
        { t: 0, r: TOP },
        { t: 0.4, r: { x: 280, y: 753, w: 772, h: 668 }, ring: true },
      ] },
      { screen: 'InvoiceA4', from: 0.52, to: 1, keys: [
        { t: 0, r: { x: 0, y: 0, w: 794, h: 1123 } },
        { t: 0.6, r: { x: 0, y: 570, w: 794, h: 330 } },
      ] },
    ],
  },
  {
    id: 'einvoice', kicker: '06  E-invoicing with Wafeq', headline: 'PINT AE e-invoices for business customers, tracked to the tax authority',
    shots: [{ screen: 'EInvoicing', from: 0, to: 1, keys: [
      { t: 0, r: TOP },
      { t: 0.25, r: { x: 280, y: 265, w: 1128, h: 244 }, ring: true },
      { t: 0.62, r: { x: 280, y: 662, w: 1128, h: 620 }, ring: true },
    ] }],
  },
  {
    id: 'dashboard', kicker: '07  Dashboard', headline: 'Revenue, open jobs, dues and stock every morning',
    shots: [{ screen: 'Main', from: 0, to: 1, keys: [
      { t: 0, r: { x: 0, y: 0, w: 1440, h: 900 } },
      { t: 0.5, r: { x: 280, y: 160, w: 1128, h: 680 } },
    ] }],
  },
  { id: 'end' },
];

const sceneFrames = (id: keyof typeof timing) => VOICE_DELAY + Math.ceil(timing[id] * FPS) + TAIL;
export const totalFrames = SCENES.reduce((a, s) => a + sceneFrames(s.id), 0) - TRANSITION * (SCENES.length - 1);

// Window geometry inside the 1920x1080 frame.
const WIN = { x: 160, y: 36, w: 1600, h: 900, bar: 40 };
const VW = WIN.w;
const VH = WIN.h - WIN.bar;

const fit = (r: Rect) => Math.max(0.5, Math.min(1.6, Math.min((VW * 0.92) / r.w, (VH * 0.9) / r.h)));
const ease = Easing.bezier(0.65, 0, 0.35, 1);

// Key k.t is when the camera leaves key k for the next one. Each move takes the
// first 55% of its segment, so the camera then holds on the new key.
const MOVE = 0.55;
function camera(keys: Key[], t: number) {
  let i = 0;
  while (i < keys.length - 1 && t >= keys[i + 1].t) i++;
  const from = keys[i].r;
  const to = i < keys.length - 1 ? keys[i + 1].r : from;
  const span = i < keys.length - 1 ? keys[i + 1].t - keys[i].t : 1;
  const p = from === to ? 1 : ease(Math.min(1, Math.max(0, (t - keys[i].t) / (span * MOVE))));
  const s = fit(from) + (fit(to) - fit(from)) * p;
  const cx = from.x + from.w / 2 + (to.x + to.w / 2 - (from.x + from.w / 2)) * p;
  const cy = from.y + from.h / 2 + (to.y + to.h / 2 - (from.y + from.h / 2)) * p;
  return { s, cx, cy };
}

const ShotView: React.FC<{ shot: Shot; frames: number }> = ({ shot, frames }) => {
  const frame = useCurrentFrame();
  const t = Math.min(1, frame / Math.max(1, frames - 1));
  const scr = SCREENS[shot.screen];
  const { s, cx, cy } = camera(shot.keys, t);
  const imgW = scr.w * s;
  const imgH = scr.h * s;
  let tx = VW / 2 - cx * s;
  let ty = VH / 2 - cy * s;
  tx = imgW >= VW ? Math.min(0, Math.max(VW - imgW, tx)) : (VW - imgW) / 2;
  ty = imgH >= VH ? Math.min(0, Math.max(VH - imgH, ty)) : (VH - imgH) / 2;

  // Focus ring: fades in once the camera has settled on a key marked ring.
  const rings = shot.keys.map((k, idx) => {
    if (!k.ring || idx === 0) return null;
    const prev = shot.keys[idx - 1];
    const next = shot.keys[idx + 1];
    // The camera starts toward key k at prev.t and arrives MOVE of the way through.
    const settle = prev.t + (k.t - prev.t) * MOVE;
    const leave = next ? k.t : 1.2;
    const fIn = interpolate(t, [settle, settle + 0.04], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const fOut = interpolate(t, [leave - 0.02, leave + 0.02], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return { r: k.r, o: Math.min(fIn, fOut), idx };
  });

  return (
    <AbsoluteFill style={{ background: '#f9fafb', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: tx, top: ty, width: imgW, height: imgH }}>
        <Img src={staticFile(`screens/${shot.screen}.png`)} style={{ width: imgW, height: imgH, display: 'block' }} />
        {rings.map((g) => g && g.o > 0 ? (
          <div key={g.idx} style={{
            position: 'absolute', left: g.r.x * s - 8, top: g.r.y * s - 8, width: g.r.w * s + 16, height: g.r.h * s + 16,
            borderRadius: 14, border: `3px solid ${GREEN_LIGHT}`, boxShadow: `0 0 0 6px rgba(64,184,106,0.18)`, opacity: g.o,
          }} />
        ) : null)}
      </div>
    </AbsoluteFill>
  );
};

// Shots are mapped to the scene's timeline, which counts from 0 after the
// voice delay is subtracted out; ScreenScene below handles the offsets.
const ScreenScene: React.FC<{ def: SceneDef; frames: number }> = ({ def, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shots = def.shots || [];
  const winIn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 18 });
  const capIn = spring({ frame: frame - 6, fps, config: { damping: 200 }, durationInFrames: 20 });
  const shotIdx = shots.findIndex((sh) => frame / frames >= sh.from && frame / frames < sh.to);
  const cur = shots[Math.max(0, shotIdx)];
  const title = cur ? SCREENS[cur.screen].title : '';
  return (
    <AbsoluteFill style={{ background: BG, fontFamily }}>
      <div style={{
        position: 'absolute', left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, borderRadius: 14, overflow: 'hidden',
        background: '#ffffff', boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)',
        transform: `translateY(${(1 - winIn) * 30}px) scale(${0.97 + 0.03 * winIn})`, opacity: winIn,
      }}>
        <div style={{ height: WIN.bar, background: '#f3f4f6', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: 6, background: '#d1d5db' }} />
          <span style={{ width: 12, height: 12, borderRadius: 6, background: '#d1d5db' }} />
          <span style={{ width: 12, height: 12, borderRadius: 6, background: '#d1d5db' }} />
          <div style={{ marginLeft: 16, height: 26, padding: '0 14px', borderRadius: 6, background: '#ffffff', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#374151' }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: GREEN, display: 'inline-block' }} />
            Garage Pro · {title}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, top: WIN.bar, width: VW, height: VH }}>
          {shots.map((sh, i) => {
            const start = Math.round(sh.from * frames);
            const len = Math.round((sh.to - sh.from) * frames);
            const fadeLen = i === 0 ? 0 : 10;
            return (
              <Sequence key={i} from={start} durationInFrames={len + (i < shots.length - 1 ? 10 : 0)} layout="none">
                <ShotFade fadeLen={fadeLen}><ShotView shot={sh} frames={len} /></ShotFade>
              </Sequence>
            );
          })}
        </div>
      </div>
      <div style={{ position: 'absolute', left: WIN.x + 4, top: WIN.y + WIN.h + 28, opacity: capIn, transform: `translateY(${(1 - capIn) * 14}px)` }}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: GREEN_LIGHT }}>{def.kicker}</div>
        <div style={{ fontSize: 40, fontWeight: 600, color: '#ffffff', marginTop: 4, letterSpacing: '-0.01em' }}>{def.headline}</div>
      </div>
    </AbsoluteFill>
  );
};

const ShotFade: React.FC<{ fadeLen: number; children: React.ReactNode }> = ({ fadeLen, children }) => {
  const frame = useCurrentFrame();
  const o = fadeLen ? interpolate(frame, [0, fadeLen], [0, 1], { extrapolateRight: 'clamp' }) : 1;
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

const Logo: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.22, background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.4 }}>GP</div>
);

const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const b = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  const c = spring({ frame: frame - 22, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ background: BG, fontFamily, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ transform: `scale(${0.6 + 0.4 * a})`, opacity: a }}><Logo size={132} /></div>
      <div style={{ marginTop: 36, fontSize: 104, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', opacity: b, transform: `translateY(${(1 - b) * 20}px)` }}>Garage Pro</div>
      <div style={{ marginTop: 10, fontSize: 38, color: '#a3a8a5', opacity: c, transform: `translateY(${(1 - c) * 16}px)` }}>The workshop system built for UAE garages</div>
    </AbsoluteFill>
  );
};

const EndScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame, fps, config: { damping: 200 } });
  const b = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const items = ['Service intake', 'Job cards', 'Stock and purchases', 'VAT billing', 'E-invoicing'];
  return (
    <AbsoluteFill style={{ background: BG, fontFamily, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28, opacity: a, transform: `scale(${0.94 + 0.06 * a})` }}>
        <Logo size={96} />
        <div style={{ fontSize: 88, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em' }}>Garage Pro</div>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 40, opacity: b }}>
        {items.map((t) => (
          <span key={t} style={{ fontSize: 24, color: '#d1d5db', padding: '10px 20px', borderRadius: 999, border: '1px solid #2a2f2c' }}>{t}</span>
        ))}
      </div>
      <div style={{ marginTop: 48, fontSize: 44, fontWeight: 600, color: GREEN_LIGHT, opacity: b }}>Book your demo today</div>
      <div style={{ marginTop: 10, fontSize: 30, color: '#a3a8a5', opacity: b }}>[YOUR WEBSITE]</div>
    </AbsoluteFill>
  );
};

export const GaragePro: React.FC = () => (
  <AbsoluteFill style={{ background: BG }}>
    <TransitionSeries>
      {SCENES.flatMap((def, i) => {
        const frames = sceneFrames(def.id);
        const body = def.id === 'title' ? <TitleScene /> : def.id === 'end' ? <EndScene /> : <ScreenScene def={def} frames={frames} />;
        const seq = (
          <TransitionSeries.Sequence key={def.id} durationInFrames={frames}>
            {body}
            <Sequence from={VOICE_DELAY} layout="none">
              <Audio src={staticFile(`voice/${def.id}.mp3`)} />
            </Sequence>
          </TransitionSeries.Sequence>
        );
        return i < SCENES.length - 1
          ? [seq, <TransitionSeries.Transition key={`${def.id}-t`} presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />]
          : [seq];
      })}
    </TransitionSeries>
  </AbsoluteFill>
);
