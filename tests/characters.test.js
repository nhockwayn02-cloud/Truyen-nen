// Test nhận diện / gộp nhân vật trùng (shared/core.js) + worker không tạo mục trùng. Chạy: node tests/characters.test.js
const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const core = fs.readFileSync(path.join(__dirname, "../shared/core.js"), "utf8");
const ctx = {}; vm.createContext(ctx);
vm.runInContext(core + "\n;this.__t={isGenericMainLabel,resolveCharacterTarget,applyMainCharUpdate,mergeCharacterRecords,findDuplicateCharacterGroups,mergeCharacterIntoState};", ctx);
const T = ctx.__t; let pass = 0, fail = 0;
function t(name, fn) { try { fn(); console.log("PASS " + name); pass++; } catch (e) { console.log("FAIL " + name + " — " + e.message); fail++; } }
let id = 0; const C = (name, o) => Object.assign({ id: "c" + (++id), name, tier: "supporting", role: "", relationships: [], history: [] }, o || {});
const MC = (name, o) => Object.assign({ name, age: "", appearance: "", personality: "", goals: "", skills: "", secret: "", currentLocation: "", physicalState: "", mentalState: "" }, o || {});

t("Nhãn chung nhận diện đúng, tên riêng không bị nhận nhầm", () => {
  ["nhân vật chính", "Nhân Vật Chính", "main character", "Protagonist", "MC", "Nhân vật chính (tên chưa rõ)"].forEach(x => assert(T.isGenericMainLabel(x), x));
  assert(T.isGenericMainLabel("Nhân vật chính Bùi Lạc", "Bùi Lạc"));
  ["Bùi Lạc", "Ân", "Lâm Tịnh Nhã", "nhân vật chính phụ Hùng", "chủ tịch", ""].forEach(x => assert(!T.isGenericMainLabel(x, "Bùi Lạc"), x));
});
t("resolve: tên MC / nhãn chung / bí danh MC → main; NV có sẵn → character; còn lại → new", () => {
  const st = { mainCharProfile: MC("Bùi Lạc", { aliases: ["Lạc"] }), characters: [C("Ân"), C("Trần Mỹ Duyên", { aliases: ["Duyên"] })] };
  assert.strictEqual(T.resolveCharacterTarget(st, "bùi lạc").kind, "main");
  assert.strictEqual(T.resolveCharacterTarget(st, "nhân vật chính").kind, "main");
  assert.strictEqual(T.resolveCharacterTarget(st, "Lạc").kind, "main");
  assert.strictEqual(T.resolveCharacterTarget(st, "Ân").kind, "character");
  assert.strictEqual(T.resolveCharacterTarget(st, "Duyên").character.name, "Trần Mỹ Duyên");
  assert.strictEqual(T.resolveCharacterTarget(st, "Người lạ").kind, "new");
  assert.strictEqual(T.resolveCharacterTarget({ mainCharProfile: MC(""), characters: [] }, "nhân vật chính").kind, "new", "chưa khai báo MC thì không đoán");
});
t("Ca của người dùng: MC=Bùi Lạc, DB có 'nhân vật chính' + 'Bùi Lạc' + 'Ân' → gợi ý gộp 2 mục đầu vào MC, KHÔNG đụng 'Ân'", () => {
  const st = { mainCharProfile: MC("Bùi Lạc"), characters: [C("Ân", { role: "antagonist", tier: "major" }), C("Trần Mỹ Duyên"), C("nhân vật chính", { tier: "major" }), C("Bùi Lạc", { role: "protagonist" }), C("bà chủ trọ")] };
  const g = T.findDuplicateCharacterGroups(st);
  assert.strictEqual(JSON.stringify(g.map(x => x.sourceName).sort()), JSON.stringify(["Bùi Lạc", "nhân vật chính"]));
  assert(g.every(x => x.targetId === "MAIN" && x.confidence === "high"));
});
t("Chưa khai báo MC: nhãn chung gộp vào đúng 1 NV có role protagonist; mơ hồ thì chỉ cho xóa/giữ", () => {
  const a = C("Bùi Lạc", { role: "protagonist" }), st = { mainCharProfile: MC(""), characters: [C("nhân vật chính"), a, C("Ân", { role: "antagonist" })] };
  const g = T.findDuplicateCharacterGroups(st);
  assert.strictEqual(g.length, 1); assert.strictEqual(g[0].targetId, a.id);
  const st2 = { mainCharProfile: MC(""), characters: [C("nhân vật chính"), C("A", { role: "protagonist" }), C("B", { role: "nhân vật chính" })] };
  assert.strictEqual(T.findDuplicateCharacterGroups(st2)[0].type, "generic_unresolved");
});
t("Tên ngắn trùng một phần: gợi ý khi chỉ có 1 ứng viên; 'Ân' đứng riêng không bị gợi ý; từ chung (bà/ông) bị bỏ qua", () => {
  const st = { mainCharProfile: MC("Bùi Lạc"), characters: [C("Lạc"), C("Ân"), C("Lâm Tịnh Nhã"), C("Nhã"), C("bà")] };
  const g = T.findDuplicateCharacterGroups(st);
  const m = Object.fromEntries(g.map(x => [x.sourceName, x.targetName]));
  assert.strictEqual(m["Lạc"], "Bùi Lạc"); assert.strictEqual(m["Nhã"], "Lâm Tịnh Nhã");
  assert(!("Ân" in m) && !("bà" in m));
  const amb = { mainCharProfile: MC(""), characters: [C("Nhã"), C("Lâm Tịnh Nhã"), C("Trần Nhã")] };
  assert.strictEqual(T.findDuplicateCharacterGroups(amb).length, 0, "2 ứng viên → không đoán");
});
t("'Giữ riêng' (ignoredDupPairs) làm gợi ý biến mất", () => {
  const st = { mainCharProfile: MC("Bùi Lạc"), characters: [C("Lạc")] };
  const g = T.findDuplicateCharacterGroups(st); assert.strictEqual(g.length, 1);
  st.ignoredDupPairs = [g[0].key]; assert.strictEqual(T.findDuplicateCharacterGroups(st).length, 0);
});
t("Gộp vào MC: chỉ điền ô trống, KHÔNG ghi đè nội dung người dùng; thêm bí danh; xóa mục nguồn", () => {
  const src = C("Bùi Lạc", { personality: "lặng lẽ, cảnh giác", appearance: "AI mô tả", age: "25" });
  const st = { mainCharProfile: MC("Bùi Lạc", { appearance: "do người dùng nhập" }), characters: [src, C("Ân")] };
  const r = T.mergeCharacterIntoState(st, src.id, "MAIN");
  assert(r.ok); assert.strictEqual(st.characters.length, 1);
  assert.strictEqual(st.mainCharProfile.appearance, "do người dùng nhập");
  assert.strictEqual(st.mainCharProfile.personality, "lặng lẽ, cảnh giác"); assert.strictEqual(st.mainCharProfile.age, "25");
});
t("Gộp 2 NV: không mất thông tin, tier cao hơn, khoảng xuất hiện rộng nhất, quan hệ gộp không trùng, tham chiếu NV khác được đổi tên", () => {
  const a = C("Nhã", { tier: "minor", personality: "dịu dàng", firstAppearance: 2, lastAppearance: 5, relationships: [{ withName: "Ân", stage: "sợ" }] });
  const b = C("Lâm Tịnh Nhã", { tier: "major", personality: "kiêu hãnh", firstAppearance: 4, lastAppearance: 9, relationships: [{ withName: "Ân", stage: "x" }, { withName: "Nhã" }] });
  const an = C("Ân", { relationships: [{ withName: "Nhã", stage: "ép buộc" }] });
  const st = { characters: [a, b, an] };
  assert(T.mergeCharacterIntoState(st, a.id, b.id).ok);
  assert.strictEqual(st.characters.length, 2);
  const m = st.characters.find(c => c.id === b.id);
  assert.strictEqual(m.tier, "major"); assert.strictEqual(m.firstAppearance, 2); assert.strictEqual(m.lastAppearance, 9);
  assert(m.personality.includes("dịu dàng") && m.personality.includes("kiêu hãnh"));
  assert.strictEqual(JSON.stringify(m.relationships.map(r => r.withName)), JSON.stringify(["Ân"]), "quan hệ trùng + tự tham chiếu bị loại");
  assert(m.aliases.includes("Nhã"));
  assert.strictEqual(st.characters.find(c => c.id === an.id).relationships[0].withName, "Lâm Tịnh Nhã");
});
t("Gộp lỗi → state không đổi (mục nguồn/đích không tồn tại, chưa có MC)", () => {
  const st = { mainCharProfile: MC(""), characters: [C("x")] }, before = JSON.stringify(st);
  assert(!T.mergeCharacterIntoState(st, "nope", "MAIN").ok);
  assert(!T.mergeCharacterIntoState(st, st.characters[0].id, "MAIN").ok);
  assert(!T.mergeCharacterIntoState(st, st.characters[0].id, "nope").ok);
  assert.strictEqual(JSON.stringify(st), before);
});

// ---- worker: mergeCharacter không tạo mục trùng ----
const wsrc = fs.readFileSync(path.join(__dirname, "../netlify/functions/write-chapter-background.js"), "utf8");
const mod = { exports: {} }, sb = { module: mod, exports: mod.exports, console, process, Buffer, setTimeout, clearTimeout, URL, AbortController, TextDecoder, TextEncoder, require: n => n === "@netlify/blobs" ? { getStore() {}, connectLambda() {} } : require(n), fetch: async () => { throw new Error("off"); } };
vm.createContext(sb); vm.runInContext(wsrc + "\n;module.exports.__t={mergeCharacter};", sb);
t("Worker: 'Bùi Lạc' / 'nhân vật chính' / bí danh → cập nhật hồ sơ MC, không tạo mục mới; NV khác vẫn được tạo", () => {
  const st = { mainCharProfile: MC("Bùi Lạc", { aliases: ["Lạc"] }), characters: [] }, M = mod.exports.__t.mergeCharacter;
  M(st, { name: "Bùi Lạc", tier: "major", mentalState: "bình tĩnh" }, 3);
  M(st, { name: "nhân vật chính", tier: "major", physicalState: "mệt" }, 3);
  M(st, { name: "Lạc", secret: "kế hoạch trả thù" }, 3);
  M(st, { name: "Ân", tier: "major", role: "antagonist" }, 3);
  assert.strictEqual(JSON.stringify(st.characters.map(c => c.name)), JSON.stringify(["Ân"]));
  assert.strictEqual(st.mainCharProfile.mentalState, "bình tĩnh"); assert.strictEqual(st.mainCharProfile.physicalState, "mệt"); assert.strictEqual(st.mainCharProfile.secret, "kế hoạch trả thù");
});
t("Worker: bí danh của NV thường → cập nhật đúng NV đó", () => {
  const st = { characters: [C("Trần Mỹ Duyên", { aliases: ["Duyên"] })] }, M = mod.exports.__t.mergeCharacter;
  const r = M(st, { name: "Duyên", mentalState: "hoảng loạn" }, 4);
  assert.strictEqual(st.characters.length, 1); assert(!r.created); assert.strictEqual(st.characters[0].mentalState, "hoảng loạn");
});
console.log(`\n${pass}/${pass + fail} PASS`); process.exit(fail ? 1 : 0);
