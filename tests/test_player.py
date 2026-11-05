"""Test tự động cho Player v1 (Playwright + Chromium): luật học, bài thi, điện thoại, tài liệu PDF, chương, khóa Tham khảo.

Cách nhanh nhất: bash tests/run_all.sh (tự làm các bước dưới và chạy mọi test).

Chuẩn bị (từ gốc repo):
  node builder/scripts/build-scorm.mjs demo-course/ATLD-DEMO.xlsx demo-course out
  rm -rf out/test && mkdir -p out/test/course && cp tests/lms.html out/test/
  python3 -m zipfile -e out/SCORM_ATLD-DEMO.zip out/test/course
  npx http-server out/test -p 8765 -s -c-1 &      # BẮT BUỘC server hỗ trợ HTTP Range
  python3 tests/test_player.py

Biến môi trường: CHROME_PATH (tùy chọn) nếu muốn dùng Chrome cài sẵn thay vì Chromium của Playwright.
"""
import json, os, shutil, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:8765/lms.html"
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out", "test") + os.sep
CHROME = os.environ.get("CHROME_PATH")
results = []

def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(extra) if extra else ""))

ANSWER_JS = """(correct) => {
  const C = window.__ctd.C;
  document.querySelectorAll('.qitem').forEach(item => {
    const text = item.querySelector('p').textContent.replace(/^\\d+\\.\\s*/, '');
    const q = C.quiz.find(x => x.q === text);
    const right = q.options[q.answer];
    const labels = Array.from(item.querySelectorAll('label'));
    const strip = l => l.querySelector('span').textContent.replace(/^[A-D]\\.\\s*/, '');
    const target = correct ? labels.find(l => strip(l) === right) : labels.find(l => strip(l) !== right);
    target.querySelector('input').click();
  });
}"""

def frame(page):
    return page.frames[1]

def skip_videos(f):
    f.evaluate("""() => { const S = window.__ctd.S;
      S.v.forEach(v => { v[0] = 55; v[1] = 55; v[2] = 1; });
      window.__ctd.C.popups.forEach(p => { if (S.p.indexOf(p.id) < 0) S.p.push(p.id); });
      window.__ctd.go('quiz'); }""")

with sync_playwright() as p:
    opts = {"headless": True, "args": ["--autoplay-policy=no-user-gesture-required"]}
    if CHROME:
        opts["executable_path"] = CHROME
    b = p.chromium.launch(**opts)
    ctx = b.new_context(viewport={"width": 1300, "height": 920})
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())
    errors = []
    page.on("response", lambda r: errors.append("404 " + r.url) if r.status >= 400 and "favicon" not in r.url else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); time.sleep(1.5)
    f = frame(page)
    store = lambda: page.evaluate("lmsStore()")

    # ---- A. Video rules
    check("Trạng thái ban đầu = incomplete", store()["cmi.core.lesson_status"] == "incomplete")
    check("Bài 2 đang khóa", f.evaluate("document.querySelectorAll('#tocList li')[1].classList.contains('locked')"))
    f.wait_for_function("document.getElementById('vid').readyState >= 1", timeout=10000)
    check("Chương: video 1 có danh sách 3 chương, mục lục ghi số chương",
          f.evaluate("document.querySelectorAll('#chapList button').length") == 3 and "3 chương" in f.inner_text("#tocList li:first-child .meta"),
          f.inner_text("#tocList li:first-child .meta"))
    f.evaluate("document.querySelectorAll('#chapList button')[2].click()")
    time.sleep(0.3)
    check("Chương (khóa Bắt buộc): chương chưa xem tới bị mờ, bấm vào không tua tới",
          f.evaluate("document.querySelectorAll('#chapList button')[2].classList.contains('locked')") and f.evaluate("document.getElementById('vid').currentTime") < 2
          and "chỉ có thể tua lại" in f.inner_text("#toast"), f.inner_text("#toast"))
    f.evaluate("() => { const v = document.getElementById('vid'); v.muted = true; v.currentTime = 30; }")
    time.sleep(0.8)
    check("Chặn tua tới (tua tới 0:30 bị kéo về)", f.evaluate("document.getElementById('vid').currentTime") < 2,
          f.evaluate("document.getElementById('vid').currentTime"))
    f.evaluate("document.getElementById('vid').playbackRate = 4")
    time.sleep(0.3)
    check("Giới hạn tốc độ tối đa 2x", f.evaluate("document.getElementById('vid').playbackRate") == 2)

    f.evaluate("document.getElementById('vid').play()")
    time.sleep(1.5)
    f.evaluate("""() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
                          document.dispatchEvent(new Event('visibilitychange')); }""")
    time.sleep(0.3)
    check("Chuyển tab -> video tự dừng", f.evaluate("document.getElementById('vid').paused"))
    f.evaluate("() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => false}); document.getElementById('vid').play(); }")

    f.wait_for_selector("#pop.show", timeout=20000)
    t_pop = f.evaluate("document.getElementById('vid').currentTime")
    check("Pop-up 1 hiện ở mốc 0:15", 14.9 <= t_pop <= 16.5, round(t_pop, 2))
    page.screenshot(path=SHOTS + "shot_popup.png")
    f.click("#pop .opt[data-o='0']")   # sai
    page.screenshot(path=SHOTS + "shot_popup_wrong.png")
    time.sleep(0.5)
    check("Trả lời sai -> vẫn ở câu hỏi, video không lùi",
          f.evaluate("document.getElementById('pop').classList.contains('show')") and f.evaluate("document.getElementById('vid').currentTime") >= 14.9,
          f.evaluate("document.getElementById('vid').currentTime"))
    check("Trả lời sai -> khóa phương án đã chọn, các phương án khác vẫn chọn được",
          f.evaluate("""() => { const o = document.querySelectorAll('#pop .opt');
                                return o[0].disabled && o[0].classList.contains('wrong') && !o[1].disabled && !o[2].disabled; }"""))
    f.click("#pop .opt[data-o='1']")   # đúng
    check("Trả lời đúng -> lưu ngay, chưa cần bấm Tiếp tục xem", 0 in json.loads(store()["cmi.suspend_data"])["p"], store()["cmi.suspend_data"])
    check("Câu có giải thích -> chờ học viên bấm Tiếp tục xem",
          f.evaluate("document.getElementById('pop').classList.contains('show') && !!document.getElementById('popGo')"))
    f.click("#popGo")
    f.wait_for_selector("#pop.show", timeout=30000)
    t2 = f.evaluate("document.getElementById('vid').currentTime")
    check("Pop-up 2 hiện ở mốc 0:40", 39.9 <= t2 <= 41.5, round(t2, 2))
    f.click("#pop .opt[data-o='0']")   # sai
    f.click("#pop .opt[data-o='1']")   # sai lần 2
    check("Sai 2 lần -> vẫn chọn lại được", not f.evaluate("document.querySelectorAll('#pop .opt')[2].disabled"))
    f.click("#pop .opt[data-o='2']")   # đúng, rồi tải lại trang ngay (không bấm Tiếp tục xem)
    time.sleep(0.3)
    page.reload(); time.sleep(1.5); f = frame(page)
    f.wait_for_function("document.getElementById('vid').readyState >= 1", timeout=10000)
    f.evaluate("() => { const v = document.getElementById('vid'); v.muted = true; v.playbackRate = 2; v.play(); }")
    time.sleep(1.5)
    check("Đúng rồi tải lại trang -> không hỏi lại câu đó",
          not f.evaluate("document.getElementById('pop').classList.contains('show')") and f.evaluate("document.getElementById('vid').currentTime") >= 39,
          f.evaluate("document.getElementById('vid').currentTime"))
    f.wait_for_function("!document.getElementById('nextBtn').disabled", timeout=30000)
    check("Xem hết video 1 -> bài 2 mở khóa", not f.evaluate("document.querySelectorAll('#tocList li')[1].classList.contains('locked')"))
    f.evaluate("document.querySelectorAll('#chapList button')[1].click()")
    f.wait_for_function("document.querySelectorAll('#chapList button')[1].classList.contains('now')", timeout=5000)
    t = f.evaluate("document.getElementById('vid').currentTime")
    check("Chương: đã xem tới thì bấm được, nhảy tới 0:20 và tô chương đang phát", 19.9 <= t <= 22 and
          f.evaluate("document.querySelectorAll('#chapList button.locked').length") == 0, round(t, 2))
    f.evaluate("document.getElementById('vid').pause()")
    sd = json.loads(store()["cmi.suspend_data"])
    check("Tiến độ được lưu vào suspend_data", sd["v"][0][2] == 1 and sorted(sd["p"]) == [0, 1], sd)
    check("Bài kiểm tra vẫn khóa khi chưa xem hết", f.evaluate("document.querySelector('#tocList li.quiz').classList.contains('locked')"))

    # ---- Resume: tải lại -> mở đúng bài đang học
    f.click("#nextBtn"); time.sleep(1)
    page.reload(); time.sleep(1.5); f = frame(page)
    check("Học tiếp đúng chỗ (bài 2) sau khi tải lại", "Trang bị bảo hộ" in f.evaluate("document.querySelector('.main h2').textContent"))
    f.wait_for_function("document.getElementById('vid').readyState >= 1", timeout=10000)
    f.evaluate("() => { const v = document.getElementById('vid'); v.muted = true; v.playbackRate = 2; v.play(); }")
    f.wait_for_selector("#pop.show", timeout=30000)
    f.click("#pop .opt[data-o='1']")   # đúng, câu này không có giải thích
    time.sleep(2.5)
    check("Câu không có giải thích -> trả lời đúng thì video tự chạy tiếp",
          not f.evaluate("document.getElementById('pop').classList.contains('show')") and not f.evaluate("document.getElementById('vid').paused"))

    # ---- B. Quiz: rớt 1 lần rồi đạt
    skip_videos(f); time.sleep(0.5)
    page.screenshot(path=SHOTS + "shot_quiz_intro.png")
    f.click("#startQuiz"); time.sleep(0.4)
    check("Rút đúng 5 câu", f.evaluate("document.querySelectorAll('.qitem').length") == 5)
    check("Có đồng hồ đếm ngược", f.evaluate("!!document.getElementById('clock')"))
    f.evaluate(ANSWER_JS, False); f.click("#submitQuiz"); time.sleep(0.4)
    st = store()
    check("Rớt lượt 1: status vẫn incomplete, còn 2 lượt", st["cmi.core.lesson_status"] == "incomplete" and json.loads(st["cmi.suspend_data"])["a"] == 1)
    check("Hiện đáp án khi xem lại (đã bật)", f.evaluate("document.querySelectorAll('.qitem .ans').length") == 5)
    f.click("#retry"); f.click("#startQuiz"); time.sleep(0.3)
    f.evaluate(ANSWER_JS, True); f.click("#submitQuiz"); time.sleep(0.4)
    st = store()
    check("Đạt lượt 2: status = passed, score = 100", st["cmi.core.lesson_status"] == "passed" and st["cmi.core.score.raw"] == "100",
          (st["cmi.core.lesson_status"], st.get("cmi.core.score.raw")))
    page.screenshot(path=SHOTS + "shot_quiz_pass.png", full_page=True)
    page.evaluate("document.getElementById('f').contentWindow.dispatchEvent(new Event('pagehide'))"); time.sleep(0.3)
    st = store()
    check("Kết thúc phiên: exit rỗng + có session_time", st.get("cmi.core.exit") == "" and st.get("cmi.core.session_time", "").count(":") == 2,
          (st.get("cmi.core.exit"), st.get("cmi.core.session_time")))

    # ---- C. Rớt 3 lần -> khóa, liên hệ L&OD
    page.evaluate("sessionStorage.clear()"); page.reload(); time.sleep(1.5); f = frame(page)
    skip_videos(f); time.sleep(0.3)
    for k in range(3):
        f.click("#startQuiz"); time.sleep(0.2)
        f.evaluate(ANSWER_JS, False); f.click("#submitQuiz"); time.sleep(0.3)
        if k < 2: f.click("#retry")
    st = store()
    check("Rớt 3 lần: status = failed", st["cmi.core.lesson_status"] == "failed")
    check("Hiện nội dung liên hệ L&OD", f.evaluate("!!document.querySelector('.contact')"))
    page.reload(); time.sleep(1.5); f = frame(page)
    check("Tải lại vẫn khóa bài thi (không có nút Bắt đầu)", f.evaluate("!document.getElementById('startQuiz')"))
    page.screenshot(path=SHOTS + "shot_locked.png")

    # ---- D. Mobile
    m = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    mp = m.new_page(); mp.goto("http://localhost:8765/course/index.html"); time.sleep(1.5)
    mp.screenshot(path=SHOTS + "shot_mobile.png", full_page=True)
    check("Mobile: không tràn ngang", mp.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
    check("Chế độ xem thử khi không có LMS", mp.evaluate("!!document.querySelector('.preview-badge')"))

    # ---- E. Tài liệu PDF xem song song với video
    dctx = b.new_context(viewport={"width": 1300, "height": 920})
    dp = dctx.new_page()
    reqs = []
    dp.on("request", lambda r: reqs.append(r.url))
    dp.on("pageerror", lambda e: errors.append(str(e)))
    dp.goto(URL); time.sleep(1.5)
    df = dp.frames[1]
    check("Tài liệu: bài có tài liệu hiện nút Tài liệu", df.evaluate("document.getElementById('docBtn')?.textContent") == "📄 Tài liệu")
    check("Tài liệu: chưa mở thì chưa tải trình xem PDF", not any("/pdfjs/" in u for u in reqs))
    df.wait_for_function("document.getElementById('vid').readyState >= 1", timeout=10000)
    df.evaluate("() => { const v = document.getElementById('vid'); v.muted = true; v.play(); }")
    df.click("#docBtn")
    df.wait_for_selector("#docPages canvas", timeout=20000)
    time.sleep(1.2)
    check("Tài liệu: mở ra video vẫn chạy", df.evaluate("!document.getElementById('vid').paused && document.getElementById('vid').currentTime > 1"),
          df.evaluate("document.getElementById('vid').currentTime"))
    check("Tài liệu: hiện số trang", df.inner_text("#docPage") == "Trang 1/5", df.inner_text("#docPage"))
    vb, db = df.locator(".vwrap").bounding_box(), df.locator("#doc").bounding_box()
    check("Tài liệu: nằm bên phải video, cùng hàng", db["x"] >= vb["x"] + vb["width"] and db["y"] < vb["y"] + vb["height"], (vb, db))
    check("Tài liệu: không có link tải, không dùng trình xem PDF của trình duyệt",
          df.evaluate("!document.querySelector('#doc a, #doc iframe, #doc embed, #doc object')"))
    check("Tài liệu: chặn chuột phải", df.evaluate("""() => { const e = new MouseEvent('contextmenu', {bubbles: true, cancelable: true});
        document.querySelector('#docPages canvas').dispatchEvent(e); return e.defaultPrevented; }"""))
    df.click("#docPages")
    df.evaluate("document.getElementById('docPages').scrollTop = 1e6")
    df.wait_for_function("document.getElementById('docPage').textContent === 'Trang 5/5'", timeout=5000)
    df.wait_for_function("document.querySelectorAll('.doc-sheet')[4].querySelector('canvas')", timeout=10000)
    check("Tài liệu: cuộn tới trang cuối, trang được vẽ", True)
    check("Tài liệu: bấm vào tài liệu video vẫn chạy", not df.evaluate("document.getElementById('vid').paused"))
    w0 = df.evaluate("document.querySelector('.doc-sheet').offsetWidth")
    df.click("#docIn")
    check("Tài liệu: phóng to", df.evaluate("document.querySelector('.doc-sheet').offsetWidth") > w0 * 1.2)
    dp.screenshot(path=SHOTS + "shot_doc.png")
    # sang bài 3: tài liệu vẫn mở (đang xem tài liệu), 2 file để chọn
    df.evaluate("() => { const S = window.__ctd.S; S.v[0][2] = 1; S.v[1][2] = 1; window.__ctd.go(1); }")
    check("Tài liệu: bài không có tài liệu thì không có nút, không chia cột",
          df.evaluate("!document.getElementById('docBtn') && !document.querySelector('.layout.doc-open')"))
    df.evaluate("window.__ctd.go(2)")
    df.wait_for_selector("#docPages canvas", timeout=20000)
    check("Tài liệu: sang bài có tài liệu thì tự mở lại", df.evaluate("document.querySelectorAll('#docPick option').length") == 2)
    df.select_option("#docPick", "1")
    df.wait_for_function("document.getElementById('docPage').textContent === 'Trang 1/2'", timeout=20000)
    check("Tài liệu: đổi sang file thứ 2", True)
    df.click("#docClose")
    check("Tài liệu: đóng được, video rộng lại", df.evaluate("document.getElementById('doc').hidden && !document.querySelector('.layout.doc-open')"))
    df.click("#docBtn")
    df.wait_for_selector("#docPages canvas", timeout=20000)
    df.evaluate("() => { const S = window.__ctd.S; S.v[2][2] = 1; window.__ctd.go('quiz'); }")
    check("Tài liệu: ẩn khi vào bài kiểm tra", df.evaluate("!document.getElementById('doc') && !document.querySelector('.layout.doc-open')"))
    dctx.close()
    # điện thoại: tài liệu nằm dưới video, không tràn ngang
    mp.evaluate("document.getElementById('docBtn').click()")
    mp.wait_for_selector("#docPages canvas", timeout=20000)
    vb, db = mp.locator(".vwrap").bounding_box(), mp.locator("#doc").bounding_box()
    check("Mobile: tài liệu nằm dưới video", db["y"] >= vb["y"] + vb["height"], (vb, db))
    check("Mobile: mở tài liệu không tràn ngang", mp.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
    mp.screenshot(path=SHOTS + "shot_doc_mobile.png")

    # ---- F. Khóa Tham khảo: cùng gói demo, chỉ đổi settings.reference (pop-up, bài thi vẫn có trong course.js: Player phải bỏ qua)
    ref_dir = os.path.join(SHOTS, "course-ref")
    shutil.rmtree(ref_dir, ignore_errors=True)
    shutil.copytree(os.path.join(SHOTS, "course"), ref_dir)
    with open(os.path.join(ref_dir, "course.js"), encoding="utf-8") as fh:
        js = fh.read()
    course = json.loads(js[js.index("=") + 1:].strip().rstrip(";"))
    course["settings"]["reference"] = True
    with open(os.path.join(ref_dir, "course.js"), "w", encoding="utf-8") as fh:
        fh.write("window.COURSE = " + json.dumps(course, ensure_ascii=False) + ";\n")
    rctx = b.new_context(viewport={"width": 1300, "height": 920})
    rp = rctx.new_page()
    rp.on("pageerror", lambda e: errors.append(str(e)))
    rp.goto(URL + "?course=course-ref"); time.sleep(1.5)
    rf = rp.frames[1]
    rstore = lambda: rp.evaluate("lmsStore()")
    check("Tham khảo: mở khóa là completed", rstore()["cmi.core.lesson_status"] == "completed", rstore()["cmi.core.lesson_status"])
    check("Tham khảo: mọi bài đều mở, không có bài kiểm tra",
          rf.evaluate("document.querySelectorAll('#tocList li').length") == 3 and rf.evaluate("document.querySelectorAll('#tocList li.locked, #tocList li.quiz').length") == 0)
    check("Tham khảo: không hiện % hoàn thành", not rf.is_visible(".hdr .pct"))
    check("Tham khảo: nút Bài tiếp theo bấm được ngay", not rf.evaluate("document.getElementById('nextBtn').disabled"))
    rf.wait_for_function("document.getElementById('vid').readyState >= 1", timeout=10000)
    rf.evaluate("() => { const v = document.getElementById('vid'); v.muted = true; v.currentTime = 30; }")
    time.sleep(0.8)
    t = rf.evaluate("document.getElementById('vid').currentTime")
    check("Tham khảo: tua tới tự do (0:30)", 29.5 <= t <= 31, round(t, 2))
    rf.evaluate("document.querySelectorAll('#chapList button')[2].click()")
    time.sleep(0.5)
    t = rf.evaluate("document.getElementById('vid').currentTime")
    check("Tham khảo: bấm chương bất kỳ là nhảy tới (0:42)", 41.9 <= t <= 44 and rf.evaluate("document.querySelectorAll('#chapList button.locked').length") == 0, round(t, 2))
    rf.evaluate("document.getElementById('vid').playbackRate = 4")
    time.sleep(0.3)
    check("Tham khảo: vẫn tối đa 2x", rf.evaluate("document.getElementById('vid').playbackRate") == 2)
    rf.evaluate("() => { const v = document.getElementById('vid'); v.currentTime = 12; v.play(); }")
    time.sleep(2.5)
    rf.evaluate("""() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
                          document.dispatchEvent(new Event('visibilitychange')); }""")
    time.sleep(0.3)
    check("Tham khảo: chuyển tab không dừng video", not rf.evaluate("document.getElementById('vid').paused"))
    check("Tham khảo: qua mốc pop-up 0:15 không hiện câu hỏi",
          rf.evaluate("document.getElementById('vid').currentTime") > 16 and not rf.evaluate("document.getElementById('pop').classList.contains('show')"),
          rf.evaluate("document.getElementById('vid').currentTime"))
    rf.evaluate("() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => false}); document.getElementById('vid').pause(); }")
    rf.click("#tocList li:nth-child(3) button")
    time.sleep(0.5)
    check("Tham khảo: nhảy thẳng tới bài 3, bài cuối không có nút Hoàn thành",
          "Nhận diện mối nguy" in rf.inner_text(".main h2") and rf.evaluate("!document.getElementById('nextBtn')"))
    rp.screenshot(path=SHOTS + "shot_reference.png")
    rp.reload(); time.sleep(1.5); rf = rp.frames[1]
    check("Tham khảo: tải lại vẫn mở đúng bài đang xem (bài 3)", "Nhận diện mối nguy" in rf.inner_text(".main h2"))
    rp.evaluate("document.getElementById('f').contentWindow.dispatchEvent(new Event('pagehide'))"); time.sleep(0.3)
    st = rstore()
    check("Tham khảo: kết thúc phiên vẫn completed, exit = suspend (lần sau mở lại đúng chỗ)",
          st["cmi.core.lesson_status"] == "completed" and st.get("cmi.core.exit") == "suspend", (st["cmi.core.lesson_status"], st.get("cmi.core.exit")))
    rctx.close()

    check("Không có lỗi JavaScript", not errors, errors[:3])
    b.close()

passed = sum(1 for r in results if r[1])
print("\n%d/%d PASS" % (passed, len(results)))
raise SystemExit(0 if passed == len(results) else 1)
