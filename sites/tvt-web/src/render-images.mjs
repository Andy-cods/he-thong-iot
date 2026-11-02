// Render ảnh sản phẩm minh hoạ (PNG nền trong suốt) vào public/assets/img/ bằng Three.js + Playwright.
// Chỉ cần chạy lại khi muốn đổi ảnh minh hoạ. Ảnh thật của xưởng thì chép thẳng vào public/assets/img/ với cùng tên file.
// Chạy: THREE_PATH=/duong/dan/three.min.js node src/render-images.mjs
//   (THREE_PATH là bản three@0.149.0 build/three.min.js; bỏ trống thì tải từ jsDelivr)
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'assets', 'img');
const threeTag = process.env.THREE_PATH
  ? `<script>${readFileSync(process.env.THREE_PATH, 'utf8')}</script>`
  : '<script src="https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js"></script>';

const scene = String.raw`
const T = THREE, S = 720;
const r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setSize(S, S, false); r.setPixelRatio(1); r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
const sc = new T.Scene();
(function env() {
  const s = new T.Scene(); s.background = new T.Color(0x101116);
  const panel = (c, w, h, x, y, z) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: c, side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
  panel(0xCDBBFF, 6, 10, -8, 3, 2); panel(0x9FE6D4, 5, 8, 8, 1, -3); panel(0xFFD2B6, 10, 3, 0, 9, 0); panel(0xffffff, 4, 4, 2, 3, 9); panel(0x2a2c36, 30, 30, 0, -8, 0);
  const pm = new T.PMREMGenerator(r); sc.environment = pm.fromScene(s, 0.03).texture; pm.dispose();
})();
const key = new T.DirectionalLight(0xffffff, 1); key.position.set(3, 5, 4); sc.add(key);
const cam = new T.PerspectiveCamera(30, 1, 0.1, 100);
const shTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const g = x.createRadialGradient(128, 128, 10, 128, 128, 128); g.addColorStop(0, 'rgba(0,0,0,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new T.CanvasTexture(c); })();
const shadow = new T.Mesh(new T.PlaneGeometry(3.6, 3.6), new T.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; sc.add(shadow);
const pearl = (o) => new T.MeshPhysicalMaterial(Object.assign({ color: 0xF1EDF8, metalness: 0.05, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.12, iridescence: 1, iridescenceIOR: 1.38, iridescenceThicknessRange: [180, 760], side: T.DoubleSide }, o));
function vaseGeo(o) {
  o = Object.assign({ U: 160, V: 360, lobes: 7, amp: 0.055, twist: 2.2, ripple: 0.006, h: 2.4, layers: 150, prof: (t) => 0.55 + 0.42 * Math.sin(t * Math.PI * 0.92) + 0.1 * Math.sin(t * Math.PI * 3.1), shape: null }, o);
  const pos = [], idx = [];
  for (let j = 0; j <= o.V; j++) { const t = j / o.V, p = o.prof(t), rip = o.ripple * Math.sin(t * o.layers * Math.PI * 2);
    for (let i = 0; i <= o.U; i++) { const a = i / o.U * Math.PI * 2; const k = o.shape ? o.shape(a + o.twist * t) : (1 + o.amp * Math.cos(o.lobes * (a + o.twist * t))); const rr = p * k + rip; pos.push(rr * Math.cos(a), t * o.h, rr * Math.sin(a)); } }
  for (let j = 0; j < o.V; j++) for (let i = 0; i < o.U; i++) { const A = j * (o.U + 1) + i, B = A + o.U + 1; idx.push(A, B, A + 1, B, B + 1, A + 1); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const hex = (a) => { const s = Math.PI / 3, m = ((a % s) + s) % s - s / 2; return Math.cos(Math.PI / 6) / Math.cos(m); };
const B = {
  hero: () => [new T.Mesh(vaseGeo({}), pearl()), 1.05, [0, 2.7, 7.4], -0.4, 28],
  vase: () => [new T.Mesh(vaseGeo({ lobes: 9, amp: 0.08, twist: 3.4, prof: (t) => 0.42 + 0.36 * Math.sin(t * Math.PI * 1.05) + 0.12 * Math.cos(t * Math.PI * 2.4) }), pearl({ color: 0xE9E4F5 })), 1.2, [0, 2.2, 6.8], 0.6],
  vase2: () => { const g = new T.Group(); const m = new T.Mesh(vaseGeo({ shape: hex, twist: 0.9, h: 1.5, layers: 90, ripple: 0.005, prof: (t) => 0.7 + 0.18 * t }), new T.MeshPhysicalMaterial({ color: 0x9FD8C9, roughness: 0.35, clearcoat: 0.6, side: T.DoubleSide })); g.add(m);
    const soil = new T.Mesh(new T.CircleGeometry(0.78, 6), new T.MeshStandardMaterial({ color: 0x2A2420, roughness: 1 })); soil.rotation.x = -Math.PI / 2; soil.position.y = 1.38; g.add(soil);
    const leafM = new T.MeshStandardMaterial({ color: 0x3E6B4E, roughness: 0.6 });
    for (let i = 0; i < 7; i++) { const l = new T.Mesh(new T.SphereGeometry(0.28, 24, 16), leafM); l.scale.set(0.45, 1.25, 0.18); const a = i / 7 * Math.PI * 2; l.position.set(Math.cos(a) * 0.22, 1.72 + (i % 2) * 0.12, Math.sin(a) * 0.22); l.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5); g.add(l); }
    return [g, 1.0, [0, 2.4, 6.2], 0.3]; },
  knot: () => { const m = new T.Mesh(new T.TorusKnotGeometry(0.72, 0.24, 300, 48, 2, 3), pearl({ roughness: 0.18 })); m.position.y = 1.1; m.rotation.set(0.4, 0.3, 0); return [m, 1.1, [0, 1.5, 6.2], 0]; },
  facet: () => { const m = new T.Mesh(new T.IcosahedronGeometry(0.9, 1), pearl({ flatShading: true, color: 0xF4F0FA, roughness: 0.3 })); m.position.y = 0.95; m.rotation.set(0.3, 0.5, 0); return [m, 0.95, [0, 1.6, 6], 0]; },
  gear: () => { const sh = new T.Shape(), n = 16; for (let i = 0; i < n * 4; i++) { const a = i / (n * 4) * Math.PI * 2, rad = (i % 4 < 2) ? 1 : 0.82; const x = Math.cos(a) * rad, y = Math.sin(a) * rad; i ? sh.lineTo(x, y) : sh.moveTo(x, y); } sh.closePath(); const h = new T.Path(); h.absarc(0, 0, 0.3, 0, Math.PI * 2, true); sh.holes.push(h);
    const g = new T.ExtrudeGeometry(sh, { depth: 0.32, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 24 }); g.center(); const m = new T.Mesh(g, new T.MeshPhysicalMaterial({ color: 0x2B2D35, metalness: 0.3, roughness: 0.45, clearcoat: 0.4 })); m.position.y = 1.05; m.rotation.set(-0.9, 0, 0.3); return [m, 1.0, [0, 1.8, 6], 0]; },
  arch: () => { const g = new T.Group(), mat = new T.MeshPhysicalMaterial({ color: 0xF3F3F1, roughness: 0.55, clearcoat: 0.2 });
    [[0, 0, 0, 1.6, 0.5, 1.2], [-0.45, 0.5, -0.15, 0.6, 1.1, 0.6], [0.35, 0.5, 0.1, 0.7, 0.7, 0.8], [0.3, 1.2, 0.1, 0.4, 0.5, 0.4], [-0.45, 1.6, -0.15, 0.36, 0.5, 0.36]].forEach((b) => { const m = new T.Mesh(new T.BoxGeometry(b[3], b[4], b[5]), mat); m.position.set(b[0], b[1] + b[4] / 2, b[2]); g.add(m); });
    return [g, 0.95, [0, 2.6, 6.2], 0.7]; },
  toy: () => { const g = new T.Group(), body = pearl({ color: 0xF7E6F0, roughness: 0.3 }), dark = new T.MeshPhysicalMaterial({ color: 0x15161B, roughness: 0.2, clearcoat: 1 });
    const b = new T.Mesh(new T.SphereGeometry(0.62, 64, 48), body); b.scale.set(1, 0.92, 0.95); b.position.y = 0.6; g.add(b);
    const hd = new T.Mesh(new T.SphereGeometry(0.58, 64, 48), body); hd.scale.set(1.1, 0.95, 1); hd.position.y = 1.45; g.add(hd);
    [-1, 1].forEach((s) => { const e = new T.Mesh(new T.ConeGeometry(0.16, 0.42, 32), body); e.position.set(0.34 * s, 1.95, 0); e.rotation.z = -0.35 * s; g.add(e);
      const eye = new T.Mesh(new T.SphereGeometry(0.075, 24, 16), dark); eye.position.set(0.22 * s, 1.5, 0.53); g.add(eye);
      const arm = new T.Mesh(new T.SphereGeometry(0.16, 32, 24), body); arm.scale.set(1, 1.4, 1); arm.position.set(0.6 * s, 0.75, 0.15); g.add(arm); });
    const blush = new T.MeshStandardMaterial({ color: 0xFFB3C6, roughness: 0.8 }); [-1, 1].forEach((s) => { const c = new T.Mesh(new T.SphereGeometry(0.07, 16, 12), blush); c.scale.set(1.4, 0.7, 0.4); c.position.set(0.36 * s, 1.36, 0.5); g.add(c); });
    return [g, 1.05, [0, 1.8, 6.2], -0.25]; },
  ring: () => { const g = new T.Group(); const band = new T.Mesh(new T.TorusGeometry(0.62, 0.11, 48, 160), new T.MeshPhysicalMaterial({ color: 0xFFD9B8, metalness: 1, roughness: 0.18, clearcoat: 1 })); g.add(band);
    const gem = new T.Mesh(new T.OctahedronGeometry(0.26, 0), pearl({ flatShading: true, roughness: 0.05, color: 0xE8DEFF })); gem.position.y = 0.78; gem.scale.set(1, 1.2, 1); g.add(gem);
    const prong = new T.Mesh(new T.CylinderGeometry(0.16, 0.1, 0.16, 6), band.material); prong.position.y = 0.66; g.add(prong);
    g.position.y = 1.0; g.rotation.set(-0.2, 0.5, 0.05); return [g, 1.05, [0, 1.6, 5.6], 0]; },
  armillary: () => { const g = new T.Group(), m = pearl({ roughness: 0.2 }); [0, 1, 2, 3].forEach((i) => { const t = new T.Mesh(new T.TorusGeometry(0.85, 0.035, 24, 180), m); t.rotation.set(i * 0.5, i * 0.8, i * 0.3); g.add(t); });
    const core = new T.Mesh(new T.SphereGeometry(0.28, 64, 48), new T.MeshPhysicalMaterial({ color: 0xFFD2B6, metalness: 0.6, roughness: 0.25 })); g.add(core);
    const stand = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.6, 24), m); stand.position.y = -1.1; g.add(stand);
    const base = new T.Mesh(new T.CylinderGeometry(0.4, 0.5, 0.12, 64), m); base.position.y = -1.42; g.add(base);
    g.position.y = 1.48; return [g, 1.1, [0, 1.7, 6.4], 0]; },
  medal: () => { const g = new T.Group(); const gold = new T.MeshPhysicalMaterial({ color: 0xE9D3B4, metalness: 1, roughness: 0.25, clearcoat: 0.6 });
    const disc = new T.Mesh(new T.CylinderGeometry(0.85, 0.85, 0.12, 128), gold); disc.rotation.x = Math.PI / 2; g.add(disc);
    const rim = new T.Mesh(new T.TorusGeometry(0.85, 0.06, 24, 160), gold); g.add(rim);
    const star = new T.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? 0.22 : 0.5; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? star.lineTo(x, y) : star.moveTo(x, y); } star.closePath();
    const st = new T.Mesh(new T.ExtrudeGeometry(star, { depth: 0.06, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 }), pearl({ color: 0xEDE6FA })); st.position.z = 0.05; g.add(st);
    const ribbon = new T.Mesh(new T.BoxGeometry(0.42, 0.9, 0.02), new T.MeshStandardMaterial({ color: 0x3B2F7A, roughness: 0.6 })); ribbon.position.set(0, 1.25, -0.05); g.add(ribbon);
    g.position.y = 1.0; g.rotation.set(-0.1, -0.45, 0.06); return [g, 1.25, [0, 1.6, 6.6], 0]; },
};
window.renderAll = () => { const out = {};
  for (const k of Object.keys(B)) { const [obj, ty, cp, ry, fov] = B[k](); if (ry) obj.rotation.y += ry; sc.add(obj); cam.fov = fov || 30; cam.updateProjectionMatrix(); cam.position.set(...cp); cam.lookAt(0, ty, 0); r.render(sc, cam); out[k] = r.domElement.toDataURL('image/png'); sc.remove(obj); }
  return out; };
`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.setContent(`<!doctype html><html><body>${threeTag}<script>${scene}</script></body></html>`);
const imgs = await page.evaluate(() => window.renderAll());
for (const [k, v] of Object.entries(imgs)) writeFileSync(join(OUT, `${k}.png`), Buffer.from(v.split(',')[1], 'base64'));
console.log('Đã render', Object.keys(imgs).length, 'ảnh vào public/assets/img/');
await browser.close();
