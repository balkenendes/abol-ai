# Pipeloop.ai — Volledig Opstartplan voor Sam
**Geschatte tijd: 90 minuten. Na setup → volledig autonoom.**

---

## OVERZICHT: WAT JIJZELF DOET vs WAT AUTOMATISCH GAAT

| Jij doet (1x) | Daarna automatisch |
|---------------|-------------------|
| Accounts aanmaken (6x) | Nova zoekt dagelijks leads (08:00) |
| API keys kopiëren | AI verrijkt elk lead automatisch |
| Code op GitHub zetten | Alexander stuurt je dagelijks rapport (20:00) |
| DNS record toevoegen | Stripe verwerkt betalingen |
| | Jij keurt berichten goed in 15 min/dag |

---

## STAP 1 — Code installeren op je computer

Open een terminal (druk `Windows + R`, typ `cmd`, Enter):

```
cd C:\Users\samba\pipeloop-app
npm install
```

Wacht 1-2 minuten totdat alles geinstalleerd is. Je ziet "added X packages".

---

## STAP 2 — Supabase (database)

Ga naar: https://supabase.com

1. Klik **Start for free** → log in met Google of maak een account
2. Klik **New project**
3. Vul in:
   - Name: `pipeloop-app`
   - Database password: maak een sterk wachtwoord (sla op in notities)
   - Region: **West EU (Ireland)** — verplicht voor GDPR
4. Klik **Create new project** — wacht 2 minuten

**Keys ophalen:**
5. Ga naar **Settings** (tandwiel links) → **API**
6. Kopieer deze 3 waarden (bewaar ze):
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (klik Reveal) → `SUPABASE_SERVICE_ROLE_KEY`

**Database tabellen aanmaken:**
7. Ga naar **SQL Editor** (links) → klik **New query**
8. Open het bestand `supabase/migrations/001_initial_schema.sql` in je pipeloop-app map
9. Kopieer ALLE tekst → plak in SQL Editor → klik **Run**
   - Je ziet "Success. No rows returned" ✅
10. Klik **New query** opnieuw
11. Open `supabase/migrations/002_add_missing_columns.sql`
12. Kopieer alle tekst → plak → klik **Run** ✅

**Auth instellen:**
13. Ga naar **Authentication** → **URL Configuration**
14. Site URL: `https://app.pipeloop.ai`
15. Redirect URLs: klik **Add URL** → typ `https://app.pipeloop.ai/auth/callback`
16. Klik **Save**

---

## STAP 3 — Resend (e-mail)

Ga naar: https://resend.com

1. Maak een account aan (gratis)
2. Klik **API Keys** → **Create API Key**
3. Naam: `pipeloop-production` → kopieer de key → `RESEND_API_KEY`

**Domein verifiëren (e-mails komen van @pipeloop.ai):**
4. Klik **Domains** → **Add Domain** → typ `pipeloop.ai` → klik **Add**
5. Resend toont je DNS records (TXT en MX waarden)
6. Ga naar STRATO → jouw domein `pipeloop.ai` → DNS/Nameserver instellingen
7. Voeg de records toe die Resend toont
8. Klik **Verify** in Resend (kan 10-30 min duren)

---

## STAP 4 — Stripe (betalingen)

Ga naar: https://stripe.com

1. Maak een account → voltooi bedrijfsverificatie (gebruik BaselineZ B.V.)

**3 producten aanmaken:**
2. Ga naar **Products** → **Add product**
3. **Product 1:**
   - Name: `Pipeloop Starter`
   - Klik **Add pricing** → Recurring → EUR → `799.00` per month
   - Save → kopieer de **Price ID** (begint met `price_`) → `STRIPE_STARTER_PRICE_ID`
4. **Product 2:**
   - Name: `Pipeloop Growth` → prijs `1299.00` → kopieer → `STRIPE_GROWTH_PRICE_ID`
5. **Product 3:**
   - Name: `Pipeloop Scale` → prijs `1799.00` → kopieer → `STRIPE_SCALE_PRICE_ID`

**API keys:**
6. **Developers** → **API Keys**
7. Kopieer **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
8. Klik **Reveal secret key** → `STRIPE_SECRET_KEY`

**Webhook:**
9. **Developers** → **Webhooks** → **Add endpoint**
10. URL: `https://app.pipeloop.ai/api/webhooks/stripe`
11. Voeg toe: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
12. Klik **Add endpoint** → kopieer **Signing secret** (begint met `whsec_`) → `STRIPE_WEBHOOK_SECRET`

---

## STAP 5 — Upstash Redis (message bus)

Ga naar: https://console.upstash.com

1. Maak een account → klik **Create database**
2. Name: `pipeloop-redis` | Type: **Regional** | Region: **EU-West-1**
3. Klik **Create** → ga naar **REST API** tab
4. Kopieer **UPSTASH_REDIS_URL** en **UPSTASH_REDIS_TOKEN**

---

## STAP 6 — PhantomBuster (LinkedIn automatisering)

Ga naar: https://phantombuster.com

1. Maak een account → kies een betaald plan (vanaf ~$59/mo)
2. Ga naar **Explore** en voeg toe:
   - `LinkedIn Auto Connect` → kopieer het ID uit de URL → `PHANTOM_CONNECT_ID`
   - `LinkedIn Message Sender` → kopieer het ID → `PHANTOM_DM_ID`
3. Ga naar **Settings** → **API** → kopieer API key → `PHANTOMBUSTER_API_KEY`

**LinkedIn koppelen:**
4. Installeer de PhantomBuster Chrome Extension via de Chrome Store
5. Ga naar linkedin.com (ingelogd als jij)
6. Klik de extensie → klik **Connect LinkedIn**
7. Klaar — sessie is gekoppeld

---

## STAP 7 — Apollo.io (leads zoeken)

Ga naar: https://app.apollo.io

1. Maak een account (gratis tier: 50 credits/maand)
2. **Settings** → **Integrations** → **API** → **Create new key** → `APOLLO_API_KEY`

---

## STAP 8 — Code op GitHub zetten

Ga naar: https://github.com/new

1. Maak een **private** repository aan met de naam `pipeloop-app`
2. Klik NIET op "Initialize this repository"
3. Open terminal en voer uit:

```
cd C:\Users\samba\pipeloop-app
git init
git add .
git commit -m "Initial Pipeloop.ai application"
git branch -M main
git remote add origin https://github.com/JOUWUSERNAME/pipeloop-app.git
git push -u origin main
```

Vervang `JOUWUSERNAME` door jouw GitHub gebruikersnaam.

---

## STAP 9 — Vercel (hosting + deployment)

Ga naar: https://vercel.com

1. Maak een account → log in met GitHub
2. Klik **Add New** → **Project**
3. Klik **Import** naast `pipeloop-app`
4. Laat alles op standaard → klik **Deploy** → wacht 2-3 minuten

**Geheime waarden genereren:**
5. Open terminal en run dit 2x (elke keer een andere waarde):
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Sla beide waarden op — eerste is `WEBHOOK_SECRET`, tweede is `CRON_SECRET`.

**Environment variables toevoegen:**
6. Ga naar je Vercel project → **Settings** → **Environment Variables**
7. Voeg ELK van onderstaande toe (klik per variable op **Add**):

| Variable naam | Waarde |
|---------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | van Supabase stap 2 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | van Supabase stap 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | van Supabase stap 2 |
| `ANTHROPIC_API_KEY` | van console.anthropic.com |
| `STRIPE_SECRET_KEY` | van Stripe stap 4 |
| `STRIPE_WEBHOOK_SECRET` | van Stripe stap 4 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | van Stripe stap 4 |
| `STRIPE_STARTER_PRICE_ID` | van Stripe stap 4 |
| `STRIPE_GROWTH_PRICE_ID` | van Stripe stap 4 |
| `STRIPE_SCALE_PRICE_ID` | van Stripe stap 4 |
| `RESEND_API_KEY` | van Resend stap 3 |
| `UPSTASH_REDIS_URL` | van Upstash stap 5 |
| `UPSTASH_REDIS_TOKEN` | van Upstash stap 5 |
| `PHANTOMBUSTER_API_KEY` | van PhantomBuster stap 6 |
| `PHANTOM_CONNECT_ID` | van PhantomBuster stap 6 |
| `PHANTOM_DM_ID` | van PhantomBuster stap 6 |
| `APOLLO_API_KEY` | van Apollo stap 7 |
| `NEXT_PUBLIC_APP_URL` | `https://app.pipeloop.ai` |
| `WEBHOOK_SECRET` | gegenereerd in stap 9 punt 5 |
| `CRON_SECRET` | gegenereerd in stap 9 punt 5 |

8. Na alle variables: **Deployments** → 3 stippen → **Redeploy**

---

## STAP 10 — Domein koppelen

1. Ga in Vercel naar **Settings** → **Domains**
2. Typ `app.pipeloop.ai` → klik **Add**
3. Vercel toont een DNS record, bijv:
   ```
   Type: CNAME
   Name: app
   Value: cname.vercel-dns.com
   ```
4. Ga naar STRATO → domein `pipeloop.ai` → DNS beheer
5. Voeg het CNAME record toe
6. Wacht 5-15 minuten
7. Ga naar `https://app.pipeloop.ai` — je app staat live ✅

---

## STAP 11 — Eerste test

1. Ga naar `https://app.pipeloop.ai`
2. Voer je e-mailadres in → klik **Send Magic Link**
3. Check je inbox → klik de link → je bent ingelogd ✅
4. Doorloop de onboarding (4 stappen, ~10 minuten)
5. Upload deze test CSV in stap 3:

```
first_name,last_name,company,title,email,website
Jan,de Vries,TechFlow BV,CEO,jan@techflow.nl,https://techflow.nl
Sarah,Johnson,GrowthLab,VP Sales,sarah@growthlab.io,https://growthlab.io
Marco,Rossi,DigitalForge,Founder,marco@digitalforge.it,https://digitalforge.it
```

Sla op als `test-leads.csv` → upload → AI verrijkt automatisch (~30 sec per lead)

6. Ga naar **Review Queue** — je ziet de gegenereerde LinkedIn berichten
7. Lees ze door → keur goed of bewerk → klik **Approve & Send**

---

## STAP 12 — Automatische agents verifiëren

Na deployment draaien cron jobs automatisch:
- **Nova** elke dag 08:00 → zoekt nieuwe leads via Apollo
- **Alexander** elke dag 20:00 → stuurt jou een rapport per e-mail

Handmatig testen (optioneel, via terminal):
```
curl -X POST https://app.pipeloop.ai/api/agents/alexander \
  -H "Authorization: Bearer JOUW_CRON_SECRET"
```

---

## MAANDELIJKSE KOSTEN

| Service | Kosten |
|---------|--------|
| Vercel Hobby | Gratis |
| Supabase Free | Gratis (tot 500MB) |
| Anthropic API | ~$5-15/mo voor 100 leads |
| Resend Free | Gratis (3.000 e-mails/mo) |
| Upstash Free | Gratis (10.000 req/dag) |
| PhantomBuster | ~$59/mo |
| Apollo.io | Gratis (50 leads/mo) of $49/mo |
| **Totaal Fase 1** | **~€70-120/mo** |
| **Eerste klant (€799/mo)** | **Winstgevend vanaf dag 1** |

---

## PROBLEMEN OPLOSSEN

**Magic link komt niet aan?**
→ Check spam | Supabase → Auth → URL Configuration correct ingesteld?

**AI verrijking werkt niet?**
→ Vercel → Settings → Environment Variables → `ANTHROPIC_API_KEY` correct?

**Stripe betaling werkt niet?**
→ Gebruik test keys voor testen (beginnen met `sk_test_`)
→ Schakel over naar live keys voor echte betalingen

**PhantomBuster stuurt niet?**
→ LinkedIn sessie verlopen? Herverbind via Chrome Extension
→ Check dat `PHANTOM_CONNECT_ID` het juiste nummer is

**Vercel build faalt?**
→ Vercel → Deployments → klik op fout → lees de logs
→ Meest voorkomend: ontbrekende environment variable

---

## SNELLE LINKS

| Dashboard | URL |
|-----------|-----|
| Jouw app | https://app.pipeloop.ai |
| Supabase | https://supabase.com/dashboard |
| Vercel | https://vercel.com/dashboard |
| Stripe | https://dashboard.stripe.com |
| Anthropic | https://console.anthropic.com |
| Resend | https://resend.com |
| Upstash | https://console.upstash.com |
| PhantomBuster | https://phantombuster.com |
| Apollo.io | https://app.apollo.io |
| GitHub | https://github.com |
