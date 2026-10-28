#!/usr/bin/env python3
"""Tạo 3 file PDF demo (slide 16:9) cho khóa demo: demo-course/docs/

Cách dùng:  python3 tools/make_demo_docs.py      (cần playwright + Chromium; CHROME_PATH nếu dùng Chrome cài sẵn)
"""
import os
from html import escape
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "demo-course", "docs")

DOCS = {
    "slide-bai-1.pdf": ("Bài 1 – Vì sao an toàn là trên hết", [
        ("An toàn là trên hết", ["Mỗi ngày làm việc an toàn là một ngày trở về nhà an toàn", "An toàn được ưu tiên trước tiến độ và chi phí"]),
        ("Trách nhiệm của ai?", ["Tất cả mọi người trên công trường", "Phát hiện nguy hiểm: dừng lại và báo ngay"]),
        ("3 thói quen mỗi ngày", ["Kiểm tra bảo hộ trước khi vào công trường", "Đọc biển báo khu vực làm việc", "Không làm khi chưa rõ quy trình"]),
        ("Ghi nhớ", ["Không có công việc nào gấp đến mức không thể làm an toàn"]),
    ]),
    "slide-bai-3.pdf": ("Bài 3 – Nhận diện mối nguy tại công trường", [
        ("Mối nguy là gì?", ["Bất cứ điều gì có thể gây chấn thương hoặc bệnh tật"]),
        ("Các mối nguy thường gặp", ["Làm việc trên cao", "Điện", "Vật rơi", "Máy móc, thiết bị nâng"]),
        ("Khi phát hiện mối nguy", ["Rào chắn khu vực", "Báo người phụ trách", "Không tự xử lý khi chưa được đào tạo"]),
    ]),
    "checklist-moi-nguy.pdf": ("Checklist nhận diện mối nguy", [
        ("Trước khi bắt đầu ca làm việc", ["☐ Lối đi thông thoáng", "☐ Lan can, sàn thao tác chắc chắn", "☐ Dây điện không bị hở", "☐ Biển báo đầy đủ"]),
    ]),
}

CSS = """
@page { size: 1280px 720px; margin: 0; }
body { margin: 0; font-family: 'DejaVu Sans', sans-serif; }

.s { width: 1280px; height: 720px; box-sizing: border-box; padding: 70px 90px; page-break-after: always; position: relative; background: #fff; }
.s.cover { background: #16315e; color: #fff; display: flex; flex-direction: column; justify-content: center; }
.cover small { color: #5fd1c1; font-size: 26px; letter-spacing: .1em; }
.cover h1 { font-size: 60px; margin: 18px 0 0; }
h2 { color: #16315e; font-size: 46px; margin: 0 0 40px; border-bottom: 6px solid #5fd1c1; padding-bottom: 16px; }
li { font-size: 34px; color: #434447; margin-bottom: 22px; }
.s:last-child { page-break-after: auto; }
.no { position: absolute; right: 50px; bottom: 30px; color: #636468; font-size: 20px; }
"""

def html(title, slides):
    pages = [f'<div class="s cover"><small>KHÓA DEMO · COTECCONS L&amp;OD</small><h1>{escape(title)}</h1></div>']
    for i, (h, items) in enumerate(slides, 2):
        lis = "".join(f"<li>{escape(x)}</li>" for x in items)
        pages.append(f'<div class="s"><h2>{escape(h)}</h2><ul>{lis}</ul><span class="no">{i}</span></div>')
    return f"<!doctype html><meta charset='utf-8'><style>{CSS}</style>{''.join(pages)}"

os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(**({"executable_path": os.environ["CHROME_PATH"]} if os.environ.get("CHROME_PATH") else {}))
    page = b.new_page()
    for name, (title, slides) in DOCS.items():
        page.set_content(html(title, slides))
        page.pdf(path=os.path.join(OUT, name), width="1280px", height="720px", print_background=True)
        print("Đã tạo", os.path.join(OUT, name))
    b.close()
