const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = source.indexOf('/* V12.31: prompt context audit');
const end = source.indexOf('/* ========== v11 AGE GUARD', start);
assert(start >= 0 && end > start, 'V12.31 helpers/context source exists');
const snippet = source.slice(start, end);

function makeState(overrides = {}) {
  return Object.assign({
    advancedRules: '', antagonist: '', directive: '', nextChapterHint: '', autoNextChapterHint: '',
    mainCharProfile: null, mainPlot: '', genre: '', worldSetting: '', worldRules: '', worldDescription: '',
    pronounRules: '', storyBibleLocked: false, styleBible: {}, chapters: [], lastStatusChapter: 0,
    storyClock: '', arcs: [], outlinePlans: [], scenes: [], includeScenesInPrompt: false, consentLog: [],
    locations: [], items: [], threads: [], foreshadowing: [], timeline: [], knowledgeLedger: [],
    characterStateTracker: {}, glossaryLock: [], banWords: [], difficulty: 'vua', mature: false,
    chapterMatureFocus: 'none', descriptionLevel: 'balanced', explicitLevel: 'sensual',
    ...overrides
  }, overrides);
}
function makeContext(state) {
  const ctx = {
    state,
    buildVocabularyBlockFrom: () => '',
    loreForPrompt: () => '',
    currentArc: () => null,
    currentOutline: () => null,
    characterCardsForPromptV102: () => '',
    relevantCharacters: () => [],
    characterSummaryForPrompt: () => '',
    matureFocusPrompt: () => '',
    normalizeChapterMatureFocus: () => 'none',
    DESCRIPTION_PROMPTS: { balanced: 'balanced description' },
    EXPLICIT_PROMPTS: { sensual: 'sensual description' },
    ageGuardPrompt: () => '',
    storyControlPromptClient: () => 'story control',
    buildLengthPlan: () => ''
  };
  vm.createContext(ctx);
  vm.runInContext(snippet, ctx);
  return ctx;
}

// Duplicate rules are removed after punctuation/whitespace normalization; explicitly disabled rules are omitted.
{
  const state = makeState({
    advancedRules: 'Không tạo nhân vật mới.\nKhông lặp sự kiện.\n[TẮT] Dùng tiếng Anh.',
    antagonist: 'Không tạo nhân vật mới!\nGiữ nguyên địa điểm đã xác lập.'
  });
  const ctx = makeContext(state);
  const block = ctx.buildEffectiveRuleBlock();
  assert.strictEqual((block.match(/Không tạo nhân vật mới/gi) || []).length, 1, 'normalized duplicate kept once');
  assert(!block.includes('Dùng tiếng Anh'), 'disabled line omitted');
  assert(block.includes('đã bỏ 1 dòng trùng'), 'dedup is reported');
  assert(block.includes('đã bỏ 1 dòng được đánh dấu TẮT/OFF'), 'disabled line is reported');
}

// Clear, opposing instructions trigger a warning; qualified exceptions do not.
{
  let ctx = makeContext(makeState({
    advancedRules: 'Tuyệt đối không tạo nhân vật mới trong mọi trường hợp.',
    directive: 'Bắt buộc tạo nhân vật mới tên Lan trong chương này.'
  }));
  const warnings = ctx.auditPromptInstructions();
  assert(warnings.some(w => w.includes('xung đột') && w.includes('nhân vật mới')), 'clear character conflict detected');
  assert(ctx.buildContextBlock({ includeChapterInstructions: false }).includes('KIỂM TRA XUNG ĐỘT QUY TẮC TRƯỚC KHI GỌI AI'), 'conflict warning is included in preflight context before plan API');

  ctx = makeContext(makeState({
    advancedRules: 'Không tạo nhân vật mới ngoài brief.',
    directive: 'Bắt buộc tạo nhân vật mới tên Lan trong chương này.'
  }));
  assert.strictEqual(ctx.auditPromptInstructions().length, 0, 'brief exception is not falsely flagged');

  ctx = makeContext(makeState({
    advancedRules: 'Không tùy tiện tạo nhân vật quan trọng mới; chỉ tạo khi câu chuyện thực sự cần.',
    directive: 'Bắt buộc tạo nhân vật mới tên Lan trong chương này.'
  }));
  assert.strictEqual(ctx.auditPromptInstructions().length, 0, 'qualified general rule is not falsely flagged as an absolute conflict');
}

// The context identifies stale Current Status and gives an explicit instruction not to treat it as current truth.
{
  const state = makeState({
    chapters: [
      { title: 'Một', summary: 'Đã tới bến cảng.' },
      { title: 'Hai', summary: 'Nhân vật rời bến cảng.' },
      { title: 'Ba', summary: 'Nhân vật tới thành phố.' }
    ],
    currentStatus: 'Địa điểm: bến cảng', lastStatusChapter: 1,
    directive: 'Chỉ đạo chương ba.', nextChapterHint: 'Gợi ý chương ba.',
    autoNextChapterHint: 'Gợi ý cũ của chương không rõ.'
  });
  const ctx = makeContext(state);
  const normal = ctx.buildContextBlock();
  assert(normal.includes('CHƯA CẬP NHẬT ĐẾN CHƯƠNG MỚI NHẤT'), 'stale status is labeled');
  assert(normal.includes('không được coi là hiện trạng tuyệt đối'), 'stale status instruction is present');
  assert(normal.includes('Chỉ đạo chương ba.'), 'current directive is included by default');
  assert(normal.includes('Gợi ý chương ba.'), 'current hint is included by default');
  assert(!normal.includes('Gợi ý cũ của chương không rõ'), 'unverifiable legacy auto-hint is excluded');

  const writeContext = ctx.buildContextBlock({ includeChapterInstructions: false });
  assert(!writeContext.includes('Chỉ đạo chương ba.'), 'write context excludes directive duplicated elsewhere');
  assert(!writeContext.includes('Gợi ý chương ba.'), 'write context excludes hint duplicated elsewhere');
}

// Fresh status is labeled as current, and absent status is not silently invented.
{
  const state = makeState({ chapters: [{ title: 'Một', summary: 'Đã đến nhà.' }], currentStatus: 'Địa điểm: nhà', lastStatusChapter: 1 });
  const ctx = makeContext(state);
  const block = ctx.buildContextBlock({ includeChapterInstructions: false });
  assert(block.includes('đã khớp chương đã lưu'), 'fresh status is labeled');
  assert(!block.includes('CHƯA CẬP NHẬT ĐẾN CHƯƠNG MỚI NHẤT'), 'fresh status is not stale');

  const noStatusCtx = makeContext(makeState({ chapters: [{ title: 'Một', summary: 'Đã đến nhà.' }] }));
  assert(noStatusCtx.buildContextBlock().includes('Chưa có bản trạng thái được xác nhận'), 'missing status is explicit');
}

// Integration guard: execute the actual builder and check complete directive/hint appear only once.
{
  const pStart = source.indexOf('function buildMainWritePrompt(o){');
  const pEnd = source.indexOf('/* ========== BUILD PLAN ========== */', pStart);
  const mainPromptSource = source.slice(pStart, pEnd);
  assert.strictEqual((mainPromptSource.match(/BRIEF NGƯỜI DÙNG — ƯU TIÊN CAO NHẤT/g) || []).length, 1, 'directive block is authored once');
  assert.strictEqual((mainPromptSource.match(/GỢI Ý NGƯỜI DÙNG — PHẢI BÁM ĐẦY ĐỦ/g) || []).length, 1, 'hint block is authored once');
  assert(!mainPromptSource.includes('state.autoNextChapterHint ?'), 'legacy auto-hint is not injected');

  const state = makeState({ directive: 'CHỈ ĐẠO CHƯƠNG 3 duy nhất XYZ.', nextChapterHint: 'GỢI Ý CHƯƠNG 3 duy nhất QRS.', autoNextChapterHint: 'GỢI Ý CŨ MÃ CHƯƠNG KHÔNG RÕ.' });
  const ctx = makeContext(state);
  vm.runInContext(mainPromptSource, ctx);
  const context = ctx.buildContextBlock({ includeChapterInstructions: false });
  const prompt = ctx.buildMainWritePrompt({
    chapterNumber: 3, isRegen: false, regenIndex: 0, regenMode: 'full', descPrompt: '', explicitPrompt: '',
    vocabBlock: '', usingNsfw: false, context, lastChapterEnding: '', recentFullText: '', olderSummaries: '',
    plan: '', priorCount: 2, proseOnly: false
  });
  assert.strictEqual(prompt.split('CHỈ ĐẠO CHƯƠNG 3 duy nhất XYZ.').length - 1, 1, 'actual prompt contains directive once');
  assert.strictEqual(prompt.split('GỢI Ý CHƯƠNG 3 duy nhất QRS.').length - 1, 1, 'actual prompt contains current hint once');
  assert(!prompt.includes('GỢI Ý CŨ MÃ CHƯƠNG KHÔNG RÕ'), 'actual prompt excludes unverified legacy hint');

  const workerSource = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'write-chapter-background.js'), 'utf8');
  assert(workerSource.includes('const mirrorContext = buildContextBlock({includeChapterInstructions:false});'), 'background worker uses same no-duplicate context mode');
}

// Regression: long rule sets must not flood the prompt with dozens of pairwise warnings.
{
  const rules = Array.from({length: 20}, (_, i) => `Tuyệt đối không tạo nhân vật mới trong tình huống ${i}.`).join("\n");
  const directives = Array.from({length: 20}, (_, i) => `Bắt buộc tạo nhân vật mới tên Nhân vật ${i} trong chương này.`).join("\n");
  const ctx = makeContext(makeState({ advancedRules: rules, directive: directives }));
  const warnings = ctx.auditPromptInstructions();
  assert(warnings.length <= 4, 'conflict audit is capped and summarized instead of flooding prompt');
  assert(warnings.length < 58, 'pairwise warning explosion is prevented');
}

console.log('PASS V12.31 prompt context: dedupe, disabled rules, conflict audit, Current Status freshness, no stale hint leakage');
