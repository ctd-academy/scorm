/* ============================================================
   Coteccons SCORM Player — lớp giao tiếp SCORM 1.2
   - Có LMS (Workday, SCORM Cloud): dùng API thật của LMS.
   - Không có LMS (mở file trực tiếp / xem thử trong Builder):
     dùng LMS giả lập, lưu tiến độ vào trình duyệt để test.
   ============================================================ */
(function (w) {
  "use strict";

  function findAPI(win) {
    var tries = 0;
    try {
      while (win && !win.API && win.parent && win.parent !== win && tries < 12) {
        win = win.parent; tries++;
      }
      return win && win.API ? win.API : null;
    } catch (e) { return null; }
  }

  var api = findAPI(w);
  if (!api && w.opener) { try { api = findAPI(w.opener); } catch (e) {} }

  // ---- LMS giả lập (chỉ dùng khi xem thử) ----
  function MockAPI(key) {
    var data = {};
    try { data = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) { data = {}; }
    if (!data["cmi.core.lesson_status"]) data["cmi.core.lesson_status"] = "not attempted";
    if (!data["cmi.core.student_name"]) data["cmi.core.student_name"] = "Học viên, Xem thử";
    function save() { try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {} }
    this.LMSInitialize = function () { return "true"; };
    this.LMSGetValue = function (k) { return data[k] !== undefined ? String(data[k]) : ""; };
    this.LMSSetValue = function (k, v) { data[k] = String(v); return "true"; };
    this.LMSCommit = function () { save(); return "true"; };
    this.LMSFinish = function () { save(); return "true"; };
    this.LMSGetLastError = function () { return "0"; };
    this.reset = function () { data = {}; try { localStorage.removeItem(key); } catch (e) {} };
  }

  var initialized = false, finished = false;

  w.SCORM = {
    connected: !!api,
    preview: !api,
    log: [],
    start: function (courseId) {
      if (!api) api = new MockAPI("ctd-scorm-preview-" + (courseId || "course"));
      var r = api.LMSInitialize("");
      initialized = (String(r) === "true");
      this._rec("LMSInitialize", "", r);
      return initialized;
    },
    get: function (k) {
      if (!api) return "";
      var r = api.LMSGetValue(k);
      this._rec("LMSGetValue", k, r);
      return r === null || r === undefined ? "" : String(r);
    },
    set: function (k, v) {
      if (!api || finished) return "false";
      var r = api.LMSSetValue(k, String(v));
      this._rec("LMSSetValue", k + " = " + String(v).slice(0, 80), r);
      return r;
    },
    commit: function () {
      if (!api || finished) return "false";
      var r = api.LMSCommit("");
      this._rec("LMSCommit", "", r);
      return r;
    },
    finish: function () {
      if (!api || finished) return "false";
      finished = true;
      var r = api.LMSFinish("");
      this._rec("LMSFinish", "", r);
      return r;
    },
    resetPreview: function () { if (api && api.reset) api.reset(); },
    _rec: function (call, args, result) {
      this.log.push({ call: call, args: args, result: String(result) });
      if (this.log.length > 300) this.log.shift();
    }
  };
})(window);
