# CLAUDE.md – Coteccons SCORM Builder

Luật chung cho mọi trợ lý AI nằm ở `AGENTS.md` (nạp tự động bên dưới). Gọi người dùng là "Alex" nếu đó là Alex.

@AGENTS.md

## Ghi chú riêng cho Claude Code

- Môi trường cloud của Claude: Chromium có sẵn ở `/opt/pw-browsers/chromium`; Playwright Python có thể đòi bản khác và không tải được → chạy test với `CHROME_PATH=/opt/pw-browsers/chromium bash tests/run_all.sh`.
- Không cài được gì từ cdn.sheetjs.com hay cdn.playwright.dev.
