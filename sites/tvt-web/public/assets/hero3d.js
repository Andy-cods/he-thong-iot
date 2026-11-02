/* Cảnh 3D trang chủ: bình xoắn ánh ngọc trai đang được in từng lớp.
   Cần THREE (r149) nạp trước. Nếu không có WebGL, ảnh poster tĩnh vẫn hiển thị. */
(function () {
  'use strict';
  var cv = document.getElementById('hero3d');
  if (!cv || !window.THREE) return;
  var T = window.THREE;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LAYERS = 150, HEIGHT = 2.4;
  function prof(t) { return 0.55 + 0.42 * Math.sin(t * Math.PI * 0.92) + 0.1 * Math.sin(t * Math.PI * 3.1); }
  function vaseGeo() {
    var U = 160, V = 360, pos = [], idx = [];
    for (var j = 0; j <= V; j++) {
      var t = j / V, p = prof(t), rip = 0.006 * Math.sin(t * LAYERS * Math.PI * 2);
      for (var i = 0; i <= U; i++) {
        var a = i / U * Math.PI * 2, r = p * (1 + 0.055 * Math.cos(7 * (a + 2.2 * t))) + rip;
        pos.push(r * Math.cos(a), t * HEIGHT, r * Math.sin(a));
      }
    }
    for (j = 0; j < V; j++) for (i = 0; i < U; i++) { var A = j * (U + 1) + i, B = A + U + 1; idx.push(A, B, A + 1, B, B + 1, A + 1); }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function env(renderer) {
    var s = new T.Scene(); s.background = new T.Color(0x101116);
    function panel(c, w, h, x, y, z) { var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: c, side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); }
    panel(0xCDBBFF, 6, 10, -8, 3, 2); panel(0x9FE6D4, 5, 8, 8, 1, -3); panel(0xFFD2B6, 10, 3, 0, 9, 0); panel(0xffffff, 4, 4, 2, 3, 9); panel(0x2a2c36, 30, 30, 0, -8, 0);
    var pm = new T.PMREMGenerator(renderer), tex = pm.fromScene(s, 0.03).texture; pm.dispose(); return tex;
  }
  function shadowTex() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var x = c.getContext('2d');
    var g = x.createRadialGradient(128, 128, 10, 128, 128, 128); g.addColorStop(0, 'rgba(0,0,0,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new T.CanvasTexture(c);
  }
  var r;
  try { r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch (e) { return; }
  var poster = document.querySelector('.stage .poster');
  r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.localClippingEnabled = true;
  var scene = new T.Scene(); scene.environment = env(r);
  var cam = new T.PerspectiveCamera(28, 1, 0.1, 100); cam.position.set(0, 2.7, 7.4); cam.lookAt(0, 1.05, 0);
  var key = new T.DirectionalLight(0xffffff, 1.1); key.position.set(3, 5, 4); scene.add(key);
  var clip = new T.Plane(new T.Vector3(0, -1, 0), HEIGHT);
  var mat = new T.MeshPhysicalMaterial({ color: 0xF1EDF8, metalness: 0.05, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.12, iridescence: 1, iridescenceIOR: 1.38, iridescenceThicknessRange: [180, 760], side: T.DoubleSide, clippingPlanes: [clip] });
  var vase = new T.Mesh(vaseGeo(), mat); scene.add(vase);
  var sh = new T.Mesh(new T.PlaneGeometry(3.4, 3.4), new T.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = -0.001; scene.add(sh);
  var RU = 160, ringPos = new Float32Array(RU * 3), rg = new T.BufferGeometry(); rg.setAttribute('position', new T.BufferAttribute(ringPos, 3));
  var ring = new T.LineLoop(rg, new T.LineBasicMaterial({ color: 0xFFE6D6, transparent: true, opacity: 0.95 })); scene.add(ring);
  var glow = new T.PointLight(0xFFC9A8, 1.2, 2.2); scene.add(glow);
  var rL = document.getElementById('rLayer'), rZ = document.getElementById('rZ');
  var progress = reduce ? 1 : 0.5, rot = -0.4, last = 0, visible = true;
  function resize() { var b = cv.getBoundingClientRect(); if (!b.width) return; r.setSize(b.width, b.height, false); cam.aspect = b.width / b.height; cam.updateProjectionMatrix(); }
  function render() {
    vase.rotation.y = rot;
    var h = progress * HEIGHT; clip.constant = h + 0.0005;
    var p = prof(Math.min(progress, 0.999));
    for (var i = 0; i < RU; i++) { var a = i / RU * Math.PI * 2, rr = (p * (1 + 0.055 * Math.cos(7 * (a + 2.2 * progress))) + 0.006) * 1.002; ringPos[i * 3] = rr * Math.cos(a); ringPos[i * 3 + 1] = h; ringPos[i * 3 + 2] = rr * Math.sin(a); }
    rg.attributes.position.needsUpdate = true; ring.rotation.y = rot; ring.visible = glow.visible = progress < 1; glow.position.set(0, h + 0.25, 1.2);
    var layer = Math.max(1, Math.round(progress * LAYERS)); if (rL) rL.textContent = layer + '/' + LAYERS; if (rZ) rZ.textContent = (layer * 0.16).toFixed(2);
    r.render(scene, cam);
  }
  function frame(ts) {
    var dt = last ? Math.min(50, ts - last) : 16; last = ts;
    if (visible) { if (progress < 1) progress = Math.min(1, progress + dt / 11000); rot += dt * 0.00018; render(); }
    requestAnimationFrame(frame);
  }
  resize(); render();
  if (poster) poster.hidden = true;
  addEventListener('resize', function () { resize(); render(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(cv);
  if (!reduce) requestAnimationFrame(frame);
})();
