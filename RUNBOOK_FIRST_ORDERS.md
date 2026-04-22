# ABOL.ai — Runbook: manual fulfilment voor eerste 10 orders

**Doel:** zodra een buyer €425 betaalt via Stripe, deze runbook volgen om binnen 30 min de PDF bij hen te laten landen. Voor Sprint 2 zit alles hiervoor nog niet geautomatiseerd; dat komt wanneer de eerste ~10 orders binnen zijn en volume het rechtvaardigt.

Alles speelt zich af op jouw laptop. Geen Fly.io nodig.

---

## Eenmalige setup (nu, ~5 min)

1. **Stripe notificaties aan.** Dashboard → Developers → Events → Webhook endpoints. Dit heb je al geconfigureerd voor Payment Links (Stripe stuurt automatisch "Je hebt een betaling ontvangen" emails naar `sam.balkenende@hotmail.com` bij elke successful payment — controleer of die in je inbox landen, niet in spam).

2. **Env voor je laptop.** Eenmalig in een `.env.local` in de abol folder (gitignored):

   ```
   SUPABASE_URL=https://cnoudltgcxeyzfelvbuv.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<van Supabase dashboard → Project Settings → API>
   ANTHROPIC_API_KEY=<jouw key, optioneel — zonder deze valt de executive summary terug op rule-based>
   ```

3. **Verifieer dat je lokale pipeline werkt.**

   ```bash
   cd C:/Users/samba/projects/abol
   source .env.local   # of export elk var handmatig
   python generate_report.py --source supabase <een bestaande completed UUID>
   ```

   Output moet zijn: `~43-page PDF, 180-200 KB, in ./reports/abol_report_<short>_<date>.pdf`. Als deze werkt, is je fulfilment pipeline klaar.

---

## Bij elke nieuwe Stripe betaling (~5 min per order)

### Stap 1 — Verifieer betaling in Stripe
- Open Stripe dashboard → Payments
- Zie status **Succeeded** (Niet Pending, niet Failed)
- Noteer de **Client reference ID** — dit is de assessment UUID (36 chars, bv. `20d7c4c6-ca94-4aaf-91ab-ade49312fea9`). Stripe toont deze onder Payment details → Metadata of Session info.
- Noteer de **Customer email** — dat is waar de PDF heen moet

### Stap 2 — Flip `is_paid` in Supabase
Service role bypasses RLS. Vanuit je terminal:

```bash
export SUPABASE_ACCESS_TOKEN="sbp_..."   # al ingesteld van Sprint 1
npx supabase db query --linked \
    "UPDATE abol_assessments
     SET is_paid = true,
         payment_reference = 'stripe_<PAYMENT_INTENT_ID>'
     WHERE id = '<ASSESSMENT_UUID>'"
```

Vervang `<PAYMENT_INTENT_ID>` met de Stripe `pi_...` ID (zichtbaar in Stripe dashboard onder Payment details).

### Stap 3 — Genereer de PDF
```bash
cd C:/Users/samba/projects/abol
source .env.local
python generate_report.py --source supabase <ASSESSMENT_UUID> --output reports/<ASSESSMENT_UUID>.pdf
```

Output: een PDF van ~180 KB, 43 pagina's.

### Stap 4 — Email naar buyer

**Sjabloon:**

```
Onderwerp: Your ABOL.ai benchmark report — <Company Name>

Hi <first name>,

Thanks for your purchase.

Attached is your 43-page benchmark report for assessment <ASSESSMENT_UUID[:8]>.
Score: <X>% (<rating>).

The report contains your dimension breakdown against four public peer benchmarks
(Thales 2026, IBM 2024, ENISA Threat Landscape 2025, Verizon DBIR 2025), your
prioritized top 10 critical gaps with euro exposure, and a three-year investment
roadmap.

A few notes:
- The download link embedded in the PDF expires in 90 days. Save a local copy.
- If you'd like to re-run the scan in 6 or 12 months to track progress, reply to
  this email.
- For the Advisory tier (monthly re-scoring + standing analyst access): €6,845/yr,
  see abol.ai.

Any questions, reply here.

Sam Balkenende
ABOL.ai
```

Attach de PDF. Verstuur vanaf je `info@abol.ai` (of persoonlijke) inbox.

### Stap 5 — Log de order
Quick tekstbestand of spreadsheet om bij te houden:

| Datum | UUID | Sector | Sector / Size | Buyer email | Score | Payment ref | PDF sent |
|---|---|---|---|---|---|---|---|

Helpt straks bij Sprint 4+ (Continuous tier outreach — "je scan van X maand geleden; wil je quarterly re-scoren?").

---

## Bij een Advisory subscription (€6,845/jr)

1. Stripe notificatie komt binnen na succesvolle first payment
2. Email naar de buyer met:
   - Welkom
   - Link om een 60-min intro call in te plannen (nu: Calendly, later: Cal.com of je eigen book-me link)
   - Verwachtingen eerste kwartaal: "we run the scan first, produce the Full Report, dan plannen we jouw monthly-meeting cadence"
3. Voer de onboarding handmatig uit zolang er <5 Advisory klanten zijn
4. Voeg ze toe aan een private "ABOL Advisory" board (Notion / Linear / whatever) voor deliverable tracking

---

## Als er iets misgaat

### Geen Stripe notificatie ontvangen
- Check spam / promotions
- Stripe dashboard → Emails → resend de ontvangstbevestiging
- Verifieer je email-adres in Stripe account → Business settings

### UPDATE faalde in Supabase
- Check `SUPABASE_ACCESS_TOKEN` nog geldig
- Fallback: gebruik de Supabase dashboard SQL editor direct

### `generate_report.py` faalt
- Check `python --version` ≥ 3.11
- Check `pip install -r requirements.txt` gedraaid
- Check `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` staan in je shell env
- Fallback: `python generate_report.py --demo` om te verifiëren dat de PDF-pipeline zelf werkt; als demo werkt maar `--source supabase` niet, dan is het env-gerelateerd

### Buyer klaagt dat hij nog geen PDF heeft
- Check je spreadsheet: heb je wel verzonden?
- Check buyer's spam folder (PDF attachments landen vaak in promotions)
- Herverstuur vanuit je sent-folder

### Refund aanvraag
- Stripe dashboard → Payments → klik de payment → **Refund payment**
- UPDATE in Supabase: `is_paid = false`, voeg notitie toe
- Log in je spreadsheet

---

## Wanneer automatiseren?

Wanneer je **10+ orders per maand** krijgt handmatig aangeleverd. Dan is de tijdwinst van automation (Fly.io deploy + Stripe webhook + Resend) waard. Tot die tijd is 5 min per order × 10 orders = 50 min/maand manueel werk — zinniger dan opschaling-debugging.

De code voor die automation staat al klaar in de repo (`server.py`, `supabase/005_stripe_events.sql`, `storage.py`, `email_sender.py`). Wanneer je klaar bent voor de switch: volg de Fly.io setup in CLAUDE.md.
