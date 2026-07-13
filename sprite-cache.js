/* 精灵图本地优先 + 在线回退
 * 在 data.js 之后、game.js / rpg.js 之前加载。
 * 把 POKEMON_LIST 里每个 mon.sprite 重写为本地路径 sprites/{id}.png，
 * 渲染时优先读本地；本地缺失则在 error 事件里回退到在线 URL（断网则显示编号占位）。
 * 通过 document 捕获阶段统一处理，无需改动任何模板里的 onerror。
 */
(function () {
  "use strict";
  if (!window.POKEMON_LIST) return;

  var online = {};
  function basename(url) { return url.split("/").pop(); }

  window.POKEMON_LIST.forEach(function (m) {
    if (m.sprite) {
      online[basename(m.sprite)] = m.sprite;
      m.sprite = "sprites/" + basename(m.sprite);
    }
    if (m.mega) {
      m.mega.forEach(function (mm) {
        if (mm.sprite) {
          online[basename(mm.sprite)] = mm.sprite;
          mm.sprite = "sprites/" + basename(mm.sprite);
        }
      });
    }
  });
  window.__SPRITE_ONLINE = online;

  document.addEventListener("error", function (e) {
    var t = e.target;
    if (!t || t.tagName !== "IMG") return;
    var src = t.getAttribute("src") || "";
    if (src.indexOf("sprites/") !== 0) return; // 只处理精灵图
    // 取消内联 onerror，避免其把图片隐藏后无法回退到在线图
    t.onerror = null; t.removeAttribute("onerror");
    var key = src.split("/").pop();
    var u = online[key];
    if (u && t.src !== u) { t.src = u; return; } // 回退在线
    // 在线也拿不到：显示编号占位（与模板里预留的兄弟元素配合）
    t.style.display = "none";
    if (t.nextElementSibling) t.nextElementSibling.style.display = "flex";
  }, true);
})();
