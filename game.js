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
    rock:"#B8A038", ghost:"#705898", dragon:"#7038F8"
  };

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
    dragon:["龙息","龙之波动","龙爪","逆鳞"]
  };

  var DECK_SIZE = 12;
  var BENCH_START = 4;
  var MAX_ENERGY = 3;

  var state = null;
  var busy = false;
  var setup = { mode: "random", selected: [], typeFilter: "all", query: "" };

  if (typeof console !== "undefined" && console.log) {
    console.log("[PK] v4 loaded: synchronous battle flow (animations disabled)");
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
    return [
      { name: k1[0], type: t1, power: movePower(mon.attack,     0), cost: 1, cat: "phys" },
      { name: k2[1], type: t2, power: movePower(mon.sp_attack, 0), cost: 1, cat: "spec" },
      { name: k1[2], type: t1, power: movePower(mon.sp_attack, 1), cost: 2, cat: "spec" },
      { name: k2[3], type: t2, power: movePower(mon.attack,     2), cost: 3, cat: "phys" }
    ];
  }
  function makeCard(mon) {
    return {
      mon: mon, maxHp: mon.hp, hp: mon.hp, energy: 0,
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
      return { name: name, active: active, bench: bench, deck: deck };
    }
    state = {
      you: buildPlayer("你", youMons),
      ai: buildPlayer("电脑", aiMons),
      turn: "you", over: false, winner: null, log: []
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
    startTurn("you");
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
    return Math.max(1, Math.floor(move.power * (atk / (def + 10)) * 0.5 * mult));
  }
  function rollDamage(attacker, defender, move) {
    var atk = move.cat === "phys" ? attacker.mon.attack : attacker.mon.sp_attack;
    var def = move.cat === "phys" ? defender.mon.defense : defender.mon.sp_defense;
    var mult = typeMult(move.type, defender.mon.types);
    var variance = 0.85 + Math.random() * 0.15;
    var dmg = Math.max(1, Math.floor(move.power * (atk / (def + 10)) * 0.5 * mult * variance));
    return { dmg: dmg, mult: mult };
  }

  function useMove(side, moveIdx) {
    var me = state[side];
    var foe = state[side === "you" ? "ai" : "you"];
    var foeSide = side === "you" ? "ai" : "you";
    var attacker = me.active, defender = foe.active;
    var move = attacker.moves[moveIdx];
    if (attacker.energy < move.cost) return;
    attacker.energy -= move.cost;

    var r = rollDamage(attacker, defender, move);
    defender.hp = Math.max(0, defender.hp - r.dmg);

    var effTxt = r.mult >= 2 ? "效果拔群！" : r.mult === 0 ? "没有效果…"
      : r.mult < 1 ? "效果不太好…" : "";
    var who = side === "you" ? "你" : "电脑";
    var line = who + "的" + attacker.mon.name_zh + " 使用【" + move.name + "】，对" +
               defender.mon.name_zh + " 造成 " + r.dmg + " 点伤害。" + effTxt;
    log(side, line);

    // --- sync: update state & render immediately ---
    if (defender.hp <= 0) {
      handleFaint(foeSide);
    }
    render();

    // --- advance turn ---
    if (!state.over) afterMove(side);
  }

  function afterMove(side) {
    if (state.over) return;
    if (side === "you") endHumanTurn();
    else startTurn("you");
  }

  function handleFaint(side) {
    var p = state[side];
    var dead = p.active;
    dead.fainted = true;
    log("kill", p.name + "的" + dead.mon.name_zh + " 倒下了！");

    if (p.bench.length > 0) {
      var best = 0;
      for (var i = 1; i < p.bench.length; i++) {
        if (p.bench[i].hp > p.bench[best].hp) best = i;
      }
      var promoted = p.bench.splice(best, 1)[0];
      p.active = promoted;
      log("sys", p.name + " 派出 " + promoted.mon.name_zh + " 上场！");
    } else if (p.deck.length > 0) {
      p.active = p.deck.shift();
      log("sys", p.name + " 从牌库抽出 " + p.active.mon.name_zh + " 上场！");
    } else {
      state.over = true;
      state.winner = side === "you" ? "ai" : "you";
      log("kill", p.name + " 已无宝可梦可派，" + (state.winner === "you" ? "你" : "电脑") + " 获胜！");
      render();
      showOver();
      return;
    }
    render();
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

  /* ---------- turn flow (fully synchronous — zero setTimeout) ---------- */
  function startTurn(side) {
    if (state.over) return;
    var p = state[side];
    p.active.energy = Math.min(MAX_ENERGY, p.active.energy + 1);
    if (p.active.energy > 0 && typeof animateEnergy === "function") animateEnergy(side);
    state.turn = side;
    busy = side === "ai";
    render();
    if (side === "ai") {
      aiAct();
    }
  }

  function endHumanTurn() {
    if (state.over) return;
    busy = true;
    render();
    startTurn("ai");
  }

  function aiAct() {
    if (state.over) { busy = false; return; }
    var me = state.ai, foe = state.you;
    var a = me.active, d = foe.active;

    var choices = [];
    for (var i = 0; i < a.moves.length; i++) {
      var mv = a.moves[i];
      if (a.energy < mv.cost) continue;
      var exp = expectedDamage(a, d, mv);
      choices.push({ i: i, exp: exp, ko: exp >= d.hp });
    }
    if (choices.length === 0) {
      busy = false; startTurn("you"); return;
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
        busy = false;
        startTurn("you");
        return;
      }
    }

    // useMove is now fully synchronous
    useMove("ai", pick.i);
  }

  /* human actions */
  function onMove(idx) {
    if (busy || state.over || state.turn !== "you") return;
    busy = true;
    useMove("you", idx);
  }
  function onSwitch(idx) {
    if (busy || state.over || state.turn !== "you") return;
    busy = true;
    doSwitch("you", idx);
    render();
    endHumanTurn();
  }

  // Card IDs are used by the renderer only. No animation or timer depends on them.
  function elId(side) { return side === "you" ? "you-active-card" : "ai-active-card"; }

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
    var en = withEnergy
      ? '<div class="energy"><span class="lbl">能量</span>' + energyDots(c.energy) + "</div>"
      : "";
    return '' +
      '<div class="card" id="' + elId(side) + '" style="border-color:' + headColor + '">' +
        '<div class="head" style="background:' + headColor + '">' +
          '<span class="nm">' + c.mon.name_zh + '</span>' +
          '<span class="no">#' + ("00" + c.mon.id).slice(-3) + '</span>' +
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
          '</div>' + en +
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
            '<div class="mname">' + c.hp + "/" + c.maxHp + '</div>' +
          '</div>' +
        '</div>';
    }).join("");
    return html;
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
        '</button>';
    }).join("");
    return html;
  }

  function logHTML() {
    var items = state.log.slice(-14).map(function (e) {
      return '<div class="e ' + e.cls + '">' + e.msg + '</div>';
    }).join("");
    return items;
  }

  function render() {
    if (!state) return;
    var you = state.you, ai = state.ai;
    var ys = document.getElementById("you-side");
    var as = document.getElementById("ai-side");
    if (ys) ys.innerHTML =
      '<div class="side-label"><span>你</span><span class="tag">牌库 ' + you.deck.length +
      '</span></div>' + cardHTML("you", you, true) +
      '<div class="bench">' + benchHTML(you, state.turn === "you" && !busy && !state.over) + '</div>';
    if (as) as.innerHTML =
      '<div class="side-label"><span>电脑</span><span class="tag">牌库 ' + ai.deck.length +
      '</span></div>' + cardHTML("ai", ai, true) +
      '<div class="bench">' + benchHTML(ai, false) + '</div>';

    var turnTxt = state.over ? "对战结束" : (state.turn === "you" ? "你的回合" : "电脑思考中…");
    var ti = document.getElementById("turn-indicator");
    if (ti) ti.textContent = turnTxt;

    var mv = document.getElementById("moves");
    if (mv) mv.innerHTML = movesHTML();
    var lg = document.getElementById("log");
    if (lg) lg.innerHTML = logHTML();

    var canAct = !busy && !state.over && state.turn === "you";
    var hint = canAct
      ? '你有 4 个技能：前两个各消耗 1 能量、随时可用，攒满 ' + MAX_ENERGY + ' 点能量即可释放 3 费大招。每回合自动恢复 1 点能量。'
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
    setup.query = "";
    syncSetupUI();
    renderPicker();
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
      if (!matchType || !matchQ) return;
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
      newGame(null); startTurn("you");
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
