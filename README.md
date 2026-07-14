<div align="center">

<a href="https://wanderspoofer.com">
  <img src="https://wanderspoofer.com/wander-logo.png" width="120" alt="Wander logo"/>
</a>

# Wander — Website

### The landing page for **Wander**, the free, open-source location spoofer for iPhone, Android, Mac & Windows.

The free alternative to paid apps like **iMyFone AnyTo** and **Tenorshare iAnyGo**.

<br/>

[![Website](https://img.shields.io/badge/🌐_Visit-wanderspoofer.com-4C8BF5?style=for-the-badge)](https://wanderspoofer.com)
[![Download](https://img.shields.io/badge/⬇️_Download-Free-22C55E?style=for-the-badge)](https://wanderspoofer.com/#download)
[![Discord](https://img.shields.io/badge/💬_Discord-Join-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/gfHdsRXUVA)

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg?style=flat-square)](../LICENSE)
![Platform](https://img.shields.io/badge/platform-iOS_·_Android_·_macOS_·_Windows-lightgrey?style=flat-square)

<br/>

### 👉 [**Visit the live site → wanderspoofer.com**](https://wanderspoofer.com) &nbsp;·&nbsp; [**⭐ Star this repo**](https://github.com/faisal-nabulsi/wander-site)

<br/>

<a href="https://github.com/faisal-nabulsi/Wander"><img src="https://img.shields.io/badge/⭐_Star_Wander_on_GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="Star Wander on GitHub"/></a>

**⭐ [Star Wander on GitHub](https://github.com/faisal-nabulsi/Wander) — it's free, takes one click, and helps more people find a free alternative to the paid spoofers.**

<br/>

[![Join our Discord](https://img.shields.io/badge/💬_Join_the_Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/gfHdsRXUVA)

**💬 [Join the Wander Discord](https://discord.gg/gfHdsRXUVA) — setup help, release updates, and feature requests.**

</div>

---

## 🚀 Want Wander? Start here

This repo just hosts the marketing site. To **download the app and get set up in ~2 minutes**, go to the real thing:

### 👉 [**wanderspoofer.com**](https://wanderspoofer.com) — teleport, joystick, routes, GPX import, no jailbreak.

**Get the app source:**
- 📱 **iOS (flagship):** [github.com/faisal-nabulsi/Wander](https://github.com/faisal-nabulsi/Wander)
- 💻 **Desktop (Mac & Windows):** [github.com/faisal-nabulsi/wander-desktop](https://github.com/faisal-nabulsi/wander-desktop)

---

## 🧑‍💻 About this repo

A fast, responsive, single-page site for Wander. **No backend** — the contact form opens the visitor's mail app via `mailto:`. Deploys free on GitHub Pages.

```
github-pages/
├── index.html      # all sections (hero, features, how, pricing, install, about, contact)
├── styles.css      # design system (Wander blues, responsive, animations)
├── script.js       # countdown, scroll-spy nav, mobile menu, reveal-on-scroll
└── README.md
```

### Before you publish — fill these in

Search the files for these and replace:

| Where | What to change |
|---|---|
| `script.js` → `PROMO_END` | The date/time the **50%-off countdown** ends. When it passes, the promo bar auto-hides. |
| `index.html` → `YOUR_LINKEDIN` | Your real LinkedIn profile URL (in the Contact socials + you can add to footer). |
| `index.html` → About section (`<!-- EDIT ME -->`) | Your own 2–3 sentences (a starter is written for you). |
| `pricing/index.html` → `LS = {…}` | Your 3 Lemon Squeezy checkout links (monthly/yearly/lifetime) and prices. |
| Download links | They point at `github.com/faisal-nabulsi/Wander/releases/latest` — update if your repo/release differs. |

Everything else (email, GitHub, Discord, colors) is already wired.

### Deploy on GitHub Pages

1. Put these files at the **root** of a repo (or in a `/docs` folder).
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Pick your branch and `/root` (or `/docs`), **Save**.
4. Your site goes live at `https://<user>.github.io/<repo>/` in ~1 minute.

**Custom domain:** the live site runs at **[wanderspoofer.com](https://wanderspoofer.com)** — add a `CNAME` file containing your domain, then point your DNS `A`/`CNAME` records at GitHub Pages per their docs.

### Local preview

```bash
cd github-pages
python3 -m http.server 8080   # then open http://localhost:8080
```

### Notes

- Pure HTML/CSS/JS, zero dependencies, no build step — loads instantly.
- Icons are inline SVG; the phone mockups are pure CSS (no image files to host).
- Fully responsive with a mobile menu, and respects `prefers-reduced-motion`.
- Want a **contact form that saves messages** (instead of `mailto:`)? Use the **Firebase version** in the sibling `firebase/` folder.

---

## 💬 Community & support

[![Join our Discord](https://img.shields.io/badge/💬_Join_the_Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/gfHdsRXUVA)

**[Join the Wander Discord →](https://discord.gg/gfHdsRXUVA)** for setup help, release updates, and feature requests. It's the fastest way to get unstuck and to hear about new builds first.

- 🌐 **Website:** [wanderspoofer.com](https://wanderspoofer.com)
- ⭐ **Star the flagship repo:** [give Wander a star](https://github.com/faisal-nabulsi/Wander) — the easiest way to support the project.
- 💬 **Discord:** [join the server](https://discord.gg/gfHdsRXUVA).

---

## 📜 License

Wander is free and open-source under the **GNU AGPL-3.0**. See [LICENSE](../LICENSE).

---

<div align="center">

### ⭐ Star this repo if Wander saved you from paying for AnyTo or iAnyGo.

**[🌐 wanderspoofer.com](https://wanderspoofer.com)** &nbsp;·&nbsp; **[⬇️ Download](https://wanderspoofer.com/#download)** &nbsp;·&nbsp; **[💬 Discord](https://discord.gg/gfHdsRXUVA)**

</div>
