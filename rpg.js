/* 宝可梦 RPG 冒险 — 独立模式（地图探索 / 捕捉 / 对战 / 升级）
 * 仅依赖 data.js（POKEMON_LIST / TYPE_EFFECT / TYPE_ZH），不加载 game.js。
 */
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
  var STATUS_ZH = { poison:"中毒", burn:"灼烧", paralysis:"麻痹", sleep:"睡眠", freeze:"冰冻" };
  // 属性 -> 可造成的状态
  var TYPE_STATUS = {
    poison:"poison", fire:"burn", electric:"paralysis",
    ice:"freeze", grass:"sleep", psychic:"sleep", ghost:"sleep"
  };

  // 安全网：战斗中任何 setTimeout 回调抛异常时，自动解锁 busy，避免按钮永久卡死
  function safeRun(fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (e) {
        console.error("RPG 战斗异常:", e);
        if (typeof battle !== "undefined" && battle) {
          battle.busy = false;
          if (!battle.over) battle.turn = "you";
          battleRender();
        }
      }
    };
  }

  // 每属性 4 个技能名（与卡牌对战一致）
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

  var TILE = 32;
  var SAVE_KEY = "pkmn_rpg_save_v1";

  /* ---------- 数值公式 ---------- */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function typeMult(moveType, defTypes) {
    var m = 1;
    for (var i = 0; i < defTypes.length; i++) {
      var row = EFFECT[moveType];
      if (row && row[defTypes[i]] !== undefined) m *= row[defTypes[i]];
    }
    return m;
  }
  // 技能威力（与卡牌对战同档位换算）
  function movePower(base, tier) {
    if (tier === 0) return clamp(Math.round(base * 0.42) + 14, 30, 75);
    if (tier === 1) return clamp(Math.round(base * 0.62) + 24, 48, 115);
    return clamp(Math.round(base * 0.85) + 34, 68, 160);
  }
  // 技能学习表（按等级解锁）
  function getLearnset(mon) {
    var t1 = mon.types[0], t2 = mon.types[1] || "normal";
    var k1 = MOVE_KIT[t1] || MOVE_KIT.normal;
    var k2 = MOVE_KIT[t2] || MOVE_KIT.normal;
    var moves = [
      { level: 1,  name: k1[0], type: t1, power: movePower(mon.attack, 0),     cat: "phys", cost: 0 },
      { level: 1,  name: k2[1], type: t2, power: movePower(mon.sp_attack, 0),   cat: "spec", cost: 0 },
      { level: 8,  name: k1[2], type: t1, power: movePower(mon.sp_attack, 1),   cat: "spec", cost: 0 },
      { level: 16, name: k2[3], type: t2, power: movePower(mon.attack, 2),      cat: "phys", cost: 0 },
      { level: 28, name: k1[3], type: t1, power: movePower(mon.attack, 2),      cat: "phys", cost: 0 },
      { level: 40, name: k2[2], type: t2, power: movePower(mon.sp_attack, 1),    cat: "spec", cost: 0 }
    ];
    if (TYPE_STATUS[t1]) { moves[2].status = TYPE_STATUS[t1]; moves[2].statusChance = 0.20; }
    if (TYPE_STATUS[t2]) { moves[3].status = TYPE_STATUS[t2]; moves[3].statusChance = 0.30; }
    // 去重（同名单属性可能重复）
    var seen = {}, out = [];
    for (var i = 0; i < moves.length; i++) {
      var key = moves[i].name + "|" + moves[i].type;
      if (!seen[key]) { seen[key] = true; out.push(moves[i]); }
    }
    return out;
  }

  // 进化等级：基础形态 16 级，一阶形态 36 级，无进化返回 null
  function evolutionLevel(mon) {
    if (!mon.evolves_to || mon.evolves_to.length === 0) return null;
    return mon.evolves_from === null ? 16 : 36;
  }
  function nextEvolution(mon) {
    if (!mon.evolves_to || mon.evolves_to.length === 0) return null;
    return MON_BY_ID[mon.evolves_to[0]];
  }

  function equippedMoves(member) {
    if (!member.moves) {
      var mon = MON_BY_ID[member.id];
      member.moves = getLearnset(mon).filter(function (m) { return m.level <= member.level; });
    }
    return member.moves;
  }
  function rpgMoves(mon) { return getLearnset(mon); }
  function newMovesAtLevel(mon, member, fromLevel, toLevel) {
    var ls = getLearnset(mon);
    var known = {};
    var cur = equippedMoves(member);
    for (var i = 0; i < cur.length; i++) known[cur[i].name + "|" + cur[i].type] = true;
    var out = [];
    for (var j = 0; j < ls.length; j++) {
      var m = ls[j];
      if (m.level > fromLevel && m.level <= toLevel && !known[m.name + "|" + m.type]) out.push(m);
    }
    return out;
  }
  // 等级 -> 六项数值（简化成长曲线，升级明显变强）
  function statLine(mon, level) {
    var g = level - 1;
    return {
      hp:        Math.floor(30 + mon.hp * 0.30 + g * 6),
      attack:    Math.floor(8 + mon.attack * 0.25 + g * 2.5),
      defense:   Math.floor(8 + mon.defense * 0.25 + g * 2.5),
      sp_attack: Math.floor(8 + mon.sp_attack * 0.25 + g * 2.5),
      sp_defense:Math.floor(8 + mon.sp_defense * 0.25 + g * 2.5),
      speed:     Math.floor(8 + mon.speed * 0.25 + g * 2.5)
    };
  }
  function expToNext(level) { return Math.floor(12 + level * level * 3.2); }
  function expReward(oppMember) {
    var s = MON_BY_ID[oppMember.id] || oppMember.mon;
    var sum = s.hp + s.attack + s.defense + s.sp_attack + s.sp_defense + s.speed;
    return Math.floor(10 + oppMember.level * 3 + sum / 30);
  }

  /* ---------- 数据索引 ---------- */
  var MON_BY_ID = {};
  for (var i = 0; i < LIST.length; i++) MON_BY_ID[LIST[i].id] = LIST[i];

  // 野生宝可梦池：只出现基础形态（未进化），且 HP/防御/总种族不过高，避免早期草丛刷出钢板/血牛碾压玩家
  function baseStatTotal(mon) { return mon.hp + mon.attack + mon.defense + mon.sp_attack + mon.sp_defense + mon.speed; }
  function isEligibleWild(mon) {
    return mon.evolves_from === null && mon.hp <= 90 && mon.defense <= 100 && baseStatTotal(mon) <= 420;
  }
  var WILD_COMMON = LIST.filter(function (mon) { return isEligibleWild(mon) && baseStatTotal(mon) <= 350; });
  var WILD_RARE = LIST.filter(function (mon) { return isEligibleWild(mon) && baseStatTotal(mon) > 350 && baseStatTotal(mon) <= 420; });

  /* ---------- 关卡系统（多关卡，由易到难） ---------- */
  var LEVELS = [
    {
      name: "初心草原",
      intro: "新手训练家的起点。野生宝可梦等级很低，先熟悉操作、捕捉伙伴吧！",
      wild: [3, 6], wildMaxBst: 360,
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: null, grassProb: 0.20,
      trainers: [
        { id: "l1t1", name: "短裤小子 阿勇", x: 8, y: 9,
          party: [ { id: 10, level: 4 }, { id: 13, level: 4 }, { id: 14, level: 5 } ] },
        { id: "l1t2", name: "少女 小茜", x: 22, y: 11,
          party: [ { id: 16, level: 5 }, { id: 19, level: 5 }, { id: 21, level: 6 } ] }
      ]
    },
    {
      name: "溪流湿地",
      intro: "水边潮湿，常见水属性宝可梦。注意水面（蓝色）无法通行。",
      wild: [6, 11], wildMaxBst: 405, wildTypes: ["water"],
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: { x: 10, y: 6, w: 9, h: 4 }, grassProb: 0.18,
      trainers: [
        { id: "l2t1", name: "渔夫 大叔", x: 6, y: 12,
          party: [ { id: 118, level: 7 }, { id: 120, level: 8 }, { id: 90, level: 9 } ] },
        { id: "l2t2", name: "泳装少女 小遥", x: 23, y: 10,
          party: [ { id: 54, level: 8 }, { id: 55, level: 10 }, { id: 80, level: 9 } ] },
        { id: "l2t3", name: "水手 阿海", x: 15, y: 4,
          party: [ { id: 79, level: 7 }, { id: 60, level: 8 }, { id: 87, level: 10 } ] }
      ]
    },
    {
      name: "岩石山道",
      intro: "崎岖山路，岩石与地面属性宝可梦盘踞，训练家等级明显提升。",
      wild: [10, 16], wildMaxBst: 435, wildTypes: ["rock", "ground"],
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: null, grassProb: 0.14,
      trainers: [
        { id: "l3t1", name: "登山男 小刚", x: 7, y: 8,
          party: [ { id: 74, level: 11 }, { id: 95, level: 12 }, { id: 111, level: 13 } ] },
        { id: "l3t2", name: "矿工 阿石", x: 20, y: 9,
          party: [ { id: 95, level: 12 }, { id: 127, level: 14 }, { id: 108, level: 13 } ] },
        { id: "l3t3", name: "岩石训练家 阿岩", x: 14, y: 5,
          party: [ { id: 74, level: 13 }, { id: 108, level: 14 }, { id: 142, level: 14 } ] }
      ]
    },
    {
      name: "迷雾森林",
      intro: "雾气弥漫，幽灵与妖精出没，训练家等级大幅上涨，小心迷路。",
      wild: [14, 22], wildMaxBst: 470, wildTypes: ["ghost", "fairy", "bug", "grass"],
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: null, grassProb: 0.24,
      trainers: [
        { id: "l4t1", name: "女训练家 小霞", x: 6, y: 10,
          party: [ { id: 25, level: 15 }, { id: 35, level: 15 }, { id: 39, level: 16 } ] },
        { id: "l4t2", name: "森林男 阿木", x: 22, y: 11,
          party: [ { id: 69, level: 15 }, { id: 70, level: 17 }, { id: 102, level: 16 } ] },
        { id: "l4t3", name: "迷雾使者 阿幽", x: 14, y: 4,
          party: [ { id: 92, level: 16 }, { id: 93, level: 18 }, { id: 94, level: 19 } ] },
        { id: "l4t4", name: "猎人 阿烈", x: 9, y: 14,
          party: [ { id: 52, level: 16 }, { id: 63, level: 17 }, { id: 133, level: 19 } ] }
      ]
    },
    {
      name: "冠军殿堂",
      intro: "最终决战之地！先击败四天王门将，再挑战冠军，成为新的联盟冠军！",
      wild: [20, 32], allowEvolved: true, wildMaxBst: 520,
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: { x: 11, y: 7, w: 8, h: 3 }, grassProb: 0.16,
      trainers: [
        { id: "l5t1", name: "四天王门将 阿蜜", x: 14, y: 13,
          party: [ { id: 134, level: 26 }, { id: 135, level: 26 }, { id: 136, level: 26 } ] },
        { id: "l5t2", name: "冠军 阿渡", x: 27, y: 2,
          party: [ { id: 6, level: 30 }, { id: 131, level: 28 }, { id: 142, level: 30 }, { id: 149, level: 32 } ] }
      ]
    }
  ];

  // 每关通关奖励（精灵球 + 赠送宝可梦），monLevel 为该宝可梦加入时的等级
  var LEVEL_REWARDS = [
    { balls: 5,  mon: 25,  monLevel: 6 },   // 皮卡丘
    { balls: 5,  mon: 130, monLevel: 9 },   // 暴鲤龙
    { balls: 8,  mon: 95,  monLevel: 13 },  // 大岩蛇
    { balls: 8,  mon: 149, monLevel: 18 },  // 快龙
    { balls: 15, mon: 150, monLevel: 32 }   // 超梦（冠军奖励）
  ];

  // 确定性随机（保证每关地图固定，刷新后不变）
  function lvlRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 根据关卡配置生成地图（30x20，匹配画布 960x640）
  function buildLevelMap(cfg) {
    var W = 30, H = 20;
    var reserved = {};
    function mark(p) { if (p) reserved[p[0] + "," + p[1]] = true; }
    mark(cfg.center); mark(cfg.start); mark(cfg.goal);
    cfg.trainers.forEach(function (t) { mark([t.x, t.y]); });
    var rnd = lvlRng((LEVELS.indexOf(cfg) + 1) * 7919);
    var pond = cfg.pond;
    var grid = [];
    for (var y = 0; y < H; y++) {
      var row = [];
      for (var x = 0; x < W; x++) {
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) row.push("#");
        else if (pond && x >= pond.x && x < pond.x + pond.w && y >= pond.y && y < pond.y + pond.h) row.push("~");
        else if (reserved[x + "," + y]) row.push(".");
        else if (rnd() < cfg.grassProb) row.push(",");
        else row.push(".");
      }
      grid.push(row);
    }
    grid[cfg.center[1]][cfg.center[0]] = "C";
    grid[cfg.start[1]][cfg.start[0]] = "P";
    if (cfg.goal) grid[cfg.goal[1]][cfg.goal[0]] = "G";
    return grid.map(function (r) { return r.join(""); });
  }

  // 每关可变状态（由 loadLevel 写入）
  var MAP, MAP_W, MAP_H, START, TRAINERS, WILD_RANGE, CURRENT_WILD_POOL;

  function buildWildPool(cfg) {
    var pool = LIST.filter(function (mon) {
      if (cfg.allowEvolved) {
        if (baseStatTotal(mon) > (cfg.wildMaxBst || 500)) return false;
      } else {
        if (!isEligibleWild(mon)) return false;
        if (baseStatTotal(mon) > (cfg.wildMaxBst || 420)) return false;
      }
      if (cfg.wildTypes) {
        var ok = false;
        for (var i = 0; i < mon.types.length; i++) if (cfg.wildTypes.indexOf(mon.types[i]) >= 0) { ok = true; break; }
        if (!ok) return false;
      }
      return true;
    });
    if (pool.length === 0) pool = WILD_COMMON;
    return pool;
  }
  function loadLevel(idx, withIntro) {
    var cfg = LEVELS[idx];
    MAP = buildLevelMap(cfg);
    MAP_W = MAP[0].length; MAP_H = MAP.length;
    START = { x: cfg.start[0], y: cfg.start[1] };
    TRAINERS = cfg.trainers;
    WILD_RANGE = cfg.wild;
    CURRENT_WILD_POOL = buildWildPool(cfg);
    player.x = START.x; player.y = START.y;
    player.px = player.x * TILE + TILE / 2; player.py = player.y * TILE + TILE / 2;
    player.tx = player.px; player.ty = player.py; player.moving = false;
    renderLevelInfo();
    if (withIntro && cfg.intro) showLevelIntro(cfg);
  }
  function levelCleared() {
    if (!save || !TRAINERS) return false;
    for (var i = 0; i < TRAINERS.length; i++) {
      if (!save.defeated[TRAINERS[i].id]) return false;
    }
    return true;
  }

  // 训练家 NPC 改由 LEVELS 配置，loadLevel 写入全局 TRAINERS。
  function trainerAt(x, y) {
    for (var i = 0; i < TRAINERS.length; i++) {
      if (TRAINERS[i].x === x && TRAINERS[i].y === y) return TRAINERS[i];
    }
    return null;
  }

  /* ---------- 全局状态 ---------- */
  var save = null;          // { party:[member], balls, defeated:{} }
  var player = { x: 0, y: 0, px: 0, py: 0, tx: 0, ty: 0, moving: false, starterId: null };
  var inBattle = false;
  var battle = null;
  var imgCache = {};

  function spriteImg(id) {
    if (!imgCache[id]) {
      var im = new Image();
      var b = MON_BY_ID[id].sprite.split("/").pop();
      im.onerror = function () {
        im.onerror = null;
        if (window.__SPRITE_ONLINE && window.__SPRITE_ONLINE[b]) im.src = window.__SPRITE_ONLINE[b];
      };
      im.src = MON_BY_ID[id].sprite;
      imgCache[id] = im;
    }
    return imgCache[id];
  }

  /* ---------- 存档 ---------- */
  function saveGame() {
    try {
      var data = {
        party: save.party.map(function (m) {
          return { id: m.id, level: m.level, exp: m.exp, hp: m.hp, status: m.status || null, moves: m.moves || null };
        }),
        balls: save.balls,
        defeated: save.defeated,
        level: save.level,
        maxLevel: save.maxLevel || 0,
        champion: !!save.champion
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* localStorage 不可用时忽略 */ }
  }
  function loadGame() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || !d.party || d.party.length === 0) return null;
      return d;
    } catch (e) { return null; }
  }

  /* ---------- 队伍 / 数值 ---------- */
  function makeMember(id, level) {
    var mon = MON_BY_ID[id];
    var moves = getLearnset(mon).filter(function (m) { return m.level <= level; });
    return { id: id, level: level, exp: 0, hp: statLine(mon, level).hp, status: null, moves: moves };
  }
  function healParty() {
    save.party.forEach(function (m) {
      m.hp = statLine(MON_BY_ID[m.id], m.level).hp; m.status = null;
    });
  }

  /* ---------- 地图渲染 ---------- */
  var canvas, ctx;
  var mapScale = 1; // 地图缩放倍数
  var MIN_SCALE = 1, MAX_SCALE = 3, SCALE_STEP = 0.25;
  function drawMap() {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var scale = mapScale;
    ctx.save();
    if (scale > MIN_SCALE) {
      var halfW = canvas.width / (2 * scale);
      var halfH = canvas.height / (2 * scale);
      var camX = clamp(player.px, halfW, MAP_W * TILE - halfW);
      var camY = clamp(player.py, halfH, MAP_H * TILE - halfH);
      ctx.translate(canvas.width / 2 - camX * scale, canvas.height / 2 - camY * scale);
      ctx.scale(scale, scale);
    }

    if (!save) { // 尚未选择初始宝可梦：只画地形
      for (var y = 0; y < MAP_H; y++) for (var x = 0; x < MAP_W; x++) drawTile(x, y, MAP[y][x]);
    } else {
      for (var y = 0; y < MAP_H; y++) {
        for (var x = 0; x < MAP_W; x++) {
          drawTile(x, y, MAP[y][x]);
        }
      }
      // 训练家
      TRAINERS.forEach(function (t) {
        var defeated = save && save.defeated && save.defeated[t.id];
        drawSpriteOnTile(t.party[0].id, t.x, t.y, defeated ? 0.4 : 1);
      });
      // 玩家
      drawSpriteOnTile(player.starterId || save.party[0].id, -1, -1, 1, true);
    }
    ctx.restore();
  }
  function drawTile(x, y, ch) {
    var px = x * TILE, py = y * TILE;
    if (ch === "#") {
      ctx.fillStyle = "#27632f"; ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#1d4d24";
      ctx.beginPath(); ctx.arc(px + TILE/2, py + TILE/2, TILE/2 - 2, 0, 7); ctx.fill();
    } else if (ch === "~") {
      ctx.fillStyle = "#3f7fd0"; ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#5a97e0";
      ctx.fillRect(px, py + 6, TILE, 3); ctx.fillRect(px + 4, py + 18, TILE - 8, 3);
    } else if (ch === ",") {
      ctx.fillStyle = "#9bd36a"; ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#5fae3c";
      ctx.fillRect(px + 6, py + 8, 3, 8); ctx.fillRect(px + 14, py + 5, 3, 11);
      ctx.fillRect(px + 22, py + 9, 3, 7);
    } else if (ch === "C") {
      ctx.fillStyle = "#f4d35e"; ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#c79a00";
      ctx.fillRect(px + TILE/2 - 9, py + 4, 18, 4);
      ctx.fillRect(px + TILE/2 - 2, py + 4, 4, 24);
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(px + TILE/2, py + TILE/2 + 2, 5, 0, 7); ctx.fill();
    } else if (ch === "G") {
      var gOpen = levelCleared();
      ctx.fillStyle = gOpen ? "#5b34b0" : "#3a3f4a"; ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = gOpen ? "#c9b3ff" : "#6b7180"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px + TILE/2, py + TILE/2, TILE/2 - 6, 0, 7); ctx.stroke();
      ctx.fillStyle = gOpen ? "#e9deff" : "#7b818f";
      ctx.beginPath(); ctx.arc(px + TILE/2, py + TILE/2, TILE/2 - 11, 0, 7); ctx.fill();
      if (gOpen) {
        ctx.fillStyle = "#fff"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("✦", px + TILE/2, py + TILE/2);
      }
    } else {
      ctx.fillStyle = "#bfe09a"; ctx.fillRect(px, py, TILE, TILE);
    }
    // 网格描边
    ctx.strokeStyle = "#00000010"; ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
  }
  function drawSpriteOnTile(id, x, y, alpha, isPlayer) {
    var cx, cy;
    if (isPlayer) { cx = player.px; cy = player.py; }
    else { cx = x * TILE + TILE/2; cy = y * TILE + TILE/2; }
    ctx.save();
    ctx.globalAlpha = alpha;
    // 影子
    ctx.fillStyle = "#00000033";
    ctx.beginPath(); ctx.ellipse(cx, cy + TILE/2 - 3, 11, 4, 0, 0, 7); ctx.fill();
    var im = spriteImg(id);
    var s = TILE - 6;
    if (im.complete && im.naturalWidth) {
      ctx.drawImage(im, cx - s/2, cy - s/2, s, s);
    } else {
      ctx.fillStyle = TYPE_COLOR[MON_BY_ID[id].types[0]] || "#888";
      ctx.beginPath(); ctx.arc(cx, cy, s/2, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("#" + id, cx, cy);
    }
    ctx.restore();
  }

  /* ---------- 地图缩放 ---------- */
  function setZoom(s) {
    mapScale = clamp(Math.round(s / SCALE_STEP) * SCALE_STEP, MIN_SCALE, MAX_SCALE);
    updateZoomUI();
  }
  function zoomIn() { setZoom(mapScale + SCALE_STEP); }
  function zoomOut() { setZoom(mapScale - SCALE_STEP); }
  function resetZoom() { setZoom(1); }
  function updateZoomUI() {
    var el = document.getElementById("rpg-zoom-lvl");
    if (el) el.textContent = Math.round(mapScale * 100) + "%";
  }
  function bindZoomControls() {
    var zin = document.getElementById("rpg-zoom-in");
    var zout = document.getElementById("rpg-zoom-out");
    var zreset = document.getElementById("rpg-zoom-reset");
    if (zin) zin.addEventListener("click", zoomIn);
    if (zout) zout.addEventListener("click", zoomOut);
    if (zreset) zreset.addEventListener("click", resetZoom);
  }

  /* ---------- 移动端 pinch 缩放 ---------- */
  function bindPinchZoom() {
    if (!canvas) return;
    var startDist = 0, startScale = 1;
    canvas.addEventListener("touchstart", function (e) {
      if (e.touches.length === 2) {
        startDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        startScale = mapScale;
      }
    }, { passive: true });
    canvas.addEventListener("touchmove", function (e) {
      if (e.touches.length === 2) {
        var d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (startDist > 0) setZoom(startScale * (d / startDist));
      }
    }, { passive: true });
    canvas.addEventListener("touchend", function () {
      startDist = 0;
    }, { passive: true });
  }

  /* ---------- 移动 / 遇敌 ---------- */
  function tryMove(dx, dy) {
    if (inBattle || player.moving || !save) return;
    var nx = player.x + dx, ny = player.y + dy;
    if (nx < 0 || ny < 0 || ny >= MAP_H || nx >= MAP_W) return;
    var ch = MAP[ny][nx];
    if (ch === "#" || ch === "~") return;
    var tr = trainerAt(nx, ny);
    if (tr) {
      if (save.defeated && save.defeated[tr.id]) {
        // 已战胜的训练家若恰好站在传送门格上，可踩上去进入下一关
        if (MAP[ny][nx] === "G") {
          if (!levelCleared()) { toast("先击败本关所有训练家，传送门才会开启！"); return; }
          advanceLevel(); return;
        }
        toast(tr.name + "（已战胜）"); return;
      }
      triggerTrainer(tr); return;
    }
    if (ch === "G") {
      if (!levelCleared()) { toast("先击败本关所有训练家，传送门才会开启！"); return; }
      advanceLevel(); return;
    }
    player.x = nx; player.y = ny;
    player.tx = nx * TILE + TILE/2; player.ty = ny * TILE + TILE/2;
    player.moving = true;
  }
  function onArrive() {
    var ch = MAP[player.y][player.x];
    if (ch === ",") {
      if (Math.random() < 0.14) { triggerEncounter(); return; }
    }
    if (ch === "C") { healParty(); saveGame(); renderPartyHUD(); toast("在宝可梦中心回复了全部体力！"); }
  }
  function loop() {
    if (player.moving) {
      player.px += (player.tx - player.px) * 0.35;
      player.py += (player.ty - player.py) * 0.35;
      if (Math.abs(player.tx - player.px) < 0.8 && Math.abs(player.ty - player.py) < 0.8) {
        player.px = player.tx; player.py = player.ty; player.moving = false;
        onArrive();
      }
    }
    drawMap();
    requestAnimationFrame(loop);
  }

  /* ---------- 触发战斗 ---------- */
  function wildSpecies() {
    var pool = CURRENT_WILD_POOL || WILD_COMMON;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function triggerEncounter() {
    var mon = wildSpecies();
    var maxLv = save.party.reduce(function (m, p) { return Math.max(m, p.level); }, 1);
    var level = Math.max(WILD_RANGE[0], Math.min(WILD_RANGE[1], maxLv - 1 + Math.floor(Math.random() * 4)));
    var m = makeMember(mon.id, level);
    toast("野生的 " + mon.name_zh + "（Lv." + level + "）出现了！");
    startBattle({ wild: true, name: "野生宝可梦", oppParty: [m] });
  }
  function triggerTrainer(t) {
    var party = t.party.map(function (p) { return makeMember(p.id, p.level); });
    startBattle({ wild: false, name: t.name, trainerId: t.id, oppParty: party });
  }

  /* ---------- 战斗：构建 ---------- */
  function buildCombat(member, isPlayer) {
    var mon = MON_BY_ID[member.id];
    var st = statLine(mon, member.level);
    var moves = equippedMoves(member);
    if (moves.length === 0) { moves = getLearnset(mon).filter(function (m) { return m.level <= member.level; }); member.moves = moves; }
    return {
      member: member, mon: mon, level: member.level,
      maxHp: st.hp, hp: Math.min(member.hp, st.hp),
      stats: st, moves: moves, status: member.status || null, fainted: false
    };
  }
  function startBattle(opts) {
    inBattle = true;
    var youCombat = save.party.map(function (m) { return buildCombat(m, true); });
    var oppCombat = opts.oppParty.map(function (m) { return buildCombat(m, false); });
    battle = {
      wild: opts.wild,
      you: { party: youCombat, idx: 0, participants: { 0: true } },
      opp: { party: oppCombat, idx: 0, name: opts.name, trainerId: opts.trainerId || null },
      turn: "you", over: false, busy: false, log: [], _switch: false,
      startLevels: youCombat.map(function (c) { return c.member.level; })
    };
    showBattle();
    if (opts.wild) battleLog("sys", "野生的 " + oppCombat[0].mon.name_zh + "（Lv." + oppCombat[0].level + "）出现了！");
    else battleLog("sys", opts.name + " 发起了对战！");
    battleRender();
  }
  function active(side) { return battle[side].party[battle[side].idx]; }
  function sideName(side) { return side === "you" ? "你" : battle.opp.name; }

  /* ---------- 战斗：伤害 ---------- */
  function expected(att, def, mv) {
    var atk = mv.cat === "phys" ? att.stats.attack : att.stats.sp_attack;
    var dfs = mv.cat === "phys" ? def.stats.defense : def.stats.sp_defense;
    return mv.power * (atk / (dfs + 8)) * 0.42 * typeMult(mv.type, def.mon.types);
  }
  function applyMove(att, def, mv) {
    var atk = mv.cat === "phys" ? att.stats.attack : att.stats.sp_attack;
    var dfs = mv.cat === "phys" ? def.stats.defense : def.stats.sp_defense;
    var mult = typeMult(mv.type, def.mon.types);
    var base = mv.power * (atk / (dfs + 8)) * 0.42 * mult;
    var variance = 0.85 + Math.random() * 0.15;
    var dmg = Math.max(1, Math.floor(base * variance));
    def.hp = Math.max(0, def.hp - dmg);
    var statusApplied = false;
    if (mv.status && !def.status && Math.random() < (mv.statusChance || 0)) {
      def.status = { type: mv.status }; statusApplied = true;
    }
    return { dmg: dmg, mult: mult, statusApplied: statusApplied };
  }

  /* ---------- 战斗：玩家行动 ---------- */
  function playerAct(idx) {
    if (battle.over || battle.busy || battle.turn !== "you" || battle._switch) return;
    battle.busy = true; battle._switch = false;
    var att = active("you"), def = active("opp");
    var mv = att.moves[idx];
    var res = applyMove(att, def, mv);
    battleLog("you", "你 的 " + att.mon.name_zh + " 使用【" + mv.name + "】！");
    spawnDmg("opp", res.dmg, res.mult);
    battleRender();
    setTimeout(safeRun(function () {
      if (def.hp <= 0) { onFaint("opp"); }
      else {
        if (res.statusApplied && def.status) battleLog("foe", def.mon.name_zh + " 陷入" + STATUS_ZH[def.status.type] + "状态！");
        oppTurn();
      }
    }), 760);
  }
  function doCapture() {
    if (battle.over || battle.busy || battle.turn !== "you" || !battle.wild || battle._switch) return;
    if (save.balls <= 0) { toast("没有精灵球了！"); return; }
    if (battle.you.party.length >= 6) { toast("队伍已满（最多 6 只），无法捕捉！"); return; }
    battle.busy = true;
    save.balls--; renderPartyHUD();
    var opp = active("opp");
    var rate = clamp(0.08 + (1 - opp.hp / opp.maxHp) * 0.5, 0.05, 0.95);
    battleLog("you", "你投出了精灵球…");
    battleRender();
    setTimeout(safeRun(function () {
      if (Math.random() < rate) {
        var mon = MON_BY_ID[opp.mon.id];
        var moves = getLearnset(mon).filter(function (m) { return m.level <= opp.level; });
        var m = { id: opp.mon.id, level: opp.level, exp: 0, hp: opp.hp, status: null, moves: moves };
        save.party.push(m);
        battle.you.party.push(buildCombat(m, true));
        battleLog("cap", "太好了！抓住了 " + opp.mon.name_zh + "！");
        toast("抓住了 " + opp.mon.name_zh + "！");
        endBattle("caught");
      } else {
        battleLog("foe", opp.mon.name_zh + " 挣脱了精灵球！");
        toast("没抓住…");
        oppTurn();
      }
    }), 950);
  }
  function doSwitch(idx) {
    if (battle.over || battle.busy || battle.turn !== "you") return;
    if (battle.you.idx === idx || battle.you.party[idx].fainted) return;
    battle.busy = true; battle._switch = false;
    battle.you.idx = idx;
    battle.you.participants[idx] = true;
    battleLog("sys", "你换上了 " + active("you").mon.name_zh + "！");
    battleRender();
    setTimeout(safeRun(oppTurn), 450);
  }
  function doRun() {
    if (battle.over || battle.busy || battle.turn !== "you" || !battle.wild || battle._switch) return;
    battle.busy = true;
    var you = active("you"), opp = active("opp");
    var chance = clamp(0.4 + (you.stats.speed - opp.stats.speed) * 0.02, 0.2, 0.95);
    battleLog("sys", "你试图逃跑…");
    battleRender();
    setTimeout(safeRun(function () {
      if (Math.random() < chance) { battleLog("sys", "成功逃跑了！"); endBattle("run"); }
      else { battleLog("foe", "没能逃掉！"); oppTurn(); }
    }), 700);
  }

  /* ---------- 战斗：对手回合 ---------- */
  function oppTurn() {
    if (battle.over) return;
    battle.turn = "opp"; battleRender();
    setTimeout(safeRun(function () {
      if (battle.over) return;
      var att = active("opp"), def = active("you");
      // 选最优招式
      var best = att.moves[0], be = -1;
      for (var i = 0; i < att.moves.length; i++) {
        var e = expected(att, def, att.moves[i]);
        if (e > be) { be = e; best = att.moves[i]; }
      }
      var res = applyMove(att, def, best);
      battleLog("foe", battle.opp.name + " 的 " + att.mon.name_zh + " 使用【" + best.name + "】！");
      spawnDmg("you", res.dmg, res.mult);
      battleRender();
      setTimeout(safeRun(function () {
        if (def.hp <= 0) { onFaint("you"); }
        else {
          if (res.statusApplied && def.status) battleLog("you", def.mon.name_zh + " 陷入" + STATUS_ZH[def.status.type] + "状态！");
          battle.turn = "you"; battle.busy = false; battleRender();
        }
      }), 760);
    }), 520);
  }

  /* ---------- 战斗：倒下 / 经验 / 升级 ---------- */
  function onFaint(side) {
    var arr = battle[side].party, idx = battle[side].idx;
    arr[idx].fainted = true;
    battleLog("sys", arr[idx].mon.name_zh + " 倒下了！");
    if (side === "opp") awardExp(arr[idx]);
    var next = -1;
    for (var i = 0; i < arr.length; i++) { if (!arr[i].fainted) { next = i; break; } }
    if (next < 0) {
      endBattle(side === "opp" ? "win" : "lose");
      return;
    }
    battle[side].idx = next;
    battleLog("sys", (side === "you" ? "你" : battle.opp.name) + " 派出 " + arr[next].mon.name_zh + "！");
    if (side === "you") battle.you.participants[next] = true;
    battleRender();
    setTimeout(safeRun(function () { if (side === "you") oppTurn(); else endYourTurn(); }), 650);
  }
  function endYourTurn() { battle.turn = "you"; battle.busy = false; battleRender(); }

  function awardExp(oppMember) {
    var exp = expReward(oppMember);
    battleLog("lv", "获得 " + exp + " 点经验值！");
    var parts = battle.you.participants;
    Object.keys(parts).forEach(function (k) {
      if (!parts[k]) return;
      var ci = battle.you.party[+k];
      if (ci) addExp(ci.member, exp);
    });
  }
  function addExp(member, amount) {
    member.exp += amount;
    var leveled = false;
    while (member.exp >= expToNext(member.level)) {
      member.exp -= expToNext(member.level);
      member.level++;
      var mon = MON_BY_ID[member.id];
      var oldMax = statLine(mon, member.level - 1).hp;
      var newMax = statLine(mon, member.level).hp;
      member.hp += (newMax - oldMax);
      if (member.hp > newMax) member.hp = newMax;
      leveled = true;
    }
    if (leveled) {
      var ci = null;
      for (var i = 0; i < battle.you.party.length; i++) {
        if (battle.you.party[i].member === member) { ci = battle.you.party[i]; break; }
      }
      if (ci) {
        var st = statLine(MON_BY_ID[member.id], member.level);
        ci.maxHp = st.hp; ci.hp = member.hp; ci.stats = st; ci.level = member.level;
      }
      var nm = MON_BY_ID[member.id].name_zh;
      battleLog("lv", nm + " 升到了 " + member.level + " 级！");
      toast(nm + " 升到了 Lv." + member.level + "！");
    }
  }

  function endBattle(result) {
    battle.over = true; battle.busy = true;
    // 同步存活 HP 回存档
    battle.you.party.forEach(function (c) { c.member.hp = c.hp; c.member.status = c.status; });
    if (result === "win") {
      battleLog("sys", "你赢得了对战！");
      if (battle.opp.trainerId) save.defeated[battle.opp.trainerId] = true;
    } else if (result === "caught") {
      battleLog("cap", "收服成功，队伍更强大了！");
    } else if (result === "run") {
      battleLog("sys", "你逃离了战斗。");
    } else if (result === "lose") {
      battleLog("sys", "你输掉了…被送回宝可梦中心。");
    }
    saveGame();
    battleRender();
    setTimeout(safeRun(function () {
      var events = collectLevelUpEvents();
      if (events.length && result !== "lose") {
        processLevelUpEvents(events, function () {
          finishReturnToMap(result);
        });
      } else {
        finishReturnToMap(result);
      }
    }), 1200);
  }
  function finishReturnToMap(result) {
    hideBattle();
    inBattle = false;
    if (result === "lose") {
      healParty();
      player.x = START.x; player.y = START.y;
      player.px = player.x * TILE + TILE / 2; player.py = player.y * TILE + TILE / 2;
      player.tx = player.px; player.ty = player.py;
    }
    renderPartyHUD();
    renderLevelInfo();
    drawMap();
    if (save.level >= LEVELS.length - 1 && levelCleared() && !save.champion) {
      save.champion = true; saveGame();
      showLevelReward(LEVELS.length - 1, function () { showVictory(); });
    }
  }

  /* ---------- 升级 / 学习招式 / 进化 ---------- */
  function collectLevelUpEvents() {
    var events = [];
    if (!battle || !battle.startLevels) return events;
    for (var i = 0; i < battle.you.party.length; i++) {
      var c = battle.you.party[i];
      var oldLv = battle.startLevels[i] || c.member.level;
      if (c.member.level > oldLv) {
        var mon = MON_BY_ID[c.member.id];
        var evo = nextEvolution(mon);
        var canEvo = evo && evolutionLevel(mon) <= c.member.level;
        var newMoves = newMovesAtLevel(mon, c.member, oldLv, c.member.level);
        events.push({ member: c.member, combat: c, oldLv: oldLv, newLv: c.member.level, newMoves: newMoves, evo: canEvo ? evo : null });
      }
    }
    return events;
  }
  function processLevelUpEvents(events, onDone) {
    if (events.length === 0) { saveGame(); if (onDone) onDone(); return; }
    var ev = events.shift();
    showLevelUpEvent(ev, function () { processLevelUpEvents(events, onDone); });
  }
  function showLevelUpEvent(ev, onDone) {
    var mon = MON_BY_ID[ev.member.id];
    var modal = document.getElementById("rpg-levelmodal");
    var title = document.getElementById("rpg-level-title");
    var body = document.getElementById("rpg-level-body");
    var acts = document.getElementById("rpg-level-actions");
    if (!modal || !title || !body || !acts) { if (onDone) onDone(); return; }
    title.textContent = mon.name_zh + " 升到了 Lv." + ev.newLv + "！";
    body.innerHTML = levelUpBodyHTML(ev, mon);
    acts.innerHTML = "";
    modal.classList.remove("hidden");

    // 先处理新招式，再处理进化
    function doMoves() {
      if (ev.newMoves.length > 0) {
        var remaining = autoLearnMoves(ev.member, ev.newMoves);
        if (remaining.length > 0) {
          showLearnMovePrompt(ev.member, remaining, function () { doEvolve(); });
        } else {
          doEvolve();
        }
      } else {
        doEvolve();
      }
    }
    function doEvolve() {
      if (ev.evo) {
        showEvolvePrompt(ev.member, ev.evo, function () { closeModal(); });
      } else {
        closeModal();
      }
    }
    function closeModal() {
      modal.classList.add("hidden");
      if (onDone) onDone();
    }
    doMoves();
  }
  function levelUpBodyHTML(ev, mon) {
    return '' +
      '<div class="rpg-level-pkmn">' +
        '<div class="lv-spr"><img src="' + mon.sprite + '" alt="' + mon.name_zh + '"></div>' +
        '<div class="lv-info">' +
          '<div class="lv-name">' + mon.name_zh + ' <small>Lv.' + ev.oldLv + ' → Lv.' + ev.newLv + '</small></div>' +
          '<div class="lv-meta">HP/攻/防/特攻/特防/速 已提升</div>' +
          '<div class="rpg-bc-types" style="margin-top:6px;justify-content:flex-start;">' + typeChips(mon.types) + '</div>' +
        '</div>' +
      '</div>' +
      (ev.newMoves.length ? '<div style="text-align:left;font-size:13px;font-weight:700;color:var(--ink);">可以学习新招式：</div>' : "") +
      (ev.evo ? '<div style="text-align:left;font-size:13px;font-weight:700;color:var(--accent2);">可以进化成 ' + ev.evo.name_zh + '！</div>' : "");
  }

  function autoLearnMoves(member, moves) {
    var cur = equippedMoves(member);
    var remaining = [];
    var monName = MON_BY_ID[member.id].name_zh;
    for (var i = 0; i < moves.length; i++) {
      if (cur.length < 4) {
        cur.push(moves[i]);
        member.moves = cur;
        toast(monName + " 学会了 " + moves[i].name + "！");
      } else {
        remaining.push(moves[i]);
      }
    }
    return remaining;
  }

  function showLearnMovePrompt(member, moves, onDone) {
    var modal = document.getElementById("rpg-levelmodal");
    var title = document.getElementById("rpg-level-title");
    var body = document.getElementById("rpg-level-body");
    var acts = document.getElementById("rpg-level-actions");
    var mon = MON_BY_ID[member.id];
    title.textContent = mon.name_zh + " 可以学习新招式";
    var current = equippedMoves(member);
    var move = moves.shift();
    body.innerHTML = '' +
      '<div style="text-align:center;font-size:14px;font-weight:800;margin-bottom:10px;">新招式：' + move.name + '</div>' +
      '<div class="rpg-level-moves" id="rpg-lm-list">' + current.map(function (m, i) {
        return '' +
          '<div class="rpg-lm" data-replace="' + i + '">' +
            '<div class="lmn"><span class="type-chip" style="background:' + (TYPE_COLOR[m.type] || "#888") + '">' + (TYPE_ZH[m.type] || m.type) + '</span>' + m.name + '</div>' +
            '<div class="lmd"><span>威力 ' + m.power + '</span><span>' + (m.cat === "phys" ? "物理" : "特殊") + '</span></div>' +
            '<div class="lm-replace">点击替换</div>' +
          '</div>';
      }).join("") + '</div>' +
      '<div style="margin-top:10px;"><button class="rpg-btn ghost" id="rpg-lm-skip">跳过</button></div>';
    acts.innerHTML = "";

    function finish() {
      if (moves.length > 0) setTimeout(function () { showLearnMovePrompt(member, moves, onDone); }, 50);
      else if (onDone) onDone();
    }
    document.getElementById("rpg-lm-skip").addEventListener("click", function () { finish(); });
    var cells = document.querySelectorAll("#rpg-lm-list .rpg-lm");
    for (var i = 0; i < cells.length; i++) (function (el) {
      el.addEventListener("click", function () {
        var idx = +el.getAttribute("data-replace");
        member.moves[idx] = move;
        toast(mon.name_zh + " 学会了 " + move.name + "！");
        finish();
      });
    })(cells[i]);
  }

  function showEvolvePrompt(member, evoMon, onDone) {
    var modal = document.getElementById("rpg-levelmodal");
    var title = document.getElementById("rpg-level-title");
    var body = document.getElementById("rpg-level-body");
    var acts = document.getElementById("rpg-level-actions");
    var mon = MON_BY_ID[member.id];
    title.textContent = mon.name_zh + " 可以进化了！";
    body.innerHTML = '' +
      '<div style="display:flex;align-items:center;justify-content:center;gap:20px;margin:10px 0;">' +
        '<div class="rpg-level-pkmn" style="flex-direction:column;gap:6px;padding:10px;">' +
          '<div class="lv-spr"><img src="' + mon.sprite + '" alt="' + mon.name_zh + '"></div>' +
          '<div class="lv-name">' + mon.name_zh + '</div>' +
        '</div>' +
        '<div class="rpg-evo-arrow">→</div>' +
        '<div class="rpg-level-pkmn" style="flex-direction:column;gap:6px;padding:10px;background:#eef3ff;">' +
          '<div class="lv-spr"><img src="' + evoMon.sprite + '" alt="' + evoMon.name_zh + '"></div>' +
          '<div class="lv-name">' + evoMon.name_zh + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="text-align:center;color:var(--muted);font-size:13px;">进化后将获得更强能力并重新生成可学习招式</div>';
    acts.innerHTML = '<button class="rpg-btn" id="rpg-evo-yes">进化</button><button class="rpg-btn ghost" id="rpg-evo-no">不进化</button>';
    document.getElementById("rpg-evo-yes").addEventListener("click", function () {
      evolveMember(member, evoMon);
      toast(mon.name_zh + " 进化成了 " + evoMon.name_zh + "！");
      if (onDone) onDone();
    });
    document.getElementById("rpg-evo-no").addEventListener("click", function () { if (onDone) onDone(); });
  }
  function evolveMember(member, evoMon) {
    var oldHpRatio = member.hp / statLine(MON_BY_ID[member.id], member.level).hp;
    member.id = evoMon.id;
    member.moves = getLearnset(evoMon).filter(function (m) { return m.level <= member.level; });
    var newMax = statLine(evoMon, member.level).hp;
    member.hp = Math.max(1, Math.round(newMax * oldHpRatio));
  }

  /* ---------- 战斗：渲染 ---------- */
  function typeChips(types) {
    return types.map(function (t) {
      return '<span class="type-chip" style="background:' + (TYPE_COLOR[t] || "#888") +
        '">' + (TYPE_ZH[t] || t) + "</span>";
    }).join("");
  }
  function hpColor(r) { return r > 0.5 ? "var(--hp-good)" : r > 0.22 ? "var(--hp-mid)" : "var(--hp-low)"; }

  function battleCardHTML(c, side) {
    var ratio = c.hp / c.maxHp;
    var expRatio = c.member ? (c.member.exp / expToNext(c.member.level)) : 0;
    var isYou = side === "you";
    var cls = isYou ? "you" : "foe";
    var statusHTML = c.status
      ? '<span class="rpg-bc-status" style="background:' + (TYPE_COLOR_STATUS(c.status.type)) + '">' +
        STATUS_ZH[c.status.type] + "</span>"
      : "";
    return '' +
      '<div class="rpg-bc ' + cls + '">' +
        '<div class="rpg-bc-head"><span>' + c.mon.name_zh + '</span><span class="lv">Lv.' + c.level + '</span></div>' +
        '<div class="rpg-bc-body">' +
          '<div class="rpg-bc-sprite" id="rpg-' + side + '-sprite">' +
            '<img src="' + c.mon.sprite + '" alt="' + c.mon.name_zh + '" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
            '<div style="display:none;width:40px;height:40px;border-radius:50%;background:#e3534a;color:#fff;font-weight:800;align-items:center;justify-content:center;">' + c.mon.id + '</div>' +
          '</div>' +
          '<div class="rpg-bc-stats">' +
            '<div class="rpg-bc-hp"><span>HP</span><div class="bar"><i style="width:' + (ratio*100) +
              '%;background:' + hpColor(ratio) + '"></i></div><span>' + c.hp + "/" + c.maxHp + '</span></div>' +
            (isYou ? '<div class="rpg-bc-exp"><i style="width:' + (expRatio*100) + '%"></i></div>' : "") +
            '<div class="rpg-bc-types">' + typeChips(c.mon.types) + '</div>' +
            statusHTML +
          '</div>' +
        '</div>' +
      '</div>';
  }
  function TYPE_COLOR_STATUS(type) {
    return { poison:"#A040A0", burn:"#F08030", paralysis:"#E8B800", sleep:"#9B7EDE", freeze:"#5FB6D6" }[type] || "#888";
  }

  function battleRender() {
    if (!battle) return;
    var foeEl = document.getElementById("rpg-foe");
    var youEl = document.getElementById("rpg-you");
    var logEl = document.getElementById("rpg-battle-log");
    var actEl = document.getElementById("rpg-battle-actions");
    if (foeEl) foeEl.innerHTML = battleCardHTML(active("opp"), "opp");
    if (youEl) youEl.innerHTML = battleCardHTML(active("you"), "you");
    if (logEl) {
      logEl.innerHTML = battle.log.slice(-12).map(function (e) {
        return '<div class="e ' + e.cls + '">' + e.msg + '</div>';
      }).join("");
      logEl.scrollTop = logEl.scrollHeight;
    }
    if (actEl) actEl.innerHTML = actionsHTML();
    bindBattleEvents();
  }
  function actionsHTML() {
    if (battle.over) {
      return '<div class="rpg-txt-center" style="color:#cdd7ee;text-align:center;padding:8px;">战斗结束…</div>';
    }
    if (battle._switch) {
      var bench = battle.you.party.map(function (c, i) {
        if (i === battle.you.idx || c.fainted) return "";
        var ratio = Math.max(0, Math.min(1, c.hp / c.maxHp));
        var hpCls = ratio > 0.5 ? "good" : ratio > 0.2 ? "warn" : "bad";
        return '' +
          '<button class="rpg-bench-pk" data-bswitch="' + i + '">' +
            '<div class="bpk-spr"><img src="' + c.mon.sprite + '" alt="' + c.mon.name_zh + '"></div>' +
            '<div class="bpk-info">' +
              '<div class="bpk-name">' + c.mon.name_zh + ' <small>Lv.' + c.level + '</small></div>' +
              '<div class="bpk-hp"><span class="' + hpCls + '"></span></div>' +
              '<div class="bpk-hptxt">' + c.hp + '/' + c.maxHp + '</div>' +
            '</div>' +
          '</button>';
      }).join("");
      return '<div class="rpg-subrow"><button class="rpg-act ghost" data-bcancel="1">返回</button></div>' +
        '<div class="rpg-bench">' + bench + '</div>';
    }
    var canAct = battle.turn === "you" && !battle.busy;
    var att = active("you"), def = active("opp");
    var moves = att.moves.map(function (mv, i) {
      var mult = typeMult(mv.type, def.mon.types);
      var effCls = mult >= 2 ? "sup" : mult < 1 ? "weak" : "";
      var effTxt = mult >= 2 ? "克制" : mult === 0 ? "无效" : mult < 1 ? "被抵抗" : "";
      return '' +
        '<button class="rpg-move" data-bmove="' + i + '"' + (canAct ? "" : " disabled") + '>' +
          '<div class="mn"><span class="type-chip" style="background:' + (TYPE_COLOR[mv.type] || "#888") + '">' +
            (TYPE_ZH[mv.type] || mv.type) + '</span>' + mv.name + '</div>' +
          '<div class="md"><span>威力 ' + mv.power + '</span><span>' + (mv.cat === "phys" ? "物理" : "特殊") + '</span></div>' +
          (effTxt ? '<div class="eff ' + effCls + '">' + effTxt + '</div>' : "") +
        '</button>';
    }).join("");
    var sub = '<div class="rpg-subrow">' +
      (battle.wild ? '<button class="rpg-act catch" data-bcatch="1"' + (canAct ? "" : " disabled") + '>捕捉（🔘' + save.balls + '）</button>' : "") +
      '<button class="rpg-act ghost" data-bswitchopen="1"' + (canAct ? "" : " disabled") + '>换人</button>' +
      (battle.wild ? '<button class="rpg-act run" data-brun="1"' + (canAct ? "" : " disabled") + '>逃跑</button>' : "") +
      '</div>';
    return '<div class="rpg-moves">' + moves + '</div>' + sub;
  }
  function bindBattleEvents() {
    var root = document.getElementById("rpg-battle-actions");
    if (!root) return;
    var mv = root.querySelectorAll("[data-bmove]");
    for (var i = 0; i < mv.length; i++) (function (el) {
      el.addEventListener("click", function () { playerAct(+el.getAttribute("data-bmove")); });
    })(mv[i]);
    var cap = root.querySelector("[data-bcatch]"); if (cap) cap.addEventListener("click", doCapture);
    var sw = root.querySelector("[data-bswitchopen]"); if (sw) sw.addEventListener("click", function () { battle._switch = true; battleRender(); });
    var swb = root.querySelectorAll("[data-bswitch]"); for (var j = 0; j < swb.length; j++) (function (el) {
      el.addEventListener("click", function () { doSwitch(+el.getAttribute("data-bswitch")); });
    })(swb[j]);
    var cancel = root.querySelector("[data-bcancel]"); if (cancel) cancel.addEventListener("click", function () { battle._switch = false; battleRender(); });
    var run = root.querySelector("[data-brun]"); if (run) run.addEventListener("click", doRun);
  }
  function battleLog(cls, msg) { battle.log.push({ cls: cls, msg: msg }); if (battle.log.length > 40) battle.log.shift(); }

  function showBattle() { var el = document.getElementById("rpg-battle"); if (el) el.classList.remove("hidden"); }
  function hideBattle() { var el = document.getElementById("rpg-battle"); if (el) el.classList.add("hidden"); }

  /* ---------- 浮动伤害文字 ---------- */
  function spawnDmg(side, dmg, mult) {
    try {
      var spr = document.getElementById("rpg-" + side + "-sprite");
      var fx = document.getElementById("rpg-fx");
      if (!spr || !fx) return;
      var r = spr.getBoundingClientRect();
      var d = document.createElement("div");
      d.className = "rpg-dmg" + (mult >= 2 ? " sup" : mult < 1 ? " weak" : "");
      d.textContent = "-" + dmg;
      d.style.left = (r.left + r.width / 2 + (Math.random() * 20 - 10)) + "px";
      d.style.top = (r.top + r.height / 2 - 10) + "px";
      fx.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 1000);
      if (mult >= 2) {
        var t = document.createElement("div");
        t.className = "rpg-txt"; t.textContent = "效果拔群！";
        t.style.left = (r.left + r.width / 2) + "px"; t.style.top = (r.top + r.height / 2 + 14) + "px";
        fx.appendChild(t);
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1100);
      }
    } catch (e) {}
  }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById("rpg-toast");
    if (!el) return;
    el.textContent = msg; el.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 1800);
  }

  /* ---------- 队伍 HUD ---------- */
  function renderPartyHUD() {
    var wrap = document.getElementById("rpg-party");
    var ball = document.getElementById("rpg-ball");
    if (ball) ball.textContent = "🔘 " + save.balls;
    if (!wrap) return;
    wrap.innerHTML = save.party.map(function (m) {
      var mon = MON_BY_ID[m.id];
      var st = statLine(mon, m.level);
      var ratio = clamp(m.hp / st.hp, 0, 1);
      var expR = m.exp / expToNext(m.level);
      var dead = m.hp <= 0;
      return '' +
        '<div class="rpg-pm' + (dead ? " dead" : "") + '">' +
          '<div class="pm-spr"><img src="' + mon.sprite + '" alt="' + mon.name_zh + '" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
            '<div style="display:none;width:30px;height:30px;border-radius:50%;background:#e3534a;color:#fff;font-weight:800;align-items:center;justify-content:center;font-size:11px;">' + m.id + '</div></div>' +
          '<div class="pm-info">' +
            '<div class="pm-name">' + mon.name_zh + ' <small>Lv.' + m.level + '</small></div>' +
            '<div class="pm-hp"><i style="width:' + (ratio*100) + '%;background:' + hpColor(ratio) + '"></i></div>' +
            '<div class="pm-exp"><i style="width:' + (expR*100) + '%"></i></div>' +
          '</div>' +
        '</div>';
    }).join("");
  }

  /* ---------- 初始宝可梦选择 ---------- */
  var STARTERS = [1, 4, 7, 25, 133, 152];
  function showStarter() {
    var grid = document.getElementById("rpg-starter-grid");
    var modal = document.getElementById("rpg-starter");
    if (!grid || !modal) return;
    grid.innerHTML = STARTERS.map(function (id) {
      var mon = MON_BY_ID[id];
      return '' +
        '<div class="rpg-starter" data-starter="' + id + '">' +
          '<div class="st-spr"><img src="' + mon.sprite + '" alt="' + mon.name_zh + '" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
            '<div style="display:none;width:40px;height:40px;border-radius:50%;background:#e3534a;color:#fff;font-weight:800;align-items:center;justify-content:center;">' + id + '</div></div>' +
          '<div class="st-name">' + mon.name_zh + '</div>' +
          '<div class="st-types">' + typeChips(mon.types) + '</div>' +
        '</div>';
    }).join("");
    modal.classList.remove("hidden");
    var cells = grid.querySelectorAll("[data-starter]");
    for (var i = 0; i < cells.length; i++) (function (el) {
      el.addEventListener("click", function () { newGame(+el.getAttribute("data-starter")); });
    })(cells[i]);
  }
  function hideStarter() { var el = document.getElementById("rpg-starter"); if (el) el.classList.add("hidden"); }

  function newGame(starterId) {
    save = { party: [ makeMember(starterId, 5) ], balls: 10, defeated: {}, level: 0, maxLevel: 0, champion: false };
    player.starterId = starterId;
    hideStarter();
    saveGame();
    renderPartyHUD();
    showLevelSelect(); // 让玩家确认从哪一关开始（初始仅第 1 关可选）
  }

  /* ---------- 队伍详情弹窗 ---------- */
  function showPartyModal() {
    var wrap = document.getElementById("rpg-partydetail");
    var modal = document.getElementById("rpg-partymodal");
    if (!wrap || !modal) return;
    wrap.innerHTML = save.party.map(function (m) {
      var mon = MON_BY_ID[m.id];
      var st = statLine(mon, m.level);
      var ratio = clamp(m.hp / st.hp, 0, 1);
      return '' +
        '<div class="rpg-pd">' +
          '<div class="pd-spr"><img src="' + mon.sprite + '" alt="' + mon.name_zh + '"></div>' +
          '<div class="pd-info">' +
            '<div class="pd-name">' + mon.name_zh + ' <small>Lv.' + m.level + '</small></div>' +
            '<div class="pd-row"><span>HP</span><b>' + m.hp + '/' + st.hp + '</b></div>' +
            '<div class="pd-row"><span>攻 / 防</span><b>' + st.attack + ' / ' + st.defense + '</b></div>' +
            '<div class="pd-row"><span>特攻 / 特防</span><b>' + st.sp_attack + ' / ' + st.sp_defense + '</b></div>' +
            '<div class="pd-row"><span>速度</span><b>' + st.speed + '</b></div>' +
            '<div class="pd-row"><span>经验</span><b>' + m.exp + ' / ' + expToNext(m.level) + '</b></div>' +
          '</div>' +
        '</div>';
    }).join("");
    modal.classList.remove("hidden");
  }
  function hidePartyModal() { var el = document.getElementById("rpg-partymodal"); if (el) el.classList.add("hidden"); }

  /* ---------- 关卡 UI ---------- */
  function renderLevelInfo() {
    var el = document.getElementById("rpg-levelinfo");
    if (!el || !save) return;
    var idx = save.level;
    var cfg = LEVELS[idx];
    var total = TRAINERS.length, done = 0;
    for (var i = 0; i < total; i++) if (save.defeated[TRAINERS[i].id]) done++;
    el.innerHTML =
      '<div class="rpg-li-name">关卡 ' + (idx + 1) + ' / ' + LEVELS.length + ' · ' + cfg.name + '</div>' +
      '<div class="rpg-li-prog">训练家 ' + done + ' / ' + total +
        (levelCleared() ? ' · <span class="open">传送门已开启 ✦</span>' : '') + '</div>';
  }
  function showLevelIntro(cfg) {
    var modal = document.getElementById("rpg-levelintro");
    var name = document.getElementById("rpg-li-name");
    var intro = document.getElementById("rpg-li-intro");
    var go = document.getElementById("rpg-li-go");
    if (!modal || !name || !intro || !go) return;
    name.textContent = "第 " + (LEVELS.indexOf(cfg) + 1) + " 关 · " + cfg.name;
    intro.textContent = cfg.intro;
    modal.classList.remove("hidden");
    go.onclick = function () { modal.classList.add("hidden"); };
  }
  function showVictory() {
    var modal = document.getElementById("rpg-victory");
    if (!modal) return;
    modal.classList.remove("hidden");
    var again = document.getElementById("rpg-victory-again");
    var hub = document.getElementById("rpg-victory-hub");
    if (again) again.onclick = function () { modal.classList.add("hidden"); };
    if (hub) hub.onclick = function () { location.href = "index.html"; };
  }
  function showLevelSelect() {
    var modal = document.getElementById("rpg-levelselect");
    var grid = document.getElementById("rpg-level-grid");
    if (!modal || !grid) return;
    var maxUnlocked = save.maxLevel || 0;
    grid.innerHTML = LEVELS.map(function (cfg, idx) {
      var locked = idx > maxUnlocked;
      var tag = idx < save.level ? "已通过" : (idx === save.level ? "当前" : "可挑战");
      var stars = "★".repeat(Math.min(5, idx + 1));
      return '' +
        '<div class="rpg-lvcard' + (locked ? " locked" : "") + (idx === save.level ? " current" : "") + '" data-lv="' + idx + '">' +
          '<div class="rpg-lv-no">' + (idx + 1) + '</div>' +
          '<div class="rpg-lv-name">' + cfg.name + '</div>' +
          '<div class="rpg-lv-diff">' + stars + '</div>' +
          '<div class="rpg-lv-lock">' + (locked ? "🔒 未解锁" : tag) + '</div>' +
        '</div>';
    }).join("");
    modal.classList.remove("hidden");
    var cells = grid.querySelectorAll("[data-lv]");
    for (var i = 0; i < cells.length; i++) (function (el) {
      el.addEventListener("click", function () {
        var idx = +el.getAttribute("data-lv");
        if (idx > (save.maxLevel || 0)) { toast("该关卡尚未解锁！"); return; }
        enterLevel(idx);
      });
    })(cells[i]);
  }
  function hideLevelSelect() { var el = document.getElementById("rpg-levelselect"); if (el) el.classList.add("hidden"); }
  function enterLevel(idx) {
    save.level = idx;
    if (idx > (save.maxLevel || 0)) save.maxLevel = idx;
    healParty();
    loadLevel(idx, true);
    saveGame();
    hideLevelSelect();
    toast("进入第 " + (idx + 1) + " 关：" + LEVELS[idx].name);
    renderLevelInfo();
  }
  function grantLevelReward(idx) {
    var rw = LEVEL_REWARDS[idx];
    if (!rw) return null;
    var parts = [];
    if (rw.balls) { save.balls += rw.balls; parts.push("🔘 " + rw.balls + " 个精灵球"); }
    if (rw.mon) {
      var mon = MON_BY_ID[rw.mon];
      if (save.party.length < 6) {
        var lvl = rw.monLevel || Math.max(5, Math.round((LEVELS[idx].wild[0] + LEVELS[idx].wild[1]) / 2));
        save.party.push(makeMember(rw.mon, lvl));
        parts.push("⭐ " + mon.name_zh + "（Lv." + lvl + "）");
      } else {
        save.balls += 3;
        parts.push("⭐ " + mon.name_zh + "（队伍已满，转为 🔘 3 个精灵球）");
      }
    }
    return parts;
  }
  function showLevelReward(idx, onOk) {
    var parts = grantLevelReward(idx);
    if (!parts || !parts.length) { if (onOk) onOk(); return; }
    saveGame();
    var modal = document.getElementById("rpg-reward");
    var title = document.getElementById("rpg-reward-title");
    var body = document.getElementById("rpg-reward-body");
    var ok = document.getElementById("rpg-reward-ok");
    if (!modal || !title || !body || !ok) { if (onOk) onOk(); return; }
    title.textContent = "🎉 通关 第 " + (idx + 1) + " 关 · " + LEVELS[idx].name;
    body.innerHTML = parts.map(function (p) { return '<div class="rpg-reward-item">' + p + '</div>'; }).join("");
    modal.classList.remove("hidden");
    ok.onclick = function () { modal.classList.add("hidden"); if (onOk) onOk(); };
  }

  function advanceLevel() {
    if (save.level >= LEVELS.length - 1) { showVictory(); return; }
    var cleared = save.level;
    save.level++;
    if (save.level > (save.maxLevel || 0)) save.maxLevel = save.level;
    healParty();
    loadLevel(save.level, false); // 先布置新关，稍后弹奖励与介绍
    saveGame();
    showLevelReward(cleared, function () { showLevelIntro(LEVELS[save.level]); });
  }

  /* ---------- 启动 ---------- */
  function init() {
    canvas = document.getElementById("rpg-map");
    if (canvas) ctx = canvas.getContext("2d");

    var loaded = loadGame();
    if (loaded) {
      save = loaded;
      // 修正可能的字段缺失
      save.party.forEach(function (m) {
        if (m.status === undefined) m.status = null;
        if (!m.moves || m.moves.length === 0) {
          var mon = MON_BY_ID[m.id];
          m.moves = getLearnset(mon).filter(function (mv) { return mv.level <= m.level; });
        }
      });
      if (typeof save.balls !== "number") save.balls = 10;
      if (!save.defeated) save.defeated = {};
      if (typeof save.level !== "number") save.level = 0;
      if (typeof save.maxLevel !== "number") save.maxLevel = save.level;
      if (typeof save.champion !== "boolean") save.champion = false;
      player.starterId = save.party[0].id;
      loadLevel(save.level, false);
      renderPartyHUD();
    } else {
      loadLevel(0, false);
    }

    // 键盘
    window.addEventListener("keydown", function (e) {
      if (!save || inBattle) return;
      var k = e.key.toLowerCase();
      if (["arrowup","arrowdown","arrowleft","arrowright"," "].indexOf(e.key.toLowerCase()) >= 0) e.preventDefault();
      if (k === "arrowup" || k === "w") tryMove(0, -1);
      else if (k === "arrowdown" || k === "s") tryMove(0, 1);
      else if (k === "arrowleft" || k === "a") tryMove(-1, 0);
      else if (k === "arrowright" || k === "d") tryMove(1, 0);
    });

    // D-pad
    var dbtns = document.querySelectorAll(".rpg-dbtn");
    for (var i = 0; i < dbtns.length; i++) (function (el) {
      el.addEventListener("click", function () {
        var d = el.getAttribute("data-dir");
        if (d === "up") tryMove(0, -1);
        else if (d === "down") tryMove(0, 1);
        else if (d === "left") tryMove(-1, 0);
        else if (d === "right") tryMove(1, 0);
      });
    })(dbtns[i]);

    // 顶部按钮
    var menu = document.getElementById("rpg-menu"); if (menu) menu.addEventListener("click", showPartyModal);
    var lselBtn = document.getElementById("rpg-levelselect-btn"); if (lselBtn) lselBtn.addEventListener("click", showLevelSelect);
    var lselClose = document.getElementById("rpg-levelselect-close"); if (lselClose) lselClose.addEventListener("click", hideLevelSelect);
    var pmc = document.getElementById("rpg-partymodal-close"); if (pmc) pmc.addEventListener("click", hidePartyModal);
    var hub = document.getElementById("rpg-hub"); if (hub) hub.addEventListener("click", function () { location.href = "index.html"; });
    var reset = document.getElementById("rpg-reset"); if (reset) reset.addEventListener("click", function () {
      if (confirm("确定要重置存档吗？当前队伍与进度都会清空。")) {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
        save = null; inBattle = false; hideBattle(); hidePartyModal();
        showStarter();
      }
    });

    bindZoomControls();
    bindPinchZoom();
    updateZoomUI();

    if (!save) showStarter();
    requestAnimationFrame(loop);
  }

  if (typeof document !== "undefined" && document.getElementById) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
