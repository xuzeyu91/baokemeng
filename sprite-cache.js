/* 精灵图本地优先 + 在线回退
 * 在 data.js 之后、game.js / rpg.js 之前加载。
 * 把 POKEMON_LIST 里每个 mon.sprite 重写为本地路径 sprites/{id}.png，
 * 并新增 mon.shiny_sprite = sprites/shiny/{id}.png。
 * 渲染时优先读本地；本地缺失则在 error 事件里回退到在线 URL（断网则显示编号占位）。
 * 通过 document 捕获阶段统一处理，无需改动任何模板里的 onerror。
 */
(function () {
  "use strict";
  if (!window.POKEMON_LIST) return;

  var online = {};       // basename -> 普通在线 URL
  var onlineShiny = {};  // basename -> 闪光在线 URL
  function basename(url) { return url.split("/").pop(); }
  function shinyUrl(url) {
    if (!url) return null;
    if (url.indexOf("/pokemon/shiny/") !== -1) return url;
    return url.replace("/pokemon/", "/pokemon/shiny/");
  }

  window.POKEMON_LIST.forEach(function (m) {
    if (m.sprite) {
      var name = basename(m.sprite);
      var orig = m.sprite;
      online[name] = orig;
      m.sprite = "sprites/" + name;
      m.shiny_sprite = "sprites/shiny/" + name;
      onlineShiny[name] = shinyUrl(orig);
    }
    if (m.mega) {
      m.mega.forEach(function (mm) {
        if (mm.sprite) {
          var name = basename(mm.sprite);
          var orig = mm.sprite;
          online[name] = orig;
          mm.sprite = "sprites/" + name;
          mm.shiny_sprite = "sprites/shiny/" + name;
          onlineShiny[name] = shinyUrl(orig);
        }
      });
    }
  });
  window.__SPRITE_ONLINE = online;
  window.__SPRITE_SHINY_ONLINE = onlineShiny;

  document.addEventListener("error", function (e) {
    var t = e.target;
    if (!t || t.tagName !== "IMG") return;
    var src = t.getAttribute("src") || "";
    if (src.indexOf("sprites/") !== 0) return; // 只处理精灵图

    // 取消内联 onerror，避免其把图片隐藏后无法回退到在线图
    t.onerror = null; t.removeAttribute("onerror");

    var key = basename(src);
    var isShiny = src.indexOf("/shiny/") !== -1;
    var u = isShiny ? onlineShiny[key] : online[key];
    if (u && t.src !== u) { t.src = u; return; } // 回退在线

    // 在线也拿不到：显示编号占位（与模板里预留的兄弟元素配合）
    t.style.display = "none";
    if (t.nextElementSibling) t.nextElementSibling.style.display = "flex";
  }, true);
})();
