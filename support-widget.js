/* ==========================================================================
   Wander — Support chat widget (self-contained)
   --------------------------------------------------------------------------
   Drop-in floating chat widget. Include once per page, right after script.js:
       <script src="/support-widget.js" defer></script>

   • Floating bubble bottom-right → opens a chat panel.
   • Talks to the Wander Worker:  POST https://api.wanderspoofer.com/support/chat
     Body:  { messages: [ { role, content }, ... ] }   (history capped ~10)
     Reads: { reply: "..." }  (also tolerates { message } / { content } / { text }).
   • Renders replies as light markdown (bold, italic, code, links, line breaks).
   • Typing indicator while waiting; calm error + 429 handling.
   • On-brand (brand blue #185FA5), mobile-friendly, keyboard accessible.

   No external dependencies. Injects its own scoped styles + DOM.
   ========================================================================== */
(function () {
  "use strict";

  // Guard against double-inclusion.
  if (window.__wanderSupportWidget) return;
  window.__wanderSupportWidget = true;

  // ---- Config ------------------------------------------------------------
  // Worker base: the site has no existing HTTP Worker call to inherit (the
  // "Worker" writes purchases to Firestore, which pages read via the Firebase
  // SDK), so we use the documented support endpoint directly. Override globally
  // by setting window.WANDER_API before this script runs.
  var API_BASE  = (window.WANDER_API || "https://wander-payments.wanderlocation.workers.dev").replace(/\/+$/, "");
  var CHAT_URL  = API_BASE + "/support/chat";
  var DISCORD   = "https://discord.gg/gfHdsRXUVA";
  var MAX_HISTORY = 10; // messages sent to the server (user+assistant combined)

  var GREETING =
    "Hi, I'm Wanda 🐧 — your Wander guide! Ask me anything about features, setup, which devices work, or the free trial. " +
    "For billing or account help, waddle over to our Discord.";

  // Running client-side history (role/content pairs).
  var history = [];
  var busy = false;

  // ---- Styles ------------------------------------------------------------
  var css = ""
    + ".wsw{position:fixed;right:20px;bottom:20px;z-index:2147483000;"
    + "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}"
    + ".wsw *{box-sizing:border-box;}"
    // launcher bubble
    + ".wsw-launch{width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;"
    + "background:linear-gradient(135deg,#2b7fd4 0%,#185FA5 55%,#0f4c86 100%);color:#fff;"
    + "box-shadow:0 20px 50px rgba(24,95,165,.35),0 2px 8px rgba(12,26,43,.18);"
    + "display:flex;align-items:center;justify-content:center;"
    + "transition:transform .16s ease,box-shadow .2s ease;}"
    + ".wsw-launch:hover{transform:translateY(-2px);box-shadow:0 26px 60px rgba(24,95,165,.45);}"
    + ".wsw-launch:focus-visible{outline:3px solid #6fb0ef;outline-offset:3px;}"
    + ".wsw-launch svg{width:26px;height:26px;display:block;}"
    + ".wsw-launch.wsw-hide{display:none;}"
    // panel
    + ".wsw-panel{position:fixed;right:20px;bottom:20px;width:380px;max-width:calc(100vw - 32px);"
    + "height:560px;max-height:calc(100vh - 40px);background:#fff;border-radius:20px;overflow:hidden;"
    + "box-shadow:0 24px 60px rgba(16,64,120,.28),0 2px 10px rgba(12,26,43,.12);"
    + "display:none;flex-direction:column;border:1px solid #e2e8f0;"
    + "animation:wsw-in .18s ease;}"
    + ".wsw-panel.wsw-open{display:flex;}"
    + "@keyframes wsw-in{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}"
    // header
    + ".wsw-head{background:linear-gradient(135deg,#2b7fd4 0%,#185FA5 55%,#0f4c86 100%);color:#fff;"
    + "padding:14px 16px;display:flex;align-items:center;gap:10px;}"
    + ".wsw-head .wsw-avatar{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.18);"
    + "display:flex;align-items:center;justify-content:center;flex:0 0 auto;}"
    + ".wsw-head .wsw-avatar svg{width:20px;height:20px;}"
    + ".wsw-htitle{font-weight:800;font-size:1rem;line-height:1.2;}"
    + ".wsw-hsub{font-size:.72rem;opacity:.9;font-weight:600;}"
    + ".wsw-close{margin-left:auto;background:rgba(255,255,255,.14);border:none;color:#fff;cursor:pointer;"
    + "width:30px;height:30px;border-radius:8px;font-size:16px;line-height:1;display:flex;"
    + "align-items:center;justify-content:center;}"
    + ".wsw-close:hover{background:rgba(255,255,255,.26);}"
    + ".wsw-close:focus-visible{outline:2px solid #fff;outline-offset:2px;}"
    // disclaimer
    + ".wsw-note{background:#eaf2fb;color:#3a4a5e;font-size:.74rem;font-weight:600;padding:8px 16px;"
    + "border-bottom:1px solid #e2e8f0;line-height:1.4;}"
    + ".wsw-note a{color:#185FA5;font-weight:700;text-decoration:underline;}"
    // messages
    + ".wsw-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;"
    + "background:#f8fbff;}"
    + ".wsw-msg{max-width:85%;padding:10px 13px;border-radius:14px;font-size:.9rem;line-height:1.5;"
    + "white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere;}"
    + ".wsw-msg.bot{align-self:flex-start;background:#fff;color:#0c1a2b;border:1px solid #e2e8f0;"
    + "border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(12,26,43,.05);}"
    + ".wsw-msg.user{align-self:flex-end;background:linear-gradient(135deg,#2b7fd4,#185FA5);color:#fff;"
    + "border-bottom-right-radius:4px;}"
    + ".wsw-msg.err{align-self:flex-start;background:#fff4f4;color:#8a1f1f;border:1px solid #f3caca;}"
    + ".wsw-msg a{color:inherit;text-decoration:underline;}"
    + ".wsw-msg.bot a{color:#185FA5;}"
    + ".wsw-msg code{background:rgba(12,26,43,.08);padding:1px 5px;border-radius:5px;font-size:.85em;"
    + "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}"
    + ".wsw-msg.user code{background:rgba(255,255,255,.2);}"
    // typing dots
    + ".wsw-typing{display:flex;gap:4px;align-items:center;padding:12px 14px;}"
    + ".wsw-typing span{width:7px;height:7px;border-radius:50%;background:#6b7a8d;opacity:.5;"
    + "animation:wsw-bounce 1.2s infinite ease-in-out;}"
    + ".wsw-typing span:nth-child(2){animation-delay:.2s;}"
    + ".wsw-typing span:nth-child(3){animation-delay:.4s;}"
    + "@keyframes wsw-bounce{0%,60%,100%{transform:translateY(0);opacity:.4;}30%{transform:translateY(-5px);opacity:.9;}}"
    // input
    + ".wsw-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e2e8f0;background:#fff;align-items:flex-end;}"
    + ".wsw-input{flex:1;resize:none;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px 12px;"
    + "font-family:inherit;font-size:.9rem;line-height:1.4;max-height:120px;color:#0c1a2b;"
    + "background:#f8fbff;}"
    + ".wsw-input:focus{outline:none;border-color:#3f8fdc;background:#fff;}"
    + ".wsw-send{flex:0 0 auto;width:42px;height:42px;border-radius:12px;border:none;cursor:pointer;"
    + "background:linear-gradient(135deg,#2b7fd4,#185FA5);color:#fff;display:flex;align-items:center;"
    + "justify-content:center;transition:transform .16s ease,opacity .2s ease;}"
    + ".wsw-send:hover:not(:disabled){transform:translateY(-1px);}"
    + ".wsw-send:disabled{opacity:.5;cursor:default;}"
    + ".wsw-send:focus-visible{outline:2px solid #6fb0ef;outline-offset:2px;}"
    + ".wsw-send svg{width:20px;height:20px;}"
    + "@media (max-width:480px){.wsw-panel{right:0;bottom:0;width:100vw;max-width:100vw;height:100dvh;"
    + "max-height:100dvh;border-radius:0;border:none;}}"
    + "@media (prefers-reduced-motion:reduce){.wsw-panel,.wsw-launch,.wsw-send,.wsw-typing span{animation:none!important;transition:none!important;}}";

  // ---- Helpers -----------------------------------------------------------
  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Very small, safe markdown: escape first, then re-introduce a few tags.
  function renderMarkdown(text) {
    var html = escapeHtml(text);
    // code spans
    html = html.replace(/`([^`]+)`/g, function (_, c) { return "<code>" + c + "</code>"; });
    // bold **x** / __x__
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    // italic *x* / _x_
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    html = html.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
    // links [text](url) — only http(s)/mailto
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      function (_, t, url) {
        return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + t + "</a>";
      });
    // bare URLs
    html = html.replace(/(^|[\s(])((https?:\/\/)[^\s<)]+)/g, function (m, pre, url) {
      return pre + '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + "</a>";
    });
    return html;
  }

  // ---- Build DOM ---------------------------------------------------------
  var root, panel, msgsEl, inputEl, sendBtn, launchBtn, typingEl;

  function build() {
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    root = el("div", "wsw");

    // Launcher
    launchBtn = el("button", "wsw-launch", {
      type: "button",
      "aria-label": "Open Wander support chat",
      "aria-haspopup": "dialog"
    });
    launchBtn.innerHTML =
      '<span aria-hidden="true" style="font-size:28px;line-height:1;">🐧</span>';

    // Panel
    panel = el("div", "wsw-panel", {
      role: "dialog",
      "aria-modal": "false",
      "aria-label": "Wander support chat",
      "aria-hidden": "true"
    });

    // Header
    var head = el("div", "wsw-head");
    var avatar = el("div", "wsw-avatar");
    avatar.innerHTML =
      '<span aria-hidden="true" style="font-size:20px;line-height:1;">🐧</span>';
    var htext = el("div");
    var htitle = el("div", "wsw-htitle"); htitle.textContent = "Wanda";
    var hsub = el("div", "wsw-hsub"); hsub.textContent = "Your Wander guide · replies instantly";
    htext.appendChild(htitle); htext.appendChild(hsub);
    var closeBtn = el("button", "wsw-close", { type: "button", "aria-label": "Close support chat" });
    closeBtn.innerHTML = "&#10005;";
    head.appendChild(avatar); head.appendChild(htext); head.appendChild(closeBtn);

    // Disclaimer
    var note = el("div", "wsw-note");
    note.innerHTML = "AI assistant — for billing or account help, "
      + '<a href="' + DISCORD + '" target="_blank" rel="noopener noreferrer">join our Discord</a>.';

    // Messages
    msgsEl = el("div", "wsw-msgs", { "aria-live": "polite", "aria-atomic": "false" });

    // Input form
    var form = el("form", "wsw-form");
    inputEl = el("textarea", "wsw-input", {
      rows: "1",
      placeholder: "Ask about Wander…",
      "aria-label": "Type your message",
      maxlength: "1000"
    });
    sendBtn = el("button", "wsw-send", { type: "submit", "aria-label": "Send message" });
    sendBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>';
    form.appendChild(inputEl); form.appendChild(sendBtn);

    panel.appendChild(head);
    panel.appendChild(note);
    panel.appendChild(msgsEl);
    panel.appendChild(form);

    root.appendChild(launchBtn);
    root.appendChild(panel);
    document.body.appendChild(root);

    // Greeting
    addMessage("bot", GREETING);

    // Wire events
    launchBtn.addEventListener("click", openPanel);
    closeBtn.addEventListener("click", closePanel);
    form.addEventListener("submit", onSubmit);
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(e); }
    });
    inputEl.addEventListener("input", autoGrow);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("wsw-open")) closePanel();
    });

    // Optional: remember open state within the session.
    try {
      if (sessionStorage.getItem("wsw_open") === "1") openPanel(true);
    } catch (_) {}
  }

  function autoGrow() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
  }

  function openPanel(skipFocus) {
    panel.classList.add("wsw-open");
    panel.setAttribute("aria-hidden", "false");
    launchBtn.classList.add("wsw-hide");
    try { sessionStorage.setItem("wsw_open", "1"); } catch (_) {}
    if (skipFocus !== true) setTimeout(function () { inputEl.focus(); }, 60);
    scrollToBottom();
  }

  function closePanel() {
    panel.classList.remove("wsw-open");
    panel.setAttribute("aria-hidden", "true");
    launchBtn.classList.remove("wsw-hide");
    try { sessionStorage.setItem("wsw_open", "0"); } catch (_) {}
    launchBtn.focus();
  }

  function scrollToBottom() {
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function addMessage(kind, text) {
    var m = el("div", "wsw-msg " + kind);
    if (kind === "bot") {
      m.innerHTML = renderMarkdown(text);
    } else {
      m.textContent = text;
    }
    msgsEl.appendChild(m);
    scrollToBottom();
    return m;
  }

  function showTyping() {
    typingEl = el("div", "wsw-msg bot wsw-typing", { "aria-label": "Assistant is typing" });
    typingEl.innerHTML = "<span></span><span></span><span></span>";
    msgsEl.appendChild(typingEl);
    scrollToBottom();
  }

  function hideTyping() {
    if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
    typingEl = null;
  }

  function setBusy(v) {
    busy = v;
    sendBtn.disabled = v;
    inputEl.disabled = v;
  }

  // ---- Networking --------------------------------------------------------
  function onSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (busy) return;
    var text = (inputEl.value || "").trim();
    if (!text) return;

    addMessage("user", text);
    history.push({ role: "user", content: text });
    inputEl.value = "";
    autoGrow();

    sendToServer();
  }

  function sendToServer() {
    setBusy(true);
    showTyping();

    // Keep the running history client-side, cap ~10.
    var payloadMessages = history.slice(-MAX_HISTORY);

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 30000);

    fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payloadMessages }),
      signal: controller.signal
    })
      .then(function (res) {
        clearTimeout(timer);
        if (res.status === 429) {
          var err429 = new Error("rate-limit");
          err429.code = 429;
          throw err429;
        }
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json().catch(function () { return {}; });
      })
      .then(function (data) {
        hideTyping();
        setBusy(false);
        var reply = (data && (data.reply || data.message || data.content || data.text)) || "";
        reply = String(reply).trim();
        if (!reply) {
          reply = "Sorry, I didn't catch that. Could you rephrase? For account or billing help, "
            + "join our [Discord](" + DISCORD + ").";
        }
        addMessage("bot", reply);
        history.push({ role: "assistant", content: reply });
        // Cap stored history too so it never grows unbounded.
        if (history.length > MAX_HISTORY * 2) history = history.slice(-MAX_HISTORY * 2);
        inputEl.focus();
      })
      .catch(function (err) {
        clearTimeout(timer);
        hideTyping();
        setBusy(false);
        var msg;
        if (err && err.code === 429) {
          msg = "I'm getting a lot of questions right now — try again in a bit, or hop in our "
            + "[Discord](" + DISCORD + ").";
        } else {
          msg = "Something went wrong reaching support just now. Please try again in a moment, "
            + "or reach us on [Discord](" + DISCORD + ").";
        }
        addMessage("err", "");
        // Render markdown link inside the error bubble.
        msgsEl.lastChild.innerHTML = renderMarkdown(msg);
        scrollToBottom();
      });
  }

  // ---- Init --------------------------------------------------------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
