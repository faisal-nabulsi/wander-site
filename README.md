# Wander — landing page (GitHub Pages / static)

A fast, responsive, single-page site for Wander. **No backend** — the contact form
opens the visitor's mail app via `mailto:`. Deploys free on GitHub Pages.

```
github-pages/
├── index.html      # all sections (hero, features, how, pricing, install, about, contact)
├── styles.css      # design system (Wander blues, responsive, animations)
├── script.js       # countdown, scroll-spy nav, mobile menu, reveal-on-scroll
└── README.md
```

## Before you publish — fill these in
Search the files for these and replace:

| Where | What to change |
|---|---|
| `script.js` → `PROMO_END` | The date/time the **50%-off countdown** ends. When it passes, the promo bar auto-hides. |
| `index.html` → `YOUR_LINKEDIN` | Your real LinkedIn profile URL (in the Contact socials + you can add to footer). |
| `index.html` → About section (`<!-- EDIT ME -->`) | Your own 2–3 sentences (a starter is written for you). |
| `index.html` → pricing / Venmo handle | Confirm `@faisal_nabulsi` and prices are right. |
| Download links | They point at `github.com/faisal-nabulsi/Wander/releases/latest` — update if your repo/release differs. |

Everything else (email, GitHub, Discord `naboosie`, colors) is already wired.

## Deploy on GitHub Pages
1. Put these three files at the **root** of a repo (or in a `/docs` folder).
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Pick your branch and `/root` (or `/docs`), **Save**.
4. Your site goes live at `https://<user>.github.io/<repo>/` in ~1 minute.

**Custom domain (optional):** add a `CNAME` file containing your domain (e.g. `getwander.app`),
then point your DNS `A`/`CNAME` records at GitHub Pages per their docs.

## Local preview
```bash
cd github-pages
python3 -m http.server 8080   # then open http://localhost:8080
```

## Notes
- Pure HTML/CSS/JS, zero dependencies, no build step — loads instantly.
- Icons are inline SVG; the phone mockups are pure CSS (no image files to host).
- Fully responsive with a mobile menu, and respects `prefers-reduced-motion`.
- Want a **contact form that saves messages** (instead of `mailto:`)? Use the **Firebase
  version** in the sibling `firebase/` folder.
