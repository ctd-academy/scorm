/* ============================================================
   Coteccons SCORM Player v1
   Khung học dùng chung cho mọi khóa. Nội dung từng khóa nằm ở course.js.
   Luật chơi (đã chốt với L&OD):
   - Học tuần tự; bài sau mở khi bài trước xong
   - Video: chỉ tua lại trong phần đã xem, tốc độ tối đa 2x,
     tự dừng khi rời trang/chuyển tab
   - Pop-up: không tính điểm; trả lời sai -> xem lại đoạn trước câu hỏi
   - Bài thi cuối: tùy chỉnh theo khóa (số câu, thời gian, hiện đáp án,
     điểm đạt, số lượt); hết lượt -> khóa bài thi, liên hệ L&OD
   ============================================================ */
(function () {
  "use strict";

  // ---------------------------------------------------------------- dữ liệu khóa
  var C = window.COURSE || { id: "x", title: "Chưa có nội dung", videos: [], popups: [], quiz: [] };
  var D = C.settings || {};
  var SET = {
    passScore: num(D.passScore, 80),
    maxAttempts: Math.max(1, num(D.maxAttempts, 3)),
    questionsPerAttempt: num(D.questionsPerAttempt, 0),
    timeLimitMinutes: num(D.timeLimitMinutes, 0),
    showAnswers: !!D.showAnswers,
    maxSpeed: Math.min(2, num(D.maxSpeed, 2)),
    contact: D.contact || "Bạn đã dùng hết lượt làm bài. Vui lòng liên hệ L&OD: Mr. Minh (minhvt02@coteccons.vn) hoặc cta@coteccons.vn để được hỗ trợ đăng ký lại."
  };
  var VIDEOS = C.videos || [];
  var POPUPS = (C.popups || []).map(function (p, i) { p.id = i; return p; });
  var QUIZ = C.quiz || [];
  var HAS_QUIZ = QUIZ.length > 0;
  var N_Q = SET.questionsPerAttempt > 0 ? Math.min(SET.questionsPerAttempt, QUIZ.length) : QUIZ.length;
  var SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2].filter(function (s) { return s <= SET.maxSpeed; });

  function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function fmt(sec) { sec = Math.max(0, Math.floor(sec || 0)); var m = Math.floor(sec / 60), s = sec % 60; return m + ":" + (s < 10 ? "0" : "") + s; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // ---------------------------------------------------------------- trạng thái
  // v: [đã xem xa nhất (giây), vị trí lần cuối, xong 0/1] cho từng video
  // p: id các pop-up đã trả lời đúng · a: số lượt thi đã dùng
  // s: điểm cao nhất (-1 = chưa thi) · q: 0 chưa xong, 1 đạt, 2 hết lượt
  var S = { v: [], p: [], a: 0, s: -1, q: 0 };
  var startedAt = Date.now();
  var view = 0;            // số thứ tự video, hoặc "quiz"
  var curRate = 1;
  var vid = null, popupOpen = false, lastSave = 0;
  var quizTimer = null;

  SCORM.start(C.id);
  load();

  function load() {
    var raw = SCORM.get("cmi.suspend_data");
    if (raw) { try { var o = JSON.parse(raw); if (o && o.v) S = o; } catch (e) {} }
    for (var i = 0; i < VIDEOS.length; i++) if (!S.v[i]) S.v[i] = [0, 0, 0];
    S.v.length = VIDEOS.length;
    S.p = S.p || []; S.a = S.a || 0; S.s = (S.s === undefined) ? -1 : S.s; S.q = S.q || 0;
    // Lượt cuối bị bỏ dở (rời trang khi đang thi) cũng tính là đã dùng
    if (HAS_QUIZ && S.q === 0 && S.a >= SET.maxAttempts) S.q = 2;

    var st = SCORM.get("cmi.core.lesson_status");
    if (st === "" || st === "not attempted") SCORM.set("cmi.core.lesson_status", "incomplete");
    pushStatus();

    var loc = SCORM.get("cmi.core.lesson_location");
    if (loc === "quiz" && allVideosDone()) view = "quiz";
    else { var n = parseInt(loc, 10); view = (!isNaN(n) && n >= 0 && n < VIDEOS.length && unlocked(n)) ? n : firstOpen(); }
  }

  function save(force) {
    var now = Date.now();
    if (!force && now - lastSave < 10000) return;
    lastSave = now;
    var compact = { v: S.v.map(function (x) { return [Math.round(x[0]), Math.round(x[1]), x[2]]; }), p: S.p, a: S.a, s: S.s, q: S.q };
    SCORM.set("cmi.suspend_data", JSON.stringify(compact));
    SCORM.set("cmi.core.lesson_location", String(view));
    SCORM.commit();
  }

  function pushStatus() {
    if (HAS_QUIZ) {
      if (S.s >= 0) {
        SCORM.set("cmi.core.score.min", 0); SCORM.set("cmi.core.score.max", 100);
        SCORM.set("cmi.core.score.raw", S.s);
      }
      if (S.q === 1) SCORM.set("cmi.core.lesson_status", "passed");
      else if (S.q === 2) SCORM.set("cmi.core.lesson_status", "failed");
    } else if (allVideosDone() && VIDEOS.length) {
      SCORM.set("cmi.core.lesson_status", "completed");
    }
  }

  function allVideosDone() { for (var i = 0; i < S.v.length; i++) if (!S.v[i][2]) return false; return true; }
  function unlocked(i) { return i === 0 || (S.v[i - 1] && S.v[i - 1][2] === 1); }
  function firstOpen() { for (var i = 0; i < VIDEOS.length; i++) if (!S.v[i][2]) return i; return HAS_QUIZ ? "quiz" : Math.max(0, VIDEOS.length - 1); }
  function courseDone() { return HAS_QUIZ ? S.q === 1 : allVideosDone(); }

  // ---------------------------------------------------------------- khung chung
  function renderShell() {
    $("brand").innerHTML = '<img class="logo" src="' + esc(C.logo || "logo.png") + '" alt="Coteccons">';
    $("courseTitle").textContent = C.title || "";
    document.title = C.title || "Coteccons e-Learning";
    var name = SCORM.get("cmi.core.student_name");
    $("learner").textContent = name ? "Học viên: " + name : "";
    if (SCORM.preview) {
      $("previewBadge").innerHTML = '<span class="preview-badge">Xem thử<button id="resetBtn">Xóa tiến độ</button></span>';
      $("resetBtn").onclick = function () { SCORM.resetPreview(); location.reload(); };
    }
    $("tocToggle").onclick = function () { $("toc").classList.toggle("open"); };
  }

  function renderProgress() {
    var total = VIDEOS.length + (HAS_QUIZ ? 1 : 0), done = 0;
    S.v.forEach(function (x) { if (x[2]) done++; });
    if (HAS_QUIZ && S.q === 1) done++;
    var pct = total ? Math.round(done / total * 100) : 0;
    $("pctNum").textContent = pct + "%";
    $("pctBar").style.width = pct + "%";
    $("tocLabel").textContent = "Mục lục · " + done + "/" + total + " phần";
  }

  function renderToc() {
    var h = "";
    VIDEOS.forEach(function (v, i) {
      var done = S.v[i][2] === 1, open = unlocked(i);
      var cls = (view === i ? "active " : "") + (done ? "done " : "") + (!open ? "locked" : "");
      h += '<li class="' + cls + '"><button data-i="' + i + '"' + (open ? "" : " disabled") + '>' +
        '<span class="ic">' + (done ? "✓" : (open ? i + 1 : "🔒")) + "</span>" +
        "<span>" + esc(v.title) + '<span class="meta">' + (v.duration ? fmt(v.duration) : "Video") + "</span></span></button></li>";
    });
    if (HAS_QUIZ) {
      var qOpen = allVideosDone();
      var qcls = "quiz " + (view === "quiz" ? "active " : "") + (S.q === 1 ? "done " : "") + (!qOpen ? "locked" : "");
      var meta = S.q === 1 ? "Đã đạt · " + S.s + " điểm" : S.q === 2 ? "Đã hết lượt" : N_Q + " câu · đạt từ " + SET.passScore + "%";
      h += '<li class="' + qcls + '"><button data-i="quiz"' + (qOpen ? "" : " disabled") + '>' +
        '<span class="ic">' + (S.q === 1 ? "✓" : (qOpen ? "?" : "🔒")) + "</span>" +
        '<span>Bài kiểm tra cuối khóa<span class="meta">' + meta + "</span></span></button></li>";
    }
    $("tocList").innerHTML = h;
    Array.prototype.forEach.call($("tocList").querySelectorAll("button"), function (b) {
      b.onclick = function () { var t = b.getAttribute("data-i"); go(t === "quiz" ? "quiz" : parseInt(t, 10)); $("toc").classList.remove("open"); };
    });
    renderProgress();
  }

  function go(target) {
    if (quizTimer && view === "quiz" && target !== "quiz") {
      if (!confirm("Bạn đang làm bài. Rời đi bây giờ sẽ mất lượt này. Vẫn rời đi?")) return;
      stopTimer();
    }
    if (vid) { vid.pause(); vid.removeAttribute("src"); vid.load(); vid = null; }
    view = target;
    save(true);
    renderToc();
    if (view === "quiz") renderQuiz(); else renderVideo(view);
    window.scrollTo(0, 0);
  }

  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }

  // ---------------------------------------------------------------- video
  function renderVideo(i) {
    var v = VIDEOS[i], st = S.v[i];
    var pops = POPUPS.filter(function (p) { return p.video === i; }).sort(function (a, b) { return a.time - b.time; });
    var speedOpts = SPEEDS.map(function (s) { return '<option value="' + s + '"' + (s === curRate ? " selected" : "") + ">" + s + "x</option>"; }).join("");
    var nextLabel = i < VIDEOS.length - 1 ? "Bài tiếp theo →" : (HAS_QUIZ ? "Làm bài kiểm tra →" : "Hoàn thành");

    $("main").innerHTML =
      "<h2>" + esc(v.title) + "</h2>" +
      '<div class="sub">Bài ' + (i + 1) + "/" + VIDEOS.length + (pops.length ? " · " + pops.length + " câu hỏi giữa bài" : "") + "</div>" +
      '<div class="vwrap"><video id="vid" playsinline preload="metadata" controls controlsList="nodownload noplaybackrate" disablePictureInPicture src="' + esc(v.src) + '"></video>' +
      '<div class="overlay" id="pop"></div></div>' +
      '<div class="vbar"><span class="watch" id="watch"></span>' +
      '<label>Tốc độ <select id="speed">' + speedOpts + "</select></label></div>" +
      '<div class="next-row"><button class="btn primary" id="nextBtn"' + (st[2] ? "" : " disabled") + ">" + nextLabel + "</button></div>";

    vid = $("vid");
    var maxW = st[0], seekGuard = false;

    function updateWatch() {
      var passed = pops.filter(function (p) { return S.p.indexOf(p.id) >= 0; }).length;
      var dur = vid && isFinite(vid.duration) ? vid.duration : v.duration || 0;
      $("watch").innerHTML = (st[2] ? "<b>✓ Đã hoàn thành</b>" : "Đã xem tới <b>" + fmt(maxW) + "</b>" + (dur ? " / " + fmt(dur) : "")) +
        (pops.length ? " · Câu hỏi: <b>" + passed + "/" + pops.length + "</b>" : "");
    }
    updateWatch();

    $("speed").onchange = function () { curRate = parseFloat(this.value); vid.playbackRate = curRate; };

    vid.addEventListener("loadedmetadata", function () {
      vid.playbackRate = curRate;
      if (!v.duration) v.duration = vid.duration;
      if (st[2]) maxW = Math.max(maxW, vid.duration);
      var resume = Math.min(st[1], maxW);
      if (resume > 1 && resume < vid.duration - 2) { seekGuard = true; vid.currentTime = resume; }
      updateWatch();
    });
    vid.addEventListener("ratechange", function () {
      if (vid.playbackRate > SET.maxSpeed) { vid.playbackRate = SET.maxSpeed; toast("Tốc độ tối đa là " + SET.maxSpeed + "x"); }
    });
    vid.addEventListener("seeking", function () {
      if (seekGuard) return;
      if (vid.currentTime > maxW + 0.75) {
        seekGuard = true;
        vid.currentTime = maxW;
        toast("Bạn chỉ có thể tua lại phần đã xem");
      }
    });
    vid.addEventListener("seeked", function () { seekGuard = false; });
    vid.addEventListener("play", function () { if (popupOpen) vid.pause(); });
    vid.addEventListener("timeupdate", function () {
      if (seekGuard || popupOpen) return;
      var t = vid.currentTime;
      if (t > maxW && t - maxW < 3) maxW = t;
      st[0] = Math.max(st[0], maxW); st[1] = t;
      // pop-up chưa trả lời đúng gần nhất trong video này
      for (var k = 0; k < pops.length; k++) {
        var p = pops[k];
        if (S.p.indexOf(p.id) >= 0) continue;
        if (t >= p.time) { showPopup(p, k); return; }
        break;
      }
      if (!st[2] && isFinite(vid.duration) && maxW >= vid.duration - 0.5) markDone();
      updateWatch();
      save(false);
    });
    vid.addEventListener("ended", function () { markDone(); });
    vid.addEventListener("pause", function () { st[1] = vid.currentTime; save(true); });

    function markDone() {
      if (st[2]) return;
      var pending = pops.some(function (p) { return S.p.indexOf(p.id) < 0; });
      if (pending) return;
      st[2] = 1; st[0] = Math.max(st[0], vid.duration || st[0]);
      pushStatus(); save(true);
      renderToc(); updateWatch();
      $("nextBtn").disabled = false;
      toast(i < VIDEOS.length - 1 ? "Hoàn thành bài " + (i + 1) + ". Bài tiếp theo đã mở." : (HAS_QUIZ ? "Bạn đã xem hết video. Bài kiểm tra đã mở." : "Bạn đã hoàn thành khóa học!"));
    }

    function showPopup(p, k) {
      popupOpen = true;
      vid.pause();
      exitFullscreen();
      var segStart = 0;
      for (var j = k - 1; j >= 0; j--) { segStart = pops[j].time; break; }
      var box = $("pop");
      box.innerHTML = '<div class="card"><span class="tag">Câu hỏi nhanh</span><h4>' + esc(p.q) + "</h4>" +
        p.options.map(function (o, oi) { return '<button class="opt" data-o="' + oi + '">' + String.fromCharCode(65 + oi) + ". " + esc(o) + "</button>"; }).join("") +
        '<div id="popFb"></div></div>';
      box.classList.add("show");
      Array.prototype.forEach.call(box.querySelectorAll(".opt"), function (b) {
        b.onclick = function () {
          var pick = parseInt(b.getAttribute("data-o"), 10), ok = pick === p.answer;
          Array.prototype.forEach.call(box.querySelectorAll(".opt"), function (x) { x.disabled = true; });
          b.classList.add(ok ? "right" : "wrong");
          var fb = $("popFb");
          if (ok) {
            fb.innerHTML = '<div class="fb ok">Chính xác!' + (p.explain ? " " + esc(p.explain) : "") + '</div><button class="btn teal" id="popGo">Tiếp tục xem ▶</button>';
            $("popGo").onclick = function () {
              S.p.push(p.id); save(true);
              box.classList.remove("show"); popupOpen = false; updateWatch(); vid.play();
            };
          } else {
            fb.innerHTML = '<div class="fb no">Chưa đúng. Hãy xem lại đoạn video trước câu hỏi này nhé.</div><button class="btn primary" id="popBack">↺ Xem lại từ ' + fmt(segStart) + "</button>";
            $("popBack").onclick = function () {
              box.classList.remove("show"); popupOpen = false;
              seekGuard = true; vid.currentTime = segStart; vid.play();
            };
          }
        };
      });
    }

    $("nextBtn").onclick = function () {
      if (i < VIDEOS.length - 1) go(i + 1);
      else if (HAS_QUIZ) go("quiz");
      else renderCourseDone();
    };
  }

  function exitFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
      if (vid && vid.webkitDisplayingFullscreen && vid.webkitExitFullscreen) vid.webkitExitFullscreen();
    } catch (e) {}
  }

  // Rời trang / chuyển tab -> dừng video
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && vid && !vid.paused) { vid.pause(); toast("Video đã tạm dừng vì bạn rời khỏi trang"); }
  });

  function renderCourseDone() {
    $("main").innerHTML = '<div class="result"><div class="big ok">✓</div><h2>Bạn đã hoàn thành khóa học</h2>' +
      '<p class="sub">Kết quả đã được ghi nhận. Bạn có thể đóng cửa sổ này.</p></div>';
  }

  // ---------------------------------------------------------------- bài kiểm tra
  function renderQuiz() {
    var left = Math.max(0, SET.maxAttempts - S.a);
    var head = "<h2>Bài kiểm tra cuối khóa</h2>";

    if (S.q === 1) {
      $("main").innerHTML = head + '<div class="result"><div class="big ok">' + S.s + '</div><p><b>Bạn đã ĐẠT bài kiểm tra.</b></p>' +
        '<p class="sub">Khóa học đã hoàn thành. Giấy chứng nhận sẽ có trên Workday.</p></div>';
      return;
    }
    if (S.q === 2) {
      $("main").innerHTML = head + '<div class="result"><div class="big no">' + Math.max(0, S.s) + '</div>' +
        "<p><b>Bạn đã dùng hết " + SET.maxAttempts + " lượt làm bài.</b></p></div>" +
        '<div class="contact">' + esc(SET.contact) + "</div>";
      return;
    }

    $("main").innerHTML = head +
      '<div class="sub">Hoàn thành bài kiểm tra để kết thúc khóa học.</div>' +
      '<div class="info">' +
      "<div><small>Số câu hỏi</small><b>" + N_Q + "</b></div>" +
      "<div><small>Thời gian</small><b>" + (SET.timeLimitMinutes ? SET.timeLimitMinutes + " phút" : "Không giới hạn") + "</b></div>" +
      "<div><small>Điểm đạt</small><b>" + SET.passScore + "%</b></div>" +
      "<div><small>Lượt còn lại</small><b>" + left + "/" + SET.maxAttempts + "</b></div></div>" +
      (S.s >= 0 ? '<p class="sub">Điểm cao nhất của bạn: <b>' + S.s + "</b></p>" : "") +
      '<div class="note">Lượt làm bài được tính ngay khi bạn bấm <b>Bắt đầu</b>. Rời trang hoặc đóng cửa sổ khi đang làm bài sẽ mất lượt đó.</div>' +
      '<div class="next-row"><button class="btn primary" id="startQuiz">Bắt đầu làm bài (lượt ' + (S.a + 1) + "/" + SET.maxAttempts + ")</button></div>";
    $("startQuiz").onclick = startQuiz;
  }

  function startQuiz() {
    S.a++; save(true);
    var picked = shuffle(QUIZ).slice(0, N_Q).map(function (q) {
      var order = shuffle(q.options.map(function (_, i) { return i; }));
      return { q: q.q, options: order.map(function (i) { return q.options[i]; }), answer: order.indexOf(q.answer), explain: q.explain };
    });

    var h = '<h2>Bài kiểm tra cuối khóa</h2><div class="timer"><span>Lượt ' + S.a + "/" + SET.maxAttempts + " · " + N_Q + ' câu</span>' +
      (SET.timeLimitMinutes ? '<span>Còn lại: <b id="clock"></b></span>' : '<span id="answered">Đã trả lời: 0/' + N_Q + "</span>") + "</div>";
    picked.forEach(function (q, qi) {
      h += '<div class="qitem" id="q' + qi + '"><p>' + (qi + 1) + ". " + esc(q.q) + "</p>";
      q.options.forEach(function (o, oi) {
        h += '<label><input type="radio" name="q' + qi + '" value="' + oi + '"><span>' + String.fromCharCode(65 + oi) + ". " + esc(o) + "</span></label>";
      });
      h += "</div>";
    });
    h += '<div class="next-row"><button class="btn primary" id="submitQuiz">Nộp bài</button></div>';
    $("main").innerHTML = h;

    $("main").onchange = (function () {
      var a = $("answered"); if (a) a.textContent = "Đã trả lời: " + countAnswered() + "/" + N_Q;
    });
    function countAnswered() { return $("main").querySelectorAll("input:checked").length; }

    if (SET.timeLimitMinutes) {
      var deadline = Date.now() + SET.timeLimitMinutes * 60000;
      var tick = function () {
        var ms = deadline - Date.now(), c = $("clock");
        if (!c) return;
        c.textContent = fmt(ms / 1000); c.className = ms < 60000 ? "low" : "";
        if (ms <= 0) { stopTimer(); toast("Hết giờ, bài đã được nộp tự động"); grade(picked); }
      };
      quizTimer = setInterval(tick, 500); tick();
    } else { quizTimer = true; }

    $("submitQuiz").onclick = function () {
      var n = countAnswered();
      if (n < N_Q && !confirm("Bạn còn " + (N_Q - n) + " câu chưa trả lời. Vẫn nộp bài?")) return;
      stopTimer(); grade(picked);
    };
  }

  function stopTimer() { if (quizTimer && quizTimer !== true) clearInterval(quizTimer); quizTimer = null; }

  function grade(picked) {
    var right = 0;
    picked.forEach(function (q, qi) {
      var el = document.querySelector("input[name=q" + qi + "]:checked");
      q.pick = el ? parseInt(el.value, 10) : -1;
      if (q.pick === q.answer) right++;
    });
    var score = N_Q ? Math.round(right / N_Q * 100) : 0;
    var passed = score >= SET.passScore;
    S.s = Math.max(S.s, score);
    if (passed) { S.q = 1; S.s = Math.max(S.s, score); }
    else if (S.a >= SET.maxAttempts) S.q = 2;
    pushStatus(); save(true);
    renderToc();

    var left = SET.maxAttempts - S.a;
    var h = '<h2>Kết quả bài kiểm tra</h2><div class="result"><div class="big ' + (passed ? "ok" : "no") + '">' + score + "</div>" +
      "<p><b>" + right + "/" + N_Q + " câu đúng · " + (passed ? "ĐẠT" : "CHƯA ĐẠT") + "</b></p>" +
      '<p class="sub">' + (passed ? "Chúc mừng! Khóa học đã hoàn thành. Giấy chứng nhận sẽ có trên Workday." :
        left > 0 ? "Điểm đạt là " + SET.passScore + "%. Bạn còn " + left + " lượt làm bài." : "Bạn đã dùng hết " + SET.maxAttempts + " lượt làm bài.") + "</p></div>";
    if (!passed && left <= 0) h += '<div class="contact">' + esc(SET.contact) + "</div>";

    if (SET.showAnswers) {
      h += '<h3 style="color:var(--navy);margin-top:22px">Xem lại bài làm</h3>';
      picked.forEach(function (q, qi) {
        var ok = q.pick === q.answer;
        h += '<div class="qitem ' + (ok ? "r" : "w") + '"><p>' + (qi + 1) + ". " + esc(q.q) + "</p>" +
          '<div class="ans">' + (ok ? "✓ Đúng" : "✗ Bạn chọn: " + (q.pick >= 0 ? esc(q.options[q.pick]) : "(bỏ trống)")) +
          "<br>Đáp án đúng: <b>" + esc(q.options[q.answer]) + "</b>" + (q.explain ? "<br>" + esc(q.explain) : "") + "</div></div>";
      });
    }
    if (!passed && left > 0) h += '<div class="next-row"><button class="btn" id="rewatch">Xem lại video</button><button class="btn primary" id="retry">Làm lại</button></div>';
    $("main").innerHTML = h;
    window.scrollTo(0, 0);
    if ($("retry")) $("retry").onclick = function () { renderQuiz(); };
    if ($("rewatch")) $("rewatch").onclick = function () { go(0); };
  }

  // ---------------------------------------------------------------- kết thúc phiên
  var ended = false;
  function finish() {
    if (ended) return; ended = true;
    if (vid) S.v[view][1] = vid.currentTime;
    var s = Math.floor((Date.now() - startedAt) / 1000);
    var hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
    SCORM.set("cmi.core.session_time", (hh < 10 ? "000" : hh < 100 ? "00" : "0") + hh + ":" + (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss);
    SCORM.set("cmi.core.exit", courseDone() || S.q === 2 ? "" : "suspend");
    save(true);
    SCORM.finish();
  }
  window.addEventListener("pagehide", finish);
  window.addEventListener("beforeunload", finish);

  // ---------------------------------------------------------------- khởi động
  renderShell();
  renderToc();
  if (view === "quiz") renderQuiz(); else if (VIDEOS.length) renderVideo(view);
  window.__ctd = { S: S, C: C, go: go };
})();
