// Canyon landing page behaviour.
// 1. Hero: a Three.js canyon terrain rendered as CAD wireframe, machined live by an end mill.
// 2. Pricing demo: feature-level cost breakdown that reacts to a tolerance choice.
// 3. Negotiation demo: buyer agent vs shop agents converging over rounds.
// 4. Verified supply demo: requirement chips filter shops by verified capability.

import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmt = (n) => "$" + Math.round(n).toLocaleString("en-US");

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
/* Audience toggle: buyer vs machine shop version of the page           */
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
  };

  picks.forEach((b) => b.addEventListener("click", () => setAudience(b.dataset.audiencePick)));
  // Sync the buttons and the form with whatever the inline script chose before paint.
  setAudience(root.dataset.audience === "shop" ? "shop" : "buyer");
})();

/* ------------------------------------------------------------------ */
/* Demo dialog                                                          */
/* ------------------------------------------------------------------ */
const dialog = $("#demo-dialog");
$$("[data-open-demo]").forEach((btn) =>
  btn.addEventListener("click", () => dialog && dialog.showModal())
);
$$("[data-close-demo]").forEach((btn) =>
  btn.addEventListener("click", () => dialog && dialog.close())
);

/* ------------------------------------------------------------------ */
/* Hero viewport                                                        */
/* ------------------------------------------------------------------ */
(function heroViewport() {
  const host = $(".hero-canvas");
  if (!host) return;

  const BG = 0x1e2328;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(BG, 1);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 90, 190);
  const camera = new THREE.PerspectiveCamera(36, 1, 1, 400);

  // --- Terrain: a meandering canyon, quantised into terraces like CNC step-downs.
  const SIZE = 130;
  const SEG = 110;
  const STEP = 2.4;

  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    const u = smooth(xf), v = smooth(yf);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  const rawHeight = (x, z) => {
    const meander = 11 * Math.sin(z * 0.055) + 4 * Math.sin(z * 0.16 + 1.3);
    const d = x - meander;
    const canyon = -27 * Math.exp(-(d * d) / (2 * 13 * 13));
    const bench = -6 * Math.exp(-(d * d) / (2 * 26 * 26));
    const ridge = 4.5 * noise(x * 0.07 + 3, z * 0.07) + 1.6 * noise(x * 0.22, z * 0.22 + 9);
    return canyon + bench + ridge + 9;
  };
  const height = (x, z) => Math.round(rawHeight(x, z) / STEP) * STEP;

  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;

  // Hidden-line look: a solid occluder in the background colour under the wireframe.
  const occluder = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: BG, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 })
  );
  scene.add(occluder);

  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x55627a, transparent: true, opacity: 0.5 })
  );
  scene.add(wire);

  // Contour rings at every terrace level: the lines a CAM package would show.
  const contourPts = [];
  const cell = SIZE / SEG;
  for (let zi = 0; zi < SEG; zi++) {
    for (let xi = 0; xi < SEG; xi++) {
      const x0 = -SIZE / 2 + xi * cell, z0 = -SIZE / 2 + zi * cell;
      const h = height(x0, z0);
      const hx = height(x0 + cell, z0);
      const hz = height(x0, z0 + cell);
      if (hx !== h) contourPts.push(x0 + cell, Math.max(h, hx) + 0.05, z0, x0 + cell, Math.max(h, hx) + 0.05, z0 + cell);
      if (hz !== h) contourPts.push(x0, Math.max(h, hz) + 0.05, z0 + cell, x0 + cell, Math.max(h, hz) + 0.05, z0 + cell);
    }
  }
  const contourGeo = new THREE.BufferGeometry();
  contourGeo.setAttribute("position", new THREE.Float32BufferAttribute(contourPts, 3));
  scene.add(new THREE.LineSegments(contourGeo, new THREE.LineBasicMaterial({ color: 0x8593a8, transparent: true, opacity: 0.55 })));

  // --- Toolpath: a raster over the canyon, and the end mill that follows it.
  const PASSES = 22;
  const SAMPLES = 90;
  const REGION = 48;
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
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xdc7439, transparent: true, opacity: 0.9 }));
  scene.add(trail);

  const tool = new THREE.Group();
  const toolMat = new THREE.MeshBasicMaterial({ color: 0xdc7439 });
  const cutter = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 7, 18), toolMat);
  cutter.position.y = 3.5;
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 6, 14), new THREE.MeshBasicMaterial({ color: 0x9aa4b0 }));
  shank.position.y = 10;
  const flute = new THREE.Mesh(new THREE.BoxGeometry(3.1, 6.6, 0.25), new THREE.MeshBasicMaterial({ color: 0x1e2328 }));
  flute.position.y = 3.5;
  tool.add(cutter, shank, flute);
  // Spindle axis drawn up from the tool: the Z axis of the machine.
  const axisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 13, 0), new THREE.Vector3(0, 60, 0)]);
  tool.add(new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: 0xdc7439, transparent: true, opacity: 0.35 })));
  scene.add(tool);

  // --- Camera orbit: base angle plus a little from the pointer.
  const target = new THREE.Vector3(2, -6, 4);
  const base = { theta: 0.75, phi: 0.56, r: 118 };
  const want = { theta: 0, phi: 0 };
  const cur = { theta: 0, phi: 0 };
  let scrollLift = 0;

  const placeCamera = () => {
    const theta = base.theta + cur.theta;
    const phi = base.phi + cur.phi + scrollLift * 0.35;
    camera.position.set(
      target.x + base.r * Math.cos(phi) * Math.sin(theta),
      target.y + base.r * Math.sin(phi) + scrollLift * 30,
      target.z + base.r * Math.cos(phi) * Math.cos(theta)
    );
    camera.lookAt(target);
  };

  const hero = $(".hero");
  let dragging = false, lastX = 0, lastY = 0;
  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    if (dragging) {
      want.theta += (e.clientX - lastX) * 0.004;
      want.phi = THREE.MathUtils.clamp(want.phi + (e.clientY - lastY) * 0.003, -0.25, 0.35);
      lastX = e.clientX; lastY = e.clientY;
    } else {
      want.theta = -nx * 0.22;
      want.phi = ny * 0.10;
    }
  });
  host.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; host.setPointerCapture(e.pointerId); });
  host.addEventListener("pointerup", () => { dragging = false; });
  host.addEventListener("pointercancel", () => { dragging = false; });

  const onScroll = () => {
    const r = hero.getBoundingClientRect();
    scrollLift = THREE.MathUtils.clamp(-r.top / Math.max(r.height, 1), 0, 1);
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  // --- Readout: the instrument panel is driven by the machining progress.
  const ro = {
    pass: $("#ro-pass"), removed: $("#ro-removed"), time: $("#ro-time"), bar: $("#ro-bar")
  };
  const TOTAL_CM3 = 184.6;
  const TOTAL_MIN = 38.4;
  const setReadout = (progress) => {
    const pass = Math.min(PASSES, Math.floor(progress * PASSES) + 1);
    if (ro.pass) ro.pass.textContent = `${pass} of ${PASSES}`;
    if (ro.removed) ro.removed.textContent = `${(progress * TOTAL_CM3).toFixed(1)} cm³`;
    if (ro.time) ro.time.textContent = `${(progress * TOTAL_MIN).toFixed(1)} min`;
    if (ro.bar) ro.bar.style.width = `${(progress * 100).toFixed(1)}%`;
  };

  let progress = reduceMotion ? 0.62 : 0.0;
  let last = performance.now();
  const SPEED = 1 / 48; // full toolpath in 48 s
  let visible = true;
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }, { threshold: 0.05 }).observe(hero);

  const applyProgress = () => {
    const idx = Math.min(path.length - 1, Math.floor(progress * (path.length - 1)));
    trailGeo.setDrawRange(0, idx + 1);
    tool.position.copy(path[idx]);
    setReadout(progress);
  };

  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible) {
      if (!reduceMotion) {
        progress += dt * SPEED;
        if (progress >= 1) progress = 0;
        cutter.rotation.y += dt * 40;
        flute.rotation.y = cutter.rotation.y;
        cur.theta += (want.theta - cur.theta) * 0.06;
        cur.phi += (want.phi - cur.phi) * 0.06;
      }
      applyProgress();
      placeCamera();
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  };
  applyProgress();
  placeCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
})();

/* ------------------------------------------------------------------ */
/* Pricing demo: feature extraction on a real-looking part              */
/* ------------------------------------------------------------------ */
(function pricingDemo() {
  const list = $("#feature-list");
  if (!list) return;

  // Placeholder cost model for a 6061-T6 bracket, qty 25. Replace with model output.
  const features = [
    { id: "stock", name: "Stock and facing", op: "Face both sides, 2 setups", min: 6.2, cost: 9.4 },
    { id: "pocket", name: "Through pocket, 62 x 34 mm", op: "Rough and finish, 10 mm end mill", min: 8.7, cost: 13.1 },
    { id: "holes", name: "4x Ø6.6 mm clearance holes", op: "Spot, drill, chamfer", min: 1.9, cost: 2.9 },
    { id: "bore", name: "Ø20 H7 bore", op: "Drill, bore, ream", min: 3.4, cost: 5.1, tol: true },
    { id: "slot", name: "Slot, 8 x 40 mm", op: "Plunge and slot, 8 mm end mill", min: 2.6, cost: 3.9 },
    { id: "fillet", name: "R3 outside corners", op: "Contour, 6 mm end mill", min: 1.4, cost: 2.1 },
  ];
  const tolerance = { "0.02": { add: 0, lead: 6, label: "±0.02 mm" }, "0.005": { add: 14.6, lead: 8, label: "±0.005 mm" } };
  const QTY = 25;
  let tol = "0.02";
  let active = "pocket";

  const render = () => {
    list.innerHTML = "";
    let unit = 0;
    features.forEach((f) => {
      const li = document.createElement("li");
      li.dataset.id = f.id;
      li.className = f.id === active ? "is-active" : "";
      li.tabIndex = 0;
      const cost = f.cost + (f.tol ? tolerance[tol].add : 0);
      unit += cost;
      li.innerHTML = `
        <span class="name">${f.name}</span>
        <span class="cost">${fmt(cost)}</span>
        <span class="op">${f.op}</span>
        <span class="time">${f.min.toFixed(1)} min</span>
        ${f.tol ? `<select id="bore-tol" aria-label="Bore tolerance">
            <option value="0.02"${tol === "0.02" ? " selected" : ""}>Bore tolerance ±0.02 mm</option>
            <option value="0.005"${tol === "0.005" ? " selected" : ""}>Bore tolerance ±0.005 mm</option>
          </select>` : ""}`;
      li.addEventListener("click", () => setActive(f.id));
      li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActive(f.id); } });
      list.appendChild(li);
    });
    const sel = $("#bore-tol");
    if (sel) {
      sel.addEventListener("click", (e) => e.stopPropagation());
      sel.addEventListener("change", (e) => { tol = e.target.value; render(); setActive("bore"); });
    }
    const low = unit * QTY * 0.94, high = unit * QTY * 1.11;
    $("#total-band").textContent = `${fmt(low)} to ${fmt(high)}`;
    $("#total-unit").textContent = `${fmt(unit)} per part, qty ${QTY}`;
    $("#total-lead").textContent = `${tolerance[tol].lead} business days`;
    const note = $("#tol-note");
    if (note) note.textContent = tol === "0.005"
      ? `Tightening the bore to ${tolerance[tol].label} adds ${fmt(tolerance[tol].add * QTY)} to the order. A press-fit sleeve would cost less.`
      : `At ${tolerance[tol].label} the bore is a ream operation. Tighten it to see the price move.`;
  };

  const setActive = (id) => {
    active = id;
    $$("#feature-list li").forEach((li) => li.classList.toggle("is-active", li.dataset.id === id));
    $$(".drawing .feature").forEach((g) => g.classList.toggle("is-active", g.dataset.feature === id));
  };

  $$(".drawing .feature").forEach((g) => {
    g.addEventListener("click", () => setActive(g.dataset.feature));
  });

  render();
  setActive(active);
})();

/* ------------------------------------------------------------------ */
/* Negotiation demo                                                     */
/* ------------------------------------------------------------------ */
(function negotiationDemo() {
  const svg = $("#neg-chart");
  const log = $("#transcript");
  if (!svg || !log) return;

  // Placeholder run. Rounds are offers from three shop agents against a buyer agent target.
  const target = 440;
  const shops = [
    { name: "Halvorsen", color: "#8593a8", offers: [512, 498, 484, 471, 466, 464] },
    { name: "Cascade", color: "#dc7439", offers: [489, 476, 469, 463, 461, 461] },
    { name: "Ironwood", color: "#5f6d80", offers: [531, 520, 511, 505, 505, 505] },
  ];
  const lines = [
    { who: "Buyer agent", cls: "buyer", what: `Target ${fmt(target)}, lead time 8 days or better, qty 25, 6061-T6. Open to 10% over target for a shorter lead.` },
    { who: "Halvorsen", what: "Opening at $512, 9 days. Queue is 71% loaded this week." },
    { who: "Cascade", what: "Opening at $489, 7 days. Have 6061 bar on the floor." },
    { who: "Ironwood", what: "Opening at $531, 6 days. Tight bore costs us a probe cycle." },
    { who: "Buyer agent", cls: "buyer", what: "Counter: $455 at 7 days. Willing to release the anodize callout to a separate order." },
    { who: "Cascade", what: "$469 at 7 days, anodize out. Can hold that for 48 hours." },
    { who: "Halvorsen", what: "$471 at 8 days. Will not go under 470 on this bore tolerance." },
    { who: "Buyer agent", cls: "buyer", what: "Round 4: $461 at 7 days is inside the band. Asking for final numbers." },
    { who: "Cascade", what: "$461 at 7 days. Final." },
    { who: "Ironwood", what: "$505. Passing on this one." },
    { who: "Matched", cls: "buyer", what: "Cascade CNC at $461 per part, 7 business days. Buyer approved in 3 minutes.", final: true },
  ];

  // Chart geometry
  const W = 600, H = 300, PAD = { l: 52, r: 20, t: 16, b: 34 };
  const rounds = 6;
  const yMin = 420, yMax = 540;
  const x = (i) => PAD.l + (i / (rounds - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);

  const el = (tag, attrs = {}) => {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  };

  const build = () => {
    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    // gridlines and labels
    for (let v = yMin; v <= yMax; v += 20) {
      svg.appendChild(el("line", { x1: PAD.l, x2: W - PAD.r, y1: y(v), y2: y(v), stroke: "#3b434d", "stroke-width": 1 }));
      const t = el("text", { x: PAD.l - 8, y: y(v) + 4, fill: "#9aa4b0", "font-size": 11, "text-anchor": "end", "font-family": "IBM Plex Mono, monospace" });
      t.textContent = "$" + v;
      svg.appendChild(t);
    }
    for (let i = 0; i < rounds; i++) {
      const t = el("text", { x: x(i), y: H - 12, fill: "#9aa4b0", "font-size": 11, "text-anchor": "middle", "font-family": "IBM Plex Mono, monospace" });
      t.textContent = i === 0 ? "open" : "round " + i;
      svg.appendChild(t);
    }
    // target band
    svg.appendChild(el("rect", { x: PAD.l, y: y(target * 1.1), width: W - PAD.l - PAD.r, height: y(target) - y(target * 1.1), fill: "rgba(220,116,57,0.10)" }));
    svg.appendChild(el("line", { x1: PAD.l, x2: W - PAD.r, y1: y(target), y2: y(target), stroke: "#dc7439", "stroke-width": 1, "stroke-dasharray": "4 4" }));
    const tl = el("text", { x: W - PAD.r, y: y(target) - 6, fill: "#dc7439", "font-size": 11, "text-anchor": "end", "font-family": "IBM Plex Mono, monospace" });
    tl.textContent = "buyer target $" + target;
    svg.appendChild(tl);
    // series
    shops.forEach((s, si) => {
      const d = s.offers.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
      const p = el("path", { d, fill: "none", stroke: s.color, "stroke-width": si === 1 ? 2.5 : 1.75, "stroke-linejoin": "round", class: "series" });
      p.dataset.shop = s.name;
      svg.appendChild(p);
      s.offers.forEach((v, i) => {
        const c = el("circle", { cx: x(i), cy: y(v), r: 3.2, fill: "#171b1f", stroke: s.color, "stroke-width": 1.75, class: "pt" });
        c.dataset.round = i;
        svg.appendChild(c);
      });
    });
  };

  let timer = null;
  const showRound = (r) => {
    $$(".series", svg).forEach((p) => {
      const len = p.getTotalLength();
      const frac = Math.min(1, r / (rounds - 1));
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len * (1 - frac)}`;
      p.style.transition = reduceMotion ? "none" : "stroke-dashoffset 700ms ease";
    });
    $$(".pt", svg).forEach((c) => { c.style.opacity = Number(c.dataset.round) <= r ? "1" : "0"; c.style.transition = "opacity 300ms ease"; });
  };

  const renderLog = (upto) => {
    log.innerHTML = "";
    lines.forEach((l, i) => {
      const li = document.createElement("li");
      li.className = (i <= upto ? "is-live" : "") + (l.final ? " final" : "");
      li.innerHTML = `<span class="who ${l.cls || ""}">${l.who}</span><span class="what">${l.what}</span>`;
      log.appendChild(li);
    });
  };

  // Which transcript line corresponds to which round on the chart
  const roundForLine = [0, 0, 0, 0, 1, 2, 2, 3, 4, 5, 5];

  const run = () => {
    if (timer) clearInterval(timer);
    build();
    if (reduceMotion) { renderLog(lines.length - 1); showRound(rounds - 1); return; }
    let i = -1;
    renderLog(-1);
    showRound(0);
    timer = setInterval(() => {
      i++;
      if (i >= lines.length) { clearInterval(timer); timer = null; return; }
      renderLog(i);
      showRound(roundForLine[i]);
      const live = $(".transcript li.is-live:last-of-type");
      if (live) live.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 950);
  };

  $("#neg-run").addEventListener("click", run);
  // First paint at rest: the finished run, so the section reads without a click.
  build();
  renderLog(lines.length - 1);
  showRound(rounds - 1);
})();

/* ------------------------------------------------------------------ */
/* Verified supply demo                                                 */
/* ------------------------------------------------------------------ */
(function supplyDemo() {
  const chips = $$(".chip");
  const rows = $$("#shops li");
  const count = $("#match-count");
  if (!chips.length || !rows.length) return;

  const update = () => {
    const need = chips.filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => c.dataset.cap);
    let hits = 0;
    rows.forEach((row) => {
      const caps = row.dataset.caps.split(" ");
      const ok = need.every((n) => caps.includes(n));
      row.classList.toggle("is-out", !ok);
      $$(".caps span", row).forEach((s) => s.classList.toggle("hit", need.includes(s.dataset.cap)));
      if (ok) hits++;
    });
    count.innerHTML = need.length
      ? `<strong>${hits} of ${rows.length}</strong> verified shops meet all ${need.length} requirement${need.length > 1 ? "s" : ""}. Only these enter the negotiation.`
      : `Pick a requirement. Every shop on this list has had its machines, envelope, and certifications verified.`;
  };

  chips.forEach((c) => c.addEventListener("click", () => {
    c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") === "true" ? "false" : "true");
    update();
  }));
  update();
})();

/* ------------------------------------------------------------------ */
/* Trial form (no backend yet: validates and shows the confirmation)    */
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
