// Shop-side screens: the merchant mockup's logic, data synced with the buyer side.
(function () {
  const DCLogic = window.DC.DCLogic;

  // ── Costing model ──────────────────────────────────────────────────────────
  // Machine-time steps and material/service lines for BRKT-001. Every row names the regions
  // of the part drawing it touches, so hovering a row lights up the matching geometry.
  // Money is computed here (not typed in) so the tables, caption and header always agree.
  const QTY = 10;
  const STEPS = [
    { id:'op10', name:'Op10 · Rough', detail:'Top side, 3-axis, vise', machine:'Haas VF-2SS', rate:85,
      setup:24, setupDetail:'Standard vise · 24 min per batch', setupTool:'Kurt vise', setupRegions:['topFace'], features:[
      { id:'pocketsA', name:'Pocket set A · 6 pockets', detail:'Ø12 rougher, 22 mm deep, 1.8 mm walls', tool:'Ø12 3-flute', min:5.4, regions:['pocketsA'] },
      { id:'pocketsB', name:'Pocket set B · 8 pockets', detail:'Ø8 rougher, 14 mm deep', tool:'Ø8 3-flute', min:3, regions:['pocketsB'] },
      { id:'profile', name:'Outer profile', detail:'Full-depth contour, 2 passes', tool:'Ø16 rougher', min:2.4, regions:['profile'] } ] },
    { id:'op20', name:'Op20 · Finish + back', detail:'Flip, soft jaws, finish ribs', machine:'Haas VF-2SS', rate:85,
      setup:36, setupDetail:'Soft jaws machined once, reused · 36 min per batch', setupTool:'Soft jaws', setupRegions:['backFace'], features:[
      { id:'ribs', name:'Thin ribs · 1.8 mm', detail:'Light passes, chatter-limited feed', tool:'Ø6 finisher', min:3.6, regions:['ribs'] },
      { id:'backPocket', name:'Back pocket', detail:'Second-side access only', tool:'Ø10 finisher', min:3, regions:['backPocket'] },
      { id:'chamfers', name:'Chamfers + deburr', detail:'0.5 mm all edges per note 4', tool:'90° chamfer mill', min:1.8, regions:['chamfers'] } ] },
    { id:'op30', name:'Op30 · Precision bores', detail:'Ream + counterbore, ⊥ 0.02', machine:'DMG Mori DMU 50', rate:95,
      setup:0, features:[
      { id:'bores', name:'Ø8 H7 ×2 · reamed', detail:'True position Ø0.1 to datum A', tool:'Ø8 H7 reamer', min:2.4, regions:['bores','datum'] },
      { id:'cbores', name:'Ø12 counterbores ×4', detail:'Ø6.5 thru, 6 mm deep', tool:'Ø12 c-bore', min:1.2, regions:['cbores'] } ] },
    { id:'cmm', name:'Inspection', detail:'CMM true position + LPI note', machine:'Zeiss Contura', rate:70,
      setup:0, features:[
      { id:'cmm-run', name:'CMM · 6 bores, 2 datums', detail:'Program exists from similar bracket', tool:'Ø3 ruby stylus', min:3, regions:['bores','cbores','datum'] } ] }
  ];
  const MATERIALS = [
    { id:'billet', item:'6061-T6 plate billet 165 × 95 × 52 mm', detail:'~2.1 kg cut, 0.61 kg part · Kaiser · AMS-QQ-A-250/11', type:'Material', tagClass:'tag-neutral', cost:9.06, scrap:4, mode:'Per part', regions:['stock'] },
    { id:'lpi', item:'100% liquid penetrant inspection', detail:'Drawing note 7 · Northstar NDT · +2 days lead', type:'Outside', tagClass:'tag-accent-2', cost:18, scrap:0, mode:'Per part', regions:['topFace','backFace'], optional:true },
    // Billed once per batch on the quote, so it never enters the unit cost.
    { id:'fixture', item:'Fixture · one time', detail:'Soft-jaw fixture for Op20, machined once and kept', type:'Tooling', tagClass:'tag-neutral', cost:180, scrap:0, mode:'Per batch', regions:['backFace'], batch:true }
  ];
  const FIXTURE = MATERIALS.find((m) => m.batch).cost;
  // PLT-002 is the simpler part on the same RFQ: one Haas op, plate stock, anodize as an outside op at
  // cost. Same arithmetic as BRKT-001, so both quote lines come out of unitCost().
  const PLT_STEPS = [
    { id:'plt-op10', name:'Op10 · Face, profile, holes', machine:'Haas VF-2SS', rate:85, setup:24, features:[
      { id:'plt-face', name:'Face both sides', min:6 }, { id:'plt-profile', name:'Profile + 4 slots', min:7.2 },
      { id:'plt-holes', name:'8 thru holes, spot + drill', min:3 }, { id:'plt-deburr', name:'Chamfer + deburr', min:1.8 } ] }
  ];
  const PLT_MATERIALS = [
    { id:'plt-plate', item:'6061-T6 plate 130 × 90 × 14 mm', cost:3.09, scrap:4 },
    { id:'plt-anodize', item:'Anodize Type II clear', cost:1.6, scrap:0 }
  ];
  const REGIONS = ['stock','topFace','backFace','profile','pocketsA','pocketsB','ribs','bores','cbores','backPocket','chamfers','datum'];
  // Hovering the drawing itself: region → the row it belongs to.
  const REGION_ROW = { stock:'billet', topFace:'op10-setup', backFace:'op20-setup', profile:'profile', pocketsA:'pocketsA', pocketsB:'pocketsB', ribs:'ribs', bores:'bores', cbores:'cbores', backPocket:'backPocket', chamfers:'chamfers', datum:'cmm-run' };
  const money = (v) => '$' + v.toFixed(2);
  const money2 = (v) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money0 = (v) => '$' + Math.round(v).toLocaleString('en-US');
  const runMin = (steps) => steps.reduce((a, s) => a + s.features.reduce((r, f) => r + f.min, 0), 0);
  // Unit cost at a quantity: run time at the machine rate, setups amortised over the batch, and the
  // per-part material and service lines (optional lines only when switched in; per-batch lines never).
  const unitCost = (steps, materials, q, withOptional) =>
    steps.reduce((a, s) => a + (s.setup / q + s.features.reduce((r, f) => r + f.min, 0)) / 60 * s.rate, 0) +
    materials.reduce((a, m) => a + (m.batch || (m.optional && !withOptional) ? 0 : m.cost * (1 + m.scrap / 100)), 0);
  // Quote date is the day the page renders; offers are valid 48 h.
  const TODAY = new Date();
  const fmtDate = (d, year) => d.toLocaleDateString('en-US', year ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
  const QUOTE_DATE = fmtDate(TODAY, true);
  const VALID_UNTIL = fmtDate(new Date(TODAY.getTime() + 48 * 3600 * 1000));

  const MUTED = 'color:color-mix(in srgb,var(--color-text) 55%,transparent)';
  const SEV_STYLE = { High: 'background:var(--color-accent);color:var(--color-bg)', Medium: 'background:var(--color-accent-200);color:var(--color-accent-800)', Low: 'background:color-mix(in srgb,var(--color-text) 10%,transparent)' };
  // Theme is shared with the buyer side through the same storage key.
  const readTheme = () => { try { return localStorage.getItem('canyon-theme') || ''; } catch (e) { return ''; } };
  const applyTheme = (t) => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; try { localStorage.setItem('canyon-theme', t); } catch (e) { /* private mode */ } };

  // Finding titles are shared by the cards on the Part stage and the viewer legend, so they always match.
  const FINDING_TITLES = ['From solid — 71% of the billet becomes chips', '1.8 mm ribs between pocket set A', 'Ø8 H7 bores, true position Ø0.1', '100% liquid penetrant, no indications'];
  // What the 3D viewer loads on the Part stage: the BRKT-001 mesh from the STEP. Anchors are
  // bounding-box fractions, so each finding lands on its feature.
  const PART_MODEL = {
    name: 'BRKT-001 Industrial Bracket',
    stl: '/assets/parts/industrial-bracket.stl',
    pdf: '/assets/parts/industrial-bracket.pdf',
    findings: [
      { id: 'f1', n: '1', sev: 'High', title: FINDING_TITLES[0], regions: [{ at: [32 / 155, 25 / 85, 0.75], type: 'box', size: [40, 30, 24] }, { at: [77 / 155, 25 / 85, 0.75], type: 'box', size: [40, 30, 24] }, { at: [122 / 155, 25 / 85, 0.75], type: 'box', size: [40, 30, 24] }, { at: [32 / 155, 60 / 85, 0.75], type: 'box', size: [40, 30, 24] }, { at: [77 / 155, 60 / 85, 0.75], type: 'box', size: [40, 30, 24] }, { at: [122 / 155, 60 / 85, 0.75], type: 'box', size: [40, 30, 24] }] },
      { id: 'f2', n: '2', sev: 'High', title: FINDING_TITLES[1], regions: [{ at: [54.5 / 155, 0.5, 0.75], type: 'box', size: [6, 66, 24] }, { at: [99.5 / 155, 0.5, 0.75], type: 'box', size: [6, 66, 24] }, { at: [0.5, 42.5 / 85, 0.75], type: 'box', size: [132, 6, 24] }] },
      { id: 'f3', n: '3', sev: 'Medium', title: FINDING_TITLES[2], regions: [{ at: [6 / 155, 5 / 85, 1], type: 'sphere', radius: 7 }, { at: [149 / 155, 80 / 85, 1], type: 'sphere', radius: 7 }] },
      { id: 'f4', n: '4', sev: 'Medium', title: FINDING_TITLES[3], regions: [{ at: [0.5, 0.5, 0.5], type: 'box', size: [157, 87, 44] }] }
    ]
  };
  // Inbox rail: how far the agent got on a row, and whether it stopped for the shop.
  const ROW_STAGE = { 'Escalated to you': [4, 'Negotiating', true], 'Rev conflict': [1, 'Ingested', true], 'Agent negotiating': [4, 'Negotiating', false], 'Quoted': [3, 'Quoted', false], 'Won': [5, 'Won', false] };
  const rowStage = (r, muted) => {
    const [adv, stage, needs] = ROW_STAGE[r.status];
    return { stage, needsVis: needs ? 'visibility:visible' : 'visibility:hidden',
      stageColor: needs ? 'color:var(--color-warn)' : adv >= 5 ? 'color:var(--color-good)' : muted,
      pips: [0, 1, 2, 3, 4].map((n) => ({ st: n < adv ? 'background:var(--color-text)' : 'background:color-mix(in srgb,var(--color-text) 14%,transparent)' })) };
  };
  const dollars = (s) => Number(String(s).replace(/[^0-9.]/g, '')) || 0;
class Component extends DCLogic {
  state = { screen: 'inbox', stage: 'ingest', agent: true, agentMin: true, filter: 'all', hot: null, pin: null, closed: {}, lpi: false, theme: readTheme(), selectedFinding: null, view: '3d',
    chatExtra: [], chatInput: '', chatSeen: 0, sent: false, sendDialog: false, won: [], wonBump: 0, extraFiles: [], dragging: false };
  // Three tabs like the buyer console; the RFQ's six stages sit in a strip under Parts.
  static TABS = [['inbox', 'Inbox'], ['parts', 'Parts'], ['shop', 'My shop']];
  static STAGES = [['ingest', 'Ingest'], ['part', 'Part'], ['cost', 'Costing'], ['quote', 'Quote'], ['neg', 'Negotiation'], ['pdf', 'Quote PDF']];
  static isStage(k) { return Component.STAGES.some(([s]) => s === k); }
  // The screen lives in the URL hash (/app/shop/#cost) so any stage can be linked to directly.
  constructor() {
    super();
    const h = location.hash.slice(1);
    if (h === 'inbox' || h === 'shop') this.state.screen = h;
    else if (Component.isStage(h)) { this.state.screen = h; this.state.stage = h; }
  }
  componentDidMount() {
    applyTheme(this.state.theme);
    // The part viewer iframe asks for its model when ready and reports pin clicks; mirror those on the cards.
    window.addEventListener('message', (e) => {
      const m = e.data || {};
      if (m.source !== 'canyon-viewer') return;
      if (m.type === 'ready') { const v = this.viewer(); if (v) { v.postMessage({ type: 'load', model: PART_MODEL }, '*'); v.postMessage({ type: 'theme', value: this.state.theme }, '*'); } }
      if (m.type === 'select') this.setState({ selectedFinding: m.id || null });
    });
  }
  componentDidUpdate(p, prev) { if (prev.screen !== this.state.screen) history.replaceState(null, '', '#' + this.state.screen); }
  viewer() { const f = document.querySelector('iframe[title="Part viewer"]'); return f && f.contentWindow; }
  go(s) { return () => this.setState(Component.isStage(s) ? { screen: s, stage: s } : { screen: s }); }
  // Agent chat: canned answers in the RFQ's context. New lines also count as unread on the bubble.
  ask(q, a) {
    const t = new Date(); const hhmm = t.getHours().toString().padStart(2, '0') + ':' + t.getMinutes().toString().padStart(2, '0');
    const chatExtra = this.state.chatExtra.concat([{ who: 'You', time: hhmm, text: q }, { who: 'Shop agent', time: hhmm, text: a }]);
    this.setState({ chatExtra, chatInput: '' });
  }
  say(a) { const t = new Date(); const hhmm = t.getHours().toString().padStart(2, '0') + ':' + t.getMinutes().toString().padStart(2, '0'); this.setState({ chatExtra: this.state.chatExtra.concat([{ who: 'Shop agent', time: hhmm, text: a }]) }); }
  // Win animation: a ghost of the offer swoops into the My shop tab, whose badge then bumps.
  fly(fromEl, label) {
    const tab = document.querySelector('[data-tab="shop"]');
    if (!fromEl || !tab || !fromEl.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    const a = fromEl.getBoundingClientRect(), b = tab.getBoundingClientRect();
    const g = document.createElement('div'); g.className = 'fly-ghost'; g.textContent = label;
    g.style.left = a.left + 'px'; g.style.top = a.top + 'px'; g.style.width = Math.min(a.width, 360) + 'px';
    document.body.appendChild(g);
    const dx = b.left + b.width / 2 - (a.left + Math.min(a.width, 360) / 2), dy = b.top + b.height / 2 - (a.top + 20);
    const anim = g.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.12)', opacity: .25 }], { duration: 720, easing: 'cubic-bezier(.2,.7,.2,1)' });
    return anim.finished.catch(() => {}).then(() => g.remove());
  }
  takeFiles(list) {
    const KIND = { stl: 'STL', step: 'STEP', stp: 'STEP', iges: 'IGES', igs: 'IGES', sldprt: 'SolidWorks', x_t: 'Parasolid', pdf: 'PDF drawing', eml: 'Email', xlsx: 'BOM', xls: 'BOM', csv: 'BOM', jpg: 'Photo', png: 'Photo' };
    const READ = { STL: 'mesh read · envelope and volume measured · features matched to BRKT-001', STEP: 'faces, holes and setups read', 'PDF drawing': 'notes, tolerances and finish callouts read', Email: 'quantities, dates and terms read', BOM: 'part numbers matched', Photo: 'reference only, no dimensions' };
    const files = Array.from(list || []).slice(0, 6).map((f) => {
      const ext = (f.name.split('.').pop() || '').toLowerCase(); const kind = KIND[ext] || 'File';
      return { name: f.name, size: (f.size >= 1e6 ? (f.size / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1e3)) + ' KB') + ' · from your machine', kind, extracted: READ[kind] || 'read as reference', linked: 'RFQ-1235' };
    });
    if (!files.length) return;
    this.setState({ extraFiles: this.state.extraFiles.concat(files), dragging: false });
    this.say('Read ' + files.length + ' more file' + (files.length === 1 ? '' : 's') + ' for RFQ-1235: ' + files.map((f) => f.name).join(', ') + '. Nothing changed the cost.');
  }
  // Values added on top of the mockup's own: agent drawer, inbox band, send gate, win, intake.
  extras(vals) {
    const st = this.state, MUT = 'color:color-mix(in srgb,var(--color-text) 55%,transparent)';
    const { floorAmt, floorStr, grandStr } = vals;
    const chatAll = vals.chatSeed.concat(st.chatExtra.map((m) => ({ who: m.who, time: m.time, text: m.text, align: m.who === 'You' ? 'flex-end' : 'flex-start', bg: m.who === 'You' ? 'var(--color-surface)' : 'var(--color-accent-100)', rule: m.who === 'You' ? 'transparent' : 'var(--color-accent)' })));
    const checks = [
      { label: 'Revision confirmed with the buyer', ok: false, detail: 'Rev A vs Rev B open' },
      { label: 'Markup at or above your 15% floor', ok: true, detail: vals.markupNote },
      { label: 'Required certs held', ok: true, detail: 'ISO 9001 verified' },
      { label: 'Drawing notes read', ok: true, detail: '9 of 9' },
      { label: 'Outside ops scheduled', ok: true, detail: 'LPI at Northstar NDT, 2 d' },
    ].map((c) => Object.assign(c, { cls: c.ok ? 'ok' : 'no', mark: c.ok ? '✓' : '✕' }));
    const failing = checks.filter((c) => !c.ok);
    const send = () => { this.setState({ sent: true, sendDialog: false, screen: 'neg', stage: 'neg' }); this.say('Quote Q-1235 sent to Halcyon Industrial at ' + grandStr + ', 8 to 10 days. I flagged the Rev A/B question in the cover note.'); };
    const won = st.won.length > 0, sent = st.sent || won;
    // What waits on the shop: the escalated final until the quote goes out, and the Rev A/B conflict.
    const escalations = sent ? 0 : 1, revConflicts = 1;
    const needsCount = escalations + revConflicts;
    const agentLines = { 'RFQ-1235': won ? 'Won at $4,480. PO expected from Halcyon this week.' : st.sent ? 'Quote sent; the buyer\'s $4,480 final is under your floor. Waiting on you.' : 'Costed both parts; the buyer\'s $4,480 final is under your 15% floor. Waiting on you.', 'RFQ-1238': 'Drawing says Rev C, email says Rev B. Holding the quote until Sable Aerospace confirms.', 'RFQ-4417': 'Bid $99.10 at 6 weeks to Halcyon\'s agent; ranked 3rd of 3 on price, 1st on response.', 'RFQ-1236': 'Countered Meridian at $6,380; their target is $6,100.', 'RFQ-1234': 'Holding $3,110; Northwind is comparing two shops.', 'RFQ-1231': 'Countered Redline at $4,170 on the three mounts; waiting on their reply', 'RFQ-1229': 'Quoted $1,240 on Sep 12; no reply yet.', 'RFQ-1227': 'Won on Sep 10 at $2,860; in the schedule for Oct 2.' };
    const rows = vals.rfqs.map((r) => {
      const mine = r.id === 'RFQ-1235';
      const status = mine && won ? 'Won' : mine && st.sent ? 'Quoted' : r.status;
      const row = Object.assign({}, r, { status, agentLine: agentLines[r.id] || '', dotCls: r.group === 'neg' ? 'pulse-dot' : '',
        group: mine && sent ? 'quoted' : r.group, tagClass: mine && sent ? 'tag-outline' : r.tagClass });
      return Object.assign(row, rowStage(row, MUT));
    });
    const rfqs = rows.filter((r) => st.filter === 'all' || r.group === st.filter);
    // KPIs come from the rows under them.
    const neg = rows.filter((r) => r.group === 'neg'), quoted = rows.filter((r) => r.group === 'quoted');
    const sum = (list) => list.reduce((a, r) => a + dollars(r.value), 0);
    const needsSub = [escalations ? escalations + ' escalation' : '', revConflicts ? revConflicts + ' rev conflict' : ''].filter(Boolean).join(' · ') || 'nothing waiting';
    const inboxStats = [
      { k: 'Needs you', v: String(needsCount), sub: needsSub },
      { k: 'Agent negotiating', v: String(neg.length), sub: money0(sum(neg)) + ' in play' },
      { k: 'Quoted this week', v: money0(sum(quoted)), sub: 'avg. 4 min to quote' },
      { k: 'Win rate · 30 d', v: '41%', sub: '↑ 6 pts vs. last month' }
    ];
    const feed = [
      won ? { when: 'just now', text: 'Won RFQ-1235 at $4,480. Both parts, 8 to 10 days, Net 30.' } : null,
      st.sent ? { when: 'just now', text: 'Sent Q-1235 to Halcyon Industrial at ' + grandStr + '.' } : null,
      { when: '9 min', text: 'RFQ-1235: Halcyon\'s final of $4,480 is under your 15% floor. Paused for you.' },
      { when: '41 min', text: 'RFQ-4417: bid $99.10 at 6 weeks to Halcyon\'s agent.' },
      { when: '2 h', text: 'RFQ-1238: found a Rev B mention in the email against a Rev C drawing. Holding.' },
      { when: '3 h', text: 'RFQ-1236: countered Meridian at $6,380, holding Net 30.' },
    ].filter(Boolean).slice(0, 3);
    const tabs = Component.TABS.map(([k, label]) => ({ key: k, label, go: k === 'parts' ? this.go(st.stage) : this.go(k),
      sel: k === (Component.isStage(st.screen) ? 'parts' : st.screen) ? 'border-bottom-color:var(--color-accent);color:var(--color-text)' : MUT,
      badge: k === 'shop' && won ? String(st.won.length) : '', badgeCls: k === 'shop' && won ? 'on' + (st.wonBump ? ' bump' : '') : '' }));
    const quoteTotals = vals.quoteTotals.map((t, i) => i === 0 ? Object.assign({}, t, { sub: t.sub + ' · high confidence' }) : t);
    const negLine = 'Negotiating ' + neg.length + ' RFQs, one holding on a revision.';
    const underFloor = money0(floorAmt - 4480), acceptedMarkup = ((4480 / vals.subtotalAmt - 1) * 100).toFixed(1) + '%';
    return {
      tabs, rfqs, quoteTotals, feed, inboxStats, rfqCount: String(rows.length),
      agentStatus: won ? 'RFQ-1235 is won. ' + negLine : (st.sent ? '1 decision waiting: Halcyon\'s final on RFQ-1235. ' + negLine : '2 decisions waiting on you. ' + negLine),
      needsCount: String(needsCount), needsPlural: needsCount === 1 ? '' : 's', needsAny: needsCount > 0, needsNone: needsCount === 0, filterNeeds: () => this.setState({ filter: 'needs' }),
      files: vals.files.concat(st.extraFiles),
      pickFiles: (e) => this.takeFiles(e.target.files), dropFiles: (e) => { e.preventDefault(); this.takeFiles(e.dataTransfer && e.dataTransfer.files); },
      dragOver: (e) => { e.preventDefault(); if (!st.dragging) this.setState({ dragging: true }); }, dragLeave: () => { if (st.dragging) this.setState({ dragging: false }); },
      dropSt: st.dragging ? 'border-color:var(--color-accent);background:var(--color-accent-100)' : '',
      checks, failing, passCount: String(checks.length - failing.length), checkCount: String(checks.length), failCount: String(failing.length), failPlural: failing.length === 1 ? '' : 's',
      sendLabel: st.sent ? 'Sent' : failing.length ? 'Send anyway…' : 'Send quote', sendClass: failing.length || st.sent ? 'btn-secondary' : 'btn-primary',
      sendClick: st.sent ? this.go('neg') : failing.length ? () => this.setState({ sendDialog: true }) : send,
      sendDialog: st.sendDialog, closeSendDialog: () => this.setState({ sendDialog: false }), sendAnyway: send, resolveFirst: () => this.setState({ sendDialog: false, screen: 'ingest', stage: 'ingest' }),
      acceptOffer: (e) => { const from = e && e.target && e.target.closest ? e.target.closest('[data-reco]') : null; this.fly(from, 'Won · RFQ-1235 · $4,480').then(() => { this.setState({ won: [{ rfq: 'RFQ-1235', part: 'Industrial bracket + plate', buyer: 'Halcyon Industrial', value: '$4,480', when: 'just now' }], wonBump: Date.now() }); setTimeout(() => this.setState({ wonBump: 0 }), 800); this.say('Accepted $4,480. That is ' + acceptedMarkup + ' markup, ' + underFloor + ' under your floor. I will confirm the PO with Halcyon.'); }); },
      holdOffer: () => this.say('Holding. I told Halcyon\'s agent we need until tomorrow 09:00 and kept the price at $4,540.'),
      counterOffer: () => this.say('Countered at ' + vals.counterStr + ' with anodize off and 8 days: ' + money0(vals.counterAmt - floorAmt) + ' above your floor.'),
      wonBanner: won, wonText: 'Halcyon Industrial accepted $4,480 for both parts, 8 to 10 days, Net 30.', won: st.won, wonAny: won, wonCount: String(st.won.length), goShop: this.go('shop'),
      deciding: !won,
      agentOpen: st.agent && !st.agentMin, agentMin: st.agent && st.agentMin,
      agentBtnSt: st.agent && !st.agentMin ? 'border-color:var(--color-accent)' : '',
      toggleAgent: () => this.setState(st.agent && !st.agentMin ? { agentMin: true } : { agent: true, agentMin: false, chatSeen: chatAll.length }),
      agentMinimize: () => this.setState({ agentMin: true }), agentClose: () => this.setState({ agent: false }), agentExpand: () => this.setState({ agent: true, agentMin: false, chatSeen: chatAll.length }),
      agentUnread: chatAll.length > st.chatSeen, agentUnreadCount: String(chatAll.length - st.chatSeen),
      chat: chatAll,
      suggestions: [
        { label: 'Why is Op30 costly?', ask: () => this.ask('Why is Op30 costly?', 'Two Ø8 H7 bores carry true position Ø0.1 to datum A across faces. Holding that in one setup needs the DMU; on the Haas it would take a third setup and a boring head, saving $0.60 but adding position risk.') },
        { label: 'Re-cost in 7075', ask: () => this.ask('Re-cost in 7075', '7075-T6 plate is $14.20/kg against $9.40. Material goes from $9.40 to $13.30 per part and machining is unchanged, so BRKT-001 lands at $58.22 at qty 10. Still under Halcyon\'s $4,480 across both parts.') },
        { label: 'Draft reply to buyer', ask: () => this.ask('Draft reply to buyer', 'Draft: "Halcyon team, the drawing is Rev A and the email mentions Rev B, which changes the rib thickness. Please confirm which revision to quote. Price holds either way until ' + VALID_UNTIL + '." Say send and I will send it.') },
      ],
      chatInput: st.chatInput, chatType: (e) => this.setState({ chatInput: e.target.value }),
      chatSend: () => { const q = (st.chatInput || '').trim(); if (q) this.ask(q, 'I can check that against the cost model and the thread for RFQ-1235. The open items are the Rev A/B question and Halcyon\'s $4,480 final, which is ' + underFloor + ' under your floor.'); },
    };
  }

  // Builds the Costing tab's view: step rows with their feature sub-rows, material lines,
  // subtotals, the highlight state of every drawing region, and the caption.
  costView() {
    const { hot, pin, closed, lpi } = this.state;
    const active = hot || pin;
    const items = {};
    const on = (id) => ({
      enter: () => this.setState({ hot: id }),
      leave: () => this.setState({ hot: null }),
      pin: () => this.setState(st => ({ pin: st.pin === id ? null : id }))
    });
    const cls = (id) => (active === id ? 'is-hot' : '') + (pin === id ? ' is-pin' : '');

    const steps = STEPS.map(s => {
      const subs = [];
      if (s.setup) subs.push({ id: s.id + '-setup', name: 'Setup, amortised over ' + QTY, detail: s.setupDetail, tool: s.setupTool, min: s.setup / QTY, regions: s.setupRegions });
      subs.push(...s.features);
      const run = s.features.reduce((a, f) => a + f.min, 0);
      const perPart = (s.setup / QTY + run) / 60 * s.rate;
      const rows = subs.map(f => {
        const c = f.min / 60 * s.rate;
        items[f.id] = { title: f.name, detail: f.detail, meta: f.tool + ' · ' + f.min.toFixed(1) + ' min @ $' + s.rate + '/hr', cost: money(c), regions: f.regions };
        return { ...f, minStr: f.min.toFixed(1), cost: money(c), cls: cls(f.id), ...on(f.id) };
      });
      items[s.id] = { title: s.name, detail: s.detail, meta: s.machine + ' · $' + s.rate + '/hr', cost: money(perPart), regions: [...new Set(subs.flatMap(f => f.regions))] };
      return { ...s, setupStr: s.setup ? String(s.setup) : '—', runStr: run.toFixed(1), rateStr: '$' + s.rate, cost: money(perPart), perPart,
        open: !closed[s.id], chev: closed[s.id] ? '▸' : '▾', rows, cls: cls(s.id), ...on(s.id),
        toggle: () => this.setState(st => ({ closed: { ...st.closed, [s.id]: !st.closed[s.id] } })) };
    });
    const materials = MATERIALS.map(m => {
      // Per-batch lines (the fixture) sit on the quote, not in the unit cost.
      const inc = m.batch ? false : m.optional ? lpi : true;
      const per = m.cost * (1 + m.scrap / 100);
      items[m.id] = { title: m.item, detail: m.detail, meta: m.type + ' · ' + m.mode + (m.scrap ? ' · +' + m.scrap + '% scrap' : '') + (inc ? '' : ' · not in unit cost'), cost: money(per), regions: m.regions };
      return { ...m, inc, costStr: money(m.cost), scrapStr: m.scrap ? m.scrap + ' %' : '—', per: m.batch ? '—' : money(per), perPart: inc ? per : 0,
        rowStyle: inc ? '' : 'opacity:.55', incLabel: inc ? 'Included' : 'Not in unit cost', cls: cls(m.id), ...on(m.id),
        toggleInc: () => this.setState(st => ({ lpi: !st.lpi })) };
    });
    const stepsSub = steps.reduce((a, s) => a + s.perPart, 0);
    const matSub = materials.reduce((a, m) => a + m.perPart, 0);

    const hotRegions = active && items[active] ? items[active].regions : [];
    const ft = {};
    REGIONS.forEach(r => { ft[r] = active ? (hotRegions.includes(r) ? 'hot' : 'off') : ''; });
    const dwg = {};
    REGIONS.forEach(r => { dwg[r] = on(REGION_ROW[r]); });

    const cap = active && items[active]
      ? { ...items[active], hint: pin === active ? 'Pinned · click to release' : 'Click to pin' }
      : { title: 'BRKT-001 · Industrial Bracket, Rev A', detail: 'Hover a step, feature or material line to see where it lands on the part. Click to pin it.', meta: '155 × 85 × 42 mm · 6061-T6', cost: money(stepsSub + matSub), hint: '' };

    return { steps, materials, stepsSub: money(stepsSub), matSub: money(matSub), unitCost: money(stepsSub + matSub), stepCount: steps.length + ' steps', lineCount: materials.length + ' lines', ft, dwg, cap, capCls: active ? 'is-on' : '' };
  }
  renderVals() {
    const { screen, stage, agent, filter, theme, selectedFinding, view, lpi, won } = this.state;
    // Round 3 of the negotiation, escalated, until the shop decides; a win clears the escalation.
    const escalated = (this.props.escalated ?? true) && !won.length;
    const inParts = Component.isStage(screen);
    const activeTab = inParts ? 'parts' : screen;
    const tabs = Component.TABS.map(([k, label]) => ({ label, go: k === 'parts' ? this.go(stage) : this.go(k), sel: k === activeTab ? 'border-bottom-color:var(--color-accent);color:var(--color-text)' : MUTED }));
    // Story: round 3 of the negotiation, escalated. Everything before it is done.
    const reached = Component.STAGES.findIndex(([k]) => k === 'neg');
    const stages = Component.STAGES.map(([k, l], i) => ({
      label: l, go: this.go(k), current: k === screen ? 'step' : 'false',
      mark: i < reached && k !== screen ? '✓' : String(i + 1), markClass: i < reached && k !== screen ? 'done' : '', sep: i < Component.STAGES.length - 1 ? '›' : ''
    }));
    const postView = (id) => { const v = this.viewer(); if (v) v.postMessage({ type: 'view', id }, '*'); };
    const red='var(--color-accent)', amber='var(--color-accent-2-600)';
    const cost = this.costView();

    // ── Quote: the three breaks the RFQ asked for, priced off the cost model. The buyer took qty 50. ──
    const MARKUP = 20, BREAKS = [10, 25, 50], SEL = 50;
    const mk=(qty,cost,mkp)=>{const p=cost*(1+mkp/100);return{qty:String(qty),q:qty,costN:cost,priceN:p,cost:'$'+cost.toFixed(2),mk:mkp+' %',price:'$'+p.toFixed(2),total:money2(p*qty),margin:(100-100/(1+mkp/100)).toFixed(1)+'%',
      sel:qty===SEL?'Buyer selected':'',rowSt:qty===SEL?'background:var(--color-accent-100)':''}};
    const brk=(steps,materials)=>BREAKS.map((q)=>mk(q,unitCost(steps,materials,q,lpi),MARKUP));
    const quoteLines=[
      {id:'BRKT-001',name:'Industrial Bracket',material:'Aluminum 6061-T6',lead:'8–10 business days',breaks:brk(STEPS,MATERIALS)},
      {id:'PLT-002',name:'Mounting Plate',material:'Aluminum 6061-T6 · anodize II',lead:'8–10 business days (incl. outside op)',breaks:brk(PLT_STEPS,PLT_MATERIALS)}
    ];
    const selected=quoteLines.map((l)=>l.breaks.find((b)=>b.q===SEL));
    const subtotalAmt=selected.reduce((a,b)=>a+b.costN*SEL,0);
    const totalAmt=selected.reduce((a,b)=>a+b.priceN*SEL,0);
    const markupAmt=totalAmt-subtotalAmt, grandAmt=totalAmt+FIXTURE;
    const marginPct=(100-100/(1+MARKUP/100)).toFixed(1);
    const markupNote=MARKUP+'% markup · '+marginPct+'% margin';
    // The shop's floor is 15% markup over parts cost; the counter sits just above it.
    const FLOOR_PCT=15, floorAmt=Math.round(subtotalAmt*(1+FLOOR_PCT/100)), counterAmt=floorAmt+5;
    const floorStr=money0(floorAmt), counterStr=money0(counterAmt), grandStr=money2(grandAmt);
    const brktAt=(q)=>unitCost(STEPS,MATERIALS,q,lpi);
    const curve1=brktAt(1);
    // Finding badges are the cost-model rows behind each finding, at the qty 10 costing.
    const stepBy=(id)=>cost.steps.find((s)=>s.id===id), matBy=(id)=>cost.materials.find((m)=>m.id===id);
    const featCost=(id)=>{for(const s of STEPS){const f=s.features.find((x)=>x.id===id);if(f)return f.min/60*s.rate;}return 0;};
    const fCost=[matBy('billet').perPart+stepBy('op10').perPart, featCost('ribs'), stepBy('op30').perPart+stepBy('cmm').perPart, MATERIALS.find((m)=>m.id==='lpi').cost];
    const bubble=(side,text,meta,offer)=>({left:side==='L'?text:'',leftMeta:side==='L'?meta:'',leftVis:side==='L'?'visible':'hidden',right:side==='R'?text:'',rightMeta:side==='R'?meta:'',rightVis:side==='R'?'visible':'hidden',offer});
    const findings=[
      {n:'1',sev:'High',tags:'Material · Cycle',title:FINDING_TITLES[0],body:'Deep pockets on both faces drive rough time and stock cost together. Consider a near-net extrusion at qty 50+.',k1:'Stock',v1:'165 × 95 × 52 mm',k2:'Cost impact',v2:money(fCost[0])+' / part',rule:red,tagClass:'tag-accent'},
      {n:'2',sev:'High',tags:'Distortion · Thin wall',title:FINDING_TITLES[1],body:'Chatter-limited finishing. Leave skins thick until Op20 and use climb passes; expect a light re-flatten.',k1:'Min wall',v1:'1.8 mm',k2:'Scrap risk',v2:'4%',rule:red,tagClass:'tag-accent'},
      {n:'3',sev:'Medium',tags:'Tolerance · GD&T',title:FINDING_TITLES[2],body:'Ream in one setup on the DMU to hold position to datum A. CMM program from a similar bracket exists.',k1:'Tol band',v1:'+0.015 / 0',k2:'Op',v2:'Op30 · 5-axis',rule:amber,tagClass:'tag-accent-2'},
      {n:'4',sev:'Medium',tags:'Inspection · Outside op',title:FINDING_TITLES[3],body:'Drawing note 7. Adds a 2-day outside step at Northstar NDT; agent has added it to lead time.',k1:'Vendor',v1:'Northstar NDT · 2 d',k2:'Cost',v2:'$18 / part',rule:amber,tagClass:'tag-accent-2'}
    ].map((f, i) => { const id = 'f' + (i + 1); return { ...f, id, cost: money(fCost[i]), sevStyle: SEV_STYLE[f.sev], selSt: selectedFinding === id ? 'box-shadow:0 0 0 2px var(--color-accent)' : '',
      pick: () => { const next = selectedFinding === id ? null : id; this.setState({ selectedFinding: next }); const v = this.viewer(); if (v) v.postMessage({ type: 'select', id: next }, '*'); } }; });
    const vals = {
      tabs, stages, inParts, escalated, agentOpen: agent, agentBtnSt: agent ? 'background:var(--color-text);color:var(--color-bg);border-color:var(--color-text)' : '',
      toggleTheme: () => { const next = theme === '' ? 'dark' : theme === 'dark' ? 'light' : ''; applyTheme(next); const v = this.viewer(); if (v) v.postMessage({ type: 'theme', value: next }, '*'); this.setState({ theme: next }); },
      themeLabel: theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'Auto theme',
      viewCad: () => { postView('3d'); this.setState({ view: '3d' }); }, viewDrawing: () => { if (screen !== 'part') this.setState({ screen: 'part', stage: 'part', view: 'pdf' }); else { postView('pdf'); this.setState({ view: 'pdf' }); } },
      segCad: view === '3d' ? 'background:var(--color-text);color:var(--color-bg)' : 'background:transparent;color:inherit', segDrawing: view === 'pdf' ? 'background:var(--color-text);color:var(--color-bg)' : 'background:transparent;color:inherit',
      findingCount: String(findings.length),
      filter, setFilter: (f) => () => this.setState({ filter: f }),
      filters: [['all','All'],['needs','Needs you'],['neg','Agent negotiating'],['quoted','Quoted']].map(([k,l]) => ({ label: l, go: () => this.setState({ filter: k }), on: filter === k ? 'background:var(--color-text);color:var(--color-bg);border-color:var(--color-text)' : '' })),
      buyerLink: '/app',
      profile: { name: 'Cascade CNC', loc: 'Bend, OR', certs: ['ISO 9001', 'AS9100D'], onTime: '91%', quality: '93%', response: '97%', wOnTime: 'width:91%', wQuality: 'width:93%', wResponse: 'width:97%' }, toggleAgent: () => this.setState(s=>({agent:!s.agent})),
      goInbox:this.go('inbox'), goIngest:this.go('ingest'), goPart:this.go('part'), goCost:this.go('cost'), goQuote:this.go('quote'), goNeg:this.go('neg'), goPdf:this.go('pdf'),
      isInbox:screen==='inbox', isIngest:screen==='ingest', isPart:screen==='part', isCost:screen==='cost', isQuote:screen==='quote', isNeg:screen==='neg', isShop:screen==='shop', isPdf:screen==='pdf',
      // Inbox rows. group: needs | neg | quoted. Stage rail, KPIs and the count derive from these in extras().
      rfqs:[
        {id:'RFQ-1235',name:'Industrial bracket + plate',buyer:'Halcyon Industrial',source:'Email',parts:'2',files:'7',due:'Sep 16',value:'$4,710',status:'Escalated to you',group:'needs',tagClass:'tag-accent',open:this.go('neg')},
        {id:'RFQ-1238',name:'Manifold body, Rev C',buyer:'Sable Aerospace',source:'Marketplace',parts:'1',files:'3',due:'Sep 15',value:'$12,900',status:'Rev conflict',group:'needs',tagClass:'tag-accent',open:this.go('ingest')},
        {id:'RFQ-4417',name:'Actuator Housing, Rev C',buyer:'Halcyon Industrial',source:'Marketplace',parts:'1',files:'2',due:'Nov 14',value:'$24,775',status:'Agent negotiating',group:'neg',tagClass:'tag-neutral',open:this.go('neg')},
        {id:'RFQ-1236',name:'Housing set',buyer:'Meridian Robotics',source:'Upload',parts:'4',files:'9',due:'Sep 18',value:'$6,380',status:'Agent negotiating',group:'neg',tagClass:'tag-neutral',open:this.go('neg')},
        {id:'RFQ-1234',name:'Shaft + collar',buyer:'Northwind Ag Systems',source:'Email',parts:'2',files:'4',due:'Sep 17',value:'$3,110',status:'Agent negotiating',group:'neg',tagClass:'tag-neutral',open:this.go('neg')},
        {id:'RFQ-1231',name:'Sensor mount ×3',buyer:'Redline Motorsport',source:'Marketplace',parts:'3',files:'5',due:'Sep 20',value:'$4,170',status:'Agent negotiating',group:'neg',tagClass:'tag-neutral',open:this.go('neg')},
        {id:'RFQ-1229',name:'Fixture plate',buyer:'Halcyon Industrial',source:'Email',parts:'1',files:'2',due:'Sep 14',value:'$1,240',status:'Quoted',group:'quoted',tagClass:'tag-outline',open:this.go('quote')},
        {id:'RFQ-1227',name:'Gear cover',buyer:'Meridian Robotics',source:'Upload',parts:'1',files:'3',due:'Sep 12',value:'$2,860',status:'Won',group:'quoted',tagClass:'tag-outline',open:this.go('quote')}
      ],
      files:[
        {name:'BRKT-001.step',size:'CAD · 16.4 MB',kind:'STEP',extracted:'155×85×42 mm · 14 pockets · 6 bores · min wall 1.8 mm · 0.61 kg',linked:'BRKT-001'},
        {name:'BRKT-001-RevA.pdf',size:'Drawing · 2.8 MB · 3 sheets',kind:'PDF drawing',extracted:'9 notes · 12 tolerances · TP Ø0.1 on bores · LPI 100% · chamfer 0.5',linked:'BRKT-001'},
        {name:'PLT-002.sldprt',size:'CAD · 3.1 MB',kind:'SolidWorks',extracted:'Converted to STEP · 120×80×12 mm · 8 thru holes',linked:'PLT-002'},
        {name:'RE: RFQ-1235 bracket set.eml',size:'Email thread · 4 messages',kind:'Email',extracted:'Qty 10 / 25 / 50 · need by Nov 3 · Net 30 · anodize Type II on plate · "Rev B" mentioned',linked:'Both'},
        {name:'BOM_Q4_halcyon.xlsx',size:'Spreadsheet · 44 KB',kind:'BOM',extracted:'2 lines matched by part number · 1 unmatched (hardware, ignored)',linked:'Both'},
        {name:'IMG_2291.jpg',size:'Photo · 2.2 MB',kind:'Photo',extracted:'Mating assembly reference — no dimensions. Confirms bracket orientation.',linked:'BRKT-001'},
        {name:'Q2211_prior_vendor.pdf',size:'Competitor quote · 190 KB',kind:'Existing quote',extracted:'$5,120 all-in at 12 days · used as price anchor in negotiation',linked:'RFQ'}
      ],
      reqs:[
        {k:'Quantities',v:'10 · 25 · 50 breaks',src:'Email',tagClass:'tag-neutral'},{k:'Need by',v:'Nov 3, 2026',src:'Email',tagClass:'tag-neutral'},{k:'Material',v:'6061-T6 per AMS-QQ-A-250/11',src:'Drawing',tagClass:'tag-neutral'},{k:'Finish',v:'Anodize Type II (PLT-002 only)',src:'Email',tagClass:'tag-neutral'},{k:'Inspection',v:'LPI 100%, no indications',src:'Drawing',tagClass:'tag-neutral'},{k:'Revision',v:'A (drawing) vs. B (email)',src:'Conflict',tagClass:'tag-accent'},{k:'Terms',v:'Net 30 · Ex Works',src:'Email',tagClass:'tag-neutral'},{k:'Price anchor',v:'$5,120 · 12 days',src:'Competitor',tagClass:'tag-neutral'}
      ],
      partStats:[{k:'Material',v:'6061-T6 · AMS-QQ-A-250/11'},{k:'Envelope',v:'155 × 85 × 42 mm'},{k:'Setups',v:String(STEPS.filter((s)=>s.setup||s.id==='op30').length)},{k:'Cycle est.',v:(runMin(STEPS)/60).toFixed(2)+' hr / part'},{k:'Unit cost',v:money(brktAt(QTY))+' @ '+QTY}],
      setups:[{op:'Op10',name:'Top · vise',detail:'Rough pockets, profile · 0.18 hr'},{op:'Op20',name:'Back · soft jaws',detail:'Finish ribs, back pocket · 0.14 hr'},{op:'Op30',name:'Bores · 5-axis',detail:'Ream Ø8 H7, c-bores · 0.06 hr'},{op:'Inspection',name:'CMM',detail:'True position, 6 bores · 0.05 hr'}],
      findings,
      ...cost,
      qtyCurve:[1,5,10,25,50].map((q)=>{const c=brktAt(q);return{qty:String(q),w:Math.round(c/curve1*100)+'%',cost:money(c)};}),
      levers:[{k:'Near-net extrusion at qty 50',v:'−$6.10'},{k:'Relax rib to 2.5 mm (ask buyer)',v:'−$3.20'},{k:'Run Op30 on VF-2SS with boring head',v:'−$0.60, +risk'},{k:'Drop LPI to sample AQL',v:'−$14.40 of the $18 outside op'}],
      quoteTotals:[{k:'Subtotal · cost',v:money2(subtotalAmt),sub:'2 parts, qty '+SEL+' selected',bg:'transparent',fg:'inherit'},{k:'Total markup',v:money2(markupAmt),sub:markupNote,bg:'transparent',fg:'inherit'},{k:'Lead time',v:'8–10 d',sub:'incl. LPI + anodize',bg:'transparent',fg:'inherit'},{k:'Quote total',v:grandStr,sub:'incl. '+money0(FIXTURE)+' fixture',bg:'var(--color-accent)',fg:'var(--color-bg)'}],
      quoteLines, subtotalAmt, floorAmt, floorStr, counterAmt, counterStr, grandStr, markupNote,
      quoteDate: QUOTE_DATE, selQty: String(SEL), fixtureStr: money2(FIXTURE), lpiLine: lpi ? 'included' : 'quoted separately, ' + money(MATERIALS.find((m) => m.id === 'lpi').cost) + ' per part',
      msgs:[
        bubble('L','Target $4,400 all-in for both parts at the qty 50 break, delivered in 8 days.','Buyer agent · 09:02','$4,400'),
        bubble('R','Quoted $4,710 at 8–10 days. $4,620 if the PO lands this week — fixture is already in the schedule.','Your agent · 09:02 · within rules','$4,620'),
        bubble('L','$4,450 and we drop the anodize on PLT-002.','Buyer agent · 09:06','$4,450'),
        bubble('R','Anodize off saves $80 and a day. $4,540, 8 days.','Your agent · 09:06 · within rules','$4,540'),
        bubble('L','$4,480, final. Our prior vendor is at $5,120 but 12 days.','Buyer agent · 09:11','$4,480'),
        bubble('R','Paused. $4,480 is under the 15% floor. Waiting for Cascade.','Your agent · 09:11 · escalated','—')
      ],
      rails:[{k:'Floor markup',v:FLOOR_PCT+'% ('+floorStr+')'},{k:'Auto-accept at or above',v:'$4,600'},{k:'Min lead time',v:'7 days'},{k:'Max concessions',v:'3 rounds'},{k:'Escalate on',v:'scope change · < floor'},{k:'Offer validity',v:'48 h'}],
      machines:[{name:'Haas VF-2SS',type:'3-axis VMC',env:'762 × 406 × 508',rate:'$85',setup:'$85 / hr',w:'62%',booked:'62%'},{name:'DMG Mori DMU 50',type:'5-axis',env:'500 × 450 × 400',rate:'$95',setup:'$110 / hr',w:'44%',booked:'44%'},{name:'Doosan Puma 2100',type:'CNC lathe',env:'Ø350 × 550',rate:'$80',setup:'$85 / hr',w:'71%',booked:'71%'},{name:'Zeiss Contura',type:'CMM',env:'700 × 1000 × 600',rate:'$70',setup:'—',w:'30%',booked:'30%'}],
      rules:[{k:'Default markup',v:MARKUP+'%'},{k:'Floor markup',v:FLOOR_PCT+'%'},{k:'Rush (< 5 d)',v:'+25%'},{k:'Material buffer',v:'+4% stock'},{k:'Repeat buyer discount',v:'−2% after 3 orders'}],
      chatSeed:[
        {who:'You',time:'09:15',text:'What if the buyer accepts 2.5 mm ribs?',align:'flex-end',bg:'var(--color-surface)',rule:'transparent'},
        {who:'Shop agent',time:'09:15',text:'Op20 drops from 0.14 to 0.10 hr and scrap allowance halves: −$3.20 per part, −$160 at qty 50. I can propose it in the negotiation as a trade for their $4,480.',align:'flex-start',bg:'var(--color-accent-100)',rule:'var(--color-accent)'},
        {who:'Shop agent',time:'09:16',text:'Reminder: the Rev A / Rev B conflict is still open with Halcyon. I would not commit a final price until they confirm.',align:'flex-start',bg:'var(--color-accent-100)',rule:'var(--color-accent)'}
      ]
    };
    Object.assign(vals, this.extras(vals));
    return vals;
  }
}
  window.DC.mount(Component);
})();
