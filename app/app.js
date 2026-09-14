// Canyon customer UI. Static screens with timed reveals so each page plays its own story.
// Data is the Halcyon Industrial example from the design mockups. Replace with live data later.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const screen = document.body.dataset.screen;

/* Tick engine: each screen advances a counter; renderers read it. */
const SPEED = { home: 2000, queue: 1100, new: 420, part: 700, negotiation: 1300, offers: 1500 };
const MAX = { home: 4, queue: 9, new: 14, part: 8, negotiation: 9, offers: 4 };
let tick = reduceMotion ? MAX[screen] : 0;
const renderers = [];
const render = () => renderers.forEach((fn) => fn(tick));
const start = () => {
  render();
  if (reduceMotion) return;
  setInterval(() => {
    tick = tick >= MAX[screen] ? (screen === "queue" ? 0 : MAX[screen]) : tick + 1;
    render();
  }, SPEED[screen] || 900);
};
const inAt = (n) => (tick >= n ? "t is-in" : "t");

/* ------------------------------------------------------------------ */
/* Home                                                                 */
/* ------------------------------------------------------------------ */
if (screen === "home") {
  const pillars = [
    ["CAD-native pricing", "Setups, tolerances, material removal and finish callouts come off the model and the print. No estimator, no queue, no two-day wait."],
    ["Agent-mediated negotiation", "You set the mandate: ceiling, date, terms, certifications. Your agent negotiates against shop agents and only interrupts you at the edge of your bounds."],
    ["Verified supply", "Machines, envelopes, held tolerances, certifications and current queue depth are verified before a shop can bid. A match is a claim we stand behind."],
  ];
  const steps = [
    ["0:00", "Drop the CAD", "STEP, native part files, or a folder with the bubbled print. Canyon reads both."],
    ["1:30", "Get a band", "A price band, a lead-time range, and the manufacturability findings that move either one."],
    ["Same day", "Agents negotiate", "Verified shops bid and counter against your mandate. You watch, or you ignore it."],
    ["Day 1", "Award", "Ranked offers with on-time records attached. Single or split award, your call."],
  ];
  const market = [
    ["$44.6B", "US machine shop industry, fragmented across about 17,000 establishments"],
    ["2 to 5 days", "Typical wait for a single quote today, per shop, per revision"],
    ["20 to 60 min", "Estimator time burned per RFQ, most of it on jobs the shop never wins"],
    ["0", "Shops on Canyon that have not had their machines and certifications verified"],
  ];
  $("#pillars").innerHTML = pillars.map(([t, b], i) => `<div class="card ${inAt(i)}"><span class="mono accent">0${i + 1}</span><h3>${t}</h3><p>${b}</p></div>`).join("");
  $("#steps").innerHTML = steps.map(([time, t, b], i) => `<li class="${inAt(i + 1)}"><span class="time">${time}</span><h3>${t}</h3><p>${b}</p></li>`).join("");
  $("#market").innerHTML = market.map(([v, l], i) => `<div class="${inAt(i)}"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");
  renderers.push(() => {
    $$("#pillars .card").forEach((el, i) => el.classList.toggle("is-in", tick >= i));
    $$("#steps li").forEach((el, i) => el.classList.toggle("is-in", tick >= i + 1));
    $$("#market > div").forEach((el, i) => el.classList.toggle("is-in", tick >= i));
    const prices = ["$99.10", "$97.80", "$96.40", "$94.90", "$94.90"];
    $("#live-price").textContent = prices[Math.min(tick, prices.length - 1)];
  });
}

/* ------------------------------------------------------------------ */
/* Request queue                                                        */
/* ------------------------------------------------------------------ */
if (screen === "queue") {
  const kpis = [
    ["Open requests", "12", "4 awaiting your decision"],
    ["In negotiation", "5", "agents active now"],
    ["Avg. time to price", "84 s", "was 3.4 days"],
    ["Savings YTD", "$214k", "vs. 2025 award prices"],
  ];
  const rows = [
    { id: "RFQ-4417", ago: "2 h ago", part: "Actuator Housing", sub: "Rev C, 3 setups, ±.0005 bore", qty: "250", mat: "6061-T6", base: 3, band: "$88 to $104", need: "Nov 14", href: "negotiation.html" },
    { id: "RFQ-4402", ago: "1 d ago", part: "Manifold Block", sub: "Rev A, cross-drilled, deburr critical", qty: "120", mat: "Ti-6Al-4V", base: 4, band: "$412 to $487", need: "Dec 02", href: "offers.html" },
    { id: "RFQ-4396", ago: "3 d ago", part: "Sensor Bracket", sub: "Rev F, repeat order, 4th release", qty: "1,000", mat: "304 SS", base: 5, band: "$11.40 firm", need: "Oct 28", href: "offers.html" },
    { id: "RFQ-4388", ago: "4 d ago", part: "Isogrid Panel", sub: "Rev B, thin wall .090 ribs", qty: "25", mat: "6061-T6", base: 2, band: "pricing", need: "Dec 19", href: "part.html" },
    { id: "RFQ-4371", ago: "9 d ago", part: "Valve Body", sub: "Rev B, awarded to Cascade Machine", qty: "500", mat: "17-4 PH", base: 5, band: "$61.80 firm", need: "Oct 02", href: "offers.html" },
  ];
  const stages = ["Uploaded", "Priced", "Matched", "Negotiating", "Offers ready", "Awarded"];
  $("#kpis").innerHTML = kpis.map(([l, v, s]) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");
  renderers.push(() => {
    $("#rows").innerHTML = rows.map((r, i) => {
      const adv = Math.min(5, r.base + (tick > i * 2 ? 1 : 0));
      const pips = [0, 1, 2, 3, 4].map((n) => `<i class="${n < adv ? "on" : ""}"></i>`).join("");
      return `<tr>
        <td><a class="id" href="${r.href}">${r.id}</a><span class="sub">${r.ago}</span></td>
        <td>${r.part}<span class="sub">${r.sub}</span></td>
        <td class="num">${r.qty}</td>
        <td>${r.mat}</td>
        <td><span class="pips">${pips}</span><span class="stage ${adv >= 4 ? "hot" : "muted"}">${stages[adv]}</span></td>
        <td class="num">${r.band}</td>
        <td class="num">${r.need}</td>
      </tr>`;
    }).join("");
  });
}

/* ------------------------------------------------------------------ */
/* New request                                                          */
/* ------------------------------------------------------------------ */
if (screen === "new") {
  const files = [
    ["STP", "HAL-4417_rev_c.stp", "CAD, 18.2 MB", 1, "Reading"],
    ["PDF", "HAL-4417_RD_bubbled.pdf", "Drawing, 2.8 MB", 3, "Queued"],
    ["XLS", "halcyon_terms_2026.xlsx", "Terms sheet, 88 KB", 5, "Queued", "Applied"],
  ];
  const req = [
    ["Quantity", "250 ea", "You", ""],
    ["Material", "6061-T6", "From CAD", "cad"],
    ["Finish", "Bead blast + clear anodize", "From print", "cad"],
    ["Tolerance class", "±0.005 typ.", "From print", "cad"],
    ["Need by", "Nov 14, 2026", "You", ""],
    ["Payment terms", "Net 45", "Default", ""],
  ];
  const certs = ["ISO 9001 required", "AS9100 preferred", "Domestic only (DFARS)", "FAI on first article", "Material certs to Halcyon QA"];
  const feats = [
    ["Format", "STEP AP214"], ["Setups required", "3"], ["Faces / holes", "412 / 34"], ["Threaded holes", "12 (¼-20, M6)"],
    ["Tightest tolerance", "±0.0005 in"], ["Material removal", "71% by volume"], ["GD&T frames read", "7"], ["Surface finish", "Ra 32 / bead blast"],
  ];
  $("#req").innerHTML = req.map(([l, v, tag, c]) => `<li><span class="l">${l}</span><span class="v">${v}</span><span class="tag ${c}">${tag}</span></li>`).join("");
  $("#certs").innerHTML = certs.map((c, i) => `<span class="${i === 0 ? "req" : ""}">${c}</span>`).join("");
  $("#feats").innerHTML = feats.map(([l, v]) => `<li class="t"><span class="l">${l}</span><span class="v">${v}</span></li>`).join("");
  renderers.push(() => {
    $("#files").innerHTML = files.map(([ext, name, meta, at, waiting, done]) =>
      `<li><span class="ext">${ext}</span><span>${name}<span class="meta">${meta}</span></span><span class="state ${tick > at ? "done" : ""}">${tick > at ? (done || "Read") : waiting}</span></li>`).join("");
    const pct = Math.min(100, tick * 9);
    $("#pct").textContent = pct + "%";
    $("#pct-bar").style.width = pct + "%";
    $$("#feats li").forEach((el, i) => el.classList.toggle("is-in", i < Math.max(0, tick - 1)));
    $("#price-block").classList.toggle("dim", pct < 100);
  });
}

/* ------------------------------------------------------------------ */
/* Part and DFM                                                         */
/* ------------------------------------------------------------------ */
if (screen === "part") {
  const meta = [["Material", "6061-T6 (AMS-QQ-A-250/11)"], ["Envelope", "8.40 x 4.15 x 2.60 in"], ["Quantity", "250 ea"], ["Cycle est.", "46 min"], ["Target", "≤ $95.00 / part"]];
  const drivers = [["Machining time", 62, "$59.60"], ["Material + scrap", 21, "$20.20"], ["Setups and fixturing", 11, "$10.60"], ["Inspection / FAI", 6, "$5.80"]];
  const bandSteps = [[4, 4, "$62", "$96", "$148", "low confidence"], [22, 18, "$74", "$96", "$122", "medium confidence"], [34, 28, "$82", "$96", "$108", "high confidence"], [38, 32, "$88", "$96", "$104", "high confidence, 4 comparables"]];
  const findings = [
    { sev: "High", tags: ["Thin wall", "Deep pocket"], title: "Wall thickness vs. pocket depth", body: "0.060 in walls run 2.4 in deep on the two outboard pockets, a 40:1 ratio. Shops will slow feeds, add a semi-finish pass and expect chatter, or quote fixture work to support the walls.", impact: "+$18.40 / part", saving: "-$14.90 / part", fix: "Taking the wall to 0.090 in adds 1.8 g of mass and removes a full finishing pass. At 250 ea that is $3,725 saved for a change your FEA margin already covers." },
    { sev: "Medium", tags: ["Tolerance", "Bore"], title: "Ø0.3750 +.0005/-.0000 on two bores", body: "A unilateral half-thou band pushes both bores to a reamed or finish-bored op with controlled approach, plus in-process gauging. Only 4 of the 11 matched shops hold this in production.", impact: "+$6.10 / part", saving: "-$5.20 / part", fix: "If the bearing is a press fit, ±.001 bilateral still seats it and opens the part to 9 shops. More competition on price than the tolerance itself is worth." },
    { sev: "Low", tags: ["Feature", "Tooling"], title: "Internal corners at R0.031", body: "The two internal corners call R0.031, which forces a 1/16 endmill for the last pass on an otherwise 1/2 in tool part. Tool life and cycle time both take the hit.", impact: "+$2.30 / part", saving: "-$2.30 / part", fix: "R0.125 corners clear the mating flange per the print and let the whole pocket run with one tool." },
  ];
  $("#meta").innerHTML = meta.map(([l, v]) => `<li><span class="l">${l}</span><span class="v">${v}</span></li>`).join("");
  $("#drivers").innerHTML = drivers.map(([l, w, v]) => `<li><span>${l}</span><span class="v">${v}</span><span class="bar"><i data-w="${w}"></i></span></li>`).join("");
  $("#findings").innerHTML = findings.map((f, i) => `<li class="finding t">
      <div class="head"><span class="n">${i + 1}</span><span class="sev ${f.sev.toLowerCase()}">${f.sev}</span><span class="tags">${f.tags.map((t) => `<span>${t}</span>`).join("")}</span></div>
      <h3>${f.title}</h3><p>${f.body}</p>
      <div class="impact"><div><div class="l">Cost impact</div><div class="v">${f.impact}</div></div><div><div class="l">If changed</div><div class="v save">${f.saving}</div></div></div>
      <p class="fix">${f.fix}</p>
    </li>`).join("");
  renderers.push(() => {
    $$("#drivers .bar i").forEach((el, i) => { el.style.width = (tick > i ? el.dataset.w : 0) + "%"; });
    const b = bandSteps[Math.min(3, Math.floor(tick / 2))];
    const band = $("#band"); band.style.left = b[0] + "%"; band.style.right = b[1] + "%";
    $("#band-lo").textContent = b[2]; $("#band-mid").textContent = b[3] + " likely"; $("#band-hi").textContent = b[4]; $("#band-conf").textContent = b[5];
    $$("#findings .finding").forEach((el, i) => el.classList.toggle("is-in", tick > i + 1));
  });
}

/* ------------------------------------------------------------------ */
/* Negotiation                                                          */
/* ------------------------------------------------------------------ */
if (screen === "negotiation") {
  const mandate = [["Unit price ceiling", "$95.00 at 250"], ["Delivery", "on or before Nov 14"], ["Payment terms", "Net 45, hard"], ["Certifications", "ISO 9001 min."], ["Sources required", "2 qualified"], ["Auto-accept", "on, inside all bounds"]];
  const msgs = [
    { who: "Canyon, your agent", ini: "CY", me: true, t: "09:02", body: "Released RFQ-4417 to 4 verified shops holding 6061 plate capacity and ISO 9001. Mandate: unit at or under $95 at 250 ea, delivery by Nov 14, Net 45, minimum two qualified sources." },
    { who: "Midstate Precision", ini: "MP", t: "09:19", body: "Can run it. Price assumes our standard Net 30 and a 5-week slot. Nov 14 is tight against our current queue.", terms: [["Unit", "$104.20"], ["Lead", "5 wk"], ["Terms", "Net 30"]] },
    { who: "Canyon, your agent", ini: "CY", me: true, t: "09:21", body: "Net 45 is a hard requirement. Halcyon pays on it across all 40 suppliers. Would a 400-piece ceiling at the same unit price make the terms work? Buyer reorders this part quarterly." },
    { who: "Ridgeline Tool Works", ini: "RT", t: "09:34", body: "Bidding at 250. We have a Haas cell open the week of Oct 20 and we already hold the 6061 plate. Price holds 90 days and Net 45 is standard for us.", terms: [["Unit", "$97.80"], ["Lead", "4 wk"], ["Terms", "Net 45"]] },
    { who: "Midstate Precision", ini: "MP", t: "09:41", body: "Revised. Net 45 accepted against the 400-piece ceiling, and we pulled a half-week out by running the roughing on the older machine.", terms: [["Unit", "$96.40"], ["Lead", "4.5 wk"], ["Terms", "Net 45"]] },
    { who: "Ridgeline Tool Works", ini: "RT", t: "09:52", body: "Matching to hold position, conditional on release by Oct 10.", terms: [["Unit", "$94.90"], ["Lead", "4 wk"], ["Terms", "Net 45"]] },
    { who: "Canyon, your agent", ini: "CY", me: true, t: "09:58", body: "Two sources inside mandate. Closing the round and surfacing offers. I am recommending a 60/40 split to keep both qualified for the quarterly reorder." },
  ];
  const shops = [
    { name: "Ridgeline Tool Works", at: 3, prices: ["$97.80", "$97.80", "$94.90", "$94.90"] },
    { name: "Midstate Precision", at: 1, prices: ["$104.20", "$96.40", "$96.40", "$96.40"] },
    { name: "Cascade Machine Co.", at: 4, prices: ["$99.10"] },
    { name: "Delta Contract Mfg", at: 99, prices: [] },
  ];
  $("#mandate").innerHTML = mandate.map(([l, v]) => `<li><span class="l">${l}</span><span class="v">${v}</span></li>`).join("");
  renderers.push(() => {
    const shown = Math.min(msgs.length, Math.max(1, tick));
    $("#chat").innerHTML = msgs.slice(0, shown).map((m) => `<li class="${m.me ? "me" : ""}">
        <span class="ini">${m.ini}</span>
        <div><div class="who"><strong>${m.who}</strong><time>${m.t}</time></div><div class="body">${m.body}${m.terms ? `<div class="terms">${m.terms.map(([l, v]) => `<span><b>${l}</b>${v}</span>`).join("")}</div>` : ""}</div></div>
      </li>`).join("");
    const next = msgs[shown];
    $("#typing").style.opacity = next ? "1" : "0";
    $("#typing").textContent = next ? next.who + " is responding" : "Round closed";
    $("#round").textContent = "Round " + Math.min(3, Math.ceil(shown / 3)) + " of 3, live";
    $("#best").textContent = shown >= 6 ? "$94.90" : shown >= 5 ? "$96.40" : shown >= 4 ? "$97.80" : "no bids yet";
    $("#best-who").textContent = shown >= 6 ? "Ridgeline Tool Works, 4 wk, Net 45" : shown >= 5 ? "Midstate Precision, 4.5 wk" : shown >= 4 ? "Ridgeline Tool Works, 4 wk" : "awaiting first bid";
    $("#shop-states").innerHTML = shops.map((s) => {
      const responded = shown > s.at;
      const idx = Math.max(0, Math.min(s.prices.length - 1, shown - s.at - 1));
      const price = responded && s.prices.length ? s.prices[idx] : "";
      const st = s.prices.length === 0 ? "No bid, queue full" : responded ? (shown >= 6 ? "Final" : "Countered") : "Reviewing";
      return `<li class="${responded ? "" : "wait"}"><span>${s.name}</span><span class="p">${price}</span><span class="st ${responded && s.prices.length ? "hot" : ""}">${st}</span></li>`;
    }).join("");
  });
}

/* ------------------------------------------------------------------ */
/* Offers                                                               */
/* ------------------------------------------------------------------ */
if (screen === "offers") {
  const offers = [
    { name: "Ridgeline Tool Works", loc: "Elkhart, IN", note: "12 prior jobs with Halcyon", certs: ["ISO 9001", "AS9100D"], prices: ["$97.80", "$94.90", "$94.90"], leads: ["4 weeks", "4 weeks", "4 weeks"], ranks: [1, 0, 0], bars: [["On-time", 97], ["Quality", 99], ["Response", 92]] },
    { name: "Midstate Precision", loc: "Dayton, OH", note: "Holds 400-pc ceiling at price", certs: ["ISO 9001"], prices: ["$104.20", "$96.40", "$96.40"], leads: ["5 weeks", "4.5 weeks", "4.5 weeks"], ranks: [2, 1, 1], bars: [["On-time", 94], ["Quality", 96], ["Response", 88]] },
    { name: "Cascade Machine Co.", loc: "Portland, OR", note: "New to your supplier list", certs: ["ISO 9001"], prices: ["$99.10", "$99.10", "$99.10"], leads: ["6 weeks", "6 weeks", "6 weeks"], ranks: [0, 2, 2], bars: [["On-time", 91], ["Quality", 93], ["Response", 97]] },
    { name: "Delta Contract Mfg", loc: "Mesa, AZ", note: "No bid, 5-axis cell booked through Nov", certs: ["AS9100D"], prices: ["", "", ""], leads: ["", "", ""], ranks: [3, 3, 3], bars: [["On-time", 89], ["Quality", 95], ["Response", 60]] },
  ];
  const H = 122 + 12;
  const stack = $("#offers");
  stack.style.height = offers.length * H + "px";
  stack.innerHTML = offers.map((o) => `<div class="offer">
      <div class="rank"></div>
      <div><span class="name">${o.name}</span><span class="certs">${o.certs.map((c) => `<span>${c}</span>`).join("")}</span><div class="loc">${o.loc}. ${o.note}</div>
        <div class="bars">${o.bars.map(([l, v]) => `<div><span>${l}</span><i><b style="width:${v}%"></b></i><span>${v}%</span></div>`).join("")}</div></div>
      <div><div class="price"></div><div class="total"></div></div>
      <div class="cta"><button class="btn btn-secondary" type="button"></button><button class="btn btn-ghost" type="button">Shop profile</button></div>
    </div>`).join("");
  const cards = $$("#offers .offer");
  renderers.push(() => {
    const phase = Math.min(2, Math.floor(tick / 2));
    offers.forEach((o, i) => {
      const el = cards[i];
      const r = o.ranks[phase];
      const p = o.prices[phase];
      const best = r === 0 && p;
      el.style.transform = `translateY(${r * H}px)`;
      el.classList.toggle("best", !!best);
      $(".rank", el).textContent = p ? String(r + 1) : "";
      $(".price", el).textContent = p || "No bid";
      $(".total", el).textContent = p ? "$" + Math.round(parseFloat(p.slice(1)) * 250).toLocaleString("en-US") + " total, " + o.leads[phase] : "";
      const btn = $(".cta .btn-secondary", el);
      btn.textContent = !p ? "Ask again" : best ? "Award 150 ea" : "Award";
      btn.className = "btn " + (best ? "btn-primary" : "btn-secondary");
    });
    $("#recommend").classList.toggle("is-in", tick >= 3);
  });
}

start();
