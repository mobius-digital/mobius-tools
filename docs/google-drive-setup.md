# Letting Ledger read your Drive receipts

One-time setup, about five minutes. It gives Mobius Ledger **read-only** access
to your own Drive so it can import the receipts already filed under
`Taxes / 2026 / …`. It can never change or delete anything there.

You are the Workspace admin, so this is an **Internal** app — no Google review,
no "unverified app" warning, no publishing.

---

## 1. Make a project

1. Go to **https://console.cloud.google.com/projectcreate**
2. Project name: `Mobius Ledger`
3. **Create**, and wait for it to switch to the new project (top-left picker)

## 2. Turn on the Drive API

1. Go to **https://console.cloud.google.com/apis/library/drive.googleapis.com**
2. Make sure `Mobius Ledger` is the project in the top-left picker
3. **Enable**

## 3. Fill in the consent screen

1. Go to **https://console.cloud.google.com/auth/overview**
2. **Get started**
3. App name: `Mobius Ledger` · User support email: your address
4. Audience: **Internal**
5. Contact email: your address → agree → **Create**

## 4. Create the credential

1. Go to **https://console.cloud.google.com/auth/clients**
2. **Create client**
3. Application type: **Web application**
4. Name: `Ledger worker`
5. Under **Authorised redirect URIs** → **Add URI** → paste exactly:

   ```
   https://mobius-ledger.mobius-digital.workers.dev/api/drive-callback
   ```

6. **Create**
7. Copy the **Client ID** and **Client secret** that pop up

## 5. Hand them over

Paste both into `ledger/worker/.env`:

```
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

Save, and say "pushed". They go to Workers Secrets and the file is blanked, the
same way the Stripe, Plaid, Anthropic and Slack keys were handled.

---

## 6. Connect and import

1. Ledger → **Settings** → *Import receipts from Google Drive* → **Connect Google Drive**
2. A Google tab opens — approve read-only access, it says connected, close it
3. Back in Settings, paste the folder link. Open the folder in Drive and copy the
   address bar, e.g.
   `https://drive.google.com/drive/folders/1RyuzpUZdvrxuuNuUzZovJq5sPQ_kIiug`
   (that one is `Taxes/2026`)
4. **Scan folder** — it reports how many receipts it found and which months
5. **Start import** — it works through them and shows a running count

## What it does to your books

- It **attaches** receipts to transactions that already exist and are missing one
- It **never creates a transaction**, so your totals cannot move
- The month comes from the folder it was filed in, and the match is the amount to
  the cent
- Anything it cannot match is listed under **See what happened** — nothing is
  silently dropped

Safe to stop and resume: **Resume import** picks up where it left off, and a file
already attached is never processed twice.

## Doing 2023–2025

Point it at those year folders if you like — but there are no transactions in
Ledger for those years, so every receipt will report "no match". The right home
for them is where they already are.
