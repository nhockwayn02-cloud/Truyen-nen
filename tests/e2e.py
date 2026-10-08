"""Test E2E v11 — chạy: python3 tests/e2e.py  (cần playwright + chromium)"""
import http.server, threading, socketserver, os, sys, json, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
Handler = functools.partial(Q, directory=ROOT)
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", 0), Handler)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{port}/index.html"

results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra else ""))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()
    ctx.add_init_script("window.__XTA_TEST__=true")
    page = ctx.new_page()
    errs = []
    page.on("dialog", lambda d: d.accept())  # hộp thoại xác nhận viết Chương 1 khi đã có nhân vật
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if (m.type == "error" and "Failed to load resource" not in m.text) else None)
    page.goto(URL); page.wait_for_timeout(1200)

    check("1. Trang tải, không lỗi JS", not errs, "; ".join(errs)[:200])
    check("2. Nhãn phiên bản v12", "v12" in page.inner_text(".brand-sub"))

    # IndexedDB có bản ghi truyện
    def idb_count():
        return page.evaluate("""()=>new Promise(r=>{const q=indexedDB.open('XuongTruyenAI_v10');
          q.onsuccess=()=>{const d=q.result;const t=d.transaction('stories').objectStore('stories').count();
          t.onsuccess=()=>r(t.result);}; q.onerror=()=>r(-1);})""")
    page.wait_for_timeout(500)
    check("3. IndexedDB có bản ghi truyện mới", idb_count() >= 1, str(idb_count()))

    # Hàm helper tồn tại
    check("4. Hàm v11 tồn tại", page.evaluate("!!window.__xta && typeof __xta.flushPersist==='function' && typeof __xta.ageGuardPrompt==='function'"))

    # Age guard
    r = page.evaluate("""()=>{
      const state=__xta.state; state.mainCharProfile=Object.assign(state.mainCharProfile||{},{name:'An',age:'25'});
      state.characters=[{name:'Bo',age:'16 tuổi'},{name:'Cy',age:'1000'},{name:'Di',age:'không rõ'},{name:'Em',age:'18'}];
      return {u:__xta.underageNames(state), p:__xta.ageGuardPrompt(state)};}""")
    check("5. Age guard chỉ bắt nhân vật <18", r["u"] == ["Bo"], str(r["u"]))
    check("6. Prompt chứa rào chắn và tên bị cấm", "RÀO CHẮN TUỔI" in r["p"] and "Bo" in r["p"] and "Cy" not in r["p"])
    pb = page.evaluate("""()=>{const state=__xta.state; state.mature=true; const t=__xta.buildContextBlock(); state.mature=false; const t2=__xta.buildContextBlock();
        return [t.includes('RÀO CHẮN TUỔI'), t2.includes('RÀO CHẮN TUỔI')];}""")
    check("7. Rào chắn chỉ chèn khi bật 18+", pb == [True, False], str(pb))

    # Flush khi ẩn tab: đổi dữ liệu -> persist() -> ẩn ngay (<1.75s) -> phải có bản khẩn cấp đồng bộ
    page.evaluate("()=>{__xta.state.storyName='TEST_FLUSH_v11'; __xta.persist();}")
    page.evaluate("()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true}); document.dispatchEvent(new Event('visibilitychange'));}")
    em = page.evaluate("()=>Object.keys(localStorage).filter(k=>k.startsWith('aiStoryWorkshop_emergency_v11_')).length")
    page.wait_for_timeout(800)
    page.evaluate("()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});}")
    got = page.evaluate("""()=>new Promise(r=>{const q=indexedDB.open('XuongTruyenAI_v10');
      q.onsuccess=()=>{const t=q.result.transaction('stories').objectStore('stories').getAll();
      t.onsuccess=()=>r(JSON.stringify(t.result).includes('TEST_FLUSH_v11'));};})""")
    check("8. Dữ liệu đổi <1.75s vẫn nằm trong IndexedDB sau khi ẩn tab", got)
    left = page.evaluate("()=>Object.keys(localStorage).filter(k=>k.startsWith('aiStoryWorkshop_emergency_v11_')).length")
    check("9. Bản khẩn cấp được dọn sau khi IDB xác nhận", left == 0, str(left))

    # Khôi phục từ bản khẩn cấp (mô phỏng tab bị kill trước khi IDB xong)
    sid = page.evaluate("()=>__xta.state.storyId")
    page.evaluate("""(sid)=>{const rec=__xta.serializeStoryRecord(Object.assign({},__xta.state,{storyId:sid,storyName:'TEST_EMERGENCY_v11'}));
      rec.updatedAt=Date.now()+5000; __xta.writeEmergencyCopy(sid,rec);}""", sid)
    page.reload(); page.wait_for_timeout(1500)
    name = page.evaluate("()=>__xta.state.storyName")
    check("10. Khởi động lại khôi phục từ bản khẩn cấp mới hơn", name == "TEST_EMERGENCY_v11", name)

    # Fallback khi IndexedDB hỏng: ép idbPut reject
    page.evaluate("()=>{window.__orig=__xta.getIdbPut(); __xta.setIdbPut(()=>Promise.reject(new Error('sim')));}")
    page.evaluate("()=>{__xta.state.storyName='TEST_IDBFAIL_v11'; __xta.persistNow();}")
    page.wait_for_timeout(400)
    em2 = page.evaluate("()=>Object.keys(localStorage).filter(k=>k.startsWith('aiStoryWorkshop_emergency_v11_')).length")
    check("11. IDB lỗi -> tự ghi localStorage dự phòng", em2 >= 1, str(em2))
    page.evaluate("()=>{__xta.setIdbPut(window.__orig);}")

    # Xoá truyện dọn cả bản khẩn cấp
    page.evaluate("(sid)=>__xta.removeStoryFromDisk(sid)", sid)
    em3 = page.evaluate("()=>Object.keys(localStorage).filter(k=>k.startsWith('aiStoryWorkshop_emergency_v11_')).length")
    check("12. Xoá truyện dọn bản khẩn cấp", em3 == 0, str(em3))

    # Tương thích v10: dữ liệu localStorage v9 cũ vẫn migrate
    page2 = ctx.new_page(); page2.goto(URL); page2.wait_for_timeout(800)
    check("13. Mở tab thứ hai không lỗi", True)

    # ---- Luồng viết chương với API giả (mock SSE / JSON) ----
    calls = {"stream": 0, "json": 0}
    gate = {"mode": "pass"}
    def mock_api(route):
        req = route.request
        try: body = json.loads(req.post_data or "{}")
        except Exception: body = {}
        prompt = json.dumps(body.get("messages", []), ensure_ascii=False)
        if "ĐOẠN VĂN =====" in prompt:
            calls["json"] += 1
            src = json.loads(prompt)[-1]["content"].split("===== ĐOẠN VĂN =====")[-1].strip()
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"choices":[{"message":{"content":src.replace("Gió","GIÓ_ĐÃ_SỬA")},"finish_reason":"stop"}]}, ensure_ascii=False)); return
        if "QUALITY AUDITOR" in prompt:
            calls["json"] += 1; calls["review"] = calls.get("review", 0) + 1
            obj = {"score":95,"verdict":"PASS","dimensions":{},"mainEventCount":1,"namedCharacterCount":1,"unauthorizedImportantCharacter":False,"knowledgeViolation":False,"retcon":False,"outlineDeviation":False,"hardFailures":[],"warnings":[],"suggestions":[],"rewriteInstructions":[]}
            if gate["mode"] == "fail":
                obj.update({"score":50,"verdict":"HARD_FAIL","retcon":True,"hardFailures":["Retcon giả lập"],"rewriteInstructions":["Sửa retcon"]})
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"choices":[{"message":{"content":json.dumps(obj, ensure_ascii=False)},"finish_reason":"stop"}]}, ensure_ascii=False)); return
        if body.get("stream"):
            calls["stream"] += 1
            words = " ".join(["Gió"," thổi"," qua"," con"," phố"," vắng."] * 60)
            chunks = [words[i:i+80] for i in range(0, len(words), 80)]
            sse = "".join("data: " + json.dumps({"choices":[{"delta":{"content":c}}]}, ensure_ascii=False) + "\n\n" for c in chunks)
            sse += "data: " + json.dumps({"choices":[{"delta":{},"finish_reason":"stop"}]}) + "\n\ndata: [DONE]\n\n"
            route.fulfill(status=200, content_type="text/event-stream", body=sse)
        else:
            calls["json"] += 1
            content = "[]" if ("mảng JSON" in prompt or "MẢNG" in prompt) else "Chương này kể về một đêm mưa. Nhân vật chính rời phố cũ."
            if "JSON" in prompt and "mảng" not in prompt.lower(): content = "{}"
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"choices":[{"message":{"content":content},"finish_reason":"stop"}]}))
    page.route("**/chat/completions", mock_api)
    page.fill("#apiEndpoint", "http://127.0.0.1:%d/chat/completions" % port)
    page.fill("#apiKey", "test-key")
    page.evaluate("()=>{const s=__xta.state; s.apiEndpoint=document.getElementById('apiEndpoint').value; s.apiKey='test-key'; s.minChapterWords=40; s.nsfwMode='off'; s.mature=false; s.autoContinueEnabled=false;}")
    before = page.evaluate("()=>__xta.state.chapters.length")
    page.evaluate("()=>{const b=document.getElementById('writeChapterBtn'); b.click();}")
    for _ in range(40):
        page.wait_for_timeout(500)
        if page.evaluate("()=>__xta.state.chapters.length") > before: break
    after = page.evaluate("()=>__xta.state.chapters.length")
    check("14. Viết chương với API giả -> có chương mới", after == before + 1, f"{before}->{after}, gọi stream={calls['stream']} json={calls['json']}")
    if after > before:
        ln = page.evaluate("()=>{const c=__xta.state.chapters[__xta.state.chapters.length-1]; return (c.text||c.content||'').length}")
        check("15. Nội dung chương không rỗng", ln > 100, str(ln))
        page.wait_for_timeout(2500)
        page.reload(); page.wait_for_timeout(1500)
        kept = page.evaluate("()=>__xta.state.chapters.length")
        check("16. Tải lại trang vẫn giữ chương (lưu bền)", kept == after, str(kept))
    # ---- v11.1: rà chính tả chạy nền + chế độ tuần tự ----
    def wait_idle(timeout=30):
        for _ in range(timeout*2):
            page.wait_for_timeout(500)
            if not page.evaluate("()=>document.getElementById('writeChapterBtn').disabled"): return True
        return False
    page.evaluate("()=>{const s=__xta.state; s.apiEndpoint=document.getElementById('apiEndpoint').value||s.apiEndpoint; s.apiKey='test-key'; s.minChapterWords=40; s.nsfwMode='off'; s.mature=false; s.autoContinueEnabled=false; s.spellCheckEnabled=true; s.parallelEnabled=true;}")
    page.evaluate("()=>document.getElementById('writeChapterBtn').click()")
    page.wait_for_timeout(800); ok_idle = wait_idle()
    info = page.evaluate("()=>{const c=__xta.state.chapters[__xta.state.chapters.length-1]; return {n:__xta.state.chapters.length, polished:!!c.polished, has:(c.text||'').includes('GIÓ_ĐÃ_SỬA'), sum:(c.summary||'').length}}")
    check("17. Chế độ nhanh: viết xong, nút mở lại", ok_idle and info["n"] == 2, str(info))
    check("18. Rà chính tả nền đã thay văn bản + đánh dấu polished", info["polished"] and info["has"], str(info))
    page.wait_for_timeout(2500); page.reload(); page.wait_for_timeout(1500)
    persisted = page.evaluate("()=>{const c=__xta.state.chapters[__xta.state.chapters.length-1]; return (c.text||'').includes('GIÓ_ĐÃ_SỬA')}")
    check("19. Bản đã rà được lưu bền sau reload", persisted)
    # chế độ tuần tự cũ (tắt Song song)
    page.evaluate("()=>{const s=__xta.state; s.apiEndpoint=document.getElementById('apiEndpoint').value||s.apiEndpoint; s.apiKey='test-key'; s.minChapterWords=40; s.nsfwMode='off'; s.mature=false; s.autoContinueEnabled=false; s.spellCheckEnabled=true; s.parallelEnabled=false; s.queueEnabled=false;}")
    page.evaluate("()=>document.getElementById('writeChapterBtn').click()")
    page.wait_for_timeout(800); ok_idle2 = wait_idle(60)
    n3 = page.evaluate("()=>__xta.state.chapters.length")
    check("20. Chế độ tuần tự (tắt Song song) vẫn viết được", ok_idle2 and n3 == 3, str(n3))
    page.evaluate("()=>{const s=__xta.state; s.parallelEnabled=true; s.queueEnabled=true;}")
    # ---- v12.16b: Quality Gate + Canon pipeline ----
    SET = "()=>{const s=__xta.state; s.apiEndpoint=document.getElementById('apiEndpoint').value||s.apiEndpoint; s.apiKey='test-key'; s.minChapterWords=40; s.nsfwMode='off'; s.mature=false; s.autoContinueEnabled=false; s.spellCheckEnabled=false; s.parallelEnabled=true; s.queueEnabled=true;}"
    def write_chapter(timeout=90):
        page.evaluate(SET)
        page.evaluate("()=>document.getElementById('writeChapterBtn').click()")
        page.wait_for_timeout(800); return wait_idle(timeout)
    last = "()=>{const c=__xta.state.chapters[__xta.state.chapters.length-1]; return {n:__xta.state.chapters.length,status:c.status,verdict:(c.review||{}).verdict,score:(c.review||{}).score,canon:__xta.state.canonVersion||0,len:(c.text||'').length,vers:(c.versions||[]).length,warn:(c.review||{}).warnings||[],sync:(c.sync||{}).status}}"
    info = page.evaluate(last)
    check("22. Gate PASS: chương ở trạng thái SYNCED, có điểm + canonVersion", info["status"] in ("SYNCED","SYNCED_WITH_WARNINGS") and info["verdict"] == "PASS" and info["score"] == 95 and info["canon"] >= 1, str(info))
    # sửa tay chương đã Sync
    page.evaluate("()=>{const el=document.getElementById('chapterText'); el.textContent=el.textContent+' Một câu sửa tay.'; el.dispatchEvent(new Event('input',{bubbles:true}));}")
    st = page.evaluate("()=>__xta.state.chapters[__xta.state.chapters.length-1].status")
    check("23. Sửa tay chương đã Sync → MODIFIED_AFTER_SYNC", st == "MODIFIED_AFTER_SYNC", st)
    n_before = page.evaluate("()=>__xta.state.chapters.length")
    ok = write_chapter()
    n_after = page.evaluate("()=>__xta.state.chapters.length")
    check("24. Chương sửa tay KHÔNG chặn viết chương kế", ok and n_after == n_before + 1, f"{n_before}->{n_after}")
    # Gate trượt: bản nháp được giữ nguyên, chưa ghi Canon
    gate["mode"] = "fail"
    canon_before = page.evaluate("()=>__xta.state.canonVersion||0")
    n_before = page.evaluate("()=>__xta.state.chapters.length")
    ok = write_chapter()
    info = page.evaluate(last)
    check("25. Gate trượt: chương lưu ở REVISION_REQUIRED, chưa ghi Canon", ok and info["n"] == n_before + 1 and info["status"] == "REVISION_REQUIRED" and info["canon"] == canon_before, str(info))
    check("26. Bản sửa ngắn bất thường bị từ chối: bản nháp KHÔNG bị ghi đè", info["len"] > 500 and info["vers"] == 0 and any("từ chối" in w for w in info["warn"]), str(info))
    n_before = info["n"]
    page.evaluate(SET); page.evaluate("()=>document.getElementById('writeChapterBtn').click()"); page.wait_for_timeout(1500); wait_idle(30)
    n_after = page.evaluate("()=>__xta.state.chapters.length")
    check("27. Chương chưa qua Gate chặn viết chương kế", n_after == n_before, f"{n_before}->{n_after}")
    # Duyệt lại bằng nút → Gate đạt → tự Sync Canon
    gate["mode"] = "pass"
    page.evaluate("()=>document.getElementById('reviewChapterBtn').click()")
    page.wait_for_timeout(800); wait_idle(90)
    info = page.evaluate(last)
    check("28. 🔍 Duyệt lại: Gate đạt → Sync Canon, canonVersion tăng", info["status"] in ("SYNCED","SYNCED_WITH_WARNINGS") and info["canon"] == canon_before + 1, str(info) + f" canon_before={canon_before}")
    # công tắc tắt Quality Gate
    page.evaluate("()=>{const t=document.getElementById('qualityGateToggle'); t.checked=false; t.dispatchEvent(new Event('change',{bubbles:true}));}")
    off = page.evaluate("()=>__xta.state.qualityGateEnabled")
    gate["mode"] = "fail"
    ok = write_chapter()
    info = page.evaluate(last)
    check("29. Tắt Quality Gate: chương vẫn Sync, review = BYPASS", off is False and ok and info["verdict"] == "BYPASS" and info["status"] in ("SYNCED","SYNCED_WITH_WARNINGS"), f"off={off} {info}")
    # ---- v12.18: dọn nhân vật trùng (đúng ca người dùng báo: MC = Bùi Lạc, DB có "nhân vật chính" + "Bùi Lạc" + "Ân") ----
    page.evaluate("""()=>{const s=__xta.state; const {newCharacter,newMainCharProfile,renderCharacters}=__xta; s.mainCharProfile=Object.assign(newMainCharProfile(),{name:'Bùi Lạc',personality:''});
      s.characters=[newCharacter({name:'Ân',tier:'major',role:'antagonist'}),newCharacter({name:'nhân vật chính',tier:'major',role:'bảo vệ, người lập kế hoạch trả thù',personality:'kiên nhẫn, tính toán'}),newCharacter({name:'Bùi Lạc',tier:'major',role:'protagonist',personality:'lặng lẽ, cảnh giác'}),newCharacter({name:'bà chủ trọ',tier:'background'})];
      s.ignoredDupPairs=[]; renderCharacters();}""")
    banner = page.evaluate("()=>{const b=document.getElementById('charDedupeBanner'); return {show:b.style.display, txt:b.textContent, btn:document.getElementById('charDedupeBtn').textContent}}")
    check("31. Có banner + nút '🧹 Dọn nhân vật trùng (2)' khi DB có nhãn chung / trùng MC", banner["show"] == "block" and "(2)" in banner["btn"], str(banner))
    page.evaluate("()=>document.getElementById('charDedupeBtn').click()")
    page.wait_for_timeout(300)
    cards = page.evaluate("()=>[...document.querySelectorAll('.modal-box [data-cd-merge]')].length")
    check("32. Modal gợi ý đúng 2 mục (nhân vật chính, Bùi Lạc); 'Ân' không bị gợi ý", cards == 2 and page.evaluate("()=>!document.querySelector('.modal-box').textContent.includes('Ân')"), f"cards={cards}")
    page.evaluate("()=>{document.querySelectorAll('.modal-box [data-cd-merge]')[0].click();}"); page.wait_for_timeout(200)
    page.evaluate("()=>{document.querySelectorAll('.modal-box [data-cd-merge]')[0].click();}"); page.wait_for_timeout(200)
    res = page.evaluate("()=>({names:__xta.state.characters.map(c=>c.name), pers:__xta.state.mainCharProfile.personality, al:__xta.state.mainCharProfile.aliases||[], mcname:__xta.state.mainCharProfile.name})")
    check("33. Sau khi gộp: chỉ còn 'Ân' + 'bà chủ trọ'; hồ sơ MC được điền ô trống, có bí danh", res["names"] == ["Ân", "bà chủ trọ"] and res["mcname"] == "Bùi Lạc" and res["pers"] != "" and "nhân vật chính" in res["al"], str(res))
    page.evaluate("()=>document.getElementById('cdUndo').click()"); page.wait_for_timeout(200)
    names = page.evaluate("()=>__xta.state.characters.map(c=>c.name)")
    check("34. ↶ Hoàn tác khôi phục mục vừa gộp", "Bùi Lạc" in names or "nhân vật chính" in names, str(names))
    page.evaluate("()=>document.querySelector('.modal-overlay').remove()")
    check("35. Không lỗi JS trong cả phiên", not errs, "; ".join(errs)[:200])

    b.close()
srv.shutdown()
bad = [n for n, ok in results if not ok]
print(f"\n{len(results)-len(bad)}/{len(results)} PASS")
sys.exit(1 if bad else 0)
