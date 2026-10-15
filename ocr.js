/* Paycheck X-Ray: turn OCR words from a stub photo into a stub, using the previous stub as a template.
   Pure functions; runs in the browser and in Node for testing. */
(function (root) {
  "use strict";
  const SECS = ["earnings", "taxable", "memo", "pretax", "posttax", "taxes"];
  const r2 = n => Math.round(n * 100) / 100;
  const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const t = new Date(y, m - 1, d + n); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); };
  const toISO = s => { const [m, d, y] = s.split("/").map(Number); return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); };

  /* A money-looking token and the values it might stand for ("$" is often read as 5, S or 8). */
  function moneyToken(w) {
    const raw = String(w.text || "").trim();
    const t = raw.replace(/[^\d$S§,.()\-]/g, "");
    if (!/\d[.,]\d{2}\)?$/.test(t)) return null;
    const hasDollar = /^\(?\$/.test(t);
    const neg = /^\(|^-/.test(t);
    let body = t.replace(/^[(\-$S§]+/, "").replace(/\)$/, "");
    if (!/^\d/.test(body)) return null;
    const norm = s => parseFloat(s.replace(/[.,](?=\d{2}$)/, "D").replace(/[.,]/g, "").replace("D", "."));
    const cands = [norm(body)];
    if (!hasDollar && /^[58]/.test(body) && body.replace(/[^\d]/g, "").length >= 4) cands.push(norm(body.slice(1)));
    if (!hasDollar && /^[S§]/.test(t)) {/* already stripped */}
    if (cands.some(v => !isFinite(v))) return null;
    const b = w.bbox || w.b;
    return { raw, hasDollar, cands: cands.map(v => neg ? -v : v), x1: b.x1, x0: b.x0, y: (b.y0 + b.y1) / 2, h: b.y1 - b.y0 };
  }

  /* Two right-aligned amount columns: this check (left) and year to date (right). */
  function findColumns(toks) {
    const xs = toks.filter(t => t.hasDollar).map(t => t.x1).sort((a, b) => a - b);
    if (xs.length < 4) return null;
    let c1 = xs[0], c2 = xs[xs.length - 1];
    for (let it = 0; it < 20; it++) {
      const a = [], b = [];
      for (const x of xs) (Math.abs(x - c1) <= Math.abs(x - c2) ? a : b).push(x);
      if (!a.length || !b.length) break;
      const med = arr => arr[Math.floor(arr.length / 2)];
      c1 = med(a); c2 = med(b);
    }
    return c1 < c2 ? [c1, c2] : [c2, c1];
  }

  /* Template sequence for a column, in the stub's top-to-bottom order. */
  function templateSeq(tpl, col, curTpl) {
    const seq = [];
    const cT = curTpl || tpl;
    const curOf = (sec, label) => { const i = cT.items.find(x => x.sec === sec && x.label === label); return i ? (i.cur || 0) : 0; };
    const totCurOf = sec => { const t = cT.totals && cT.totals[sec]; return t && t.cur != null ? t.cur : cT.items.filter(x => x.sec === sec).reduce((a, i) => a + (i.cur || 0), 0); };
    for (const sec of SECS) {
      const items = tpl.items.filter(i => i.sec === sec);
      const tot = tpl.totals && tpl.totals[sec];
      if (!items.length && !tot) continue;
      const totCur = totCurOf(sec);
      const totYtd = tot && tot.ytd != null ? tot.ytd : items.reduce((a, i) => a + (i.ytd || 0), 0);
      seq.push({ key: "T:" + sec, sec, total: true, prevCur: totCur || 0, prevYtd: totYtd || 0 });
      for (const i of items) seq.push({ key: sec + ":" + i.label, sec, label: i.label, prevCur: curOf(sec, i.label), prevYtd: i.ytd != null ? i.ytd : 0 });
    }
    const n0 = tpl.net || { cur: 0, ytd: 0 }, n = { cur: (cT.net || n0).cur, ytd: n0.ytd };
    if (col === "cur") { seq.push({ key: "NET", sec: "net", prevCur: n.cur || 0, prevYtd: n.ytd || 0 }); seq.push({ key: "NET2", sec: "net", prevCur: n.cur || 0, prevYtd: n.ytd || 0 }); }
    else seq.push({ key: "NET", sec: "net", prevCur: n.cur || 0, prevYtd: n.ytd || 0 });
    return seq;
  }

  /* Align observed tokens (top to bottom) to the template sequence. */
  function align(obs, seq, col, curSeen) {
    const exp = t => col === "cur" ? t.prevCur : t.prevYtd + (curSeen && curSeen.has(t.key) ? curSeen.get(t.key) : t.prevCur);
    const cost = (o, t) => {
      let best = { c: 4, v: o.cands[0] };
      for (const v of o.cands) {
        const e = exp(t); let c;
        if (Math.abs(v - e) < 0.015) c = 0;
        else if (col === "ytd" && Math.abs(v - t.prevYtd - t.prevCur) < 0.015) c = 0.1;
        else if (col === "ytd" && v >= t.prevYtd - 0.015 && v - t.prevYtd <= Math.max(t.prevCur * 4, 600) + 0.015) c = 0.55 + Math.min(0.4, Math.abs(v - e) / Math.max(e * 0.5, 200));
        else if (col === "cur" && e > 0 && Math.abs(v - e) / e < 0.6) c = 0.8;
        else if (col === "cur" && e === 0 && v > 0 && v < 20000) c = 0.9;
        else c = 3;
        if (!o.hasDollar && v !== o.cands[0]) c += 0.05;
        if (c < best.c) best = { c, v };
      }
      return best;
    };
    const skipT = t => col === "cur" ? (t.prevCur === 0 ? 0.15 : 1.1) : 1.2;
    const skipO = 1.0;
    const n = obs.length, m = seq.length;
    const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    const P = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
    for (let i = 1; i <= n; i++) { D[i][0] = D[i - 1][0] + skipO; P[i][0] = 1; }
    for (let j = 1; j <= m; j++) { D[0][j] = D[0][j - 1] + skipT(seq[j - 1]); P[0][j] = 2; }
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      const a = D[i - 1][j - 1] + cost(obs[i - 1], seq[j - 1]).c, b = D[i - 1][j] + skipO, c = D[i][j - 1] + skipT(seq[j - 1]);
      if (a <= b && a <= c) { D[i][j] = a; P[i][j] = 0; } else if (b <= c) { D[i][j] = b; P[i][j] = 1; } else { D[i][j] = c; P[i][j] = 2; }
    }
    const map = new Map(), extra = [];
    let i = n, j = m;
    while (i > 0 || j > 0) {
      const p = i > 0 && j > 0 ? P[i][j] : (i > 0 ? 1 : 2);
      if (p === 0) { const k = cost(obs[i - 1], seq[j - 1]); if (k.c < 3) map.set(seq[j - 1].key, { v: k.v, c: k.c }); else extra.push(obs[i - 1]); i--; j--; }
      else if (p === 1) { extra.push(obs[i - 1]); i--; }
      else j--;
    }
    return { map, extra };
  }

  function headerInfo(text, tpl) {
    const flat = String(text || "").replace(/\s+/g, " ");
    const pd = flat.match(/Pay\s*Date:?[^0-9]{0,40}(\d{1,2}\/\d{1,2}\/\d{4})/i) || flat.match(/•\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*•/) || flat.match(/[«=•·]\s*(\d{1,2}\/\d{1,2}\/20\d\d)\s*[«=•·]/);
    const pp = flat.match(/Pay\s*Period:?[^0-9]{0,40}(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    const kind = /Additional/i.test(flat) ? "Additional" : "Normal";
    const all = [...flat.matchAll(/(\d{1,2}\/\d{1,2}\/20\d\d)/g)].map(m => toISO(m[1]));
    let payDate = null, dateGuessed = false;
    if (tpl) {
      const next = addDays(tpl.payDate, 14);
      if (kind === "Additional" && all.includes(tpl.payDate)) payDate = tpl.payDate;
      else if (all.includes(next)) payDate = next;
    }
    if (!payDate && pd) { const c = toISO(pd[1]); if (!tpl || c > tpl.payDate || (kind === "Additional" && c === tpl.payDate)) payDate = c; }
    if (!payDate && tpl) { payDate = addDays(tpl.payDate, 14); dateGuessed = true; }
    return { payDate, period: pp ? [toISO(pp[1]), toISO(pp[2])] : null, kind, dateGuessed };
  }

  /* Main entry. words: [{text,bbox:{x0,y0,x1,y1}}], text: full OCR text, tpl: previous stub. */
  function parse(words, text, tpl, curTpl) {
    if (!tpl) return { error: "Add at least one stub by paste or backup first, so the photo has a format to follow." };
    const head = headerInfo(text, tpl);
    let toks = words.map(moneyToken).filter(Boolean);
    const earnWord = words.find(w => /^Earnings$/i.test(String(w.text).trim()));
    if (earnWord) { const yb = (earnWord.bbox || earnWord.b); toks = toks.filter(t => t.y >= yb.y0 - (yb.y1 - yb.y0) * 1.5); }
    const cols = findColumns(toks);
    if (!cols) return { error: "Couldn't find the amount columns. Try a straighter, closer photo of just the statement." };
    const tol = Math.max(30, (cols[1] - cols[0]) * 0.22);
    const curObs = [], ytdObs = [];
    for (const t of toks) {
      const d1 = Math.abs(t.x1 - cols[0]), d2 = Math.abs(t.x1 - cols[1]);
      if (Math.min(d1, d2) > tol) continue;
      (d1 < d2 ? curObs : ytdObs).push(t);
    }
    curObs.sort((a, b) => a.y - b.y); ytdObs.sort((a, b) => a.y - b.y);
    const curSeqT = templateSeq(tpl, "cur", head.kind === "Additional" ? null : curTpl);
    if (head.kind === "Additional") curSeqT.forEach(t => t.prevCur = 0);
    const curA = align(curObs, curSeqT, "cur");
    const curSeen = new Map([...curA.map].map(([k, o]) => [k, o.v]));
    const ytdSeqT = templateSeq(tpl, "ytd", head.kind === "Additional" ? null : curTpl);
    if (head.kind === "Additional") ytdSeqT.forEach(t => t.prevCur = 0);
    const ytdA = align(ytdObs, ytdSeqT, "ytd", curSeen);

    const consecutive = head.payDate === addDays(tpl.payDate, 14) || (head.payDate === tpl.payDate && head.kind === "Additional");
    const lines = [];
    for (const sec of SECS) for (const i of tpl.items.filter(x => x.sec === sec)) {
      const key = sec + ":" + i.label, y = ytdA.map.get(key), c = curA.map.get(key);
      const prevY = i.ytd || 0;
      const L = { sec, label: i.label, cur: null, ytd: null, status: "check", note: "" };
      if (y && consecutive) {
        L.ytd = y.v; L.cur = r2(y.v - prevY);
        const ci = (head.kind === "Additional" ? null : (curTpl || tpl).items.find(x => x.sec === sec && x.label === i.label));
        const expCur = head.kind === "Additional" ? 0 : (ci ? ci.cur || 0 : 0);
        if (c && Math.abs(c.v - L.cur) < 0.015) L.status = "ok";
        else if (Math.abs(L.cur - expCur) < 0.015) L.status = "ok";
        else { L.status = "check"; L.note = "Changed from last check; confirm"; L.changed = true; }
      } else if (c && consecutive) { L.cur = c.v; L.ytd = r2(prevY + c.v); L.status = "derived"; }
      else if (y) { const ci = (curTpl || tpl).items.find(x => x.sec === sec && x.label === i.label); L.ytd = y.v; L.cur = c ? c.v : (ci ? ci.cur || 0 : 0); L.status = c ? "derived" : "check"; if (!c) L.note = "This check's amount assumed same as last time"; }
      else if (c) { L.cur = c.v; L.ytd = null; L.status = "check"; L.note = "Year-to-date not read"; }
      else { const ci = (curTpl || tpl).items.find(x => x.sec === sec && x.label === i.label); L.cur = head.kind === "Additional" ? 0 : (ci ? ci.cur || 0 : 0); L.ytd = consecutive ? r2(prevY + L.cur) : null; L.status = "check"; L.note = "Not read from photo; assumed same as last check"; }
      lines.push(L);
    }

    // New lines not on the previous stub: an unmatched year-to-date amount that makes a section add up.
    const W = Math.max(...words.map(w => (w.bbox || w.b).x1), 1);
    const totY = {}; for (const sec of SECS) { const o = ytdObs.find(t => { const m = ytdA.map.get("T:" + sec); return m && t.cands.includes(m.v); }); if (o) totY[sec] = o.y; }
    const secOfY = y => { let best = null; for (const sec of SECS) if (totY[sec] != null && totY[sec] <= y + 4) best = sec; return best; };
    const HDR = /^(Earnings|Taxable|Benefits|Memo|Information|Pre-?Tax|Deductions|Taxes|Net|Pay)$/i;
    const labelAt = y => {
      const lw = words.map(w => ({ w, b: w.bbox || w.b })).filter(o => o.b.x1 < W * 0.36 && /[A-Za-z]/.test(o.w.text) && Math.abs((o.b.y0 + o.b.y1) / 2 - y) < 80)
        .map(o => ({ t: o.w.text, x: o.b.x0, cy: (o.b.y0 + o.b.y1) / 2, h: o.b.y1 - o.b.y0 })).sort((p, q) => p.cy - q.cy);
      const rows = [];
      for (const o of lw) { const r = rows[rows.length - 1]; if (r && Math.abs(o.cy - r.cy) < Math.max(6, o.h * 0.5)) { r.ws.push(o); r.cy = (r.cy * (r.ws.length - 1) + o.cy) / r.ws.length; } else rows.push({ cy: o.cy, ws: [o] }); }
      const cand = rows.map(r => ({ d: Math.abs(r.cy - y), txt: r.ws.sort((p, q) => p.x - q.x).map(o => o.t).filter(t => !HDR.test(t)).join(" ").replace(/[^A-Za-z0-9&+/ \-]/g, "").trim() })).filter(c => c.txt.length > 1).sort((p, q) => p.d - q.d);
      return cand.length ? cand[0].txt : "";
    };
    for (const ex of ytdA.extra) {
      const sec = secOfY(ex.y); if (!sec || sec === "net") continue;
      const ty = ytdA.map.get("T:" + sec); if (!ty) continue;
      const ls = lines.filter(l => l.sec === sec);
      const sumY = ls.reduce((a, l) => a + (l.ytd || 0), 0);
      const v = ex.cands.find(c => Math.abs(sumY + c - ty.v) < 0.015);
      if (v == null) continue;
      const cx = curA.extra.find(t => t.cands.includes(v) && Math.abs(t.y - ex.y) < 120);
      const name = labelAt(cx ? cx.y : ex.y) || "New line";
      const idx = lines.lastIndexOf(ls[ls.length - 1]);
      lines.splice(idx + 1, 0, { sec, label: name, cur: consecutive ? v : (cx ? v : 0), ytd: v, status: "check", note: name === "New line" ? "New on this stub; name it" : "New on this stub; confirm the name", isNew: true });
    }

    // Section totals: verify, and solve a single unknown line per section from the observed total.
    const totals = {}, sectionOk = {};
    for (const sec of SECS) {
      const ls = lines.filter(l => l.sec === sec); if (!ls.length) continue;
      const ty = ytdA.map.get("T:" + sec), tc = curA.map.get("T:" + sec);
      const obsY = ty ? ty.v : null, obsC = tc ? tc.v : null;
      const unk = ls.filter(l => l.status === "check");
      const pre = r2(ls.reduce((a, l) => a + (l.ytd || 0), 0));
      if (obsY != null && Math.abs(obsY - pre) < 0.015) ls.forEach(l => { if (l.status === "check" && l.ytd != null && l.changed) { l.status = "derived"; l.note = "Changed from last check; confirmed by the section total"; } });
      if (unk.length === 1 && obsY != null && consecutive && !unk[0].isNew) {
        const u = unk[0], prev = tpl.items.find(i => i.sec === sec && i.label === u.label);
        const rest = ls.filter(l => l !== u).reduce((a, l) => a + (l.ytd || 0), 0);
        const y2 = r2(obsY - rest), c2 = r2(y2 - (prev && prev.ytd || 0));
        if (c2 >= 0 && y2 >= 0) { u.ytd = y2; u.cur = c2; u.status = "derived"; u.note = "Solved from the section total"; }
      }
      const sumY = r2(ls.reduce((a, l) => a + (l.ytd || 0), 0)), sumC = r2(ls.reduce((a, l) => a + (l.cur || 0), 0));
      totals[sec] = { cur: obsC != null ? obsC : sumC, ytd: obsY != null ? obsY : sumY };
      const yOk = obsY == null ? null : Math.abs(obsY - sumY) < 0.015;
      const cOk = obsC == null ? null : Math.abs(obsC - sumC) < 0.015;
      sectionOk[sec] = { ytd: yOk, cur: cOk, sumY, sumC, obsY, obsC, pass: yOk === true || cOk === true || (yOk == null && cOk == null) };
      if (yOk || cOk) ls.forEach(l => { if (l.status === "check" && l.ytd != null) { l.status = "derived"; l.note = "Confirmed by the section total"; } });
    }
    const S = sec => lines.filter(l => l.sec === sec).reduce((a, l) => a + (l.cur || 0), 0);
    const SY = sec => lines.filter(l => l.sec === sec).reduce((a, l) => a + (l.ytd || 0), 0);
    const netCalc = r2(S("earnings") - S("pretax") - S("posttax") - S("taxes"));
    const nc = curA.map.get("NET") || curA.map.get("NET2"), ny = ytdA.map.get("NET");
    const prevNetY = tpl.net && tpl.net.ytd || 0;
    const netYCalc = r2(SY("earnings") - SY("pretax") - SY("posttax") - SY("taxes"));
    const net = { cur: nc ? nc.v : netCalc, ytd: ny ? ny.v : (consecutive ? r2(prevNetY + netCalc) : netYCalc) };
    const checks = {
      sections: sectionOk,
      netMatches: Math.abs(net.cur - netCalc) < 0.015,
      netYtdMatches: ny ? Math.abs(ny.v - netYCalc) < 0.015 : null,
      unread: lines.filter(l => l.status === "check").length,
      extras: ytdA.extra.length + curA.extra.length,
      consecutive
    };
    const stub = {
      payDate: head.payDate, period: head.period || (consecutive && head.kind !== "Additional" ? [addDays(tpl.period ? tpl.period[0] : tpl.payDate, 14), addDays(tpl.period ? tpl.period[1] : tpl.payDate, 14)] : null),
      kind: head.kind, payRate: tpl.payRate || null, filing: tpl.filing || null,
      items: lines.map(l => ({ sec: l.sec, label: l.label, cur: l.cur == null ? 0 : l.cur, ytd: l.ytd })),
      totals, net, source: "photo"
    };
    return { stub, lines, checks, head, template: tpl.payDate };
  }

  const api = { parse, moneyToken, findColumns, templateSeq, align, headerInfo };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PXR_OCR = api;
})(typeof self !== "undefined" ? self : this);
