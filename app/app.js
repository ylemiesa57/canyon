// Canyon customer UI.
// The markup in <template id="dc"> is the Claude Design mockup, verbatim apart from colour tokens.
// Below is a small renderer for its template syntax ({{ path }}, <sc-if>, <sc-for>, sc-camel-on-click),
// a DOM morph so CSS transitions survive re-renders, and the mockup's own screen logic (Component).

(function () {
  "use strict";

  const root = document.getElementById("root");
  const tpl = document.getElementById("dc").content;

  const strip = (s) => (s || "").replace(/^\s*\{\{\s*|\s*\}\}\s*$/g, "").trim();
  const get = (scope, path) => {
    if (path === "true") return true;
    if (path === "false") return false;
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), scope);
  };
  const interp = (str, scope) => str.replace(/\{\{\s*([\w.$]+)\s*\}\}/g, (_, p) => {
    const v = get(scope, p);
    return v == null ? "" : String(v);
  });

  function renderNodes(nodes, scope, out) {
    for (const n of nodes) {
      if (n.nodeType === 3) { if (n.data.trim() || n.data.includes(" ")) out.appendChild(document.createTextNode(interp(n.data, scope))); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (tag === "sc-if") { if (get(scope, strip(n.getAttribute("value")))) renderNodes(n.childNodes, scope, out); continue; }
      if (tag === "sc-for") {
        const list = get(scope, strip(n.getAttribute("list"))) || [];
        const as = n.getAttribute("as") || "item";
        list.forEach((item, i) => renderNodes(n.childNodes, Object.assign({}, scope, { [as]: item, $index: i }), out));
        continue;
      }
      const el = document.createElement(tag);
      for (const a of Array.from(n.attributes)) {
        if (a.name === "sc-camel-on-click") { const fn = get(scope, strip(a.value)); if (typeof fn === "function") el.__click = fn; continue; }
        if (a.name.startsWith("hint-")) continue;
        if (a.name === "style-hover") { el.dataset.hover = a.value; continue; }
        el.setAttribute(a.name, interp(a.value, scope));
      }
      renderNodes(n.childNodes, scope, el);
      out.appendChild(el);
    }
  }

  // Morph: copy the new tree onto the old one in place so transitions on style changes play.
  function morph(oldN, newN) {
    if (oldN.nodeType !== newN.nodeType || (oldN.nodeType === 1 && oldN.tagName !== newN.tagName)) { oldN.replaceWith(newN); return; }
    if (oldN.nodeType === 3) { if (oldN.data !== newN.data) oldN.data = newN.data; return; }
    for (const a of Array.from(oldN.attributes)) if (!newN.hasAttribute(a.name)) oldN.removeAttribute(a.name);
    for (const a of Array.from(newN.attributes)) if (oldN.getAttribute(a.name) !== a.value) oldN.setAttribute(a.name, a.value);
    oldN.__click = newN.__click;
    morphChildren(oldN, newN);
  }
  function morphChildren(oldN, newN) {
    const oc = Array.from(oldN.childNodes), nc = Array.from(newN.childNodes);
    const len = Math.max(oc.length, nc.length);
    for (let i = 0; i < len; i++) {
      if (!oc[i]) oldN.appendChild(nc[i]);
      else if (!nc[i]) oc[i].remove();
      else morph(oc[i], nc[i]);
    }
  }

  root.addEventListener("click", (e) => {
    let t = e.target;
    while (t && t !== root) { if (t.__click) { t.__click(e); return; } t = t.parentNode; }
  });
  root.addEventListener("mouseover", (e) => {
    const t = e.target.closest && e.target.closest("[data-hover]");
    if (t && !t.__hoverBase) { t.__hoverBase = t.getAttribute("style") || ""; t.setAttribute("style", t.__hoverBase + ";" + t.dataset.hover); }
  });
  root.addEventListener("mouseout", (e) => {
    const t = e.target.closest && e.target.closest("[data-hover]");
    if (t && t.__hoverBase != null && !t.contains(e.relatedTarget)) { t.setAttribute("style", t.__hoverBase); t.__hoverBase = null; }
  });

  let app = null, lastScreen = null;
  function render() {
    const vals = app.renderVals();
    const frag = document.createDocumentFragment();
    renderNodes(tpl.childNodes, vals, frag);
    const fresh = document.createElement("div");
    fresh.append(frag);
    if (!root.firstChild || lastScreen !== app.state.screen) { root.replaceChildren(...Array.from(fresh.childNodes)); }
    else { morphChildren(root, fresh); }
    lastScreen = app.state.screen;
  }

  // Minimal stand-in for the design runtime's component base.
  class DCLogic {
    constructor() { this.state = {}; this.props = {}; }
    setState(u) {
      const prev = Object.assign({}, this.state);
      const next = typeof u === "function" ? u(this.state) : u;
      this.state = Object.assign({}, this.state, next);
      render();
      if (this.componentDidUpdate) this.componentDidUpdate(this.props, prev);
    }
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Screen logic from the design, unchanged apart from colour literals ── */
  const MUTED = 'color:color-mix(in srgb,var(--color-text) 55%,transparent)';

class Component extends DCLogic {
  state = { screen: 'dash', tick: 0 };

  componentDidMount() { this.run(); }
  componentDidUpdate(p, s) { if (s.screen !== this.state.screen) this.run(); }
  componentWillUnmount() { clearInterval(this._iv); }

  run() {
    clearInterval(this._iv);
    this.setState({ tick: 0 });
    const speed = { dash: 1100, rfq: 420, part: 700, neg: 1300, offers: 1500, home: 2000 }[this.state.screen] || 900;
    const max = { dash: 9, rfq: 14, part: 8, neg: 9, offers: 4, home: 4 }[this.state.screen] || 8;
    this._iv = setInterval(() => {
      this.setState(s => ({ tick: s.tick >= max ? (s.screen === 'dash' ? 0 : max) : s.tick + 1 }));
    }, speed);
  }

  go(screen) { return () => this.setState({ screen }); }

  vis(on, dy) {
    return on ? 'opacity:1;transform:none' : 'opacity:0;transform:translateY(' + (dy || 10) + 'px)';
  }

  renderVals() {
    const sc = this.state.screen, t = this.state.tick;
    const tabs = [['home', 'Home'], ['dash', 'Queue'], ['rfq', 'New RFQ'], ['part', 'Part & DFM'], ['neg', 'Negotiation'], ['offers', 'Offers']]
      .map(([k, label]) => ({
        label, go: this.go(k),
        sel: k === sc ? 'border-bottom-color:var(--color-accent);color:var(--color-text)' : 'color:color-mix(in srgb,var(--color-text) 55%,transparent)'
      }));

    // ── dashboard ──
    const rowDefs = [
      { id: 'RFQ-4417', ago: '2 h ago', part: 'Actuator Housing', sub: 'Rev C · 3 setups · ±.0005 bore', qty: '250', mat: '6061-T6', base: 3, band: '$88 – $104', need: 'Nov 14' },
      { id: 'RFQ-4402', ago: '1 d ago', part: 'Manifold Block', sub: 'Rev A · cross-drilled · deburr critical', qty: '120', mat: 'Ti-6Al-4V', base: 4, band: '$412 – $487', need: 'Dec 02' },
      { id: 'RFQ-4396', ago: '3 d ago', part: 'Sensor Bracket', sub: 'Rev F · repeat order, 4th release', qty: '1,000', mat: '304 SS', base: 5, band: '$11.40 firm', need: 'Oct 28' },
      { id: 'RFQ-4388', ago: '4 d ago', part: 'Isogrid Panel', sub: 'Rev B · thin wall .090 ribs', qty: '25', mat: '6061-T6', base: 2, band: 'pricing…', need: 'Dec 19' },
      { id: 'RFQ-4371', ago: '9 d ago', part: 'Valve Body', sub: 'Rev B · awarded to Cascade Machine', qty: '500', mat: '17-4 PH', base: 5, band: '$61.80 firm', need: 'Oct 02' }
    ];
    const stageNames = ['Uploaded', 'Priced', 'Matched', 'Negotiating', 'Offers ready', 'Awarded'];
    const rows = rowDefs.map((r, i) => {
      const adv = Math.min(5, r.base + (t > i * 2 ? 1 : 0));
      return {
        ...r, stage: stageNames[adv], open: this.go(adv >= 4 ? 'offers' : adv === 3 ? 'neg' : 'part'),
        stageColor: adv >= 4 ? 'color:var(--color-accent-700)' : MUTED,
        pips: [0, 1, 2, 3, 4].map(n => ({
          st: n < adv ? 'background:var(--color-accent)' : 'background:color-mix(in srgb,var(--color-text) 14%,transparent)'
        }))
      };
    });
    const kpis = [
      { l: 'Open requests', v: '12', s: '4 awaiting your decision' },
      { l: 'In negotiation', v: '5', s: 'agents active now' },
      { l: 'Avg. time to price', v: '84 s', s: 'was 3.4 days' },
      { l: 'Savings YTD', v: '$214k', s: 'vs. 2025 award prices' }
    ];

    // ── new RFQ ──
    const featDefs = [
      ['Format', 'STEP AP214'], ['Setups required', '3'], ['Faces / holes', '412 / 34'],
      ['Threaded holes', '12 (¼-20, M6)'], ['Tightest tolerance', '±0.0005 in'],
      ['Material removal', '71% by volume'], ['GD&T frames read', '7'], ['Surface finish', 'Ra 32 / bead blast']
    ];
    const shown = Math.min(featDefs.length, Math.max(0, t - 1));
    const feats = featDefs.map(([l, v], i) => ({ l, v, vis: this.vis(i < shown, 8) }));
    const pct = Math.min(100, t * 9);
    const files = [
      { ext: 'STP', name: 'HAL-4417_rev_c.stp', meta: 'CAD · 18.2 MB', state: t > 1 ? 'Read' : 'Reading…' },
      { ext: 'PDF', name: 'HAL-4417_RD_bubbled.pdf', meta: 'Drawing · 2.8 MB', state: t > 3 ? 'Read' : 'Queued' },
      { ext: 'XLS', name: 'halcyon_terms_2026.xlsx', meta: 'Terms sheet · 88 KB', state: t > 5 ? 'Applied' : 'Queued' }
    ];
    const reqFields = [
      { l: 'Quantity', v: '250 ea', tag: 'You', tagStyle: MUTED },
      { l: 'Material', v: '6061-T6', tag: 'From CAD', tagStyle: 'color:var(--color-accent-700)' },
      { l: 'Finish', v: 'Bead blast + clear ano', tag: 'From print', tagStyle: 'color:var(--color-accent-700)' },
      { l: 'Tolerance class', v: '±0.005 typ.', tag: 'From print', tagStyle: 'color:var(--color-accent-700)' },
      { l: 'Need by', v: 'Nov 14, 2026', tag: 'You', tagStyle: MUTED },
      { l: 'Payment terms', v: 'Net 45', tag: 'Default', tagStyle: MUTED }
    ];
    const certs = ['ISO 9001 required', 'AS9100 preferred', 'Domestic only (DFARS)', 'FAI on first article', 'Material certs to Halcyon QA']
      .map((l, i) => ({ l, st: i === 0 ? 'background:var(--color-accent-200);color:var(--color-accent-800)' : 'background:color-mix(in srgb,var(--color-text) 8%,transparent)' }));

    // ── part / DFM ──
    const bandSteps = [[4, 4, '$62', '$96', '$148', 'low confidence'], [22, 18, '$74', '$96', '$122', 'medium confidence'], [34, 28, '$82', '$96', '$108', 'high confidence'], [38, 32, '$88', '$96', '$104', 'high confidence · 4 comps']];
    const b = bandSteps[Math.min(3, Math.floor(t / 2))];
    const findingDefs = [
      { n: '1', sev: 'High', tags: ['Thin wall', 'Deep pocket'], title: 'Wall thickness vs. pocket depth', body: '0.060 in walls run 2.4 in deep on the two outboard pockets — a 40:1 ratio. Shops will slow feeds, add a semi-finish pass and expect chatter, or quote fixture work to support the walls.', impact: '+$18.40 / part', saving: '−$14.90 / part', fix: 'Taking the wall to 0.090 in adds 1.8 g of mass and removes a full finishing pass. At 250 ea that is $3,725 saved for a change your FEA margin already covers.' },
      { n: '2', sev: 'Medium', tags: ['Tolerance', 'Bore'], title: 'Ø0.3750 +.0005/-.0000 on two bores', body: 'A unilateral half-thou band pushes both bores to a reamed or finish-bored op with controlled approach, plus in-process gauging. Only 4 of the 11 matched shops hold this in production.', impact: '+$6.10 / part', saving: '−$5.20 / part', fix: 'If the bearing is a press fit, ±.001 bilateral still seats it and opens the part to 9 shops — more competition on price than the tolerance itself is worth.' },
      { n: '3', sev: 'Low', tags: ['Feature', 'Tooling'], title: 'Internal corners at R0.031', body: 'The two internal corners call R0.031, which forces a 1/16 endmill for the last pass on an otherwise 1/2 in tool part. Tool life and cycle time both take the hit.', impact: '+$2.30 / part', saving: '−$2.30 / part', fix: 'R0.125 corners clear the mating flange per the print and let the whole pocket run with one tool.' }
    ];
    const sevStyle = { High: 'background:var(--color-accent);color:var(--color-bg)', Medium: 'background:var(--color-accent-200);color:var(--color-accent-800)', Low: 'background:color-mix(in srgb,var(--color-text) 10%,transparent)' };
    const findings = findingDefs.map((f, i) => ({ ...f, sevStyle: sevStyle[f.sev], vis: this.vis(t > i + 1, 12) }));
    const driverDefs = [['Machining time', 62, '$59.60'], ['Material + scrap', 21, '$20.20'], ['Setups & fixturing', 11, '$10.60'], ['Inspection / FAI', 6, '$5.80']];
    const drivers = driverDefs.map(([l, w, v], i) => ({ l, v, w: 'width:' + (t > i ? w : 0) + '%' }));
    const partMeta = [
      { l: 'Material', v: '6061-T6 (AMS-QQ-A-250/11)' }, { l: 'Envelope', v: '8.40 × 4.15 × 2.60 in' },
      { l: 'Quantity', v: '250 ea' }, { l: 'Cycle est.', v: '46 min' }, { l: 'Target', v: '≤ $95.00 / part' }
    ];

    // ── negotiation ──
    const msgDefs = [
      { who: 'Canyon · your agent', ini: 'CY', me: true, t: '09:02', body: 'Released RFQ-4417 to 4 verified shops holding 6061 plate capacity and ISO 9001. Mandate: unit ≤ $95 at 250 ea, delivery by Nov 14, Net 45, minimum two qualified sources.' },
      { who: 'Midstate Precision', ini: 'MP', t: '09:19', body: 'Can run it. Price assumes our standard Net 30 and a 5-week slot; Nov 14 is tight against our current queue.', terms: [['Unit', '$104.20'], ['Lead', '5 wk'], ['Terms', 'Net 30']] },
      { who: 'Canyon · your agent', ini: 'CY', me: true, t: '09:21', body: 'Net 45 is a hard requirement — Halcyon pays on it across all 40 suppliers. Would a 400-piece ceiling at the same unit price make the terms work? Buyer reorders this part quarterly.' },
      { who: 'Ridgeline Tool Works', ini: 'RT', t: '09:34', body: 'Bidding at 250. We have a Haas cell open the week of Oct 20 and we already hold the 6061 plate. Price holds 90 days and Net 45 is standard for us.', terms: [['Unit', '$97.80'], ['Lead', '4 wk'], ['Terms', 'Net 45']] },
      { who: 'Midstate Precision', ini: 'MP', t: '09:41', body: 'Revised. Net 45 accepted against the 400-piece ceiling, and we pulled a half-week out by running the roughing on the older machine.', terms: [['Unit', '$96.40'], ['Lead', '4.5 wk'], ['Terms', 'Net 45']] },
      { who: 'Ridgeline Tool Works', ini: 'RT', t: '09:52', body: 'Matching to hold position, conditional on release by Oct 10.', terms: [['Unit', '$94.90'], ['Lead', '4 wk'], ['Terms', 'Net 45']] },
      { who: 'Canyon · your agent', ini: 'CY', me: true, t: '09:58', body: 'Two sources inside mandate. Closing the round and surfacing offers — I am recommending a 60/40 split to keep both qualified for the quarterly reorder.' }
    ];
    const msgShown = Math.min(msgDefs.length, Math.max(1, t));
    const msgs = msgDefs.slice(0, msgShown).map(m => ({
      who: m.who, ini: m.ini, t: m.t, body: m.body, vis: 'opacity:1;transform:none',
      hasTerms: !!m.terms, terms: (m.terms || []).map(([l, v]) => ({ l, v })),
      avatar: m.me ? 'background:var(--color-accent);color:var(--color-bg)' : 'background:var(--color-text);color:var(--color-bg)',
      rule: m.me ? 'border-color:var(--color-accent)' : 'border-color:color-mix(in srgb,var(--color-text) 22%,transparent)'
    }));
    const nextMsg = msgDefs[msgShown];
    const mandate = [
      { l: 'Unit price ceiling', v: '$95.00 @ 250' }, { l: 'Delivery', v: 'on or before Nov 14' },
      { l: 'Payment terms', v: 'Net 45 — hard' }, { l: 'Certifications', v: 'ISO 9001 min.' },
      { l: 'Sources required', v: '2 qualified' }, { l: 'Auto-accept', v: 'on, inside all bounds' }
    ];
    const shopPrices = [
      { name: 'Ridgeline Tool Works', at: 3, prices: ['$97.80', '$97.80', '$94.90', '$94.90'] },
      { name: 'Midstate Precision', at: 1, prices: ['$104.20', '$96.40', '$96.40', '$96.40'] },
      { name: 'Cascade Machine Co.', at: 4, prices: ['$99.10'] },
      { name: 'Delta Contract Mfg', at: 99, prices: [] }
    ];
    const shopStates = shopPrices.map(s => {
      const responded = msgShown > s.at;
      const idx = Math.max(0, Math.min(s.prices.length - 1, msgShown - s.at - 1));
      return {
        name: s.name,
        price: responded && s.prices.length ? s.prices[idx] : '—',
        vis: responded ? 'opacity:1' : 'opacity:.3',
        st: s.prices.length === 0 ? 'No bid — queue full' : responded ? (msgShown >= 6 ? 'Final' : 'Countered') : 'Reviewing…',
        stColor: s.prices.length === 0 ? MUTED : responded ? 'color:var(--color-accent-700)' : MUTED
      };
    });

    // ── offers ──
    const phase = Math.min(2, Math.floor(t / 2));
    const offerDefs = [
      { key: 'r', name: 'Ridgeline Tool Works', loc: 'Elkhart, IN', note: '12 prior jobs with Halcyon', certs: ['ISO 9001', 'AS9100D'], prices: ['$97.80', '$94.90', '$94.90'], leads: ['4 weeks', '4 weeks', '4 weeks'], ranks: [1, 0, 0], bars: [['On-time', 97], ['Quality', 99], ['Response', 92]] },
      { key: 'm', name: 'Midstate Precision', loc: 'Dayton, OH', note: 'Holds 400-pc ceiling at price', certs: ['ISO 9001'], prices: ['$104.20', '$96.40', '$96.40'], leads: ['5 weeks', '4.5 weeks', '4.5 weeks'], ranks: [2, 1, 1], bars: [['On-time', 94], ['Quality', 96], ['Response', 88]] },
      { key: 'c', name: 'Cascade Machine Co.', loc: 'Portland, OR', note: 'New to your supplier list', certs: ['ISO 9001'], prices: ['$99.10', '$99.10', '$99.10'], leads: ['6 weeks', '6 weeks', '6 weeks'], ranks: [0, 2, 2], bars: [['On-time', 91], ['Quality', 93], ['Response', 97]] },
      { key: 'd', name: 'Delta Contract Mfg', loc: 'Mesa, AZ', note: 'No bid — 5-axis cell booked through Nov', certs: ['AS9100D'], prices: ['—', '—', '—'], leads: ['—', '—', '—'], ranks: [3, 3, 3], bars: [['On-time', 89], ['Quality', 95], ['Response', 60]] }
    ];
    const offers = offerDefs.map(o => {
      const r = o.ranks[phase], best = r === 0 && o.prices[phase] !== '—';
      const qty = o.prices[phase] === '—' ? '—' : '$' + (parseFloat(o.prices[phase].slice(1)) * 250).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' total';
      return {
        rank: o.prices[phase] === '—' ? '—' : String(r + 1), name: o.name, loc: o.loc, note: o.note, certs: o.certs,
        price: o.prices[phase], lead: o.leads[phase], total: qty,
        y: 'transform:translateY(' + (r * 138) + 'px)',
        edge: best ? 'border-color:var(--color-accent)' : 'border-color:var(--color-divider)',
        rankColor: best ? 'color:var(--color-accent)' : MUTED,
        cta: o.prices[phase] === '—' ? 'Ask again' : best ? 'Award 150 ea' : 'Award',
        ctaStyle: best ? 'background:var(--color-accent);color:var(--color-bg)' : 'border:1px solid var(--color-divider)',
        bars: o.bars.map(([l, v]) => ({ l, v: v + '%', w: 'width:' + v + '%' }))
      };
    });

    return {
      tabs, isHome: sc === 'home', isDash: sc === 'dash', isRfq: sc === 'rfq', isPart: sc === 'part', isNeg: sc === 'neg', isOffers: sc === 'offers',
      goRfq: this.go('rfq'), goPart: this.go('part'), goNeg: this.go('neg'), goOffers: this.go('offers'),
      rows, kpis,
      files, feats, reqFields, certs, extractPct: String(pct), extractW: 'width:' + pct + '%',
      priceVis: pct >= 100 ? 'opacity:1' : 'opacity:.25;pointer-events:none',
      findings, drivers, partMeta,
      bandPos: 'left:' + b[0] + '%;right:' + b[1] + '%', bandLo: b[2], bandMid: b[3], bandHi: b[4], bandConf: b[5],
      msgs, mandate, shopStates, roundNo: String(Math.min(3, Math.ceil(msgShown / 3))),
      typingVis: nextMsg ? 'opacity:1' : 'opacity:0',
      typingWho: nextMsg ? nextMsg.who + ' is responding…' : 'Round closed',
      bestPrice: msgShown >= 6 ? '$94.90' : msgShown >= 5 ? '$96.40' : msgShown >= 4 ? '$97.80' : '—',
      bestWho: msgShown >= 6 ? 'Ridgeline Tool Works · 4 wk · Net 45' : msgShown >= 5 ? 'Midstate Precision · 4.5 wk' : msgShown >= 4 ? 'Ridgeline Tool Works · 4 wk' : 'awaiting first bid',
      offers, stackH: 'height:' + (offerDefs.length * 138 + 16) + 'px',
      pillars: [
        { n: '01', title: 'CAD-native pricing', body: 'Setups, tolerances, material removal and finish callouts come off the model and the print. No estimator, no queue, no two-day wait.' },
        { n: '02', title: 'Agent-mediated negotiation', body: 'You set the mandate — ceiling, date, terms, certifications. Your agent negotiates against shop agents and only interrupts you at the edge of your bounds.' },
        { n: '03', title: 'Verified supply', body: 'Machines, envelopes, held tolerances, certifications and current queue depth are verified before a shop can bid. A match is a claim we stand behind.' }
      ],
      steps: [
        { n: '1', time: '0:00', title: 'Drop the CAD', body: 'STEP, native part files, or a folder with the bubbled print. Canyon reads both.' },
        { n: '2', time: '0:90', title: 'Get a band', body: 'A price band, a lead-time range, and the manufacturability findings that move either one.' },
        { n: '3', time: 'Same day', title: 'Agents negotiate', body: 'Verified shops bid and counter against your mandate. You watch or you ignore it.' },
        { n: '4', time: 'Day 1', title: 'Award', body: 'Ranked offers with on-time records attached. Single or split award, your call.' }
      ],
      marketStats: [
        { v: '$44.6B', l: 'US machine shop industry, fragmented across ~17,253 establishments' },
        { v: '2–5 days', l: 'Typical wait for a single quote today — per shop, per revision' },
        { v: '20–60 min', l: 'Estimator time burned per RFQ, most of it on jobs the shop never wins' },
        { v: '0', l: 'Shops on Canyon that have not had their machines and certifications verified' }
      ]
    };
  }
}

  app = new Component();
  render();
  if (reduceMotion) {
    // Jump every screen to its finished state instead of playing the sequence.
    const max = { dash: 9, rfq: 14, part: 8, neg: 9, offers: 4, home: 4 };
    app.run = function () { clearInterval(this._iv); this.setState({ tick: max[this.state.screen] || 8 }); };
  }
  if (app.componentDidMount) app.componentDidMount();
})();
