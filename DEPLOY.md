# Deploying to GitHub Pages

The repo is committed and `origin` is set to
`https://github.com/BlakeRMills/BlakeRMills.github.io.git`.
Nothing has been pushed yet.

## 1. Create the empty repo on GitHub

Go to <https://github.com/new> and create:

- **Name:** `BlakeRMills.github.io`
- **Visibility:** Public (Pages needs public on a free plan)
- **Do not** add a README, .gitignore, or licence — the repo already has commits

> Using your `username.github.io` name means the site serves from the root of
> `blakerobertmills.github.io`, which keeps every relative path working. If you'd
> rather use a different name, change it here first:
> `git remote set-url origin https://github.com/BlakeRMills/<name>.git`

## 2. Push

```bash
cd ~/Documents/blakerobertmills-site
git push -u origin main
```

Git will prompt for credentials. There's no saved GitHub login on this machine yet:

- **Username:** `BlakeRMills`
- **Password:** a Personal Access Token, *not* your account password.
  Make one at <https://github.com/settings/tokens> → "Generate new token (classic)"
  → tick the **repo** scope.

macOS will save it to the keychain, so this is a one-time step.

## 3. Turn on Pages

Repo → **Settings → Pages**:

- **Source:** Deploy from a branch
- **Branch:** `main`, folder `/ (root)`

Give it a minute, then check <https://blakerobertmills.github.io>. Everything
should work at this point — this is your chance to look it over on the real
thing before touching DNS.

## 4. Point the domain at GitHub

**Do this last, and only once step 3 looks right.**

Your domain is registered with **Squarespace Domains**, and DNS is served from
Google's nameservers (`ns-cloud-c*.googledomains.com`) — leftovers from Google
Domains, which Squarespace bought. Manage DNS at
<https://account.squarespace.com/domains>.

Current records point at Squarespace:

| Host  | Type  | Value                      |
|-------|-------|----------------------------|
| @     | A     | 198.185.159.144/145, 198.49.23.144/145 |
| www   | CNAME | `ext-cust.squarespace.com` |

Replace them with:

| Host  | Type  | Value                   |
|-------|-------|-------------------------|
| www   | CNAME | `BlakeRMills.github.io` |
| @     | A     | `185.199.108.153`       |
| @     | A     | `185.199.109.153`       |
| @     | A     | `185.199.110.153`       |
| @     | A     | `185.199.111.153`       |

The four apex A records let `blakerobertmills.com` redirect to the `www` version.
GitHub lists these same IPs in its custom-domain docs — worth confirming there in
case they've changed.

Then in **Settings → Pages → Custom domain**, enter `www.blakerobertmills.com`.
The repo already contains a `CNAME` file with that value, so it may be filled in
already. Once DNS has propagated, tick **Enforce HTTPS** (the certificate can
take up to an hour to issue).

Check it with:

```bash
dig +short www.blakerobertmills.com
```

You want to see `BlakeRMills.github.io` rather than `ext-cust.squarespace.com`.

## 5. Only then, cancel Squarespace

Two separate things, and this is the easy one to get wrong:

- **The website plan** — safe to cancel once the new site is live.
- **The domain registration** — also Squarespace. Cancelling the site plan does
  not cancel the domain, but don't let the domain lapse with it. Either keep
  paying Squarespace for the registration alone, or transfer it to another
  registrar (Cloudflare and Porkbun are the usual cheap picks) *before* you
  cancel anything.

Nothing on the new site loads from Squarespace any more — images, the resume PDF
and the fonts are either in this repo or on Google Fonts — so once DNS moves, the
site no longer depends on them for anything but the domain.

## Updating the site later

```bash
cd ~/Documents/blakerobertmills-site
# edit files
git add -A
git commit -m "what changed"
git push
```

Pages redeploys within a minute or so.
