const fs=require('fs'),assert=require('assert'),path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
assert(s.includes('maxTokens:2400'));
assert(s.includes('finishReason'));
assert(s.includes('REQUIRED_DONE'));
assert(s.includes('Kế hoạch trước bị cắt'));
assert(s.includes('max-height:220px;overflow-y:auto'));
console.log('PASS V12.42 Chapter Plan Completion Guard');
