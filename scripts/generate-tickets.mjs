// Deterministic ticket fixture generator for Crewkit (B2B team-merch platform).
// Run: node scripts/generate-tickets.mjs
// Writes fixtures/tickets.json (frozen Ticket schema) and
// fixtures/tickets.groundtruth.json (id → planted theme, for validating clustering).
import { writeFileSync, mkdirSync } from "node:fs";

/* ---------------------------- seeded RNG ---------------------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(1337);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

/* ---------------------------- accounts ---------------------------- */
const COMPANY_A = ["Bright", "North", "Cedar", "Atlas", "Pioneer", "Summit", "Harbor", "Golden", "Iron", "Blue", "Silver", "Copper", "Ridge", "Vertex", "Nova", "Lumen", "Delta", "Orchard", "Beacon", "Granite"];
const COMPANY_B = ["Analytics", "Labs", "Logistics", "Health", "Robotics", "Software", "Financial", "Media", "Studios", "Systems", "Consulting", "Security", "Foods", "Legal", "Ventures", "Dynamics", "Networks", "Partners", "Works", "Collective"];

const SEGMENT_MRR = {
  starter: () => int(49, 99),
  growth: () => int(299, 899),
  enterprise: () => int(1500, 6000),
};

function makeAccounts() {
  const accounts = [];
  const used = new Set();
  const specs = [
    ["starter", 34],
    ["growth", 28],
    ["enterprise", 18],
  ];
  for (const [segment, n] of specs) {
    for (let i = 0; i < n; i++) {
      let name;
      do {
        name = `${pick(COMPANY_A)} ${pick(COMPANY_B)}`;
      } while (used.has(name));
      used.add(name);
      accounts.push({ name, segment, mrr: SEGMENT_MRR[segment]() });
    }
  }
  return accounts;
}

/* ---------------------------- prose pools ---------------------------- */
const PRODUCTS = ["hoodies", "quarter-zips", "tees", "beanies", "tote bags", "water bottles", "onboarding kits", "holiday gift boxes", "crewnecks", "caps"];
const EVENTS = ["our company offsite", "the new-hire onboarding class", "our conference booth at SaaStr", "our Q3 all-hands", "our customer summit", "the sales kickoff", "our 10-year anniversary party"];
const NAMES = ["Maya", "Jordan", "Priya", "Sam", "Alex", "Dana", "Chris", "Taylor", "Morgan", "Ravi", "Elena", "Marcus"];

const THEMES = {
  shipping_delay: {
    subjects: [
      (s) => `Order #${s.order} still not delivered — ${s.days} days late`,
      (s) => `Where is our ${s.product} order?`,
      (s) => `Shipment delayed again, need ETA before ${s.event}`,
      (s) => `URGENT: ${s.product} for ${s.event} not arrived`,
      (s) => `Tracking hasn't updated in ${s.days} days`,
      (s) => `Delivery window missed for order #${s.order}`,
      (s) => `Third delay notice on the same order`,
      (s) => `Kit arrival date slipped again`,
    ],
    bodies: [
      (s) => `Hi team, order #${s.order} (${s.product} for ${s.event}) was promised on the ${s.dom}th and it's now ${s.days} days past that. The tracking page still says "label created". We planned distribution around your original date — this is really hurting us. Can someone tell me where the shipment actually is?`,
      (s) => `We ordered ${s.product} with 3 weeks of buffer and they STILL didn't make it in time for ${s.event}. ${s.count} people showed up and we had nothing to hand out. I need to understand what happened and whether expedited shipping is ever actually expedited.`,
      (s) => `This is the third email about order #${s.order}. Every reply says "it will ship this week" and then nothing moves. It's been ${s.days} days. If the delay is at the printer just say so — I can plan around honest dates, I can't plan around silence.`,
      (s) => `Your dashboard says delivered, our office says otherwise. Nothing arrived at the dock and the carrier says they never received the package from you. ${s.count} new hires start Monday and their welcome kits are somewhere in limbo. Please escalate.`,
      (s) => `Honestly at this point I just need a real ETA. The order for ${s.event} has been "in production" for ${s.days} days. Our old vendor was slower on quotes but at least the boxes showed up when promised.`,
      (s) => `Hey — not angry, just planning. Order #${s.order} shows a revised delivery of the ${s.dom}th, which is after ${s.event}. Can we split the order and rush whatever's ready? Happy to pay the difference, we just can't be empty-handed.`,
      (s) => `The ${s.product} arrived two weeks late and half our remote folks' addresses now show "return to sender" because they'd already moved apartments. Late delivery isn't just late for us, it cascades. We need reliable dates more than we need discounts.`,
      (s) => `We keep getting delay notifications with no reason attached. ${s.days} days behind now. Is this a warehouse issue or a printing backlog? Give me something I can tell my exec team.`,
    ],
  },
  sizing_confusion: {
    subjects: [
      (s) => `Sizing on the ${s.product} runs way small`,
      (s) => `Confused by your size chart`,
      (s) => `Half the team's ${s.product} don't fit`,
      (s) => `Which size chart applies to order #${s.order}?`,
      (s) => `Fit question before we reorder`,
      (s) => `Size guide doesn't match what arrived`,
      (s) => `Need help picking sizes for mixed team`,
    ],
    bodies: [
      (s) => `We collected sizes from ${s.count} employees using the chart on your product page, and roughly a third of the ${s.product} came in tight. Comparing the chart to a tape measure, the chest measurements seem to describe the garment laid flat, not the body. Which is it? We want to reorder but not repeat this.`,
      (s) => `${pick(NAMES)} here from the people team. Your unisex sizing is baffling — the medium fits like a small and the size chart doesn't say whether it's US or EU sizing. Ordering for a mixed team of ${s.count}, we really need a straightforward fit guide.`,
      (s) => `The ${s.product} we received don't match the measurements published on the site. We measured three mediums and got three different chest widths. Is there garment variance between print batches? What sizes should we actually order next time?`,
      (s) => `Before we place the ${s.event} order: do the ${s.product} run true to size? Last order everyone sized up on advice from your chat widget and then everything was enormous. A simple "runs small / true / runs large" flag per product would save us so much churn.`,
      (s) => `We have ${s.count} people between XS and 4XL and your size chart stops at 2XL for half the catalog. What are the actual options for extended sizes? People notice when the merch doesn't come in their size — it's the opposite of inclusive.`,
      (s) => `Support told us the ${s.product} run large, the website says true to size, and the box that arrived says otherwise. Whom do we believe? Genuinely asking for guidance, we like the quality but sizing is a coin flip.`,
    ],
  },
  competitor_cheaper: {
    subjects: [
      (s) => `Quote comparison — your pricing vs ${s.competitor}`,
      (s) => `Why are we paying more than ${s.competitor} would charge?`,
      (s) => `Renewal question: pricing feels high`,
      (s) => `Got a cheaper quote elsewhere`,
      (s) => `Budget review — need pricing justification`,
      (s) => `Considering switching providers`,
    ],
    bodies: [
      (s) => `Our procurement ran a comparison and ${s.competitor} quoted the same ${s.count} ${s.product} at about ${s.pct}% less, shipping included. I like your platform, but I need something to defend this line item in the budget review. Is there flexibility on per-unit pricing at our volume?`,
      (s) => `Renewal is next month and finance flagged that our per-kit cost went up while ${s.competitor} is running promos. What exactly are we getting for the premium? If it's quality and reliability, show me numbers I can forward.`,
      (s) => `Being transparent: we have a signed quote from ${s.competitor} for the ${s.event} order at ${s.pct}% below yours. I'd rather not migrate the whole team store, but the delta is hard to ignore. Can you match or get close?`,
      (s) => `The platform fee plus per-item pricing is adding up. ${s.competitor} bundles storage and kitting for free. Am I misreading your pricing page, or are we genuinely paying more for the same thing?`,
      (s) => `Every quarter this gets harder to justify. Your ${s.product} are nicer, sure, but at ${s.pct}% over ${s.competitor} "nicer" needs to come with something concrete — faster turnaround, better guarantees, anything. What can you offer before I take this to leadership?`,
    ],
  },
  returns_friction: {
    subjects: [
      (s) => `Return label link is broken`,
      (s) => `Exchange process is way too complicated`,
      (s) => `Refund for order #${s.order} still pending`,
      (s) => `How do I return items from a bulk order?`,
      (s) => `Return window question`,
      (s) => `Stuck in the exchange flow`,
    ],
    bodies: [
      (s) => `Trying to exchange ${s.count} ${s.product} from order #${s.order} and the portal makes me create a separate return for every single item. There's no bulk exchange? That's an hour of clicking for something that should be one form.`,
      (s) => `The return label email never arrived (checked spam), and the "resend label" button 404s. Meanwhile the return window is counting down. Can someone generate labels manually and pause the clock on order #${s.order}?`,
      (s) => `It's been ${s.days} days since UPS shows your warehouse received our return and the refund still says processing. Finance closes the books Friday. What's the actual refund SLA?`,
      (s) => `Your policy says returns accepted on unworn items, but the portal rejected our request because the order contains printed merch. Nobody said customized items were final sale at checkout. That needs to be much clearer before payment, not after.`,
      (s) => `We were charged a restocking fee on an exchange that was your fulfillment error — wrong sizes shipped against a correct order sheet. I have the CSV we submitted. Please reverse the fee and fix whatever mapped those sizes.`,
    ],
  },
  damaged_packaging: {
    subjects: [
      (s) => `Order #${s.order} arrived damaged`,
      (s) => `Boxes crushed, items scuffed`,
      (s) => `Water-damaged shipment`,
      (s) => `Gift boxes arrived in bad shape`,
      (s) => `Damaged items in bulk order`,
    ],
    bodies: [
      (s) => `The pallet for order #${s.order} arrived with the top layer of boxes crushed. About ${s.count} ${s.product} have visible scuffs and bent packaging. These were supposed to be client gifts — presentation matters. Photos attached; we need replacements before ${s.event}.`,
      (s) => `Shipment arrived soaked on one side — looks like it sat in rain somewhere in transit. The ${s.product} inside mostly survived but all the branded gift boxes are warped. The unboxing IS the product for our use case. How do we claim this?`,
      (s) => `Every box in this order was packed with zero padding — ${s.product} just loose inside oversized cartons. Predictably, a bunch arrived dinged. This is the second order with flimsy packaging. Can you flag our account for reinforced packing?`,
      (s) => `Received order #${s.order} today: outer cartons torn, two boxes open, contents dusty. Carrier says file with the shipper. Your form says contact the carrier. Somebody please own this — we just want ${s.count} replacement units.`,
    ],
  },
  support_waits: {
    subjects: [
      (s) => `No reply on ticket for ${s.days} days`,
      (s) => `Is anyone reading these?`,
      (s) => `Support response times have gotten rough`,
      (s) => `Still waiting on an answer re: order #${s.order}`,
      (s) => `Escalation path?`,
    ],
    bodies: [
      (s) => `I opened a ticket about order #${s.order} ${s.days} days ago and the only response is the auto-acknowledgement. I get that queues happen, but even a "we're looking into it" from a human would help. What's the current expected first-response time?`,
      (s) => `Chat says "typically replies in a few minutes" and then sits at "waiting for agent" until it times out. Tried three times this week. Email took ${s.days} days last month. For what we pay, is there a priority support tier or a named contact we can use?`,
      (s) => `Following up for the third time. The question is simple — can we change the ship-to address on order #${s.order}? Every day this sits unanswered the change gets harder to make. Please just reply either way.`,
      (s) => `Not trying to pile on, but response times have clearly slipped over the past quarter. It used to be same-day, now it's most of a week. Did something change on your side? It affects whether we can recommend renewal.`,
    ],
  },
  noise: {
    subjects: [
      (s) => `Invoice question for ${s.month}`,
      (s) => `Feature request: Slack notifications for kit shipments`,
      (s) => `The ${s.product} were a huge hit!`,
      (s) => `SSO setup for our team store`,
      (s) => `Can we add a second admin?`,
      (s) => `CSV upload keeps failing`,
      (s) => `Question about eco-friendly options`,
      (s) => `API access for order tracking?`,
    ],
    bodies: [
      (s) => `Quick billing question — the ${s.month} invoice shows two platform-fee line items. Is one a proration from the seat change? Just need clarity for accounting, no urgency.`,
      (s) => `Feature request: a Slack webhook that pings us when a kit ships. We're building spreadsheets by hand to track this today. Happy to beta test anything.`,
      (s) => `No issue here — just wanted to say the ${s.product} for ${s.event} were the best merch we've ever done. The team keeps asking when the next drop is. Kudos to whoever runs your design review.`,
      (s) => `Setting up SSO for the team store: does the SAML integration support Okta groups for role mapping, or is it flat access? Docs mention Okta but not groups. Happy to hop on a call with our IT admin.`,
      (s) => `Trying to add our office manager as a second admin and the invite email never lands. Can you check whether it's being blocked on your end? Domain is our company domain.`,
      (s) => `Uploading the recipient CSV for the ${s.event} order fails at 80% with a generic error. It's ${s.count} rows, well under the stated limit. Template is unmodified from your download. What are the actual validation rules?`,
      (s) => `Exploring more sustainable options for next quarter's kits — do you carry recycled-fabric ${s.product}, and is there carbon-neutral shipping? Our ESG report wants specifics.`,
      (s) => `Do you have a public API for order status? We'd love to pull tracking into our internal dashboard rather than checking the portal. Even a read-only endpoint would do.`,
    ],
  },
};

const COMPETITORS = ["SwagUp", "Printfection", "Custom Ink", "Gemnote", "Sendoso"];
const MONTHS = ["April", "May", "June", "July"];

/* ----------------------- theme plan + time skew ----------------------- */
// counts sum to 200; skew = share of tickets in the most recent 45 of 90 days
const PLAN = [
  ["shipping_delay", 55, 0.68], // rising
  ["sizing_confusion", 35, 0.5],
  ["competitor_cheaper", 28, 0.58], // slightly rising
  ["returns_friction", 24, 0.5],
  ["damaged_packaging", 20, 0.5],
  ["support_waits", 16, 0.32], // falling
  ["noise", 22, 0.5],
];

const ANCHOR = Date.parse("2026-07-23T12:00:00Z");
const DAY = 86_400_000;

function makeCreatedAt(recentShare) {
  const recent = rand() < recentShare;
  const daysAgo = recent ? rand() * 45 : 45 + rand() * 45;
  const jitterMs = rand() * DAY;
  return new Date(ANCHOR - daysAgo * DAY - jitterMs).toISOString();
}

/* ------------------------------ generate ------------------------------ */
const accounts = makeAccounts();
const enterprise = accounts.filter((a) => a.segment === "enterprise");

function pickAccount(theme) {
  // enterprise overweighted in shipping delays so revenueAtRisk pops
  if (theme === "shipping_delay" && rand() < 0.45) return pick(enterprise);
  return pick(accounts);
}

const tickets = [];
const groundtruth = {};
let n = 0;
for (const [theme, count, recentShare] of PLAN) {
  const { subjects, bodies } = THEMES[theme];
  for (let i = 0; i < count; i++) {
    n++;
    const id = `tkt_${String(n).padStart(4, "0")}`;
    const slots = {
      order: int(40100, 49999),
      product: pick(PRODUCTS),
      event: pick(EVENTS),
      days: int(4, 19),
      dom: int(1, 28),
      count: int(12, 240),
      competitor: pick(COMPETITORS),
      pct: int(12, 35),
      month: pick(MONTHS),
    };
    const account = pickAccount(theme);
    tickets.push({
      id,
      subject: pick(subjects)(slots),
      body: pick(bodies)(slots),
      createdAt: makeCreatedAt(recentShare),
      account,
    });
    groundtruth[id] = theme;
  }
}

tickets.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

mkdirSync("fixtures", { recursive: true });
writeFileSync("fixtures/tickets.json", JSON.stringify(tickets, null, 2));
writeFileSync(
  "fixtures/tickets.groundtruth.json",
  JSON.stringify(groundtruth, null, 2)
);

/* ------------------------------- stats -------------------------------- */
const stats = {};
for (const [theme] of PLAN) {
  const ids = Object.entries(groundtruth).filter(([, t]) => t === theme).map(([id]) => id);
  const themed = tickets.filter((t) => ids.includes(t.id));
  const mrr = new Map(themed.map((t) => [t.account.name, t.account.mrr]));
  const recent = themed.filter((t) => Date.parse(t.createdAt) > ANCHOR - 45 * DAY).length;
  stats[theme] = {
    count: themed.length,
    revenueAtRisk: [...mrr.values()].reduce((a, b) => a + b, 0),
    recentShare: +(recent / themed.length).toFixed(2),
  };
}
console.log(`✅ wrote ${tickets.length} tickets`);
console.table(stats);
