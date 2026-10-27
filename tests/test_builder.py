"""Test giao diện Builder M1 (Playwright + Chromium): chọn file -> màn hình kiểm tra.

Chuẩn bị (từ gốc repo):
  (cd builder && npm install && npm run build)
  npx http-server builder/dist -p 8766 -s -c-1 &
  python3 tests/test_builder.py

Biến môi trường: CHROME_PATH (tùy chọn) nếu muốn dùng Chrome cài sẵn thay vì Chromium của Playwright.
"""
import os, re, shutil, tempfile
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
    page.screenshot(path=SHOTS + "2_loi.png", full_page=True)

    check("Không có lỗi JavaScript / 404", not errors, errors)
    b.close()

shutil.rmtree(tmp)
passed = sum(1 for r in results if r[1])
print(f"\n{passed}/{len(results)} PASS")
raise SystemExit(0 if passed == len(results) else 1)
