/* V14.0.15 — Tính năng mới tách khỏi index.html (module client).
   Dùng các hàm thuần trong SHARED-CORE (computeCanonDiff, suggestCharacterCandidates, storyHealthReport, ...).
   Script thường (không phải ES module) nên dùng chung phạm vi toàn cục với index.html: state, persist, $ID, callAI... */
(function () {
  "use strict";
  const X = window.__XTA__, HOOKS = window.__XTA_HOOKS__;
  if (!X || !HOOKS) { console.warn("[features] thiếu cầu nối __XTA__ — bỏ qua tính năng V14.0.15"); return; }
  const { state, persist, escapeHtml, setStatus, showAlert, callAI, renderCharacters, renderLocations, newCharacter, genId } = X;
  const { computeCanonDiff, undoCanonDiffItem, suggestCharacterCandidates, storyHealthReport, deterministicConsistencyCheck, buildConsistencyPrompt, parseConsistencyResponse, STEP_LABELS } = X.core;
  const esc = (s) => escapeHtml(s);
  const safe = (fn) => { try { return fn(); } catch (e) { console.warn("[features]", e && e.message); } };

  /* ===== 1. Hậu kỳ đã thay đổi gì (Canon Diff) + hoàn tác ===== */
  function ensureDiffBox() {
    let box = document.getElementById("canonDiffBox");
    if (!box) {
      const q = document.getElementById("qualityBox");
      if (!q) return null;
      box = document.createElement("div"); box.id = "canonDiffBox"; box.className = "quality-box"; box.style.display = "none";
      q.parentNode.insertBefore(box, q.nextSibling);
      box.addEventListener("click", onDiffClick);
    }
    return box;
  }
  function currentChapter() { const i = state.currentChapterIndex; return i >= 0 ? state.chapters[i] : null; }
  const FIELD_VN = { tier: "hạng", age: "tuổi", gender: "giới tính", role: "vai trò", occupation: "nghề", position: "vị trí", faction: "phe", appearance: "ngoại hình", personality: "tính cách", goals: "mục tiêu", secret: "bí mật", weakness: "điểm yếu", fear: "nỗi sợ", knowledge: "hiểu biết", currentLocation: "đang ở", physicalState: "thể trạng", mentalState: "tâm lý", dead: "đã chết", lastAppearance: "xuất hiện gần nhất", relationships: "quan hệ", history: "lịch sử", maritalStatus: "hôn nhân", spouseName: "người phối ngẫu" };
  function renderCanonDiff() {
    const box = ensureDiffBox(); if (!box) return;
    const ch = currentChapter(), d = ch && ch.canonDiff;
    if (!d || !d.counts) { box.style.display = "none"; box.innerHTML = ""; return; }
    const chars = (d.characters || []);
    const added = chars.filter(x => x.kind === "added");
    const updated = chars.filter(x => x.kind === "updated" && (x.meaningful || 0) > 0);
    const presence = chars.filter(x => x.kind === "updated" && !(x.meaningful || 0)).length;
    const parts = [];
    if (added.length) parts.push("+" + added.length + " NV mới");
    if (updated.length) parts.push(updated.length + " NV cập nhật");
    if (presence) parts.push(presence + " NV ghi nhận có mặt");
    if (d.locations && d.locations.length) parts.push(d.locations.length + " địa điểm");
    if (d.items && d.items.length) parts.push(d.items.length + " vật phẩm");
    if (d.threads && d.threads.length) parts.push(d.threads.length + " thread");
    let h = '<details' + ((added.length || updated.length || (d.skipped || []).length) ? " open" : "") + '><summary style="cursor:pointer;font-weight:700;">🧾 Hậu kỳ đã thay đổi gì — ' + esc(parts.join(" · ") || "không có thay đổi") + '</summary><div style="margin-top:8px;font-size:13px;line-height:1.5;">';
    added.forEach(x => { h += '<div style="margin:4px 0;">➕ <b>' + esc(x.name) + '</b> <span class="hint">(mới · ' + esc(x.tier || "") + ')</span> <button class="btn btn-ghost btn-sm" data-cd-undo-add="' + esc(x.id || "") + '" data-cd-name="' + esc(x.name) + '">↶ Gỡ</button></div>'; });
    updated.forEach(x => {
      h += '<div style="margin:6px 0;">✏️ <b>' + esc(x.name) + '</b>';
      (x.changes || []).filter(c => c.field !== "lastAppearance" && !c.info).forEach(c => {
        h += '<div style="margin-left:18px;"><span class="hint">' + esc(FIELD_VN[c.field] || c.field) + ':</span> ' + (c.from ? '<s style="opacity:.6">' + esc(String(c.from).slice(0, 120)) + '</s> → ' : '') + esc(String(c.to).slice(0, 160))
          + (c.undone ? ' <span class="hint">(đã hoàn tác)</span>' : ' <button class="btn btn-ghost btn-sm" data-cd-undo="' + esc(x.id || "") + '" data-cd-name="' + esc(x.name) + '" data-cd-field="' + esc(c.field) + '">↶</button>') + '</div>';
      });
      h += '</div>';
    });
    const w = [];
    (d.locations || []).slice(0, 8).forEach(x => w.push("📍 " + esc(x.name))); (d.items || []).slice(0, 8).forEach(x => w.push("🎒 " + esc(x.name))); (d.threads || []).slice(0, 6).forEach(x => w.push("🧵 " + esc(String(x.name).slice(0, 60))));
    if (w.length) h += '<div class="hint" style="margin-top:6px;">' + w.join(" · ") + '</div>';
    if ((d.skipped || []).length) h += '<div class="hint" style="margin-top:8px;color:var(--amber,#e6b34a);"><b>AI đề xuất nhưng bị bỏ/hạ hạng:</b><br>' + d.skipped.map(esc).join("<br>") + '</div>';
    h += "</div></details>";
    box.innerHTML = h; box.style.display = "block";
  }
  function onDiffClick(e) {
    const b = e.target.closest("button"); if (!b) return;
    const ch = currentChapter(), d = ch && ch.canonDiff; if (!d) return;
    const name = b.getAttribute("data-cd-name"), id = b.getAttribute("data-cd-undo") || b.getAttribute("data-cd-undo-add");
    if (id === null) return;
    const item = (d.characters || []).find(x => (x.id && x.id === id) || x.name === name); if (!item) return;
    const isAdd = b.hasAttribute("data-cd-undo-add"), field = b.getAttribute("data-cd-field");
    const r = undoCanonDiffItem(state, item, isAdd ? undefined : field);
    if (r.ok) { if (isAdd) item.undone = true, d.characters = d.characters.filter(x => x !== item); else (item.changes.find(c => c.field === field) || {}).undone = true; persist(); safe(() => renderCharacters()); renderCanonDiff(); }
    setStatus((r.ok ? "↶ " : "⚠ ") + r.msg + ".", false);
  }

  /* ===== 2. Hộp thư nhân vật gợi ý ===== */
  let _sugKey = "", _sugCache = [];
  function knownNamesForSuggest() {
    const out = [];
    (state.characters || []).forEach(c => { if (c) { out.push(c.name); (c.aliases || []).forEach(a => out.push(a)); } });
    const mc = state.mainCharProfile; if (mc) { out.push(mc.name); (mc.aliases || []).forEach(a => out.push(a)); }
    (state.locations || []).forEach(x => x && out.push(x.name)); (state.items || []).forEach(x => x && out.push(x.name));
    (state.ignoredNameSuggestions || []).forEach(x => out.push(x));
    return out.filter(Boolean);
  }
  function computeSuggestions() {
    const chs = state.chapters || [], last = chs[chs.length - 1];
    const key = chs.length + ":" + (last ? String(last.text || "").length : 0) + ":" + (state.characters || []).length + ":" + (state.locations || []).length + ":" + (state.ignoredNameSuggestions || []).length;
    if (key !== _sugKey) { _sugKey = key; _sugCache = suggestCharacterCandidates(chs, knownNamesForSuggest(), { minCount: 3, max: 10 }); }
    return _sugCache;
  }
  function renderSuggestions() {
    const list = document.getElementById("charList"); if (!list) return;
    let box = document.getElementById("charSuggestBox");
    if (!box) { box = document.createElement("div"); box.id = "charSuggestBox"; box.style.cssText = "margin:8px 0;"; list.parentNode.insertBefore(box, list); box.addEventListener("click", onSuggestClick); }
    const sug = computeSuggestions();
    if (!sug.length) { box.innerHTML = ""; return; }
    box.innerHTML = '<details><summary style="cursor:pointer;font-weight:700;color:var(--purple);">📬 Gợi ý nhân vật chưa có trong Database (' + sug.length + ')</summary>'
      + '<div class="hint" style="margin:4px 0;">Tên riêng xuất hiện lặp lại trong truyện nhưng chưa có hồ sơ. Chỉ là gợi ý — bạn quyết định.</div>'
      + sug.map((s, i) => '<div style="border-top:1px solid var(--line);padding:6px 0;"><b>' + esc(s.name) + '</b> <span class="hint">' + s.count + ' lần · ' + s.chapters + ' chương (ch' + s.first + '–' + s.last + ')</span>'
        + '<div class="hint" style="font-style:italic;">…' + esc(s.sample) + '…</div>'
        + '<button class="btn btn-purple btn-sm" data-sg-add="' + i + '">＋ Nhân vật</button> <button class="btn btn-ghost btn-sm" data-sg-loc="' + i + '">📍 Địa điểm</button> <button class="btn btn-ghost btn-sm" data-sg-ign="' + i + '">✕ Bỏ qua</button></div>').join("") + '</details>';
  }
  function onSuggestClick(e) {
    const b = e.target.closest("button"); if (!b) return;
    const sug = computeSuggestions();
    const pick = (a) => { const i = b.getAttribute(a); return i === null ? null : sug[parseInt(i, 10)]; };
    let s;
    if ((s = pick("data-sg-add"))) {
      state.characters.push(newCharacter({ name: s.name, tier: "supporting", firstAppearance: s.first, lastAppearance: s.last }));
      persist(); renderCharacters(); setStatus("＋ Đã thêm “" + s.name + "” — hãy bấm 👤 Quét toàn truyện hoặc điền hồ sơ.", false);
    } else if ((s = pick("data-sg-loc"))) {
      state.locations = state.locations || []; state.locations.push({ id: genId(), name: s.name, description: "", status: "active", firstAppearance: s.first, lastAppearance: s.last });
      persist(); safe(() => renderLocations()); renderCharacters();
    } else if ((s = pick("data-sg-ign"))) {
      state.ignoredNameSuggestions = state.ignoredNameSuggestions || []; state.ignoredNameSuggestions.push(s.name); persist(); renderCharacters();
    }
  }

  /* ===== 3. Chi phí theo bước + model theo bước ===== */
  const STEP_MODEL_KEYS = ["post", "gate", "check", "hint"];
  function appendCostDetails() {
    const btn = document.getElementById("costClose"); if (!btn) return;
    const box = btn.parentNode, by = state.costByStep || {};
    const rows = Object.keys(STEP_LABELS).filter(k => by[k]).sort((a, b) => by[b].cost - by[a].cost);
    const total = rows.reduce((s, k) => s + by[k].cost, 0) || 1;
    let h = '<div id="stepCostBox" style="margin-top:14px;"><h4 style="margin:0 0 6px;">📊 Chi phí theo bước</h4>';
    h += rows.length ? '<table style="width:100%;font-size:13px;border-collapse:collapse;"><tr class="hint"><td>Bước</td><td>Lần gọi</td><td>Token vào/ra</td><td align="right">USD</td></tr>'
      + rows.map(k => '<tr><td>' + esc(STEP_LABELS[k]) + '</td><td>' + by[k].calls + '</td><td>' + Math.round(by[k].tokIn / 1000) + 'k / ' + Math.round(by[k].tokOut / 1000) + 'k</td><td align="right">$' + by[k].cost.toFixed(4) + ' <span class="hint">(' + Math.round(by[k].cost / total * 100) + '%)</span></td></tr>').join("") + '</table>'
      : '<div class="hint">Chưa có dữ liệu — sẽ hiện sau các lượt gọi AI tiếp theo.</div>';
    const sm = state.stepModels || {};
    h += '<h4 style="margin:12px 0 4px;">🎛️ Model riêng cho bước phụ</h4><div class="hint" style="margin-bottom:6px;">Để trống = dùng model chính. Model rẻ cho bước phụ giúp giảm chi phí; bước Viết luôn dùng model chính.</div>';
    h += STEP_MODEL_KEYS.map(k => '<div style="display:flex;gap:6px;align-items:center;margin:3px 0;"><span style="width:110px;font-size:13px;">' + esc(STEP_LABELS[k]) + '</span><input type="text" data-step-model="' + k + '" value="' + esc(sm[k] || "") + '" placeholder="(model chính)" style="flex:1;"/></div>').join("");
    h += '<div class="hint" style="margin-top:4px;">Hậu kỳ server và Quality Gate server cũng dùng cấu hình này.</div></div>';
    box.insertAdjacentHTML("beforeend", h);
    box.querySelectorAll("[data-step-model]").forEach(inp => inp.addEventListener("change", () => {
      state.stepModels = state.stepModels || {}; const v = inp.value.trim(); if (v) state.stepModels[inp.getAttribute("data-step-model")] = v; else delete state.stepModels[inp.getAttribute("data-step-model")];
      persist();
    }));
    const rb = document.getElementById("resetCostBtn"); if (rb) rb.addEventListener("click", () => { state.costByStep = {}; persist(); });
  }

  /* ===== 4 + 5. Sức khỏe truyện + Rà mâu thuẫn ===== */
  const SEV = { high: "🔴", medium: "🟠", low: "🟡" };
  function consistencyDue() { const r = state.consistencyReport; const n = (state.chapters || []).length; return n >= 10 && (!r || n - (r.chapterCount || 0) >= 10); }
  function healthHtml() {
    const r = storyHealthReport(state), det = deterministicConsistencyCheck(state), ai = state.consistencyReport;
    let h = '<h3 class="modal-title">🩺 Sức khỏe truyện</h3>';
    if (!r.chapters) return h + '<div class="hint">Chưa có chương nào.</div>';
    const alerts = r.alerts.slice(); if (consistencyDue()) alerts.push({ level: "info", text: "Đã ≥10 chương kể từ lần rà mâu thuẫn gần nhất — nên quét lại." });
    h += '<div class="cost-panel"><div class="item">Số chương<b>' + r.chapters + '</b></div><div class="item">Từ TB/chương<b>' + r.avgWords + '</b></div><div class="item">NV chương cuối<b>' + r.castLoad + '</b></div><div class="item">NV đã chết<b>' + r.dead + '</b></div></div>';
    if (alerts.length) h += '<div style="margin:10px 0;">' + alerts.map(a => '<div style="margin:3px 0;">' + (a.level === "warn" ? "⚠️" : "ℹ️") + " " + esc(a.text) + '</div>').join("") + '</div>';
    else h += '<div style="margin:10px 0;">✅ Chưa phát hiện vấn đề nổi bật.</div>';
    if (r.arc) h += '<div class="hint">Arc đang chạy: <b>' + esc(r.arc.name) + '</b> — ' + r.arc.done + ' chương' + (r.arc.pct !== null ? " / " + (r.arc.end - r.arc.start + 1) + " dự kiến (" + r.arc.pct + "%)" : "") + '</div>';
    const sc = r.scores.filter(x => x.score !== null);
    if (sc.length) h += '<div style="margin:10px 0;"><div class="hint">Điểm chất lượng ' + sc.length + ' chương gần nhất</div><div style="display:flex;align-items:flex-end;gap:4px;height:54px;">' + sc.map(x => '<div title="Ch' + x.chapter + ': ' + x.score + '" style="flex:1;background:' + (x.score >= 90 ? "var(--green,#4caf7d)" : x.score >= 75 ? "var(--amber,#e6b34a)" : "var(--red,#e5534b)") + ';height:' + Math.max(6, x.score * 0.54) + 'px;border-radius:3px 3px 0 0;"></div>').join("") + '</div></div>';
    const lst = (title, arr, fmt) => arr.length ? '<details style="margin:6px 0;"><summary style="cursor:pointer;">' + title + ' (' + arr.length + ')</summary><div class="hint" style="margin-left:12px;">' + arr.slice(0, 8).map(fmt).join("<br>") + '</div></details>' : "";
    h += lst("Nhân vật vắng lâu", r.absent, x => esc(x.name) + " [" + esc(x.tier) + "] — vắng " + x.gap + " chương (lần cuối ch" + x.last + ")");
    h += lst("Thread đang mở", r.openThreads, x => esc(x.desc) + (x.age !== null ? " <i>(" + x.age + " chương)</i>" : ""));
    h += lst("Foreshadowing chưa trả", r.staleForeshadowing, x => esc(x.desc) + " <i>(gieo ch" + x.planted + ")</i>");
    h += '<h4 style="margin:14px 0 6px;">🔎 Rà mâu thuẫn</h4>';
    const issues = det.concat(ai && ai.issues ? ai.issues : []);
    h += issues.length ? issues.map(i => '<div style="margin:4px 0;font-size:13px;">' + (SEV[i.severity] || "🟡") + " " + esc(i.description) + (i.chapters && i.chapters.length ? ' <span class="hint">(ch' + i.chapters.join(", ") + ')</span>' : "") + (i.evidence ? '<div class="hint" style="margin-left:18px;">' + esc(i.evidence) + '</div>' : "") + '</div>').join("") : '<div class="hint">Kiểm tra bằng code: không thấy mâu thuẫn.</div>';
    h += '<div class="hint" style="margin-top:6px;">' + (ai ? "Lần quét AI gần nhất: sau " + ai.chapterCount + " chương." : "Chưa quét bằng AI.") + ' Quét AI dùng tóm tắt chương nên tốn ít token.</div>';
    h += '<button class="btn btn-purple" id="consistencyScanBtn" style="margin-top:8px;">🤖 Quét mâu thuẫn bằng AI</button>';
    return h;
  }
  function openHealth() {
    const overlay = document.createElement("div"); overlay.className = "modal-overlay";
    const box = document.createElement("div"); box.className = "modal-box"; box.style.maxWidth = "560px"; box.style.maxHeight = "86vh"; box.style.overflowY = "auto";
    const paint = () => { box.innerHTML = '<div class="modal-close" id="healthClose">×</div>' + healthHtml(); box.querySelector("#healthClose").onclick = () => overlay.remove(); const sb = box.querySelector("#consistencyScanBtn"); if (sb) sb.onclick = scan; };
    const scan = async () => {
      const sb = box.querySelector("#consistencyScanBtn"); if (X.generating) { setStatus("Đang bận, đợi xong rồi quét.", true); return; }
      if (!(state.chapters || []).some(c => c && c.summary)) { showAlert("Chưa có tóm tắt chương để rà. Hãy chạy hậu kỳ trước."); return; }
      sb.disabled = true; sb.textContent = "Đang quét…";
      try {
        const r = await callAI(buildConsistencyPrompt(state), { maxTokens: 2600, temperature: 0.1 });
        state.consistencyReport = { at: Date.now(), chapterCount: state.chapters.length, issues: parseConsistencyResponse(r.text) };
        persist();
      } catch (err) { setStatus("⚠ Quét mâu thuẫn lỗi: " + (err && err.message), false); }
      paint();
    };
    overlay.appendChild(box); document.body.appendChild(overlay); overlay.onclick = e => { if (e.target === overlay) overlay.remove(); }; paint();
  }
  function injectHealthButton() {
    const cost = document.getElementById("costBtn"); if (!cost || document.getElementById("healthBtn")) return;
    const b = document.createElement("button"); b.className = "icon-btn"; b.id = "healthBtn"; b.title = "Sức khỏe truyện"; b.textContent = "🩺";
    cost.parentNode.insertBefore(b, cost); b.addEventListener("click", openHealth);
    refreshHealthBadge();
  }
  function refreshHealthBadge() {
    const b = document.getElementById("healthBtn"); if (!b) return;
    const n = safe(() => storyHealthReport(state).alerts.filter(a => a.level === "warn").length + (consistencyDue() ? 1 : 0)) || 0;
    b.textContent = n ? "🩺" + n : "🩺";
  }

  /* ===== Gắn vào vòng đời app (hook do index.html bắn) ===== */
  function init() {
    injectHealthButton();
    HOOKS.on("chars", renderSuggestions);
    HOOKS.on("chapter", () => { renderCanonDiff(); refreshHealthBadge(); });
    HOOKS.on("all", () => { renderSuggestions(); renderCanonDiff(); refreshHealthBadge(); });
    HOOKS.on("cost", () => setTimeout(() => safe(appendCostDetails), 0));
    safe(renderSuggestions); safe(renderCanonDiff);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.__XTA_FEATURES__ = { renderCanonDiff, renderSuggestions, openHealth, computeSuggestions };
})();
