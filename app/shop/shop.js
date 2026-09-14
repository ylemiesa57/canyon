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
    { id:'lpi', item:'100% liquid penetrant inspection', detail:'Drawing note 7 · Sable NDT · +2 days lead', type:'Outside', tagClass:'tag-accent-2', cost:18, scrap:0, mode:'Per part', regions:['topFace','backFace'], optional:true }
  ];
  const REGIONS = ['stock','topFace','backFace','profile','pocketsA','pocketsB','ribs','bores','cbores','backPocket','chamfers','datum'];
  // Hovering the drawing itself: region → the row it belongs to.
  const REGION_ROW = { stock:'billet', topFace:'op10-setup', backFace:'op20-setup', profile:'profile', pocketsA:'pocketsA', pocketsB:'pocketsB', ribs:'ribs', bores:'bores', cbores:'cbores', backPocket:'backPocket', chamfers:'chamfers', datum:'cmm-run' };
  const money = (v) => '$' + v.toFixed(2);
class Component extends DCLogic {
  state = { screen: 'inbox', agent: true, filter: 'all', hot: null, pin: null, closed: {}, lpi: false };
  static TABS = [['inbox','Inbox'],['ingest','Ingest'],['part','Part'],['cost','Costing'],['quote','Quote'],['neg','Negotiation'],['shop','My shop'],['pdf','Quote PDF']];
  // The tab lives in the URL hash (/app/shop/#cost) so a screen can be linked to directly.
  constructor() { super(); const h = location.hash.slice(1); if (Component.TABS.some(([k]) => k === h)) this.state.screen = h; }
  componentDidUpdate(p, prev) { if (prev.screen !== this.state.screen) history.replaceState(null, '', '#' + this.state.screen); }
  go(s) { return () => this.setState({ screen: s }); }

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
      const inc = m.optional ? lpi : true;
      const per = m.cost * (1 + m.scrap / 100);
      items[m.id] = { title: m.item, detail: m.detail, meta: m.type + ' · ' + m.mode + (m.scrap ? ' · +' + m.scrap + '% scrap' : '') + (inc ? '' : ' · not in unit cost'), cost: money(per), regions: m.regions };
      return { ...m, inc, costStr: money(m.cost), scrapStr: m.scrap ? m.scrap + ' %' : '—', per: money(per), perPart: inc ? per : 0,
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
    const { screen, agent, filter } = this.state;
    const escalated = this.props.escalated ?? true;
    const tabs = Component.TABS.map(([k,label]) => ({ label, go: this.go(k), color: screen===k ? 'var(--color-accent)' : 'var(--color-neutral-700)', line: screen===k ? 'var(--color-accent)' : 'transparent' }));
    const red='var(--color-accent)', amber='var(--color-accent-2-600)', ink='var(--color-text)';
    const cost = this.costView();
    const mk=(qty,cost,mkp)=>{const p=cost*(1+mkp/100);return{qty,cost:'$'+cost.toFixed(2),mk:mkp+' %',price:'$'+p.toFixed(2),total:'$'+(p*qty).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),margin:(100-100/(1+mkp/100)).toFixed(1)+'%'}};
    const brk=(id,name,mat,rev,costs)=>costs.map(([q,c],i)=>({...mk(q,c,20),label:i===0?id:'',sub:i===0?name+' · '+mat:'',rev:i===0?rev:'',fw:i===0?700:400}));
    const quoteLines=[
      {id:'BRKT-001',name:'Industrial Bracket',material:'Aluminum 6061-T6',lead:'8–10 business days',breaks:brk('BRKT-001','Industrial Bracket','6061-T6','A',[[1,54.32],[5,45.26],[10,43.18],[25,40.79],[50,39.21]])},
      {id:'PLT-002',name:'Mounting Plate',material:'Aluminum 6061-T6 · anodize II',lead:'8–10 business days (incl. outside op)',breaks:brk('PLT-002','Mounting Plate','6061-T6 · anodize II','A',[[1,21.34],[5,18.21],[10,17.39],[25,16.42],[50,15.78]])}
    ];
    const bubble=(side,text,meta,offer)=>({left:side==='L'?text:'',leftMeta:side==='L'?meta:'',leftVis:side==='L'?'visible':'hidden',right:side==='R'?text:'',rightMeta:side==='R'?meta:'',rightVis:side==='R'?'visible':'hidden',offer});
    return {
      tabs, escalated, agentOpen: agent,
      filter, setFilter: (f) => () => this.setState({ filter: f }),
      filters: [['all','All'],['needs','Needs you'],['neg','Agent negotiating'],['quoted','Quoted']].map(([k,l]) => ({ label: l, go: () => this.setState({ filter: k }), on: filter === k ? 'background:var(--color-accent);color:var(--color-bg)' : '' })),
      rfqCount: '8', buyerLink: '/app',
      profile: { name: 'Cascade CNC', loc: 'Bend, OR', certs: ['ISO 9001', 'AS9100D'], onTime: '91%', quality: '93%', response: '97%', wOnTime: 'width:91%', wQuality: 'width:93%', wResponse: 'width:97%' }, toggleAgent: () => this.setState(s=>({agent:!s.agent})),
      goInbox:this.go('inbox'), goIngest:this.go('ingest'), goPart:this.go('part'), goCost:this.go('cost'), goQuote:this.go('quote'), goNeg:this.go('neg'), goPdf:this.go('pdf'),
      isInbox:screen==='inbox', isIngest:screen==='ingest', isPart:screen==='part', isCost:screen==='cost', isQuote:screen==='quote', isNeg:screen==='neg', isShop:screen==='shop', isPdf:screen==='pdf',
      inboxStats:[{k:'Needs you',v:'2',sub:'1 escalation · 1 rev conflict'},{k:'Agent negotiating',v:'4',sub:'$38,975 in play'},{k:'Quoted this week',v:'$38,410',sub:'avg. 4 min to quote'},{k:'Win rate · 30 d',v:'41%',sub:'↑ 6 pts vs. last month'}],
      rfqs:[
        // group: needs | neg | quoted
        {id:'RFQ 1235',name:'Industrial bracket + plate',buyer:'Halcyon Industrial',source:'Email',parts:'2',files:'6',due:'Sep 16',value:'$4,710',status:'Escalated to you',group:'needs',tagClass:'tag-accent',open:this.go('neg')},
        {id:'RFQ 1238',name:'Manifold body, Rev C',buyer:'Sable Aerospace',source:'Marketplace',parts:'1',files:'3',due:'Sep 15',value:'$12,900',status:'Rev conflict',group:'needs',tagClass:'tag-accent',open:this.go('ingest')},
        {id:'RFQ 4417',name:'Actuator Housing, Rev C',buyer:'Halcyon Industrial',source:'Marketplace',parts:'1',files:'2',due:'Nov 14',value:'$24,775',status:'Agent negotiating',group:'neg',tagClass:'tag-neutral',open:this.go('neg')},
        {id:'RFQ 1236',name:'Housing set',buyer:'Meridian Robotics',source:'Upload',parts:'4',files:'9',due:'Sep 18',value:'$6,380',status:'Agent negotiating',group:'neg',tagClass:'tag-neutral',open:this.go('neg')},
        {id:'RFQ 1234',name:'Shaft + collar',buyer:'Northwind Ag Systems',source:'Email',parts:'2',files:'4',due:'Sep 17',value:'$3,110',status:'Agent negotiating',group:'neg',tagClass:'tag-neutral',open:this.go('neg')},
        {id:'RFQ 1231',name:'Sensor mount ×3',buyer:'Redline Motorsport',source:'Marketplace',parts:'3',files:'5',due:'Sep 20',value:'$4,170',status:'Agent negotiating',group:'neg',tagClass:'tag-neutral',open:this.go('neg')},
        {id:'RFQ 1229',name:'Fixture plate',buyer:'Halcyon Industrial',source:'Email',parts:'1',files:'2',due:'Sep 14',value:'$1,240',status:'Quoted',group:'quoted',tagClass:'tag-outline',open:this.go('quote')},
        {id:'RFQ 1227',name:'Gear cover',buyer:'Meridian Robotics',source:'Upload',parts:'1',files:'3',due:'Sep 12',value:'$2,860',status:'Won',group:'quoted',tagClass:'tag-outline',open:this.go('quote')}
      ].filter(r => filter === 'all' || r.group === filter),
      files:[
        {name:'BRKT-001.step',size:'CAD · 16.4 MB',kind:'STEP',extracted:'155×85×42 mm · 14 pockets · 6 bores · min wall 1.8 mm · 0.61 kg',linked:'BRKT-001'},
        {name:'BRKT-001-RevA.pdf',size:'Drawing · 2.8 MB · 3 sheets',kind:'PDF drawing',extracted:'9 notes · 12 tolerances · TP Ø0.1 on bores · LPI 100% · chamfer 0.5',linked:'BRKT-001'},
        {name:'PLT-002.sldprt',size:'CAD · 3.1 MB',kind:'SolidWorks',extracted:'Converted to STEP · 120×80×12 mm · 8 thru holes',linked:'PLT-002'},
        {name:'RE: RFQ 1235 bracket set.eml',size:'Email thread · 4 messages',kind:'Email',extracted:'Qty 10 / 25 / 50 · need by Nov 3 · Net 30 · anodize Type II on plate · "Rev B" mentioned',linked:'Both'},
        {name:'BOM_Q4_halvorsen.xlsx',size:'Spreadsheet · 44 KB',kind:'BOM',extracted:'2 lines matched by part number · 1 unmatched (hardware, ignored)',linked:'Both'},
        {name:'IMG_2291.jpg',size:'Photo · 2.2 MB',kind:'Photo',extracted:'Mating assembly reference — no dimensions. Confirms bracket orientation.',linked:'BRKT-001'},
        {name:'prior-quote-vendor.pdf',size:'Competitor quote · 190 KB',kind:'Existing quote',extracted:'$5,120 all-in at 12 days · used as price anchor in negotiation',linked:'RFQ'}
      ],
      reqs:[
        {k:'Quantities',v:'10 · 25 · 50 breaks',src:'Email',tagClass:'tag-neutral'},{k:'Need by',v:'Nov 3, 2026',src:'Email',tagClass:'tag-neutral'},{k:'Material',v:'6061-T6 per AMS-QQ-A-250/11',src:'Drawing',tagClass:'tag-neutral'},{k:'Finish',v:'Anodize Type II (PLT-002 only)',src:'Email',tagClass:'tag-neutral'},{k:'Inspection',v:'LPI 100%, no indications',src:'Drawing',tagClass:'tag-neutral'},{k:'Revision',v:'A (drawing) vs. B (email)',src:'Conflict',tagClass:'tag-accent'},{k:'Terms',v:'Net 30 · Ex Works',src:'Email',tagClass:'tag-neutral'},{k:'Price anchor',v:'$5,120 · 12 days',src:'Competitor',tagClass:'tag-neutral'}
      ],
      partStats:[{k:'Material',v:'6061-T6 · AMS-QQ-A-250/11'},{k:'Envelope',v:'155 × 85 × 42 mm'},{k:'Setups',v:'2 + saw'},{k:'Cycle est.',v:'0.43 hr / part'},{k:'Unit cost',v:'$54.32 @ 10'}],
      setups:[{op:'Op10',name:'Top · vise',detail:'Rough pockets, profile · 0.18 hr'},{op:'Op20',name:'Back · soft jaws',detail:'Finish ribs, back pocket · 0.14 hr'},{op:'Op30',name:'Bores · 5-axis',detail:'Ream Ø8 H7, c-bores · 0.06 hr'}],
      findings:[
        {n:'1',sev:'High',tags:'Material · Cycle',title:'From solid — 71% of the billet becomes chips',body:'Deep pockets on both faces drive rough time and stock cost together. Consider a near-net extrusion at qty 50+.',k1:'Stock',v1:'165 × 95 × 52 mm',k2:'Cost impact',v2:'$24.70 / part',cost:'$24.70',rule:red,tagClass:'tag-accent'},
        {n:'2',sev:'High',tags:'Distortion · Thin wall',title:'1.8 mm ribs between pocket set A',body:'Chatter-limited finishing. Leave skins thick until Op20 and use climb passes; expect a light re-flatten.',k1:'Min wall',v1:'1.8 mm',k2:'Scrap risk',v2:'4%',cost:'$6.40',rule:red,tagClass:'tag-accent'},
        {n:'3',sev:'Medium',tags:'Tolerance · GD&T',title:'Ø8 H7 bores, true position Ø0.1',body:'Ream in one setup on the DMU to hold position to datum A. CMM program from a similar bracket exists.',k1:'Tol band',v1:'+0.015 / 0',k2:'Op',v2:'Op30 · 5-axis',cost:'$9.20',rule:amber,tagClass:'tag-accent-2'},
        {n:'4',sev:'Medium',tags:'Inspection · Outside op',title:'100% liquid penetrant, no indications',body:'Drawing note 7. Adds a 2-day outside step at Sable NDT; agent has added it to lead time.',k1:'Vendor',v1:'Sable NDT · 2 d',k2:'Cost',v2:'$18 / part',cost:'$18.00',rule:amber,tagClass:'tag-accent-2'}
      ],
      ...cost,
      qtyCurve:[{qty:'1',w:'100%',cost:'$54.32'},{qty:'5',w:'83%',cost:'$45.26'},{qty:'10',w:'79%',cost:'$43.18'},{qty:'25',w:'75%',cost:'$40.79'},{qty:'50',w:'72%',cost:'$39.21'}],
      levers:[{k:'Near-net extrusion at qty 50',v:'−$6.10'},{k:'Relax rib to 2.5 mm (ask buyer)',v:'−$3.20'},{k:'Run Op30 on VF-2SS with boring head',v:'−$0.60, +risk'},{k:'Drop LPI to sample AQL',v:'−$14.40'}],
      quoteTotals:[{k:'Subtotal · cost',v:'$3,925.66',sub:'2 parts, all breaks',bg:'var(--color-bg)',fg:'var(--color-text)'},{k:'Total markup',v:'$785.13',sub:'20% blended',bg:'var(--color-bg)',fg:'var(--color-text)'},{k:'Lead time',v:'8–10 d',sub:'incl. LPI + anodize',bg:'var(--color-bg)',fg:'var(--color-text)'},{k:'Quote total',v:'$4,890.79',sub:'incl. $180 fixture',bg:'var(--color-accent)',fg:'var(--color-bg)'}],
      quoteLines,
      msgs:[
        bubble('L','Target $4,400 all-in for both parts at the qty 10 break, delivered in 8 days.','Buyer agent · 09:02','$4,400'),
        bubble('R','Quoted $4,710 at 8–10 days. $4,620 if the PO lands this week — fixture is already in the schedule.','Your agent · 09:02 · within rules','$4,620'),
        bubble('L','$4,450 and we drop the anodize on PLT-002.','Buyer agent · 09:06','$4,450'),
        bubble('R','Anodize off saves $118 and a day. $4,540, 8 days.','Your agent · 09:06 · within rules','$4,540'),
        bubble('L','$4,480, final. Our prior vendor is at $5,120 but 12 days.','Buyer agent · 09:11','$4,480'),
        bubble('R','Paused. $4,480 is under the 15% floor. Waiting for Cascade.','Your agent · 09:11 · escalated','—')
      ],
      rails:[{k:'Floor margin',v:'15% ($4,500)'},{k:'Auto-accept at or above',v:'$4,600'},{k:'Min lead time',v:'7 days'},{k:'Max concessions',v:'3 rounds'},{k:'Escalate on',v:'scope change · < floor'},{k:'Offer validity',v:'48 h'}],
      machines:[{name:'Haas VF-2SS',type:'3-axis VMC',env:'762 × 406 × 508',rate:'$85',setup:'$85 / hr',w:'62%',booked:'62%'},{name:'DMG Mori DMU 50',type:'5-axis',env:'500 × 450 × 400',rate:'$125',setup:'$110 / hr',w:'44%',booked:'44%'},{name:'Doosan Puma 2100',type:'CNC lathe',env:'Ø350 × 550',rate:'$80',setup:'$85 / hr',w:'71%',booked:'71%'},{name:'Zeiss Contura',type:'CMM',env:'700 × 1000 × 600',rate:'$70',setup:'—',w:'30%',booked:'30%'}],
      rules:[{k:'Default markup',v:'20%'},{k:'Floor margin',v:'15%'},{k:'Rush (< 5 d)',v:'+25%'},{k:'Material buffer',v:'+5% stock'},{k:'Repeat buyer discount',v:'−2% after 3 orders'}],
      chat:[
        {who:'You',time:'09:14',text:'Why is Op30 on the DMU instead of the Haas?',align:'flex-end',bg:'var(--color-surface)',rule:'transparent'},
        {who:'Shop agent',time:'09:14',text:'Two Ø8 H7 bores carry true position Ø0.1 to datum A across faces. Holding that in one setup needs the 5-axis; on the Haas it would take a third setup and a boring head, saving $0.60 but adding position risk.',align:'flex-start',bg:'var(--color-accent-100)',rule:'var(--color-accent)'},
        {who:'You',time:'09:15',text:'What if the buyer accepts 2.5 mm ribs?',align:'flex-end',bg:'var(--color-surface)',rule:'transparent'},
        {who:'Shop agent',time:'09:15',text:'Op20 drops from 0.14 to 0.10 hr and scrap allowance halves: −$3.20 per part, −$32 at qty 10. I can propose it in the negotiation as a trade for their $4,480.',align:'flex-start',bg:'var(--color-accent-100)',rule:'var(--color-accent)'},
        {who:'Shop agent',time:'09:16',text:'Reminder: the Rev A / Rev B conflict is still open with Halcyon. I would not commit a final price until they confirm.',align:'flex-start',bg:'var(--color-accent-100)',rule:'var(--color-accent)'}
      ]
    };
  }
}
  window.DC.mount(Component);
})();
