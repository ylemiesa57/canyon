// Canyon landing page behaviour.
// 1. Viewport: a Three.js canyon terrain, fixed behind the page, in two readings.
//    For a shop it is a part being cut: wireframe forward, an end mill working a
//    raster toolpath, pulses radiating outward like chips. For a buyer it is a
//    survey: contours forward, no tool, a slow wavefront crossing the terrain and
//    pulses that collapse inward. Scrolling flies the camera between one pose per
//    section; clicking sends a pulse.
// 2. Audience toggle (buyer vs machine shop).
// 3. Scroll choreography: staggered reveals, the steps rail, the looping agent exchange,
//    the demo video slot, the trial form.

import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ------------------------------------------------------------------ */
/* Nav                                                                  */
/* ------------------------------------------------------------------ */
const nav = $(".nav");
const navToggle = $(".nav-toggle");
if (navToggle) {
  navToggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(open));
  });
  $$(".nav-links a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("is-open")));
}

/* ------------------------------------------------------------------ */
/* Audience toggle                                                      */
/* ------------------------------------------------------------------ */
(function audienceToggle() {
  const picks = $$("[data-audience-pick]");
  if (!picks.length) return;
  const root = document.documentElement;
  const setAudience = (a) => {
    root.dataset.audience = a;
    picks.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.audiencePick === a)));
    const role = $(a === "shop" ? "#role-shop" : "#role-buyer");
    if (role) role.checked = true;
    try { localStorage.setItem("canyon-audience", a); } catch (e) { /* private mode */ }
    const url = new URL(location.href);
    url.searchParams.set("for", a);
    history.replaceState(null, "", url);
    document.dispatchEvent(new CustomEvent("canyon:audience", { detail: a }));
  };
  picks.forEach((b) => b.addEventListener("click", () => setAudience(b.dataset.audiencePick)));
  setAudience(root.dataset.audience === "shop" ? "shop" : "buyer");
})();

/* ------------------------------------------------------------------ */
/* Viewport                                                             */
/* ------------------------------------------------------------------ */
const viewport = (function viewport() {
  const host = $(".viewport");
  if (!host) return null;

  const BG = 0x1e2328;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(BG, 1);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 80, 210);
  const camera = new THREE.PerspectiveCamera(38, 1, 1, 500);

  // --- Terrain: a meandering canyon, quantised into terraces like CNC step-downs.
  const SIZE = 150;
  const SEG = 120;
  const STEP = 2.4;

  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    const u = smooth(xf), v = smooth(yf);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  const meander = (z) => 11 * Math.sin(z * 0.055) + 4 * Math.sin(z * 0.16 + 1.3);
  const rawHeight = (x, z) => {
    const d = x - meander(z);
    const canyon = -27 * Math.exp(-(d * d) / (2 * 13 * 13));
    const bench = -6 * Math.exp(-(d * d) / (2 * 26 * 26));
    const ridge = 4.5 * noise(x * 0.07 + 3, z * 0.07) + 1.6 * noise(x * 0.22, z * 0.22 + 9);
    return canyon + bench + ridge + 9;
  };
  const height = (x, z) => Math.round(rawHeight(x, z) / STEP) * STEP;

  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  pos.needsUpdate = true;
  geo.computeBoundingSphere();

  // Hidden-line look: a solid occluder in the background colour under the wireframe.
  const occluder = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: BG, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }));
  scene.add(occluder);

  // --- Ripple material: lines brighten to the accent where a ring passes.
  const MAX_RIPPLES = 8;
  const ripples = [];
  // x, z, startTime, strength. A negative strength means the ring collapses inward
  // instead of spreading: the buyer's pulses arrive, the shop's leave.
  for (let i = 0; i < MAX_RIPPLES; i++) ripples.push(new THREE.Vector4(0, 0, -100, 0));
  let rippleSlot = 0;
  // The buyer's wavefront: a heading across the canyon, a position along it, and a strength
  // that is zero for the shop. Position is driven from the frame loop so it can be parked.
  const sweep = new THREE.Vector4(0.92, 0.39, 0, 0);
  const SWEEP_SPAN = 110, SWEEP_SPEED = 17;
  const lineMaterial = (color, opacity) => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uAccent: { value: new THREE.Color(0xdc7439) },
      uBg: { value: new THREE.Color(BG) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uRipples: { value: ripples },
      uSweep: { value: sweep },
    },
    vertexShader: `
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mv = viewMatrix * w;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uAccent; uniform vec3 uBg;
      uniform float uOpacity; uniform float uTime;
      uniform vec4 uRipples[${MAX_RIPPLES}];
      varying vec3 vWorld; varying float vDepth;
      void main() {
        float glow = 0.0;
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          vec4 r = uRipples[i];
          float age = uTime - r.z;
          if (r.w <= 0.0 || age < 0.0 || age > 3.4) continue;
          float rad = age * 28.0;
          float d = distance(vWorld.xz, r.xy);
          float ring = exp(-pow((d - rad) / 3.2, 2.0));
          float fade = 1.0 - age / 3.4;
          glow += ring * fade * r.w;
        }
        glow = min(glow, 1.0);
        float fogF = smoothstep(80.0, 210.0, vDepth);
        vec3 c = mix(mix(uColor, uAccent, glow), uBg, fogF);
        float a = (uOpacity + glow * 0.6) * (1.0 - fogF);
        gl_FragColor = vec4(c, a);
      }`,
  });
  const wireMat = lineMaterial(0x55627a, 0.5);
  const contourMat = lineMaterial(0x8593a8, 0.55);

  // Two readings of the same terrain. `cut` carries the toolpath and the end mill, so it is
  // 1 for a shop and 0 for a buyer; `ripple` is the sign handed to new pulses. Everything
  // here except `ripple` is eased, because the audience toggle can fire at any scroll position.
  const LOOK = {
    shop:  { wire: 0.50, contour: 0.55, cut: 1, sweep: 0.00, camSide: 46, camY: 42, dipSide: 18, dipY: 22, ripple: 1 },
    buyer: { wire: 0.22, contour: 0.75, cut: 0, sweep: 0.55, camSide: 58, camY: 54, dipSide: 10, dipY: 12, ripple: -1 },
  };
  const EASED = ["wire", "contour", "cut", "sweep", "camSide", "camY", "dipSide", "dipY"];
  const audienceOf = (el) => (el.dataset.audience === "shop" ? "shop" : "buyer");
  let target = LOOK[audienceOf(document.documentElement)];
  const look = Object.assign({}, target);
  const setAudience = (a) => { target = LOOK[a] || LOOK.buyer; };

  scene.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), wireMat));

  // Contour rings at every terrace level.
  const contourPts = [];
  const cell = SIZE / SEG;
  for (let zi = 0; zi < SEG; zi++) {
    for (let xi = 0; xi < SEG; xi++) {
      const x0 = -SIZE / 2 + xi * cell, z0 = -SIZE / 2 + zi * cell;
      const h = height(x0, z0), hx = height(x0 + cell, z0), hz = height(x0, z0 + cell);
      if (hx !== h) contourPts.push(x0 + cell, Math.max(h, hx) + 0.05, z0, x0 + cell, Math.max(h, hx) + 0.05, z0 + cell);
      if (hz !== h) contourPts.push(x0, Math.max(h, hz) + 0.05, z0 + cell, x0 + cell, Math.max(h, hz) + 0.05, z0 + cell);
    }
  }
  const contourGeo = new THREE.BufferGeometry();
  contourGeo.setAttribute("position", new THREE.Float32BufferAttribute(contourPts, 3));
  scene.add(new THREE.LineSegments(contourGeo, contourMat));

  // --- Toolpath and the end mill that follows it.
  const PASSES = 24, SAMPLES = 90, REGION = 54;
  const path = [];
  for (let p = 0; p < PASSES; p++) {
    const z = -REGION + (p / (PASSES - 1)) * 2 * REGION;
    for (let s = 0; s < SAMPLES; s++) {
      const t = s / (SAMPLES - 1);
      const x = (p % 2 === 0 ? -1 : 1) * (-REGION + t * 2 * REGION);
      path.push(new THREE.Vector3(x, height(x, z) + 1.1, z));
    }
  }
  const trailGeo = new THREE.BufferGeometry().setFromPoints(path);
  trailGeo.setDrawRange(0, 0);
  const trailMat = new THREE.LineBasicMaterial({ color: 0xdc7439, transparent: true, opacity: 0.9, fog: true });
  scene.add(new THREE.Line(trailGeo, trailMat));

  const tool = new THREE.Group();
  const cutter = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 7, 18), new THREE.MeshBasicMaterial({ color: 0xdc7439, transparent: true }));
  cutter.position.y = 3.5;
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 6, 14), new THREE.MeshBasicMaterial({ color: 0x9aa4b0, transparent: true }));
  shank.position.y = 10;
  const flute = new THREE.Mesh(new THREE.BoxGeometry(3.1, 6.6, 0.25), new THREE.MeshBasicMaterial({ color: BG, transparent: true }));
  flute.position.y = 3.5;
  tool.add(cutter, shank, flute);
  const axis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 13, 0), new THREE.Vector3(0, 70, 0)]),
    new THREE.LineBasicMaterial({ color: 0xdc7439, transparent: true, opacity: 0.35 })
  );
  tool.add(axis);
  scene.add(tool);
  // Full-strength opacity per material, scaled by `cut` every frame.
  const cutParts = [[trailMat, 0.9], [cutter.material, 1], [shank.material, 1], [flute.material, 1], [axis.material, 0.35]];

  // --- Ripples
  const clock = new THREE.Clock();
  const addRipple = (x, z, strength = 1) => {
    if (reduceMotion) return;
    // In-flight rings keep the direction they were born with, so a mid-page toggle
    // never turns a pulse inside out.
    ripples[rippleSlot].set(x, z, clock.getElapsedTime(), strength * target.ripple);
    rippleSlot = (rippleSlot + 1) % MAX_RIPPLES;
  };

  // --- Camera: one pose per section of the page, blended as you scroll, plus a nudge from the pointer.
  // t runs the length of the canyon (0 at the top of the page, 1 at the bottom), dip drops the camera
  // into the cut, lift raises it, back pulls it away from what it is looking at, down tilts the gaze.
  const POSES = [
    { id: "top",       t: 0.00, dip: 0.00, lift: 0,  back: 1.00, down: 0 },
    { id: "network",   t: 0.07, dip: 0.15, lift: 0,  back: 1.00, down: 0 },
    { id: "vista-1",   t: 0.15, dip: 0.55, lift: 0,  back: 0.95, down: 1 },
    { id: "minutes",   t: 0.27, dip: 1.00, lift: -2, back: 0.85, down: 3 },
    { id: "how",       t: 0.40, dip: 0.55, lift: 8,  back: 1.05, down: 0 },
    { id: "inside",    t: 0.53, dip: 0.20, lift: 4,  back: 1.30, down: -1 },
    { id: "demo",      t: 0.64, dip: 0.35, lift: 2,  back: 1.10, down: 0 },
    { id: "vista-2",   t: 0.71, dip: 0.80, lift: -1, back: 0.90, down: 2 },
    { id: "exchange",  t: 0.80, dip: 0.90, lift: -3, back: 0.80, down: 4 },
    { id: "voices",    t: 0.88, dip: 0.40, lift: 3,  back: 1.05, down: 0 },
    { id: "pricing",   t: 0.94, dip: 0.00, lift: 8,  back: 1.15, down: -2 },
    { id: "trial",     t: 1.00, dip: 0.00, lift: 10, back: 1.20, down: -2 },
  ];
  const poseWant = { ...POSES[0] }, pose = { ...POSES[0] };
  const POSE_KEYS = ["t", "dip", "lift", "back", "down"];
  const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
  const want = { yaw: 0, pitch: 0 }, cur = { yaw: 0, pitch: 0 };

  // Which section is under the middle of the screen, and how far through it we are.
  const sectionEls = POSES.map((p) => document.getElementById(p.id));
  const trackSections = () => {
    const mid = window.innerHeight * 0.5;
    let i = 0, p = 0;
    for (let k = 0; k < sectionEls.length; k++) {
      const el = sectionEls[k];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.top <= mid) { i = k; p = r.height > 0 ? THREE.MathUtils.clamp((mid - r.top) / r.height, 0, 1) : 0; }
    }
    const a = POSES[i], b = POSES[Math.min(i + 1, POSES.length - 1)];
    const e = p * p * (3 - 2 * p);
    POSE_KEYS.forEach((key) => { poseWant[key] = a[key] + (b[key] - a[key]) * e; });
  };

  const placeCamera = () => {
    const z = 70 - 140 * pose.t;
    const dip = pose.dip;
    const side = (look.camSide - look.dipSide * dip) * pose.back;
    const y = (look.camY - look.dipY * dip) * pose.back + pose.lift;
    camPos.set(meander(z) + side, y, z + 26 * pose.back);
    camTarget.set(meander(z - 40), -6 + 4 * dip - pose.down, z - 40);

    // Pointer nudge: rotate the offset vector around the target.
    const off = camPos.clone().sub(camTarget);
    const yaw = cur.yaw, pitch = cur.pitch;
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const right = new THREE.Vector3().crossVectors(off, new THREE.Vector3(0, 1, 0)).normalize();
    off.applyAxisAngle(right, -pitch);
    camera.position.copy(camTarget).add(off);
    camera.lookAt(camTarget);
  };

  let dragging = false, lastX = 0, lastY = 0, moved = 0;
  window.addEventListener("pointermove", (e) => {
    if (dragging) {
      want.yaw += (e.clientX - lastX) * 0.004;
      want.pitch = THREE.MathUtils.clamp(want.pitch + (e.clientY - lastY) * 0.003, -0.2, 0.3);
      moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
    } else {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      want.yaw = -nx * 0.18;
      want.pitch = ny * 0.08;
    }
  }, { passive: true });
  host.addEventListener("pointerdown", (e) => { dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; });
  const raycaster = new THREE.Raycaster();
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    if (moved < 6 && e) {
      // A click, not a drag: send a pulse from where the canyon was hit.
      const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(occluder, false)[0];
      if (hit) addRipple(hit.point.x, hit.point.z, 1);
    }
  };
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", () => { dragging = false; });

  // Scroll: which section we are in, and a ripple every so often while moving.
  let rippleScrollAcc = 0, lastScrollY = window.scrollY;
  const onScroll = () => {
    trackSections();
    rippleScrollAcc += Math.abs(window.scrollY - lastScrollY);
    lastScrollY = window.scrollY;
    if (rippleScrollAcc > 260) {
      rippleScrollAcc = 0;
      const z = camTarget.z + (Math.random() - 0.5) * 60;
      addRipple(meander(z) + (Math.random() - 0.5) * 40, z, 0.7);
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", trackSections);
  onScroll();

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  // --- Frame loop
  let progress = reduceMotion ? 0.62 : 0.0;
  const SPEED = 1 / 52;
  let lastPulse = 0;
  // Parked mid-terrain under reduced motion, so the buyer still gets a resting frame.
  let sweepPos = reduceMotion ? 0 : -SWEEP_SPAN;
  let last = performance.now();
  let hidden = document.hidden;
  document.addEventListener("visibilitychange", () => { hidden = document.hidden; });

  const applyProgress = () => {
    const idx = Math.max(0, Math.min(path.length - 1, Math.floor(progress * (path.length - 1))));
    trailGeo.setDrawRange(0, idx + 1);
    tool.position.copy(path[idx]);
  };

  const applyLook = () => {
    wireMat.uniforms.uOpacity.value = look.wire;
    contourMat.uniforms.uOpacity.value = look.contour;
    cutParts.forEach(([m, base]) => { m.opacity = base * look.cut; });
    tool.visible = look.cut > 0.01;
    sweep.z = sweepPos;
    sweep.w = look.sweep;
  };

  const frame = (now) => {
    requestAnimationFrame(frame);
    if (hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = clock.getElapsedTime();
    wireMat.uniforms.uTime.value = time;
    contourMat.uniforms.uTime.value = time;

    // Ease between the two readings. Reduced motion snaps instead.
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt / 0.18);
    EASED.forEach((key) => { look[key] += (target[key] - look[key]) * k; });

    if (!reduceMotion) {
      progress += dt * SPEED;
      if (progress >= 1) progress = 0;
      cutter.rotation.y += dt * 40;
      flute.rotation.y = cutter.rotation.y;
      cur.yaw += (want.yaw - cur.yaw) * 0.06;
      cur.pitch += (want.pitch - cur.pitch) * 0.06;
      POSE_KEYS.forEach((key) => { pose[key] += (poseWant[key] - pose[key]) * 0.07; });
      if (look.sweep > 0.01) {
        sweepPos += dt * SWEEP_SPEED;
        // The band is clear of the terrain at both ends, so the wrap is never seen.
        if (sweepPos > SWEEP_SPAN) sweepPos = -SWEEP_SPAN;
      }
      // A pulse every few seconds: the cutter probing for a shop, the canyon answering for a buyer.
      if (time - lastPulse > (look.cut > 0.5 ? 3.6 : 4.2)) {
        lastPulse = time;
        if (look.cut > 0.5) addRipple(tool.position.x, tool.position.z, 0.55);
        else addRipple(meander(camTarget.z) + (Math.random() - 0.5) * 50, camTarget.z + (Math.random() - 0.5) * 50, 0.55);
      }
    } else {
      POSE_KEYS.forEach((key) => { pose[key] = poseWant[key]; });
    }
    applyProgress();
    applyLook();
    placeCamera();
    renderer.render(scene, camera);
  };
  applyProgress();
  applyLook();
  placeCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);

  document.addEventListener("canyon:audience", (e) => setAudience(e.detail));

  return { addRipple, setAudience };
})();

/* ------------------------------------------------------------------ */
/* Scroll reveal for panels and vista lines                             */
/* ------------------------------------------------------------------ */
(function reveal() {
  const els = $$(".reveal");
  if (!els.length) return;
  // Children of a .stagger list get an index so CSS can delay each one a little more.
  $$(".stagger").forEach((list) => Array.from(list.children).forEach((child, i) => child.style.setProperty("--i", i)));
  if (reduceMotion || !("IntersectionObserver" in window)) { els.forEach((el) => el.classList.add("is-in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
  }, { threshold: 0.18 });
  els.forEach((el) => io.observe(el));
})();

/* ------------------------------------------------------------------ */
/* How it works: the steps light up as you scroll through the section  */
/* ------------------------------------------------------------------ */
(function stepsRail() {
  const panel = $("#how-panel");
  if (!panel) return;
  const lists = $$(".steps", panel);
  if (reduceMotion) { lists.forEach((l) => $$("li", l).forEach((li) => li.classList.add("is-lit"))); return; }
  let ticking = false;
  const update = () => {
    ticking = false;
    const r = panel.getBoundingClientRect();
    const mid = window.innerHeight * 0.55;
    // 0 when the panel's top reaches mid-screen, 1 when its bottom does.
    const p = r.height > 0 ? Math.min(1, Math.max(0, (mid - r.top) / r.height)) : 0;
    lists.forEach((l) => {
      const items = $$("li", l);
      const lit = Math.floor(p * (items.length + 0.999));
      items.forEach((li, i) => li.classList.toggle("is-lit", i < lit));
    });
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
})();

/* ------------------------------------------------------------------ */
/* Animated exchange: loops while in view                               */
/* ------------------------------------------------------------------ */
(function exchange() {
  const thread = $("#thread");
  const lists = $$("#thread .messages");
  const offer = $("#offer");
  const panel = $("#exchange-panel");
  if (!thread || !lists.length) return;
  let popTimer = null;
  const setOffer = (text) => {
    if (!offer) return;
    offer.textContent = text;
    offer.classList.add("pop");
    clearTimeout(popTimer);
    popTimer = setTimeout(() => offer.classList.remove("pop"), 240);
  };

  // Each audience has its own thread. Play whichever one is showing.
  const current = () => lists.find((l) => l.dataset.audience === document.documentElement.dataset.audience) || lists[0];
  let list = current();
  let msgs = $$(".msg", list);

  const showUpTo = (n) => {
    msgs.forEach((m, i) => m.classList.toggle("is-in", i <= n));
    if (n >= 0) setOffer(msgs[n].dataset.offer);
  };

  if (reduceMotion) {
    const showAll = () => {
      lists.forEach((l) => $$(".msg", l).forEach((m) => m.classList.remove("is-in")));
      list = current(); msgs = $$(".msg", list); showUpTo(msgs.length - 1);
    };
    showAll();
    document.addEventListener("canyon:audience", showAll);
    return;
  }

  let i = -1, timer = null, running = false;
  const step = () => {
    i++;
    if (i >= msgs.length) {
      // Hold on the last line, then start over.
      if (panel) panel.classList.remove("is-talking");
      timer = setTimeout(() => { i = -1; showUpTo(-1); if (offer) offer.textContent = "Offer"; if (panel) panel.classList.add("is-talking"); timer = setTimeout(step, 700); }, 3200);
      return;
    }
    showUpTo(i);
    // Every message sends a pulse down the canyon behind the page.
    if (viewport) viewport.addRipple((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, i === msgs.length - 1 ? 0.7 : 0.35);
    timer = setTimeout(step, i === msgs.length - 1 ? 0 : 1250);
  };
  const start = () => { if (running) return; running = true; i = -1; showUpTo(-1); if (panel) panel.classList.add("is-talking"); timer = setTimeout(step, 400); };
  const stop = () => { running = false; clearTimeout(timer); if (panel) panel.classList.remove("is-talking"); };

  document.addEventListener("canyon:audience", () => {
    const next = current();
    if (next === list) return;
    const wasRunning = running;
    stop();
    lists.forEach((l) => $$(".msg", l).forEach((m) => m.classList.remove("is-in")));
    list = next;
    msgs = $$(".msg", list);
    showUpTo(-1);
    if (offer) offer.textContent = "Offer";
    if (wasRunning) start();
  });

  showUpTo(-1);
  new IntersectionObserver((entries) => { entries[0].isIntersecting ? start() : stop(); }, { threshold: 0.35 }).observe(thread);
})();

/* Demo video slot: the poster swaps for the player on click             */
/* ------------------------------------------------------------------ */
(function video() {
  const box = $("#video");
  const play = $("#video-play");
  if (!box || !play) return;
  const src = box.dataset.src;
  if (!src) { play.hidden = true; return; }
  play.addEventListener("click", () => {
    const f = document.createElement("iframe");
    // Loom reads autoplay=true; YouTube and Vimeo read autoplay=1.
    const autoplay = src.includes("loom.com") ? "autoplay=true" : "autoplay=1";
    f.src = src + (src.includes("?") ? "&" : "?") + autoplay;
    f.allow = "autoplay; fullscreen; picture-in-picture";
    f.title = "Canyon demo video";
    box.appendChild(f);
    play.remove();
  });
})();

/* ------------------------------------------------------------------ */
/* Trial form (no backend yet)                                          */
/* ------------------------------------------------------------------ */
(function trialForm() {
  const form = $("#trial-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("#trial-email");
    const field = email.closest(".field");
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    field.classList.toggle("is-invalid", !ok);
    if (!ok) { email.focus(); return; }
    $("#done-email").textContent = email.value.trim();
    form.classList.add("is-done");
  });
})();
