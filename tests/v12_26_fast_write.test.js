const fs=require('fs');
const s=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const checks=[
 ['IDB version 3',/const IDB_VERSION = 3;/.test(s)],
 ['storyMeta store',/const IDB_META_STORE = "storyMeta";/.test(s)],
 ['fast meta save',/function saveStoryMetaToDisk\(id, s\)/.test(s)],
 ['persist writes meta immediately',/if\(state\.storyId\) saveStoryMetaToDisk\(state\.storyId, state\);/.test(s)],
 ['chapter is marked SYNCING before background canon',/chapterObj\.status = "SYNCING";/.test(s)],
 ['postprocess detached',/void runCanonPostProcess\(chapterObj, chapterNumber, text, rawForPolish, _writeBriefSnapshot\)/.test(s)],
 ['generation UI released before postprocess',/setGenerating\(false\);[\s\S]{0,500}setStatus\(modeTag \+ "✓ Chương/.test(s)]
];
let bad=0; for(const [n,c] of checks){console.log((c?'PASS ':'FAIL ')+n);if(!c)bad++;}
console.log(`\n${checks.length-bad}/${checks.length} PASS`); process.exit(bad?1:0);
