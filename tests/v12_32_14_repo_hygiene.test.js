// V12.32.14: kiểm tra dọn dẹp — tài liệu đã gộp, hàm chết không quay lại, site không phát công khai file nội bộ.
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..'), rd=f=>fs.readFileSync(path.join(root,f),'utf8');
const removed={"index.html": ["extractBalancedJson", "idbGetAll", "loadStoryStateFromDisk", "syncMainCharCoreFromProfile", "buildFemaleDefinitionBlock", "matureFocusLabel", "timingSummary", "runFastPostTasks", "normalizeStoryControlClient", "qualityHardCheck", "applyNextChapterHint", "previewNextChapterHint", "beginCanonSync", "completeCanonSync", "checkCheckpoint", "startBackgroundWrite", "_fmtDur", "enqueueTask", "showCheckpointBanner", "runQueue", "hideCheckpointBanner"], "worker": ["genSecret", "encryptText", "recentContext", "generateSummary", "generateNextChapterHint", "updateCharacters", "updateWorld", "formatStatus", "updateCurrentStatus", "updateLongMemory", "scanScenes", "parseArrayWithRepair", "parseObjectWithRepair", "extractModelFor", "compactCharacterList", "repairJsonWithAI"]};
// 1) tài liệu
assert(fs.existsSync(path.join(root,'CHANGELOG.md'))&&fs.existsSync(path.join(root,'docs/ARCHITECTURE.md'))&&fs.existsSync(path.join(root,'docs/PROMPT_V12.22.md')),'thiếu CHANGELOG/docs');
const stray=fs.readdirSync(root).filter(f=>/^(PATCH_NOTES.*|README_V.*|PROMPT_V.*)\.md$/.test(f));
assert.deepStrictEqual(stray,[],'file ghi chú cũ nằm rải ở thư mục gốc: '+stray.join(', '));
assert(/V12\.32\.14/.test(rd('README.md'))&&/V12\.32\.14/.test(rd('CHANGELOG.md')),'README/CHANGELOG chưa ghi bản hiện tại');
// 2) hàm chết không quay lại
const wordRe=n=>new RegExp('(?<![\\w$])'+n.replace(/\$/g,'\\$')+'(?![\\w$])');
for(const [file,key] of [['index.html','index.html'],['netlify/functions/write-chapter-background.js','worker']]){
  const src=rd(file); removed[key].forEach(n=>assert(!wordRe(n).test(src),file+': hàm đã gỡ xuất hiện lại: '+n));
}
// 3) netlify.toml chặn đường dẫn nội bộ + có 404.html
const toml=rd('netlify.toml'), blocks=toml.split('[[redirects]]').slice(1);
const need=['/tests/*','/netlify/*','/shared/*','/lib/*','/scripts/*','/docs/*','/README.md','/CHANGELOG.md','/SECURITY_SETUP.md','/package.json','/netlify.toml'];
need.forEach(p=>{ const b=blocks.find(x=>x.includes('from = "'+p+'"')); assert(b,'thiếu redirect chặn '+p); assert(/status\s*=\s*404/.test(b)&&/force\s*=\s*true/.test(b),p+': phải status 404 + force'); });
assert(!/from\s*=\s*"\/(index\.html)?"/.test(toml)&&!/from\s*=\s*"\/\.netlify/.test(toml),'không được chặn trang chính / hàm Netlify');
assert(fs.existsSync(path.join(root,'404.html')),'thiếu 404.html');
console.log('PASS V12.32.14 repo hygiene');
