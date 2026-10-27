"""Test giao diện Builder (Playwright + Chromium): chọn file -> kiểm tra -> xuất gói SCORM.

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
NO_PICKER = "delete window.showSaveFilePicker;"

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

def load_demo(page, excel=None, folder=DEMO):
    page.goto(URL)
    page.set_input_files("#excel", excel or os.path.join(DEMO, "ATLD-DEMO.xlsx"))
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

    check("Bước 2 khóa khi chưa chọn file", "locked" in page.get_attribute("#step2", "class"))
    page.set_input_files("#excel", os.path.join(DEMO, "ATLD-DEMO.xlsx"))
    page.set_input_files("#folder", DEMO)
    page.wait_for_selector(".verdict.ok, .verdict.bad", timeout=30000)
    check("Khóa demo: không có lỗi", page.locator(".verdict.ok").count() == 1, page.inner_text(".verdict"))
    s = page.inner_text(".summary")
    check("Tóm tắt: mã khóa", "ATLD-DEMO" in s)
    check("Tóm tắt: tên khóa", "An toàn lao động cơ bản (Demo)" in s)
    check("Tóm tắt: tổng thời lượng 2 phút 45 giây", "2 phút 45 giây" in s, s)
    nums = dict(re.findall(r"(Số video|Câu pop-up|Câu ngân hàng đề)\n(\d+)", s))
    check("Tóm tắt: 3 video · 4 pop-up · 6 câu", nums == {"Số video": "3", "Câu pop-up": "4", "Câu ngân hàng đề": "6"}, nums)
    check("Tóm tắt: luật thi", "Đạt từ 80% · 3 lượt · 5 câu mỗi lần (rút từ 6) · 10 phút" in s, s)
    check("Cảnh báo pop-up cách nhau < 1 phút", "chỉ cách pop-up 00:15" in page.inner_text("#check"))
    check("Bước 2 đánh dấu xong", "done" in page.get_attribute("#step2", "class"))
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

    page.set_input_files("#excel", bad)
    page.wait_for_selector(".verdict.bad", timeout=30000)
    items = page.locator(".list.errors li").all_inner_texts()
    expect = [
        "Sheet Thông tin khóa, dòng 2: Mã khóa 'ATLD DEMO'",
        "Sheet Video, dòng 4: không tìm thấy video '02_bao-ho-ca-nhan.mp' trong thư mục bạn chọn. Có phải ý bạn là '02_bao-ho-ca-nhan.mp4'?",
        "Sheet Câu hỏi, dòng 3: mốc 02:00 vượt quá thời lượng video 1 (00:55)",
        "Sheet Câu hỏi, dòng 5: 'Video số' phải từ 1 đến 3",
        "Sheet Câu hỏi, dòng 7: đáp án đúng 'E' không hợp lệ",
        "Sheet Câu hỏi, dòng 8: cần ít nhất phương án A, B",
    ]
    for e in expect:
        ok = any(i.startswith(e) for i in items)
        check("Báo lỗi: " + e[:60], ok, "" if ok else items)
    check("Có lỗi thì bước 2 không đánh dấu xong", "done" not in page.get_attribute("#step2", "class"))
    check("Có lỗi thì bước 5 khóa", "locked" in page.get_attribute("#step5", "class"))
    page.screenshot(path=SHOTS + "2_loi.png", full_page=True)

    check("Không có lỗi JavaScript / 404", not errors, errors)

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
