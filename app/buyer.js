// Buyer-side screens. The design mockup's data and timing, with the pipeline decisions wired in:
// release is gated and flagged when the part is not safe, the mandate lives in the buyer profile,
// the buyer agent never escalates, the spec is read-only, findings can be applied, offers can be awarded.
(function () {
  const DCLogic = window.DC.DCLogic;
  const MUTED = 'color:color-mix(in srgb,var(--color-text) 55%,transparent)';
  const MUT_JS = MUTED;
  const ACC = 'color:var(--color-good)';
  const WARN = 'color:var(--color-warn)';
  const BAD = 'color:var(--color-bad)';
  const INFO = 'color:var(--color-neutral-600)';
  const readTheme = () => { try { return localStorage.getItem('canyon-theme') || ''; } catch (e) { return ''; } };
  const applyTheme = (t) => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; try { localStorage.setItem('canyon-theme', t); } catch (e) { /* private mode */ } };
  const money = (n) => '$' + n.toFixed(2);
  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

  /* ── Profile: the mandate, set once per buyer ── */
  const DEFAULT_PROFILE = {
    ceilingPct: '0', bufferDays: '7', terms: 'Net 45', termsHard: true,
    certsRequired: ['ISO 9001'], certsPreferred: ['AS9100D'], domestic: true, sources: '2', autoAccept: true,
    wPrice: '50', wOntime: '25', wLead: '15', wTerms: '10'
  };
  const CERT_OPTIONS = ['ISO 9001', 'AS9100D', 'ITAR', 'NADCAP'];
  const loadProfile = () => {
    try { const raw = localStorage.getItem('canyon-profile'); if (raw) { const p = JSON.parse(raw); return { profile: Object.assign({}, DEFAULT_PROFILE, p.profile), profileSet: !!p.profileSet }; } } catch (e) { /* private mode */ }
    return { profile: Object.assign({}, DEFAULT_PROFILE), profileSet: false };
  };
  const saveProfile = (profile, profileSet) => { try { localStorage.setItem('canyon-profile', JSON.stringify({ profile, profileSet })); } catch (e) { /* private mode */ } };

  /* ── Verified shops the match step filters ── */
  const SHOPS = [
    { key: 'r', name: 'Ridgeline Tool Works', loc: 'Elkhart, IN', certs: ['ISO 9001', 'AS9100D'], domestic: true, queue: 'queue 54%', lead: '4 wk', note: '12 prior jobs with Halcyon' },
    { key: 'm', name: 'Midstate Precision', loc: 'Dayton, OH', certs: ['ISO 9001'], domestic: true, queue: 'queue 67%', lead: '4.5 wk', note: 'Holds 400-pc ceiling at price' },
    { key: 'c', name: 'Cascade CNC', loc: 'Bend, OR', certs: ['ISO 9001', 'AS9100D'], domestic: true, queue: 'queue 58%', lead: '6 wk', note: 'New to your supplier list' },
    { key: 'd', name: 'Delta Contract Mfg', loc: 'Mesa, AZ', certs: ['AS9100D'], domestic: true, queue: 'queue 96%', lead: '9 wk', note: '5-axis cell booked through Nov' },
    { key: 'h', name: 'Halvorsen Machine', loc: 'Duluth, MN', certs: ['ISO 9001'], domestic: true, queue: 'queue 71%', lead: '7 wk', note: 'Lead time past need-by' },
    { key: 'i', name: 'Ironwood Tool and Die', loc: 'Erie, PA', certs: [], domestic: true, queue: 'queue 66%', lead: '5 wk', note: 'No ISO 9001 on file' },
  ];

  /* ── Findings on the current part ── */
  const FINDINGS = [
    { n: '1', sev: 'High', tags: ['Thin wall', 'Deep pocket'], title: 'Wall thickness vs. pocket depth', body: '0.060 in walls run 2.4 in deep on the two outboard pockets — a 40:1 ratio. Shops will slow feeds, add a semi-finish pass and expect chatter, or quote fixture work to support the walls.', impact: '+$18.40 / part', save: 14.9, fix: 'Taking the wall to 0.090 in adds 1.8 g of mass and removes a full finishing pass. At 250 ea that is $3,725 saved for a change your FEA margin already covers.' },
    { n: '2', sev: 'Medium', tags: ['Tolerance', 'Bore'], title: 'Ø0.3750 +.0005/-.0000 on two bores', body: 'A unilateral half-thou band pushes both bores to a reamed or finish-bored op with controlled approach, plus in-process gauging. Only 4 of the 11 matched shops hold this in production.', impact: '+$6.10 / part', save: 5.2, fix: 'If the bearing is a press fit, ±.001 bilateral still seats it and opens the part to 9 shops — more competition on price than the tolerance itself is worth.' },
    { n: '3', sev: 'Low', tags: ['Feature', 'Tooling'], title: 'Internal corners at R0.031', body: 'The two internal corners call R0.031, which forces a 1/16 endmill for the last pass on an otherwise 1/2 in tool part. Tool life and cycle time both take the hit.', impact: '+$2.30 / part', save: 2.3, fix: 'R0.125 corners clear the mating flange per the print and let the whole pocket run with one tool.' },
  ];
  const SEV_STYLE = { High: 'background:var(--color-accent);color:var(--color-bg)', Medium: 'background:var(--color-accent-200);color:var(--color-accent-800)', Low: 'background:color-mix(in srgb,var(--color-text) 10%,transparent)' };

  class Component extends DCLogic {
    state = Object.assign({
      screen: 'dash', tick: 0, filter: 'all',
      qty: '250', needBy: 'Nov 14, 2026',
      applied: {}, dismissed: {}, released: false, awarded: null, selectedFinding: null,
      userFiles: [], stlBuffer: null, dragging: false, pickedAt: null,
      releaseDialog: false, theme: readTheme(),
    }, loadProfile());

    componentDidMount() {
      applyTheme(this.state.theme);
      this.run();
      // The part viewer iframe reports pin clicks; mirror them on the finding cards.
      window.addEventListener('message', (e) => {
        const m = e.data || {};
        if (m.source === 'canyon-viewer' && m.type === 'select') this.setState({ selectedFinding: m.id || null });
        // A freshly mounted viewer asks for its model; hand it the buyer's STL if one was dropped.
        if (m.source === 'canyon-viewer' && m.type === 'ready' && this.state.stlBuffer) this.sendModel();
      });
    }
    sendModel() {
      const v = this.viewer(); if (!v) return;
      v.postMessage({ type: 'load', model: {
        name: (this.state.userFiles.find((f) => f.kind === 'STL') || {}).name || 'HAL-4417 Actuator Housing',
        stlBuffer: this.state.stlBuffer, pdf: '/assets/parts/actuator-housing.pdf',
        findings: [
          { id: 'f1', n: '1', sev: 'High', title: 'Wall thickness vs. pocket depth', regions: [{ at: [0.36, 0.5, 0.85], type: 'sphere', radiusFrac: 0.09 }, { at: [0.64, 0.5, 0.85], type: 'sphere', radiusFrac: 0.09 }] },
          { id: 'f2', n: '2', sev: 'Medium', title: 'Ø0.3750 bores, half-thou band', regions: [{ at: [0.19, 0.11, 1], type: 'sphere', radiusFrac: 0.06 }, { at: [0.81, 0.11, 1], type: 'sphere', radiusFrac: 0.06 }] },
          { id: 'f3', n: '3', sev: 'Low', title: 'Internal corners at R0.031', regions: [{ at: [0.11, 0.23, 0.7], type: 'sphere', radiusFrac: 0.045 }, { at: [0.89, 0.77, 0.7], type: 'sphere', radiusFrac: 0.045 }] },
        ] } }, '*');
    }
    // Files from the picker or a drop. The output is predetermined; the file names are the buyer's.
    async takeFiles(list) {
      const KIND = { stl: 'STL', step: 'STEP', stp: 'STEP', iges: 'IGES', igs: 'IGES', sldprt: 'SolidWorks', x_t: 'Parasolid', pdf: 'Drawing', xlsx: 'Terms sheet', xls: 'Terms sheet', csv: 'Terms sheet' };
      const files = Array.from(list || []).slice(0, 6).map((f) => {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        return { name: f.name, ext: ext.toUpperCase().slice(0, 4), kind: KIND[ext] || 'File', size: f.size >= 1e6 ? (f.size / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1e3)) + ' KB', file: f };
      });
      if (!files.length) return;
      const stl = files.find((f) => f.kind === 'STL');
      const readBuffer = (file) => file.arrayBuffer ? file.arrayBuffer() : new Promise((res) => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsArrayBuffer(file); });
      const stlBuffer = stl ? await readBuffer(stl.file) : null;
      this.setState({ userFiles: files.map(({ file, ...rest }) => rest), stlBuffer, dragging: false, pickedAt: Date.now(), applied: {}, dismissed: {}, released: false, awarded: null, selectedFinding: null });
      this.run();
    }
    viewer() { const f = document.querySelector('iframe[title="Part viewer"]'); return f && f.contentWindow; }
    componentDidUpdate(p, s) { if (s.screen !== this.state.screen) this.run(); }
    componentWillUnmount() { clearInterval(this._iv); }

    run() {
      clearInterval(this._iv);
      this.setState({ tick: 0 });
      const speed = { dash: 1100, rfq: 420, part: 700, neg: 1300, offers: 1500, home: 2000, profile: 99999 }[this.state.screen] || 900;
      const max = { dash: 9, rfq: 14, part: 8, neg: 9, offers: 4, home: 4, profile: 0 }[this.state.screen] || 8;
      this._iv = setInterval(() => {
        this.setState(s => ({ tick: s.tick >= max ? (s.screen === 'dash' ? 0 : max) : s.tick + 1 }));
      }, speed);
    }

    go(screen) { return () => this.setState({ screen }); }
    vis(on, dy) { return on ? 'opacity:1;transform:none' : 'opacity:0;transform:translateY(' + (dy || 10) + 'px)'; }

    // Profile editing. Values are kept as typed and parsed where used.
    setField(k) { return (e) => { const profile = Object.assign({}, this.state.profile, { [k]: e.target.value }); saveProfile(profile, this.state.profileSet); this.setState({ profile }); }; }
    toggle(k) { return () => { const profile = Object.assign({}, this.state.profile, { [k]: !this.state.profile[k] }); saveProfile(profile, this.state.profileSet); this.setState({ profile }); }; }
    toggleCert(list, name) {
      return () => {
        const cur = this.state.profile[list];
        const next = cur.includes(name) ? cur.filter((c) => c !== name) : cur.concat(name);
        const other = list === 'certsRequired' ? 'certsPreferred' : 'certsRequired';
        const profile = Object.assign({}, this.state.profile, { [list]: next, [other]: this.state.profile[other].filter((c) => c !== name) });
        saveProfile(profile, this.state.profileSet); this.setState({ profile });
      };
    }

    renderVals() {
      const st = this.state, sc = st.screen, t = st.tick, P = st.profile;
      const tabs = [['dash', 'Queue'], ['rfq', 'New request'], ['profile', 'Profile']]
        .map(([k, label]) => ({ label, go: this.go(k), sel: k === sc ? 'border-bottom-color:var(--color-accent);color:var(--color-text)' : MUTED }));

      /* ── Derived: price, band, findings, mandate, match, gate ── */
      const savings = FINDINGS.reduce((s, f, i) => s + (st.applied[i] ? f.save : 0), 0);
      const likely = 96.2 - savings;
      const bandLoF = 88 - savings, bandHiF = 104 - savings;
      const ceilingPct = num(P.ceilingPct, 0);
      const ceiling = likely * (1 + ceilingPct / 100);
      const k = likely / 96.2; // bids scale with the re-priced part
      const bid = (x) => money(x * k);
      const sources = Math.max(1, Math.round(num(P.sources, 2)));
      const findings = FINDINGS.map((f, i) => {
        const applied = !!st.applied[i], dismissed = !!st.dismissed[i];
        return Object.assign({}, f, {
          saving: '−' + money(f.save) + ' / part', sevStyle: SEV_STYLE[f.sev],
          vis: this.vis(t > i + 1, 12) + (applied || dismissed ? ';opacity:.55' : ''),
          rule: applied ? 'border-left-color:var(--color-accent-700)' : dismissed ? 'border-left-color:var(--color-divider)' : '',
          open: !applied && !dismissed, applied, dismissed,
          status: applied ? 'Applied · re-priced' : dismissed ? 'Dismissed' : '',
          selSt: st.selectedFinding === 'f' + (i + 1) ? 'box-shadow:0 0 0 2px var(--color-accent)' : '',
          pick: () => { const id = st.selectedFinding === 'f' + (i + 1) ? null : 'f' + (i + 1); this.setState({ selectedFinding: id }); const v = this.viewer(); if (v) v.postMessage({ type: 'select', id }, '*'); },
          noop: (e) => { if (e && e.stopPropagation) e.stopPropagation(); },
          apply: () => this.setState({ applied: Object.assign({}, st.applied, { [i]: true }), dismissed: Object.assign({}, st.dismissed, { [i]: false }) }),
          dismiss: () => this.setState({ dismissed: Object.assign({}, st.dismissed, { [i]: true }) }),
          undo: () => this.setState({ applied: Object.assign({}, st.applied, { [i]: false }), dismissed: Object.assign({}, st.dismissed, { [i]: false }) }),
        });
      });
      const openFindings = findings.filter((f) => f.open);
      const highOpen = openFindings.filter((f) => f.sev === 'High');
      const qualifying = SHOPS.filter((s) => P.certsRequired.every((c) => s.certs.includes(c)) && (!P.domestic || s.domestic) && !['h', 'i'].includes(s.key));
      const excluded = SHOPS.filter((s) => !qualifying.includes(s)).map((s) => ({
        name: s.name, why: !P.certsRequired.every((c) => s.certs.includes(c)) ? 'missing ' + P.certsRequired.filter((c) => !s.certs.includes(c)).join(', ') : s.note.toLowerCase()
      }));
      const gateReasons = [];
      if (!st.profileSet) gateReasons.push('Your mandate is not set. Set it once in Profile.');
      highOpen.forEach((f) => gateReasons.push('High finding open: ' + f.title + ' (' + f.impact + ')'));
      if (ceiling < bandLoF) gateReasons.push('Your ceiling ' + money(ceiling) + ' is under the band’s low end ' + money(bandLoF));
      if (qualifying.length < sources) gateReasons.push('Only ' + qualifying.length + ' shop' + (qualifying.length === 1 ? '' : 's') + ' qualify; your profile requires ' + sources);
      const checks = [
        { label: 'Mandate set in your profile', ok: st.profileSet, detail: st.profileSet ? 'from profile' : 'not set' },
        { label: 'No High findings open', ok: highOpen.length === 0, detail: highOpen.length ? highOpen.length + ' open' : (openFindings.length ? openFindings.length + ' lower open' : 'all resolved') },
        { label: 'Ceiling covers the price band', ok: ceiling >= bandLoF, detail: money(ceiling) + ' vs ' + money(bandLoF) + ' low' },
        { label: 'Enough qualifying shops', ok: qualifying.length >= sources, detail: qualifying.length + ' qualify, ' + sources + ' required' },
        { label: 'Spec sources agree', ok: true, detail: 'CAD, print, terms sheet' },
      ].map((c) => Object.assign(c, { cls: c.ok ? 'ok' : 'no', mark: c.ok ? '✓' : '✕' }));
      const failing = checks.filter((c) => !c.ok);
      const safe = failing.length === 0;
      const release = () => this.setState({ released: true, screen: 'neg', releaseDialog: false });
      const stageDefs = [['rfq', 'Priced'], ['part', 'Part & DFM'], ['neg', 'Negotiation'], ['offers', 'Offers']];
      const reached = st.awarded ? 4 : st.released ? 3 : 1;
      const stages = stageDefs.map(([k, l], i) => ({
        label: l, go: this.go(k), current: k === sc ? 'step' : 'false',
        mark: i < reached && k !== sc ? '✓' : String(i + 1), markClass: i < reached && k !== sc ? 'done' : '', sep: i < stageDefs.length - 1 ? '›' : ''
      }));

      /* ── Queue ── */
      const rowDefs = [
        { id: 'RFQ-4417', ago: '2 h ago', part: 'Actuator Housing', sub: 'Rev C · 3 setups · ±.0005 bore', qty: st.qty, mat: '6061-T6', base: st.awarded ? 5 : st.released ? 3 : 1, live: true, band: money(bandLoF).replace('.00', '') + ' – ' + money(bandHiF).replace('.00', ''), need: 'Nov 14' },
        { id: 'RFQ-1235', ago: '3 h ago', part: 'Industrial bracket + plate', sub: 'Rev A vs Rev B conflict · Cascade CNC quoting', qty: '10', mat: '6061-T6', base: 3, band: '$448 – $471', need: 'Nov 3' },
        { id: 'RFQ-4402', ago: '1 d ago', part: 'Manifold Block', sub: 'Rev A · cross-drilled · deburr critical', qty: '120', mat: 'Ti-6Al-4V', base: 4, band: '$412 – $487', need: 'Dec 02' },
        { id: 'RFQ-4396', ago: '3 d ago', part: 'Sensor Bracket', sub: 'Rev F · repeat order, 4th release', qty: '1,000', mat: '304 SS', base: 5, band: '$11.40 firm', need: 'Oct 28' },
        { id: 'RFQ-4388', ago: '4 d ago', part: 'Isogrid Panel', sub: 'Rev B · thin wall .090 ribs', qty: '25', mat: '6061-T6', base: 2, band: 'pricing…', need: 'Dec 19' },
        { id: 'RFQ-4371', ago: '9 d ago', part: 'Valve Body', sub: 'Rev B · awarded to Cascade CNC', qty: '500', mat: '17-4 PH', base: 5, band: '$61.80 firm', need: 'Oct 02' },
      ];
      const stageNames = ['Uploaded', 'Priced', 'Matched', 'Negotiating', 'Offers ready', 'Awarded'];
      const rowsAll = rowDefs.map((r, i) => {
        const adv = r.live ? (r.base === 3 && t > 2 ? 4 : r.base) : Math.min(5, r.base + (t > i * 2 ? 1 : 0));
        const needs = adv === 1 || adv === 4;
        return Object.assign({}, r, {
          stage: stageNames[adv], adv, needs, needsVis: needs ? 'visibility:visible' : 'visibility:hidden',
          open: this.go(adv >= 4 ? 'offers' : adv === 3 ? 'neg' : adv <= 1 ? 'rfq' : 'part'),
          stageColor: needs ? WARN : adv >= 4 ? ACC : MUTED,
          pips: [0, 1, 2, 3, 4].map((n) => ({ st: n < adv ? 'background:var(--color-text)' : 'background:color-mix(in srgb,var(--color-text) 14%,transparent)' })),
        });
      });
      const rows = rowsAll.filter((r) => st.filter === 'all' || (st.filter === 'needs' && r.needs) || (st.filter === 'neg' && r.adv === 3) || (st.filter === 'awarded' && r.adv === 5));
      const filters = [['all', 'All'], ['needs', 'Needs you'], ['neg', 'Negotiating'], ['awarded', 'Awarded']].map(([k, l]) => ({
        label: l, go: () => this.setState({ filter: k }), on: st.filter === k ? 'background:var(--color-text);color:var(--color-bg)' : ''
      }));
      const needsCount = rowsAll.filter((r) => r.needs).length;
      const kpis = [
        { l: 'Open requests', v: '13', s: needsCount + ' awaiting your decision' },
        { l: 'In negotiation', v: '5', s: 'agents active now' },
        { l: 'Avg. time to price', v: '84 s', s: 'was 3.4 days' },
        { l: 'Savings YTD', v: '$214k', s: 'vs. 2025 award prices' }
      ];

      /* ── New request ── */
      const featDefs = [
        ['Format', 'STEP AP214'], ['Setups required', '3'], ['Faces / holes', '412 / 34'],
        ['Threaded holes', '12 (¼-20, M6)'], ['Tightest tolerance', '±0.0005 in'],
        ['Material removal', '71% by volume'], ['GD&T frames read', '7'], ['Surface finish', 'Ra 32 / bead blast']
      ];
      const shown = Math.min(featDefs.length, Math.max(0, t - 1));
      const feats = featDefs.map(([l, v], i) => ({ l, v, vis: this.vis(i < shown, 8) }));
      const pct = Math.min(100, t * 9);
      const files = st.userFiles.length
        ? st.userFiles.map((f, i) => ({ ext: f.ext, name: f.name, meta: f.kind + ' · ' + f.size, state: t > 1 + 2 * i ? (f.kind === 'Terms sheet' ? 'Applied' : 'Read') : (i === 0 || t > 2 * i - 1 ? 'Reading…' : 'Queued') }))
        : [
          { ext: 'STP', name: 'HAL-4417_rev_c.stp', meta: 'CAD · 18.2 MB', state: t > 1 ? 'Read' : 'Reading…' },
          { ext: 'PDF', name: 'HAL-4417_RD_bubbled.pdf', meta: 'Drawing · 2.8 MB', state: t > 3 ? 'Read' : 'Queued' },
          { ext: 'XLS', name: 'halcyon_terms_2026.xlsx', meta: 'Terms sheet · 88 KB', state: t > 5 ? 'Applied' : 'Queued' }
        ];
      const cadName = (st.userFiles.find((f) => ['STL', 'STEP', 'IGES', 'SolidWorks', 'Parasolid'].includes(f.kind)) || {}).name || 'HAL-4417_rev_c.stp';
      const stepDefs = [
        [0, 'Reading ' + cadName], [2, '412 faces, 34 holes, 3 setups found'], [4, 'Reading the print: 12 tolerances, 7 GD&T frames, Ra 32'],
        [6, 'Terms applied from your profile: ' + P.terms + ', ' + (P.certsRequired.join(', ') || 'no certs') + ' required'], [8, 'Pricing against 4 comparable parts'],
        [11, 'Priced: $' + likely.toFixed(2) + ' ± $14, 4 to 6 weeks'], [12, 'Release checks: ' + (5 - failing.length) + ' of 5 passing'],
      ];
      const agentSteps = stepDefs.filter(([at]) => t >= at).map(([at, text], i, arr) => {
        const current = i === arr.length - 1 && t < 12;
        return { text, mark: current ? '…' : '✓', st: current ? 'color:var(--color-text)' : MUT_JS };
      });
      const agentElapsed = t >= 12 ? 'done in ' + (t * 0.42).toFixed(0) + ' s' : (t * 0.42).toFixed(0) + ' s';
      const feed = [
        st.awarded ? { when: 'just now', text: 'Awarded RFQ-4417: ' + st.awarded.label } : null,
        st.released ? { when: 'just now', text: 'Released RFQ-4417 to ' + qualifying.length + ' verified shops inside your mandate (ceiling ' + money(ceiling) + ')' } : null,
        st.pickedAt ? { when: 'just now', text: 'Read ' + st.userFiles.length + ' file' + (st.userFiles.length === 1 ? '' : 's') + ' for RFQ-4417 and priced the part at ' + money(likely) } : null,
        { when: '2 min', text: 'Countered Midstate at $455 on RFQ-4417. Net 45 is hard in your mandate.' },
        { when: '14 min', text: 'RFQ-1235: the shop paused under its own floor on your $4,480 final. Waiting on Cascade CNC.' },
        { when: '1 h', text: 'Ranked 4 offers on RFQ-4402 by your weights. Recommending Midstate at $412.' },
        { when: '3 h', text: 'Priced RFQ-4388 Isogrid Panel: $312 to $355, low confidence on the .090 ribs.' },
        { when: '1 d', text: 'RFQ-4396 reorder: matched the same 3 shops as the last three releases.' },
      ].filter(Boolean).slice(0, 6);
      const reqFields = [
        { l: 'Quantity', v: st.qty, tag: 'You', tagStyle: MUTED, editable: true, readonly: false, set: (e) => this.setState({ qty: e.target.value }) },
        { l: 'Material', v: '6061-T6', tag: 'From CAD', tagStyle: INFO, editable: false, readonly: true },
        { l: 'Finish', v: 'Bead blast + clear ano', tag: 'From print', tagStyle: INFO, editable: false, readonly: true },
        { l: 'Tolerance class', v: '±0.005 typ.', tag: 'From print', tagStyle: INFO, editable: false, readonly: true },
        { l: 'Need by', v: st.needBy, tag: 'You', tagStyle: MUTED, editable: true, readonly: false, set: (e) => this.setState({ needBy: e.target.value }) },
        { l: 'Payment terms', v: P.terms + (P.termsHard ? ' · hard' : ''), tag: 'Profile', tagStyle: MUTED, editable: false, readonly: true }
      ];
      const certs = P.certsRequired.map((c) => ({ l: c + ' required', st: 'background:var(--color-accent-200);color:var(--color-accent-800)' }))
        .concat(P.certsPreferred.map((c) => ({ l: c + ' preferred', st: 'background:color-mix(in srgb,var(--color-text) 8%,transparent)' })))
        .concat(P.domestic ? [{ l: 'Domestic only (DFARS)', st: 'background:color-mix(in srgb,var(--color-text) 8%,transparent)' }] : [])
        .concat([{ l: 'FAI on first article', st: 'background:color-mix(in srgb,var(--color-text) 8%,transparent)' }]);

      /* ── Part / DFM ── */
      const bandSteps = [[4, 4, 62, 148, 'low confidence'], [22, 18, 74, 122, 'medium confidence'], [34, 28, 82, 108, 'high confidence'], [38, 32, 88, 104, 'high confidence · 4 comps']];
      const b = bandSteps[Math.min(3, Math.floor(t / 2))];
      const driverDefs = [['Machining time', 62, 59.6], ['Material + scrap', 21, 20.2], ['Setups & fixturing', 11, 10.6], ['Inspection / FAI', 6, 5.8]];
      const drivers = driverDefs.map(([l, w, v], i) => ({ l, v: money(i === 0 ? v - savings : v), w: 'width:' + (t > i ? w : 0) + '%' }));
      const partMeta = [
        { l: 'Material', v: '6061-T6 (AMS-QQ-A-250/11)' }, { l: 'Envelope', v: '8.40 × 4.15 × 2.60 in' },
        { l: 'Quantity', v: st.qty + ' ea' }, { l: 'Cycle est.', v: (46 - Math.round(savings * 0.6)) + ' min' }, { l: 'Ceiling', v: '≤ ' + money(ceiling) + ' / part' }
      ];

      /* ── Negotiation ── */
      const msgDefs = [
        { who: 'Canyon · your agent', ini: 'CY', me: true, t: '09:02', body: 'Released RFQ-4417 to ' + qualifying.length + ' verified shops holding 6061 plate capacity and ' + P.certsRequired.join(', ') + '. Mandate: unit ≤ ' + money(ceiling) + ' at ' + st.qty + ' ea, delivery by Nov 14, ' + P.terms + ', minimum ' + sources + ' qualified source' + (sources > 1 ? 's' : '') + '.' },
        { who: 'Midstate Precision', ini: 'MP', t: '09:19', body: 'Can run it. Price assumes our standard Net 30 and a 5-week slot; Nov 14 is tight against our current queue.', terms: [['Unit', bid(104.2)], ['Lead', '5 wk'], ['Terms', 'Net 30']] },
        { who: 'Canyon · your agent', ini: 'CY', me: true, t: '09:21', body: P.terms + (P.termsHard ? ' is a hard requirement — Halcyon pays on it across all 40 suppliers.' : ' is preferred.') + ' Would a 400-piece ceiling at the same unit price make the terms work? Buyer reorders this part quarterly.' },
        { who: 'Ridgeline Tool Works', ini: 'RT', t: '09:34', body: 'Bidding at ' + st.qty + '. We have a Haas cell open the week of Oct 20 and we already hold the 6061 plate. Price holds 90 days and Net 45 is standard for us.', terms: [['Unit', bid(97.8)], ['Lead', '4 wk'], ['Terms', 'Net 45']] },
        { who: 'Midstate Precision', ini: 'MP', t: '09:41', body: 'Revised. Net 45 accepted against the 400-piece ceiling, and we pulled a half-week out by running the roughing on the older machine.', terms: [['Unit', bid(96.4)], ['Lead', '4.5 wk'], ['Terms', 'Net 45']] },
        { who: 'Ridgeline Tool Works', ini: 'RT', t: '09:52', body: 'Matching to hold position, conditional on release by Oct 10.', terms: [['Unit', bid(94.9)], ['Lead', '4 wk'], ['Terms', 'Net 45']] },
        { who: 'Canyon · your agent', ini: 'CY', me: true, t: '09:58', body: 'Round closed. Surfacing offers ranked on your mandate. I am recommending a 60/40 split to keep two sources qualified for the quarterly reorder.' }
      ];
      const msgShown = Math.min(msgDefs.length, Math.max(1, t));
      const msgs = msgDefs.slice(0, msgShown).map((m) => ({
        who: m.who, ini: m.ini, t: m.t, body: m.body, vis: 'opacity:1;transform:none',
        hasTerms: !!m.terms, terms: (m.terms || []).map(([l, v]) => ({ l, v })),
        avatar: m.me ? 'background:var(--color-accent);color:var(--color-bg)' : 'background:var(--color-text);color:var(--color-bg)',
        rule: m.me ? 'border-color:var(--color-accent)' : 'border-color:color-mix(in srgb,var(--color-text) 22%,transparent)'
      }));
      const nextMsg = msgDefs[msgShown];
      const mandate = [
        { l: 'Unit price ceiling', v: money(ceiling) + ' @ ' + st.qty + (ceilingPct ? ' (' + (ceilingPct > 0 ? '+' : '') + ceilingPct + '% over likely)' : ' (at likely)') },
        { l: 'Delivery', v: 'on or before Nov 14 (' + num(P.bufferDays, 7) + ' day buffer)' },
        { l: 'Payment terms', v: P.terms + (P.termsHard ? ' — hard' : ' — preferred') },
        { l: 'Certifications', v: P.certsRequired.length ? P.certsRequired.join(', ') + ' min.' : 'none required' },
        { l: 'Sources required', v: sources + ' qualified' },
        { l: 'Auto-accept', v: P.autoAccept ? 'on, inside all bounds' : 'off' }
      ];
      const shopPrices = [
        { name: 'Ridgeline Tool Works', at: 3, prices: [bid(97.8), bid(97.8), bid(94.9), bid(94.9)] },
        { name: 'Midstate Precision', at: 1, prices: [bid(104.2), bid(96.4), bid(96.4), bid(96.4)] },
        { name: 'Cascade CNC', at: 4, prices: [bid(99.1)] },
        { name: 'Delta Contract Mfg', at: 99, prices: [] }
      ].filter((s) => qualifying.some((q) => q.name === s.name));
      const shopStates = shopPrices.map((s) => {
        const responded = msgShown > s.at;
        const idx = Math.max(0, Math.min(s.prices.length - 1, msgShown - s.at - 1));
        return {
          name: s.name, price: responded && s.prices.length ? s.prices[idx] : '—', vis: responded ? 'opacity:1' : 'opacity:.3',
          st: s.prices.length === 0 ? 'No bid — queue full' : responded ? (msgShown >= 6 ? 'Final' : 'Countered') : 'Reviewing…',
          stColor: s.prices.length === 0 ? MUTED : responded ? ACC : MUTED
        };
      });
      const matched = qualifying.map((s) => ({ name: s.name, why: s.certs.filter((c) => P.certsRequired.concat(P.certsPreferred).includes(c)).join(', ') + ' · ' + s.lead + ' · ' + s.queue }));

      /* ── Offers ── */
      const phase = Math.min(2, Math.floor(t / 2));
      const offerDefs = [
        { key: 'r', name: 'Ridgeline Tool Works', loc: 'Elkhart, IN', note: '12 prior jobs with Halcyon', certs: ['ISO 9001', 'AS9100D'], prices: [97.8, 94.9, 94.9], leads: ['4 weeks', '4 weeks', '4 weeks'], ranks: [1, 0, 0], bars: [['On-time', 97], ['Quality', 99], ['Response', 92]] },
        { key: 'm', name: 'Midstate Precision', loc: 'Dayton, OH', note: 'Holds 400-pc ceiling at price', certs: ['ISO 9001'], prices: [104.2, 96.4, 96.4], leads: ['5 weeks', '4.5 weeks', '4.5 weeks'], ranks: [2, 1, 1], bars: [['On-time', 94], ['Quality', 96], ['Response', 88]] },
        { key: 'c', name: 'Cascade CNC', loc: 'Bend, OR', note: 'New to your supplier list', certs: ['ISO 9001', 'AS9100D'], prices: [99.1, 99.1, 99.1], leads: ['6 weeks', '6 weeks', '6 weeks'], ranks: [0, 2, 2], bars: [['On-time', 91], ['Quality', 93], ['Response', 97]], profileHref: '/app/shop' },
        { key: 'd', name: 'Delta Contract Mfg', loc: 'Mesa, AZ', note: 'No bid — 5-axis cell booked through Nov', certs: ['AS9100D'], prices: [null, null, null], leads: ['—', '—', '—'], ranks: [3, 3, 3], bars: [['On-time', 89], ['Quality', 95], ['Response', 60]] }
      ].filter((o) => qualifying.some((q) => q.name === o.name));
      const qtyN = Math.max(1, Math.round(num(st.qty, 250)));
      const bids = offerDefs.filter((o) => o.prices[phase] != null);
      const inside = bids.filter((o) => o.prices[phase] * k <= ceiling);
      const noneInside = phase === 2 && bids.length > 0 && inside.length === 0;
      const award = (key, label) => () => this.setState({ awarded: { key, label } });
      const offers = offerDefs.map((o) => {
        const r = o.ranks[phase], p = o.prices[phase] == null ? null : o.prices[phase] * k, best = r === 0 && p != null;
        const over = p != null && p > ceiling;
        return {
          rank: p == null ? '—' : String(r + 1), name: o.name, loc: o.loc, note: o.note, certs: o.certs,
          price: p == null ? '—' : money(p), lead: o.leads[phase], total: p == null ? '—' : '$' + Math.round(p * qtyN).toLocaleString('en-US') + ' total',
          ceilingNote: over ? 'over your ' + money(ceiling) + ' ceiling' : p == null ? '' : 'inside mandate',
          ceilingStyle: over ? BAD : ACC,
          y: 'transform:translateY(' + (r * 138) + 'px)',
          edge: best ? 'border-color:var(--color-accent)' : 'border-color:var(--color-divider)',
          rankColor: best ? 'color:var(--color-accent)' : MUTED,
          cta: p == null ? 'Ask again' : best ? 'Award ' + Math.round(qtyN * 0.6) + ' ea' : 'Award all ' + qtyN,
          ctaStyle: best ? 'background:var(--color-accent);color:var(--color-bg)' : 'border:1px solid var(--color-divider)',
          award: p == null ? () => {} : award(o.key, o.name + ' · ' + money(p) + ' · ' + o.leads[phase]),
          hasProfile: !!o.profileHref, profileHref: o.profileHref || '#',
          bars: o.bars.map(([l, v]) => ({ l, v: v + '%', w: 'width:' + v + '%' }))
        };
      });
      const splitA = Math.round(qtyN * 0.6), splitB = qtyN - splitA;

      return {
        tabs, isHome: sc === 'home', isDash: sc === 'dash', isRfq: sc === 'rfq', isPart: sc === 'part', isNeg: sc === 'neg', isOffers: sc === 'offers', isProfile: sc === 'profile',
        goRfq: this.go('rfq'), goPart: this.go('part'), goNeg: this.go('neg'), goOffers: this.go('offers'), goProfile: this.go('profile'), goDash: this.go('dash'),
        shopLink: '/app/shop',
        // queue
        rows, kpis, filters, profileSet: st.profileSet, profileMissing: !st.profileSet,
        // new request
        files, feats, reqFields, certs, extractPct: String(pct), extractW: 'width:' + pct + '%',
        pickFiles: (e) => this.takeFiles(e.target.files),
        dropFiles: (e) => { e.preventDefault(); this.takeFiles(e.dataTransfer && e.dataTransfer.files); },
        dragOver: (e) => { e.preventDefault(); if (!st.dragging) this.setState({ dragging: true }); },
        dragLeave: () => { if (st.dragging) this.setState({ dragging: false }); },
        dropSt: st.dragging ? 'border-color:var(--color-accent);background:var(--color-accent-100)' : '',
        dropNote: st.userFiles.length ? st.userFiles.length + ' file' + (st.userFiles.length === 1 ? '' : 's') + ' from your machine' : 'or drop them here',
        agentSteps, agentElapsed, agentDotSt: t >= 12 ? 'animation:none;background:var(--color-good)' : '',
        // queue
        feed,
        priceVis: pct >= 100 ? 'opacity:1' : 'opacity:.25;pointer-events:none',
        unitPrice: money(likely), bandText: '± $14 · 4–6 weeks' + (savings ? ' · re-priced after ' + Object.keys(st.applied).filter((k) => st.applied[k]).length + ' change' + (savings > 14.9 ? 's' : '') : ''),
        qtyLabel: st.qty + ' ea',
        // nav
        inRfq: ['rfq', 'part', 'neg', 'offers'].includes(sc), stages, goHome: this.go('home'),
        toggleTheme: () => { const next = st.theme === '' ? 'dark' : st.theme === 'dark' ? 'light' : ''; applyTheme(next); this.setState({ theme: next }); },
        themeLabel: st.theme === 'dark' ? 'Dark' : st.theme === 'light' ? 'Light' : 'Auto theme',
        // gate
        safe, flagged: !safe, gateReasons, release, checks, failing,
        passCount: String(checks.length - failing.length), checkCount: String(checks.length), failCount: String(failing.length), failPlural: failing.length === 1 ? '' : 's',
        releaseClass: safe ? 'btn-primary' : 'btn-secondary',
        releaseClick: safe ? release : () => this.setState({ releaseDialog: true }),
        releaseDialog: st.releaseDialog, closeDialog: () => this.setState({ releaseDialog: false }),
        releaseAnyway: release, reviewFirst: () => this.setState({ releaseDialog: false, screen: 'part' }),
        releaseLabel: safe ? 'Release to shops' : 'Release anyway…',
        releaseStyle: safe ? 'background:var(--color-accent);color:var(--color-bg)' : 'background:transparent;color:var(--color-accent);border:2px solid var(--color-accent)',
        releaseNote: safe ? qualifying.length + ' verified shops qualify. Your agent negotiates inside your mandate.' : failing.length + ' check' + (failing.length === 1 ? '' : 's') + ' failing. You can still release; you will be asked to confirm.',
        // part
        findings, drivers, partMeta, openCount: String(openFindings.length),
        bandPos: 'left:' + b[0] + '%;right:' + b[1] + '%', bandLo: money(b[2] - savings).replace('.00', ''), bandMid: money(likely).replace('.20', ''), bandHi: money(b[3] - savings).replace('.00', ''), bandConf: b[4],
        // negotiation
        msgs, mandate, shopStates, matched, excluded, matchedCount: String(qualifying.length), excludedCount: String(excluded.length),
        roundNo: String(Math.min(3, Math.ceil(msgShown / 3))),
        typingVis: nextMsg ? 'opacity:1' : 'opacity:0',
        typingWho: nextMsg ? nextMsg.who + ' is responding…' : 'Round closed',
        bestPrice: msgShown >= 6 ? bid(94.9) : msgShown >= 5 ? bid(96.4) : msgShown >= 4 ? bid(97.8) : '—',
        bestWho: msgShown >= 6 ? 'Ridgeline Tool Works · 4 wk · Net 45' : msgShown >= 5 ? 'Midstate Precision · 4.5 wk' : msgShown >= 4 ? 'Ridgeline Tool Works · 4 wk' : 'awaiting first bid',
        // offers
        offers, stackH: 'height:' + (offerDefs.length * 138 + 16) + 'px', respondedCount: String(bids.length),
        weightsLine: 'unit price ' + P.wPrice + '% · on-time record ' + P.wOntime + '% · lead time ' + P.wLead + '% · terms ' + P.wTerms + '%',
        noneInside, ceilingText: money(ceiling),
        awarded: !!st.awarded, awardedText: st.awarded ? st.awarded.label : '', notAwarded: !st.awarded,
        splitText: splitA + ' ea to Ridgeline at ' + bid(94.9) + ' and ' + splitB + ' ea to Midstate at ' + bid(96.4) + '. Both hold Net 45. Dual-sourcing costs $225 total and removes single-shop schedule risk on a part you reorder quarterly.',
        acceptSplit: award('split', '60/40 split · Ridgeline ' + splitA + ' ea at ' + bid(94.9) + ' · Midstate ' + splitB + ' ea at ' + bid(96.4)),
        declineAll: award('declined', 'Declined all offers. The RFQ is back in your queue at Priced.'),
        // profile
        profile: P,
        setCeilingPct: this.setField('ceilingPct'), setBufferDays: this.setField('bufferDays'), setTerms: this.setField('terms'), setSources: this.setField('sources'),
        setWPrice: this.setField('wPrice'), setWOntime: this.setField('wOntime'), setWLead: this.setField('wLead'), setWTerms: this.setField('wTerms'),
        toggleTermsHard: this.toggle('termsHard'), toggleDomestic: this.toggle('domestic'), toggleAutoAccept: this.toggle('autoAccept'),
        termsHardSt: P.termsHard ? 'background:var(--color-text);color:var(--color-bg)' : '', domesticSt: P.domestic ? 'background:var(--color-text);color:var(--color-bg)' : '', autoAcceptSt: P.autoAccept ? 'background:var(--color-text);color:var(--color-bg)' : '',
        certOptions: CERT_OPTIONS.map((c) => ({
          label: c, toggleReq: this.toggleCert('certsRequired', c), togglePref: this.toggleCert('certsPreferred', c),
          reqSt: P.certsRequired.includes(c) ? 'background:var(--color-accent);color:var(--color-bg);border-color:var(--color-accent)' : '',
          prefSt: P.certsPreferred.includes(c) ? 'background:var(--color-text);color:var(--color-bg);border-color:var(--color-text)' : ''
        })),
        weightSum: String(num(P.wPrice, 0) + num(P.wOntime, 0) + num(P.wLead, 0) + num(P.wTerms, 0)),
        weightsOk: num(P.wPrice, 0) + num(P.wOntime, 0) + num(P.wLead, 0) + num(P.wTerms, 0) === 100,
        ceilingPreview: 'On the current part (' + money(likely) + ' likely) your ceiling is ' + money(ceiling) + '. ' + qualifying.length + ' of ' + SHOPS.length + ' verified shops qualify.',
        saveProfile: () => { saveProfile(P, true); this.setState({ profileSet: true, screen: 'dash' }); },
        resetProfile: () => { const profile = Object.assign({}, DEFAULT_PROFILE); saveProfile(profile, st.profileSet); this.setState({ profile }); },
        profileSavedText: st.profileSet ? 'Mandate set. Every request inherits it.' : 'Not set yet. Releases are flagged until you save.',
        // home
        pillars: [
          { n: '01', title: 'CAD-native pricing', body: 'Setups, tolerances, material removal and finish callouts come off the model and the print. No estimator, no queue, no two-day wait.' },
          { n: '02', title: 'Agent-mediated negotiation', body: 'You set the mandate once — ceiling, date, terms, certifications. Your agent negotiates against shop agents inside those bounds.' },
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

  window.DC.mount(Component, { dash: 9, rfq: 14, part: 8, neg: 9, offers: 4, home: 4, profile: 0 });
})();
