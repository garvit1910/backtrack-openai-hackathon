# Backtalk — submission form (final answers)

## Featured tools (multi-select)
- [x] **Composio** (ship: Slack brief on human approval)
- [x] **Octen** (live market research fan-out — 18 parallel searches, real cited sources)
- [x] **OpenAI** (text-embedding-3-small for clustering + retrieval; gpt-5-mini for labeling & evidence distillation)

## One-line pitch (≤120 words, one sentence)
Backtalk is a closed-loop ad engine that reads your real customer feedback, clusters
it into revenue-weighted pain points with vector embeddings, researches the live
market with Octen, compiles everything into a versioned brand context layer,
generates fully-cited ad variants through that layer, lets agent-run per-segment
Thompson-Sampling bandits discover which message converts for which audience, and
writes those learnings back into the context layer — so the next generation cycle
is provably sharper — before shipping the winning brief to your team through
Composio with one human click.

## What does it do / problem it solves
Companies pay for complaints twice: once to answer them, once to ignore them.
Support tickets are the highest-resolution market research that exists, but they
die in the queue while marketing guesses at the same information — and
voice-of-customer tools stop at dashboards a human still has to act on. Backtalk
closes the loop: it turns feedback into a living context layer, generates ads that
answer complaints verbatim with traceable citations, tests them with per-segment
bandits, and feeds what won back into the layer, so messaging compounds instead of
resetting. The moat is the loop itself: every ticket improves the ads, every ad
changes the tickets.

## Numbers to cite in the demo
- 200 tickets → 7 clusters; top cluster "Shipping delays" = **$65.5k MRR at risk**, trend **+0.74**
- 18 parallel Octen searches → 15–17 evidence cards with real sources (BBB, Trustpilot, TrustRadius)
- Cycle 1 → 2 average CTR: **3.36% → 3.55% (+5.5%)** at equal budget, because cycle 2's
  creatives double down on each segment's learned winning angle
  (starter→value, growth→speed, enterprise→reliability)
- Both cycles replay end-to-end from committed cache in ~36s with zero API keys
