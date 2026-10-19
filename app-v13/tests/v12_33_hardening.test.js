const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..');
const sec=require(path.join(root,'lib/security.js'));

const empty={};
const audit=sec.securityAudit(empty);
assert.strictEqual(audit.hardened,false);
assert.deepStrictEqual(audit.checks.map(x=>x.ok),[false,false,false,false]);
const full=sec.securityAudit({JOB_SECRET:'x'.repeat(32),APP_PASSCODE:'pass',ALLOWED_ORIGIN:'https://story.example',ALLOWED_API_HOSTS:'openrouter.ai',REQUIRE_HARDENED_SECURITY:'1'});
assert.strictEqual(full.hardened,true);
assert(full.checks.every(x=>x.ok));

const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert(/id="ageGate"/.test(html),'age gate markup');
assert(/AGE_GATE_KEY/.test(html)&&/ageGateContinue/.test(html),'age gate logic');
assert(/id="uiModeSelect"/.test(html)&&/ui-simple/.test(html),'simple/expert mode');
assert(/id="onboardingWizard"/.test(html)&&/wizStart/.test(html),'onboarding wizard');
assert(/id="securityAuditBtn"/.test(html)&&/security-status/.test(html),'security audit UI');
assert(/id="writeProgress"/.test(html)&&/setWriteProgress\("gate"\)/.test(html),'writing progress');

console.log('PASS V12.33 P0/P1/P2 hardening');
