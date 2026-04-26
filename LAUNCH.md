# Pipeloop Launch Playbook — make money this week

The audit-bait business is **live on https://pipeloop.ai**:
- Homepage = audit form. Visitor types URL → 15 sec scan → audit page.
- `/r/[token]` page renders the audit + the $7,500 / 14-day / refund offer.
- `/api/scan` is the endpoint behind it.

To **earn money** the only thing left is feeding it prospects. Here is the loop.

---

## The loop (one cycle = one batch of cold outreach)

```
prospects.txt  ─►  scripts/audit-outreach.ts  ─►  Resend  ─►  inbox replies  ─►  Sam closes  ─►  invoice
```

Every step is automated except "Sam closes."

---

## Step 1 — Build a prospect list (Sam, 30 min)

Pick **20 outdated e-commerce stores** to start. The audit-bait wedge works hardest on:

- Magento 1.x stores (EOL since 2020 — strongest urgency)
- WooCommerce running anything pre-7.0
- Stores with no HTTPS, no mobile viewport, or no JSON-LD schema

Where to find them:
- BuiltWith Trends → "Magento 1" tech profile (free directory has examples)
- `site:` searches: `inurl:catalog/category "powered by magento"` on Google
- Wappalyzer browser extension while you scroll Trustpilot / Trustspot e-commerce categories
- Your own LinkedIn network (you know retailers personally — those are warmest)
- Forums: `r/magento`, `magento.stackexchange.com` user signatures often reveal store URLs

Save the list to `data/prospects.txt` in this format:

```
# format: <store-url>,<owner-email>[,<owner-name>]
https://magentoshop.example,owner@magentoshop.example,Jane Doe
https://oldwoocommerce.example,info@oldwoocommerce.example
https://prestastore.example,contact@prestastore.example,Carlos Mendes
```

Lines starting with `#` are ignored. Owner email is required (the cold pitch lands in their inbox). Find emails on the store's contact page, or via Hunter.io (`hunter.io/find` — first 25 lookups/month free).

---

## Step 2 — Dry-run the batch (Sam, 5 min)

This scans every URL, generates the personalized audit email, and **prints a preview** of what would be sent. No emails leave your machine.

```bash
cd C:/Users/samba/pipeloop-app
npx tsx scripts/audit-outreach.ts data/prospects.txt
```

Output looks like:

```
mode:     DRY RUN (preview only)
prospects loaded: 20

[1/20] https://magentoshop.example
────────────────────────────────────────────────────────────────────────
to:      owner@magentoshop.example (Jane Doe)
url:     https://magentoshop.example
score:   7/10  band: critical
subject: magentoshop.example is on Magento 1.9 — EOL since 2020

Hi Jane,

Saw your store runs on Magento 1.9. Adobe stopped patching that version in
June 2020, which means PCI-DSS 4.0 makes annual compliance documented and
expensive. Your homepage also has no <meta viewport> tag — phones render
desktop-width.

We do fixed-price replatforms: Magento 1 → modern stack, 14 days, $7,500,
full refund if we miss the date.

If that's interesting, your audit is at https://pipeloop.ai/r/aHR0...

Sam

cta:     https://pipeloop.ai/r/aHR0...
```

Review every preview. Anything that looks wrong (false-positive findings, awkward phrasing, modern site that shouldn't be pitched) — fix the prospect list and re-run.

The CLI **automatically skips** sites it scores as `modern` (score 0–1) — no
fake urgency, no honest-pitch-on-a-fine-site.

---

## Step 3 — Send (Sam, 1 click + 2 min)

When the previews look good:

```bash
npx tsx scripts/audit-outreach.ts data/prospects.txt --send
```

What happens:
- Each email goes through Resend → owner's inbox.
- Reply-To is `sam@pipeloop.ai`. When they reply, it lands in **your** inbox.
- One-click unsubscribe header is included (CAN-SPAM compliant).
- Pacing: 6s between sends (10/min, well under Resend's limit).
- Every attempt logged to `data/outreach.jsonl` — same URL won't be re-pitched within 30 days.

---

## Step 4 — Watch the inbox (Sam)

Replies land at `sam@pipeloop.ai`. Three buckets:

- **"Tell me more"** → reply with a 15-min Cal.com link. On the call, walk them through their audit on `/r/[token]` and confirm the $7,500 / 14-day / refund offer.
- **"Stop"** / **"Unsubscribe"** → mark in the log, never email again.
- **No reply** → the dedupe window blocks re-pitching for 30 days. After that, you can re-run with a different angle.

---

## Step 5 — Close, invoice, deliver

A close looks like: 30-min call → confirm scope (which platform → what target) → invoice $7,500 (Stripe link, 50% upfront / 50% on delivery is industry norm) → kickoff. The 14-day delivery is YOUR commitment — don't pitch what you can't ship.

Day-1 productized version: **Magento 1.x → Shopify migration**. The work is well-trodden:
- Day 1–3: data migration (products, customers, orders) via Cart2Cart or LitExtension
- Day 4–8: theme rebuild (Dawn or a $200 ThemeForest theme)
- Day 9–11: app stack (cart abandonment, reviews, shipping rules)
- Day 12–13: 301 redirects, schema, SEO check
- Day 14: cutover + retainer kickoff

If a sub-contractor handles steps 1–10 at €1,500–€2,500 cost, your margin is 65–80%.

---

## What the CLI does not do (yet)

These are deliberate phase-2 — ship now, build them when there's revenue:

- Find prospects automatically (you bring the list)
- Track opens / clicks (Resend webhooks → Supabase next iteration)
- Detect replies and auto-classify intent (existing `agents/vincent.ts` does this for LinkedIn — port to email next)
- Multi-touch sequence (touch 1 audit email, touch 2 nudge after 4 days)
- Bookings (Cal.com integration — a `mailto:` works for first 5 customers)

---

## Troubleshooting

**"missing-anthropic-api-key" or "RESEND_API_KEY not set"** — the script reads `.env.local`. Confirm both keys exist there. They already do in production; your local copy must too.

**Cron deploys still failing** — Vercel Hobby allows daily crons max. We changed the cron to `0 9 * * 1-5` (9am weekdays). Don't add anything more frequent unless you upgrade to Pro.

**Resend "from" rejected** — you must verify `pipeloop.ai` as a sending domain in Resend (DNS: SPF + DKIM records). Until verified, send from `onboarding@resend.dev` for tests.

**Site blocked / Cloudflare 403** — the scanner gracefully returns `blocked` status. Those prospects get skipped. Email them manually if they're high-value.

---

## Day-1 success metric

Send 20. Watch for **2 replies in the first week** (10% reply rate is the floor for a sharp audit-email). Convert 1 of those into a paid project = first $7,500.

If reply rate is below 5% on the first 20, the audit emails aren't sharp enough. Edit the system prompt in `lib/audit-email.ts` and re-run dry-run on the same list to A/B compare subject lines and bodies.

That's the loop. Ship. Reply. Close. Invoice. Repeat.
