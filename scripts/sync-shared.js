#!/usr/bin/env node
// Đồng bộ shared/core.js vào index.html và netlify/functions/write-chapter-background.js
// (chỉ thay nội dung giữa 2 dòng đánh dấu SHARED-CORE:BEGIN / END). Không cần thư viện ngoài.
// Dùng:  node scripts/sync-shared.js          -> ghi đè
//        node scripts/sync-shared.js --check  -> chỉ kiểm tra, thoát mã 1 nếu lệch
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const CORE = fs.readFileSync(path.join(ROOT, "shared/core.js"), "utf8").replace(/^(?:\/\/[^\n]*\n)+\n?/, "").trim();
const BEGIN = "// <<SHARED-CORE:BEGIN>> (tự sinh từ shared/core.js — KHÔNG sửa tay; chạy: node scripts/sync-shared.js)";
const END = "// <<SHARED-CORE:END>>";
const TARGETS = ["index.html", "netlify/functions/write-chapter-background.js"];
function render(text) {
  const i = text.indexOf("// <<SHARED-CORE:BEGIN>>");
  if (i < 0) throw new Error("Thiếu dấu BEGIN");
  const bEnd = text.indexOf("\n", i);
  const j = text.indexOf(END, bEnd);
  if (j < 0) throw new Error("Thiếu dấu END");
  return text.slice(0, i) + BEGIN + "\n" + CORE + "\n" + text.slice(j);
}
const check = process.argv.includes("--check");
let bad = 0;
for (const rel of TARGETS) {
  const p = path.join(ROOT, rel); const cur = fs.readFileSync(p, "utf8"); const next = render(cur);
  if (cur === next) { console.log("OK    " + rel); continue; }
  if (check) { console.log("LỆCH  " + rel); bad++; } else { fs.writeFileSync(p, next); console.log("ĐÃ GHI " + rel); }
}

// ===== V12.23: CLIENT-MIRROR — sao chép NGUYÊN VĂN các hàm dựng ngữ cảnh/prompt viết chương từ index.html vào worker =====
// Mục đích: viết nền dùng ĐÚNG code của viết thường (buildContextBlock, buildMainWritePrompt...). Nguồn sự thật = index.html.
const MIRROR_FUNCS = ["buildContextBlock","buildEffectiveRuleBlock","normalizePromptRuleText","promptRuleIsDisabled","_foldPromptAuditText","_promptConstraint","auditPromptInstructions","characterSummaryForPrompt","buildStoryBibleSummary","relevantCharacters","extractCharacterCardsV102","buildStyleBlock","loreBuild","loreScan","loreScanText","loreCards","loreKeyList","loreCompileKey","loreForPrompt","buildSceneHistoryBlock","buildConsentBlock","matureFocusPrompt","characterCardsForPromptV102","currentOutline","currentArc","buildVocabularyBlock","estimateTokens","storyControlPromptClient","buildMainWritePrompt"];
const M_BEGIN = "// <<CLIENT-MIRROR:BEGIN>> (tự sinh từ index.html — KHÔNG sửa tay; chạy: node scripts/sync-shared.js)";
const M_END = "// <<CLIENT-MIRROR:END>>";
function skipString(src, i) { const q = src[i]; i++; while (i < src.length) { const c = src[i]; if (c === "\\") { i += 2; continue; } if (q === "`" && c === "$" && src[i + 1] === "{") { i = skipBraces(src, i + 1); continue; } if (c === q) return i + 1; i++; } return i; }
function skipBraces(src, i) { // src[i] === "{"
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") { i = skipString(src, i); continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i < 0) return src.length; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 2; continue; }
    if (c === "/") { // regex literal? heuristic theo ký tự đứng trước
      let k = i - 1; while (k >= 0 && /\s/.test(src[k])) k--;
      const prev = src[k];
      if (prev === undefined || "(,=:[!&|?{};+-*%<>~^".includes(prev) || /\breturn$/.test(src.slice(Math.max(0, k - 6), k + 1))) {
        let j = i + 1, inClass = false;
        while (j < src.length) { const d = src[j]; if (d === "\\") { j += 2; continue; } if (d === "[") inClass = true; else if (d === "]") inClass = false; else if (d === "/" && !inClass) break; else if (d === "\n") break; j++; }
        if (src[j] === "/") { i = j + 1; continue; }
      }
    }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  return i;
}
function extractFunction(src, name) {
  const re = new RegExp("(?:^|\\n)([ \\t]*)((?:async\\s+)?function\\s+" + name + "\\s*\\()", "m");
  const m = re.exec(src); if (!m) throw new Error("Không tìm thấy hàm " + name + " trong index.html");
  const start = m.index + (m[0].startsWith("\n") ? 1 : 0);
  const open = src.indexOf("{", start + m[1].length + m[2].length);
  const end = skipBraces(src, open);
  return src.slice(start, end);
}
function renderMirror(workerText) {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const body = MIRROR_FUNCS.map(n => extractFunction(html, n)).join("\n\n");
  const i = workerText.indexOf("// <<CLIENT-MIRROR:BEGIN>>");
  if (i < 0) throw new Error("Thiếu dấu CLIENT-MIRROR:BEGIN trong worker");
  const bEnd = workerText.indexOf("\n", i);
  const j = workerText.indexOf(M_END, bEnd);
  if (j < 0) throw new Error("Thiếu dấu CLIENT-MIRROR:END trong worker");
  return workerText.slice(0, i) + M_BEGIN + "\n" + body + "\n" + workerText.slice(j);
}
{
  const rel = "netlify/functions/write-chapter-background.js";
  const p = path.join(ROOT, rel); const cur = fs.readFileSync(p, "utf8"); const next = renderMirror(cur);
  if (cur === next) console.log("OK    " + rel + " (CLIENT-MIRROR)");
  else if (check) { console.log("LỆCH  " + rel + " (CLIENT-MIRROR)"); bad++; }
  else { fs.writeFileSync(p, next); console.log("ĐÃ GHI " + rel + " (CLIENT-MIRROR)"); }
}

process.exit(bad ? 1 : 0);
