from pathlib import Path
import json, shutil, re

ROOT = Path(__file__).resolve().parents[1]
html_path = ROOT / 'index.html'
html = html_path.read_text()

# Version bump
html = html.replace('v12.32.18', 'v12.33.0')
for fn in ['README.md', 'CHANGELOG.md']:
    p = ROOT / fn
    if p.exists():
        s = p.read_text()
        s = s.replace('V12.32.18', 'V12.33.0').replace('v12.32.18', 'v12.33.0')
        p.write_text(s)
pkg = json.loads((ROOT/'package.json').read_text())
pkg['version'] = '12.33.0'
(ROOT/'package.json').write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n')

# CSS additions
css_marker = '/* v10.1: 2 cột */'
css_add = r'''
/* V12.33 — onboarding, simple mode and visible progress */
body.ui-simple .advanced-only{display:none!important}
body.ui-simple .section[data-simple-hidden="true"]{display:none!important}
body.ui-simple .settings-column-heading::after{content:" · Chế độ đơn giản";color:var(--gold)}
.mode-control{display:flex;align-items:center;gap:6px;margin-right:6px}
.mode-control select{width:auto;min-width:118px;padding:5px 7px;font-size:11px}
.security-audit{margin-top:9px;padding:9px 10px;border:1px dashed rgba(224,168,63,.55);border-radius:8px;background:rgba(224,168,63,.06);font-size:11px;line-height:1.45}
.security-audit.ok{border-color:rgba(63,174,114,.6);background:rgba(63,174,114,.06);color:#bfe8cf}
.security-audit.bad{border-color:rgba(226,88,77,.65);background:rgba(226,88,77,.06);color:#f0c5c0}
.security-audit button{margin-top:6px;width:auto}
.progress-strip{display:none;gap:4px;flex-wrap:wrap;margin:8px 0;padding:7px 9px;border:1px solid rgba(77,139,245,.35);border-radius:8px;background:rgba(77,139,245,.06);font-size:11px;color:var(--ink-dim)}
.progress-strip.on{display:flex}
.progress-step{padding:3px 6px;border-radius:5px;background:var(--panel-2);border:1px solid var(--line)}
.progress-step.active{color:var(--gold);border-color:var(--gold-dim);background:rgba(217,164,65,.13)}
.progress-step.done{color:var(--green);border-color:rgba(63,174,114,.45)}
.age-gate{position:fixed;inset:0;z-index:20000;background:rgba(4,5,8,.94);display:flex;align-items:center;justify-content:center;padding:20px}
.age-gate[hidden]{display:none}
.age-gate-card{max-width:520px;width:100%;background:#171922;border:1px solid #5a2f3a;border-radius:14px;padding:24px;box-shadow:0 18px 60px rgba(0,0,0,.65)}
.age-gate-card h2{margin:0 0 10px;color:#f0a8a2}.age-gate-card p{color:var(--ink-dim);line-height:1.6}.age-gate-card label{display:flex;gap:9px;align-items:flex-start;margin:16px 0;color:var(--ink)}
.age-gate-card button{width:100%;margin-top:8px}.onboarding-card{max-width:650px}
'''
html = html.replace(css_marker, css_add + '\n' + css_marker, 1)

# Age gate DOM
body_marker = '<body>'
age_dom = r'''<div class="age-gate" id="ageGate" hidden>
  <div class="age-gate-card">
    <h2>🔞 Xác nhận độ tuổi</h2>
    <p>Ứng dụng hỗ trợ sáng tác tiểu thuyết dành cho người trưởng thành và có thể tạo nội dung 18+. Chỉ tiếp tục nếu bạn đã đủ 18 tuổi và đồng ý tự chịu trách nhiệm với nội dung mình tạo.</p>
    <label><input id="ageGateCheck" type="checkbox"/> Tôi xác nhận mình từ 18 tuổi trở lên và hiểu ứng dụng có nội dung trưởng thành.</label>
    <button class="btn btn-pink" id="ageGateContinue" disabled>Tiếp tục vào ứng dụng</button>
  </div>
</div>
'''
html = html.replace(body_marker, body_marker + '\n' + age_dom, 1)

# Topbar mode control
old_top = '<div class="topbar-actions">'
new_top = '<div class="topbar-actions"><div class="mode-control"><label for="uiModeSelect" class="sr-only">Chế độ giao diện</label><select id="uiModeSelect" title="Chế độ giao diện"><option value="simple">Đơn giản</option><option value="expert">Chuyên gia</option></select></div>'
html = html.replace(old_top, new_top, 1)

# Security audit under API status
old_api = '<div class="api-status" id="apiStatus">Chưa kiểm tra.</div>'
new_api = old_api + r'''
<div class="security-audit" id="securityAudit"><b>🛡 Bảo mật deployment</b><div id="securityAuditText">Chưa kiểm tra cấu hình server.</div><button class="btn btn-ghost btn-sm" id="securityAuditBtn">Kiểm tra cấu hình</button></div>'''
html = html.replace(old_api, new_api, 1)

# Progress strip before writer buttons
old_writer = '<button class="btn btn-blue" id="writeChapterBtn">✨ Tạo Chương Mới</button>'
progress = r'''<div class="progress-strip" id="writeProgress" aria-live="polite">
<span class="progress-step" data-progress="plan">1. Kế hoạch</span><span class="progress-step" data-progress="write">2. Viết</span><span class="progress-step" data-progress="expand">3. Mở rộng</span><span class="progress-step" data-progress="gate">4. Quality Gate</span><span class="progress-step" data-progress="post">5. Hậu kỳ</span><span class="progress-step" data-progress="sync">6. Sync Canon</span>
</div>
''' + old_writer
html = html.replace(old_writer, progress, 1)

# Mark advanced settings at runtime rather than hand-editing every historical section.
# Add simple helper functions after $ID declaration.
marker = 'const $ID = id => document.getElementById(id);'
helpers = r'''

/* V12.33 P0/P1/P2 helpers — giữ nguyên schema dữ liệu cũ */
const AGE_GATE_KEY = "xta_age_verified_v1";
function setupAgeGate(){
  const gate=$ID("ageGate"), check=$ID("ageGateCheck"), cont=$ID("ageGateContinue");
  if(!gate||!check||!cont) return;
  if(window.__XTA_TEST__ || localStorage.getItem(AGE_GATE_KEY)==="1"){ gate.hidden=true; return; }
  gate.hidden=false;
  check.addEventListener("change",()=>{cont.disabled=!check.checked;});
  cont.addEventListener("click",()=>{if(!check.checked)return; try{localStorage.setItem(AGE_GATE_KEY,"1");}catch(e){} gate.hidden=true;});
}
function setupUIMode(){
  const sel=$ID("uiModeSelect"); if(!sel)return;
  let mode="simple"; try{mode=localStorage.getItem("xta_ui_mode")||"simple";}catch(e){}
  sel.value=mode; document.body.classList.toggle("ui-simple",mode==="simple");
  const sections=[...document.querySelectorAll(".sidebar .section")];
  sections.forEach(sec=>{const head=sec.querySelector(".section-head span"); const text=(head&&head.textContent||"").trim();
    const essential=/^(0\.0|0\.1|0\.2|2\.\s|4\.)/.test(text);
    sec.dataset.simpleHidden=essential?"false":"true";
  });
  sel.addEventListener("change",()=>{mode=sel.value==="expert"?"expert":"simple";document.body.classList.toggle("ui-simple",mode==="simple");try{localStorage.setItem("xta_ui_mode",mode);}catch(e){};setStatus(mode==="simple"?"Đã bật Chế độ đơn giản — các mục nâng cao đã được ẩn.":"Đã bật Chế độ chuyên gia — toàn bộ công cụ đã hiện.",false);});
}
function setWriteProgress(step){
  const box=$ID("writeProgress"); if(!box)return;
  if(!step){box.classList.remove("on"); box.querySelectorAll(".progress-step").forEach(x=>x.classList.remove("active","done")); return;}
  box.classList.add("on"); const order=["plan","write","expand","gate","post","sync"], at=order.indexOf(step);
  box.querySelectorAll(".progress-step").forEach(x=>{const i=order.indexOf(x.dataset.progress);x.classList.toggle("active",i===at);x.classList.toggle("done",i<at);});
}
async function runSecurityAudit(){
  const box=$ID("securityAudit"), txt=$ID("securityAuditText"); if(!box||!txt)return;
  txt.textContent="Đang kiểm tra cấu hình server…"; box.className="security-audit";
  try{
    const r=await fetch("/.netlify/functions/security-status",{headers:{"Accept":"application/json"}});
    if(!r.ok) throw new Error("HTTP "+r.status);
    const d=await r.json(); const bad=(d.checks||[]).filter(x=>!x.ok);
    box.className="security-audit "+(bad.length?"bad":"ok");
    txt.textContent=bad.length?"⚠ "+bad.map(x=>x.label).join(" · ")+" — hãy sửa trước khi chạy viết nền.":"✓ Cấu hình server đạt mức khuyến nghị.";
  }catch(e){
    box.className="security-audit bad";
    txt.textContent="Không đọc được endpoint kiểm tra. Hãy đặt JOB_SECRET, APP_PASSCODE và ALLOWED_ORIGIN trên Netlify; nếu chỉ viết cục bộ, có thể bỏ qua.";
  }
}
function setupSecurityAudit(){const b=$ID("securityAuditBtn");if(b)b.addEventListener("click",runSecurityAudit);}
function showOnboardingWizard(){
  if(window.__XTA_TEST__ || state.chapters.length || state.mainPlot || state.mainCharProfile&&state.mainCharProfile.name) return;
  const ov=document.createElement("div"); ov.className="age-gate"; ov.id="onboardingWizard";
  ov.innerHTML='<div class="age-gate-card onboarding-card"><h2>✍ Bắt đầu một truyện mới</h2><p>Chỉ cần điền vài thông tin cốt lõi. Các thiết lập nâng cao có thể bổ sung sau.</p><label>Tên truyện<input id="wizStoryName" type="text" placeholder="Ví dụ: Mùa Hạ Không Tên"></label><label>Thể loại / không khí<input id="wizGenre" type="text" placeholder="Ví dụ: dark romance, đô thị"></label><label>Nhân vật chính<input id="wizChar" type="text" placeholder="Tên nhân vật"></label><label>Tuổi nhân vật chính<input id="wizAge" type="number" min="18" value="25"></label><label>Ý tưởng chương đầu<textarea id="wizIdea" rows="4" placeholder="Chương đầu bắt đầu như thế nào?"></textarea></label><button class="btn btn-gold" id="wizStart">Lưu thiết lập và bắt đầu</button><button class="btn btn-ghost" id="wizSkip">Bỏ qua, tự thiết lập sau</button></div>';
  document.body.appendChild(ov);
  $ID("wizSkip").addEventListener("click",()=>ov.remove());
  $ID("wizStart").addEventListener("click",()=>{
    const name=$ID("wizStoryName").value.trim(), genre=$ID("wizGenre").value.trim(), ch=$ID("wizChar").value.trim(), age=$ID("wizAge").value.trim(), idea=$ID("wizIdea").value.trim();
    if(name)state.storyName=name; if(genre){state.genre=genre;const g=$ID("genre");if(g)g.value=genre;} if(idea){state.mainPlot=idea;const p=$ID("mainPlot");if(p)p.value=idea;state.directive=idea; if(nextChapterHintEl)nextChapterHintEl.value=idea;}
    if(ch){state.mainCharProfile=Object.assign(newMainCharProfile(),state.mainCharProfile||{}, {name:ch,age:age||"25"}); hydrateFormFromState();}
    persistNow(); renderAll(); renderStoryTabs(); ov.remove(); setStatus("Đã tạo thiết lập cơ bản. Bạn có thể bấm ✨ Tạo Chương Mới.",false);
  });
}
'''
html = html.replace(marker, marker + helpers, 1)

# Add setup calls at boot and show wizard after render.
html = html.replace('async function bootV102(){\n  await initIndexedDBStorage();', 'async function bootV102(){\n  setupAgeGate(); setupUIMode(); setupSecurityAudit();\n  await initIndexedDBStorage();', 1)
html = html.replace('  renderStoryTabs();\n  checkForRecoverableDraft();', '  renderStoryTabs();\n  showOnboardingWizard();\n  checkForRecoverableDraft();', 1)

# Use progress in main generation state transitions without changing existing behavior.
html = html.replace('async function generateChapter(){', 'async function generateChapter(){\n  setWriteProgress("plan");', 1)
html = html.replace('setGenerating(true);', 'setGenerating(true); setWriteProgress("write");', 1)
# first occurrences after generate are enough for visible transitions; append cleanup near common completion points.
html = html.replace('finally{ setGenerating(false); }', 'finally{ setGenerating(false); setWriteProgress(null); }', 1)

html_path.write_text(html)

# Update TODO progress
p = ROOT/'TODO.md'; todo=p.read_text(); todo=todo.replace('- [ ] Age Gate 18+ hiển thị', '- [x] Age Gate 18+ hiển thị').replace('- [ ] Bảng kiểm tra cấu hình bảo mật deployment.', '- [x] Bảng kiểm tra cấu hình bảo mật deployment.').replace('- [ ] Hardened mode từ chối', '- [x] Hardened mode từ chối').replace('- [ ] Chế độ đơn giản / chuyên gia', '- [x] Chế độ đơn giản / chuyên gia').replace('- [ ] Wizard tạo truyện lần đầu', '- [x] Wizard tạo truyện lần đầu').replace('- [ ] Tiến trình viết có các bước rõ ràng.', '- [x] Tiến trình viết có các bước rõ ràng.'); p.write_text(todo)
print('updated', html_path)
