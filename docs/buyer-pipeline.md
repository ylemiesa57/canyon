# Canyon buyer pipeline

Status of every stage, screen, control, and data element on the buyer side as of 2026-09-14. Built from the code in `index.html` (landing), `app/index.html` and `app/buyer.js` (buyer app), and the shop side where the two touch.

Four decisions taken on 2026-09-14 shape the stages below:

1. **Release to shops is always available, and heavily flagged when the part is not safe to release.** The flag is a gate with reasons, not a block.
2. **The mandate is set in the buyer's profile, first thing.** Every request inherits it. It is not a per-request step.
3. **Escalation is a shop-side event.** Shop agents pause and ask their shop. The buyer agent never pauses; a round that ends with nothing inside the mandate is a normal end state shown on Offers.
4. **The New request screen does not ask the buyer to correct Canyon.** Extraction is authoritative and read-only. The buyer enters what only the buyer knows (quantity, need-by) and nothing else.

Status words used below:

- **Wired**: the control does something in the mockup today.
- **Static**: the control renders but has no handler.
- **Data**: exists only as example data in `buyer.js`, no screen or control.
- **Missing**: not present anywhere in the project.

Everything in the buyer app runs on a tick engine with no backend, no persistence, and no auth. Each screen plays a timed sequence when opened (Home 2.0 s per tick, 4 ticks; Queue 1.1 s, 9 ticks and loops; New request 0.42 s, 14 ticks; Part 0.7 s, 8 ticks; Negotiation 1.3 s, 9 ticks; Offers 1.5 s, 4 ticks). Reduced motion jumps every screen to its finished state. All example data is Halcyon Industrial, Grand Rapids, MI, user "DM".

## The pipeline at a glance

| Stage | Where it lives today | Buyer decision | Status |
|---|---|---|---|
| 0. Entry | Landing page, login page | Pick audience, start trial | Wired front end, no backend |
| 1. Intake | New request, left column | None | Static drop zone, timed file list |
| 2. Spec | New request, requirements and extraction | None. Buyer supplies quantity and need-by only | Rendered, read-only by design |
| 3. Price | New request, bottom of right column | Release, plain or flagged | Rendered, unlocks at 100% extraction; gate missing |
| 4. Design for cost | Part and DFM | Change the part or release as-is | Findings rendered, no change action |
| 5. Mandate | Buyer profile (decided); shown read-only inside Negotiation today | Set once in profile | Profile missing; per-request view rendered |
| 6. Match | One sentence in the negotiation thread | None | Missing as a step |
| 7. Negotiate | Negotiation | None. Escalation belongs to shop agents | Thread plays |
| 8. Award | Offers | Award single or split | Cards re-rank, award buttons static |
| 9. After award | Queue row state "Awarded" only | None | Missing |

The queue's stage rail is the canonical state machine: Uploaded, Priced, Matched, Negotiating, Offers ready, Awarded. Six states, three decision points per request (release, plain or flagged; accept a design change; award) plus one decision made once per buyer (the profile mandate).

## Global chrome (every app screen)

- Brand: orange square plus "CANYON". Static.
- Tabs: Home, Queue, New RFQ, Part & DFM, Negotiation, Offers. Wired, each sets the screen and restarts its tick sequence.
- "Shop side" link. Wired, goes to `/app/shop`.
- Account chip: "Halcyon Industrial · Buyer", avatar "DM". Static. No menu, no sign-out.

## Stage 0. Entry (landing page and login)

Landing page, `index.html`, buyer version:

- Audience toggle "I'm buying parts" / "I run a machine shop". Wired. Swaps every audience-tagged element, persists to localStorage and the `?for=` query.
- Nav: How it works, Demo, Pricing (anchor links, wired). "Log in" goes to `login.html`. "Price a part" goes to the trial form.
- Hero: "The CAD file is the quote." with "Price a part" (to trial form) and "Watch the demo" (to demo section). Hint line "Drag to orbit. Click the canyon to send a pulse." The canyon viewport, camera flythrough on scroll, ripples on scroll and click are all wired.
- Trusted by: six shop wordmarks, placeholders.
- How it works, buyer: Upload the file, See the price, Approve the match. Static.
- Demo: 16:9 poster with play button. Wired to load an iframe from `data-src`, which is empty, so it shows a note instead.
- Agent exchange: seven-message loop, buyer labels "Your agent" and "Cascade CNC". Wired, auto-plays in view.
- Pricing, buyer: "Free to price, 5% when a part ships" with "Price a part". Static copy, wired link.
- Trial form: work email (validated with a regex, inline error), role radios "Buying parts" / "A machine shop" (preset by the toggle), submit "Price a part". Wired to a fake confirmation "Check your inbox". No request is sent anywhere.
- Footer: Log in, Book a demo (mailto), GitHub.

Login page, `login.html`: work email, password, "Log in" submit, "Forgot password" link (dead), "Start free trial" link back to the form. Nothing is wired to a backend. Nothing on the landing page links to `/app`.

Missing at this stage: account creation, magic link or password auth, session, redirect into the app, company onboarding (defaults for terms and certs that stage 5 would reuse).

## Stage 1. Intake (New request, left column)

- Drop zone text: "Drop STEP, IGES, SLDPRT, X_T — or a folder" and "Drawings and PDFs are read too: Canyon pulls tolerances, finish callouts and notes off the print." Static, no drop handler.
- "Browse files" button. Static.
- File list, three rows, each with extension badge, name, meta, and a state that changes on ticks:
  - STP `HAL-4417_rev_c.stp`, CAD, 18.2 MB: "Reading…" then "Read" after tick 1.
  - PDF `HAL-4417_RD_bubbled.pdf`, Drawing, 2.8 MB: "Queued" then "Read" after tick 3.
  - XLS `halcyon_terms_2026.xlsx`, Terms sheet, 88 KB: "Queued" then "Applied" after tick 5.

Missing: real upload, folder drop, native-format conversion, email-in (the shop side lists email as a source; the buyer side has no equivalent), file errors, size limits, removing a file, revision handling (the shop side has a Rev A vs Rev B conflict; the buyer side never surfaces one).

## Stage 2. Spec (New request, both columns)

Commercial requirements, six rows, each with a source tag:

| Field | Value | Source tag |
|---|---|---|
| Quantity | 250 ea | You |
| Material | 6061-T6 | From CAD |
| Finish | Bead blast + clear ano | From print |
| Tolerance class | ±0.005 typ. | From print |
| Need by | Nov 14, 2026 | You |
| Payment terms | Net 45 | Default |

Certification chips, five: "ISO 9001 required" (highlighted), "AS9100 preferred", "Domestic only (DFARS)", "FAI on first article", "Material certs to Halcyon QA". Static.

Feature extraction panel: percent counter (9% per tick to 100%), progress bar, and eight rows revealed one per tick from tick 2: Format STEP AP214; Setups required 3; Faces / holes 412 / 34; Threaded holes 12 (¼-20, M6); Tightest tolerance ±0.0005 in; Material removal 71% by volume; GD&T frames read 7; Surface finish Ra 32 / bead blast.

Decision: this screen is read-only. Canyon's extraction is authoritative, and the buyer is not asked to check it. The mockup's subtitle "correct anything Canyon got wrong" has been removed from the app. The buyer's own inputs are quantity and need-by; terms and certs come from the profile (stage 5). Missing: those two inputs as fields, and the provenance model the source tags imply (which file, which note, which face), which matters for trust and for the release gate, not for editing.

## Stage 3. Price (New request, bottom right)

- "Estimated unit price · 250 ea", "$96.20", "± $14 · 4–6 weeks". Sits at 25% opacity until extraction reaches 100%, then unlocks. Values are fixed strings.
- "Release to shops" button. Wired, jumps to Negotiation. This is the moment the pipeline moves from the part engine to the deal engine.

Decision: release is always one click away, and it is heavily flagged when the part is not safe to release. Safe means all of the following hold: no open High-severity finding; band confidence high; no source conflict in the spec (for example a revision mismatch between drawing and email); the profile ceiling at or above the band's low end; at least as many qualifying shops as the profile requires. When any of these fail, the button becomes a flagged action: accent-bordered, listing the failing reasons, labelled "Release anyway", with "Review manufacturability first" as the safe path. Today the button has no gate at all, so releasing a part with an open High finding looks identical to releasing a clean one.
- "Review manufacturability first" button. Wired, goes to Part and DFM.

Missing: the release gate above; quantity breaks (the shop side quotes 1, 5, 10, 25, 50; the buyer side has one quantity); confidence on the band (Part and DFM has it, this screen does not, and the gate needs it here); a lead-time range tied to shop queues; a saved draft. The home page promises "90 sec to a priced band"; this screen takes 14 ticks at 0.42 s, about 6 seconds.

## Stage 4. Design for cost (Part and DFM)

Header: "HAL-4417", "3 findings", "Actuator Housing · Rev C". Button "Release to shops as-is", wired to Negotiation.

Part meta, five rows, static: Material 6061-T6 (AMS-QQ-A-250/11); Envelope 8.40 × 4.15 × 2.60 in; Quantity 250 ea; Cycle est. 46 min; Target ≤ $95.00 / part. Note that the target here ($95) is the mandate ceiling, set nowhere on this screen.

Viewport: "CAD" and "Drawing" toggle buttons, both static. Placeholder grid reading "CAD viewport — drop STEP render here", corner label "ISO". No model is loaded anywhere in the project.

Cost drivers, four bars that fill one per tick: Machining time 62%, $59.60; Material + scrap 21%, $20.20; Setups & fixturing 11%, $10.60; Inspection / FAI 6%, $5.80.

Price band, "Price band converging · 250 ea", steps every two ticks through four states: $62 to $148 low confidence; $74 to $122 medium; $82 to $108 high; $88 to $104 high confidence with 4 comparables. Midpoint is always "$96 likely".

Findings, three cards revealed from tick 2, each with number, severity, two tags, title, body, cost impact, saving if changed, and the fix:

1. High, Thin wall and Deep pocket. "Wall thickness vs. pocket depth." +$18.40 / part, −$14.90 if changed. Fix: wall to 0.090 in, $3,725 saved at 250 ea.
2. Medium, Tolerance and Bore. "Ø0.3750 +.0005/-.0000 on two bores." +$6.10, −$5.20. Fix: ±.001 bilateral opens the part from 4 shops to 9.
3. Low, Feature and Tooling. "Internal corners at R0.031." +$2.30, −$2.30. Fix: R0.125 corners.

Missing: any way to act on a finding. No "apply this change" that updates the spec and re-prices, no "ask my engineer", no upload of a revised model, no dismiss. Finding 2 is the pipeline's clearest argument for matching after DFM, and the screen cannot express the choice. The "Release to shops as-is" button here needs the same gate as stage 3; on this example part it would be flagged, because finding 1 is High.

## Stage 5. Mandate (Negotiation, left panel)

"Your mandate", six rows, static: Unit price ceiling $95.00 @ 250; Delivery on or before Nov 14; Payment terms Net 45 — hard; Certifications ISO 9001 min.; Sources required 2 qualified; Auto-accept on, inside all bounds. Button "Edit mandate", static. Note: "Canyon will not accept outside these bounds. It will pause and ask you if a shop is close but outside."

Decision: the mandate lives in the buyer's profile and is the first thing a new buyer sets up. Every request inherits it; the Negotiation panel shows the inherited values read-only, which is what it does today. The app's old note ("It will pause and ask you if a shop is close but outside") has been replaced, since the buyer agent does not pause.

Profile fields the mandate needs, none of which exist yet: ceiling rule (a percentage over Canyon's likely price rather than a fixed dollar figure, since it must work for any part); delivery buffer against need-by; payment terms and whether they are hard; certifications required and preferred; domestic only; sources required; auto-accept; ranking weights (which appear on Offers as 50 / 25 / 15 / 10 but are set nowhere). Assumption to confirm: a per-request override at release is allowed but optional.

## Stage 6. Match

There is no match step. The only evidence is one line in the negotiation thread: "Released RFQ-4417 to 4 verified shops holding 6061 plate capacity and ISO 9001." and the home page's "4 shops bidding." The shop side carries the other half of this: Cascade CNC's verified profile (machines, envelopes, rates, ISO 9001, AS9100D, on-time 91%, quality 93%, response 97%).

Missing: the shortlist itself (who qualified, who was excluded and why), a count at release time, exclusions the buyer can set, and the capability filter. A requirement-chips-to-shortlist demo existed on an earlier landing page and was removed, so the interaction pattern is known.

## Stage 7. Negotiate (Negotiation)

Header "RFQ-4417 · negotiation", "Round n of 3 · live" where n is the message count divided by three. Button "Go to offers", wired.

Thread, seven messages revealed one per tick, three from "Canyon · your agent" (accent avatar CY) and four from shops (avatars MP, RT), each with a time and, on shop messages, three terms chips (Unit, Lead, Terms):

1. 09:02 Your agent: released to 4 shops, states the mandate.
2. 09:19 Midstate Precision: $104.20, 5 wk, Net 30.
3. 09:21 Your agent: Net 45 is hard, offers a 400-piece ceiling.
4. 09:34 Ridgeline Tool Works: $97.80, 4 wk, Net 45.
5. 09:41 Midstate Precision: $96.40, 4.5 wk, Net 45.
6. 09:52 Ridgeline Tool Works: $94.90, 4 wk, Net 45, conditional on release by Oct 10.
7. 09:58 Your agent: two sources inside mandate, closing the round, recommends a 60/40 split.

Typing indicator below the thread: "<next shop> is responding…" until the last message, then "Round closed".

Position panel: "Best live offer" moves through "—", $97.80 Ridgeline 4 wk, $96.40 Midstate 4.5 wk, $94.90 Ridgeline 4 wk Net 45. Shop states, four rows: Ridgeline and Midstate go Reviewing → Countered → Final with their current price; Cascade CNC responds at message 4 with $99.10; Delta Contract Mfg stays at 30% opacity, "No bid — queue full".

Decision: escalation is handled by shop agents. The shop side already has it (Cascade's agent pauses under its 15% floor and asks the shop). The buyer agent runs the three rounds without pausing. If the rounds end with no shop inside the mandate, that is a normal end state: the queue row goes to Offers ready, and Offers shows the best offers with a clear "none inside your mandate" notice for the buyer to award anyway or decline. Missing: that end state, buyer intervention mid-round (accept now, add a concession, drop a shop), and round history.

## Stage 8. Award (Offers)

Header "4 shops responded", ranking sentence "unit price 50% · on-time record 25% · lead time 15% · terms 10%", delta "−11.4% vs. your last award".

Four offer cards in a fixed-height stack, animated by translateY through three phases (ticks 0-1, 2-3, 4), so cards visibly re-rank:

| Shop | Location, note | Certs | Price by phase | Lead | Rank by phase | On-time / Quality / Response |
|---|---|---|---|---|---|---|
| Ridgeline Tool Works | Elkhart, IN, 12 prior jobs with Halcyon | ISO 9001, AS9100D | $97.80, $94.90, $94.90 | 4 weeks | 2, 1, 1 | 97 / 99 / 92 |
| Midstate Precision | Dayton, OH, holds 400-pc ceiling at price | ISO 9001 | $104.20, $96.40, $96.40 | 5, 4.5, 4.5 weeks | 3, 2, 2 | 94 / 96 / 88 |
| Cascade CNC | Bend, OR, new to your supplier list | ISO 9001 | $99.10 | 6 weeks | 1, 3, 3 | 91 / 93 / 97 |
| Delta Contract Mfg | Mesa, AZ, no bid, 5-axis cell booked through Nov | AS9100D | none | none | 4 | 89 / 95 / 60 |

Each card: rank number (accent when best), name, cert chips, location and note, unit price, "<total> total · <lead>" where total is price × 250, three bars, a primary CTA that reads "Award 150 ea" on the best card, "Award" on others, "Ask again" on a no-bid, and a "Shop profile" button. All CTAs static.

Recommendation card, revealed at tick 3: "Canyon recommends a 60/40 split award", 150 ea to Ridgeline at $94.90 and 100 ea to Midstate at $96.40, dual-sourcing costs $225. "Accept recommendation" button, static.

Missing: the award itself (single, split with an editable ratio, decline all), the "none inside your mandate" end state from stage 7, PO generation, notifying the shops, and the shop profile view (the shop side's My shop tab is the natural target).

## Stage 9. After award

Nothing exists beyond the queue row state "Awarded" (RFQ-4371 Valve Body, awarded to Cascade CNC, $61.80 firm). Missing: PO and terms acknowledgment, schedule and first-article tracking, delivery, quality events, reorder from a past award, and the feedback that turns awarded prices into the price function the pitch depends on.

## The queue (Request queue)

The queue is the pipeline's control surface.

- Header "Halcyon Industrial · Grand Rapids, MI", "Request queue", button "New RFQ" wired to New request.
- KPIs, static: Open requests 13 (4 awaiting your decision); In negotiation 5 (agents active now); Avg. time to price 84 s (was 3.4 days); Savings YTD $214k (vs. 2025 award prices).
- Table columns: RFQ, Part, Qty, Material, Stage, Unit band, Need by. Six rows; every row is clickable and opens Part, Negotiation, or Offers depending on its stage.

| RFQ | Part | Qty, material | Starting stage | Advances to | Band | Need by |
|---|---|---|---|---|---|---|
| RFQ-4417, 2 h ago | Actuator Housing, Rev C, 3 setups, ±.0005 bore | 250, 6061-T6 | Negotiating | Offers ready | $88 – $104 | Nov 14 |
| RFQ-1235, 3 h ago | Industrial bracket + plate, Rev A vs Rev B conflict, Cascade CNC quoting | 10, 6061-T6 | Negotiating | Offers ready | $448 – $471 | Nov 3 |
| RFQ-4402, 1 d ago | Manifold Block, Rev A, cross-drilled | 120, Ti-6Al-4V | Offers ready | Awarded | $412 – $487 | Dec 02 |
| RFQ-4396, 3 d ago | Sensor Bracket, Rev F, repeat order | 1,000, 304 SS | Awarded | Awarded | $11.40 firm | Oct 28 |
| RFQ-4388, 4 d ago | Isogrid Panel, Rev B, thin wall | 25, 6061-T6 | Matched | Negotiating | pricing… | Dec 19 |
| RFQ-4371, 9 d ago | Valve Body, Rev B, awarded to Cascade CNC | 500, 17-4 PH | Awarded | Awarded | $61.80 firm | Oct 02 |

Each row shows five stage pips that fill as the row advances (row i advances at tick 2i), and the stage label turns accent at "Offers ready" and later. Footer note: "Stages advance automatically — Canyon only interrupts you when a decision is required."

Missing: filters (the shop inbox has All / Needs you / Agent negotiating / Quoted; the buyer queue has none), search, sorting, a "needs you" indicator on rows that are waiting on a decision, and the two states the rail does not have, Draft and Declined.

## Home (in-app marketing screen)

Kept from the mockup, reachable from the first tab. "Sourcing agent for machined parts", "Quote it like the shop would.", lead paragraph, "Upload a part" (wired to New request), "See a live quote" (wired to Offers), three stats (90 sec, 1,240 verified shops, ±6% band vs. awarded), a live RFQ-4417 card whose price steps $99.10 → $94.90 with the ticks, three pillars, four timed steps (0:00 Drop the CAD, 1:30 Get a band, Same day Agents negotiate, Day 1 Award), four market stats, closing "Stop emailing PDFs to eight shops." with "Upload your first part" (wired), footer "ITAR-registered · SOC 2 Type II in progress". The 1,240 and ITAR claims are unverified placeholders.

## Where the buyer side touches the shop side

- RFQ-1235 (Industrial bracket + plate) is in the buyer queue and is the shop side's escalated RFQ: the shop agent paused at the buyer's $4,480 final because it is under Cascade's 15% floor. The buyer side has no view of that escalation.
- RFQ-4417 (Actuator Housing) is the buyer's live negotiation and appears in the shop inbox as a marketplace RFQ Cascade is bidding on at $99.10, which is the price the buyer's Offers screen shows for Cascade.
- Cascade CNC's on-time, quality, and response numbers on the buyer's Offers card are the same numbers the shop's My shop tab shows as its verified profile.
- Both sides use the same stage vocabulary for the shop's inbox and the buyer's queue, but the shop's statuses (Escalated to you, Rev conflict, Agent negotiating, Quoted, Won) are a different set from the buyer's rail. They should map onto each other.

## Recommended build order

1. Stage 2 and 3 for real: intake, read-only spec with provenance, price with confidence. This is also the shop-side estimator, so it is the first product either way.
2. The release gate on both release buttons, with the five safety checks and the flagged "Release anyway" state.
3. The buyer profile with the mandate, set up first thing, inherited by every request.
4. The queue as a real state machine with the six rail states plus Draft and Declined, and a "needs you" flag.
5. Stage 4 actions: apply a finding and re-price, which also clears the gate.
6. Stage 6 as a visible shortlist at release, since the gate's "enough qualifying shops" check depends on it.
7. Stage 8 award actions, the "none inside your mandate" end state, and the shop profile view.
8. Stage 9, starting with PO and reorder, because it feeds the price function.
