
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
    steel:"#B8B8D0", dark:"#705848", fairy:"#EE99AC"
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
    dark:["咬住","恶意追击","恶之波动","暗夜爆裂"],
    fairy:["妖精之风","魔法闪耀","月亮之力","嬉闹"]
  };

  var DECK_SIZE = 12;
  var BENCH_START = 4;
  var MAX_ENERGY = 5;
  var MEGA_COST = 2; // energy cost to Mega Evolve (once per battle)
  var DYNAMAX_COST = 3;        // energy cost to Dynamax (once per battle)
  var TERA_COST = 2;            // energy cost to Terastallize (once per battle, lasts till end)
  var DYNAMAX_TURNS = 3;       // number of boosted "Max Move" attack turns after activation
  var DYNAMAX_HP_MULT = 1.5;   // max-HP multiplier while Dynamaxed
  var DYNAMAX_POWER_MULT = 1.4; // move-power multiplier for Max Moves (极巨招式)
  var CRIT_CHANCE = 0.0625;    // 1/16 暴击率（命中且非无效时判定）
  var CRIT_MULT = 1.5;         // 暴击伤害倍率
  // 突然死亡：对战回合过多后，双方每回合承受递增的真实伤害，避免属性免疫/纯变化招导致的无限对战
  var SUDDEN_DEATH_START = 50; // 超过该回合数后进入突然死亡
  var SUDDEN_DEATH_STEP = 0.06; // 每超出一回合，额外真实伤害比例
  var SUDDEN_DEATH_MAX = 0.5;  // 真实伤害比例上限（半血/回合）
  // 可引出天气的控场招（slug 白名单）
  var WEATHER_MOVES = ["sunny-day", "rain-dance", "sandstorm", "hail"];

  /* ===== 携带物（道具）===== */
  var ITEM_POOL = {
    leftovers: { name: "剩饭",     icon: "🍱", desc: "每回合开始回复约 1/16 最大体力" },
    band:      { name: "讲究头带", icon: "💪", desc: "物理招式伤害 ×1.5" },
    specs:     { name: "讲究眼镜", icon: "👓", desc: "特殊招式伤害 ×1.5" },
    sash:      { name: "气势披带", icon: "🛡", desc: "满血时若受致命伤，保留 1 点体力（每场一次）" },
    lifeorb:   { name: "生命宝珠", icon: "🔮", desc: "伤害 ×1.3，但每次出手损失 1/10 最大体力" }
  };
  var ITEM_KEYS = ["leftovers", "band", "specs", "sash", "lifeorb"];
  // 约 1/3 的宝可梦携带道具，按 id 确定性分配（基础形态即决定，与进化/极巨/超级进化无关）
  function itemForKey(mon) {
    if (!mon || mon.id == null) return null;
    if (mon.id % 3 !== 0) return null;
    return ITEM_KEYS[Math.floor(mon.id / 3) % ITEM_KEYS.length];
  }

  /* ===== 天气 / 场地 ===== */
  var WEATHER_DURATION = 5; // 天气持续回合
  var WEATHER = {
    none:      { name: "",     icon: "",  atk: null, weak: null, mult: 1, chip: false, immune: [] },
    sunny:     { name: "大晴天", icon: "☀️", atk: "fire",  weak: "water", mult: 1.5, chip: false, immune: [] },
    rain:      { name: "下雨",   icon: "🌧️", atk: "water", weak: "fire",  mult: 1.5, chip: false, immune: [] },
    sandstorm: { name: "沙暴",   icon: "🌪️", atk: "rock",  weak: null,   mult: 1.5, chip: true,  immune: ["rock", "ground", "steel"] },
    hail:      { name: "冰雹",   icon: "❄️", atk: "ice",   weak: null,   mult: 1.5, chip: true,  immune: ["ice"] }
  };
  // 特定 2 费 / 3 费大招会引出对应天气
  var WEATHER_MOVE = {
    "大字爆炎": "sunny", "喷射火焰": "sunny",
    "水流尾": "rain", "水炮": "rain",
    "岩崩": "sandstorm", "尖石攻击": "sandstorm",
    "暴风雪": "hail", "冰冻光束": "hail"
  };

  /* ===== 能力等级（强化/削弱）===== */
  // 等级 -6..+6 对应的能力倍率（攻/防/特攻/特防/速度共用）
  var STAGE_MULT = [0.25, 0.2857, 0.3333, 0.4, 0.5, 0.6667, 1, 1.5, 2, 2.5, 3, 3.5, 4];
  function stageMult(stage) { return STAGE_MULT[clamp(stage + 6, 0, 12)]; }
  var BUFF_LABEL = { atk: "攻击", def: "防御", spa: "特攻", spd: "特防", spe: "速度" };
  var BUFF_SHORT = { atk: "攻", def: "防", spa: "特攻", spd: "特防", spe: "速" };
  // 3 费大招：命中后强化自身（按属性）
  var SELF_BUFF_BY_TYPE = {
    normal: { atk: 1 }, fire: { atk: 1 }, water: { spd: 1 }, electric: { spd: 1 },
    grass: { spa: 1 }, ice: { spa: 1 }, fighting: { atk: 2, def: -1 }, poison: { spa: 1 },
    ground: { atk: 1 }, flying: { spd: 1 }, psychic: { spa: 1, spd: 1 }, bug: { atk: 1, spa: 1 },
    rock: { def: 1 }, ghost: { spa: 1 }, dragon: { atk: 1, spa: 1 }, steel: { def: 1 },
    dark: { atk: 1 }, fairy: { spa: 1, def: 1 }
  };
  // 2 费中招：命中后削弱对手（按属性）
  var FOE_DEBUFF_BY_TYPE = {
    fire: { def: -1 }, water: { spd: -1 }, electric: { spd: -1 }, grass: { def: -1 },
    ice: { spd: -1 }, fighting: { def: -1 }, poison: { spa: -1 }, ground: { spd: -1 },
    flying: { def: -1 }, psychic: { spa: -1 }, bug: { def: -1 }, rock: { spd: -1 },
    ghost: { def: -1 }, dragon: { def: -1 }, steel: { atk: -1 }, dark: { def: -1 },
    fairy: { atk: -1 }
    // normal: 无
  };

  var STRIKE_MS = 260;
  var IMPACT_MS = 540;
  var RECOVER_MS = 600;
  var FAINT_MS = 950;
  var SWITCH_MS = 500;
  var AI_PAUSE_MS = 750;

  var state = null;
  var busy = false;
  var setup = { mode: "random", selected: [], typeFilter: "all", genFilter: "all", query: "", difficulty: "normal" };

  /* ---------- 快进模式：缩短所有节奏 setTimeout ---------- */
  var FAST = false;
  function monById(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; }
  function wait(ms, cb) { return setTimeout(cb, FAST ? Math.min(16, ms) : ms); }

  /* ---------- 对战计时器（仅浏览器；headless 因 document.body 为 null 自动跳过）---------- */
  var battleTimerId = null;
  function fmtTime(ms) {
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60); s = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function updateBattleTimer() {
    var el = document.getElementById("battle-timer");
    if (!el || !state || !state.startTime) return;
    if (state.over) { if (!state.endTime) state.endTime = Date.now(); stopBattleTimer(); }
    var ms = (state.over && state.endTime ? state.endTime : Date.now()) - state.startTime;
    el.textContent = "⏱ " + fmtTime(ms);
  }
  function startBattleTimer() {
    if (typeof document === "undefined" || !document.body) return;
    stopBattleTimer();
    battleTimerId = setInterval(updateBattleTimer, 250);
    updateBattleTimer();
  }
  function stopBattleTimer() { if (battleTimerId) { clearInterval(battleTimerId); battleTimerId = null; } }
  var statsCollapsed = true; // 战绩面板默认折叠，给选择区域留空间
  var _memStats = null; // headless/无 localStorage 时的内存兜底
  var shinyMode = false; // 闪光模式开关

  // 安全音效封装：无 BattleAudio 或 AudioContext 时降级为 no-op
  function sfx(name) {
    try { if (window.BattleAudio && !window.BattleAudio.isMuted()) window.BattleAudio.play(name); } catch (e) {}
  }

  /* ---------- 闪光模式 ---------- */
  function loadShinyMode() {
    try { shinyMode = localStorage.getItem("pk_shiny_mode") === "1"; } catch (e) { shinyMode = false; }
  }
  function saveShinyMode() {
    try { localStorage.setItem("pk_shiny_mode", shinyMode ? "1" : "0"); } catch (e) {}
  }

  /* ---------- 设置（持久化到 localStorage）---------- */
  var settings = { muted: false, reduceMotion: false };
  var ONBOARD_KEY = "pk_onboarded";
  function loadSettings() {
    try {
      var raw = localStorage.getItem("pk_settings_v1");
      if (raw) {
        var o = JSON.parse(raw);
        if (typeof o.muted === "boolean") settings.muted = o.muted;
        if (typeof o.reduceMotion === "boolean") settings.reduceMotion = o.reduceMotion;
      }
    } catch (e) {}
  }
  function saveSettings() {
    try { localStorage.setItem("pk_settings_v1", JSON.stringify(settings)); } catch (e) {}
  }
  function applySettings() {
    if (window.BattleAudio && window.BattleAudio.setMuted) {
      try { window.BattleAudio.setMuted(settings.muted); } catch (e) {}
    }
    if (typeof document !== "undefined" && document.body) {
      document.body.classList.toggle("reduce-motion", !!settings.reduceMotion);
    }
  }
  function hasOnboarded() {
    try { return localStorage.getItem(ONBOARD_KEY) === "1"; } catch (e) { return false; }
  }
  function markOnboarded() {
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch (e) {}
  }
  function updateShinyToggles() {
    var mainBtn = document.getElementById("shiny-toggle");
    var setupBtn = document.getElementById("setup-shiny-toggle");
    var label = shinyMode ? "✨ 普通模式" : "✨ 闪光模式";
    if (mainBtn) mainBtn.textContent = label;
    if (setupBtn) setupBtn.textContent = label;
    if (mainBtn) mainBtn.classList.toggle("active", shinyMode);
    if (setupBtn) setupBtn.classList.toggle("active", shinyMode);
  }
  function setShinyMode(v) {
    shinyMode = !!v;
    saveShinyMode();
    updateShinyToggles();
    // 重新渲染当前可见的精灵图
    if (state && !state.over) render();
    if (document.getElementById("setup").classList.contains("show")) {
      renderPicker();
    }
    toast("已切换到" + (shinyMode ? "闪光" : "普通") + "模式");
  }

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
  function spriteOf(mon) {
    if (!mon) return "";
    if (shinyMode && mon.shiny_sprite) return mon.shiny_sprite;
    return mon.sprite || "";
  }
  function typeMult(moveType, defTypes) {
    var m = 1;
    for (var i = 0; i < defTypes.length; i++) {
      var row = EFFECT[moveType];
      if (row && row[defTypes[i]] !== undefined) m *= row[defTypes[i]];
    }
    return m;
  }
  // 太晶化：出招时所有招式按太晶属性计算（获得 STAB）；防御时变为单一太晶属性
  function atkType(card, move) {
    return (card && card.teraType) ? card.teraType : (move ? move.type : null);
  }
  function defTypes(card) {
    return (card && card.teraType) ? [card.teraType] : (card ? card.mon.types : []);
  }
  // 依据费用档位（0=1费, 1=2费, 2=3费）把基础数值换算成技能威力
  function movePower(base, tier) {
    if (tier === 0) return clamp(Math.round(base * 0.42) + 14, 30, 75);
    if (tier === 1) return clamp(Math.round(base * 0.62) + 24, 48, 115);
    return clamp(Math.round(base * 0.85) + 34, 68, 160);
  }
  function withCooldown(mv) { mv.cooldown = mv.cost >= 3 ? 1 : 0; return mv; }
  // ---- 真实招式系统（基于 moves.js / mon_moves.js）----
  function statKey(pokeapiName) {
    return { attack: "atk", defense: "def", "special-attack": "spa",
             "special-defense": "spd", speed: "spe" }[pokeapiName] || null;
  }
  function statMap(statArr) {
    var o = {};
    (statArr || []).forEach(function (s) {
      var k = statKey(s[1]);
      if (k) o[k] = (o[k] || 0) + s[0];
    });
    return o;
  }
  function realMove(mon, slug) {
    var md = (window.MOVE_DB || {})[slug];
    if (!md) return null;
    var isStatus = md.kind === "status";
    var isDmg = md.kind === "damage";
    return {
      slug: slug,
      name: md.zh || slug.replace(/-/g, " "),
      type: md.type,
      power: md.power || 0,
      cat: md.cat,
      kind: md.kind,
      effect: md.effect || null,
      chance: md.chance || 0,
      heal: md.heal || 0,
      stat: md.stat || [],
      acc: (md.acc == null ? 100 : md.acc),
      weather: null,
      status: isStatus ? md.effect : (isDmg && md.effect ? md.effect : null),
      statusChance: isStatus ? 1 : (isDmg && md.effect ? (md.chance || 0) / 100 : 0),
      buff: md.kind === "boost" ? statMap(md.stat) : null,
      debuff: md.kind === "debuff" ? statMap(md.stat) : null,
      cooldown: 0
    };
  }
  function pickFour(cands, mon) {
    var out = [];
    var isWeather = function (m) { return WEATHER_MOVES.indexOf(m.slug) >= 0; };
    var dmg = cands.filter(function (m) { return m.kind === "damage"; });
    var stabs = dmg.filter(function (m) { return mon.types.indexOf(m.type) >= 0; })
                   .sort(function (a, b) { return (b.power || 0) - (a.power || 0); });
    // 输出核心：优先本系伤害，退而求其次任意伤害招
    var core = stabs[0] || dmg.slice().sort(function (a, b) { return (b.power || 0) - (a.power || 0); })[0];
    if (core) out.push(core);
    // 天气/控场招单独保留一个槽位（读招博弈核心：天气系统必须能被实装）
    var weather = cands.filter(function (m) { return m.kind !== "damage" && isWeather(m); })
                       .sort(function (a, b) { return (movesortKey(b) - movesortKey(a)); });
    if (weather[0] && out.indexOf(weather[0]) < 0) out.push(weather[0]);
    // 其他变化招（异常/强化/削弱/寄生/替身等）：再保留一个槽位
    var sup = cands.filter(function (m) { return m.kind !== "damage" && !isWeather(m); })
                   .sort(function (a, b) { return (movesortKey(b) - movesortKey(a)); });
    if (sup[0] && out.indexOf(sup[0]) < 0) out.push(sup[0]);
    // 其余按：同系伤害 > 其他伤害 > 剩余变化招 填满
    var rest = cands.filter(function (m) { return out.indexOf(m) < 0; });
    var fillDmg = rest.filter(function (m) { return m.kind === "damage"; })
                      .sort(function (a, b) { return (b.power || 0) - (a.power || 0); });
    while (out.length < 3 && fillDmg.length) {
      out.push(fillDmg.shift());
      rest = rest.filter(function (m) { return out.indexOf(m) < 0; });
    }
    while (out.length < 4 && rest.length) {
      out.push(rest.shift());
    }
    var i = 0;
    while (out.length < 4 && i < cands.length) {
      if (out.indexOf(cands[i]) < 0) out.push(cands[i]);
      i++;
    }
    return out.slice(0, 4);
  }
  // 变化招的优先度：异常/控场类（博弈价值高）略优先于回复类
  function movesortKey(m) {
    if (m.kind === "control") return 40;
    if (m.kind === "status") return 35;
    if (m.kind === "boost" || m.kind === "debuff") return 30;
    if (m.kind === "heal") return 20;
    if (m.kind === "damage") return m.power || 0;
    return 10;
  }
  // 分配费用：满足不变量 costs=[1,1,2,3]，并保证至少 1 个 1 能量招是伤害招
  // （开局即可进攻，避免「1 能量全是状态技」的死局）。最弱伤害招固定 1 费（廉价进攻），
  // 最强伤害→3 费、次强→2 费，剩余槽位按价值从「剩余伤害(强优先)+变化招」中取最优。
  function assignMoveCosts(chosen) {
    var dmg = chosen.filter(function (m) { return m.kind === "damage"; })
                 .sort(function (a, b) { return (b.power || 0) - (a.power || 0); }); // 强 -> 弱
    var oth = chosen.filter(function (m) { return m.kind !== "damage"; })
                 .sort(function (a, b) { return movesortKey(b) - movesortKey(a); });
    function set(m, c) { if (!m) return; m.cost = c; m.cooldown = c >= 3 ? 1 : 0; }
    function popBest() {
      if (dmg.length && (!oth.length || (dmg[0].power || 0) >= movesortKey(oth[0]))) return dmg.shift();
      return oth.length ? oth.shift() : null;
    }
    // 1) 廉价进攻槽：最弱伤害招固定 1 费（保证开局有伤害可用）
    if (dmg.length) set(dmg.pop(), 1);
    // 2) 高费槽从「剩余伤害 + 变化招」取最优
    set(popBest(), 3);
    set(popBest(), 2);
    set(popBest(), 1);
    // 3) 兜底：chosen 多于 4（不应发生）或前述未分配满，全部补到 1 费
    while (dmg.length) set(dmg.shift(), 1);
    while (oth.length) set(oth.shift(), 1);
  }
  function genMovesKit(mon) {
    // 兜底：数据缺失时用原属性模板
    var t1 = mon.types[0], t2 = mon.types[1] || "normal";
    var k1 = MOVE_KIT[t1] || MOVE_KIT.normal, k2 = MOVE_KIT[t2] || MOVE_KIT.normal;
    var m1 = { name: k1[0], type: t1, power: movePower(mon.attack, 0), cost: 1, cat: "phys", kind: "damage" };
    var m1b = { name: k2[1], type: t2, power: movePower(mon.sp_attack, 0), cost: 1, cat: "spec", kind: "damage" };
    var m2 = { name: k1[2], type: t1, power: movePower(mon.sp_attack, 1), cost: 2, cat: "spec", kind: "damage" };
    var m3 = { name: k2[3], type: t2, power: movePower(mon.attack, 2), cost: 3, cat: "phys", kind: "damage" };
    var s1 = TYPE_STATUS[t1]; if (s1) { m2.status = s1; m2.statusChance = 0.20; }
    var s2 = TYPE_STATUS[t2]; if (s2) { m3.status = s2; m3.statusChance = 0.35; }
    var fd = FOE_DEBUFF_BY_TYPE[t1]; if (fd) m2.debuff = fd;
    var sb = SELF_BUFF_BY_TYPE[t2]; if (sb) m3.buff = sb;
    if (WEATHER_MOVE[m2.name]) m2.weather = WEATHER_MOVE[m2.name];
    if (WEATHER_MOVE[m3.name]) m3.weather = WEATHER_MOVE[m3.name];
    return [m1, m1b, m2, m3];
  }
  function genMoves(mon) {
    var slugs = (window.MON_MOVES && window.MON_MOVES[mon.id]) || [];
    var cands = [];
    slugs.forEach(function (s) {
      var m = realMove(mon, s);
      if (!m) return;
      // 本系统用威力结算伤害，无法表示固定伤害/一击必杀招（power 为 0/null），剔除
      if (m.kind === "damage" && !(m.power > 0)) return;
      cands.push(m);
    });
    var hasDamage = cands.some(function (m) { return m.kind === "damage"; });
    if (!hasDamage) cands = genMovesKit(mon);            // 完全无伤害招 -> 整体模板兜底
    else if (cands.length < 4) cands = cands.concat(genMovesKit(mon));
    var chosen = pickFour(cands, mon);
    // 双保险：极端情况下仍保证有伤害招，否则对战无法结束
    if (!chosen.some(function (m) { return m.kind === "damage"; })) {
      var kit = genMovesKit(mon);
      chosen[0] = kit[0];
    }
    // 分配费用：保证至少 1 个 1 能量招式是伤害招（开局即可进攻），
    // 强招落高费槽，最弱伤害招作廉价进攻固定 1 费。
    assignMoveCosts(chosen);
    // 最终按费用升序排列，满足不变量 costs=[1,1,2,3]
    chosen.sort(function (a, b) { return a.cost - b.cost; });
    return chosen;
  }
  // 极巨招式：保留同一套招式的属性/类型/费用，威力提升并以「极巨」前缀重命名。
  // 与超级进化不同，极巨化不改变物种，而是把现有招式临时升级为极巨招式。
  function genMaxMoves(mon) {
    return genMoves(mon).map(function (mv) {
      var isDmg = mv.kind === "damage";
      return {
        name: "极巨" + mv.name,
        type: mv.type,
        power: isDmg ? clamp(Math.round(mv.power * DYNAMAX_POWER_MULT), 40, 220) : 90,
        cost: mv.cost,
        cat: mv.cat === "status" ? "phys" : mv.cat,
        kind: "damage",
        status: isDmg ? mv.status : null,
        statusChance: isDmg ? mv.statusChance : 0,
        buff: null,
        debuff: null,
        weather: mv.weather,
        max: true
      };
    });
  }
  function makeCard(mon) {
    return {
      mon: mon, maxHp: mon.hp, hp: mon.hp, energy: 0, status: null,
      fainted: false, moves: genMoves(mon),
      item: itemForKey(mon),
      buffs: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      cooldowns: [0, 0, 0, 0],
      teraType: null // 太晶属性（null=未太晶化）
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
      return { name: name, active: active, bench: bench, deck: deck, graveyard: [], megaUsed: false, dynamaxUsed: false, teraUsed: false };
    }
    state = {
      you: buildPlayer("你", youMons),
      ai: buildPlayer("电脑", aiMons),
      turn: "you", firstMover: "you", over: false, winner: null, log: [],
      weather: { type: "none", turns: 0 },
      round: 0,
      difficulty: setup.difficulty || "normal",
      replay: []
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
    state.startTime = Date.now();
    state.endTime = 0;
    log("sys", "对战开始！双方各派出一只宝可梦，先让对方无宝可梦可派者获胜。");
    render();
    startBattleTimer();
  }

  function beginGame(youMons) {
    hideOverlays();
    setup.selected = [];
    busy = false; // fresh battle must never inherit a stuck busy-lock from a previous one
    newGame(youMons);
    startRound();
  }

  /* ---------- logging ---------- */
  function log(cls, msg) {
    state.log.push({ cls: cls, msg: msg });
    if (state.log.length > 40) state.log.shift();
  }

  /* ---------- 战绩 / 成就（localStorage，headless 用内存兜底）---------- */
  function defaultStats() {
    return {
      wins: 0, losses: 0, streak: 0, best: 0, total: 0,
      byDiff: { easy: 0, normal: 0, hard: 0 },
      ach: {}, weatherWin: 0, megaWin: 0, dynaWin: 0, teraWin: 0, flawless: 0
    };
  }
  function loadStats() {
    var def = defaultStats();
    try {
      if (typeof localStorage === "undefined") return _memStats || def;
      var raw = localStorage.getItem("pk_stats_v1");
      if (!raw) return def;
      var o = JSON.parse(raw);
      for (var k in def) if (o[k] === undefined) o[k] = def[k];
      if (!o.byDiff) o.byDiff = { easy: 0, normal: 0, hard: 0 };
      if (!o.ach) o.ach = {};
      return o;
    } catch (e) { return def; }
  }
  function saveStats(s) {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem("pk_stats_v1", JSON.stringify(s));
      else _memStats = s;
    } catch (e) {}
  }
  function recordResult(youWin, diff) {
    var s = loadStats();
    s.total += 1;
    if (youWin) {
      s.wins += 1; s.streak += 1; if (s.streak > s.best) s.best = s.streak;
      if (diff && s.byDiff[diff] != null) s.byDiff[diff] += 1;
      if (state.weather && state.weather.type !== "none") s.weatherWin += 1;
      if (state.you.megaUsed) s.megaWin += 1;
      if (state.you.dynamaxUsed) s.dynaWin += 1;
      if (state.you.teraUsed) s.teraWin += 1;
      if (state.you.graveyard.length === 0) s.flawless += 1; // 无一只倒下
    } else {
      s.losses += 1; s.streak = 0;
    }
    var unlocked = [];
    function unlock(key, label) { if (!s.ach[key]) { s.ach[key] = true; unlocked.push(label); } }
    if (s.wins >= 1) unlock("first_win", "首胜");
    if (s.streak >= 5) unlock("streak5", "五连胜");
    if (s.streak >= 10) unlock("streak10", "十连胜");
    if (s.total >= 100) unlock("hundred", "百战老兵");
    if (s.megaWin >= 1) unlock("mega_win", "超级进化胜利");
    if (s.dynaWin >= 1) unlock("dyna_win", "极巨化胜利");
    if (s.teraWin >= 1) unlock("tera_win", "太晶化胜利");
    if (s.weatherWin >= 1) unlock("weather", "天气大师");
    if (s.flawless >= 1) unlock("flawless", "全员凯旋");
    saveStats(s);
    return unlocked;
  }

  /* ---------- 战斗回放 ---------- */
  function recordEvent(type, text) {
    if (!state || !state.replay) return;
    var ya = state.you.active, aa = state.ai.active;
    state.replay.push({
      type: type, text: text || "",
      youName: ya ? ya.mon.name_zh : "", youHp: ya ? ya.hp : 0, youMax: ya ? ya.maxHp : 0,
      aiName: aa ? aa.mon.name_zh : "", aiHp: aa ? aa.hp : 0, aiMax: aa ? aa.maxHp : 0,
      weather: (state.weather && state.weather.type !== "none") ? state.weather.type : "none"
    });
  }

  /* ---------- combat ---------- */
  function effStat(card, key) {
    var map = { atk: "attack", def: "defense", spa: "sp_attack", spd: "sp_defense", spe: "speed" };
    var base = card.mon[map[key]];
    var stage = (card.buffs && card.buffs[key]) || 0;
    return base * stageMult(stage);
  }
  function effSpeed(card) {
    if (!card || !card.mon) return 0;
    var sp = (card.buffs && card.buffs.spe) ? card.buffs.spe : 0;
    return card.mon.speed * stageMult(sp);
  }
  function weatherMult(moveType, weatherType) {
    var w = WEATHER[weatherType] || WEATHER.none;
    if (!w.atk) return 1;
    if (moveType === w.atk) return w.mult;
    if (w.weak && moveType === w.weak) return 1 / w.mult;
    return 1;
  }
  function itemDamageMult(attacker, move) {
    var it = attacker.item;
    if (!it) return 1;
    if (it === "band" && move.cat === "phys") return 1.5;
    if (it === "specs" && move.cat === "spec") return 1.5;
    if (it === "lifeorb") return 1.3;
    return 1;
  }
  function expectedDamage(attacker, defender, move) {
    var atk = effStat(attacker, move.cat === "phys" ? "atk" : "spa");
    var def = effStat(defender, move.cat === "phys" ? "def" : "spd");
    var typeM = typeMult(atkType(attacker, move), defTypes(defender));
    var mult = typeM * weatherMult(move.type, state.weather.type);
    var dmg = Math.max(1, Math.floor(move.power * (atk / (def + 10)) * 0.5 * mult));
    if (attacker.status && attacker.status.type === "burn" && move.cat === "phys") dmg = Math.floor(dmg * 0.5);
    dmg = Math.floor(dmg * itemDamageMult(attacker, move));
    return dmg;
  }
  function rollDamage(attacker, defender, move) {
    var atk = effStat(attacker, move.cat === "phys" ? "atk" : "spa");
    var def = effStat(defender, move.cat === "phys" ? "def" : "spd");
    var typeM = typeMult(atkType(attacker, move), defTypes(defender));
    var mult = typeM * weatherMult(move.type, state.weather.type);
    var variance = 0.85 + Math.random() * 0.15;
    var dmg = Math.max(1, Math.floor(move.power * (atk / (def + 10)) * 0.5 * mult * variance));
    if (attacker.status && attacker.status.type === "burn" && move.cat === "phys") dmg = Math.floor(dmg * 0.5);
    var crit = mult > 0 && Math.random() < CRIT_CHANCE;
    if (crit) dmg = Math.floor(dmg * CRIT_MULT);
    dmg = Math.floor(dmg * itemDamageMult(attacker, move));
    if (defender.screens) {
      if (defender.screens.phys > 0 && move.cat === "phys") dmg = Math.floor(dmg * 0.67);
      if (defender.screens.spec > 0 && move.cat === "spec") dmg = Math.floor(dmg * 0.67);
    }
    return { dmg: dmg, mult: mult, crit: crit };
  }

  function useMove(side, moveIdx, callback) {
    var me = state[side];
    var foe = state[side === "you" ? "ai" : "you"];
    var foeSide = side === "you" ? "ai" : "you";
    var attacker = me.active, defender = foe.active;
    var move = attacker.moves[moveIdx];
    if (move.kind && move.kind !== "damage") { useStatusMove(side, moveIdx, callback, move); return; }
    if (attacker.energy < move.cost) { if (callback) callback(); return; }
    if (attacker.cooldowns && attacker.cooldowns[moveIdx] > 0) { if (callback) callback(); return; }
    attacker.energy -= move.cost;
    if (attacker.cooldowns) attacker.cooldowns[moveIdx] = move.cooldown || 0;

    var who = side === "you" ? "你" : "电脑";

    // 命中判定：真实招式带 acc 字段，按命中率掷骰；模板招式无 acc，默认必中
    if (move.acc != null && Math.random() * 100 >= move.acc) {
      log(side, who + "的" + attacker.mon.name_zh + " 的【" + move.name + "】没有命中！");
      render(); sfx("move");
      animateStrike(side, move, { dmg: 0, mult: 1, crit: false });
      wait(IMPACT_MS, function () { if (callback) callback(); });
      return;
    }

    var r = rollDamage(attacker, defender, move);

    // 替身：抵挡一次攻击
    if (defender.substitute && r.dmg > 0) {
      defender.substitute = false;
      r.dmg = 0;
      log("eff", foe.name + "的" + defender.mon.name_zh + " 的替身抵挡了攻击！");
    }
    // 气势披带：满血受致命伤时保命（每场一次）
    if (r.dmg > 0 && defender.item === "sash" && defender.hp === defender.maxHp && r.dmg >= defender.hp) {
      defender.item = null;
      r.dmg = defender.maxHp - 1;
      defender.hp = 1;
      log("eff", foe.name + "的" + defender.mon.name_zh + " 的【气势披带】生效，在致命一击下保住了 1 点体力！");
    } else {
      defender.hp = Math.max(0, defender.hp - r.dmg);
    }

    var effTxt = r.mult >= 2 ? "效果拔群！" : r.mult === 0 ? "没有效果…"
      : r.mult < 1 ? "效果不太好…" : "";
    var critTxt = r.crit ? "（暴击！）" : "";
    var line = who + "的" + attacker.mon.name_zh + " 使用【" + move.name + "】，对" +
               defender.mon.name_zh + " 造成 " + r.dmg + " 点伤害。" + effTxt + critTxt;
    log(side, line);
    recordEvent(r.crit ? "crit" : "move", line);

    // 生命宝珠：增伤后的反作用力（最高损失 1/10 最大体力，不会自我击倒）
    if (attacker.item === "lifeorb" && r.dmg > 0) {
      var recoil = Math.max(1, Math.floor(attacker.maxHp / 10));
      attacker.hp = Math.max(1, attacker.hp - recoil);
      log("eff", who + "的" + attacker.mon.name_zh + " 因【生命宝珠】受到 " + recoil + " 点反作用力伤害。");
    }

    // 引出天气
    if (move.weather && WEATHER[move.weather]) {
      state.weather = { type: move.weather, turns: WEATHER_DURATION };
      var wLine = who + "的" + attacker.mon.name_zh + " 引发了" + WEATHER[move.weather].name + "！";
      log("sys", wLine);
      recordEvent("weather", wLine);
      sfx("weather");
    }

    // 能力等级变化（命中且非无效时）
    if (r.mult > 0) {
      if (move.buff) applyBuff(attacker, move.buff, attacker.mon.name_zh, who);
      if (move.debuff && defender.hp > 0) applyBuff(defender, move.debuff, defender.mon.name_zh, foe.name);
    }

    // show energy change / hp bar drop before the impact animation
    render();
    sfx("move");
    animateStrike(side, move, r);

    wait(IMPACT_MS, function () {
      if (defender.hp <= 0) {
        handleFaint(foeSide, callback);
      } else {
        if (move.status && !defender.status && Math.random() < move.statusChance) {
          if (defender.safeguard && defender.safeguard > 0) {
            log("eff", foe.name + "的" + defender.mon.name_zh + " 被神秘守护保护，未陷入异常！");
          } else {
            defender.status = { type: move.status, turns: statusTurns(move.status) };
            log("eff", foe.name + "的" + defender.mon.name_zh + " 陷入了" + STATUS_ZH[move.status] + "状态！");
          }
        }
        sfx(r.crit ? "crit" : "hit");
        if (callback) callback();
      }
    });
  }

  function useStatusMove(side, moveIdx, callback, move) {
    var me = state[side];
    var foe = state[side === "you" ? "ai" : "you"];
    var attacker = me.active, defender = foe.active;
    if (attacker.energy < move.cost) { if (callback) callback(); return; }
    if (attacker.cooldowns && attacker.cooldowns[moveIdx] > 0) { if (callback) callback(); return; }
    attacker.energy -= move.cost;
    if (attacker.cooldowns) attacker.cooldowns[moveIdx] = move.cooldown || 0;
    var who = side === "you" ? "你" : "电脑";
    var line = who + "的" + attacker.mon.name_zh + " 使用【" + move.name + "】！";
    log(side, line);
    recordEvent("move", line);
    var acted = false;
    function finish() {
      if (acted) return; acted = true;
      render();
      sfx("move");
      animateStrike(side, move, { dmg: 0, mult: 1, crit: false });
      wait(IMPACT_MS, function () { if (callback) callback(); });
    }
    if (move.kind === "boost") {
      applyBuff(attacker, move.buff, attacker.mon.name_zh, who);
      finish();
    } else if (move.kind === "debuff") {
      applyBuff(defender, move.debuff, defender.mon.name_zh, foe.name);
      finish();
    } else if (move.kind === "heal") {
      var amt = Math.max(1, Math.floor(attacker.maxHp * (move.heal / 100)));
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + amt);
      log("eff", who + "的" + attacker.mon.name_zh + " 回复了 " + amt + " 点体力！");
      finish();
    } else if (move.kind === "status") {
      if (Math.random() * 100 < move.chance) {
        if (move.effect === "sleep2") {
          attacker.status = { type: "sleep", turns: 2, rest: true };
          attacker.hp = attacker.maxHp;
          log("eff", who + "的" + attacker.mon.name_zh + " 睡着了，回复了全部体力！");
        } else if (!defender.status) {
          defender.status = { type: move.effect, turns: statusTurns(move.effect) };
          log("eff", foe.name + "的" + defender.mon.name_zh + " 陷入了" + STATUS_ZH[move.effect] + "状态！");
        }
      } else {
        log("eff", "但是【" + move.name + "】没有命中…");
      }
      finish();
    } else if (move.kind === "control") {
      applyControl(side, move);
      finish();
    } else {
      finish();
    }
  }

  function applyControl(side, move) {
    var me = state[side];
    var foe = state[side === "you" ? "ai" : "you"];
    var attacker = me.active, defender = foe.active;
    var who = side === "you" ? "你" : "电脑";
    var slug = move.slug;
    if (slug === "leech-seed") {
      defender.leech = attacker;
      log("eff", foe.name + "的" + defender.mon.name_zh + " 被寄生种子附身！");
    } else if (slug === "substitute") {
      attacker.substitute = true;
      log("eff", who + "的" + attacker.mon.name_zh + " 制造了替身！");
    } else if (slug === "reflect") {
      attacker.screens = attacker.screens || {}; attacker.screens.phys = 5;
      log("eff", who + "的" + attacker.mon.name_zh + " 竖起了反射壁（物理伤害减半）！");
    } else if (slug === "light-screen") {
      attacker.screens = attacker.screens || {}; attacker.screens.spec = 5;
      log("eff", who + "的" + attacker.mon.name_zh + " 竖起了光墙（特殊伤害减半）！");
    } else if (slug === "safeguard") {
      attacker.safeguard = 5;
      log("eff", who + "的" + attacker.mon.name_zh + " 被神秘守护笼罩（免疫异常）！");
    } else if (slug === "sunny-day" || slug === "rain-dance" || slug === "sandstorm" || slug === "hail") {
      var wmap = { "sunny-day": "sunny", "rain-dance": "rain", "sandstorm": "sandstorm", "hail": "hail" };
      var wt = wmap[slug];
      state.weather = { type: wt, turns: WEATHER_DURATION };
      log("eff", who + "的" + attacker.mon.name_zh + " 引发了" + WEATHER[wt].name + "！");
      sfx("weather");
    } else {
      log("eff", "【" + move.name + "】的效果暂未实装。");
    }
  }

  function applyBuff(card, delta, monName, whoName) {
    if (!card.buffs) card.buffs = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    Object.keys(delta).forEach(function (k) {
      var before = card.buffs[k] || 0;
      var after = clamp(before + delta[k], -6, 6);
      if (after !== before) {
        card.buffs[k] = after;
        var arrow = after > 0 ? "提升" : "下降";
        log("eff", whoName + "的" + monName + " 的" + (BUFF_LABEL[k] || k) + arrow + "了！");
      }
    });
  }
  function resetBuffs(c) {
    if (c) c.buffs = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  }

  function afterMove(side) {
    if (state.over) return;
    // 回合结束结算极巨化计时：发动回合不计数，之后每回合 -1，归零则恢复原状
    var p = state[side];
    if (p.active.dynamaxTurns > 0) {
      if (p.active._dynamaxJustActivated) {
        p.active._dynamaxJustActivated = false;
      } else {
        p.active.dynamaxTurns -= 1;
        if (p.active.dynamaxTurns <= 0) revertDynamax(side);
      }
    }
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
    var killLine = p.name + "的" + dead.mon.name_zh + " 倒下了！";
    log("kill", killLine);
    recordEvent("ko", killLine);
    sfx("ko");

    // keep the fainted card visible for a moment so the player notices it
    render();
    animateFaint(side);

    wait(FAINT_MS, function () {
      if (p.bench.length > 0) {
        p.graveyard.push(dead);
        var best = 0;
        for (var i = 1; i < p.bench.length; i++) {
          if (p.bench[i].hp > p.bench[best].hp) best = i;
        }
        var promoted = p.bench.splice(best, 1)[0];
        p.active = promoted;
        resetBuffs(promoted); if (promoted.cooldowns) promoted.cooldowns = [0, 0, 0, 0];
        log("sys", p.name + " 派出 " + promoted.mon.name_zh + " 上场！");
      } else if (p.deck.length > 0) {
        p.graveyard.push(dead);
        p.active = p.deck.shift();
        resetBuffs(p.active); if (p.active.cooldowns) p.active.cooldowns = [0, 0, 0, 0];
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
      wait(SWITCH_MS, function () {
        if (callback) callback();
      });
    });
  }

  function doSwitch(side, benchIdx) {
    var p = state[side];
    if (benchIdx < 0 || benchIdx >= p.bench.length) return;
    var incoming = p.bench.splice(benchIdx, 1)[0];
    resetBuffs(p.active);   // 下场者能力等级重置
    resetBuffs(incoming);   // 上场者以初始等级登场
    p.bench.push(p.active);
    p.active = incoming;
    var who = side === "you" ? "你" : "电脑";
    var swLine = who + " 换上 " + incoming.mon.name_zh + "（" + p.active.mon.name_zh + " 退居后备）。";
    log("sys", swLine);
    recordEvent("switch", swLine);
    sfx("switch");
  }

  /* ---------- turn flow ---------- */
  function decideFirstMover() {
    var y = effSpeed(state.you.active), a = effSpeed(state.ai.active);
    if (y > a) return "you";
    if (a > y) return "ai";
    return Math.random() < 0.5 ? "you" : "ai";
  }

  function startRound() {
    if (state.over) return;
    state.round += 1;
    // 天气倒计时：每回合（一轮）结束递减，归零则消散
    try {
      if (state.weather && state.weather.type !== "none") {
        state.weather.turns -= 1;
        if (state.weather.turns <= 0) {
          log("sys", (WEATHER[state.weather.type] ? WEATHER[state.weather.type].name : "天气") + " 散去了。");
          state.weather = { type: "none", turns: 0 };
        }
      }
    } catch (e) {}
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

    // 携带物：剩饭每回合开始回复
    try {
      if (p.active.item === "leftovers" && p.active.hp < p.active.maxHp) {
        var lh = Math.max(1, Math.floor(p.active.maxHp / 16));
        p.active.hp = Math.min(p.active.maxHp, p.active.hp + lh);
        log("sys", p.name + "的" + p.active.mon.name_zh + " 通过【剩饭】回复了 " + lh + " 点体力。");
      }
    } catch (e) {}
    // 技能冷却递减
    try {
      if (p.active.cooldowns) {
        for (var ci = 0; ci < p.active.cooldowns.length; ci++) {
          if (p.active.cooldowns[ci] > 0) p.active.cooldowns[ci] -= 1;
        }
      }
    } catch (e) {}
    // 天气场地伤害（沙暴/冰雹），免疫属性不受影响
    try {
      var wt = state.weather && state.weather.type;
      if (wt === "sandstorm" || wt === "hail") {
        var w = WEATHER[wt];
        var c0 = p.active;
        var immune = w.immune && w.immune.some(function (t) { return c0.mon.types.indexOf(t) >= 0; });
        if (!immune) {
          var chip = Math.max(1, Math.floor(c0.maxHp / 16));
          c0.hp = Math.max(0, c0.hp - chip);
          log("sys", p.name + "的" + c0.mon.name_zh + " 受到" + w.name + "影响，损失 " + chip + " 点体力！");
          if (c0.hp <= 0) {
            render();
            handleFaint(side, function () { afterMove(side); });
            return;
          }
        }
      }
    } catch (e) {}

    // 寄生种子：每回合损失体力，转移给施法者
    try {
      var lc = p.active;
      if (lc.leech && lc.leech.active) {
        var lp = Math.max(1, Math.floor(lc.maxHp / 8));
        lc.hp = Math.max(0, lc.hp - lp);
        var srcC = lc.leech;
        if (srcC && srcC.active) srcC.active.hp = Math.min(srcC.active.maxHp, srcC.active.hp + lp);
        log("sys", p.name + "的" + lc.mon.name_zh + " 因寄生种子损失 " + lp + " 点体力！");
        if (lc.hp <= 0) {
          render();
          handleFaint(side, function () { afterMove(side); });
          return;
        }
      }
    } catch (e) {}
    // 突然死亡：回合过多后，双方每回合承受递增的真实伤害（无视防御/守住/抗性），保证对战必然终结
    try {
      if (state.round > SUDDEN_DEATH_START) {
        var sdFactor = Math.min(SUDDEN_DEATH_MAX, SUDDEN_DEATH_STEP * (state.round - SUDDEN_DEATH_START));
        var sdDmg = Math.max(1, Math.floor(p.active.maxHp * sdFactor));
        p.active.hp = Math.max(0, p.active.hp - sdDmg);
        log("sys", p.name + "的" + p.active.mon.name_zh + " 在突然死亡下损失 " + sdDmg + " 点体力！");
        if (p.active.hp <= 0) {
          render();
          handleFaint(side, function () { afterMove(side); });
          return;
        }
      }
    } catch (e) {}
    // 场地/守护倒计时
    try {
      var sc = p.active;
      if (sc.screens) {
        if (sc.screens.phys > 0) sc.screens.phys -= 1;
        if (sc.screens.spec > 0) sc.screens.spec -= 1;
      }
      if (sc.safeguard > 0) sc.safeguard -= 1;
    } catch (e) {}

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
      wait(side === "ai" ? AI_PAUSE_MS : 450, function () { afterMove(side); });
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

  // 对手招式对我方的最大克制倍率（只看有威力的进攻招）
  function bestFoeMult(foeMoves, myTypes) {
    var best = 0;
    for (var i = 0; i < foeMoves.length; i++) {
      var mv = foeMoves[i];
      if (!mv.power) continue;
      var m = typeMult(mv.type, myTypes);
      if (m > best) best = m;
    }
    return best;
  }
  // 我方招式对对手的最大克制倍率
  function bestMyMult(myMoves, foeTypes) {
    var best = 0;
    for (var i = 0; i < myMoves.length; i++) {
      var mv = myMoves[i];
      if (!mv.power) continue;
      var m = typeMult(mv.type, foeTypes);
      if (m > best) best = m;
    }
    return best;
  }
  // 给定属性组合对对手的最大克制倍率（用于 mega 形态，无招式数据时用属性估算）
  function bestMyMultOfTypes(myTypes, foeTypes) {
    var best = 0;
    for (var i = 0; i < myTypes.length; i++) {
      var m = typeMult(myTypes[i], foeTypes);
      if (m > best) best = m;
    }
    return best;
  }

  function aiAct() {
    if (state.over) { busy = false; return; }
    var me = state.ai, foe = state.you;
    var a = me.active, d = foe.active;
    var diff = state.difficulty || "normal";
    var smart = diff !== "easy";

    wait(AI_PAUSE_MS, function () {
      // 当前形态面对对手的"被克制程度"与"输出覆盖"（太晶化后防御变为单一太晶属性）
      var myVuln = bestFoeMult(d.moves, defTypes(a));
      var myCovMoves = a.teraType
        ? a.moves.map(function (m) { return { type: a.teraType, power: m.power }; })
        : a.moves;
      var myCov = bestMyMult(myCovMoves, defTypes(d));

      // --- 太晶化（防守/进攻收益导向，持续至对战结束）---
      var teraChance = diff === "hard" ? 0.7 : diff === "normal" ? 0.45 : 0.3;
      if (!me.teraUsed && a.dynamaxTurns === 0 && a.energy >= TERA_COST) {
        var tt = a.mon.types[0];
        var foeBestVsTera = bestFoeMult(d.moves, [tt]);
        var teraWorth = (myVuln >= 2 && foeBestVsTera < myVuln - 0.4)
          || (a.hp / a.maxHp < 0.6 && Math.random() < teraChance);
        if (teraWorth) {
          useTera("ai", function () { afterMove("ai"); });
          return;
        }
      }

      // --- 超级进化（收益导向）---
      var megaChance = diff === "hard" ? 0.85 : diff === "normal" ? 0.6 : 0.4;
      if (smart && a.mon.mega && a.mon.mega.length && !me.megaUsed && !me.dynamaxUsed && a.energy >= MEGA_COST) {
        var mg = a.mon.mega[0];
        var mgVuln = bestFoeMult(d.moves, mg.types);
        var mgCov = bestMyMultOfTypes(mg.types, d.mon.types);
        var megaWorth = (mgVuln <= myVuln - 0.5) || (mgCov >= myCov + 0.5);
        if (megaWorth && a.hp / a.maxHp > 0.25) {
          useMega("ai", 0, function () { afterMove("ai"); });
          return;
        }
        if (a.hp / a.maxHp < 0.7 || Math.random() < megaChance) {
          useMega("ai", 0, function () { afterMove("ai"); });
          return;
        }
      }
      // --- 极巨化 ---
      var dmaxChance = diff === "hard" ? 0.7 : diff === "normal" ? 0.45 : 0.3;
      if (!me.dynamaxUsed && !me.megaUsed && a.dynamaxTurns === 0 && a.energy >= DYNAMAX_COST) {
        if (a.hp / a.maxHp < 0.7 || Math.random() < dmaxChance) {
          useDynamax("ai", function () { afterMove("ai"); });
          return;
        }
      }

      // --- 选招（能击倒时优先用最省能量，保留能量）---
      var choices = [];
      for (var i = 0; i < a.moves.length; i++) {
        var mv = a.moves[i];
        if (a.energy < mv.cost) continue;
        if (a.cooldowns && a.cooldowns[i] > 0) continue;
        var mult = typeMult(mv.type, d.mon.types);
        var exp = expectedDamage(a, d, mv);
        choices.push({ i: i, exp: exp, mult: mult, ko: exp >= d.hp, cost: mv.cost });
      }
      if (choices.length === 0) {
        if (me.active.energy < MAX_ENERGY) useRecover("ai", function () { afterMove("ai"); });
        else afterMove("ai");
        return;
      }
      choices.sort(function (x, y) { return (y.ko - x.ko) || (y.exp - x.exp); });
      var pick;
      if (!smart) {
        // 简单：仅在最优 2 招里随机，偏随机、不读克制、不换人
        var top = choices.slice(0, Math.min(2, choices.length));
        pick = top[Math.floor(Math.random() * top.length)];
      } else {
        // 能击倒：挑最省能量的，保留能量
        var kos = choices.filter(function (c) { return c.ko; });
        if (kos.length) { kos.sort(function (x, y) { return x.cost - y.cost; }); pick = kos[0]; }
        else pick = choices[0];
      }

      // --- 劣势换人（普通/困难）：被对手克制且无击倒机会时，换上更优替补 ---
      if (smart && !pick.ko && myVuln >= 2 && me.bench.length > 0) {
        var sBest = -1, sScore = -1;
        for (var bi = 0; bi < me.bench.length; bi++) {
          var bc = me.bench[bi];
          if (bc.fainted) continue;
          var bcVuln = bestFoeMult(d.moves, bc.mon.types);
          var bcCov = bestMyMult(bc.moves, d.mon.types);
          var score = (myVuln - bcVuln) * 100 + (bcCov - myCov) * 60 + (bc.maxHp - a.maxHp) * 0.2;
          if (bcVuln < myVuln - 0.4 && score > sScore) { sScore = score; sBest = bi; }
        }
        if (sBest >= 0) {
          doSwitch("ai", sBest);
          render();
          animateSwitch("ai");
          wait(SWITCH_MS, function () { afterMove("ai"); });
          return;
        }
      }
      // --- 低血保命换人（普通/困难）---
      if (smart && !pick.ko && a.hp / a.maxHp < 0.35 && me.bench.length > 0) {
        var bestBench = -1;
        for (var j = 0; j < me.bench.length; j++) {
          if (me.bench[j].fainted) continue;
          if (bestBench < 0 || me.bench[j].maxHp > me.bench[bestBench].maxHp) bestBench = j;
        }
        if (bestBench >= 0 && me.bench[bestBench].maxHp > a.maxHp) {
          doSwitch("ai", bestBench);
          render();
          animateSwitch("ai");
          wait(SWITCH_MS, function () { afterMove("ai"); });
          return;
        }
      }
      // --- 困难：多步评估换人 ---
      if (diff === "hard" && !pick.ko && a.hp / a.maxHp < 0.4 && me.bench.length > 0) {
        var bBest = -1, bScore = -1;
        for (var bi2 = 0; bi2 < me.bench.length; bi2++) {
          var bc2 = me.bench[bi2];
          if (bc2.fainted) continue;
          var off = 0, def = 0;
          for (var mi = 0; mi < bc2.moves.length; mi++) off += expectedDamage(bc2, d, bc2.moves[mi]);
          for (var mi2 = 0; mi2 < d.moves.length; mi2++) def += expectedDamage(d, bc2, d.moves[mi2]);
          var score2 = (off - def) + (bc2.maxHp > a.maxHp ? 60 : 0);
          if (score2 > bScore) { bScore = score2; bBest = bi2; }
        }
        if (bBest >= 0 && bScore > 0 && me.bench[bBest].maxHp > a.maxHp) {
          doSwitch("ai", bBest);
          render();
          animateSwitch("ai");
          wait(SWITCH_MS, function () { afterMove("ai"); });
          return;
        }
      }

      useMove("ai", pick.i, function () {
        afterMove("ai");
      });
    });
  }

  /* human actions */
  function onMove(idx) {
    if (busy || state.over || state.turn !== "you") return;
    var c = state.you.active;
    if (c.cooldowns && c.cooldowns[idx] > 0) return; // 冷却中，不消耗回合
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
    wait(SWITCH_MS, function () {
      afterMove("you");
    });
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
    recordEvent("heal", line);
    sfx("heal");
    render();
    if (window.SkillFX && window.SkillFX.recover) window.SkillFX.recover(side, gained);
    animateRecover(side, gained);
    busy = true;
    wait(RECOVER_MS, function () { if (callback) callback(); });
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

  /* Mega Evolution: transform active card into its mega form (once per battle) */
  function onMega(i) {
    if (busy || state.over || state.turn !== "you") return;
    var me = state.you, c = me.active;
    if (!c.mon.mega || !c.mon.mega[i] || me.megaUsed || c.energy < MEGA_COST) return; // 不可用则不消耗回合
    busy = true;
    useMega("you", i, function () { afterMove("you"); });
  }
  function useMega(side, i, callback) {
    var me = state[side];
    var c = me.active;
    if (!c.mon.mega || !c.mon.mega[i] || me.megaUsed || c.energy < MEGA_COST) {
      if (callback) callback();
      return;
    }
    var mf = c.mon.mega[i];
    var origName = c.mon.name_zh;
    c.energy -= MEGA_COST;
    var ratio = c.maxHp > 0 ? c.hp / c.maxHp : 1;
    c.mon = mf;                 // swap to mega form (carries its own stats/types/sprite)
    c.maxHp = mf.hp;
    c.hp = Math.max(1, Math.round(ratio * mf.hp));
    c.moves = genMoves(c.mon);  // rebuild moves from mega stats/types
    resetBuffs(c); if (c.cooldowns) c.cooldowns = [0, 0, 0, 0];
    me.megaUsed = true;         // one Mega Evolution per battle (whole team)
    var who = side === "you" ? "你" : "电脑";
    var megaLine = who + "的" + origName + " 超级进化为 " + mf.name_zh + "！";
    log(side, megaLine);
    recordEvent("mega", megaLine);
    sfx("mega");
    render();
    animateMega(side);
    busy = true;
    wait(720, function () { if (callback) callback(); });
  }
  function animateMega(side) {
    try {
      var fx = fxLayer();
      var card = document.getElementById(elId(side));
      if (card) card.classList.add("mega-flash");
      var c = centerOf(card);
      if (fx) {
        var p = document.createElement("div");
        p.className = "dmg-txt mega"; p.textContent = "超级进化!";
        p.style.left = c.x + "px"; p.style.top = (c.y - 30) + "px";
        fx.appendChild(p);
        setTimeout(function () { try { if (p && p.parentNode) p.parentNode.removeChild(p); } catch (_) {} }, 1100);
      }
      setTimeout(function () { try { if (card) card.classList.remove("mega-flash"); } catch (_) {} }, 900);
    } catch (e) { console.warn("[PK] mega:", e); }
  }

  /* Dynamax: temporary 3-turn power-up (HP boost + Max Moves). Does NOT change
     species. Once per battle, mutually exclusive with Mega Evolution. */
  function onDynamax() {
    if (busy || state.over || state.turn !== "you") return;
    var me = state.you, c = me.active;
    // guard: invalid state -> no-op, do NOT consume the turn
    if (me.dynamaxUsed || me.megaUsed || c.dynamaxTurns > 0 || c.energy < DYNAMAX_COST) return;
    busy = true;
    useDynamax("you", function () { afterMove("you"); });
  }
  function useDynamax(side, callback) {
    var me = state[side];
    var c = me.active;
    if (me.dynamaxUsed || me.megaUsed || c.dynamaxTurns > 0 || c.energy < DYNAMAX_COST) {
      if (callback) callback();
      return;
    }
    var baseName = c.mon.name_zh;
    c.energy -= DYNAMAX_COST;
    // 体型暴涨：提升最大 HP 并按比例同步当前 HP（物种不变，c.mon.hp 即原始上限）
    var newMax = Math.max(c.maxHp, Math.round(c.maxHp * DYNAMAX_HP_MULT));
    var ratio = c.maxHp > 0 ? c.hp / c.maxHp : 1;
    c.maxHp = newMax;
    c.hp = Math.max(1, Math.round(ratio * newMax));
    // 招式临时升级为极巨招式（发动后由 afterMove 逐回合计时，归零自动还原）
    c.moves = genMaxMoves(c.mon);
    if (c.cooldowns) c.cooldowns = [0, 0, 0, 0];
    c.dynamaxTurns = DYNAMAX_TURNS;
    c._dynamaxJustActivated = true;
    me.dynamaxUsed = true; // 每场仅一次（全队共享）
    var who = side === "you" ? "你" : "电脑";
    var dmaxLine = who + "的" + baseName + " 极巨化，体型暴涨！(持续 " + DYNAMAX_TURNS + " 回合)";
    log(side, dmaxLine);
    recordEvent("dynamax", dmaxLine);
    sfx("dynamax");
    render();
    animateDynamax(side);
    busy = true;
    wait(720, function () { if (callback) callback(); });
  }
  function revertDynamax(side) {
    var me = state[side];
    var c = me.active;
    if (!c || c.dynamaxTurns === undefined) return;
    var ratio = c.maxHp > 0 ? c.hp / c.maxHp : 1;
    c.maxHp = c.mon.hp;                 // 还原原始最大 HP（极巨化期间 c.mon 未改变）
    c.hp = Math.max(1, Math.round(ratio * c.maxHp));
    c.moves = genMoves(c.mon);          // 还原普通招式
    if (c.cooldowns) c.cooldowns = [0, 0, 0, 0];
    c.dynamaxTurns = 0;
    c._dynamaxJustActivated = false;
    log("sys", me.name + "的" + c.mon.name_zh + " 极巨化结束了，恢复原状。");
  }

  /* Terastallization: change the active card's type to a single Tera Type (default
     its first type). All its moves gain that type's STAB offensively; defensively it
     becomes mono-type. Once per battle (whole team), lasts until battle ends. Does
     NOT change species/stats. */
  function onTera() {
    if (busy || state.over || state.turn !== "you") return;
    var me = state.you, c = me.active;
    if (me.teraUsed || c.dynamaxTurns > 0 || c.energy < TERA_COST) return; // 不可用则不消耗回合
    busy = true;
    useTera("you", function () { afterMove("you"); });
  }
  function useTera(side, callback) {
    var me = state[side];
    var c = me.active;
    if (me.teraUsed || c.dynamaxTurns > 0 || c.energy < TERA_COST) {
      if (callback) callback();
      return;
    }
    var baseName = c.mon.name_zh;
    c.energy -= TERA_COST;
    c.teraType = c.mon.types[0]; // 太晶属性（默认首位属性），攻防均按此属性
    me.teraUsed = true;             // 每场仅一次（全队共享），持续到对战结束
    var who = side === "you" ? "你" : "电脑";
    var tt = TYPE_ZH[c.teraType] || c.teraType;
    var teraLine = who + "的" + baseName + " 太晶化，属性变为【" + tt + "】！(持续至对战结束)";
    log(side, teraLine);
    recordEvent("tera", teraLine);
    sfx("tera");
    render();
    animateTera(side);
    busy = true;
    wait(720, function () { if (callback) callback(); });
  }
  function animateTera(side) {
    try {
      var fx = fxLayer();
      var card = document.getElementById(elId(side));
      if (card) card.classList.add("tera-flash");
      var c = centerOf(card);
      if (fx) {
        var p = document.createElement("div");
        p.className = "dmg-txt tera"; p.textContent = "太晶化!";
        p.style.left = c.x + "px"; p.style.top = (c.y - 30) + "px";
        fx.appendChild(p);
        setTimeout(function () { try { if (p && p.parentNode) p.parentNode.removeChild(p); } catch (_) {} }, 1100);
      }
      setTimeout(function () { try { if (card) card.classList.remove("tera-flash"); } catch (_) {} }, 900);
    } catch (e) { console.warn("[PK] tera:", e); }
  }
  function animateDynamax(side) {
    try {
      var fx = fxLayer();
      var card = document.getElementById(elId(side));
      if (card) card.classList.add("dynamax-flash");
      var c = centerOf(card);
      if (fx) {
        var p = document.createElement("div");
        p.className = "dmg-txt dynamax"; p.textContent = "极巨化!";
        p.style.left = c.x + "px"; p.style.top = (c.y - 30) + "px";
        fx.appendChild(p);
        setTimeout(function () { try { if (p && p.parentNode) p.parentNode.removeChild(p); } catch (_) {} }, 1100);
      }
      setTimeout(function () { try { if (card) card.classList.remove("dynamax-flash"); } catch (_) {} }, 900);
    } catch (e) { console.warn("[PK] dynamax:", e); }
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
        wait(IMPACT_MS, runImpact);
      }
    } catch(e) { console.warn("[PK] animateStrike:", e); }
  }

  function spawnDamage(defEl, r) {
    try {
      var fx = fxLayer(); if (!fx) return;
      var c = centerOf(defEl);
      var d = document.createElement("div");
      d.className = "dmg-num " + (r.crit ? "crit " : "") + (r.mult >= 2 ? "sup" : r.mult < 1 ? "weak" : "");
      d.textContent = (r.crit ? "暴击 " : "-") + r.dmg;
      d.style.left = (c.x + (Math.random() * 24 - 12)) + "px";
      d.style.top = (c.y - 20) + "px";
      fx.appendChild(d);
      setTimeout(function () { try { if (d && d.parentNode) d.parentNode.removeChild(d); }catch(_){} }, 1000);

      if (r.crit) {
        var cl = document.createElement("div");
        cl.className = "dmg-txt crit-label";
        cl.textContent = "暴击！";
        cl.style.left = (c.x + 16) + "px"; cl.style.top = (c.y - 48) + "px";
        fx.appendChild(cl);
        setTimeout(function () { try { if (cl && cl.parentNode) cl.parentNode.removeChild(cl); }catch(_){} }, 1000);
      }

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
        burst.className = "impact " + (r.crit ? "crit " : "") + (r.mult >= 2 ? "sup" : r.mult < 1 ? "weak" : "");
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
  function buffsHTML(c) {
    if (!c || !c.buffs) return "";
    var parts = [];
    Object.keys(BUFF_SHORT).forEach(function (k) {
      var s = c.buffs[k] || 0;
      if (!s) return;
      parts.push('<span class="buff ' + (s > 0 ? "up" : "down") + '">' +
        BUFF_SHORT[k] + (s > 0 ? "↑" : "↓") + (Math.abs(s) > 1 ? Math.abs(s) : "") + '</span>');
    });
    if (!parts.length) return "";
    return '<div class="buffs">' + parts.join("") + '</div>';
  }

  function cardHTML(side, p, withEnergy) {
    var c = p.active;
    var ratio = c.hp / c.maxHp;
    var headColor = TYPE_COLOR[c.mon.types[0]] || "#555";
    var opp = side === "you" ? state.ai.active : state.you.active;
    var faster = opp && effSpeed(c) > effSpeed(opp);
    var en = withEnergy
      ? '<div class="energy"><span class="lbl">能量</span>' + energyDots(c.energy) + "</div>"
      : "";
    var itemTag = (c.item && ITEM_POOL[c.item])
      ? '<span class="item-tag" title="' + ITEM_POOL[c.item].desc + '">' + ITEM_POOL[c.item].icon + ITEM_POOL[c.item].name + '</span>'
      : '';
    var speInd = (c.buffs && c.buffs.spe)
      ? (c.buffs.spe > 0 ? " ↑" + c.buffs.spe : " ↓" + (-c.buffs.spe))
      : '';
    return '' +
      '<div class="card' + (c.dynamaxTurns > 0 ? " dynamax" : "") + (c.teraType ? " tera" : "") + '" id="' + elId(side) + '" style="border-color:' + headColor + ';--head:' + headColor + ';--ry:' + (side === "you" ? "9deg" : "-9deg") + '">' +
        '<div class="head" style="background:' + headColor + '">' +
          '<span class="nm">' + c.mon.name_zh + (c.dynamaxTurns > 0 ? '<span class="dmax-tag">极巨化</span>' : '') + (c.teraType ? '<span class="tera-tag">💠' + (TYPE_ZH[c.teraType] || c.teraType) + '</span>' : '') + itemTag + '</span>' +
          '<span class="no">#' + ("00" + c.mon.id).slice(-3) + (faster ? '<span class="first">先手</span>' : '') + '</span>' +
        '</div>' +
        '<div class="art">' +
          '<img src="' + spriteOf(c.mon) + '" alt="' + c.mon.name_zh + '" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
          '<div class="fallback">' + c.mon.id + '</div>' +
        '</div>' +
        '<div class="types">' + typeChips(c.teraType ? [c.teraType] : c.mon.types) + '</div>' +
        '<div class="body">' +
          '<div class="hp-row"><span>HP</span>' +
            '<div class="hp-bar"><div class="hp-fill" style="width:' + (ratio * 100) +
              '%;background:' + hpColor(ratio) + '"></div></div>' +
            '<span>' + c.hp + "/" + c.maxHp + '</span>' +
          '</div>' +
          '<div class="spd-row"><span>速度</span><span' + (faster ? ' class="fast"' : '') + '>' +
            c.mon.speed + speInd + (faster ? ' ⚡' : '') + '</span></div>' +
          '<div class="stat-row">' +
            '<span>攻<b>' + c.mon.attack + '</b></span>' +
            '<span>防<b>' + c.mon.defense + '</b></span>' +
            '<span>特攻<b>' + c.mon.sp_attack + '</b></span>' +
            '<span>特防<b>' + c.mon.sp_defense + '</b></span>' +
          '</div>' +
          (c.status ? '<div class="status-badge" style="background:' + (STATUS_COLOR[c.status.type] || "#888") + '">' +
            STATUS_ZH[c.status.type] + (c.status.turns ? '(' + c.status.turns + ')' : '') + '</div>' : "") +
          buffsHTML(c) +
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
          '<div class="ma"><img src="' + spriteOf(c.mon) + '" alt="' + c.mon.name_zh + '" ' +
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
          '<img src="' + spriteOf(mon) + '" alt="' + mon.name_zh + '" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
          '<div class="fb">' + mon.id + '</div>' +
        '</div>' +
        hpBar + stBadge + tag +
      '</div>';
  }

  function moveKindText(mv) {
    if (mv.kind === "boost") return "强化";
    if (mv.kind === "debuff") return "削弱";
    if (mv.kind === "heal") return "回复";
    if (mv.kind === "status") return "异常:" + (STATUS_ZH[mv.effect] || mv.effect);
    if (mv.kind === "control") return "控场";
    return "变化";
  }
  function movesHTML() {
    var p = state.you;
    var c = p.active;
    var d = state.ai.active;
    var canAct = !busy && !state.over && state.turn === "you";
    var html = c.moves.map(function (mv, i) {
      var dmt = atkType(c, mv);
      var mult = typeMult(dmt, defTypes(d));
      var effCls = mult >= 2 ? "sup" : mult < 1 ? "weak" : "";
      var effIcon = mult >= 2 ? "⚔" : mult === 0 ? "✕" : mult < 1 ? "🛡" : "";
      var effTxt = mult >= 2 ? "克制 ×" + mult : mult === 0 ? "无效" : mult < 1 ? "被抵抗 ×" + mult : "";
      var onCd = c.cooldowns && c.cooldowns[i] > 0;
      var disabled = !canAct || c.energy < mv.cost || onCd;
      var need = mv.cost - c.energy;
      var costColor = c.energy >= mv.cost ? "" : ' style="color:#e3534a"';
      var costTitle = onCd ? ("冷却中 " + c.cooldowns[i] + " 回合，暂时无法使用")
        : (need > 0 ? "再攒 " + need + " 点能量可释放" : "能量充足，可释放");
      var sup = mult >= 2 ? " eff-sup" : "";
      var ready = canAct && c.energy >= mv.cost && mv.cost >= 3 && !onCd ? " ready" : "";
      var cdCls = onCd ? " on-cd" : "";
      return '' +
        '<button class="move' + sup + ready + cdCls + '" data-move="' + i + '"' + (disabled ? " disabled" : "") +
          ' title="' + costTitle + '">' +
          '<div class="mn"><span class="type-chip' + (c.teraType ? " tera" : "") + '" style="background:' + (TYPE_COLOR[dmt] || "#888") + '">' +
            (TYPE_ZH[dmt] || dmt) + '</span>' + mv.name +
            '<span class="cost"' + costColor + '>⚡ ' + mv.cost + '</span></div>' +
          '<div class="md">' +
            (mv.kind === "damage"
              ? '<span>威力 ' + mv.power + '</span><span>' + (mv.cat === "phys" ? "物理" : "特殊") + '</span>'
              : '<span class="kind-' + mv.kind + '">' + moveKindText(mv) + '</span><span>变化招</span>') +
          '</div>' +
          (mv.kind === "damage" && effTxt ? '<div class="eff ' + effCls + '">' + effIcon + ' ' + effTxt + '</div>' : "") +
          (mv.weather && WEATHER[mv.weather] ? '<div class="eff weather">' + WEATHER[mv.weather].icon + ' 引发' + WEATHER[mv.weather].name + '</div>' : "") +
          (onCd ? '<div class="eff cd">❄ 冷却 ' + c.cooldowns[i] + '</div>' : "") +
          (mv.kind === "status" ? '<div class="eff status-hint">可使对手' + (STATUS_ZH[mv.effect] || mv.effect) + '</div>' : "") +
          (mv.kind === "boost" ? '<div class="eff buff-hint">强化自身</div>' : "") +
          (mv.kind === "debuff" ? '<div class="eff debuff-hint">削弱对手</div>' : "") +
          (mv.kind === "heal" ? '<div class="eff heal-hint">回复体力</div>' : "") +
          (mv.kind === "control" ? '<div class="eff ctrl-hint">' + (mv.slug === "leech-seed" ? "寄生种子" : mv.slug === "substitute" ? "替身" : mv.slug === "reflect" ? "反射壁" : mv.slug === "light-screen" ? "光墙" : "控场") + '</div>' : "") +
        '</button>';
    }).join("");
    var canRecover = canAct && c.energy < MAX_ENERGY;
    html += '<button class="move recover' + (canRecover ? "" : " disabled") + '" data-recover="1">' +
        '<div class="mn"><span class="type-chip recover">回复</span>聚气 · 回复能量' +
        '<span class="cost">0 能量</span></div>' +
        '<div class="md"><span>恢复 2 能量</span><span>支援</span></div>' +
      '</button>';
    // Mega Evolution buttons (once per battle, costs MEGA_COST energy)
    if (c.mon.mega && c.mon.mega.length && !state.you.megaUsed && !state.you.dynamaxUsed) {
      c.mon.mega.forEach(function (mf, mi) {
        var canMega = canAct && c.energy >= MEGA_COST;
        var suffix = c.mon.mega.length > 1
          ? (mf.name_zh.indexOf("X") >= 0 ? " X" : mf.name_zh.indexOf("Y") >= 0 ? " Y" : "")
          : "";
        html += '<button class="move mega' + (canMega ? "" : " disabled") + '" data-mega="' + mi + '"' +
          (canMega ? "" : " disabled") + '>' +
          '<div class="mn"><span class="type-chip mega">MEGA</span>超级进化' + suffix +
            '<span class="cost">能量 ' + MEGA_COST + '</span></div>' +
          '<div class="md"><span>' + mf.types.map(function (t) { return TYPE_ZH[t] || t; }).join("/") + '</span>' +
            '<span>攻 ' + mf.attack + ' · 速 ' + mf.speed + '</span></div>' +
        '</button>';
      });
    }
    // Dynamax button (once per battle, costs DYNAMAX_COST energy, mutually exclusive with Mega)
    if (!state.you.dynamaxUsed && !state.you.megaUsed) {
      var canDmax = canAct && c.energy >= DYNAMAX_COST;
      html += '<button class="move dynamax' + (canDmax ? "" : " disabled") + '" data-dynamax="1"' +
        (canDmax ? "" : " disabled") + '>' +
        '<div class="mn"><span class="type-chip dynamax">MAX</span>极巨化' +
          '<span class="cost">能量 ' + DYNAMAX_COST + '</span></div>' +
        '<div class="md"><span>体型暴涨 · 最大HP×' + DYNAMAX_HP_MULT + '</span>' +
          '<span>招式变为极巨招式</span></div>' +
      '</button>';
    } else if (c.dynamaxTurns > 0) {
      html += '<button class="move dynamax is-active" data-dynamax-disabled="1" disabled>' +
        '<div class="mn"><span class="type-chip dynamax">MAX</span>极巨化中' +
          '<span class="cost">剩余 ' + c.dynamaxTurns + ' 回合</span></div>' +
        '<div class="md"><span>极巨招式中</span><span>最大HP 已提升</span></div>' +
      '</button>';
    }
    // Terastallize button (once per battle, costs TERA_COST energy; not while Dynamaxed)
    if (!state.you.teraUsed && c.dynamaxTurns === 0) {
      var canTera = canAct && c.energy >= TERA_COST;
      var ttype = c.mon.types[0];
      html += '<button class="move tera' + (canTera ? "" : " disabled") + '" data-tera="1"' +
        (canTera ? "" : " disabled") + '>' +
        '<div class="mn"><span class="type-chip tera">TERA</span>太晶化' +
          '<span class="cost">能量 ' + TERA_COST + '</span></div>' +
        '<div class="md"><span>属性变为 ' + (TYPE_ZH[ttype] || ttype) + '</span>' +
          '<span>全招式获得本属性</span></div>' +
      '</button>';
    } else if (c.teraType) {
      html += '<button class="move tera is-active" data-tera-disabled="1" disabled>' +
        '<div class="mn"><span class="type-chip tera">TERA</span>太晶化中' +
          '<span class="cost">' + (TYPE_ZH[c.teraType] || c.teraType) + '</span></div>' +
        '<div class="md"><span>属性已变化</span><span>持续到对战结束</span></div>' +
      '</button>';
    }
    return html;
  }

  function logHTML() {
    var ICON = { you: "⚔", ai: "⚔", sys: "⚙", kill: "☠", eff: "✦" };
    var items = state.log.slice(-14).map(function (e) {
      var ic = ICON[e.cls] || "•";
      return '<div class="e ' + e.cls + '"><span class="lg-ic">' + ic + '</span><span class="lg-tx">' + e.msg + '</span></div>';
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
    // 天气横幅 + 场地变色（独立 try/catch，绝不干扰回合流程）
    try {
      var wb = document.getElementById("weather-bar");
      var w = (state.weather && state.weather.type && state.weather.type !== "none") ? state.weather : null;
      if (wb) {
        if (w && WEATHER[w.type]) {
          var W = WEATHER[w.type];
          wb.className = "weather-bar " + w.type;
          wb.innerHTML = '<span class="wb-ic">' + W.icon + '</span><span class="wb-nm">' + W.name +
            '</span><span class="wb-turn">剩余 ' + w.turns + ' 回合</span>';
        } else {
          wb.className = "weather-bar";
          wb.innerHTML = "";
        }
      }
      var fld = (typeof document.querySelector === "function") ? document.querySelector(".field") : null;
      if (fld) {
        fld.classList.remove("w-sunny", "w-rain", "w-sandstorm", "w-hail");
        if (w && w.type !== "none") fld.classList.add("w-" + w.type);
      }
    } catch (e) {}
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
    updateBattleTimer();

    var mv = document.getElementById("moves");
    if (mv) mv.innerHTML = movesHTML();
    var lg = document.getElementById("log");
    if (lg) { lg.innerHTML = logHTML(); try { lg.scrollTop = lg.scrollHeight; } catch (_) {} }

    var canAct = !busy && !state.over && state.turn === "you";
    var hint;
    if (canAct) {
      var specialNote = (!state.you.megaUsed && !state.you.dynamaxUsed && state.you.active.energy >= Math.min(MEGA_COST, DYNAMAX_COST))
        ? "当能量充足且本场尚未使用时，可发动一次「超级进化」或「极巨化」作为一次性强化（两者互斥）。"
        : "";
      var baseHint = '你有 4 个攻击技能 + 1 个「聚气·回复能量」支援技（0 消耗、恢复 2 能量、可随时使用）。每回合自动恢复 1 点能量，攒够 3 点可放 3 费大招，能量上限 ' + MAX_ENERGY + ' 点。';
      try {
        var c2 = state.you.active;
        var best = null;
        c2.moves.forEach(function (mv) {
          if (!best || mv.cost > best.cost || (mv.cost === best.cost && mv.power > best.power)) best = mv;
        });
        var enSub = "";
        if (best) {
          if (c2.energy >= best.cost) {
            enSub = " 当前能量已可释放全部招式，优先挑「克制」对手的出手吧！";
          } else {
            var needN = best.cost - c2.energy;
            enSub = " 最强招式【" + best.name + "】(⚡" + best.cost + ")还需 " + needN + " 点能量，约 " + needN + " 回合后就绪。";
          }
        }
        hint = baseHint + enSub + specialNote;
      } catch (eh) { /* 极端情况下降级为基础提示，绝不中断回合流程 */ if (typeof console !== "undefined" && console.warn) console.warn("[PK] energy-hint:", eh); }
    } else {
      hint = state.over ? "点击「重选宝可梦」再来一局。" : "请稍候，电脑正在行动…";
    }
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
    var meg = document.querySelectorAll("[data-mega]");
    for (var q = 0; q < meg.length; q++) {
      (function (el) {
        el.addEventListener("click", function () { onMega(parseInt(el.getAttribute("data-mega"), 10)); });
      })(meg[q]);
    }
    var dmx = document.querySelectorAll("[data-dynamax]");
    for (var dd = 0; dd < dmx.length; dd++) {
      (function (el) {
        el.addEventListener("click", function () { onDynamax(); });
      })(dmx[dd]);
    }
    var ter = document.querySelectorAll("[data-tera]");
    for (var tt = 0; tt < ter.length; tt++) {
      (function (el) {
        el.addEventListener("click", function () { onTera(); });
      })(ter[tt]);
    }
    bindPreviewEvents();
    bindTouchPreview();
  }

  /* ---------- hover preview (battle) ---------- */
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
        '<img src="' + spriteOf(mon) + '" alt="' + mon.name_zh + '" ' +
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
        (c.item && ITEM_POOL[c.item] ? '<div class="pv-item"><span class="pv-item-ic">' + ITEM_POOL[c.item].icon + '</span>' + ITEM_POOL[c.item].name + '<small>' + ITEM_POOL[c.item].desc + '</small></div>' : "") +
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
        evoHTML(c.mon) +
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

  /* ---------- 触摸预览（移动端）：长按查看详情，不干扰点按换人/选择 ---------- */
  var _touchPreviewInit = false;
  function _isTouch() {
    return ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0) ||
           (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }
  function _initTouchPreviewGlobal() {
    if (_touchPreviewInit) return;
    _touchPreviewInit = true;
    var suppress = false;
    // 长按松手后浏览器会合成一次 click，需拦截以免误触发换人/选择
    document.addEventListener('click', function (e) {
      if (suppress) {
        suppress = false;
        if (e.stopPropagation) e.stopPropagation();
        if (e.preventDefault) e.preventDefault();
      }
    }, true);
    // 点击空白处关闭预览
    document.addEventListener('touchstart', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (!t.closest('#pk-preview') && !t.closest('.fc') && !t.closest('.pk')) hidePkPreview();
    }, { passive: true });
    window.__pkSuppressClick = function () { suppress = true; };
  }
  function _addLongPress(el, showFn) {
    var timer = null;
    el.addEventListener('touchstart', function () {
      timer = setTimeout(function () {
        timer = null;
        if (window.__pkSuppressClick) window.__pkSuppressClick();
        showFn(el);
      }, 380);
    }, { passive: true });
    var cancel = function () { if (timer) { clearTimeout(timer); timer = null; } };
    el.addEventListener('touchmove', cancel);
    el.addEventListener('touchend', cancel);
    el.addEventListener('touchcancel', cancel);
  }
  function bindTouchPreview() {
    if (!_isTouch()) return;
    _initTouchPreviewGlobal();
    var cells = document.querySelectorAll('.fc:not(.deck)[data-pkid]');
    for (var i = 0; i < cells.length; i++) {
      (function (el) {
        _addLongPress(el, function () {
          showPkPreview(el, el.getAttribute('data-pkid'), el.getAttribute('data-side'));
        });
      })(cells[i]);
    }
    var pks = document.querySelectorAll('.pk[data-pk]');
    for (var j = 0; j < pks.length; j++) {
      (function (el) {
        _addLongPress(el, function () {
          showSetupPreview(el, parseInt(el.getAttribute('data-pk'), 10));
        });
      })(pks[j]);
    }
  }

/* ---------- hover preview (setup picker) ---------- */
function byId(id) {
  if (id == null) return null;
  for (var k = 0; k < LIST.length; k++) if (LIST[k].id === id) return LIST[k];
  return null;
}
// Evolution-chain strip: prev <- current -> next(s). Returns "" when the
// mon has no evolution data (e.g. a transformed mega form).
function evoHTML(mon) {
  if (mon.evolves_from === undefined && mon.evolves_to === undefined) return "";
  var prev = mon.evolves_from != null ? byId(mon.evolves_from) : null;
  var nexts = (mon.evolves_to || []).map(byId).filter(Boolean);
  if (!prev && nexts.length === 0) return "";
  var h = '<div class="pv-evo">';
  if (prev) {
    h += '<span class="evo-node">' +
      '<img src="' + spriteOf(prev) + '" alt="' + prev.name_zh + '" ' +
        'onerror="this.style.visibility=\'hidden\'">' +
      '<span class="evo-lab">进化前</span><b>' + prev.name_zh + '</b></span>';
  } else {
    h += '<span class="evo-tag">初始形态</span>';
  }
  h += '<span class="evo-arrow">→</span>' +
       '<span class="evo-node cur"><b>' + mon.name_zh + '</b><span class="evo-lab">当前</span></span>';
  if (nexts.length) {
    h += '<span class="evo-arrow">→</span>';
    nexts.forEach(function (nx) {
      h += '<span class="evo-node">' +
        '<img src="' + spriteOf(nx) + '" alt="' + nx.name_zh + '" ' +
          'onerror="this.style.visibility=\'hidden\'">' +
        '<span class="evo-lab">进化后</span><b>' + nx.name_zh + '</b></span>';
    });
  } else {
    h += '<span class="evo-tag">最终形态</span>';
  }
  h += '</div>';
  return h;
}
function setupPreviewHTML(mon) {
    var hc = TYPE_COLOR[mon.types[0]] || "#555";
    var typesHTML = mon.types.map(function (t) {
      return '<span class="type-chip" style="background:' + (TYPE_COLOR[t] || "#888") + '">' + (TYPE_ZH[t] || t) + '</span>';
    }).join("");
    return '' +
      '<div class="pv-art" style="background:linear-gradient(180deg,#f3f5fb,#dfe5f2)">' +
        '<img src="' + spriteOf(mon) + '" alt="' + mon.name_zh + '" ' +
          'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
        '<div class="fb" style="display:none;width:64px;height:64px;border-radius:50%;background:radial-gradient(circle at 50% 38%,#fff 0 30%,#e3534a 31% 100%);border:3px solid #fff;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;">' + mon.id + '</div>' +
      '</div>' +
      '<div class="pv-head" style="background:' + hc + '">' +
        '<span class="pv-nm">' + mon.name_zh + '</span>' +
        '<span class="pv-no">#' + mon.id + '</span>' +
      '</div>' +
      '<div class="pv-types">' + typesHTML + '</div>' +
      '<div class="pv-body">' +
        '<div class="pv-stats">' +
          '<div><span>HP</span><b>' + mon.hp + '</b></div>' +
          '<div><span>攻击</span><b>' + mon.attack + '</b></div>' +
          '<div><span>防御</span><b>' + mon.defense + '</b></div>' +
          '<div><span>特攻</span><b>' + mon.sp_attack + '</b></div>' +
          '<div><span>特防</span><b>' + mon.sp_defense + '</b></div>' +
          '<div><span>速度</span><b>' + mon.speed + '</b></div>' +
        '</div>' +
        evoHTML(mon) +
      '</div>';
  }

  function showSetupPreview(el, pkId) {
    var mon = null;
    for (var k = 0; k < LIST.length; k++) {
      if (LIST[k].id === pkId) { mon = LIST[k]; break; }
    }
    if (!mon) return;
    var pv = document.getElementById("pk-preview");
    if (!pv) return;
    pv.innerHTML = setupPreviewHTML(mon);
    pv.classList.add("show");
    positionSetupPreview(pv, el);
  }

  function positionSetupPreview(pv, el) {
    var rect = el.getBoundingClientRect();
    var pvW = 220;
    // Prefer showing to the right of the card
    var x = rect.right + 8;
    var y = rect.top;
    // Flip left if too close to right edge
    if (x + pvW > window.innerWidth - 8) x = rect.left - pvW - 8;
    // Fallback: center within viewport
    if (x < 8) x = Math.max(8, Math.min(rect.left, window.innerWidth - pvW - 8));
    // Clamp vertical
    var maxH = window.innerHeight - 16;
    if (y + maxH > window.innerHeight) y = window.innerHeight - maxH;
    if (y < 8) y = 8;
    pv.style.left = x + "px";
    pv.style.top = y + "px";
  }

  function bindPickerHoverEvents() {
    var cells = document.querySelectorAll(".pk[data-pk]");
    for (var i = 0; i < cells.length; i++) {
      (function (el) {
        el.addEventListener("mouseenter", function () {
          showSetupPreview(el, parseInt(el.getAttribute("data-pk"), 10));
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
    sfx(youWin ? "victory" : "defeat");
    var unlocked = [];
    try { unlocked = recordResult(youWin, state.difficulty) || []; } catch (e) {}
    box.innerHTML =
      '<div class="emoji">' + (youWin ? "🏆" : "💥") + '</div>' +
      '<h2>' + (youWin ? "你赢了！" : "你输了…") + '</h2>' +
      '<p>' + (youWin ? "你的宝可梦战队笑到了最后。" : "电脑的宝可梦战队更胜一筹，再接再厉！") + '</p>' +
      '<div class="over-btns">' +
        '<button class="btn" onclick="PK.toSetup()">重选宝可梦</button>' +
        '<button class="btn ghost" id="replay-btn">🎬 观看回放</button>' +
      '</div>';
    ov.classList.add("show");
    try {
      var rp = document.getElementById("replay-btn");
      if (rp) rp.addEventListener("click", showReplay);
    } catch (e) {}
    renderStatsPanel();
    if (unlocked && unlocked.length) {
      unlocked.forEach(function (label, i) {
        setTimeout(function () { toast("🏅 成就解锁：" + label); sfx("achv"); }, 700 + i * 1500);
      });
    }
  }

  /* ---------- 轻量提示 toast ---------- */
  function toast(msg) {
    try {
      var t = document.getElementById("toast");
      if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
      var span = document.createElement("div");
      span.className = "toast-item";
      span.textContent = msg;
      t.appendChild(span);
      setTimeout(function () { try { span.classList.add("show"); } catch (_) {} }, 20);
      setTimeout(function () { try { span.classList.remove("show"); } catch (_) {} }, 2600);
      setTimeout(function () { try { if (span.parentNode) span.parentNode.removeChild(span); } catch (_) {} }, 3100);
    } catch (e) {}
  }

  /* ---------- 战绩面板 ---------- */
  function renderStatsPanel() {
    var el = document.getElementById("stats-panel");
    if (!el) return;
    var s = loadStats();
    var winRate = s.total ? Math.round(s.wins / s.total * 100) : 0;
    var achList = [
      ["first_win", "首胜"], ["streak5", "五连胜"], ["streak10", "十连胜"],
      ["mega_win", "超级进化胜利"], ["dyna_win", "极巨化胜利"], ["weather", "天气大师"],
      ["flawless", "全员凯旋"], ["hundred", "百战老兵"]
    ];
    var achGot = achList.filter(function (a) { return s.ach[a[0]]; }).map(function (a) { return a[1]; });
    el.className = "stats-panel" + (statsCollapsed ? " collapsed" : "");
    el.innerHTML =
      '<div class="sp-title" onclick="window.PK._toggleStats()">📊 战绩统计<span class="sp-diff">简 ' + s.byDiff.easy + ' · 普 ' + s.byDiff.normal + ' · 困 ' + s.byDiff.hard + '</span><span class="sp-toggle">▼</span></div>' +
      '<div class="sp-body">' +
        '<div class="sp-grid">' +
          '<div class="sp-cell"><b>' + s.wins + '</b><span>胜</span></div>' +
          '<div class="sp-cell"><b>' + s.losses + '</b><span>负</span></div>' +
          '<div class="sp-cell"><b>' + winRate + '%</b><span>胜率</span></div>' +
          '<div class="sp-cell"><b>' + s.streak + '</b><span>当前连胜</span></div>' +
          '<div class="sp-cell"><b>' + s.best + '</b><span>最佳连胜</span></div>' +
          '<div class="sp-cell"><b>' + s.total + '</b><span>总场次</span></div>' +
        '</div>' +
        (achGot.length
          ? '<div class="sp-ach">🏅 ' + achGot.join("、") + '</div>'
          : '<div class="sp-ach muted">尚未解锁成就，去赢一场吧！</div>') +
      '</div>';
  }

  /* ---------- 战斗回放 ---------- */
  var replayIdx = 0, replayTimer = null;
  function showReplay() {
    var modal = document.getElementById("replay-modal");
    if (!modal || !state || !state.replay || !state.replay.length) { toast("暂无回放数据"); return; }
    modal.classList.add("show");
    replayIdx = 0;
    renderReplayFrame();
  }
  function closeReplay() {
    var modal = document.getElementById("replay-modal");
    if (modal) modal.classList.remove("show");
    if (replayTimer) { clearInterval(replayTimer); replayTimer = null; }
  }
  function replayStep(delta) {
    if (!state || !state.replay) return;
    replayIdx += delta;
    if (replayIdx < 0) replayIdx = 0;
    if (replayIdx >= state.replay.length) replayIdx = state.replay.length - 1;
    renderReplayFrame();
  }
  function replayTogglePlay() {
    var btn = document.getElementById("rp-play");
    if (replayTimer) {
      clearInterval(replayTimer); replayTimer = null;
      if (btn) btn.textContent = "▶ 自动播放";
      return;
    }
    if (btn) btn.textContent = "⏸ 暂停";
    replayTimer = setInterval(function () {
      if (replayIdx >= (state.replay.length - 1)) {
        clearInterval(replayTimer); replayTimer = null;
        if (btn) btn.textContent = "▶ 自动播放";
        return;
      }
      replayStep(1);
    }, 900);
  }
  function renderReplayFrame() {
    var frames = state.replay;
    if (!frames || !frames.length) return;
    if (replayIdx < 0) replayIdx = 0;
    if (replayIdx >= frames.length) replayIdx = frames.length - 1;
    var f = frames[replayIdx];
    var bars = document.getElementById("replay-bars");
    var logEl = document.getElementById("replay-log");
    if (bars) {
      var yR = f.youMax ? Math.max(0, f.youHp / f.youMax) : 0;
      var aR = f.aiMax ? Math.max(0, f.aiHp / f.aiMax) : 0;
      var wTxt = (f.weather !== "none" && WEATHER[f.weather])
        ? '<div class="rb-w">' + WEATHER[f.weather].icon + ' ' + WEATHER[f.weather].name + '</div>' : '';
      bars.innerHTML =
        '<div class="rb you"><span class="rb-nm">' + (f.youName || "你") + '</span>' +
          '<div class="rb-bar"><i style="width:' + (yR * 100) + '%"></i></div>' +
          '<span class="rb-hp">' + f.youHp + '/' + f.youMax + '</span></div>' +
        '<div class="rb ai"><span class="rb-nm">' + (f.aiName || "电脑") + '</span>' +
          '<div class="rb-bar"><i style="width:' + (aR * 100) + '%"></i></div>' +
          '<span class="rb-hp">' + f.aiHp + '/' + f.aiMax + '</span></div>' + wTxt;
    }
    if (logEl) {
      logEl.innerHTML = frames.map(function (fr, i) {
        return '<div class="rf' + (i === replayIdx ? " cur" : "") + '">' +
          '<span class="rf-i">' + (i + 1) + '</span><span class="rf-t">' + (fr.text || "") + '</span></div>';
      }).join("");
      try { logEl.scrollTop = logEl.scrollHeight; } catch (_) {}
    }
    var idxEl = document.getElementById("replay-idx");
    if (idxEl) idxEl.textContent = (replayIdx + 1) + " / " + frames.length;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawBar(ctx, x, y, w, h, r, color) {
    ctx.fillStyle = "#e3e8f2"; roundRect(ctx, x, y, w, h, 6); ctx.fill();
    if (r > 0) { ctx.fillStyle = color; roundRect(ctx, x, y, w * r, h, 6); ctx.fill(); }
  }
  function clipText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    var t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
  }
  function exportReplayImage() {
    if (!state || !state.replay || !state.replay.length) { toast("暂无回放数据"); return; }
    var W = 600, pad = 24, lineH = 22, headH = 96, barH = 14, youW = 150, aiW = 150;
    var frames = state.replay, last = frames[frames.length - 1];
    var cap = Math.min(frames.length, 18), logLines = [];
    for (var i = frames.length - cap; i < frames.length; i++) logLines.push((i + 1) + ". " + (frames[i].text || ""));
    var logH = logLines.length * lineH + 16;
    var H = headH + 40 + barH + 16 + logH + 30;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d");
    ctx.fillStyle = "#f3f5fb"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff"; roundRect(ctx, 8, 8, W - 16, H - 16, 16); ctx.fill();
    ctx.fillStyle = "#1f2540"; ctx.font = "700 22px sans-serif";
    ctx.fillText("宝可梦卡牌对战 · 战报", pad, 42);
    ctx.fillStyle = "#98a3b8"; ctx.font = "13px sans-serif";
    ctx.fillText("难度：" + (state.difficulty || "normal") + "   结果：" + (state.winner === "you" ? "胜利" : (state.winner === "ai" ? "失败" : "进行中")), pad, 64);
    var yName = last.youName || "你", aName = last.aiName || "电脑";
    ctx.font = "700 16px sans-serif";
    ctx.fillStyle = "#2f9e4f"; ctx.fillText(yName, pad, headH - 4);
    ctx.fillStyle = "#e3534a"; ctx.fillText(aName, W - pad - ctx.measureText(aName).width, headH - 4);
    ctx.fillStyle = "#1f2540"; ctx.textAlign = "center";
    ctx.fillText(state.winner === "you" ? "你 胜" : (state.winner === "ai" ? "电脑 胜" : "对战中"), W / 2, headH - 4);
    ctx.textAlign = "left";
    var yR = last.youMax ? Math.max(0, last.youHp / last.youMax) : 0;
    var aR = last.aiMax ? Math.max(0, last.aiHp / last.aiMax) : 0;
    drawBar(ctx, pad, headH + 8, youW, barH, yR, "#2f9e4f");
    drawBar(ctx, W - pad - aiW, headH + 8, aiW, barH, aR, "#e3534a");
    ctx.fillStyle = "#555"; ctx.font = "12px sans-serif";
    ctx.fillText((last.youHp || 0) + "/" + (last.youMax || 0), pad, headH + 8 + barH + 14);
    ctx.textAlign = "right"; ctx.fillText((last.aiHp || 0) + "/" + (last.aiMax || 0), W - pad, headH + 8 + barH + 14); ctx.textAlign = "left";
    var lx = pad, ly = headH + 8 + barH + 30;
    ctx.fillStyle = "#1f2540"; ctx.font = "13px sans-serif";
    logLines.forEach(function (t, i) { ctx.fillText(clipText(ctx, t, W - pad * 2), lx, ly + i * lineH); });
    ctx.fillStyle = "#98a3b8"; ctx.font = "11px sans-serif";
    ctx.fillText("生成于 " + new Date().toLocaleString(), pad, H - 12);
    var url; try { url = cv.toDataURL("image/png"); } catch (e) { toast("导出失败"); return; }
    var a0 = document.createElement("a");
    a0.href = url; a0.download = "battle-report.png";
    if (a0.click) a0.click();
    toast("已导出战报图");
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
    renderStatsPanel();
    try {
      var dbtns = document.querySelectorAll("[data-diff]");
      for (var di = 0; di < dbtns.length; di++) {
        dbtns[di].classList.toggle("active", dbtns[di].getAttribute("data-diff") === setup.difficulty);
      }
    } catch (e) {}
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
    renderPickOrder();
  }

  /* ---------- 已选序列：拖拽 / 箭头调整出战顺序 ---------- */
  function renderPickOrder() {
    var box = document.getElementById("pick-order");
    if (!box) return;
    if (setup.mode !== "custom" || setup.selected.length === 0) { box.innerHTML = ""; box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    var html = '<div class="po-title">出战顺序（首位出战领队，可拖拽或点箭头调整）</div>';
    setup.selected.forEach(function (m, i) {
      var hc = TYPE_COLOR[m.types[0]] || "#555";
      html += '<div class="po' + (i === 0 ? " lead" : "") + '" draggable="true" data-idx="' + i + '">' +
        '<span class="po-no">' + (i + 1) + '</span>' +
        '<span class="po-sp" style="background:' + hc + '22"><img src="' + spriteOf(m) + '" alt=""></span>' +
        '<span class="po-nm">' + m.name_zh + '</span>' +
        '<span class="po-mv">' +
          '<button class="po-btn" data-dir="-1"' + (i === 0 ? " disabled" : "") + '>◀</button>' +
          '<button class="po-btn" data-dir="1"' + (i === setup.selected.length - 1 ? " disabled" : "") + '>▶</button>' +
        '</span></div>';
    });
    box.innerHTML = html;
    var rows = box.querySelectorAll(".po");
    for (var r = 0; r < rows.length; r++) {
      (function (el) {
        var idx = parseInt(el.getAttribute("data-idx"), 10);
        var b1 = el.querySelector('[data-dir="-1"]'), b2 = el.querySelector('[data-dir="1"]');
        if (b1) b1.addEventListener("click", function (e) { e.stopPropagation(); movePick(idx, -1); });
        if (b2) b2.addEventListener("click", function (e) { e.stopPropagation(); movePick(idx, 1); });
        el.addEventListener("dragstart", function (e) {
          if (e.dataTransfer) e.dataTransfer.setData("text/plain", String(idx));
          el.classList.add("dragging");
        });
        el.addEventListener("dragend", function () { el.classList.remove("dragging"); });
        el.addEventListener("dragover", function (e) { e.preventDefault(); el.classList.add("drag-over"); });
        el.addEventListener("dragleave", function () { el.classList.remove("drag-over"); });
        el.addEventListener("drop", function (e) {
          e.preventDefault(); el.classList.remove("drag-over");
          var from = parseInt((e.dataTransfer && e.dataTransfer.getData("text/plain")) || "-1", 10);
          if (!isNaN(from) && from !== idx) reorderPick(from, idx);
        });
      })(rows[r]);
    }
  }
  function movePick(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= setup.selected.length) return;
    var arr = setup.selected, t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    renderPickOrder();
  }
  function reorderPick(from, to) {
    var arr = setup.selected, t = arr.splice(from, 1)[0];
    arr.splice(to, 0, t);
    renderPickOrder();
  }

  function renderGenFilters() {
    var wrap = document.getElementById("pk-gen");
    if (!wrap) return;
    var gens = [
      { key: "all", label: "全部" },
      { key: "gen1", label: "第一部 (初代 #1-151)" },
      { key: "gen2", label: "第二部 (城都 #152-251)" },
      { key: "gen3", label: "第三部 (丰缘 #252-386)" },
      { key: "gen4", label: "第四部 (神奥 #387-493)" },
      { key: "gen5", label: "第五部 (合众 #494-649)" },
      { key: "gen6", label: "第六部 (卡洛斯 #650-721)" },
      { key: "gen7", label: "第七部 (阿罗拉 #722-809)" },
      { key: "gen8", label: "第八部 (伽勒尔 #810-898)" },
      { key: "gen9", label: "第九部 (帕底亚 #899-1025)" }
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
    var items = [];
    LIST.forEach(function (m) {
      var matchType = setup.typeFilter === "all" || m.types.indexOf(setup.typeFilter) >= 0;
      var matchQ = !q || m.name_zh.indexOf(q) >= 0 || m.name.indexOf(q) >= 0 ||
        String(m.id) === q || ("#" + m.id) === q;
      var matchGen = setup.genFilter === "all" ||
        (setup.genFilter === "gen1" && m.id <= 151) ||
        (setup.genFilter === "gen2" && m.id >= 152 && m.id <= 251) ||
        (setup.genFilter === "gen3" && m.id >= 252 && m.id <= 386) ||
        (setup.genFilter === "gen4" && m.id >= 387 && m.id <= 493) ||
        (setup.genFilter === "gen5" && m.id >= 494 && m.id <= 649) ||
        (setup.genFilter === "gen6" && m.id >= 650 && m.id <= 721) ||
        (setup.genFilter === "gen7" && m.id >= 722 && m.id <= 809) ||
        (setup.genFilter === "gen8" && m.id >= 810 && m.id <= 898) ||
        (setup.genFilter === "gen9" && m.id >= 899);
      if (!matchType || !matchQ || !matchGen) return;
      items.push(m);
    });
    if (grid.__vscroll !== true) {
      grid.__vscroll = true;
      grid.addEventListener("scroll", renderPickerWindow, { passive: true });
      if (window.addEventListener) window.addEventListener("resize", renderPickerWindow);
    }
    grid._items = items;
    var cols = computePickerCols(grid);
    var rowH = 122;
    grid._cols = cols; grid._rowH = rowH;
    var totalH = Math.ceil(items.length / cols) * rowH;
    grid.innerHTML = '<div class="pk-spacer" style="height:' + totalH + 'px"></div>';
    renderPickerWindow();
  }
  function computePickerCols(grid) {
    var w = grid.clientWidth || 600;
    var cols = Math.floor((w + 10) / 128);
    if (cols < 2) cols = 2;
    if (cols > 8) cols = 8;
    return cols;
  }
  // 虚拟滚动：仅渲染可视区 + 缓冲，避免一次性 1025 张卡顿
  function renderPickerWindow() {
    var grid = document.getElementById("pk-grid");
    if (!grid || !grid._items) return;
    var items = grid._items, cols = grid._cols, rowH = grid._rowH;
    var scrollTop = grid.scrollTop || 0;
    var viewH = grid.clientHeight || 440;
    var firstRow = Math.max(0, Math.floor(scrollTop / rowH) - 2);
    var lastRow = Math.ceil((scrollTop + viewH) / rowH) + 2;
    var start = firstRow * cols, end = Math.min(items.length, lastRow * cols);
    var old = grid.querySelectorAll(".pk-win");
    for (var o = 0; o < old.length; o++) old[o].remove();
    if (!items.length) return;
    var colW = 100 / cols;
    var html = "";
    for (var i = start; i < end; i++) {
      var m = items[i];
      var row = Math.floor(i / cols), col = i % cols;
      var top = row * rowH + 4;
      var left = col * colW;
      var sel = setup.selected.some(function (s) { return s.id === m.id; });
      var hc = TYPE_COLOR[m.types[0]] || "#555";
      html += '<div class="pk pk-win' + (sel ? " sel" : "") + '" data-pk="' + m.id + '" ' +
        'style="position:absolute;top:' + top + 'px;left:' + left + '%;width:calc(' + colW + '% - 10px);height:' + (rowH - 10) + 'px">' +
        (sel ? '<div class="pk-check">✓</div>' : '') +
        '<div class="pk-art" style="background:' + hc + '22">' +
          '<img src="' + spriteOf(m) + '" alt="' + m.name_zh + '" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
          '<div class="pk-fb">' + m.id + '</div>' +
        '</div>' +
        '<div class="pk-name">' + m.name_zh + '</div>' +
        '<div class="pk-types">' + typeChips(m.types) + '</div>' +
      '</div>';
    }
    grid.insertAdjacentHTML("beforeend", html);
    var cells = grid.querySelectorAll("[data-pk]");
    for (var c = 0; c < cells.length; c++) {
      (function (el) {
        el.addEventListener("click", function () {
          togglePick(parseInt(el.getAttribute("data-pk"), 10));
        });
      })(cells[c]);
    }
    bindPickerHoverEvents();
    bindTouchPreview();
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
    renderPickerWindow();
  }

  function updatePickerCell(id) {
    var grid = document.getElementById("pk-grid");
    if (!grid) return;
    var el = grid.querySelector('[data-pk="' + id + '"]');
    if (!el) return; // 当前过滤条件下未显示
    var sel = setup.selected.some(function (m) { return m.id === id; });
    el.classList.toggle("sel", sel);
    var check = el.querySelector(".pk-check");
    if (sel) {
      if (!check) {
        check = document.createElement("div");
        check.className = "pk-check";
        check.textContent = "✓";
        el.insertBefore(check, el.firstChild);
      }
    } else if (check) {
      check.remove();
    }
  }

  function confirmStart() {
    try {
      if (window.BattleAudio) {
        window.BattleAudio.init();
        if (!window.BattleAudio.isMuted()) window.BattleAudio.startBGM();
      }
    } catch (e) {}
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
    // 难度选择
    var diffBtns = document.querySelectorAll("[data-diff]");
    for (var di = 0; di < diffBtns.length; di++) {
      (function (el) {
        el.addEventListener("click", function () {
          setup.difficulty = el.getAttribute("data-diff");
          var all = document.querySelectorAll("[data-diff]");
          for (var k = 0; k < all.length; k++) all[k].classList.remove("active");
          el.classList.add("active");
        });
      })(diffBtns[di]);
    }
    // 音效开关（持久化）
    var audioBtn = document.getElementById("audio-btn");
    if (audioBtn) {
      audioBtn.textContent = settings.muted ? "🔇 静音" : "🔊 音效";
      audioBtn.addEventListener("click", function () {
        settings.muted = window.BattleAudio ? !window.BattleAudio.isMuted() : true;
        if (window.BattleAudio && window.BattleAudio.setMuted) {
          try { window.BattleAudio.setMuted(settings.muted); } catch (e) {}
        }
        audioBtn.textContent = settings.muted ? "🔇 静音" : "🔊 音效";
        if (!settings.muted && window.BattleAudio) window.BattleAudio.startBGM();
        saveSettings();
      });
    }
    // 设置按钮
    var setBtn = document.getElementById("settings-btn");
    if (setBtn) setBtn.addEventListener("click", openSettings);
    // 闪光模式开关
    var mainShiny = document.getElementById("shiny-toggle");
    var setupShiny = document.getElementById("setup-shiny-toggle");
    function bindShinyBtn(btn) {
      if (!btn) return;
      btn.addEventListener("click", function () { setShinyMode(!shinyMode); });
    }
    bindShinyBtn(mainShiny);
    bindShinyBtn(setupShiny);
    // 回放控制
    var rc = document.getElementById("replay-close");
    if (rc) rc.addEventListener("click", closeReplay);
    var rprev = document.getElementById("rp-prev");
    if (rprev) rprev.addEventListener("click", function () { replayStep(-1); });
    var rnext = document.getElementById("rp-next");
    if (rnext) rnext.addEventListener("click", function () { replayStep(1); });
    var rplay = document.getElementById("rp-play");
    if (rplay) rplay.addEventListener("click", replayTogglePlay);
    var rexport = document.getElementById("rp-export");
    if (rexport) rexport.addEventListener("click", exportReplayImage);
    // 快进按钮（与空格键同步）
    var fastBtn = document.getElementById("fast-btn");
    if (fastBtn) fastBtn.addEventListener("click", function () {
      FAST = !FAST;
      fastBtn.textContent = FAST ? "⏩ 快进中" : "⏩ 快进";
      toast(FAST ? "⏩ 快进模式：开（剩余动画将加速）" : "⏩ 快进模式：关");
    });
  }

  /* ---------- 新手引导 ---------- */
  var ONBOARD_STEPS = [
    { t: "① 组建战队", h: "进入先选 12 只宝可梦：点「随机组队」一键成军，或「自选」按世代/属性筛选。难度越高，电脑 AI 越会读克制、低血换人、用进化与极巨。" },
    { t: "② 能量与费用", h: "每回合自动 +1 能量（上限 5）。每只 4 招费用固定为 1/1/2/3：费越高威力越强，3 费大招用完有 1 回合冷却。金色描边的招式＝克制当前对手，优先打它！" },
    { t: "③ 出招与操作", h: "你的回合：按 1–4 出对应招式，5 聚气回能解状态，Q/W/E/R 换上后备。也能全程鼠标点击。能量够时可用超级进化 / 极巨化放大招。" },
    { t: "④ 状态·天气·道具", h: "中毒/灼烧/麻痹/睡眠/冰冻会持续影响战局；部分招式引发天气改变属性威力；宝可梦可能携带道具（回血/防秒/增伤）。前排倒下就从后备换人，全队倒下即败。" }
  ];
  var onboardStep = 0;
  function renderOnboard() {
    var box = document.getElementById("onboard-box");
    if (!box) return;
    var s = ONBOARD_STEPS[onboardStep];
    var tEl = box.querySelector(".ob-title"); if (tEl) tEl.textContent = s.t;
    var bEl = box.querySelector(".ob-body"); if (bEl) bEl.textContent = s.h;
    var dots = box.querySelector(".ob-dots");
    if (dots) dots.innerHTML = ONBOARD_STEPS.map(function (_, i) {
      return '<span class="ob-dot' + (i === onboardStep ? " on" : "") + '"></span>';
    }).join("");
    var prev = box.querySelector(".ob-prev"); if (prev) prev.disabled = onboardStep === 0;
    var next = box.querySelector(".ob-next");
    if (next) next.textContent = (onboardStep === ONBOARD_STEPS.length - 1) ? "开始游戏 ▶" : "下一步 ▶";
  }
  function showOnboard() {
    var ob = document.getElementById("onboard");
    if (!ob) return;
    onboardStep = 0;
    renderOnboard();
    ob.classList.add("show");
  }
  function closeOnboard() {
    var ob = document.getElementById("onboard");
    if (ob) ob.classList.remove("show");
    markOnboarded();
  }
  function wireOnboard() {
    var ob = document.getElementById("onboard");
    if (!ob) return;
    var box = document.getElementById("onboard-box");
    if (!box) return;
    var prev = box.querySelector(".ob-prev");
    if (prev) prev.addEventListener("click", function () {
      if (onboardStep > 0) { onboardStep--; renderOnboard(); }
    });
    var next = box.querySelector(".ob-next");
    if (next) next.addEventListener("click", function () {
      if (onboardStep < ONBOARD_STEPS.length - 1) { onboardStep++; renderOnboard(); }
      else closeOnboard();
    });
    var skip = ob.querySelector(".ob-skip");
    if (skip) skip.addEventListener("click", closeOnboard);
  }

  /* ---------- 设置面板 ---------- */
  function openSettings() {
    var m = document.getElementById("settings-modal");
    if (!m) return;
    var mb = document.getElementById("set-mute");
    var rb = document.getElementById("set-rm");
    if (mb) mb.checked = settings.muted;
    if (rb) rb.checked = settings.reduceMotion;
    m.classList.add("show");
  }
  function closeSettings() {
    var m = document.getElementById("settings-modal");
    if (m) m.classList.remove("show");
  }
  function wireSettings() {
    var m = document.getElementById("settings-modal");
    if (!m) return;
    var mb = document.getElementById("set-mute");
    var rb = document.getElementById("set-rm");
    if (mb) mb.addEventListener("change", function () {
      settings.muted = mb.checked;
      if (window.BattleAudio && window.BattleAudio.setMuted) {
        try { window.BattleAudio.setMuted(settings.muted); } catch (e) {}
      }
      var ab = document.getElementById("audio-btn");
      if (ab) ab.textContent = settings.muted ? "🔇 静音" : "🔊 音效";
      saveSettings();
    });
    if (rb) rb.addEventListener("change", function () {
      settings.reduceMotion = rb.checked;
      if (typeof document !== "undefined" && document.body) {
        document.body.classList.toggle("reduce-motion", settings.reduceMotion);
      }
      saveSettings();
    });
    var help = document.getElementById("set-onboard");
    if (help) help.addEventListener("click", function () { closeSettings(); showOnboard(); });
    var sc = document.getElementById("settings-close");
    if (sc) sc.addEventListener("click", closeSettings);
  }

  /* ---------- 键盘操作 ---------- */
  function isModalOpen() {
    return !!document.querySelector("#onboard.show, #setup.show, #replay-modal.show, #overlay.show, #typechart.show");
  }
  function kbSwitch(i) {
    if (state && state.you && state.you.bench && state.you.bench[i]) onSwitch(i);
  }
  function onKey(e) {
    if (!e || !e.key) return;
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    var k = e.key;
    if (isModalOpen()) {
      if (k === "Escape") {
        var ob = document.getElementById("onboard");
        if (ob && ob.classList.contains("show")) { closeOnboard(); e.preventDefault(); return; }
        var rp = document.getElementById("replay-modal");
        if (rp && rp.classList.contains("show")) { closeReplay(); e.preventDefault(); return; }
        var tc = document.getElementById("typechart");
        if (tc && tc.classList.contains("show")) { closeTypeChart(); e.preventDefault(); return; }
      }
      return;
    }
    if (k === " ") {
      FAST = !FAST;
      toast(FAST ? "⏩ 快进模式：开（剩余动画将加速）" : "⏩ 快进模式：关");
      if (e.preventDefault) e.preventDefault();
      return;
    }
    if (busy || state.over || state.turn !== "you") return;
    var handled = true;
    if (k >= "1" && k <= "4") onMove(parseInt(k, 10) - 1);
    else if (k === "5") onRecover();
    else if (k === "q" || k === "Q") kbSwitch(0);
    else if (k === "w" || k === "W") kbSwitch(1);
    else if (k === "e" || k === "E") kbSwitch(2);
    else if (k === "r" || k === "R") kbSwitch(3);
    else if (k === "m" || k === "M") onMega(0);
    else if (k === "g" || k === "G") onDynamax();
    else if (k === "t" || k === "T") onTera();
    else handled = false;
    if (handled) e.preventDefault();
  }

  /* ---------- 招式详情 tooltip + 类型克制速查表 ---------- */
  var mvTip = null;
  function ensureMvTip() {
    if (!mvTip) {
      mvTip = document.createElement("div");
      mvTip.id = "mv-tip"; mvTip.className = "mv-tip";
      if (typeof document !== "undefined" && document.body) document.body.appendChild(mvTip);
    }
    return mvTip;
  }
  function tcTypes() { return Object.keys(EFFECT); }
  function typeEffSummary(type) {
    var sup = [], imm = [], res = [];
    tcTypes().forEach(function (t) {
      var m = EFFECT[type] && EFFECT[type][t];
      if (m === 2) sup.push(TYPE_ZH[t] || t);
      else if (m === 0) imm.push(TYPE_ZH[t] || t);
      else if (m === 0.5) res.push(TYPE_ZH[t] || t);
    });
    return { sup: sup, imm: imm, res: res };
  }
  function statLine(map) {
    if (!map) return "";
    var names = { atk: "攻", def: "防", spa: "特攻", spd: "特防", spe: "速" };
    return Object.keys(map).map(function (k) { return (names[k] || k) + "+" + map[k]; }).join(" ");
  }
  function moveTipEffect(mv) {
    if (mv.kind === "heal") return "回复自身体力";
    if (mv.kind === "status") return (STATUS_ZH[mv.status] || mv.status || "异常") + (mv.statusChance ? "（" + Math.round(mv.statusChance * 100) + "% 触发）" : "");
    if (mv.kind === "control") {
      var c = mv.slug === "leech-seed" ? "寄生种子" : mv.slug === "substitute" ? "替身" : mv.slug === "reflect" ? "反射壁" : mv.slug === "light-screen" ? "光墙" : "控场";
      return c;
    }
    if (mv.kind === "boost") return "强化自身：" + statLine(mv.buff);
    if (mv.kind === "debuff") return "削弱对手：" + statLine(mv.debuff);
    if (mv.kind === "damage") {
      if (mv.status) return "可能使对手" + (STATUS_ZH[mv.status] || mv.status) + (mv.statusChance ? "（" + Math.round(mv.statusChance * 100) + "%）" : "");
      if (mv.weather) return "引发" + (WEATHER[mv.weather] ? WEATHER[mv.weather].name : mv.weather);
    }
    return "";
  }
  function moveTipHTML(mv) {
    var sub = [];
    if (mv.kind === "damage") { sub.push("威力 " + (mv.power || 0)); sub.push(mv.cat === "phys" ? "物理" : "特殊"); }
    else sub.push("变化招");
    sub.push("命中 " + (mv.acc == null ? 100 : mv.acc) + "%");
    sub.push("费用 " + (mv.cost || 0));
    var html = '<div class="mt-head"><span class="type-chip" style="background:' + (TYPE_COLOR[mv.type] || "#888") + '">' + (TYPE_ZH[mv.type] || mv.type) + '</span>' + (mv.name || "") + '</div>';
    html += '<div class="mt-sub">' + sub.join(" · ") + '</div>';
    var eff = moveTipEffect(mv);
    if (eff) html += '<div class="mt-eff">' + eff + '</div>';
    var s = typeEffSummary(mv.type);
    var parts = [];
    if (s.sup.length) parts.push('<span class="mt-sup">克制 ' + s.sup.join("/") + '</span>');
    if (s.imm.length) parts.push('<span class="mt-imm">无效 ' + s.imm.join("/") + '</span>');
    if (s.res.length) parts.push('<span class="mt-res">被抵抗 ' + s.res.join("/") + '</span>');
    if (parts.length) html += '<div class="mt-eff">' + parts.join(" ") + '</div>';
    return html;
  }
  function showMvTip(target) {
    var html = null;
    if (target.getAttribute("data-move") != null) {
      var i = parseInt(target.getAttribute("data-move"), 10);
      var c = state.you.active; if (!c || !c.moves[i]) return;
      html = moveTipHTML(c.moves[i]);
    } else if (target.getAttribute("data-recover") != null) {
      html = '<div class="mt-head">聚气 · 回复能量</div><div class="mt-sub">支援 · 0 能量</div><div class="mt-eff">恢复 2 点能量，并解除自身异常状态</div>';
    } else if (target.getAttribute("data-mega") != null) {
      var mi = parseInt(target.getAttribute("data-mega"), 10);
      var m = state.you.active.mon.mega; if (!m || !m[mi]) return;
      html = '<div class="mt-head">超级进化 → ' + m[mi].name_zh + '</div><div class="mt-sub">费用 ' + MEGA_COST + ' · 整队每场一次</div><div class="mt-eff">属性 ' + m[mi].types.map(function (t) { return TYPE_ZH[t] || t; }).join("/") + ' · 攻 ' + m[mi].attack + ' · 速 ' + m[mi].speed + '</div>';
    } else if (target.getAttribute("data-dynamax") != null) {
      html = '<div class="mt-head">极巨化</div><div class="mt-sub">费用 ' + DYNAMAX_COST + ' · 持续 ' + DYNAMAX_TURNS + ' 回合</div><div class="mt-eff">体型暴涨，最大HP×' + DYNAMAX_HP_MULT + '，招式变为极巨招式</div>';
    } else if (target.getAttribute("data-tera") != null) {
      var c = state.you.active; if (!c) return;
      var tt = c.mon.types[0];
      html = '<div class="mt-head">太晶化</div><div class="mt-sub">费用 ' + TERA_COST + ' · 整队每场一次 · 持续到对战结束</div><div class="mt-eff">属性变为【' + (TYPE_ZH[tt] || tt) + '】，攻防均按此属性计算，所有招式获得该属性 STAB</div>';
    } else return;
    var tip = ensureMvTip();
    tip.innerHTML = html;
    tip.classList.add("show");
    var r = target.getBoundingClientRect();
    var tr = tip.getBoundingClientRect();
    var left = r.left + r.width / 2 - tr.width / 2;
    left = Math.max(8, Math.min(left, (window.innerWidth || 9999) - tr.width - 8));
    var top = r.top - tr.height - 10;
    if (top < 8) { top = r.bottom + 10; tip.classList.add("below"); } else tip.classList.remove("below");
    tip.style.left = left + "px"; tip.style.top = top + "px";
  }
  function hideMvTip() { if (mvTip) mvTip.classList.remove("show"); }

  function openTypeChart() {
    var m = document.getElementById("typechart"); if (!m) return;
    var grid = document.getElementById("tc-grid");
    if (grid && grid.getAttribute("data-built") !== "1") { buildTcGrid(grid); grid.setAttribute("data-built", "1"); }
    var sum = document.getElementById("tc-sum");
    if (sum) sum.textContent = "点击左侧属性，查看它的克制关系";
    m.classList.add("show");
  }
  function closeTypeChart() {
    var m = document.getElementById("typechart");
    if (m) m.classList.remove("show");
  }
  function buildTcGrid(grid) {
    var T = tcTypes();
    var html = '<div class="tc-h"></div>';
    T.forEach(function (t) { html += '<div class="tc-h">' + (TYPE_ZH[t] || t) + '</div>'; });
    T.forEach(function (at) {
      html += '<button class="tc-rh" data-at="' + at + '">' + (TYPE_ZH[at] || at) + '</button>';
      T.forEach(function (dt) {
        var m = EFFECT[at] && EFFECT[at][dt];
        var cls = m === 2 ? "te-2" : m === 0 ? "te-0" : m === 0.5 ? "te-05" : "te-1";
        var txt = m === 2 ? "2" : m === 0 ? "0" : m === 0.5 ? "½" : "1";
        html += '<div class="tc-cell ' + cls + '">' + txt + '</div>';
      });
    });
    grid.innerHTML = html;
    var rhs = grid.querySelectorAll(".tc-rh");
    for (var i = 0; i < rhs.length; i++) {
      (function (rh) {
        rh.addEventListener("click", function () { selectTc(rh.getAttribute("data-at")); });
      })(rhs[i]);
    }
  }
  function selectTc(at) {
    var grid = document.getElementById("tc-grid");
    if (grid) {
      var rhs = grid.querySelectorAll(".tc-rh");
      for (var i = 0; i < rhs.length; i++) rhs[i].classList.toggle("on", rhs[i].getAttribute("data-at") === at);
    }
    var s = typeEffSummary(at);
    var parts = [(TYPE_ZH[at] || at) + " 属性："];
    if (s.sup.length) parts.push("克制 " + s.sup.join("、"));
    if (s.imm.length) parts.push("无效 " + s.imm.join("、"));
    if (s.res.length) parts.push("被抵抗 " + s.res.join("、"));
    var sum = document.getElementById("tc-sum");
    if (sum) sum.textContent = parts.join(" · ");
  }

  function wireExtras() {
    var movesEl = document.getElementById("moves");
    if (movesEl) {
      movesEl.addEventListener("mouseover", function (e) { var t = e.target && e.target.closest ? e.target.closest(".move") : null; if (t) showMvTip(t); });
      movesEl.addEventListener("mouseout", function (e) { var t = e.target && e.target.closest ? e.target.closest(".move") : null; if (t) hideMvTip(); });
      movesEl.addEventListener("focusin", function (e) { var t = e.target && e.target.closest ? e.target.closest(".move") : null; if (t) showMvTip(t); });
      movesEl.addEventListener("focusout", hideMvTip);
      var tt = null;
      movesEl.addEventListener("touchstart", function (e) { var t = e.target && e.target.closest ? e.target.closest(".move") : null; if (!t) return; tt = setTimeout(function () { showMvTip(t); }, 350); }, { passive: true });
      movesEl.addEventListener("touchend", function () { if (tt) { clearTimeout(tt); tt = null; } hideMvTip(); });
      movesEl.addEventListener("touchmove", function () { if (tt) { clearTimeout(tt); tt = null; } hideMvTip(); }, { passive: true });
    }
    var tcb = document.getElementById("typechart-btn");
    if (tcb) tcb.addEventListener("click", openTypeChart);
    var tcc = document.getElementById("tc-close");
    if (tcc) tcc.addEventListener("click", closeTypeChart);
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
    _toggleStats: function () {
      statsCollapsed = !statsCollapsed;
      var el = document.getElementById("stats-panel");
      if (el) el.classList.toggle("collapsed", statsCollapsed);
    },
    _state: function () { return state; },
    _useMove: onMove,
    _switch: onSwitch,
    _mega: onMega,
    _dynamax: onDynamax,
    _tera: onTera,
    _beginCustom: function (mons) { beginGame(mons); },
    _resetBusy: function () { busy = false; }, // test hook: clear the turn-lock (headless no-op setTimeout can't fire wait()'s callback)
    _debug: {
      stageMult: stageMult,
      weatherMult: weatherMult,
      itemMult: itemDamageMult,
      recordResult: recordResult,
      loadStats: loadStats,
      setDifficulty: function (d) { setup.difficulty = d; if (state) state.difficulty = d; }
    }
  };

  // boot
  function intro() {
    showSetup();
    if (!hasOnboarded()) showOnboard();
  }
  if (typeof document !== "undefined" && document.getElementById) {
    loadShinyMode();
    loadSettings();
    applySettings();
    wireSetup();
    wireOnboard();
    wireSettings();
    wireExtras();
    updateShinyToggles();
    if (typeof document.addEventListener === "function") {
      document.addEventListener("keydown", onKey);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { intro(); });
    } else {
      intro();
    }
  }
})();
