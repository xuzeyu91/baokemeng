
/* 宝可梦卡牌对战 — game logic (vanilla JS) */
(function () {
  "use strict";

  var LIST = window.POKEMON_LIST;
  var EFFECT = window.TYPE_EFFECT;
  var TYPE_ZH = window.TYPE_ZH;

  var TYPE_COLOR = {
    normal:"#A8A878", fire:"#F08030", water:"#6890F0", electric:"#F8D030",
    grass:"#78C850", ice:"#98D8D8", fighting:"#C03028", poison:"#A040A0",
    ground:"#E0C068", flying:"#A890F0", psychic:"#F85888", bug:"#A8B820",
    rock:"#B8A038", ghost:"#705898", dragon:"#7038F8",
    steel:"#B8B8D0", dark:"#705848"
  };

  var STATUS_ZH = {
    poison: "中毒", burn: "灼烧", paralysis: "麻痹", sleep: "睡眠", freeze: "冰冻"
  };
  var STATUS_COLOR = {
    poison: "#A040A0", burn: "#F08030", paralysis: "#E8B800",
    sleep: "#9B7EDE", freeze: "#5FB6D6"
  };
  // 哪些属性可造成异常状态及其对应类型
  var TYPE_STATUS = {
    poison: "poison", fire: "burn", electric: "paralysis",
    ice: "freeze", grass: "sleep", psychic: "sleep", ghost: "sleep"
  };
  function statusTurns(type) {
    if (type === "sleep" || type === "freeze") return 2 + Math.floor(Math.random() * 3); // 2~4 回合
    return 0; // 中毒/灼烧/麻痹 持续型
  }

  // 每属性 4 个技能名（顺序：1费 / 1费 / 2费 / 3费），用于组成 4 技能体系
  var MOVE_KIT = {
    normal:["撞击","电光一闪","舍身冲撞","终极冲击"],
    fire:["火花","火苗","喷射火焰","大字爆炎"],
    water:["水枪","泡沫","水炮","水流尾"],
    electric:["电击","电光","十万伏特","打雷"],
    grass:["藤鞭","飞叶快刀","日光束","飞叶风暴"],
    ice:["冰砾","冰晶","冰冻光束","暴风雪"],
    fighting:["手刀","踢腿","百万吨重拳","近身战"],
    poison:["毒针","毒雾","污泥炸弹","毒爆弹"],
    ground:["泥巴射击","落拳","地震","地裂"],
    flying:["啄","空气斩","勇鸟猛攻","神鸟猛击"],
    psychic:["念力","幻象光","精神强念","预知未来"],
    bug:["虫咬","虫鸣","十字剪","蝶舞"],
    rock:["落石","岩石封锁","尖石攻击","岩崩"],
    ghost:["影子拳","暗影爪","暗影球","潜灵奇袭"],
    dragon:["龙息","龙之波动","龙爪","逆鳞"],
    steel:["金属爪","铁头","铁尾","钢铁冲击"],
    dark:["咬住","恶意追击","恶之波动","暗夜爆裂"]
  };

  var DECK_SIZE = 12;
  var BENCH_START = 4;
  var MAX_ENERGY = 5;

  var STRIKE_MS = 260;
  var IMPACT_MS = 540;
  var RECOVER_MS = 600;
  var FAINT_MS = 950;
  var SWITCH_MS = 500;
  var AI_PAUSE_MS = 750;

  var state = null;
  var busy = false;
  var setup = { mode: "random", selected: [], typeFilter: "all", genFilter: "all", query: "" };

  if (typeof console !== "undefined" && console.log) {
    console.log("[PK] v5 loaded: animated async battle flow");
  }

  /* ---------- helpers ---------- */
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function typeMult(moveType, defTypes) {
    var m = 1;
    for (var i = 0; i < defTypes.length; i++) {
      var row = EFFECT[moveType];
      if (row && row[defTypes[i]] !== undefined) m *= row[defTypes[i]];
    }
    return m;
  }
  // 依据费用档位（0=1费, 1=2费, 2=3费）把基础数值换算成技能威力
  function movePower(base, tier) {
    if (tier === 0) return clamp(Math.round(base * 0.42) + 14, 30, 75);
    if (tier === 1) return clamp(Math.round(base * 0.62) + 24, 48, 115);
    return clamp(Math.round(base * 0.85) + 34, 68, 160);
  }
  function genMoves(mon) {
    var t1 = mon.types[0];
    var t2 = mon.types[1] || "normal";
    var k1 = MOVE_KIT[t1] || MOVE_KIT.normal;
    var k2 = MOVE_KIT[t2] || MOVE_KIT.normal;
    var m2 = { name: k1[2], type: t1, power: movePower(mon.sp_attack, 1), cost: 2, cat: "spec" };
    var m3 = { name: k2[3], type: t2, power: movePower(mon.attack,     2), cost: 3, cat: "phys" };
    var s1 = TYPE_STATUS[t1]; if (s1) { m2.status = s1; m2.statusChance = 0.20; }
    var s2 = TYPE_STATUS[t2]; if (s2) { m3.status = s2; m3.statusChance = 0.35; }
    return [
      { name: k1[0], type: t1, power: movePower(mon.attack,     0), cost: 1, cat: "phys" },
      { name: k2[1], type: t2, power: movePower(mon.sp_attack, 0), cost: 1, cat: "spec" },
      m2, m3
    ];
  }
  function makeCard(mon) {
    return {
      mon: mon, maxHp: mon.hp, hp: mon.hp, energy: 0, status: null,
      fainted: false, moves: genMoves(mon)
    };
  }
  function randomMons(n) {
    return shuffle(LIST).slice(0, n);
  }

  /* ---------- setup ---------- */
  function buildState(youMons, aiMons) {
    function buildPlayer(name, pool) {
      var cards = pool.map(makeCard);
      var active = cards[0];
      var bench = cards.slice(1, 1 + BENCH_START);
      var deck = cards.slice(1 + BENCH_START);
      return { name: name, active: active, bench: bench, deck: deck, graveyard: [] };
    }
    state = {
      you: buildPlayer("你", youMons),
      ai: buildPlayer("电脑", aiMons),
      turn: "you", firstMover: "you", over: false, winner: null, log: []
    };
  }

  function newGame(youMons) {
    var youPool = (youMons && youMons.length === DECK_SIZE)
      ? youMons.slice()
      : randomMons(DECK_SIZE);
    var used = {};
    youPool.forEach(function (m) { used[m.id] = true; });
    var rest = LIST.filter(function (m) { return !used[m.id]; });
    var aiPool = shuffle(rest).slice(0, DECK_SIZE);
    buildState(youPool, aiPool);
    log("sys", "对战开始！双方各派出一只宝可梦，先让对方无宝可梦可派者获胜。");
    render();
  }

  function beginGame(youMons) {
    hideOverlays();
    setup.selected = [];
    newGame(youMons);
    startRound();
  }

  /* ---------- logging ---------- */
  function log(cls, msg) {
    state.log.push({ cls: cls, msg: msg });
    if (state.log.length > 40) state.log.shift();
  }

  /* ---------- combat ---------- */
  function expectedDamage(attacker, defender, move) {
    var atk = move.cat === "phys" ? attacker.mon.attack : attacker.mon.sp_attack;
    var def = move.cat === "phys" ? defender.mon.defense : defender.mon.sp_defense;
    var mult = typeMult(move.type, defender.mon.types);
    var dmg = Math.max(1, Math.floor(move.power * (atk / (def + 10)) * 0.5 * mult));
    if (attacker.status && attacker.status.type === "burn" && move.cat === "phys") dmg = Math.floor(dmg * 0.5);
    return dmg;
  }
  function rollDamage(attacker, defender, move) {
    var atk = move.cat === "phys" ? attacker.mon.attack : attacker.mon.sp_attack;
    var def = move.cat === "phys" ? defender.mon.defense : defender.mon.sp_defense;
    var mult = typeMult(move.type, defender.mon.types);
    var variance = 0.85 + Math.random() * 0.15;
    var dmg = Math.max(1, Math.floor(move.power * (atk / (def + 10)) * 0.5 * mult * variance));
    if (attacker.status && attacker.status.type === "burn" && move.cat === "phys") dmg = Math.floor(dmg * 0.5);
    return { dmg: dmg, mult: mult };
  }

  function useMove(side, moveIdx, callback) {
    var me = state[side];
    var foe = state[side === "you" ? "ai" : "you"];
    var foeSide = side === "you" ? "ai" : "you";
    var attacker = me.active, defender = foe.active;
    var move = attacker.moves[moveIdx];
    if (attacker.energy < move.cost) { if (callback) callback(); return; }
    attacker.energy -= move.cost;

    var r = rollDamage(attacker, defender, move);
    defender.hp = Math.max(0, defender.hp - r.dmg);

    var effTxt = r.mult >= 2 ? "效果拔群！" : r.mult === 0 ? "没有效果…"
      : r.mult < 1 ? "效果不太好…" : "";
    var who = side === "you" ? "你" : "电脑";
    var line = who + "的" + attacker.mon.name_zh + " 使用【" + move.name + "】，对" +
               defender.mon.name_zh + " 造成 " + r.dmg + " 点伤害。" + effTxt;
    log(side, line);

    // show energy change / hp bar drop before the impact animation
    render();
    animateStrike(side, move, r);

    setTimeout(function () {
      if (defender.hp <= 0) {
        handleFaint(foeSide, callback);
      } else {
        if (move.status && !defender.status && Math.random() < move.statusChance) {
          defender.status = { type: move.status, turns: statusTurns(move.status) };
          log("eff", foe.name + "的" + defender.mon.name_zh + " 陷入了" + STATUS_ZH[move.status] + "状态！");
        }
        if (callback) callback();
      }
    }, IMPACT_MS);
  }

  function afterMove(side) {
    if (state.over) return;
    var other = side === "you" ? "ai" : "you";
    if (side === state.firstMover) {
      beginTurn(other);   // 先手行动完毕，轮到后手
    } else {
      startRound();       // 后手也行动完毕，进入下一回合
    }
  }

  function handleFaint(side, callback) {
    var p = state[side];
    var dead = p.active;
    dead.fainted = true;
    log("kill", p.name + "的" + dead.mon.name_zh + " 倒下了！");

    // keep the fainted card visible for a moment so the player notices it
    render();
    animateFaint(side);

    setTimeout(function () {
      if (p.bench.length > 0) {
        p.graveyard.push(dead);
        var best = 0;
        for (var i = 1; i < p.bench.length; i++) {
          if (p.bench[i].hp > p.bench[best].hp) best = i;
        }
        var promoted = p.bench.splice(best, 1)[0];
        p.active = promoted;
        log("sys", p.name + " 派出 " + promoted.mon.name_zh + " 上场！");
      } else if (p.deck.length > 0) {
        p.graveyard.push(dead);
        p.active = p.deck.shift();
        log("sys", p.name + " 从牌库抽出 " + p.active.mon.name_zh + " 上场！");
      } else {
        // 无替补：最终倒下者留在 active 上，不重复计入墓地
        state.over = true;
        state.winner = side === "you" ? "ai" : "you";
        log("kill", p.name + " 已无宝可梦可派，" + (state.winner === "you" ? "你" : "电脑") + " 获胜！");
        render();
        showOver();
        busy = false;
        if (callback) callback();
        return;
      }
      render();
      animateSwitch(side);
      setTimeout(function () {
        if (callback) callback();
      }, SWITCH_MS);
    }, FAINT_MS);
  }

  function doSwitch(side, benchIdx) {
    var p = state[side];
    if (benchIdx < 0 || benchIdx >= p.bench.length) return;
    var incoming = p.bench.splice(benchIdx, 1)[0];
    p.bench.push(p.active);
    p.active = incoming;
    var who = side === "you" ? "你" : "电脑";
    log("sys", who + " 换上 " + incoming.mon.name_zh + "（" + p.active.mon.name_zh + " 退居后备）。");
  }

  /* ---------- turn flow ---------- */
  function decideFirstMover() {
    var y = state.you.active, a = state.ai.active;
    if (y.mon.speed > a.mon.speed) return "you";
    if (a.mon.speed > y.mon.speed) return "ai";
    return Math.random() < 0.5 ? "you" : "ai";
  }

  function startRound() {
    if (state.over) return;
    var first = decideFirstMover();
    state.firstMover = first;
    var fm = state[first].active;
    log("sys", "速度判定：" + (first === "you" ? "你" : "电脑") + " 的 " + fm.mon.name_zh +
      " 速度更快（" + fm.mon.speed + "），本回合先手！");
    beginTurn(first);
  }

  function beginTurn(side) {
    if (state.over) return;
    var p = state[side];
    state.turn = side;
    p.active.energy = Math.min(MAX_ENERGY, p.active.energy + 1);
    if (p.active.energy > 0 && typeof animateEnergy === "function") animateEnergy(side);

    // 回合开始结算异常状态
    var skip = false;
    var st = p.active.status;
    if (st) {
      if (st.type === "poison" || st.type === "burn") {
        var pct = st.type === "poison" ? 0.0625 : 0.075;
        var sd = Math.max(1, Math.floor(p.active.maxHp * pct));
        p.active.hp = Math.max(0, p.active.hp - sd);
        log("sys", p.name + "的" + p.active.mon.name_zh + " 因" + STATUS_ZH[st.type] + "损失 " + sd + " 点体力！");
        if (p.active.hp <= 0) {
          render();
          handleFaint(side, function () { afterMove(side); });
          return;
        }
      }
      if (st.type === "sleep" || st.type === "freeze") {
        st.turns -= 1;
        if (st.turns <= 0) {
          p.active.status = null;
          log("sys", p.name + "的" + p.active.mon.name_zh + " 从" + STATUS_ZH[st.type] + "中恢复了！");
        } else {
          skip = true;
          log("sys", p.name + "的" + p.active.mon.name_zh + " 处于" + STATUS_ZH[st.type] + "状态，无法行动！");
        }
      }
      if (st.type === "paralysis") {
        if (Math.random() < 0.25) {
          skip = true;
          log("sys", p.name + "的" + p.active.mon.name_zh + " 麻痹了，无法行动！");
        }
      }
    }

    if (skip) {
      busy = true;
      render();
      setTimeout(function () { afterMove(side); }, side === "ai" ? AI_PAUSE_MS : 450);
      return;
    }
    if (side === "ai") {
      busy = true;
      render();
      aiAct();
    } else {
      busy = false;
      render();
    }
  }

  function aiAct() {
    if (state.over) { busy = false; return; }
    var me = state.ai, foe = state.you;
    var a = me.active, d = foe.active;

    setTimeout(function () {
      var choices = [];
      for (var i = 0; i < a.moves.length; i++) {
        var mv = a.moves[i];
        if (a.energy < mv.cost) continue;
        var exp = expectedDamage(a, d, mv);
        choices.push({ i: i, exp: exp, ko: exp >= d.hp });
      }
      if (choices.length === 0) {
        if (me.active.energy < MAX_ENERGY) {
          useRecover("ai", function () { afterMove("ai"); });
        } else {
          afterMove("ai");
        }
        return;
      }
      choices.sort(function (x, y) { return (y.ko - x.ko) || (y.exp - x.exp); });
      var pick = choices[0];

      if (!pick.ko && a.hp / a.maxHp < 0.35 && me.bench.length > 0) {
        var bestBench = 0;
        for (var j = 1; j < me.bench.length; j++) {
          if (me.bench[j].maxHp > me.bench[bestBench].maxHp) bestBench = j;
        }
        if (me.bench[bestBench].maxHp > a.maxHp) {
          doSwitch("ai", bestBench);
          render();
          animateSwitch("ai");
          setTimeout(function () {
            afterMove("ai");
          }, SWITCH_MS);
          return;
        }
      }

      useMove("ai", pick.i, function () {
        afterMove("ai");
      });
    }, AI_PAUSE_MS);
  }

  /* human actions */
  function onMove(idx) {
    if (busy || state.over || state.turn !== "you") return;
    busy = true;
    useMove("you", idx, function () {
      afterMove("you");
    });
  }
  function onSwitch(idx) {
    if (busy || state.over || state.turn !== "you") return;
    busy = true;
    doSwitch("you", idx);
    render();
    animateSwitch("you");
    setTimeout(function () {
      afterMove("you");
    }, SWITCH_MS);
  }

  /* 恢复能量支援技（独立动作，不计入 4 技能组） */
  function onRecover() {
    if (busy || state.over || state.turn !== "you") return;
    busy = true;
    useRecover("you", function () { afterMove("you"); });
  }
  function useRecover(side, callback) {
    var me = state[side];
    var before = me.active.energy;
    me.active.energy = Math.min(MAX_ENERGY, me.active.energy + 2);
    var gained = me.active.energy - before;
    var who = side === "you" ? "你" : "电脑";
    var line = who + "的" + me.active.mon.name_zh + " 凝聚力量，恢复 " + gained + " 点能量。";
    if (me.active.status) {
      line += "同时解除了" + STATUS_ZH[me.active.status.type] + "状态！";
      me.active.status = null;
    }
    log(side, line);
    render();
    if (window.SkillFX && window.SkillFX.recover) window.SkillFX.recover(side, gained);
    animateRecover(side, gained);
    busy = true;
    setTimeout(function () { if (callback) callback(); }, RECOVER_MS);
  }
  function animateRecover(side, gained) {
    try {
      var card = document.getElementById(elId(side));
      if (!card) return;
      card.classList.add("recover-aura");
      var c = centerOf(card);
      var p = document.createElement("div");
      p.className = "dmg-txt energy"; p.textContent = "⚡+" + gained;
      p.style.left = (c.x + 60) + "px"; p.style.top = (c.y - 40) + "px";
      var fx = fxLayer();
      if (fx) fx.appendChild(p);
      setTimeout(function () { try { if (card) card.classList.remove("recover-aura"); } catch (_) {} }, 820);
      setTimeout(function () { try { if (p && p.parentNode) p.parentNode.removeChild(p); } catch (_) {} }, 900);
    } catch (e) { console.warn("[PK] recover:", e); }
  }

  /* ---------- animations (browser only; guarded for headless) ---------- */
  function fxLayer() {
    if (typeof document === "undefined" || !document.body) return null;
    var fx = document.getElementById("fx");
    if (!fx) { fx = document.createElement("div"); fx.id = "fx"; document.body.appendChild(fx); }
    return fx;
  }
  function elId(side) { return side === "you" ? "you-active-card" : "ai-active-card"; }
  function centerOf(el) {
    if (el && typeof el.getBoundingClientRect === "function") {
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { x: (window.innerWidth || 600) / 2, y: (window.innerHeight || 600) / 2 };
  }

  function animateStrike(side, move, r) {
    try {
      var fx = fxLayer();
      if (!fx) return;
      var atk = document.getElementById(elId(side));
      var def = document.getElementById(elId(side === "you" ? "ai" : "you"));
      if (atk) {
        atk.classList.add(side === "you" ? "lunge-r" : "lunge-l");
        atk.classList.add("charge"); // 出手前蓄力光晕
      }

      var defEl = def;
      var runImpact = function () {
        try {
          if (atk) atk.classList.remove("charge");
          if (defEl) {
            // 精灵抖动 + 卡牌闪白击退（保留 3D 侧身）
            defEl.classList.add("hit-shake", side === "you" ? "hit-r" : "hit-l");
            setTimeout(function () {
              if (defEl) defEl.classList.remove("hit-shake", "hit-r", "hit-l");
            }, 480);
          }
          spawnDamage(defEl, r);
          flashEffect(r.mult);
          if (r.mult >= 2) {
            var f = document.querySelector(".field");
            if (f) { f.classList.remove("quake"); void f.offsetWidth; f.classList.add("quake"); }
          }
        } catch(e2) { console.warn("[PK] strike cb:", e2); }
      };

      if (window.SkillFX && document.getElementById("fx3d")) {
        window.SkillFX.cast(side, move, r, { onImpact: runImpact });
      } else {
        setTimeout(runImpact, IMPACT_MS);
      }
    } catch(e) { console.warn("[PK] animateStrike:", e); }
  }

  function spawnDamage(defEl, r) {
    try {
      var fx = fxLayer(); if (!fx) return;
      var c = centerOf(defEl);
      var d = document.createElement("div");
      d.className = "dmg-num " + (r.mult >= 2 ? "sup" : r.mult < 1 ? "weak" : "");
      d.textContent = "-" + r.dmg;
      d.style.left = (c.x + (Math.random() * 24 - 12)) + "px";
      d.style.top = (c.y - 20) + "px";
      fx.appendChild(d);
      setTimeout(function () { try { if (d && d.parentNode) d.parentNode.removeChild(d); }catch(_){} }, 1000);

      if (r.mult === 0) {
        var no = document.createElement("div");
        no.className = "dmg-txt weak";
        no.textContent = "没有效果";
        no.style.left = c.x + "px"; no.style.top = (c.y + 16) + "px";
        fx.appendChild(no);
        setTimeout(function () { try { if (no && no.parentNode) no.parentNode.removeChild(no); }catch(_){} }, 1100);
      }
      if (defEl) {
        var burst = document.createElement("div");
        burst.className = "impact " + (r.mult >= 2 ? "sup" : r.mult < 1 ? "weak" : "");
        burst.style.left = c.x + "px"; burst.style.top = c.y + "px";
        fx.appendChild(burst);
        setTimeout(function () { try { if (burst && burst.parentNode) burst.parentNode.removeChild(burst); }catch(_){} }, 380);
      }
    } catch(e) { console.warn("[PK] spawnDamage:", e); }
  }

  function flashEffect(mult) {
    try {
      var fx = fxLayer(); if (!fx || mult === 1) return;
      var f = document.createElement("div");
      f.className = "flash " + (mult >= 2 ? "sup" : "weak");
      fx.appendChild(f);
      setTimeout(function () { try { if (f && f.parentNode) f.parentNode.removeChild(f); }catch(_){} }, 320);
    } catch(e) { console.warn("[PK] flash:", e); }
  }

  function animateFaint(side) {
    try {
      var fx = fxLayer(); if (!fx) return;
      var card = document.getElementById(elId(side));
      if (card) {
        card.classList.add("faint");
        var c = centerOf(card);
        var ko = document.createElement("div");
        ko.className = "dmg-txt ko"; ko.textContent = "K.O.";
        ko.style.left = c.x + "px"; ko.style.top = c.y + "px";
        fx.appendChild(ko);
        setTimeout(function () { try { if (ko && ko.parentNode) ko.parentNode.removeChild(ko); }catch(_){} }, 1400);
      }
    } catch(e) { console.warn("[PK] faint:", e); }
  }

  function animateEnergy(side) {
    try {
      var fx = fxLayer(); if (!fx) return;
      var card = document.getElementById(elId(side));
      if (card) card.classList.add("energy-gain");
      var c = centerOf(card);
      var p = document.createElement("div");
      p.className = "dmg-txt energy"; p.textContent = "⚡+1";
      p.style.left = (c.x + 60) + "px"; p.style.top = (c.y - 40) + "px";
      fx.appendChild(p);
      setTimeout(function () { try { if (p && p.parentNode) p.parentNode.removeChild(p); }catch(_){} }, 900);
    } catch(e) { console.warn("[PK] energy:", e); }
  }

  function animateSwitch(side) {
    var card = document.getElementById(elId(side));
    if (card) card.classList.add("slide-in");
  }

  function hideOverlays() {
    var ov = document.getElementById("overlay");
    var su = document.getElementById("setup");
    if (ov) ov.classList.remove("show");
    if (su) su.classList.remove("show");
  }

  /* ---------- rendering ---------- */
  function typeChips(types) {
    return types.map(function (t) {
      return '<span class="type-chip" style="background:' + (TYPE_COLOR[t] || "#888") + '">' +
        (TYPE_ZH[t] || t) + "</span>";
    }).join("");
  }
  function hpColor(ratio) {
    return ratio > 0.5 ? "var(--hp-good)" : ratio > 0.22 ? "var(--hp-mid)" : "var(--hp-low)";
  }
  function energyDots(n) {
    var s = "";
    for (var i = 0; i < MAX_ENERGY; i++) {
      s += '<span class="dot' + (i < n ? " on" : "") + '"></span>';
    }
    return s;
  }

  function cardHTML(side, p, withEnergy) {
    var c = p.active;
    var ratio = c.hp / c.maxHp;
    var headColor = TYPE_COLOR[c.mon.types[0]] || "#555";
    var opp = side === "you" ? state.ai.active : state.you.active;
    var faster = opp && c.mon.speed > opp.mon.speed;
    var en = withEnergy
      ? '<div class="energy"><span class="lbl">能量</span>' + energyDots(c.energy) + "</div>"
      : "";
    return '' +
      '<div class="card" id="' + elId(side) + '" style="border-color:' + headColor + ';--head:' + headColor + ';--ry:' + (side === "you" ? "9deg" : "-9deg") + '">' +
        '<div class="head" style="background:' + headColor + '">' +
          '<span class="nm">' + c.mon.name_zh + '</span>' +
          '<span class="no">#' + ("00" + c.mon.id).slice(-3) + (faster ? '<span class="first">先手</span>' : '') + '</span>' +
        '</div>' +
        '<div class="art">' +
          '<img src="' + c.mon.sprite + '" alt="' + c.mon.name_zh + '" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
          '<div class="fallback">' + c.mon.id + '</div>' +
        '</div>' +
        '<div class="types">' + typeChips(c.mon.types) + '</div>' +
        '<div class="body">' +
          '<div class="hp-row"><span>HP</span>' +
            '<div class="hp-bar"><div class="hp-fill" style="width:' + (ratio * 100) +
              '%;background:' + hpColor(ratio) + '"></div></div>' +
            '<span>' + c.hp + "/" + c.maxHp + '</span>' +
          '</div>' +
          '<div class="spd-row"><span>速度</span><span' + (faster ? ' class="fast"' : '') + '>' +
            c.mon.speed + (faster ? ' ⚡' : '') + '</span></div>' +
          (c.status ? '<div class="status-badge" style="background:' + (STATUS_COLOR[c.status.type] || "#888") + '">' +
            STATUS_ZH[c.status.type] + (c.status.turns ? '(' + c.status.turns + ')' : '') + '</div>' : "") +
          en +
        '</div>' +
      '</div>';
  }

  function benchHTML(p, switchable) {
    if (p.bench.length === 0) return '<div class="deck-pile"><span class="pile"></span><span>后备 0</span></div>';
    var html = p.bench.map(function (c, i) {
      var ratio = c.hp / c.maxHp;
      var hc = TYPE_COLOR[c.mon.types[0]] || "#555";
      return '' +
        '<div class="mini' + (switchable ? " switchable" : "") + '"' +
            (switchable ? ' data-switch="' + i + '" title="点击换上这只宝可梦"' : "") + '>' +
          '<div class="mh" style="background:' + hc + '"><span>' + c.mon.name_zh + '</span>' +
            '<span>#' + ("00" + c.mon.id).slice(-3) + '</span></div>' +
          '<div class="ma"><img src="' + c.mon.sprite + '" alt="' + c.mon.name_zh + '" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
            '<div class="fb"></div></div>' +
          '<div class="mb">' +
            '<div class="mhp"><i style="width:' + (ratio * 100) + '%;background:' + hpColor(ratio) + '"></i></div>' +
            '<div class="mname">' + c.hp + "/" + c.maxHp + (c.status ? ' <span class="mini-status" style="background:' + (STATUS_COLOR[c.status.type] || "#888") + '">' + STATUS_ZH[c.status.type] + '</span>' : '') + '</div>' +
          '</div>' +
        '</div>';
    }).join("");
    return html;
  }

  // 12 格阵型：出战(高亮) / 后备(可换) / 牌库(牌背) / 已倒下(灰)
  function formationHTML(p, switchable, side) {
    var cells = [];
    cells.push(rosterCell(p.active, p.active.fainted ? "dead" : "active", p.active.status, null, side));
    p.bench.forEach(function (c, i) {
      cells.push(rosterCell(c, switchable ? "bench-sw" : "bench", c.status, i, side));
    });
    p.deck.forEach(function () { cells.push(rosterCell(null, "deck", null, null, side)); });
    (p.graveyard || []).forEach(function (c) { cells.push(rosterCell(c, "dead", c.status, null, side)); });
    return cells.join("");
  }
  function rosterCell(c, kind, status, switchIdx, side) {
    if (kind === "deck") {
      return '<div class="fc deck" title="牌库（未公开）"><span>?</span></div>';
    }
    var mon = c.mon;
    var hc = TYPE_COLOR[mon.types[0]] || "#555";
    var cls = "fc";
    if (kind === "active") cls += " active";
    else if (kind === "dead") cls += " dead";
    else if (kind === "bench-sw") cls += " switchable";
    var tag = kind === "active" ? '<span class="fc-tag">战</span>'
      : kind === "dead" ? '<span class="fc-tag">✕</span>' : "";
    var ratio = c.hp / c.maxHp;
    var hpBar = (kind === "active" || kind === "bench" || kind === "bench-sw")
      ? '<div class="fc-hp"><i style="width:' + (ratio * 100) + '%;background:' + hpColor(ratio) + '"></i></div>'
      : '';
    var stBadge = status ? '<span class="fc-st" style="background:' + (STATUS_COLOR[status.type] || "#888") + '">' + STATUS_ZH[status.type] + '</span>' : '';
    return '' +
      '<div class="' + cls + '"' + (kind === "bench-sw" ? ' data-switch="' + switchIdx + '" title="点击换上这只宝可梦"' : '') +
        ' data-pkid="' + mon.id + '" data-side="' + side + '"' +
        ' style="border-color:' + hc + '">' +
        '<div class="fc-art" style="background:' + hc + '22">' +
          '<img src="' + mon.sprite + '" alt="' + mon.name_zh + '" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
          '<div class="fb">' + mon.id + '</div>' +
        '</div>' +
        hpBar + stBadge + tag +
      '</div>';
  }

  function movesHTML() {
    var p = state.you;
    var c = p.active;
    var d = state.ai.active;
    var canAct = !busy && !state.over && state.turn === "you";
    var html = c.moves.map(function (mv, i) {
      var mult = typeMult(mv.type, d.mon.types);
      var effCls = mult >= 2 ? "sup" : mult < 1 ? "weak" : "";
      var effTxt = mult >= 2 ? "克制 ×" + mult : mult === 0 ? "无效" : mult < 1 ? "被抵抗 ×" + mult : "";
      var disabled = !canAct || c.energy < mv.cost;
      var costColor = c.energy >= mv.cost ? "" : ' style="color:#e3534a"';
      return '' +
        '<button class="move" data-move="' + i + '"' + (disabled ? " disabled" : "") + '>' +
          '<div class="mn"><span class="type-chip" style="background:' + (TYPE_COLOR[mv.type] || "#888") + '">' +
            (TYPE_ZH[mv.type] || mv.type) + '</span>' + mv.name +
            '<span class="cost"' + costColor + '>能量 ' + mv.cost + '</span></div>' +
          '<div class="md"><span>威力 ' + mv.power + '</span><span>' +
            (mv.cat === "phys" ? "物理" : "特殊") + '</span></div>' +
          (effTxt ? '<div class="eff ' + effCls + '">' + effTxt + '</div>' : "") +
          (mv.status ? '<div class="eff status-hint">可使对手' + STATUS_ZH[mv.status] + '</div>' : "") +
        '</button>';
    }).join("");
    var canRecover = canAct && c.energy < MAX_ENERGY;
    html += '<button class="move recover' + (canRecover ? "" : " disabled") + '" data-recover="1">' +
        '<div class="mn"><span class="type-chip recover">回复</span>聚气 · 回复能量' +
        '<span class="cost">0 能量</span></div>' +
        '<div class="md"><span>恢复 2 能量</span><span>支援</span></div>' +
      '</button>';
    return html;
  }

  function logHTML() {
    var items = state.log.slice(-14).map(function (e) {
      return '<div class="e ' + e.cls + '">' + e.msg + '</div>';
    }).join("");
    return items;
  }

  function aliveCount(p) {
    var n = p.bench.length + p.deck.length;
    if (p.active && !p.active.fainted) n += 1;
    return n;
  }

  function render() {
    if (!state) return;
    var you = state.you, ai = state.ai;
    var ys = document.getElementById("you-side");
    var as = document.getElementById("ai-side");
    if (ys) ys.innerHTML =
      '<div class="side-label"><span>你</span>' +
      '<span class="tag">剩余 ' + aliveCount(you) + '/' + DECK_SIZE + '</span>' +
      '<span class="tag">牌库 ' + you.deck.length +
      '</span></div>' + cardHTML("you", you, true) +
      '<div class="formation">' + formationHTML(you, state.turn === "you" && !busy && !state.over, "you") + '</div>';
    if (as) as.innerHTML =
      '<div class="side-label"><span>电脑</span>' +
      '<span class="tag">剩余 ' + aliveCount(ai) + '/' + DECK_SIZE + '</span>' +
      '<span class="tag">牌库 ' + ai.deck.length +
      '</span></div>' + cardHTML("ai", ai, true) +
      '<div class="formation">' + formationHTML(ai, false, "ai") + '</div>';

    var turnTxt = state.over ? "对战结束" : (state.turn === "you" ? "你的回合" : "电脑思考中…");
    var ti = document.getElementById("turn-indicator");
    if (ti) ti.textContent = turnTxt;

    var mv = document.getElementById("moves");
    if (mv) mv.innerHTML = movesHTML();
    var lg = document.getElementById("log");
    if (lg) lg.innerHTML = logHTML();

    var canAct = !busy && !state.over && state.turn === "you";
    var hint = canAct
      ? '你有 4 个攻击技能 + 1 个「聚气·回复能量」支援技（0 消耗、恢复 2 能量、可随时使用）。每回合自动恢复 1 点能量，攒够 3 点可放 3 费大招，能量上限 ' + MAX_ENERGY + ' 点。'
      : (state.over ? "点击「重选宝可梦」再来一局。" : "请稍候，电脑正在行动…");
    var sh = document.getElementById("switch-hint");
    if (sh) sh.innerHTML = hint;

    bindEvents();
  }

  function bindEvents() {
    var ms = document.querySelectorAll("[data-move]");
    for (var i = 0; i < ms.length; i++) {
      (function (el) {
        el.addEventListener("click", function () { onMove(parseInt(el.getAttribute("data-move"), 10)); });
      })(ms[i]);
    }
    var sw = document.querySelectorAll("[data-switch]");
    for (var j = 0; j < sw.length; j++) {
      (function (el) {
        el.addEventListener("click", function () { onSwitch(parseInt(el.getAttribute("data-switch"), 10)); });
      })(sw[j]);
    }
    var rec = document.querySelectorAll("[data-recover]");
    for (var k = 0; k < rec.length; k++) {
      (function (el) {
        el.addEventListener("click", function () { onRecover(); });
      })(rec[k]);
    }
    bindPreviewEvents();
  }

  /* ---------- hover preview ---------- */
  function findCardById(pkId, side) {
    var p = state[side];
    if (!p) return null;
    if (p.active && p.active.mon.id == pkId) return p.active;
    for (var i = 0; i < p.bench.length; i++) {
      if (p.bench[i].mon.id == pkId) return p.bench[i];
    }
    if (p.graveyard) {
      for (var j = 0; j < p.graveyard.length; j++) {
        if (p.graveyard[j].mon.id == pkId) return p.graveyard[j];
      }
    }
    return null;
  }

  function previewHTML(c) {
    var mon = c.mon;
    var hc = TYPE_COLOR[mon.types[0]] || "#555";
    var ratio = c.hp / c.maxHp;
    var hpc = hpColor(ratio);
    var typesHTML = mon.types.map(function (t) {
      return '<span class="type-chip" style="background:' + (TYPE_COLOR[t] || "#888") + '">' + (TYPE_ZH[t] || t) + '</span>';
    }).join("");
    var statusHTML = c.status
      ? '<span class="status-badge" style="background:' + (STATUS_COLOR[c.status.type] || "#888") + '">' + STATUS_ZH[c.status.type] + '</span>'
      : "";
    var energyDots = "";
    for (var i = 0; i < MAX_ENERGY; i++) {
      energyDots += '<span class="dot' + (i < c.energy ? " on" : "") + '"></span>';
    }
    var dead = c.fainted;
    return '' +
      '<div class="pv-art" style="background:linear-gradient(180deg,#f3f5fb,#dfe5f2)' + (dead ? ";filter:grayscale(1)" : "") + '">' +
        '<img src="' + mon.sprite + '" alt="' + mon.name_zh + '" ' +
          'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
        '<div class="fb" style="display:none;width:64px;height:64px;border-radius:50%;background:radial-gradient(circle at 50% 38%,#fff 0 30%,#e3534a 31% 100%);border:3px solid #fff;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;">' + mon.id + '</div>' +
      '</div>' +
      '<div class="pv-head" style="background:' + hc + '">' +
        '<span class="pv-nm">' + mon.name_zh + '</span>' +
        '<span class="pv-no">#' + mon.id + '</span>' +
      '</div>' +
      '<div class="pv-types">' + typesHTML + '</div>' +
      '<div class="pv-body">' +
        '<div class="pv-hp">' +
          '<span>HP</span>' +
          '<div class="hp-bar"><div class="hp-fill" style="width:' + (ratio * 100) + '%;background:' + hpc + '"></div></div>' +
          '<span>' + c.hp + '/' + c.maxHp + '</span>' +
        '</div>' +
        (dead ? '<div class="pv-dead">已倒下</div>' : '') +
        statusHTML +
        '<div class="pv-stats">' +
          '<div><span>攻击</span><b>' + mon.attack + '</b></div>' +
          '<div><span>防御</span><b>' + mon.defense + '</b></div>' +
          '<div><span>特攻</span><b>' + mon.sp_attack + '</b></div>' +
          '<div><span>特防</span><b>' + mon.sp_defense + '</b></div>' +
          '<div><span>速度</span><b>' + mon.speed + '</b></div>' +
        '</div>' +
        '<div class="pv-energy">' +
          '<span class="lbl">能量</span>' +
          '<div class="energy">' + energyDots + '</div>' +
        '</div>' +
      '</div>';
  }

  function showPkPreview(el, pkId, side) {
    var c = findCardById(pkId, side);
    if (!c) return;
    var pv = document.getElementById("pk-preview");
    if (!pv) return;
    pv.innerHTML = previewHTML(c);
    pv.classList.add("show");
    positionPreview(pv, el);
  }

  function positionPreview(pv, el) {
    var rect = el.getBoundingClientRect();
    var pvW = 220, pvH = pv.offsetHeight || 300;
    var x = rect.right + 8;
    var y = rect.top;
    if (x + pvW > window.innerWidth - 8) x = rect.left - pvW - 8;
    if (x < 8) x = Math.max(8, Math.min(rect.left, window.innerWidth - pvW - 8));
    if (y + pvH > window.innerHeight - 8) y = window.innerHeight - pvH - 8;
    if (y < 8) y = 8;
    pv.style.left = x + "px";
    pv.style.top = y + "px";
  }

  function hidePkPreview() {
    var pv = document.getElementById("pk-preview");
    if (pv) { pv.classList.remove("show"); pv.innerHTML = ""; }
  }

  function bindPreviewEvents() {
    var cells = document.querySelectorAll(".fc:not(.deck)[data-pkid]");
    for (var i = 0; i < cells.length; i++) {
      (function (el) {
        el.addEventListener("mouseenter", function () {
          showPkPreview(el, el.getAttribute("data-pkid"), el.getAttribute("data-side"));
        });
        el.addEventListener("mouseleave", hidePkPreview);
      })(cells[i]);
    }
  }

  function showOver() {
    var ov = document.getElementById("overlay");
    var box = document.getElementById("over-box");
    if (!ov || !box) return;
    var youWin = state.winner === "you";
    box.innerHTML =
      '<div class="emoji">' + (youWin ? "🏆" : "💥") + '</div>' +
      '<h2>' + (youWin ? "你赢了！" : "你输了…") + '</h2>' +
      '<p>' + (youWin ? "你的宝可梦战队笑到了最后。" : "电脑的宝可梦战队更胜一筹，再接再厉！") + '</p>' +
      '<button class="btn" onclick="PK.toSetup()">重选宝可梦</button>';
    ov.classList.add("show");
  }

  /* ---------- setup screen ---------- */
  function showSetup() {
    var su = document.getElementById("setup");
    if (!su) return;
    su.classList.add("show");
    setup.selected = [];
    setup.mode = "random";
    setup.typeFilter = "all";
    setup.genFilter = "all";
    setup.query = "";
    syncSetupUI();
    renderPicker();
    renderGenFilters();
    renderTypeFilters();
  }

  function syncSetupUI() {
    var segR = document.getElementById("seg-random");
    var segC = document.getElementById("seg-custom");
    var panel = document.getElementById("custom-panel");
    var start = document.getElementById("start-btn");
    if (segR) segR.classList.toggle("active", setup.mode === "random");
    if (segC) segC.classList.toggle("active", setup.mode === "custom");
    if (panel) panel.classList.toggle("hidden", setup.mode !== "custom");
    if (start) {
      if (setup.mode === "custom") {
        start.disabled = setup.selected.length !== DECK_SIZE;
        start.textContent = setup.selected.length === DECK_SIZE
          ? "开始对战 (" + DECK_SIZE + ")" : "请选满 " + setup.selected.length + "/" + DECK_SIZE;
      } else {
        start.disabled = false;
        start.textContent = "开始对战（随机）";
      }
    }
    var cnt = document.getElementById("pick-count");
    if (cnt) cnt.textContent = setup.selected.length;
  }

  function renderGenFilters() {
    var wrap = document.getElementById("pk-gen");
    if (!wrap) return;
    var gens = [
      { key: "all", label: "全部" },
      { key: "gen1", label: "第一部 (初代 #1-151)" },
      { key: "gen2", label: "第二部 (城都 #152-251)" },
      { key: "gen3", label: "第三部 (丰缘 #252-386)" },
      { key: "gen4", label: "第四部 (神奥 #387-493)" }
    ];
    var html = "";
    gens.forEach(function (g) {
      html += '<button class="gf' + (setup.genFilter === g.key ? " on" : "") + '" data-gf="' + g.key + '">' + g.label + '</button>';
    });
    wrap.innerHTML = html;
    var btns = wrap.querySelectorAll("[data-gf]");
    for (var i = 0; i < btns.length; i++) {
      (function (el) {
        el.addEventListener("click", function () {
          setup.genFilter = el.getAttribute("data-gf");
          renderGenFilters();
          renderPicker();
        });
      })(btns[i]);
    }
  }

  function renderTypeFilters() {
    var wrap = document.getElementById("pk-types");
    if (!wrap) return;
    var html = '<button class="tf' + (setup.typeFilter === "all" ? " on" : "") + '" data-tf="all">全部</button>';
    Object.keys(TYPE_ZH).forEach(function (t) {
      html += '<button class="tf' + (setup.typeFilter === t ? " on" : "") + '" data-tf="' + t +
        '" style="background:' + (TYPE_COLOR[t] || "#888") + '">' + (TYPE_ZH[t]) + '</button>';
    });
    wrap.innerHTML = html;
    var btns = wrap.querySelectorAll("[data-tf]");
    for (var i = 0; i < btns.length; i++) {
      (function (el) {
        el.addEventListener("click", function () {
          setup.typeFilter = el.getAttribute("data-tf");
          renderTypeFilters();
          renderPicker();
        });
      })(btns[i]);
    }
  }

  function renderPicker() {
    var grid = document.getElementById("pk-grid");
    if (!grid) return;
    var q = setup.query.trim().toLowerCase();
    var selIds = {};
    setup.selected.forEach(function (m) { selIds[m.id] = true; });
    var html = "";
    LIST.forEach(function (m) {
      var matchType = setup.typeFilter === "all" || m.types.indexOf(setup.typeFilter) >= 0;
      var matchQ = !q || m.name_zh.indexOf(q) >= 0 || m.name.indexOf(q) >= 0 ||
        String(m.id) === q || ("#" + m.id) === q;
      var matchGen = setup.genFilter === "all" ||
        (setup.genFilter === "gen1" && m.id <= 151) ||
        (setup.genFilter === "gen2" && m.id >= 152 && m.id <= 251) ||
        (setup.genFilter === "gen3" && m.id >= 252 && m.id <= 386) ||
        (setup.genFilter === "gen4" && m.id >= 387);
      if (!matchType || !matchQ || !matchGen) return;
      var sel = selIds[m.id];
      var hc = TYPE_COLOR[m.types[0]] || "#555";
      html += '<div class="pk' + (sel ? " sel" : "") + '" data-pk="' + m.id + '">' +
        (sel ? '<div class="pk-check">✓</div>' : '') +
        '<div class="pk-art" style="background:' + hc + '22">' +
          '<img src="' + m.sprite + '" alt="' + m.name_zh + '" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
          '<div class="pk-fb">' + m.id + '</div>' +
        '</div>' +
        '<div class="pk-name">' + m.name_zh + '</div>' +
        '<div class="pk-types">' + typeChips(m.types) + '</div>' +
      '</div>';
    });
    grid.innerHTML = html;
    var cells = grid.querySelectorAll("[data-pk]");
    for (var i = 0; i < cells.length; i++) {
      (function (el) {
        el.addEventListener("click", function () {
          togglePick(parseInt(el.getAttribute("data-pk"), 10));
        });
      })(cells[i]);
    }
  }

  function togglePick(id) {
    var idx = -1;
    for (var i = 0; i < setup.selected.length; i++) {
      if (setup.selected[i].id === id) { idx = i; break; }
    }
    if (idx >= 0) {
      setup.selected.splice(idx, 1);
    } else {
      if (setup.selected.length >= DECK_SIZE) return; // full
      for (var k = 0; k < LIST.length; k++) {
        if (LIST[k].id === id) { setup.selected.push(LIST[k]); break; }
      }
    }
    syncSetupUI();
    renderPicker();
  }

  function confirmStart() {
    if (setup.mode === "custom") {
      if (setup.selected.length !== DECK_SIZE) return;
      beginGame(setup.selected.slice());
    } else {
      beginGame(null);
    }
  }

  /* ---------- wiring setup events ---------- */
  function wireSetup() {
    var segR = document.getElementById("seg-random");
    var segC = document.getElementById("seg-custom");
    var start = document.getElementById("start-btn");
    var search = document.getElementById("pk-search");
    var clearBtn = document.getElementById("pk-clear");
    var fillBtn = document.getElementById("pk-fill");
    var closeBtn = document.getElementById("setup-close");
    if (segR) segR.addEventListener("click", function () { setup.mode = "random"; syncSetupUI(); });
    if (segC) segC.addEventListener("click", function () { setup.mode = "custom"; syncSetupUI(); });
    if (start) start.addEventListener("click", confirmStart);
    if (search) search.addEventListener("input", function () {
      setup.query = search.value || ""; renderPicker();
    });
    if (clearBtn) clearBtn.addEventListener("click", function () {
      setup.selected = []; syncSetupUI(); renderPicker();
    });
    if (fillBtn) fillBtn.addEventListener("click", function () {
      var pool = shuffle(LIST);
      setup.selected = pool.slice(0, DECK_SIZE);
      syncSetupUI(); renderPicker();
    });
    if (closeBtn) closeBtn.addEventListener("click", function () {
      // resume current game if exists, else start random
      if (state && !state.over) { hideOverlays(); }
      else { beginGame(null); }
    });
  }

  window.PK = {
    start: function () { showSetup(); },
    restart: function () {
      document.getElementById("overlay").classList.remove("show");
      var su = document.getElementById("setup");
      if (su) su.classList.remove("show");
      busy = false;
      newGame(null); startRound();
    }, // headless/test: random game
    toSetup: function () { showSetup(); },
    _state: function () { return state; },
    _useMove: onMove,
    _switch: onSwitch,
    _beginCustom: function (mons) { beginGame(mons); }
  };

  // boot
  if (typeof document !== "undefined" && document.getElementById) {
    wireSetup();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { showSetup(); });
    } else {
      showSetup();
    }
  }
})();
