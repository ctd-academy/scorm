"""Test giao diện Builder (Playwright + Chromium): chọn thư mục -> đặt pop-up -> kiểm tra -> xem thử -> xuất gói.

Chuẩn bị (từ gốc repo):
  (cd builder && npm install && npm run build)
  npx http-server builder/dist -p 8766 -s -c-1 &
  python3 tests/test_builder.py

Gói Builder xuất cho khóa demo được lưu ở out/test-builder/SCORM_ATLD-DEMO.zip;
giải nén vào out/test/course rồi chạy tests/test_player.py để kiểm tra 26/26 trên gói này.

Biến môi trường:
  CHROME_PATH  (tùy chọn) dùng Chrome cài sẵn thay vì Chromium của Playwright
  LARGE=1      thêm test xuất khóa giả lập ~1,5 GB (cần ~5 GB ổ trống, vài phút)
"""
import json, os, re, shutil, subprocess, sys, tempfile, time, zipfile
from openpyxl import load_workbook
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
URL = "http://localhost:8766/"
DEMO = os.path.join(ROOT, "demo-course")
SHOTS = os.path.join(ROOT, "out", "test-builder") + os.sep
CHROME = os.environ.get("CHROME_PATH")
results = []

def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(extra) if extra else ""))

# Playwright không bấm được hộp thoại "Lưu file" thật -> thay bằng bộ nhớ riêng của trình duyệt (OPFS),
# cùng kiểu ghi FileSystemWritableFileStream như khi lưu xuống ổ cứng.
SAVE_STUB = """window.showSaveFilePicker = async (o) => {
  const d = await navigator.storage.getDirectory(); window.__saved = o.suggestedName;
  return d.getFileHandle(o.suggestedName, { create: true }); };"""
PULL_SAVED = """async () => { const d = await navigator.storage.getDirectory();
  const f = await (await d.getFileHandle(window.__saved)).getFile();
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = window.__saved;
  document.body.appendChild(a); a.click(); }"""
NO_PICKER = "delete window.showSaveFilePicker; delete window.showDirectoryPicker; delete window.showOpenFilePicker;"
# Hộp chọn thư mục kiểu mới (Chrome/Edge) cũng không bấm được -> thư mục giả, nạp file qua một ô chọn file ẩn.
# getFile() luôn trả bản mới nhất trong __fake, giống trình duyệt đọc lại file trên ổ cứng.
FAKE_DIR = """window.__fake = new Map();
window.__fakeDir = (prefix, name) => ({ kind: 'directory', name, queryPermission: async () => 'granted',
  async *values() { const seen = new Set();
    for (const p of [...window.__fake.keys()]) { if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length), i = rest.indexOf('/');
      if (i < 0) yield { kind: 'file', name: rest, getFile: async () => window.__fake.get(p) };
      else if (!seen.has(rest.slice(0, i))) { seen.add(rest.slice(0, i)); yield window.__fakeDir(prefix + rest.slice(0, i) + '/', rest.slice(0, i)); } } } });
window.showDirectoryPicker = async () => window.__fakeDir('', window.__fakeName);"""

def fake_folder(page, folder):
    """Nạp thư mục thật vào thư mục giả rồi bấm Chọn thư mục khóa."""
    page.evaluate("""() => { const i = document.createElement('input'); i.type = 'file'; i.id = '__in';
        i.webkitdirectory = true; i.hidden = true; document.body.appendChild(i); }""")
    page.set_input_files("#__in", folder)
    page.evaluate("""() => { const fs = [...document.getElementById('__in').files]; window.__fakeName = fs[0].webkitRelativePath.split('/')[0];
        window.__fake.clear(); fs.forEach(f => window.__fake.set(f.webkitRelativePath.split('/').slice(1).join('/'), f)); }""")
    page.click("#folderBtn")

def fake_put(page, path, src):
    """Ghi đè / thêm 1 file vào thư mục giả (như người dùng sửa Excel rồi lưu)."""
    page.evaluate("() => { const i = document.createElement('input'); i.type = 'file'; i.id = '__one'; i.hidden = true; document.body.appendChild(i); }")
    page.set_input_files("#__one", src)
    page.evaluate(f"""() => {{ const i = document.getElementById('__one'); window.__fake.set({json.dumps(path)}, i.files[0]); i.remove(); }}""")

def zip_info(path):
    z = zipfile.ZipFile(path)
    js = z.read("course.js").decode("utf-8")
    return {"bad": z.testzip(), "names": sorted(z.namelist()),
            "course": json.loads(js[js.index("=") + 1:].strip().rstrip(";")),
            "descriptor": [i.filename for i in z.infolist() if i.flag_bits & 8],
            "stored": sorted(i.filename for i in z.infolist() if i.compress_type == zipfile.ZIP_STORED)}

def same_as_python(path, course_dir, label):
    ref_dir = tempfile.mkdtemp()
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_scorm.py"), os.path.join(DEMO, "ATLD-DEMO.xlsx"), course_dir, ref_dir], check=True, capture_output=True)
    a, r = zip_info(path), zip_info(os.path.join(ref_dir, "SCORM_ATLD-DEMO.zip"))
    shutil.rmtree(ref_dir)
    check(f"{label}: zip hợp lệ, CRC đúng", a["bad"] is None, a["bad"])
    check(f"{label}: cùng danh sách file với build_scorm.py", a["names"] == r["names"])
    check(f"{label}: cùng kiểu nén, không dùng data descriptor", a["stored"] == r["stored"] and not a["descriptor"], (a["stored"], a["descriptor"]))
    dur = all(abs(x["duration"] - y["duration"]) <= 1 for x, y in zip(a["course"]["videos"], r["course"]["videos"]))
    strip = lambda c: {**c, "videos": [{k: v for k, v in x.items() if k != "duration"} for x in c["videos"]]}
    check(f"{label}: course.js cùng nội dung (thời lượng ±1 giây)", dur and strip(a["course"]) == strip(r["course"]))

def load_demo(page, folder=DEMO):
    page.goto(URL)
    page.set_input_files("#folder", folder)
    page.wait_for_selector(".verdict.ok, .verdict.bad", timeout=120000)

def broken_excel(path):
    """Khóa demo bị làm sai 5 loại lỗi."""
    wb = load_workbook(os.path.join(DEMO, "ATLD-DEMO.xlsx"))
    wb["Thông tin khóa"]["B2"] = "ATLD DEMO"        # mã khóa có khoảng trắng
    wb["Video"]["C4"] = "02_bao-ho-ca-nhan.mp"      # sai tên file video
    q = wb["Câu hỏi"]
    q["C3"] = "02:00"                               # vượt thời lượng video 55 giây
    q["B5"] = 9                                     # video số ngoài phạm vi
    q["I7"] = "E"                                   # đáp án không hợp lệ
    q["F8"] = None                                  # bỏ trống phương án ở giữa
    wb.save(path)

os.makedirs(SHOTS, exist_ok=True)
tmp = tempfile.mkdtemp()
bad = os.path.join(tmp, "loi.xlsx")
broken_excel(bad)

with sync_playwright() as p:
    opts = {"headless": True}
    if CHROME:
        opts["executable_path"] = CHROME
    b = p.chromium.launch(**opts)
    page = b.new_page(viewport={"width": 1366, "height": 768})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("response", lambda r: errors.append("404 " + r.url) if r.status >= 400 else None)
    page.goto(URL)

    check("Bước 2, 3 khóa khi chưa chọn thư mục", all("locked" in page.get_attribute(f"#step{i}", "class") for i in (2, 3)))
    check("Chưa chọn thư mục: chưa hiện thanh Kiểm tra lại", page.locator("#topbar").is_hidden())
    page.set_input_files("#folder", DEMO)  # chỉ chọn thư mục: Builder tự tìm ATLD-DEMO.xlsx
    page.wait_for_selector(".verdict.ok, .verdict.bad", timeout=30000)
    check("Tự tìm thấy file Excel trong thư mục", page.inner_text("#excelStatus") == "File Excel: ATLD-DEMO.xlsx", page.inner_text("#excelStatus"))
    check("Khóa demo: không có lỗi", page.locator(".verdict.ok").count() == 1, page.inner_text(".verdict"))
    bar = page.inner_text("#topbar")
    check("Thanh trên cùng: tên Excel, giờ đọc, không có lỗi", re.search(r"ATLD-DEMO\.xlsx · đọc lúc \d\d:\d\d:\d\d · không có lỗi", bar), bar)
    check("Trình duyệt chọn thư mục kiểu cũ: nút ghi Chọn lại thư mục", "Chọn lại thư mục" in page.inner_text("#recheck"))
    s = page.inner_text(".summary")
    check("Tóm tắt: mã khóa", "ATLD-DEMO" in s)
    check("Tóm tắt: tên khóa", "An toàn lao động cơ bản (Demo)" in s)
    check("Tóm tắt: tổng thời lượng 2 phút 45 giây", "2 phút 45 giây" in s, s)
    nums = dict(re.findall(r"(Số video|Câu pop-up|Câu ngân hàng đề)\n(\d+)", s))
    check("Tóm tắt: 3 video · 4 pop-up · 6 câu", nums == {"Số video": "3", "Câu pop-up": "4", "Câu ngân hàng đề": "6"}, nums)
    check("Tóm tắt: luật thi", "Đạt từ 80% · 3 lượt · 5 câu mỗi lần (rút từ 6) · 10 phút" in s, s)
    check("Cảnh báo pop-up cách nhau < 1 phút", "chỉ cách pop-up 00:15" in page.inner_text("#check"))
    check("Bước 3 (kiểm tra) đánh dấu xong", "done" in page.get_attribute("#step3", "class"))
    page.screenshot(path=SHOTS + "1_demo_ok.png", full_page=True)

    # ---- Xuất gói (ghi thẳng xuống "ổ cứng")
    check("Bước 5 mở khi không có lỗi", "locked" not in page.get_attribute("#step5", "class"))
    page.add_init_script(SAVE_STUB)
    page.evaluate("() => {" + SAVE_STUB + "}")
    page.click("#exportBtn")
    page.wait_for_selector("#exportState .verdict", timeout=60000)
    check("Xuất xong, báo đã lưu", "Đã lưu SCORM_ATLD-DEMO.zip" in page.inner_text("#exportState"), page.inner_text("#exportState"))
    wd = page.inner_text("table.workday")
    check("Thông tin Workday: tên, mã, mô tả, 3 phút",
          all(x in wd for x in ("An toàn lao động cơ bản (Demo)", "ATLD-DEMO", "Khóa demo minh họa")) and re.search(r"Total Course Duration\)\s+3\b", wd), wd)
    page.screenshot(path=SHOTS + "3_xuat_xong.png", full_page=True)
    with page.expect_download() as dl:
        page.evaluate(PULL_SAVED)
    zip_path = SHOTS + "SCORM_ATLD-DEMO.zip"
    dl.value.save_as(zip_path)
    same_as_python(zip_path, DEMO, "Gói ghi xuống ổ cứng")

    # ---- Bước 2: đặt pop-up bằng nút bấm
    page.context.grant_permissions(["clipboard-read", "clipboard-write"])
    check("Bước 2 mở", "locked" not in page.get_attribute("#step2", "class"))
    check("Bước 2: chọn được 3 video", page.locator("#pvSelect option").count() == 3)
    check("Bước 2: Excel đã có danh sách video thì không hiện Copy danh sách video", page.locator("#pvCopyVideos").count() == 0)
    check("Bước 2: hiện pop-up đã có trong Excel", "00:15, 00:40" in page.inner_text("#pvExisting"), page.inner_text("#pvExisting"))
    def place(video_no, sec):
        page.select_option("#pvSelect", str(video_no - 1))
        page.wait_for_function("document.getElementById('pvVideo').readyState >= 1")
        page.evaluate(f"""() => new Promise((ok) => {{ const v = document.getElementById('pvVideo');
            v.addEventListener('seeked', ok, {{ once: true }}); v.currentTime = {sec}; }})""")
        page.click("#pvAdd")
    place(1, 15.6)
    check("Đặt pop-up: đồng hồ hiện 00:15 khi video ở giây 15,6", page.inner_text("#pvClock") == "00:15", page.inner_text("#pvClock"))
    # khung hình ở giây 15,6 của video demo có đồng hồ 0:00:15: chụp lại để đối chiếu bằng mắt
    page.locator("#pvVideo").screenshot(path=SHOTS + "4_dat_popup_15s.png")
    place(2, 33.2)
    place(1, 15.1)  # cùng giây 15 với mốc đầu: không thêm trùng
    rows = page.locator("table.placed tbody tr").all_inner_texts()
    check("Đặt pop-up: bảng có đúng 2 mốc, sắp theo video", [r.split("\t")[:3] for r in rows] == [["POPUP", "1", "00:15"], ["POPUP", "2", "00:33"]], rows)
    page.click("#pvCopy")
    clip = page.evaluate("navigator.clipboard.readText()")
    check("Copy bảng: dán được vào 3 cột Loại, Video số, Mốc thời gian", clip == "POPUP\t1\t00:15\r\nPOPUP\t2\t00:33", repr(clip))
    page.set_input_files("#folder", DEMO)  # chọn lại thư mục sau khi sửa Excel
    page.wait_for_selector("#pvList table.placed", timeout=30000)
    check("Chọn lại thư mục: vẫn giữ các mốc đã đặt", page.locator("table.placed tbody tr").count() == 2)
    check("Chọn lại thư mục: vẫn ở video đang xem (video 1, giây 15)", page.input_value("#pvSelect") == "0" and page.inner_text("#pvClock") == "00:15", (page.input_value("#pvSelect"), page.inner_text("#pvClock")))
    page.screenshot(path=SHOTS + "5_dat_popup.png", full_page=True)

    # ---- Bước 4: xem thử bằng Player thật
    check("Bước 4 mở", "locked" not in page.get_attribute("#step4", "class"))
    page.click("#pvOpen")
    page.wait_for_selector("#pvFrame")
    f = page.frame_locator("#pvFrame")
    f.locator("#courseTitle").wait_for()
    fr = next(x for x in page.frames if x.url.endswith("/player/preview.html"))
    check("Xem thử: hiện tên khóa và nhãn Xem thử", fr.inner_text("#courseTitle") == "An toàn lao động cơ bản (Demo)" and fr.locator(".preview-badge").count() == 1)
    fr.wait_for_function("document.getElementById('vid') && document.getElementById('vid').readyState >= 1", timeout=15000)
    check("Xem thử: video phát từ máy người dùng (Blob URL)", fr.evaluate("document.getElementById('vid').src").startswith("blob:"))
    check("Xem thử: bài 2 và bài kiểm tra đang khóa", fr.evaluate("[1, 3].every(i => document.querySelectorAll('#tocList li')[i].classList.contains('locked'))"))
    fr.evaluate("() => { const v = document.getElementById('vid'); v.muted = true; v.currentTime = 30; }")
    time.sleep(0.8)
    check("Xem thử: chặn tua tới", fr.evaluate("document.getElementById('vid').currentTime") < 2, fr.evaluate("document.getElementById('vid').currentTime"))
    fr.evaluate("document.getElementById('vid').playbackRate = 4")
    time.sleep(0.3)
    check("Xem thử: tốc độ tối đa 2x", fr.evaluate("document.getElementById('vid').playbackRate") == 2)
    fr.evaluate("() => { const v = document.getElementById('vid'); v.playbackRate = 2; v.play(); }")
    fr.wait_for_selector("#pop.show", timeout=20000)
    t_pop = fr.evaluate("document.getElementById('vid').currentTime")
    check("Xem thử: pop-up hiện ở mốc 0:15", 14.9 <= t_pop <= 16.5, round(t_pop, 2))
    page.screenshot(path=SHOTS + "6_xem_thu.png", full_page=True)
    fr.click("#resetBtn")  # nút Xóa tiến độ của Player: tải lại khung
    page.wait_for_function("document.getElementById('pvFrame').contentDocument.getElementById('courseTitle')?.textContent === 'An toàn lao động cơ bản (Demo)'", timeout=15000)
    check("Xem thử: Xóa tiến độ (tải lại khung) vẫn chạy", True)
    page.click("#pvClose")
    check("Xem thử: đóng được", page.locator("#pvFrame").count() == 0)

    page.set_input_files("#excel", bad)  # nút "Chọn file Excel khác"
    page.wait_for_selector(".verdict.bad", timeout=30000)
    check("Chọn file Excel khác: dùng file đó", page.inner_text("#excelStatus") == "File Excel: loi.xlsx", page.inner_text("#excelStatus"))
    check("Thanh trên cùng: báo số lỗi", re.search(r"loi\.xlsx · đọc lúc \S+ · 7 lỗi", page.inner_text("#topbar")), page.inner_text("#topbar"))
    items = page.locator(".list.errors li").all_inner_texts()
    expect = [
        "Sheet Thông tin khóa, dòng 2: Mã khóa 'ATLD DEMO'",
        "Sheet Video, dòng 4: không tìm thấy video '02_bao-ho-ca-nhan.mp' trong thư mục bạn chọn. Có phải ý bạn là '02_bao-ho-ca-nhan.mp4' (trong 'videos')?",
        "Sheet Câu hỏi, dòng 3: mốc 02:00 vượt quá thời lượng video 1 (00:55)",
        "Sheet Câu hỏi, dòng 5: 'Video số' phải từ 1 đến 3",
        "Sheet Câu hỏi, dòng 7: đáp án đúng 'E' không hợp lệ",
        "Sheet Câu hỏi, dòng 8: cần ít nhất phương án A, B",
    ]
    for e in expect:
        ok = any(i.startswith(e) for i in items)
        check("Báo lỗi: " + e[:60], ok, "" if ok else items)
    check("Có lỗi thì bước 3 không đánh dấu xong", "done" not in page.get_attribute("#step3", "class"))
    check("Có lỗi thì bước 5 khóa", "locked" in page.get_attribute("#step5", "class"))
    check("Có lỗi thì bước 4 (xem thử) khóa", "locked" in page.get_attribute("#step4", "class"))
    check("Có lỗi vẫn đặt pop-up được (bước 2 mở)", "locked" not in page.get_attribute("#step2", "class"))
    page.screenshot(path=SHOTS + "2_loi.png", full_page=True)

    check("Không có lỗi JavaScript / 404", not errors, errors)

    # ---- Chrome/Edge: chọn thư mục 1 lần, sửa Excel rồi bấm Kiểm tra lại (không chọn lại)
    page5 = b.new_page(viewport={"width": 1366, "height": 768})
    page5.context.grant_permissions(["clipboard-read", "clipboard-write"])
    page5.on("pageerror", lambda e: errors.append(str(e)))
    page5.add_init_script(FAKE_DIR)
    page5.goto(URL)
    no_excel = os.path.join(tmp, "Khoa moi")
    for sub, name in (("10. Tong ket", "03_nhan-dien-moi-nguy.mp4"), ("2. Bao ho", "02_bao-ho-ca-nhan.mp4"), ("1. Mo dau", "01_vi-sao-an-toan.mp4")):
        os.makedirs(os.path.join(no_excel, sub))
        shutil.copy(os.path.join(DEMO, "videos", name), os.path.join(no_excel, sub, name))
    fake_folder(page5, no_excel)
    page5.wait_for_selector("#pvSelect", timeout=30000)
    check("Chưa có Excel: báo chưa có file, kèm link Excel mẫu", "Chưa có file Excel" in page5.inner_text("#check") and page5.locator("#check a[download]").count() == 1, page5.inner_text("#check"))
    check("Chưa có Excel: thanh trên cùng có nút Kiểm tra lại", "Chưa có file Excel" in page5.inner_text("#barText") and page5.inner_text("#recheck") == "🔄 Kiểm tra lại", page5.inner_text("#topbar"))
    check("Chưa có Excel: vẫn đặt pop-up được (bước 2 mở)", "locked" not in page5.get_attribute("#step2", "class"))
    opts_ = page5.locator("#pvSelect option").all_inner_texts()
    check("Chưa có Excel: video xếp theo thứ tự thư mục (1, 2, 10)", opts_ == ["Video 1: 01_vi-sao-an-toan", "Video 2: 02_bao-ho-ca-nhan", "Video 3: 03_nhan-dien-moi-nguy"], opts_)
    page5.click("#pvCopyVideos")
    clip = page5.evaluate("navigator.clipboard.readText()")
    check("Copy danh sách video: dán được vào cột STT, Tên bài, Tên file video",
          clip == "1\t01_vi-sao-an-toan\t01_vi-sao-an-toan.mp4\r\n2\t02_bao-ho-ca-nhan\t02_bao-ho-ca-nhan.mp4\r\n3\t03_nhan-dien-moi-nguy\t03_nhan-dien-moi-nguy.mp4", repr(clip))
    page5.select_option("#pvSelect", "2")
    page5.wait_for_function("document.getElementById('pvVideo').readyState >= 1")
    page5.evaluate("() => new Promise((ok) => { const v = document.getElementById('pvVideo'); v.addEventListener('seeked', ok, { once: true }); v.currentTime = 20.4; })")
    page5.click("#pvAdd")
    check("Chưa có Excel: đặt được mốc cho video 3", page5.locator("table.placed tbody tr").all_inner_texts()[0].split("\t")[:3] == ["POPUP", "3", "00:20"])
    page5.screenshot(path=SHOTS + "7_chua_co_excel.png", full_page=True)

    # Lưu Excel demo vào thư mục (video demo nằm trong thư mục con, Excel ghi tên file: tìm theo tên)
    fake_put(page5, "Khoa moi.xlsx", os.path.join(DEMO, "ATLD-DEMO.xlsx"))
    page5.click("#recheck")
    page5.wait_for_selector(".verdict.ok, .verdict.bad", timeout=30000)
    check("Kiểm tra lại: thấy file Excel vừa lưu, không có lỗi", page5.locator(".verdict.ok").count() == 1 and "Khoa moi.xlsx" in page5.inner_text("#barText"), page5.inner_text("#check")[:300])
    check("Kiểm tra lại: mốc đã đặt vẫn còn, Video số theo Excel", page5.locator("table.placed tbody tr").all_inner_texts()[0].split("\t")[:3] == ["POPUP", "3", "00:20"])
    t1 = re.search(r"đọc lúc (\S+)", page5.inner_text("#barText")).group(1)
    time.sleep(1.1)
    fake_put(page5, "Khoa moi.xlsx", bad)  # sửa Excel (thành bản có lỗi) rồi lưu
    page5.click("#recheck")
    page5.wait_for_selector(".verdict.bad", timeout=30000)
    bar = page5.inner_text("#barText")
    check("Kiểm tra lại: đọc bản Excel mới, báo lỗi, giờ đọc đổi", "lỗi" in bar and re.search(r"đọc lúc (\S+)", bar).group(1) != t1, bar)
    check("Kiểm tra lại: có lỗi thì khóa xem thử và xuất gói", all("locked" in page5.get_attribute(f"#step{i}", "class") for i in (4, 5)))
    fake_put(page5, "Ban cu.xlsx", os.path.join(DEMO, "ATLD-DEMO.xlsx"))
    page5.click("#recheck")
    page5.wait_for_selector(".verdict.bad", timeout=30000)
    check("Nhiều file Excel: giữ file đang dùng, hiện danh sách để đổi", page5.is_visible("#excelPick") and page5.input_value("#excelPick") == "Khoa moi.xlsx", page5.inner_text("#excelRow"))
    page5.select_option("#excelPick", "Ban cu.xlsx")
    page5.wait_for_selector(".verdict.ok", timeout=30000)
    check("Nhiều file Excel: đổi sang file khác thì kiểm tra file đó", "Ban cu.xlsx" in page5.inner_text("#barText"), page5.inner_text("#barText"))
    page5.screenshot(path=SHOTS + "8_kiem_tra_lai.png", full_page=True)
    page5.close()
    check("Không có lỗi JavaScript (Kiểm tra lại)", not errors, errors)

    # ---- Trình duyệt không có showSaveFilePicker (Firefox/Safari): tải về từ bộ nhớ
    page2 = b.new_page(viewport={"width": 1366, "height": 768})
    page2.add_init_script(NO_PICKER)
    load_demo(page2)
    with page2.expect_download() as dl:
        page2.click("#exportBtn")
    fallback = os.path.join(tmp, "fallback.zip")
    dl.value.save_as(fallback)
    check("Không có hộp thoại lưu: tải về được", dl.value.suggested_filename == "SCORM_ATLD-DEMO.zip", dl.value.suggested_filename)
    same_as_python(fallback, DEMO, "Gói tải về từ bộ nhớ")
    page2.close()

    # ---- Thư mục giống khóa Hội nhập: mỗi video một thư mục chủ đề, Excel nằm ngay trong thư mục
    nested = os.path.join(tmp, "E-learning")
    for sub, name in (("01. Tong quan", "01_vi-sao-an-toan.mp4"), ("02. Chinh sach phuc loi", "02_bao-ho-ca-nhan.mp4"), ("05. ATLD", "03_nhan-dien-moi-nguy.mp4")):
        os.makedirs(os.path.join(nested, sub))
        shutil.copy(os.path.join(DEMO, "videos", name), os.path.join(nested, sub, name))
    shutil.copy(os.path.join(DEMO, "ATLD-DEMO.xlsx"), os.path.join(nested, "ATLD-DEMO.xlsx"))
    open(os.path.join(nested, "~$ATLD-DEMO.xlsx"), "wb").close()  # file khóa Excel tạo ra khi đang mở file
    page4 = b.new_page(viewport={"width": 1366, "height": 768})
    page4.add_init_script(SAVE_STUB)
    load_demo(page4, folder=nested)
    check("Video trong thư mục con: đếm đủ 3 video", page4.inner_text("#folderStatus") == "E-learning (3 video)", page4.inner_text("#folderStatus"))
    check("Video trong thư mục con: không có lỗi", page4.locator(".verdict.ok").count() == 1, page4.inner_text("#check")[:300])
    page4.click("#exportBtn")
    page4.wait_for_selector("#exportState .verdict", timeout=60000)
    with page4.expect_download() as dl:
        page4.evaluate(PULL_SAVED)
    nested_zip = os.path.join(tmp, "nested.zip")
    dl.value.save_as(nested_zip)
    same_as_python(nested_zip, nested, "Video trong thư mục con")
    page4.close()

    # ---- Khóa giả lập ~1,5 GB: ghi streaming, RAM không tăng theo dung lượng
    if os.environ.get("LARGE"):
        big_dir = os.path.join(tmp, "big")
        shutil.copytree(DEMO, big_dir)
        video = os.path.join(big_dir, "videos", "01_vi-sao-an-toan.mp4")
        pad = 1536 * 1024 * 1024
        with open(video, "ab") as f:  # thêm box "free" (hợp lệ trong MP4) ở cuối cho file nặng 1,5 GB
            f.write(pad.to_bytes(4, "big") + b"free")
            f.truncate(os.path.getsize(video) + pad - 8)
        # hồ sơ trình duyệt lưu trên đĩa (hồ sơ mặc định của Playwright nằm trong RAM, OPFS bị giới hạn dung lượng)
        ctx3 = p.chromium.launch_persistent_context(os.path.join(tmp, "profile"), viewport={"width": 1366, "height": 768}, **opts)
        page3 = ctx3.new_page()
        page3.add_init_script(SAVE_STUB)
        load_demo(page3, folder=big_dir)
        check("Khóa 1,5 GB: không có lỗi", page3.locator(".verdict.ok").count() == 1, page3.inner_text(".verdict"))
        rss = lambda: sum(int(x) for x in subprocess.run(["ps", "-C", "chrome,headless_shell", "-o", "rss="], capture_output=True, text=True).stdout.split()) // 1024
        base, peak, slow, t0 = rss(), 0, 0, time.time()
        page3.click("#exportBtn")
        while not page3.locator("#exportState .verdict").count():
            t = time.time(); page3.evaluate("1"); slow = max(slow, time.time() - t)
            peak = max(peak, rss()); time.sleep(0.5)
        took = time.time() - t0
        check("Khóa 1,5 GB: xuất xong", "Đã lưu" in page3.inner_text("#exportState"), page3.inner_text("#exportState"))
        check("Khóa 1,5 GB: RAM tăng < 500 MB", peak - base < 500, f"tăng {peak - base} MB, mất {took:.0f} giây")
        check("Khóa 1,5 GB: trang không bị treo (phản hồi < 1 giây)", slow < 1, f"{slow:.2f} giây")
        with page3.expect_download(timeout=600000) as dl:
            page3.evaluate(PULL_SAVED)
        big_zip = os.path.join(tmp, "big.zip")
        dl.value.save_as(big_zip)
        same_as_python(big_zip, big_dir, "Khóa 1,5 GB")
        ctx3.close()
    b.close()

shutil.rmtree(tmp)
passed = sum(1 for r in results if r[1])
print(f"\n{passed}/{len(results)} PASS")
raise SystemExit(0 if passed == len(results) else 1)
