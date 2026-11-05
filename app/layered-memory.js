/* V14.6 — layered novel memory. Uses the app bridge; summaries are immutable snapshots. */
(function () {
  "use strict";
  const X = window.__XTA__;
  if (!X) { console.warn("[layered-memory] missing app bridge"); return; }
  const { state, persist, setStatus, callAI } = X;
  const { buildLayeredMemoryRanges, upsertFrozenLayerSummary } = X.core;
  const pad = n => String(n).padStart(6, "0");

  function ensureMemory() {
    if (!state.layeredMemory || typeof state.layeredMemory !== "object") state.layeredMemory = {};
    const m = state.layeredMemory;
    m.schemaVersion = 1;
    m.config = Object.assign({ chunkSize: 4, chunksPerArc: 5, arcsPerVolume: 3 }, m.config || {});
    m.summaries = Object.assign({ L1: [], L2: [], L3: [], L4: [], L5: [] }, m.summaries || {});
    ["L1", "L2", "L3", "L4", "L5"].forEach(k => { if (!Array.isArray(m.summaries[k])) m.summaries[k] = []; });
    if (!Array.isArray(m.history)) m.history = [];
    return m;
  }
  function validRecords(layer) {
    return (ensureMemory().summaries[layer] || []).filter(x => x && x.frozen === true && !x.stale);
  }
  function renderLayeredMemoryStats() {
    const el = document.getElementById("layeredMemoryStats"); if (!el) return;
    const m = ensureMemory(), ranges = buildLayeredMemoryRanges((state.chapters || []).length, m.config);
    const count = k => validRecords(k).length;
    const pending = [ranges.chunks, ranges.arcs, ranges.volumes].map((a, i) => a.filter(x => x.complete && !validRecords(["L2", "L3", "L4"][i]).some(y => y.id === x.id || String(y.id).indexOf(x.id + "-r") === 0)).length);
    const last = m.lastBuildReport;
    el.textContent = "L0 · chương gốc: " + (state.chapters || []).length +
      "\nL1 · summary đã đóng băng: " + count("L1") + "/" + (state.chapters || []).length +
      "\nL2 · nhóm 4 chương: " + count("L2") + (pending[0] ? " · còn " + pending[0] + " nhóm hoàn chỉnh" : "") +
      "\nL3 · arc 20 chương: " + count("L3") + (pending[1] ? " · còn " + pending[1] + " arc" : "") +
      "\nL4 · volume 60 chương: " + count("L4") + (pending[2] ? " · còn " + pending[2] + " volume" : "") +
      "\nL5 · bản tổng hợp toàn truyện: " + count("L5") + " (lịch sử: " + m.history.length + ")" +
      (last ? "\nLần đồng bộ: " + new Date(last.at).toLocaleString() + " · tạo " + (last.built || 0) + " · lỗi/thiếu " + (last.failed || 0) : "");
  }
  function latestLayerRecord(list, baseId) {
    return (list || []).filter(x => x && x.frozen === true && !x.stale && (x.id === baseId || String(x.id).indexOf(baseId + "-r") === 0))
      .sort((a, b) => (Number(b.revision) || 1) - (Number(a.revision) || 1) || (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))[0] || null;
  }
  function newLayerRevisionId(list, baseId) {
    const n = (list || []).filter(x => x && (x.id === baseId || String(x.id).indexOf(baseId + "-r") === 0)).length;
    return n ? baseId + "-r" + (n + 1) : baseId;
  }
  async function createLayerSummary(level, range, sources) {
    const m = ensureMemory(), list = m.summaries[level], old = latestLayerRecord(list, range.id);
    if (old) return old;
    const text = (sources || []).map(x => "[" + (x.id || "nguồn") + "; ch" + (x.startChapter || x.chapterNumber || "?") + "–" + (x.endChapter || x.chapterNumber || "?") + "]\n" + String(x.summary || "").trim()).filter(x => /\S/.test(x)).join("\n\n").slice(0, 52000);
    if (!text.trim()) throw new Error(level + " thiếu dữ liệu tầng dưới");
    const targetWords = level === "L2" ? 220 : level === "L3" ? 360 : level === "L4" ? 520 : 700;
    const prompt = [
      "TẠO " + level + " MEMORY CHO TIỂU THUYẾT TIẾNG VIỆT (chỉ tóm tắt nguồn; không viết tiếp truyện).",
      "Phạm vi chương " + range.startChapter + "–" + range.endChapter + ". Viết khoảng " + targetWords + " từ, gọn và giàu dữ kiện.",
      "Giữ tên riêng, quan hệ, thế lực, địa điểm, vật phẩm, trạng thái sống/chết, mốc thời gian, nguyên nhân–hệ quả, điều mỗi nhân vật đã biết và tình tiết còn mở. Đánh dấu điều đã chốt và câu hỏi chưa giải quyết. Không bịa, không hợp nhất danh tính, không tự đóng thread/foreshadowing. Chỉ trả tóm tắt tiếng Việt, không JSON/markdown.",
      "NGUỒN TẦNG DƯỚI:\n" + text
    ].join("\n\n");
    const response = await callAI(prompt, { maxTokens: level === "L5" ? 2200 : 1500, temperature: 0.15 });
    const summary = String(response && response.text || "").replace(/<think(?:ing)?[\s>][\s\S]*?<\/think(?:ing)?>/gi, "").trim();
    if (!summary) throw new Error("AI trả về summary rỗng cho " + level);
    const id = level === "L5" ? range.id : newLayerRevisionId(list, range.id);
    const record = Object.assign({}, range, { id, layer: level, summary, sourceIds: (sources || []).map(x => x.id), frozen: true, stale: false, createdAt: Date.now(), revision: level === "L5" ? (Number(range.revision) || list.length + 1) : list.filter(x => x && String(x.id).indexOf(range.id) === 0).length + 1 });
    if (level === "L5") {
      const prior = list.filter(x => x && x.frozen && !x.stale).slice(-1)[0];
      if (prior) m.history.push(Object.assign({}, prior, { archivedAt: Date.now() }));
      m.summaries.L5 = [record];
    } else m.summaries[level] = upsertFrozenLayerSummary(list, record);
    persist(); renderLayeredMemoryStats();
    return record;
  }
  async function buildLayeredMemorySummaries(options) {
    const opts = options || {}, m = ensureMemory(), chapters = Array.isArray(state.chapters) ? state.chapters : [];
    const through = Math.max(0, Math.min(chapters.length, Number(opts.throughChapter) || chapters.length));
    const onlyBoundary = opts.onlyBoundary === true, result = { built: 0, failed: 0 }, failures = [];
    if (!through) { renderLayeredMemoryStats(); return result; }
    const setL1 = async chapterNumber => {
      const ch = chapters[chapterNumber - 1]; if (!ch) return null;
      const id = "L1-" + pad(chapterNumber), old = m.summaries.L1.find(x => x && x.id === id && x.frozen === true && !x.stale);
      if (old) return old;
      let summary = String(ch.summary || "").trim();
      if (!summary && ch.text) {
        const content = String(ch.text);
        const source = content.length > 35000 ? content.slice(0, 25000) + "\n[...đoạn giữa lược... ]\n" + content.slice(-10000) : content;
        const r = await callAI("TÓM TẮT L1 CHƯƠNG " + chapterNumber + " (250–350 từ tiếng Việt). Giữ trình tự, nhân vật, sự kiện, nguyên nhân/hệ quả, thời gian và tình tiết còn mở. Chỉ dựa vào chương, không thêm dữ kiện. Chỉ trả tóm tắt.\n\nTIÊU ĐỀ: " + (ch.title || "") + "\n\n" + source, { maxTokens: 1000, temperature: 0.15 });
        summary = String(r && r.text || "").trim(); if (summary) ch.summary = summary;
      }
      if (!summary) return null;
      const rec = { id, layer: "L1", chapterNumber, startChapter: chapterNumber, endChapter: chapterNumber, summary, sourceIds: [String(ch.id || "chapter-" + chapterNumber)], frozen: true, stale: false, createdAt: Date.now() };
      m.summaries.L1 = upsertFrozenLayerSummary(m.summaries.L1, rec); persist(); return rec;
    };
    const ranges = buildLayeredMemoryRanges(through, m.config);
    const l1Numbers = onlyBoundary ? [through] : Array.from({ length: through }, (_, i) => i + 1);
    for (const n of l1Numbers) {
      try { const rec = await setL1(n); if (rec) result.built++; else { result.failed++; failures.push("L1 ch" + n + ": thiếu summary"); } }
      catch (e) { result.failed++; failures.push("L1 ch" + n + ": " + String(e.message || e)); }
    }
    const process = r => r.complete && (!onlyBoundary || r.endChapter === through);
    for (const range of ranges.chunks.filter(process)) {
      if (latestLayerRecord(m.summaries.L2, range.id)) continue;
      const sources = [];
      for (let n = range.startChapter; n <= range.endChapter; n++) {
        let rec = m.summaries.L1.find(x => x && x.chapterNumber === n && x.frozen && !x.stale);
        if (!rec) { try { rec = await setL1(n); } catch (e) { failures.push("L1 ch" + n + ": " + String(e.message || e)); } } // V14.7.1: một chương lỗi không được làm sập cả lượt xây
        if (rec) sources.push({ id: rec.id, startChapter: n, endChapter: n, summary: rec.summary });
      }
      if (sources.length < range.endChapter - range.startChapter + 1) { result.failed++; failures.push(range.id + ": thiếu L1 của " + (range.endChapter - range.startChapter + 1 - sources.length) + " chương — chưa đóng băng L2 để tránh khóa bản tóm tắt thiếu"); continue; }
      try { if (await createLayerSummary("L2", range, sources)) result.built++; }
      catch (e) { result.failed++; failures.push(range.id + ": " + String(e.message || e)); }
    }
    for (const range of ranges.arcs.filter(process)) {
      if (latestLayerRecord(m.summaries.L3, range.id)) continue;
      const sources = range.chunkIds.map(id => latestLayerRecord(m.summaries.L2, id)).filter(Boolean);
      if (sources.length < range.chunkIds.length) { result.failed++; failures.push(range.id + ": thiếu " + (range.chunkIds.length - sources.length) + " L2 — chưa đóng băng L3"); continue; }
      try { if (await createLayerSummary("L3", range, sources)) result.built++; }
      catch (e) { result.failed++; failures.push(range.id + ": " + String(e.message || e)); }
    }
    for (const range of ranges.volumes.filter(process)) {
      if (latestLayerRecord(m.summaries.L4, range.id)) continue;
      const sources = range.arcIds.map(id => latestLayerRecord(m.summaries.L3, id)).filter(Boolean);
      if (sources.length < range.arcIds.length) { result.failed++; failures.push(range.id + ": thiếu " + (range.arcIds.length - sources.length) + " L3 — chưa đóng băng L4"); continue; }
      try { if (await createLayerSummary("L4", range, sources)) result.built++; }
      catch (e) { result.failed++; failures.push(range.id + ": " + String(e.message || e)); }
    }
    const volumes = validRecords("L4").sort((a, b) => a.endChapter - b.endChapter);
    const latestL5 = validRecords("L5").slice(-1)[0];
    const shouldBuildL5 = volumes.length && (opts.regenerateL5 || (!onlyBoundary && (!latestL5 || latestL5.sourceVolumeCount < volumes.length)) || (onlyBoundary && volumes[volumes.length - 1].endChapter === through && (!latestL5 || latestL5.sourceVolumeCount < volumes.length)));
    if (shouldBuildL5) {
      const sources = latestL5 && !opts.regenerateL5 ? [Object.assign({}, latestL5, { id: "L5-prior", startChapter: 1 }), ...volumes.slice(latestL5.sourceVolumeCount || 0)] : volumes;
      const version = Number(latestL5 && latestL5.revision || 0) + 1;
      try { if (await createLayerSummary("L5", { id: "L5-global-v" + version, startChapter: 1, endChapter: volumes[volumes.length - 1].endChapter, complete: true, sourceVolumeCount: volumes.length, revision: version }, sources)) result.built++; }
      catch (e) { result.failed++; failures.push("L5: " + String(e.message || e)); }
    }
    m.lastBuildReport = { at: Date.now(), throughChapter: through, built: result.built, failed: result.failed, failures: failures.slice(0, 20) };
    persist(); renderLayeredMemoryStats();
    if (failures.length) setStatus("Memory L0–L5 đồng bộ một phần: " + result.built + " tạo, " + result.failed + " lỗi/thiếu. " + failures.slice(0, 2).join(" | "), false);
    else setStatus("Đã đồng bộ bộ nhớ sáu tầng: " + result.built + " mục mới.", false);
    return result;
  }
  async function autoBuildLayeredMemory(chapterNumber) {
    const n = Number(chapterNumber) || 0; if (!n || !state.chapters[n - 1]) return;
    const m = ensureMemory(), ranges = buildLayeredMemoryRanges(n, m.config);
    const isBoundary = [...ranges.chunks, ...ranges.arcs, ...ranges.volumes].some(r => r.complete && r.endChapter === n);
    const hasL1 = m.summaries.L1.some(x => x && x.chapterNumber === n && x.frozen && !x.stale);
    if (!isBoundary && hasL1) return;
    return buildLayeredMemorySummaries({ throughChapter: n, onlyBoundary: true });
  }
  function attachControls() {
    const build = document.getElementById("memoryLayerBuildBtn"), rebuild = document.getElementById("memoryLayerRebuildL5Btn");
    if (build && !build.dataset.bound) { build.dataset.bound = "1"; build.addEventListener("click", () => buildLayeredMemorySummaries({}).catch(e => setStatus("Lỗi xây Memory: " + String(e.message || e), false))); }
    if (rebuild && !rebuild.dataset.bound) { rebuild.dataset.bound = "1"; rebuild.addEventListener("click", () => buildLayeredMemorySummaries({ regenerateL5: true }).catch(e => setStatus("Lỗi tái tạo L5: " + String(e.message || e), false))); }
    renderLayeredMemoryStats();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", attachControls); else attachControls();
  if (window.__XTA_HOOKS__) window.__XTA_HOOKS__.on("all", attachControls);
  window.__XTA_LAYERED_MEMORY__ = { buildLayeredMemorySummaries, autoBuildLayeredMemory, renderLayeredMemoryStats };
})();
