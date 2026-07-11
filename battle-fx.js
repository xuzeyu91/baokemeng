/* 宝可梦对战 — 3D 技能特效引擎 (dependency-free canvas)
 * 暴露 window.SkillFX.cast(side, move, r, opts)  —— 攻击技能弹道 + 命中爆发
 * 暴露 window.SkillFX.recover(side, amount)       —— 恢复能量特效（聚气光环）
 *  - 在攻击方宝可梦与防守方宝可梦之间发射"属性主题"的弹道
 *  - 出手前有"蓄力"阶段（攻击方凝聚发光能量球），命中时迸发对应属性的粒子 / 闪电 / 火球
 *  - 弹道走抛物线 + 拖尾 + 大小随进度变化(伪景深) -> 立体感
 *  - 命中时：双层冲击波环 + 白光闪 + 粒子爆发 + 防守方迸射碎屑
 *  - 无动画时自动停止 rAF 循环，省电
 */
(function () {
  "use strict";

  var canvas = null, ctx = null, W = 0, H = 0, dpr = 1;
  var beams = [], parts = [], rings = [], bolts = [], charges = [];
  var rafId = 0, lastT = 0;
  var reduceMotion = false;
  try {
    reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) {}

  // 每种属性的配色：core=高光 mid=主色 edge=描边
  var PALETTE = {
    fire:     { core: "#fff6d8", mid: "#ff9b2f", edge: "#e23a0c" },
    electric: { core: "#ffffff", mid: "#ffe45a", edge: "#f5b800" },
    water:    { core: "#eaf6ff", mid: "#56a8ff", edge: "#1f5fd0" },
    grass:    { core: "#eaffd9", mid: "#74cf42", edge: "#2f8f2a" },
    ice:      { core: "#ffffff", mid: "#a9e8ff", edge: "#4fb8e0" },
    normal:   { core: "#ffffff", mid: "#e6e6e6", edge: "#b9b9b9" },
    fighting: { core: "#ffd9c0", mid: "#ff7a3c", edge: "#b22a12" },
    poison:   { core: "#f3d6ff", mid: "#c45cff", edge: "#7a1fb0" },
    ground:   { core: "#f0e2c0", mid: "#c89a4e", edge: "#7a5a1e" },
    flying:   { core: "#ffffff", mid: "#cdbcff", edge: "#8a6fd0" },
    psychic:  { core: "#ffd6ec", mid: "#ff7ac0", edge: "#c01f7a" },
    bug:      { core: "#eaffd6", mid: "#a8d83a", edge: "#5a8f1e" },
    rock:     { core: "#e8ddc8", mid: "#b8a368", edge: "#6e5e34" },
    ghost:    { core: "#e9d6ff", mid: "#9a5cff", edge: "#5a1fb0" },
    dragon:   { core: "#ffffff", mid: "#b07bff", edge: "#5a2fd0" }
  };
  // 恢复能量（聚气）专属配色：青绿 + 金色
  var RECOVER_PAL = { core: "#eafff2", mid: "#5fe0a0", edge: "#1f9d57", gold: "#ffd86a" };

  function init() {
    if (canvas) return true;
    canvas = document.getElementById("fx3d");
    if (!canvas) return false;
    ctx = canvas.getContext("2d");
    if (!ctx) return false;
    resize();
    window.addEventListener("resize", resize);
    return true;
  }

  function resize() {
    if (!canvas || !ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function center(el) {
    if (el && typeof el.getBoundingClientRect === "function") {
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { x: W / 2, y: H / 2 };
  }

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function ensureLoop() {
    if (rafId) return;
    lastT = now();
    rafId = requestAnimationFrame(tick);
  }

  /* ---------- particle helpers ---------- */
  function mkPart(shape, x, y, vx, vy, size, life, color, grav, glow) {
    return {
      x: x, y: y, vx: vx, vy: vy, size: size,
      life: life, maxLife: life, color: color, shape: shape,
      rot: Math.random() * 6.2832, vr: (Math.random() - 0.5) * 8,
      grav: grav || 0, glow: !!glow
    };
  }
  function pick(pal) {
    var r = Math.random();
    return r < 0.5 ? pal.mid : (r < 0.85 ? pal.edge : pal.core);
  }
  function shapeFor(type) {
    switch (type) {
      case "fire": return "flame";
      case "electric": return "spark";
      case "water": return "drop";
      case "ice": return "shard";
      case "grass": return "leaf";
      case "rock": case "ground": return "rock";
      case "ghost": case "poison": return "bubble";
      case "flying": return "feather";
      case "psychic": return "ringlet";
      case "bug": return "bit";
      case "dragon": return "spark";
      default: return "star";
    }
  }
  function gravFor(type) {
    switch (type) {
      case "fire": return -25;
      case "electric": return 30;
      case "water": return 260;
      case "ice": return 140;
      case "grass": return 60;
      case "flying": return 20;
      case "ghost": return -10;
      case "psychic": return 10;
      case "poison": return 10;
      default: return 200;
    }
  }

  /* ---------- emit a burst ---------- */
  function emit(type, x, y, mult) {
    var pal = PALETTE[type] || PALETTE.normal;
    var sup = mult >= 2, weak = mult < 1;
    var base = (type === "fire") ? 26 : (type === "electric") ? 22 :
               (type === "ice" || type === "water") ? 20 : 16;
    var n = Math.round(base * (sup ? 1.5 : (weak ? 0.7 : 1)));
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * 6.2832;
      var spd = 70 + Math.random() * 210;
      var vx = Math.cos(ang) * spd;
      var vy = Math.sin(ang) * spd - (type === "fire" ? 50 : 0);
      var size = 2 + Math.random() * 4;
      var life = 0.4 + Math.random() * 0.55;
      parts.push(mkPart(shapeFor(type), x, y, vx, vy, size, life, pick(pal), gravFor(type), true));
    }
  }

  // 防守方被击中时的"迸射碎屑"：从命中中心向四周甩出，带重力
  function scatter(type, x, y, mult) {
    var pal = PALETTE[type] || PALETTE.normal;
    var n = mult >= 2 ? 16 : 10;
    for (var i = 0; i < n; i++) {
      var ang = -Math.PI + Math.random() * Math.PI; // 主要朝上/两侧甩
      var spd = 120 + Math.random() * 220;
      parts.push(mkPart(shapeFor(type),
        x + (Math.random() * 14 - 7), y - 4,
        Math.cos(ang) * spd, Math.sin(ang) * spd - 60,
        2.5 + Math.random() * 3, 0.45 + Math.random() * 0.4,
        pick(pal), 320, true));
    }
  }

  function pushBolt(x, y) {
    bolts.push({
      pts: makeBolt(x + (Math.random() * 50 - 25), y - 100, x + (Math.random() * 20 - 10), y),
      life: 0.24, maxLife: 0.24
    });
  }
  function makeBolt(x0, y0, x1, y1) {
    var pts = [{ x: x0, y: y0 }];
    var seg = 6;
    for (var i = 1; i < seg; i++) {
      var t = i / seg;
      pts.push({
        x: x0 + (x1 - x0) * t + (Math.random() * 30 - 15),
        y: y0 + (y1 - y0) * t + (Math.random() * 22 - 11)
      });
    }
    pts.push({ x: x1, y: y1 });
    return pts;
  }

  // 地面升腾的氛围微光，增加战场"空气感"
  function spawnAmbient(c) {
    if (!c) return;
    for (var i = 0; i < 5; i++) {
      parts.push(mkPart("star",
        c.x + (Math.random() * 70 - 35), c.y + 34 + Math.random() * 8,
        (Math.random() * 20 - 10), -8 - Math.random() * 26,
        1.4 + Math.random() * 1.4, 0.6 + Math.random() * 0.5,
        "rgba(255,255,255,0.7)", -10, false));
    }
  }

  function explosion(type, x, y, mult) {
    var pal = PALETTE[type] || PALETTE.normal;
    var sup = mult >= 2;
    // 双层冲击波环（第二条延迟、略小）
    rings.push({ x: x, y: y, t: 0, dur: 0.5, r0: 6, r1: sup ? 130 : 84, w: sup ? 6 : 4, color: pal.edge });
    rings.push({ x: x, y: y, t: -0.14, dur: 0.5, r0: 4, r1: sup ? 92 : 60, w: 3, color: pal.mid });
    // 白光闪（每次命中都有，提升打击感）
    parts.push(mkPart("flash", x, y, 0, 0, sup ? 40 : 28, 0.2, "#ffffff", 0, true));
    // 双份粒子爆发 + 防守方碎屑
    emit(type, x, y, mult);
    emit(type, x, y, mult);
    scatter(type, x, y, mult);
    if (type === "electric") { pushBolt(x, y); pushBolt(x, y); pushBolt(x, y); }
    if (type === "fire") {
      for (var i = 0; i < 9; i++) {
        parts.push(mkPart("flame", x + (Math.random() * 50 - 25), y,
          (Math.random() * 60 - 30), -60 - Math.random() * 90,
          3 + Math.random() * 4, 0.5 + Math.random() * 0.4, pick(pal), -40, true));
      }
    }
  }

  /* ---------- per-frame draw ---------- */
  function drawCharge(ch, s) {
    var pal = ch.pal;
    var pulse = 0.8 + 0.2 * Math.sin(ch.t * 22);
    ctx.save();
    ctx.translate(ch.x, ch.y);
    ctx.shadowColor = pal.mid;
    ctx.shadowBlur = 22 * s * pulse;
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 18 * s);
    g.addColorStop(0, pal.core);
    g.addColorStop(0.5, pal.mid);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 16 * s, 0, 6.2832);
    ctx.fill();
    ctx.restore();
    // 蓄力时向外飞溅的小火花
    if (parts.length < 360 && Math.random() < 0.6) {
      var a = Math.random() * 6.2832, sp = 40 + Math.random() * 60;
      parts.push(mkPart("spark", ch.x, ch.y,
        Math.cos(a) * sp, Math.sin(a) * sp, 1.5 + Math.random() * 1.5,
        0.3 + Math.random() * 0.2, pick(pal), 0, true));
    }
  }

  function drawProjectile(b, x, y, s) {
    var pal = b.pal;
    // 弹道拖尾（越靠尾部越淡）
    if (b.trail && b.trail.length > 1) {
      for (var ti = 0; ti < b.trail.length; ti++) {
        var tp = b.trail[ti];
        var a = ti / b.trail.length;
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = pal.mid;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 4.5 * a + 1, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // 电系：从攻击方拉出一道锯齿状闪电，强化"闪电"观感
    if (b.type === "electric") {
      ctx.save();
      ctx.strokeStyle = "rgba(255,225,80,0.6)";
      ctx.shadowColor = "#ffe14d";
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(b.x0, b.y0);
      var steps = 5;
      for (var s2 = 1; s2 < steps; s2++) {
        var tt2 = s2 / steps;
        var jx = b.x0 + (x - b.x0) * tt2 + (Math.random() * 16 - 8);
        var jy = b.y0 + (y - b.y0) * tt2 + (Math.random() * 16 - 8);
        ctx.lineTo(jx, jy);
      }
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
    }
    // 主体发光球
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = pal.mid;
    ctx.shadowBlur = 18 * s;
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16 * s);
    g.addColorStop(0, pal.core);
    g.addColorStop(0.45, pal.mid);
    g.addColorStop(1, pal.edge);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 13 * s, 0, 6.2832);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(0, 0, 5 * s, 0, 6.2832);
    ctx.fill();
    ctx.restore();

    if (parts.length < 420) {
      var px = x + (Math.random() * 10 - 5), py = y + (Math.random() * 10 - 5);
      if (b.type === "fire" && Math.random() < 0.85)
        parts.push(mkPart("flame", px, py, (Math.random() * 40 - 20), -30 - Math.random() * 40, 2 + Math.random() * 3, 0.35 + Math.random() * 0.3, pick(pal), -25, true));
      else if (b.type === "water" && Math.random() < 0.4)
        parts.push(mkPart("drop", px, py, (Math.random() * 30 - 15), 10 + Math.random() * 30, 2 + Math.random() * 2, 0.4, pick(pal), 240, true));
      else if (b.type === "electric" && Math.random() < 0.5)
        parts.push(mkPart("spark", px, py, (Math.random() * 60 - 30), (Math.random() * 60 - 30), 1.5 + Math.random() * 2, 0.3, pick(pal), 40, true));
      else if (b.type === "grass" && Math.random() < 0.3)
        parts.push(mkPart("leaf", px, py, (Math.random() * 50 - 25), -10 + Math.random() * 40, 3 + Math.random() * 3, 0.5, pick(pal), 60, true));
    }
  }

  function drawBolt(bl) {
    var pts = bl.pts;
    var a = Math.min(1, bl.life * 4);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,225,80,0.7)";
    ctx.shadowColor = "#ffe14d";
    ctx.shadowBlur = 14;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
    ctx.stroke();
    ctx.restore();
  }

  function drawRing(rg) {
    var a = 1 - Math.max(0, rg.t);
    var rad = rg.r0 + (rg.r1 - rg.r0) * Math.max(0, rg.t);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a * 0.8;
    ctx.translate(rg.x, rg.y);
    ctx.strokeStyle = rg.color;
    ctx.lineWidth = rg.w * (1 - rg.t) + 1;
    ctx.shadowColor = rg.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, 6.2832);
    ctx.stroke();
    ctx.restore();
  }

  function drawStar(c, R) {
    c.beginPath();
    for (var i = 0; i < 5; i++) {
      var a1 = -Math.PI / 2 + i * 2 * Math.PI / 5;
      c.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
      var a2 = a1 + Math.PI / 5;
      c.lineTo(Math.cos(a2) * R * 0.45, Math.sin(a2) * R * 0.45);
    }
    c.closePath();
    c.fill();
  }

  function drawParticle(p) {
    var a = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 10; }
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    switch (p.shape) {
      case "flame":
        ctx.beginPath(); ctx.arc(0, 0, p.size * (0.6 + a * 0.7), 0, 6.2832); ctx.fill(); break;
      case "spark":
        ctx.fillRect(-p.size * 0.5, -p.size * 1.6, p.size, p.size * 3.2); break;
      case "drop":
        ctx.beginPath(); ctx.ellipse(0, 0, p.size * 0.7, p.size * 1.3, 0, 0, 6.2832); ctx.fill(); break;
      case "shard":
        ctx.beginPath(); ctx.moveTo(0, -p.size * 1.6); ctx.lineTo(p.size, p.size); ctx.lineTo(-p.size, p.size); ctx.closePath(); ctx.fill(); break;
      case "leaf":
        ctx.beginPath(); ctx.ellipse(0, 0, p.size * 1.4, p.size * 0.7, 0, 0, 6.2832); ctx.fill(); break;
      case "rock":
        ctx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2); break;
      case "bubble":
        ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 6.2832); ctx.fill(); break;
      case "feather":
        ctx.beginPath(); ctx.ellipse(0, 0, p.size * 0.5, p.size * 1.5, 0, 0, 6.2832); ctx.fill(); break;
      case "ringlet":
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 6.2832); ctx.stroke(); break;
      case "bit":
        ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2); break;
      case "flash": {
        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
        g.addColorStop(0, "rgba(255,255,255," + a + ")");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 6.2832); ctx.fill();
        break;
      }
      case "star":
        drawStar(ctx, p.size * 1.4); break;
      default:
        ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  function tick(t) {
    var dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    if (!ctx) { rafId = 0; return; }
    ctx.clearRect(0, 0, W, H);

    // 蓄力（出手前的能量凝聚）
    for (var ci = charges.length - 1; ci >= 0; ci--) {
      var ch = charges[ci];
      ch.t += dt / ch.dur;
      var cs = 0.4 + Math.min(1, ch.t) * 1.15;
      drawCharge(ch, cs);
      if (ch.t >= 1) { charges.splice(ci, 1); if (ch.onDone) ch.onDone(); }
    }
    // 弹道
    for (var i = beams.length - 1; i >= 0; i--) {
      var b = beams[i];
      b.t += dt / b.dur;
      var tt = Math.min(1, b.t);
      var x = b.x0 + (b.x1 - b.x0) * tt;
      var y = b.y0 + (b.y1 - b.y0) * tt - b.arc * Math.sin(Math.PI * tt);
      var scale = 1 + 0.5 * Math.sin(Math.PI * tt); // 伪景深：接近中点时最大
      if (b.trail) { b.trail.push({ x: x, y: y }); if (b.trail.length > 12) b.trail.shift(); }
      drawProjectile(b, x, y, scale);
      if (b.t >= 1) {
        beams.splice(i, 1);
        if (b.onHit) b.onHit();
      }
    }
    // 闪电
    for (var j = bolts.length - 1; j >= 0; j--) {
      var bl = bolts[j];
      bl.life -= dt;
      drawBolt(bl);
      if (bl.life <= 0) bolts.splice(j, 1);
    }
    // 冲击波环
    for (var k = rings.length - 1; k >= 0; k--) {
      var rg = rings[k];
      rg.t += dt / rg.dur;
      drawRing(rg);
      if (rg.t >= 1) rings.splice(k, 1);
    }
    // 粒子
    for (var p = parts.length - 1; p >= 0; p--) {
      var pt = parts[p];
      pt.life -= dt;
      pt.vy += pt.grav * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.rot += pt.vr * dt;
      if (pt.life <= 0) { parts.splice(p, 1); continue; }
      drawParticle(pt);
    }

    if (beams.length || parts.length || rings.length || bolts.length || charges.length) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = 0;
    }
  }

  /* ---------- public API ---------- */
  function cast(side, move, r, opts) {
    opts = opts || {};
    if (reduceMotion) { if (opts.onImpact) opts.onImpact(); return; }
    if (!init()) { if (opts.onImpact) opts.onImpact(); return; }

    var atkId = side === "you" ? "you-active-card" : "ai-active-card";
    var defId = side === "you" ? "ai-active-card" : "you-active-card";
    var a = document.getElementById(atkId);
    var d = document.getElementById(defId);
    var ac = center(a), dc = center(d);
    var type = (move && move.type) ? move.type : "normal";
    var pal = PALETTE[type] || PALETTE.normal;
    var dist = Math.hypot(dc.x - ac.x, dc.y - ac.y);
    var arc = Math.min(170, dist * 0.28);

    spawnAmbient(ac); spawnAmbient(dc);

    // 蓄力阶段：攻击方先凝聚一团能量，再发射弹道
    charges.push({
      x: ac.x, y: ac.y - 12,
      t: 0, dur: 0.16, pal: pal,
      onDone: function () {
        beams.push({
          x0: ac.x, y0: ac.y - 12,
          x1: dc.x, y1: dc.y - 12,
          t: 0, dur: 0.34, arc: arc,
          type: type, pal: pal, trail: [],
          onHit: function () {
            explosion(type, dc.x, dc.y, r ? (r.mult || 1) : 1);
            if (opts.onImpact) opts.onImpact();
          }
        });
      }
    });
    ensureLoop();
  }

  // 恢复能量：在卡牌周围升起青绿+金色的聚气光环与粒子
  function recover(side, amount) {
    if (reduceMotion) return;
    if (!init()) return;
    var cardId = side === "you" ? "you-active-card" : "ai-active-card";
    var c = center(document.getElementById(cardId));
    if (!c) return;
    var pal = RECOVER_PAL;
    rings.push({ x: c.x, y: c.y, t: 0, dur: 0.75, r0: 10, r1: 95, w: 5, color: pal.mid });
    rings.push({ x: c.x, y: c.y, t: -0.16, dur: 0.75, r0: 6, r1: 70, w: 3, color: pal.edge });
    parts.push(mkPart("flash", c.x, c.y, 0, 0, 32, 0.28, "#ffffff", 0, true));
    var n = 26;
    for (var i = 0; i < n; i++) {
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
      var spd = 60 + Math.random() * 130;
      parts.push(mkPart("spark",
        c.x + (Math.random() * 44 - 22), c.y + 24,
        Math.cos(ang) * spd, Math.sin(ang) * spd - 50,
        2 + Math.random() * 3, 0.6 + Math.random() * 0.5,
        (i % 2) ? pal.mid : pal.gold, -30, true));
    }
    ensureLoop();
  }

  window.SkillFX = {
    cast: cast,
    recover: recover,
    _clear: function () { beams = []; parts = []; rings = []; bolts = []; charges = []; }
  };
})();
