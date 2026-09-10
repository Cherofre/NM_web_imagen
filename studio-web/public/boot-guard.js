// Last-resort safety net for the desktop shell and the web build.
//
// If the Studio bundle cannot run at all — the file fails to parse, the script is
// blocked, or the app throws before its first paint — the user sees a plain white
// window with nothing to report. That is the worst possible failure to debug on
// someone else's machine. This guard turns it into a readable, copyable message
// while staying completely silent whenever the app boots normally.
(function () {
  var NOTICE_ID = "nm-boot-guard";
  var renderedAt = 0;
  var shown = false;

  function bootstrapped() {
    var app = document.getElementById("root");
    return Boolean(app && app.childElementCount > 0);
  }

  function dismiss() {
    var notice = document.getElementById(NOTICE_ID);
    if (notice && notice.parentNode) {
      notice.parentNode.removeChild(notice);
    }
    shown = false;
  }

  function show(reason) {
    if (shown || bootstrapped()) return;
    shown = true;

    var notice = document.getElementById(NOTICE_ID);
    if (!notice) {
      notice = document.createElement("div");
      notice.id = NOTICE_ID;
      notice.setAttribute("role", "alert");
      notice.style.cssText = [
        "position:fixed",
        "inset:auto 16px 16px 16px",
        "z-index:2147483647",
        "max-width:720px",
        "margin:0 auto",
        "padding:14px 16px",
        "border:1px solid #d6d3d1",
        "border-radius:12px",
        "background:#fff",
        "color:#1c1917",
        "font:14px/1.6 system-ui,'Segoe UI','Microsoft YaHei',sans-serif",
        "box-shadow:0 8px 28px rgba(28,25,23,.18)",
        "white-space:pre-wrap",
        "word-break:break-word"
      ].join(";");

      var title = document.createElement("div");
      title.textContent = "界面没有正常加载 / The interface failed to load";
      title.style.cssText = "font-weight:600;margin-bottom:6px";

      var body = document.createElement("div");
      body.textContent = reason;

      var hint = document.createElement("div");
      hint.style.cssText = "margin-top:8px;color:#57534e;font-size:13px";
      hint.textContent =
        "请把这段信息截图反馈；先完全退出程序再重新打开通常可以恢复。\n" +
        "Please report this message. Fully quit and reopen the app to retry.";

      notice.appendChild(title);
      notice.appendChild(body);
      notice.appendChild(hint);
      (document.body || document.documentElement).appendChild(notice);
    } else {
      notice.lastChild.textContent = reason;
    }
  }

  function describe(event) {
    if (!event) return "未知错误 / unknown error";
    if (event.message) return String(event.message);
    var target = event.target;
    if (target && target !== window && (target.src || target.href)) {
      return "资源加载失败 / failed to load: " + (target.src || target.href);
    }
    return "未知错误 / unknown error";
  }

  window.addEventListener(
    "error",
    function (event) {
      show(describe(event));
    },
    true
  );

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason;
    show(reason && reason.message ? String(reason.message) : String(reason || "未处理的错误 / unhandled rejection"));
  });

  // The bundle runs with `defer`, so give it a few seconds. If #root never fills up we
  // surface that instead of leaving a silent blank window; the notice removes itself as
  // soon as the app does render, so a slow machine only sees it briefly.
  function watch() {
    if (bootstrapped()) {
      renderedAt = Date.now();
      dismiss();
      return;
    }
    if (renderedAt) return;
    if (Date.now() - startedAt > 6000) {
      show("界面脚本没有执行或执行后没有渲染任何内容。\nThe interface script did not run or rendered nothing.");
      return;
    }
    window.setTimeout(watch, 500);
  }

  var startedAt = Date.now();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watch);
  } else {
    watch();
  }
})();
