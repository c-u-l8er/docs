# Collapsing the docs atlas onto one canonical host

> ## ⚠ NOT ADOPTED — decided against 2026-08-13, the same day this was written.
>
> This document was written to execute `ACADEMY.md` step A1b as that step was worded. Measuring
> the premise afterwards showed the step was asserting a **mechanism** (301s exist) rather than
> the **outcome** it wanted (one host accumulates the citations) — and the outcome already holds
> without any redirect:
>
> - every page on all twelve non-canonical hosts declares `canonical → docs.ampersandboxdesign.com`
> - the sitemap they serve lists **only** canonical-host URLs — they do not advertise themselves
> - their `robots.txt` points its `Sitemap:` line at the canonical host
> - **nothing links to them.** The shared nav links the canonical host 34×; across every marketing
>   site it is the only docs link
>
> Unlinked, unsitemapped and self-declaring as copies, the twelve are effectively undiscoverable,
> and an engine that does reach one consolidates it. Buying that with twelve permanent edge rules
> — whose failure mode is a loop that takes the atlas down on all thirteen hostnames at once —
> is a bad trade.
>
> **Everything below is retained deliberately, not by neglect.** If the decision is revisited, the
> configuration is here and the reasoning does not have to be re-derived. `verify-canonical.sh`
> still works and still exits 1, which is now the *expected* result rather than a pending task.
>
> The live question A1b leaves behind is not a redirect: **why are twelve unused custom domains
> attached to the Pages project?** Detaching them dissolves the question entirely.

**Status:** written 2026-08-13, **not applied and not planned**.
**Supersedes:** nothing. **Superseded by:** the measurement above.

The `docs` Cloudflare Pages project has thirteen custom domains attached. All thirteen serve
byte-identical content at HTTP 200, so 434 documents are published at roughly 5,600 URLs. Every
page already declares `<link rel="canonical" href="https://docs.ampersandboxdesign.com/…">`; what
is missing is enforcement.

This cannot be done from the repository. Cloudflare Pages' `_redirects` matches paths, not
hostnames, and all thirteen domains are served by one deployment — so a `_redirects` entry would
fire on the canonical host too. It has to be done at the edge.

## Option A — one Bulk Redirect list (recommended)

Account-level, so twelve hostnames are configured in one place rather than twelve.

**Dashboard →** Account Home → Bulk Redirects → Create a redirect list → name it `docs-canonical`.

For each row below: **Status `301`**, and enable **Preserve query string**, **Subpath matching**
and **Preserve path suffix**. Leave *Include subdomains* off.

| Source URL | Target URL |
|---|---|
| `docs.agentelic.com/` | `https://docs.ampersandboxdesign.com/` |
| `docs.agentromatic.com/` | `https://docs.ampersandboxdesign.com/` |
| `docs.bendscript.com/` | `https://docs.ampersandboxdesign.com/` |
| `docs.delegatic.com/` | `https://docs.ampersandboxdesign.com/` |
| `docs.deliberatic.com/` | `https://docs.ampersandboxdesign.com/` |
| `docs.fleetprompt.com/` | `https://docs.ampersandboxdesign.com/` |
| `docs.geofleetic.com/` | `https://docs.ampersandboxdesign.com/` |
| `docs.graphonomous.com/` | `https://docs.ampersandboxdesign.com/` |
| `docs.opensentience.org/` | `https://docs.ampersandboxdesign.com/` |
| `docs.specprompt.com/` | `https://docs.ampersandboxdesign.com/` |
| `docs.ticktickclock.com/` | `https://docs.ampersandboxdesign.com/` |
| `docs.webhost.systems/` | `https://docs.ampersandboxdesign.com/` |

Then Bulk Redirects → Create rule → attach the `docs-canonical` list → Deploy.

**`docs.ampersandboxdesign.com` must NOT appear in that list.** Adding it produces a redirect
loop that takes the atlas down on every host at once.

## Option B — twelve Redirect Rules, one per zone

Use this if Bulk Redirects is unavailable. In each of the twelve zones:
**Rules → Redirect Rules → Create rule**, named `docs → canonical`.

- **When incoming requests match** — Custom filter expression:
  ```
  (http.host eq "docs.<ZONE>")
  ```
- **Then** — Type **Dynamic**, Expression:
  ```
  concat("https://docs.ampersandboxdesign.com", http.request.uri.path)
  ```
- **Status code** `301`, **Preserve query string** on.

Substitute `<ZONE>` per zone: `agentelic.com`, `agentromatic.com`, `bendscript.com`,
`delegatic.com`, `deliberatic.com`, `fleetprompt.com`, `geofleetic.com`, `graphonomous.com`,
`opensentience.org`, `specprompt.com`, `ticktickclock.com`, `webhost.systems`.

## Verify

Run this after applying. It asserts that all twelve redirect and that the canonical host does
**not** — a loop is the one failure mode that matters here, and it is the one a spot-check of a
single host will miss.

```bash
bash verify-canonical.sh          # from this repo
# bash docs/verify-canonical.sh   # from the ProjectAmp2 working tree
```

## Why 301 and not just the canonical tag

The canonical tag is a hint an engine may weigh; a 301 is a directive it must follow. Alkeyword's
own G10 vocabulary rates this duplicate group as **agree** — every URL naming the same original —
which is the mildest form of the problem and the reason this sat unnoticed. It is still twelve
copies of the corpus competing for the same citations, and Academy's Layer 1 thesis is that
grounded, canonical, extractable pages get cited. Publishing that corpus thirteen times is the
opposite of the argument the corpus is making.
