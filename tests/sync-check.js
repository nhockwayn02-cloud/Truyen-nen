// Fail nếu index.html / worker lệch so với shared/core.js (ai đó sửa tay khối SHARED-CORE).
const { spawnSync } = require("child_process"), path = require("path");
const r = spawnSync(process.execPath, [path.join(__dirname, "../scripts/sync-shared.js"), "--check"], { encoding: "utf8" });
process.stdout.write(r.stdout);
if (r.status !== 0) { console.log("\nFAIL: hãy chạy `node scripts/sync-shared.js` để đồng bộ lại."); process.exit(1); }
console.log("\n1/1 PASS (client và worker dùng đúng cùng một bản shared/core.js)");
