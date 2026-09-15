# Buyer and shop UI: parity analysis

Both apps run on the same runtime, the same stylesheet, and the same viewer, so every win on one side is portable to the other. This compares them area by area as of 2026-09-14 (main plus the open stack #4 to #8), names the better version, and lists the syncs in the order they pay off.

Legend: **B** buyer app at `/app`, **S** shop app at `/app/shop`.

## Scorecard

| Area | Buyer | Shop | Better | Sync |
|---|---|---|---|---|
| Shell and nav | 3 tabs, RFQ stage strip, Profile badge, theme toggle | 8 tabs, stage strip under Parts, Agent button, theme toggle | B for hierarchy, S for reach | Shop nav to 4 tabs plus a stage strip inside the RFQ; keep Agent |
| Home list | Queue: agent band, inline KPIs, filters, rail, agent line per row, needs-you | Inbox: KPI tiles, filters, search, status tags | B | Inbox gets the agent band, the rail, the per-row agent line, and needs-you; Buyer gets the search box |
| Human in the loop | Release gate with checks and confirm dialog; rail stops at Offers ready; award is the buyer's | Escalation banner with Hold, Counter, Accept; rev-conflict hold | Both, differently | Shop gets a send-quote gate (checks plus "Send anyway"); Buyer gets the decision bar pattern on Offers |
| Intake | Drop zone, real file picker, files list, agent narration, STL to viewer | Files table with what was read, requirements with source, rev conflict note | Split | Shop gets the picker and narration; Buyer gets the "what Canyon read" column and the conflict note |
| Part | 3D viewer with painted findings and pins, findings with Apply and Dismiss, cost drivers, price band with confidence | 3D viewer with pins, findings cards, setups list | B | Shop findings get Apply, Dismiss, and the cost-driver bars; Buyer gets the setups list |
| Costing and price | Price band with confidence, drivers, re-price on change | Interactive part drawing linked to cost rows, feature and operation and part granularity, quantity curve, levers | S | Buyer gets the drawing-to-row link in its viewer and the quantity curve; Shop gets confidence on its band |
| Negotiation | Shops considered cards with criteria, bio dropdown, public queue; thread with terms chips; best live offer | Two-column bubbles with offers, mandate rails, escalation | Split | Shop gets the criteria cards for the buyer it is quoting; Buyer thread gets the two-column offer ladder |
| Offers and quote | Ranked cards with score bars, award swoop to Profile with badge, split recommendation, Quote PDF | Quote builder with breaks, totals, Quote PDF | Both | Shop gets the "Won" swoop into My shop with a badge; PDF is already the same document on both sides |
| Profile | Mandate editor, onboarding banner, Awards list | Machines table with booking, quoting rules, verified profile bars | Split | Shop gets the first-run banner and a rules editor; Buyer profile shows the same verified-profile bars for awarded shops |
| Agent | Card that narrates intake; band on queue; feed | Side drawer with chat, suggested questions, and a caveat | S for the drawer, B for presence | Both get one shared drawer, minimizable to a bottom-right bubble, plus the band |
| Motion and state | Pulse dots, badge bump, award swoop, ticks | Ticks, drawing hover highlights | B | Shop gets pulse dots on live items and the swoop |
| Viewer | Same `viewer.html`, demo model | Same `viewer.html`, model over postMessage | Same | Keep one viewer; both sides pass their own model |

## The big wins, one per side

**Buyer lacks the agent drawer.** The shop's side panel is the strongest agent moment in either app: a conversation in the RFQ's context, suggested questions, an honest caveat. The buyer has narration and a feed but nowhere to ask. Make the drawer a shared component. Default state is a bubble in the bottom-right corner with an unread dot; a click expands it to the panel; the header has minimize and close; it remembers its state per screen. Both sides use it with their own canned answers.

**Shop lacks the buyer's decision hierarchy.** The buyer's queue leads with the agent band and one primary button, and its rail stops where the human decides. The shop's inbox still leads with KPI tiles and a status tag. Give the inbox the same band ("2 quotes ready for your send. Negotiating 3, costing 1."), a rail that ends at "Quoted · needs your send", and a send-quote gate with checks: revision conflict open, margin under floor, required cert missing, drawing note unread.

**Shop has the better costing.** The interactive drawing that lights up when you hover a cost row is the clearest explanation of price in either app. The buyer's viewer already paints regions; wire the same hover from the cost-driver bars and, later, from feature rows, so a buyer can see what the money buys.

**Buyer has the better part review.** Apply and Dismiss on findings, re-pricing the part and the bids, and the price band with confidence. The shop reviews the same part and should be able to propose the same changes to the buyer from its side.

## Sync plan, in order

1. **Shared agent drawer, both sides.** Bubble in the bottom-right, expand to panel, minimize, close. Buyer answers: why this ceiling, why these shops, what changed the price. Shop answers: why this op on the DMU, what if the rib is 2.5 mm, draft a reply. One component in `app.css` and the runtime, two answer sets.
2. **Inbox becomes the queue.** Agent band, rail with a human stop, per-row agent line, needs-your-send. Same template shape as the buyer's queue.
3. **Send-quote gate on the shop.** Checks list beside "Send quote", "Send anyway" dialog. Mirrors the release gate.
4. **Pulse dots, swoop, and badge on the shop.** Live negotiation rows pulse; "Won" swoops into My shop; My shop gets a badge.
5. **Intake parity.** Shop Ingest gets the picker, drop zone, and narration. Buyer New request gets the "what Canyon read" column and the revision-conflict hold.
6. **Costing parity.** Buyer viewer highlights regions from the cost drivers. Shop price band gets confidence.
7. **Findings parity.** Shop findings get Apply and Dismiss, proposing the change to the buyer.
8. **Nav parity.** Shop to four tabs plus the stage strip; search box on the buyer queue.

Items 1 to 4 are the visible gap. Items 5 to 8 are polish that makes the two sides feel like one product.

## What stays different on purpose

- The buyer's mandate lives in Profile and never pauses; the shop's rules live in My shop and its agent does pause under the floor. Escalation is a shop-side event by decision.
- The buyer's rail ends at approval; the shop's rail ends at send. Same idea, different verb.
- The buyer sees six shops considered; the shop sees one buyer and the competing quote as a price anchor. Each side sees the market from its chair.
