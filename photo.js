/* Paycheck X-Ray: read a stub photo on the device, then let the person review before saving. */
(function () {
  "use strict";
  const TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const SECS = ["earnings", "taxable", "memo", "pretax", "posttax", "taxes"];
  const SEC_NAME = { earnings: "Earnings", taxable: "Taxable benefits", memo: "Employer paid", pretax: "Pre-tax deductions", posttax: "After-tax deductions", taxes: "Taxes" };
  const $ = id => document.getElementById(id);
  const r2 = n => Math.round(n * 100) / 100;
  const P = () => window.PXR;
  let tessReady = null, worker = null, current = null;

  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn't load the text reader. Check your connection and try again.")); document.head.appendChild(s); }); }
  async function getWorker(onProg) {
    if (!tessReady) tessReady = loadScript(TESS);
    await tessReady;
    if (!worker) {
      worker = await window.Tesseract.createWorker("eng", 1, { logger: m => { if (m.status === "recognizing text") onProg(0.25 + m.progress * 0.75, "Reading the numbers"); else if (/load|init/i.test(m.status)) onProg(0.1 + (m.progress || 0) * 0.15, "Getting the text reader ready"); } });
      await worker.setParameters({ tessedit_pageseg_mode: "11", preserve_interword_spaces: "1" });
    }
    return worker;
  }

  /* Grayscale, 3×3 median (tames screen moiré), contrast stretch, about 3000px wide. */
  async function prepImage(file) {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That file isn't an image this browser can open.")); i.src = url; });
    const scale = Math.min(3000 / img.naturalWidth, 2.5);
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h), px = d.data, n = w * h;
    const g = new Uint8ClampedArray(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (px[j] * 299 + px[j + 1] * 587 + px[j + 2] * 114) / 1000;
    const m = new Uint8ClampedArray(g);
    const v = new Uint8Array(9);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const o = y * w + x;
      v[0] = g[o - w - 1]; v[1] = g[o - w]; v[2] = g[o - w + 1]; v[3] = g[o - 1]; v[4] = g[o]; v[5] = g[o + 1]; v[6] = g[o + w - 1]; v[7] = g[o + w]; v[8] = g[o + w + 1];
      v.sort(); m[o] = v[4];
    }
    const hist = new Uint32Array(256); for (let i = 0; i < n; i++) hist[m[i]]++;
    let lo = 0, hi = 255, acc = 0; for (; lo < 255; lo++) { acc += hist[lo]; if (acc > n * 0.01) break; }
    acc = 0; for (; hi > 0; hi--) { acc += hist[hi]; if (acc > n * 0.01) break; }
    const span = Math.max(1, hi - lo);
    for (let i = 0, j = 0; i < n; i++, j += 4) { const t = Math.max(0, Math.min(255, (m[i] - lo) * 255 / span)); px[j] = px[j + 1] = px[j + 2] = t; px[j + 3] = 255; }
    ctx.putImageData(d, 0, 0);
    return { canvas: cv, thumb: url };
  }

  /* Which saved stub this photo follows: the newest one whose next payday appears in the photo's text. */
  function pickTemplate(text) {
    const stubs = P().getStubs().slice().sort((a, b) => P().skey(a) < P().skey(b) ? -1 : 1);
    if (!stubs.length) return null;
    const dates = new Set([...String(text).matchAll(/(\d{1,2})\/(\d{1,2})\/(20\d\d)/g)].map(m => m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0")));
    const add14 = iso => { const [y, mo, d] = iso.split("-").map(Number); const t = new Date(y, mo - 1, d + 14); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); };
    const additional = /Additional/i.test(text);
    let tpl = null;
    for (const s of stubs) {
      if (additional && dates.has(s.payDate) && !P().isExtra(s)) tpl = s;
      else if (!additional && dates.has(add14(s.payDate)) && !stubs.some(x => x.payDate === add14(s.payDate) && !P().isExtra(x))) tpl = s;
    }
    if (!tpl) tpl = stubs[stubs.length - 1];
    const idx = stubs.indexOf(tpl);
    const curTpl = stubs.slice(0, idx + 1).reverse().find(s => !P().isExtra(s)) || tpl;
    return { tpl, curTpl };
  }

  function show(html) { const r = $("review"); r.hidden = false; r.innerHTML = html; P().openAdd(); r.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function progress(p, msg) { const bar = document.querySelector("#review .rv-prog div"); if (bar) bar.style.width = Math.round(p * 100) + "%"; const t = document.querySelector("#review .rv-msg"); if (t) t.textContent = msg; }

  async function handle(file) {
    if (!file) return;
    if (!P().getStubs().length) { show(`<h3>Add one stub first</h3><p class="muted" style="margin:0">Photos are read by following the format of a stub you've already added. Paste a statement or a backup above, then try the photo again.</p><div class="row-actions"><button class="btn ghost small" data-rv="cancel">Close</button></div>`); return; }
    show(`<h3>Reading your stub</h3><span class="muted rv-msg">Preparing the photo</span><div class="rv-prog"><div></div></div><p class="note" style="margin:0">The first photo downloads the text reader (about 15 MB). After that it's cached. The photo never leaves this device.</p>`);
    try {
      progress(0.03, "Preparing the photo");
      const { canvas, thumb } = await prepImage(file);
      const w = await getWorker(progress);
      progress(0.25, "Reading the numbers");
      const { data } = await w.recognize(canvas);
      fromOCR(data, thumb);
    } catch (e) {
      show(`<h3>Couldn't read that photo</h3><p class="muted" style="margin:0">${P().esc(e.message || String(e))}</p><div class="row-actions"><button class="btn ghost small" data-rv="cancel">Close</button></div>`);
    }
  }

  function fromOCR(data, thumb) {
    {
      const pick = pickTemplate(data.text);
      const res = window.PXR_OCR.parse(data.words.map(x => ({ text: x.text, bbox: x.bbox })), data.text, pick.tpl, pick.curTpl);
      if (res.error) { show(`<h3>Couldn't read that photo</h3><p class="muted" style="margin:0">${P().esc(res.error)}</p><div class="row-actions"><button class="btn ghost small" data-rv="cancel">Close</button></div>`); return; }
      current = { res, tpl: pick.tpl, thumb };
      renderReview();
    }
  }
  window.PXR_PHOTO = { fromOCR };

  function num(v) { return v == null || v === "" ? "" : Number(v).toFixed(2); }
  function evaluate() {
    const { res } = current, L = res.lines;
    const sum = (sec, f) => r2(L.filter(l => l.sec === sec).reduce((a, l) => a + (Number(l[f]) || 0), 0));
    const sec = {};
    for (const s of SECS) {
      if (!L.some(l => l.sec === s)) continue;
      const o = res.checks.sections[s] || {};
      const sy = sum(s, "ytd"), sc = sum(s, "cur");
      const yOk = o.obsY == null ? null : Math.abs(o.obsY - sy) < 0.015, cOk = o.obsC == null ? null : Math.abs(o.obsC - sc) < 0.015;
      sec[s] = { sy, sc, obsY: o.obsY, obsC: o.obsC, pass: yOk === true || cOk === true, known: yOk != null || cOk != null };
    }
    const net = r2(sum("earnings", "cur") - sum("pretax", "cur") - sum("posttax", "cur") - sum("taxes", "cur"));
    const netRead = res.stub.net && res.stub.net.cur;
    const netOk = netRead == null ? null : Math.abs(net - netRead) < 0.015;
    const failing = new Set(SECS.filter(s => sec[s] && sec[s].known && !sec[s].pass));
    const need = L.filter(l => l.status === "check" || (failing.has(l.sec) && l.status !== "ok")).length;
    const secFail = Object.values(sec).filter(x => x.known && !x.pass).length;
    return { sec, net, netRead, netOk, need, secFail, allGood: need === 0 && secFail === 0 && netOk !== false };
  }

  function renderReview() {
    const { res, tpl, thumb } = current, ev = evaluate(), P_ = P();
    const st = l => l.status === "ok" ? "Read" : l.status === "derived" ? "Matched" : "Check";
    let rows = "";
    for (const s of SECS) {
      const ls = res.lines.map((l, i) => [l, i]).filter(([l]) => l.sec === s); if (!ls.length) continue;
      const e = ev.sec[s];
      const chk = !e.known ? `<span class="chk muted">total not read</span>` : e.pass ? `<span class="chk" style="color:var(--good)">adds up</span>` : `<span class="chk" style="color:var(--amber)">off by ${P_.fmt(r2((e.obsY != null ? e.obsY - e.sy : e.obsC - e.sc)))}</span>`;
      rows += `<tr class="sec"><td>${SEC_NAME[s]} ${chk}</td><td class="n">${P_.fmt(e.sc)}</td><td class="n">${P_.fmt(e.sy)}</td><td></td></tr>`;
      for (const [l, i] of ls) {
        const suspect = l.status === "check" || (e.known && !e.pass && l.status !== "ok");
        rows += `<tr class="${suspect ? "need" : ""}"><td>${l.manual ? `<select data-i="${i}" data-f="sec" aria-label="Section" style="margin-bottom:4px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:4px">${SECS.map(x => `<option value="${x}"${x === l.sec ? " selected" : ""}>${SEC_NAME[x]}</option>`).join("")}</select>` : ""}${l.isNew ? `<input class="name" data-i="${i}" data-f="label" value="${P_.esc(l.label)}" aria-label="Line name">` : P_.esc(l.label)}${l.note ? `<span class="note2">${P_.esc(l.note)}</span>` : ""}</td>
          <td class="n"><input inputmode="decimal" data-i="${i}" data-f="cur" value="${num(l.cur)}" aria-label="${P_.esc(l.label)} this check"></td>
          <td class="n"><input inputmode="decimal" data-i="${i}" data-f="ytd" value="${num(l.ytd)}" aria-label="${P_.esc(l.label)} year to date"></td>
          <td><button class="st ${l.status}" data-rv="ok" data-i="${i}" style="all:unset;cursor:pointer" title="${l.status === "check" ? "Tap after checking it against the photo" : ""}"><span class="st ${l.status}">${st(l)}</span></button></td></tr>`;
      }
    }
    const banner = ev.allGood ? `<div class="rv-banner ok">Everything checks out against your ${P_.nice(tpl.payDate)} stub and the section totals.</div>`
      : `<div class="rv-banner warn">${[ev.need ? `${ev.need} line${ev.need > 1 ? "s" : ""} to check` : "", ev.secFail ? `${ev.secFail} section${ev.secFail > 1 ? "s" : ""} not adding up` : "", ev.netOk === false ? "net pay doesn't match" : ""].filter(Boolean).join(" · ")}. Compare the highlighted rows with your stub, fix any numbers, then tap Check to mark them right.</div>`;
    show(`<div class="rv-top"><h3>Review stub photo</h3>${thumb ? `<img class="rv-img" src="${thumb}" alt="Your stub photo">` : ""}</div>
      <div class="rv-meta"><label class="field" for="rvDate" style="flex-direction:row;align-items:center;gap:6px">Pay date <input id="rvDate" type="date" value="${res.stub.payDate || ""}"></label>
        <label class="field" for="rvKind" style="flex-direction:row;align-items:center;gap:6px">Type <select id="rvKind"><option${res.stub.kind !== "Additional" ? " selected" : ""}>Normal</option><option${res.stub.kind === "Additional" ? " selected" : ""}>Additional</option></select></label>
        <span class="muted" style="font-size:13px">Compared with ${P_.nice(tpl.payDate)}</span></div>
      ${banner}
      <div class="tbl-wrap rv"><table><thead><tr><th>Line</th><th class="n">This check</th><th class="n">YTD</th><th></th></tr></thead><tbody>${rows}
        <tr class="sec"><td>Net pay <span class="chk" style="color:${ev.netOk === false ? "var(--amber)" : "var(--good)"}">${ev.netRead == null ? "" : ev.netOk ? "matches deposit" : `deposit read as ${P_.fmt(ev.netRead)}`}</span></td><td class="n">${P_.fmt(ev.net)}</td><td></td><td></td></tr>
      </tbody></table></div>
      <div class="row-actions"><button class="btn" data-rv="save">${ev.allGood ? "Save stub" : "Save anyway"}</button><button class="btn ghost small" data-rv="addline">Add a missing line</button><button class="btn ghost small" data-rv="cancel">Cancel</button></div>`);
  }

  function save() {
    const { res, tpl } = current;
    const date = $("rvDate").value, kind = $("rvKind").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { $("rvDate").focus(); return; }
    const L = res.lines.filter(l => l.label && (Number(l.cur) || Number(l.ytd)));
    const items = L.map(l => ({ sec: l.sec, label: l.label.trim(), cur: r2(Number(l.cur) || 0), ytd: l.ytd === "" || l.ytd == null ? null : r2(Number(l.ytd)) }));
    const totals = {};
    for (const s of SECS) { const its = items.filter(i => i.sec === s); if (its.length) totals[s] = { cur: r2(its.reduce((a, i) => a + i.cur, 0)), ytd: r2(its.reduce((a, i) => a + (i.ytd || 0), 0)) }; }
    const S = s => totals[s] ? totals[s].cur : 0, SY = s => totals[s] ? totals[s].ytd : 0;
    const net = { cur: r2(S("earnings") - S("pretax") - S("posttax") - S("taxes")), ytd: r2(SY("earnings") - SY("pretax") - SY("posttax") - SY("taxes")) };
    const stub = { payDate: date, period: res.stub.period, kind, payRate: tpl.payRate || null, filing: tpl.filing || null, employer: tpl.employer || undefined, items, totals, net, source: "photo" };
    P().addStubs([stub]);
    if (current.thumb) URL.revokeObjectURL(current.thumb); current = null;
    $("review").hidden = true; $("review").innerHTML = "";
    const t = $("toast"); if (t) { t.hidden = false; t.className = "toast"; t.textContent = `Saved the ${P().nice(date)} stub from your photo.`; }
  }

  document.addEventListener("change", e => {
    if (e.target.id === "photoIn" || e.target.id === "photoIn2") { const f = e.target.files[0]; e.target.value = ""; handle(f); }
    else if (e.target.closest && e.target.closest("#review") && e.target.dataset.i != null) {
      const l = current.res.lines[+e.target.dataset.i], f = e.target.dataset.f;
      if (f === "label") l.label = e.target.value; else if (f === "sec") l.sec = e.target.value; else { const v = e.target.value.replace(/[^\d.\-]/g, ""); l[f] = v === "" ? null : Number(v); }
      if (f === "cur" || f === "ytd") { const prev = current.tpl.items.find(x => x.sec === l.sec && x.label === l.label); if (!l.isNew && prev && prev.ytd != null && current.res.checks.consecutive) { if (f === "cur") l.ytd = r2(prev.ytd + (l.cur || 0)); else if (l.ytd != null) l.cur = r2(l.ytd - prev.ytd); } }
      l.status = "derived"; l.note = "Edited by you"; renderReview();
    }
  });
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-rv]"); if (!b) return;
    const a = b.dataset.rv;
    if (a === "cancel") { $("review").hidden = true; $("review").innerHTML = ""; if (current && current.thumb) URL.revokeObjectURL(current.thumb); current = null; }
    else if (a === "save") save();
    else if (a === "ok") { const l = current.res.lines[+b.dataset.i]; if (l.status === "check") { l.status = "derived"; l.note = "Checked by you"; renderReview(); } }
    else if (a === "addline") {
      current.res.lines.push({ sec: "earnings", label: "New line", cur: 0, ytd: 0, status: "check", note: "Added by you", isNew: true, manual: true });
      renderReview();
    }
  });
})();
