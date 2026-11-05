// Trang hướng dẫn cho trainer (huong-dan.html): dùng chung giao diện với Builder.
// Các bước và mục tra cứu đóng sẵn (<details>); bấm link "#..." thì mở đúng mục đó; khi in thì mở hết.
import "./style.css";
import "./guide.css";

function openTarget() {
  const el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (el && el.tagName === "DETAILS") {
    el.open = true;
    el.scrollIntoView({ block: "start" });
  }
}
window.addEventListener("hashchange", openTarget);
openTarget();
// Mở ngay khi bấm link (không chờ "hashchange", có thể đến trễ), kể cả khi bấm lại link cũ
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  const el = a && document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1)));
  if (el && el.tagName === "DETAILS") el.open = true;
});

const all = () => document.querySelectorAll("details");
let wasOpen = [];
window.addEventListener("beforeprint", () => {
  wasOpen = [...all()].map((d) => d.open);
  all().forEach((d) => (d.open = true));
});
window.addEventListener("afterprint", () => all().forEach((d, i) => (d.open = wasOpen[i] ?? d.open)));
document.getElementById("printBtn").onclick = () => print();
