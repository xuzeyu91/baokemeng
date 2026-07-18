/* 宝可梦 RPG 冒险 — 对标初代红蓝节奏
 * 地图探索 / 捕捉 / 对战 / 升级 / 徽章 / 金钱商店
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

  /* ---------- 红蓝版进度：徽章 / 金钱 / 道具 ---------- */
  var BADGE_ORDER = [
    { id: "boulder",  name: "灰色徽章", gym: "小刚",   city: "深灰市" },
    { id: "cascade",  name: "蓝色徽章", gym: "小霞",   city: "华蓝市" },
    { id: "thunder",  name: "橙色徽章", gym: "马志士", city: "枯叶市" },
    { id: "rainbow",  name: "彩虹徽章", gym: "莉佳",   city: "金黄市" },
    { id: "soul",     name: "粉红徽章", gym: "阿桔",   city: "浅红市" },
    { id: "marsh",    name: "金色徽章", gym: "娜姿",   city: "金黄市" },
    { id: "volcano",  name: "深红徽章", gym: "夏伯",   city: "红莲镇" },
    { id: "earth",    name: "绿色徽章", gym: "坂木",   city: "常磐市" }
  ];
  var ITEM_CATALOG = {
    potion:       { name: "伤药",     icon: "🧪", heal: 20,  full: false, price: 300,  battle: true,  field: true },
    super:        { name: "好伤药",   icon: "💊", heal: 50,  full: false, price: 700,  battle: true,  field: true },
    hyper:        { name: "厉害伤药", icon: "💉", heal: 200, full: false, price: 1200, battle: true,  field: true },
    full:         { name: "全复药",   icon: "✨", heal: 9999, full: true, price: 2500, battle: true, field: true },
    antidote:     { name: "解毒药",   icon: "🟢", heal: 0, cure: "poison",     price: 100, battle: true, field: true },
    awaken:       { name: "解眠药",   icon: "💤", heal: 0, cure: "sleep",      price: 250, battle: true, field: true },
    burnheal:     { name: "灼伤药",   icon: "🔥", heal: 0, cure: "burn",       price: 250, battle: true, field: true },
    paralyzeheal: { name: "解麻药",   icon: "⚡", heal: 0, cure: "paralysis",  price: 200, battle: true, field: true },
    iceheal:      { name: "解冻药",   icon: "❄️", heal: 0, cure: "freeze",     price: 250, battle: true, field: true },
    ball:         { name: "精灵球",   icon: "🔘", ball: true, price: 200, battle: false, field: false },
    greatball:    { name: "超级球",   icon: "🔷", ball: true, ballMult: 1.5, price: 600, battle: false, field: false },
    ultraball:    { name: "高级球",   icon: "🟡", ball: true, ballMult: 2,   price: 1200, battle: false, field: false }
  };
  function badgeCount(s) {
    if (!s || !s.badges) return 0;
    var n = 0;
    for (var i = 0; i < BADGE_ORDER.length; i++) if (s.badges[BADGE_ORDER[i].id]) n++;
    return n;
  }
  function ensureItems(s) {
    if (!s.items || typeof s.items !== "object") s.items = {};
    ["potion", "super", "hyper", "full", "antidote", "awaken", "burnheal", "paralyzeheal", "iceheal", "greatball", "ultraball"].forEach(function (k) {
      if (s.items[k] == null) s.items[k] = 0;
    });
    return s.items;
  }
  function ensureMovePP(mv) {
    if (!mv) return mv;
    if (mv.maxPp == null) {
      var md = mv.slug && window.MOVE_DB ? window.MOVE_DB[mv.slug] : null;
      mv.maxPp = (md && md.pp) ? md.pp : (mv.power >= 100 ? 5 : mv.power >= 70 ? 10 : 15);
    }
    if (mv.pp == null) mv.pp = mv.maxPp;
    if (mv.acc == null) {
      var md2 = mv.slug && window.MOVE_DB ? window.MOVE_DB[mv.slug] : null;
      mv.acc = (md2 && md2.acc != null) ? md2.acc : 100;
    }
    return mv;
  }
  function normalizeSave(s) {
    if (!s) return s;
    if (s.money == null || isNaN(s.money)) s.money = 3000;
    if (!s.badges || typeof s.badges !== "object") s.badges = {};
    if (!s.defeated || typeof s.defeated !== "object") s.defeated = {};
    if (!s.npcDone || typeof s.npcDone !== "object") s.npcDone = {};
    if (!s.claimedRewards || typeof s.claimedRewards !== "object") s.claimedRewards = {};
    if (s.balls == null) s.balls = 10;
    if (s.level == null) s.level = 0;
    if (s.maxUnlocked == null) s.maxUnlocked = s.level || 0;
    if (s.maxLevel == null) s.maxLevel = s.maxUnlocked || 0;
    // 图鉴统一走 save.dex；兼容旧档把 seen/caught 写在根上的情况
    if (!s.dex || typeof s.dex !== "object") s.dex = { seen: {}, caught: {} };
    if (!s.dex.seen || typeof s.dex.seen !== "object") s.dex.seen = {};
    if (!s.dex.caught || typeof s.dex.caught !== "object") s.dex.caught = {};
    if (s.seen && typeof s.seen === "object") {
      Object.keys(s.seen).forEach(function (k) { if (s.seen[k]) s.dex.seen[k] = true; });
    }
    if (s.caught && typeof s.caught === "object") {
      Object.keys(s.caught).forEach(function (k) { if (s.caught[k]) s.dex.caught[k] = true; });
    }
    if (!s.seen) s.seen = s.dex.seen;
    if (!s.caught) s.caught = s.dex.caught;
    if (!s.tm || typeof s.tm !== "object") s.tm = {};
    if (s.champion == null) s.champion = false;
    if (s.finalRewardClaimed == null) s.finalRewardClaimed = !!s.champion;
    ensureItems(s);
    if (!Array.isArray(s.party)) s.party = [];
    s.party.forEach(function (m) {
      if (!m) return;
      if (m.exp == null) m.exp = 0;
      if (m.status === undefined) m.status = null;
      if (m.moves) m.moves.forEach(function (mv) { ensureMovePP(mv); });
    });
    return s;
  }
  function defaultShopStock() {
    return [
      { id: "ball", price: 200 },
      { id: "greatball", price: 600 },
      { id: "potion", price: 300 },
      { id: "super", price: 700 },
      { id: "antidote", price: 100 },
      { id: "paralyzeheal", price: 200 },
      { id: "burnheal", price: 250 },
      { id: "awaken", price: 250 }
    ];
  }


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
  // 技能学习表（原模板，仅在无真实招式数据时兜底）
  function templateLearnset(mon) {
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

  // 技能学习表：优先真实招式池（MON_MOVES / MOVE_DB），按等级槽分布解锁
  // 注：RPG 战斗只结算 伤害 + 异常状态，纯变化招(强化/削弱/回复/控场)暂跳过。
  function getLearnset(mon) {
    var slugs = (window.MON_MOVES && window.MON_MOVES[mon.id]) || [];
    if (slugs && slugs.length) {
      var cands = [];
      slugs.forEach(function (s) {
        var md = (window.MOVE_DB || {})[s];
        if (!md) return;
        if (md.cat === "status" && md.kind !== "status") return; // 跳过变化招
        var m = {
          name: md.zh || s.replace(/-/g, " "),
          type: md.type,
          power: md.kind === "damage" ? (md.power || 0) : 0,
          cat: md.cat === "physical" ? "phys" : (md.cat === "special" ? "spec" : (md.cat === "status" ? "status" : md.cat)),
          cost: 0,
          slug: s,
          kind: md.kind,
          acc: md.acc != null ? md.acc : 100,
          maxPp: md.pp || 15,
          pp: md.pp || 15
        };
        if (md.kind === "status") { m.status = md.effect; m.statusChance = (md.chance || 0) / 100; }
        else if (md.effect && md.chance) { m.status = md.effect; m.statusChance = (md.chance || 0) / 100; }
        cands.push(m);
      });
      if (cands.length >= 2) {
        // 优先本系、优先高威力，保证有 STAB 输出
        cands.sort(function (a, b) {
          var sa = mon.types.indexOf(a.type) >= 0 ? 1 : 0;
          var sb = mon.types.indexOf(b.type) >= 0 ? 1 : 0;
          if (sa !== sb) return sb - sa;
          return (b.power || 0) - (a.power || 0);
        });
        var levels = [1, 1, 8, 16, 28, 40];
        var out = [], used = {};
        for (var i = 0; i < cands.length && out.length < 6; i++) {
          var m = cands[i];
          var key = m.name + "|" + m.type;
          if (used[key]) continue;
          used[key] = true;
          m.level = levels[out.length];
          out.push(m);
        }
        if (out.length >= 2) return out;
      }
    }
    return templateLearnset(mon);
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
    var mon = MON_BY_ID[member.id];
    if (!member.moves || member.moves.length === 0) {
      member.moves = getLearnset(mon).filter(function (m) { return m.level <= member.level; });
    } else if (member.moves[0] && (!member.moves[0].name || !member.moves[0].slug)) {
      // 修复被旧版 capture 损坏的存档：之前只保存了 id/pp/maxPp，缺失 name/type/slug 等关键字段
      member.moves = getLearnset(mon).filter(function (m) { return m.level <= member.level; });
    }
    member.moves.forEach(function (mv) { ensureMovePP(mv); });
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
    var s = oppMember.mon || MON_BY_ID[oppMember.id] || (oppMember.member && MON_BY_ID[oppMember.member.id]);
    var level = oppMember.level || (oppMember.member && oppMember.member.level) || 1;
    if (!s) return Math.floor(10 + level * 3);
    var sum = s.hp + s.attack + s.defense + s.sp_attack + s.sp_defense + s.speed;
    return Math.floor(10 + level * 3 + sum / 30);
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

  /* ---------- 生物群系调色板（地图主题） ---------- */
  var BIOMES = {
    grassland: { ground:"#bfe09a", grass1:"#9bd36a", grass2:"#5fae3c", tree:"#2f7d3a", treeDk:"#1d5a28", water:"#3f7fd0", rock:"#9a8c6a", accent:"#27632f", treeProb:0.05, rockProb:0.02 },
    wetland:   { ground:"#a9d8b0", grass1:"#86c98f", grass2:"#4f9c5e", tree:"#2f7d3a", treeDk:"#1d5a28", water:"#3f7fd0", rock:"#8d9b6a", accent:"#1e6b54", treeProb:0.06, rockProb:0.02 },
    mountain:  { ground:"#cabfa0", grass1:"#b3a584", grass2:"#8a7f63", tree:"#6f8a55", treeDk:"#4d663c", water:"#5a97e0", rock:"#8a7f63", accent:"#6b5d3f", treeProb:0.02, rockProb:0.10 },
    forest:    { ground:"#9fce7a", grass1:"#7bb257", grass2:"#4e8a36", tree:"#1f5e2a", treeDk:"#123d1a", water:"#3f7fd0", rock:"#6a5d3f", accent:"#1d4d24", treeProb:0.11, rockProb:0.03 },
    champion:  { ground:"#cdb8e8", grass1:"#b79ad9", grass2:"#8f6fc4", tree:"#5b34b0", treeDk:"#3a2170", water:"#6a5fd0", rock:"#8a7fb0", accent:"#5b34b0", treeProb:0.04, rockProb:0.05 }
  };
  var LEVEL_BIOME = [
    "grassland", "mountain", "wetland", "grassland", "forest",
    "wetland", "forest", "mountain", "mountain", "champion"
  ];
  // 每关起点/终点（随关变化，增加辨识度）
    var LEVEL_POS = [
    { start: [14, 17], goal: [27, 2] },
    { start: [2, 17],  goal: [27, 17] },
    { start: [14, 2],  goal: [14, 17] },
    { start: [2, 2],   goal: [27, 17] },
    { start: [14, 17], goal: [27, 2] },
    { start: [2, 10],  goal: [27, 10] },
    { start: [14, 17], goal: [27, 2] },
    { start: [2, 2],   goal: [27, 17] },
    { start: [14, 2],  goal: [14, 17] },
    { start: [14, 17], goal: [27, 2] }
  ];
  // 地图氛围（昼夜/雾）：叠在地形之上的半透明色调，营造每关的氛围差异
  var ATMOS = {
    day:   { tint: null,                                     battleBg: null },
    mist:  { tint: "rgba(120,175,205,0.16)",                battleBg: "linear-gradient(160deg,#2a4a63,#16314a)" },
    dusk:  { tint: "rgba(255,150,70,0.16)",                 battleBg: "linear-gradient(160deg,#5a3a2a,#2e2030)" },
    fog:   { tint: "rgba(150,165,150,0.30)",                battleBg: "linear-gradient(160deg,#2f3a33,#1a2420)" },
    night: { tint: "rgba(18,28,68,0.44)",                   battleBg: "linear-gradient(160deg,#1a2148,#0c1030)" }
  };

  /* ---------- 关卡系统（多关卡，由易到难） ---------- */
  var LEVELS = [
    {
      name: "真新镇 · 1 号道路",
      intro: "红蓝旅程从真新镇启程。领取补给，在 1 号道路熟悉遇敌与治疗。",
      atmos: "day",
      wild: [2, 5], wildMaxBst: 320, wildTypes: ["normal", "flying", "bug", "grass", "poison"],
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: null, grassProb: 0.18,
      trainers: [
        { id: "r1-boy", name: "短裤小子·小刚", x: 10, y: 10, money: 200,
          party: [ { id: 16, level: 3 }, { id: 19, level: 4 } ] },
        { id: "r1-girl", name: "短裤姑娘·美美", x: 20, y: 8, money: 220,
          party: [ { id: 13, level: 4 }, { id: 10, level: 4 } ] }
      ],
      npcs: [
        { id: "oak-lab", name: "大木博士", x: 8, y: 15, color: "#5aa9e0", once: true, gift: "potion", giftCount: 3,
          lines: ["欢迎来到关都地区！", "这是给你的伤药，草丛里小心野生宝可梦。", "击败训练家后，紫色传送门就会开启。"] },
        { id: "route-shop", name: "旅行商人", x: 18, y: 15, color: "#e0a050", once: false, shop: true,
          lines: ["我这里有补给品，要看看吗？"] }
      ]
    },
    {
      name: "深灰市道馆 · 小刚",
      intro: "深灰市道馆馆主小刚使用岩石系。击败馆主可获得灰色徽章与奖金。",
      atmos: "dusk",
      wild: [5, 10], wildMaxBst: 360, wildTypes: ["rock", "ground", "normal", "fighting"],
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: null, grassProb: 0.14,
      trainers: [
        { id: "pew-camper", name: "露营少年", x: 8, y: 12, money: 300,
          party: [ { id: 74, level: 9 }, { id: 27, level: 10 } ] },
        { id: "gym-brock", name: "道馆馆主·小刚", x: 22, y: 6, money: 1200, badge: "boulder",
          party: [ { id: 74, level: 12 }, { id: 95, level: 14 } ] }
      ],
      npcs: [
        { id: "pew-shop", name: "友好商店店员", x: 6, y: 16, color: "#e0a050", once: false, shop: true,
          lines: ["欢迎光临友好商店！", "需要伤药还是精灵球？"] },
        { id: "pew-guide", name: "道馆向导", x: 16, y: 16, color: "#8a8a8a", once: false,
          lines: ["小刚的宝可梦很硬，用草系或水系会轻松些。"] }
      ]
    },
    {
      name: "华蓝市道馆 · 小霞",
      intro: "华蓝市水道馆。小霞使用水系，注意雷电与草系克制。",
      atmos: "mist", ambientWeather: "rain",
      wild: [8, 14], wildMaxBst: 380, wildTypes: ["water", "normal", "flying", "psychic"],
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: { x: 10, y: 6, w: 9, h: 4 }, grassProb: 0.16,
      trainers: [
        { id: "cer-swimmer", name: "泳裤小子", x: 10, y: 12, money: 400,
          party: [ { id: 60, level: 14 }, { id: 118, level: 15 } ] },
        { id: "rival-2", name: "劲敌·青绿", x: 18, y: 8, money: 800, rival: true,
          party: [ { id: 16, level: 15 }, { id: 19, level: 14 }, { id: 1, level: 16 } ] },
        { id: "gym-misty", name: "道馆馆主·小霞", x: 24, y: 5, money: 1600, badge: "cascade",
          party: [ { id: 120, level: 18 }, { id: 121, level: 21 } ] }
      ],
      npcs: [
        { id: "cer-shop", name: "友好商店店员", x: 5, y: 16, color: "#e0a050", once: false, shop: true,
          lines: ["华蓝市特供好伤药，要看看吗？"],
          shopStock: [
            { id: "ball", price: 200 }, { id: "greatball", price: 600 },
            { id: "potion", price: 300 }, { id: "super", price: 700 },
            { id: "antidote", price: 100 }, { id: "awaken", price: 250 }
          ] }
      ]
    },
    {
      name: "枯叶市道馆 · 马志士",
      intro: "枯叶市电系道馆。马志士的雷电很快，地面系会很有用。",
      atmos: "day",
      wild: [12, 18], wildMaxBst: 400, wildTypes: ["electric", "normal", "flying", "ground"],
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: null, grassProb: 0.15,
      trainers: [
        { id: "ver-sailor", name: "水手", x: 9, y: 11, money: 500,
          party: [ { id: 81, level: 18 }, { id: 100, level: 19 } ] },
        { id: "gym-surge", name: "道馆馆主·马志士", x: 23, y: 5, money: 2000, badge: "thunder",
          party: [ { id: 100, level: 21 }, { id: 25, level: 24 }, { id: 26, level: 24 } ] }
      ],
      npcs: [
        { id: "ver-shop", name: "友好商店店员", x: 6, y: 16, color: "#e0a050", once: false, shop: true,
          lines: ["超级球到货了！捕捉率更高。"],
          shopStock: [
            { id: "ball", price: 200 }, { id: "greatball", price: 600 }, { id: "ultraball", price: 1200 },
            { id: "potion", price: 300 }, { id: "super", price: 700 }, { id: "hyper", price: 1200 },
            { id: "paralyzeheal", price: 200 }
          ] },
        { id: "ver-hint", name: "工程师", x: 16, y: 15, color: "#c08a3e", once: true, gift: "paralyzeheal", giftCount: 3,
          lines: ["给你一些解麻药，电系很容易麻痹对手。"] }
      ]
    },
    {
      name: "金黄市道馆 · 莉佳",
      intro: "金黄市草系道馆。莉佳的花草很棘手，火系与飞行系是关键。",
      atmos: "day",
      wild: [16, 22], wildMaxBst: 420, wildTypes: ["grass", "poison", "bug", "normal", "psychic"],
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: null, grassProb: 0.18,
      trainers: [
        { id: "cel-lass", name: "迷你裙", x: 8, y: 10, money: 600,
          party: [ { id: 43, level: 22 }, { id: 69, level: 23 } ] },
        { id: "rival-3", name: "劲敌·青绿", x: 16, y: 8, money: 1000, rival: true,
          party: [ { id: 17, level: 24 }, { id: 58, level: 24 }, { id: 2, level: 26 } ] },
        { id: "gym-erika", name: "道馆馆主·莉佳", x: 24, y: 5, money: 2400, badge: "rainbow",
          party: [ { id: 71, level: 26 }, { id: 114, level: 28 }, { id: 45, level: 29 } ] }
      ],
      npcs: [
        { id: "cel-shop", name: "友好商店店员", x: 5, y: 16, color: "#e0a050", once: false, shop: true,
          lines: ["金黄百货应有尽有！"],
          shopStock: [
            { id: "ball", price: 200 }, { id: "greatball", price: 600 }, { id: "ultraball", price: 1200 },
            { id: "potion", price: 300 }, { id: "super", price: 700 }, { id: "hyper", price: 1200 },
            { id: "full", price: 2500 }, { id: "antidote", price: 100 }, { id: "burnheal", price: 250 },
            { id: "paralyzeheal", price: 200 }, { id: "awaken", price: 250 }, { id: "iceheal", price: 250 }
          ] }
      ]
    },
    {
      name: "浅红市道馆 · 阿桔",
      intro: "浅红市毒系道馆。阿桔擅长异常状态，记得多带解毒药。",
      atmos: "fog",
      wild: [20, 26], wildMaxBst: 440, wildTypes: ["poison", "bug", "normal", "ground", "water"],
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: null, grassProb: 0.17,
      trainers: [
        { id: "fuch-ninja", name: "忍者少年", x: 10, y: 11, money: 700,
          party: [ { id: 23, level: 27 }, { id: 48, level: 28 } ] },
        { id: "gym-koga", name: "道馆馆主·阿桔", x: 23, y: 5, money: 2800, badge: "soul",
          party: [ { id: 109, level: 30 }, { id: 89, level: 32 }, { id: 110, level: 33 } ] }
      ],
      npcs: [
        { id: "fuch-shop", name: "友好商店店员", x: 6, y: 16, color: "#e0a050", once: false, shop: true,
          lines: ["解毒药要多备一点。"] },
        { id: "fuch-warden", name: "狩猎区管理员", x: 18, y: 15, color: "#5fae8c", once: true, gift: "full", giftCount: 1,
          lines: ["这瓶全复药给你，挑战道馆前用吧。"] }
      ]
    },
    {
      name: "金黄市道馆 · 娜姿",
      intro: "金黄市超能道馆。娜姿的精神力很强，用更快的速度压制吧。",
      atmos: "mist",
      wild: [24, 30], wildMaxBst: 460, wildTypes: ["psychic", "fighting", "normal", "ghost"],
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: null, grassProb: 0.15,
      trainers: [
        { id: "saf-psychic", name: "超能力者", x: 9, y: 10, money: 800,
          party: [ { id: 63, level: 31 }, { id: 96, level: 32 } ] },
        { id: "gym-sabrina", name: "道馆馆主·娜姿", x: 23, y: 5, money: 3200, badge: "marsh",
          party: [ { id: 64, level: 34 }, { id: 122, level: 35 }, { id: 65, level: 37 } ] }
      ],
      npcs: [
        { id: "saf-shop", name: "友好商店店员", x: 6, y: 16, color: "#e0a050", once: false, shop: true,
          lines: ["挑战馆主前，先把背包补满。"] }
      ]
    },
    {
      name: "红莲镇道馆 · 夏伯",
      intro: "红莲镇火系道馆。夏伯的火焰很猛，水系与岩石系是关键。",
      atmos: "dusk", ambientWeather: "sunny",
      wild: [28, 34], wildMaxBst: 480, wildTypes: ["fire", "rock", "ground", "normal"],
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: null, grassProb: 0.14,
      trainers: [
        { id: "cin-burglar", name: "窃贼", x: 10, y: 11, money: 900,
          party: [ { id: 58, level: 34 }, { id: 77, level: 35 } ] },
        { id: "gym-blaine", name: "道馆馆主·夏伯", x: 23, y: 5, money: 3600, badge: "volcano",
          party: [ { id: 78, level: 38 }, { id: 59, level: 40 }, { id: 126, level: 42 } ] }
      ],
      npcs: [
        { id: "cin-shop", name: "友好商店店员", x: 6, y: 16, color: "#e0a050", once: false, shop: true,
          lines: ["红莲镇货少价高，见谅。"],
          shopStock: [
            { id: "greatball", price: 700 }, { id: "ultraball", price: 1400 },
            { id: "super", price: 800 }, { id: "hyper", price: 1400 }, { id: "full", price: 2800 },
            { id: "burnheal", price: 300 }, { id: "iceheal", price: 300 }
          ] }
      ]
    },
    {
      name: "常磐市道馆 · 坂木",
      intro: "常磐市道馆由火箭队坂木镇守。这是第八枚徽章，也是前往石英高原的门票。",
      atmos: "night",
      wild: [32, 38], wildMaxBst: 500, allowEvolved: true, wildTypes: ["ground", "poison", "normal", "rock", "fighting"],
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: null, grassProb: 0.14,
      trainers: [
        { id: "vir-rocket", name: "火箭队杂兵", x: 8, y: 12, money: 1000,
          party: [ { id: 24, level: 38 }, { id: 42, level: 39 } ] },
        { id: "rival-4", name: "劲敌·青绿", x: 16, y: 8, money: 1500, rival: true,
          party: [ { id: 18, level: 40 }, { id: 59, level: 40 }, { id: 130, level: 41 }, { id: 3, level: 42 } ] },
        { id: "gym-giovanni", name: "道馆馆主·坂木", x: 24, y: 5, money: 4500, badge: "earth",
          party: [ { id: 51, level: 42 }, { id: 31, level: 44 }, { id: 34, level: 45 }, { id: 112, level: 47 } ] }
      ],
      npcs: [
        { id: "vir-shop", name: "友好商店店员", x: 5, y: 16, color: "#e0a050", once: false, shop: true,
          lines: ["集齐 8 枚徽章后，就可以挑战石英高原了。"] }
      ]
    },
    {
      name: "石英高原 · 冠军之路",
      intro: "四天王与冠军等待着你。这是红蓝版的最终试炼。",
      atmos: "night",
      wild: [36, 45], allowEvolved: true, wildMaxBst: 540,
      center: [2, 2], start: [14, 17], goal: [27, 2], pond: { x: 11, y: 7, w: 8, h: 3 }, grassProb: 0.12,
      trainers: [
        { id: "e4-lorelei", name: "四天王·科拿", x: 8, y: 14, money: 2000,
          party: [ { id: 87, level: 48 }, { id: 91, level: 49 }, { id: 124, level: 50 }, { id: 131, level: 51 } ] },
        { id: "e4-bruno", name: "四天王·希巴", x: 20, y: 12, money: 2200,
          party: [ { id: 95, level: 49 }, { id: 107, level: 50 }, { id: 106, level: 50 }, { id: 68, level: 52 } ] },
        { id: "e4-agatha", name: "四天王·菊子", x: 10, y: 8, money: 2400,
          party: [ { id: 94, level: 51 }, { id: 42, level: 51 }, { id: 93, level: 52 }, { id: 24, level: 53 } ] },
        { id: "e4-lance", name: "四天王·阿渡", x: 22, y: 6, money: 2800,
          party: [ { id: 130, level: 53 }, { id: 148, level: 54 }, { id: 149, level: 55 }, { id: 142, level: 55 } ] },
        { id: "champ-rival", name: "冠军·青绿", x: 15, y: 3, money: 5000, rival: true, champion: true,
          party: [ { id: 18, level: 56 }, { id: 65, level: 56 }, { id: 112, level: 56 }, { id: 103, level: 58 }, { id: 59, level: 58 }, { id: 9, level: 60 } ],
          stages: [
            [ { id: 18, level: 56 }, { id: 65, level: 56 }, { id: 112, level: 56 } ],
            [ { id: 103, level: 58 }, { id: 59, level: 58 }, { id: 130, level: 58 } ],
            [ { id: 9, level: 60 }, { id: 6, level: 60 }, { id: 3, level: 60 } ]
          ] }
      ],
      npcs: [
        { id: "e4-clerk", name: "联盟职员", x: 5, y: 16, color: "#9b7ede", once: false,
          lines: ["进入联盟前请确认队伍状态。", "宝可梦中心就在附近。"] },
        { id: "e4-shop", name: "补给员", x: 25, y: 16, color: "#e0a050", once: false, shop: true,
          lines: ["最后补给机会了。"],
          shopStock: [
            { id: "ultraball", price: 1200 }, { id: "hyper", price: 1200 }, { id: "full", price: 2500 },
            { id: "antidote", price: 100 }, { id: "burnheal", price: 250 }, { id: "paralyzeheal", price: 200 },
            { id: "awaken", price: 250 }, { id: "iceheal", price: 250 }
          ] }
      ]
    }
  ];

  // 每关通关奖励（兼容旧逻辑；馆主奖金/徽章在对战胜利时发放）
  var LEVEL_REWARDS = [
    { balls: 5,  mon: 25,  monLevel: 6,  items: { potion: 3 }, money: 500 },
    { balls: 5,  mon: 27,  monLevel: 12, items: { potion: 3, super: 1 }, money: 800 },
    { balls: 6,  mon: 54,  monLevel: 16, items: { super: 2 }, money: 1000 },
    { balls: 6,  mon: 58,  monLevel: 20, items: { super: 2, paralyzeheal: 2 }, money: 1200 },
    { balls: 8,  mon: 77,  monLevel: 24, items: { hyper: 1, full: 1 }, money: 1500 },
    { balls: 8,  mon: 88,  monLevel: 28, items: { antidote: 5, hyper: 1 }, money: 1800 },
    { balls: 8,  mon: 64,  monLevel: 32, items: { hyper: 2 }, money: 2000 },
    { balls: 10, mon: 59,  monLevel: 36, items: { full: 1, hyper: 2 }, money: 2500 },
    { balls: 10, mon: 112, monLevel: 42, items: { full: 2 }, money: 3000 },
    { balls: 15, mon: 149, monLevel: 50, items: { full: 3 }, money: 5000 }
  ];

  // 道具定义（对战中使用；与 ITEM_CATALOG 同步）
  var ITEM_INFO = {
    potion:       { name: "伤药",     icon: "🧪", desc: "恢复 20 HP", heal: 20,  full: false },
    super:        { name: "好伤药",   icon: "💊", desc: "恢复 50 HP", heal: 50,  full: false },
    hyper:        { name: "厉害伤药", icon: "💉", desc: "恢复 200 HP", heal: 200, full: false },
    full:         { name: "全复药",   icon: "✨", desc: "回满 HP 并解除异常", heal: 9999, full: true },
    antidote:     { name: "解毒药",   icon: "🟢", desc: "解除中毒", heal: 0, cure: "poison" },
    awaken:       { name: "解眠药",   icon: "💤", desc: "解除睡眠", heal: 0, cure: "sleep" },
    burnheal:     { name: "灼伤药",   icon: "🔥", desc: "解除灼烧", heal: 0, cure: "burn" },
    paralyzeheal: { name: "解麻药",   icon: "⚡", desc: "解除麻痹", heal: 0, cure: "paralysis" },
    iceheal:      { name: "解冻药",   icon: "❄️", desc: "解除冰冻", heal: 0, cure: "freeze" }
  };

  // 技能机 TM（在队伍详情里教授招式）
  var TM_LIST = [
    { key: "tm_thunder", move: "thunderbolt", name: "TM 十万伏特", icon: "⚡" },
    { key: "tm_water",   move: "surf",        name: "TM 水炮",     icon: "💧" },
    { key: "tm_ice",     move: "ice-beam",    name: "TM 冰冻光束", icon: "❄️" },
    { key: "tm_fire",    move: "flamethrower",name: "TM 喷射火焰", icon: "🔥" },
    { key: "tm_psychic", move: "psychic",     name: "TM 精神强念", icon: "🔮" },
    { key: "tm_grass",   move: "solar-beam",  name: "TM 日光束",   icon: "🌿" },
    { key: "tm_fight",   move: "brick-break", name: "TM 近身战",   icon: "👊" },
    { key: "tm_shadow",  move: "shadow-ball", name: "TM 暗影球",   icon: "🌑" },
    { key: "tm_rock",    move: "rock-slide",  name: "TM 岩崩",     icon: "🪨" },
    { key: "tm_ground",  move: "earthquake",  name: "TM 地震",     icon: "🌍" }
  ];
  function tmByKey(k) { for (var i = 0; i < TM_LIST.length; i++) if (TM_LIST[i].key === k) return TM_LIST[i]; return null; }
  function moveFromSlug(s) {
    var md = (window.MOVE_DB || {})[s];
    if (!md) return null;
    var m = {
      name: md.zh || s.replace(/-/g, " "),
      type: md.type,
      power: md.kind === "damage" ? (md.power || 0) : 0,
      cat: md.cat === "status" ? "status" : md.cat,
      cost: 0, slug: s, kind: md.kind
    };
    if (md.kind === "status") { m.status = md.effect; m.statusChance = (md.chance || 0) / 100; }
    return m;
  }
  function itemMeta(k) {
    if (ITEM_INFO[k]) return { name: ITEM_INFO[k].name, icon: ITEM_INFO[k].icon, desc: ITEM_INFO[k].desc, tm: false };
    var tm = tmByKey(k);
    if (tm) {
      var md = (window.MOVE_DB || {})[tm.move];
      return { name: tm.name, icon: tm.icon, desc: md ? ("教授招式【" + (md.zh || tm.move) + "】") : tm.name, tm: true };
    }
    return { name: k, icon: "🎁", desc: "", tm: false };
  }

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
    var pos = LEVEL_POS[LEVELS.indexOf(cfg)] || { start: cfg.start, goal: cfg.goal };
    var b = BIOMES[LEVEL_BIOME[LEVELS.indexOf(cfg)]] || BIOMES.grassland;
    var reserved = {};
    function mark(p) { if (p) reserved[p[0] + "," + p[1]] = true; }
    mark(cfg.center); mark(pos.start); mark(pos.goal);
    cfg.trainers.forEach(function (t) { mark([t.x, t.y]); });
    // NPC（商店/礼物）也必须站在可行走格上，否则 tryMove 会被 isBlocking 挡在外面
    if (cfg.npcs) cfg.npcs.forEach(function (n) { mark([n.x, n.y]); });
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
        else if (rnd() < b.treeProb) row.push("T");
        else if (rnd() < b.rockProb) row.push("r");
        else row.push(".");
      }
      grid.push(row);
    }
    // 特殊地块优先级：起点可与中心重合，但中心格必须保持 "C"（否则无法治疗）
    // 传送门 "G" 最后写，避免被覆盖
    function placeSpecials() {
      grid[pos.start[1]][pos.start[0]] = "P";
      grid[cfg.center[1]][cfg.center[0]] = "C";
      if (pos.goal) grid[pos.goal[1]][pos.goal[0]] = "G";
    }
    placeSpecials();
    ensureConnectivity(grid, pos, cfg);
    placeSpecials();
    return grid.map(function (r) { return r.join(""); });
  }
  // 保证起点能走到终点与所有训练家，避免障碍造成软锁
  function ensureConnectivity(grid, pos, cfg) {
    var W = grid[0].length, H = grid.length;
    function reach() {
      var seen = {}, q = [pos.start.slice()];
      seen[pos.start[0] + "," + pos.start[1]] = true;
      while (q.length) {
        var p = q.shift(), x = p[0], y = p[1];
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(function (d) {
          var nx = x + d[0], ny = y + d[1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
          var k = nx + "," + ny;
          if (seen[k]) return;
          if (isBlocking(grid[ny][nx])) return;
          seen[k] = true; q.push([nx, ny]);
        });
      }
      return seen;
    }
    function carve(tx, ty) {
      var x = pos.start[0], y = pos.start[1];
      while (x !== tx) { x += x < tx ? 1 : -1; if (grid[y][x] !== "#" && isBlocking(grid[y][x])) grid[y][x] = "."; }
      while (y !== ty) { y += y < ty ? 1 : -1; if (grid[y][x] !== "#" && isBlocking(grid[y][x])) grid[y][x] = "."; }
    }
    var seen = reach();
    var targets = [pos.goal]
      .concat(cfg.trainers.map(function (t) { return [t.x, t.y]; }))
      .concat((cfg.npcs || []).map(function (n) { return [n.x, n.y]; }));
    targets.forEach(function (t) {
      if (!t) return;
      if (!seen[t[0] + "," + t[1]]) { carve(t[0], t[1]); seen = reach(); }
    });
  }

  // 每关可变状态（由 loadLevel 写入）
  var MAP, MAP_W, MAP_H, START, TRAINERS, WILD_RANGE, CURRENT_WILD_POOL, NPCS;
  var CUR_BIOME = "grassland";
  var terrainCanvas = null, terrainCtx = null; // 离屏静态地形缓存

  function isBlocking(ch) { return ch === "#" || ch === "~" || ch === "T" || ch === "r"; }
  function biome() { return BIOMES[CUR_BIOME] || BIOMES.grassland; }

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
    CUR_BIOME = LEVEL_BIOME[idx] || "grassland";
    MAP = buildLevelMap(cfg);
    MAP_W = MAP[0].length; MAP_H = MAP.length;
    var pos = LEVEL_POS[idx] || { start: cfg.start };
    START = { x: pos.start[0], y: pos.start[1] };
    TRAINERS = cfg.trainers;
    NPCS = cfg.npcs || [];
    WILD_RANGE = cfg.wild;
    CURRENT_WILD_POOL = buildWildPool(cfg);
    player.x = START.x; player.y = START.y;
    player.px = player.x * TILE + TILE / 2; player.py = player.y * TILE + TILE / 2;
    player.tx = player.px; player.ty = player.py; player.moving = false;
    renderTerrainCache();
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
  function npcAt(x, y) {
    if (!NPCS) return null;
    for (var i = 0; i < NPCS.length; i++) {
      if (NPCS[i].x === x && NPCS[i].y === y) return NPCS[i];
    }
    return null;
  }

  /* ---------- 全局状态 ---------- */
  var save = null;          // { party:[member], balls, defeated:{} }
  var player = { x: 0, y: 0, px: 0, py: 0, tx: 0, ty: 0, moving: false, starterId: null };
  var inBattle = false;
  var inDialog = false;
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
      if (!save) return;
      normalizeSave(save);
      var data = {
        party: save.party.map(function (m) {
          return { id: m.id, level: m.level, exp: m.exp, hp: m.hp, status: m.status || null, moves: m.moves || null };
        }),
        balls: save.balls,
        items: save.items,
        money: save.money || 0,
        badges: save.badges || {},
        defeated: save.defeated,
        npcDone: save.npcDone || {},
        dex: save.dex,
        level: save.level,
        maxLevel: save.maxLevel || 0,
        maxUnlocked: save.maxUnlocked != null ? save.maxUnlocked : (save.maxLevel || 0),
        champion: !!save.champion,
        finalRewardClaimed: !!save.finalRewardClaimed,
        claimedRewards: save.claimedRewards || {},
        tm: save.tm || {}
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* localStorage 不可用时忽略 */ }
  }
  function loadGame() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return normalizeSave(JSON.parse(raw));
    } catch (e) { return null; }
  }
  function markSeen(id) { if (save && save.dex) save.dex.seen[id] = true; }
  function markCaught(id) { if (save && save.dex) { save.dex.seen[id] = true; save.dex.caught[id] = true; } }

  /* ---------- 队伍 / 数值 ---------- */
  function makeMember(id, level) {
    var mon = MON_BY_ID[id];
    var moves = getLearnset(mon).filter(function (m) { return m.level <= level; });
    return { id: id, level: level, exp: 0, hp: statLine(mon, level).hp, status: null, moves: moves };
  }
  function healParty() {
    if (!save) return;
    save.party.forEach(function (m) {
      var mon = MON_BY_ID[m.id];
      m.hp = statLine(mon, m.level).hp;
      m.status = null;
      if (m.moves) m.moves.forEach(function (mv) { ensureMovePP(mv); mv.pp = mv.maxPp; });
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

    if (terrainCanvas) ctx.drawImage(terrainCanvas, 0, 0);
    // 氛围色调（昼夜/雾）：叠在地形之上、精灵之下
    var atmKey = (save && LEVELS[save.level]) ? LEVELS[save.level].atmos : "day";
    var atm = ATMOS[atmKey];
    if (atm && atm.tint) { ctx.fillStyle = atm.tint; ctx.fillRect(0, 0, MAP_W * TILE, MAP_H * TILE); }
    if (save) {
      // 传送门状态会随训练家战况变化，每帧动态重绘（地形缓存里画的是关闭态）
      var gp = LEVEL_POS[save.level].goal;
      drawTile(ctx, gp[0], gp[1], "G");
      // 训练家
      TRAINERS.forEach(function (t) {
        var defeated = save && save.defeated && save.defeated[t.id];
        drawSpriteOnTile(t.party[0].id, t.x, t.y, defeated ? 0.4 : 1);
      });
      // 友好 NPC
      if (NPCS) NPCS.forEach(function (n) { drawNPC(n); });
      // 玩家（用当前队伍领队，进化后同步新形态）
      drawSpriteOnTile(playerSpriteId(), -1, -1, 1, true);
    }
    ctx.restore();
  }
  function drawNPC(n) {
    var cx = n.x * TILE + TILE / 2, cy = n.y * TILE + TILE / 2;
    ctx.save();
    ctx.fillStyle = "#00000033";
    ctx.beginPath(); ctx.ellipse(cx, cy + TILE / 2 - 3, 11, 4, 0, 0, 7); ctx.fill();
    // 身体
    ctx.fillStyle = n.color || "#e07ab0";
    ctx.beginPath(); ctx.arc(cx, cy + 2, 12, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(cx - 4, cy, 3, 0, 7); ctx.arc(cx + 4, cy, 3, 0, 7); ctx.fill();
    // 气泡图标：有礼物显示🎁，否则💬
    ctx.font = "13px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(n.gift ? "🎁" : "💬", cx, cy - 14);
    ctx.restore();
  }
  function drawTile(c, x, y, ch) {
    var px = x * TILE, py = y * TILE;
    var b = biome();
    if (ch === "#") {
      c.fillStyle = b.accent; c.fillRect(px, py, TILE, TILE);
      c.fillStyle = b.treeDk;
      c.beginPath(); c.arc(px + TILE/2, py + TILE/2, TILE/2 - 2, 0, 7); c.fill();
    } else if (ch === "~") {
      c.fillStyle = b.water; c.fillRect(px, py, TILE, TILE);
      c.fillStyle = "#ffffff55";
      c.fillRect(px + 5, py + 6, TILE - 10, 2); c.fillRect(px + 3, py + 18, TILE - 8, 2);
    } else if (ch === ",") {
      c.fillStyle = b.grass1; c.fillRect(px, py, TILE, TILE);
      c.fillStyle = b.grass2;
      c.fillRect(px + 6, py + 8, 3, 8); c.fillRect(px + 14, py + 5, 3, 11);
      c.fillRect(px + 22, py + 9, 3, 7);
    } else if (ch === "T") {
      c.fillStyle = b.ground; c.fillRect(px, py, TILE, TILE);
      c.fillStyle = b.treeDk;
      c.beginPath(); c.moveTo(px + TILE/2, py + 4); c.lineTo(px + TILE - 5, py + TILE - 5); c.lineTo(px + 5, py + TILE - 5); c.closePath(); c.fill();
      c.fillStyle = b.tree;
      c.beginPath(); c.moveTo(px + TILE/2, py + 7); c.lineTo(px + TILE - 8, py + TILE - 7); c.lineTo(px + 8, py + TILE - 7); c.closePath(); c.fill();
    } else if (ch === "r") {
      c.fillStyle = b.ground; c.fillRect(px, py, TILE, TILE);
      c.fillStyle = b.rock;
      c.beginPath(); c.ellipse(px + TILE/2, py + TILE/2 + 2, TILE/2 - 5, TILE/2 - 7, 0, 0, 7); c.fill();
      c.fillStyle = "#00000022";
      c.fillRect(px + TILE/2 - 4, py + TILE/2 - 2, 4, 2); c.fillRect(px + TILE/2 + 2, py + TILE/2 + 3, 5, 2);
    } else if (ch === "C") {
      c.fillStyle = "#f4d35e"; c.fillRect(px, py, TILE, TILE);
      c.fillStyle = "#c79a00";
      c.fillRect(px + TILE/2 - 9, py + 4, 18, 4);
      c.fillRect(px + TILE/2 - 2, py + 4, 4, 24);
      c.fillStyle = "#fff";
      c.beginPath(); c.arc(px + TILE/2, py + TILE/2 + 2, 5, 0, 7); c.fill();
    } else if (ch === "G") {
      var gOpen = levelCleared();
      c.fillStyle = gOpen ? "#5b34b0" : "#3a3f4a"; c.fillRect(px, py, TILE, TILE);
      c.strokeStyle = gOpen ? "#c9b3ff" : "#6b7180"; c.lineWidth = 2;
      c.beginPath(); c.arc(px + TILE/2, py + TILE/2, TILE/2 - 6, 0, 7); c.stroke();
      c.fillStyle = gOpen ? "#e9deff" : "#7b818f";
      c.beginPath(); c.arc(px + TILE/2, py + TILE/2, TILE/2 - 11, 0, 7); c.fill();
      if (gOpen) {
        c.fillStyle = "#fff"; c.font = "bold 10px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText("✦", px + TILE/2, py + TILE/2);
      }
    } else {
      c.fillStyle = b.ground; c.fillRect(px, py, TILE, TILE);
    }
    // 网格描边
    c.strokeStyle = "#00000010"; c.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
  }
  // 预渲染静态地形到离屏 canvas（性能优化：每帧只 drawImage 一次）
  function renderTerrainCache() {
    if (!terrainCanvas) {
      terrainCanvas = document.createElement("canvas");
      terrainCanvas.width = MAP_W * TILE;
      terrainCanvas.height = MAP_H * TILE;
      terrainCtx = terrainCanvas.getContext("2d");
    }
    terrainCtx.setTransform(1, 0, 0, 1, 0, 0);
    terrainCtx.clearRect(0, 0, terrainCanvas.width, terrainCanvas.height);
    for (var y = 0; y < MAP_H; y++)
      for (var x = 0; x < MAP_W; x++)
        drawTile(terrainCtx, x, y, MAP[y][x]);
  }
  // 地图上的主角形象：优先当前队伍第一只存活成员，避免进化后仍显示旧形态
  function playerSpriteId() {
    if (save && save.party && save.party.length) {
      for (var i = 0; i < save.party.length; i++) {
        if (save.party[i] && save.party[i].hp > 0) return save.party[i].id;
      }
      return save.party[0].id;
    }
    return player.starterId;
  }
  function drawSpriteOnTile(id, x, y, alpha, isPlayer) {
    var cx, cy;
    if (isPlayer) { cx = player.px; cy = player.py; }
    else { cx = x * TILE + TILE/2; cy = y * TILE + TILE/2; }
    ctx.save();
    ctx.globalAlpha = alpha;
    // 主角略放大，并加高亮环 + 「我」标识，避免在草丛里看不清
    var s = isPlayer ? TILE + 10 : TILE - 6;
    var shadowRx = isPlayer ? 14 : 11;
    var shadowRy = isPlayer ? 5 : 4;
    ctx.fillStyle = "#00000033";
    ctx.beginPath(); ctx.ellipse(cx, cy + TILE/2 - 2, shadowRx, shadowRy, 0, 0, 7); ctx.fill();
    if (isPlayer) {
      // 呼吸式黄环（用时间驱动轻微脉动）
      var pulse = 1 + 0.08 * Math.sin(Date.now() / 280);
      var ringR = (s / 2 + 4) * pulse;
      ctx.strokeStyle = "rgba(255, 214, 40, 0.95)";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy + 1, ringR, 0, 7); ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy + 1, ringR + 3, 0, 7); ctx.stroke();
    }
    var im = spriteImg(id);
    if (im.complete && im.naturalWidth) {
      ctx.drawImage(im, cx - s/2, cy - s/2 - (isPlayer ? 2 : 0), s, s);
    } else {
      ctx.fillStyle = TYPE_COLOR[MON_BY_ID[id].types[0]] || "#888";
      ctx.beginPath(); ctx.arc(cx, cy, s/2, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("#" + id, cx, cy);
    }
    if (isPlayer) {
      // 头顶「我」小旗，训练家/NPC 没有，辨识度更高
      var flagY = cy - s/2 - 10;
      ctx.fillStyle = "#ffd628";
      ctx.beginPath();
      ctx.moveTo(cx - 10, flagY + 4);
      ctx.lineTo(cx + 10, flagY + 4);
      ctx.lineTo(cx, flagY - 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#3a2d00";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("我", cx, flagY + 1);
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
    // 移动端（触屏）禁用画布双指捏合，避免误触缩放；缩放改由 +/- 按钮完成
    var isTouch = window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (isTouch) return;
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
    if (inBattle || inDialog || player.moving || !save) return;
    var nx = player.x + dx, ny = player.y + dy;
    if (nx < 0 || ny < 0 || ny >= MAP_H || nx >= MAP_W) return;
    var ch = MAP[ny][nx];
    if (isBlocking(ch)) return;
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
    var npc = npcAt(nx, ny);
    if (npc && !(npc.once && save.npcDone && save.npcDone[npc.id])) {
      // 友好 NPC 不挡路：走到其身旁并触发对话（已完成的只路过）
      player.x = nx; player.y = ny;
      player.tx = nx * TILE + TILE / 2; player.ty = ny * TILE + TILE / 2;
      player.moving = true;
      triggerNPC(npc); return;
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
  function hasConsciousMember() {
    if (!save || !save.party) return false;
    for (var i = 0; i < save.party.length; i++) {
      if (save.party[i] && save.party[i].hp > 0) return true;
    }
    return false;
  }
  function triggerEncounter() {
    if (!hasConsciousMember()) {
      toast("队伍全灭，请先到宝可梦中心回复！");
      return;
    }
    var mon = wildSpecies();
    var maxLv = save.party.reduce(function (m, p) { return Math.max(m, p.level); }, 1);
    var level = Math.max(WILD_RANGE[0], Math.min(WILD_RANGE[1], maxLv - 1 + Math.floor(Math.random() * 4)));
    var m = makeMember(mon.id, level);
    toast("野生的 " + mon.name_zh + "（Lv." + level + "）出现了！");
    startBattle({ wild: true, name: "野生宝可梦", oppParty: [m] });
  }
  function triggerTrainer(t) {
    if (!hasConsciousMember()) {
      toast("队伍全灭，请先到宝可梦中心回复！");
      return;
    }
    var firstStage = (t.stages && t.stages[0]) ? t.stages[0] : t.party;
    var party = firstStage.map(function (p) { return makeMember(p.id, p.level); });
    var stages = t.stages ? t.stages.length : 1;
    startBattle({ wild: false, name: t.name, trainerId: t.id, trainerRef: t, trainerStage: 0, trainerStages: stages, oppParty: party });
  }

  /* ---------- 战斗：构建 ---------- */
  function buildCombat(member, isPlayer) {
    var mon = MON_BY_ID[member.id];
    var st = statLine(mon, member.level);
    var moves = equippedMoves(member);
    if (moves.length === 0) { moves = getLearnset(mon).filter(function (m) { return m.level <= member.level; }); member.moves = moves; }
    tagWeather(moves);
    return {
      member: member, mon: mon, level: member.level,
      maxHp: st.hp, hp: Math.min(member.hp, st.hp),
      stats: st, moves: moves, status: member.status || null, fainted: member.hp <= 0
    };
  }
  function startBattle(opts) {
    inBattle = true;
    var youCombat = save.party.map(function (m) { return buildCombat(m, true); });
    var oppCombat = opts.oppParty.map(function (m) { return buildCombat(m, false); });
    oppCombat.forEach(function (c) { markSeen(c.mon.id); });
    // 若首发已倒下，自动改用第一只仍可战的宝可梦，避免开局无法行动
    var lead = 0;
    for (var li = 0; li < youCombat.length; li++) {
      if (!youCombat[li].fainted && youCombat[li].hp > 0) { lead = li; break; }
    }
    var participants = {};
    participants[lead] = true;
    battle = {
      wild: opts.wild,
      you: { party: youCombat, idx: lead, participants: participants },
      opp: { party: oppCombat, idx: 0, name: opts.name, trainerId: opts.trainerId || null, trainerRef: opts.trainerRef || null },
      trainerStage: opts.trainerStage || 0, trainerStages: opts.trainerStages || 1,
      turn: "you", over: false, busy: false, log: [], _switch: false, _item: false,
      weather: (LEVELS[save.level] && LEVELS[save.level].ambientWeather)
        ? { type: LEVELS[save.level].ambientWeather, turns: 999 }
        : { type: "none", turns: 0 },
      startLevels: youCombat.map(function (c) { return c.member.level; })
    };
    showBattle();
    if (opts.wild) battleLog("sys", "野生的 " + oppCombat[0].mon.name_zh + "（Lv." + oppCombat[0].level + "）出现了！");
    else battleLog("sys", opts.name + " 发起了对战！");
    battleRender();
  }
  // 多段连战的下一阶段：沿用当前队伍 HP/状态，对手换成下一队
  function startStage(t, stageIdx) {
    var stage = t.stages[stageIdx];
    var oppParty = stage.map(function (p) { return makeMember(p.id, p.level); });
    startBattle({
      wild: false, name: t.name + "（第 " + (stageIdx + 1) + " 阶段）",
      trainerId: t.id, trainerRef: t, trainerStage: stageIdx, trainerStages: t.stages.length,
      oppParty: oppParty
    });
  }
  function active(side) { return battle[side].party[battle[side].idx]; }
  function sideName(side) { return side === "you" ? "你" : battle.opp.name; }

  /* ---------- 战斗：天气系统（机制镜像 game.js 的卡牌战天气） ---------- */
  var WEATHER = {
    none:      { name: "无",     icon: "🌤️", atk: null,   weak: null,   mult: 1,   chip: false, immune: [] },
    sunny:     { name: "大晴天", icon: "☀️", atk: "fire",  weak: "water", mult: 1.5, chip: false, immune: [] },
    rain:      { name: "下雨",   icon: "🌧️", atk: "water", weak: "fire",  mult: 1.5, chip: false, immune: [] },
    sandstorm: { name: "沙暴",   icon: "🌪️", atk: "rock",  weak: null,   mult: 1.5, chip: true,  immune: ["rock", "ground", "steel"] },
    hail:      { name: "冰雹",   icon: "❄️", atk: "ice",   weak: null,   mult: 1.5, chip: true,  immune: ["ice"] }
  };
  // 招式名 → 天气（出该招即引发天气；镜像 game.js 的 WEATHER_MOVE）
  var WEATHER_MOVE = {
    "大字爆炎": "sunny", "喷射火焰": "sunny",
    "水流尾": "rain", "水炮": "rain",
    "岩崩": "sandstorm", "尖石攻击": "sandstorm",
    "暴风雪": "hail", "冰冻光束": "hail"
  };
  var WEATHER_DURATION = 5;
  function weatherMult(moveType, wType) {
    var w = WEATHER[wType] || WEATHER.none;
    if (w.atk === moveType) return w.mult;
    if (w.weak === moveType) return 1 / w.mult;
    return 1;
  }
  // 给战斗成员的招式标注 weather（喷射火焰等出招即引发天气）
  function tagWeather(moves) {
    moves.forEach(function (m) {
      if (WEATHER_MOVE[m.name]) m.weather = WEATHER_MOVE[m.name];
    });
    return moves;
  }
  // 出招时若招式带 weather 则引发
  function applyMoveWeather(att, mv) {
    if (!mv.weather || !WEATHER[mv.weather]) return;
    battle.weather = { type: mv.weather, turns: WEATHER_DURATION };
    battleLog("eff", att.mon.name_zh + " 引发了" + WEATHER[mv.weather].name + "！");
    sfx("weather");
  }
  // 回合末：天气递减；沙暴/冰雹对场上双方造成 chip（不致命，仅持续消耗）
  function tickWeather() {
    if (!battle.weather || battle.weather.type === "none") return false;
    var w = WEATHER[battle.weather.type];
    if (w.chip) {
      ["you", "opp"].forEach(function (side) {
        var c = active(side);
        if (!c || c.fainted) return;
        var t = c.mon.types;
        if (w.immune.indexOf(t[0]) >= 0 || (t[1] && w.immune.indexOf(t[1]) >= 0)) return;
        var d = Math.max(1, Math.floor(c.maxHp * 0.0625));
        c.hp = Math.max(1, c.hp - d);
      });
    }
    battle.weather.turns -= 1;
    if (battle.weather.turns <= 0) {
      battleLog("sys", w.name + " 散去了。");
      battle.weather = { type: "none", turns: 0 };
    }
    return false;
  }

  /* ---------- 战斗：伤害 ---------- */

  function isPhysMove(mv) {
    return mv.cat === "phys" || mv.cat === "physical";
  }
  function hasStab(att, mv) {
    return att.mon.types && att.mon.types.indexOf(mv.type) >= 0;
  }
  function rollHit(att, def, mv) {
    var acc = (mv.acc != null ? mv.acc : 100);
    return Math.random() * 100 < acc;
  }
  function statusDefaultTurns(type) {
    if (type === "sleep") return 1 + Math.floor(Math.random() * 3);
    return 99;
  }
  function preActionStatus(c, sideTag) {
    if (!c || !c.status) return false;
    var t = c.status.type;
    if (t === "paralysis") {
      if (Math.random() < 0.25) {
        battleLog(sideTag, c.mon.name_zh + " 因麻痹无法行动！");
        return true;
      }
    } else if (t === "sleep") {
      c.status.turns = (c.status.turns == null ? 2 : c.status.turns) - 1;
      if (c.status.turns >= 0) {
        battleLog(sideTag, c.mon.name_zh + " 正在睡觉…");
        return true;
      }
      c.status = null;
      battleLog("sys", c.mon.name_zh + " 醒了！");
    } else if (t === "freeze") {
      if (Math.random() < 0.2) {
        c.status = null;
        battleLog("sys", c.mon.name_zh + " 解冻了！");
      } else {
        battleLog(sideTag, c.mon.name_zh + " 被冻住了！");
        return true;
      }
    }
    return false;
  }
  function tickStatus(c, sideTag) {
    if (!c || c.fainted || !c.status) return;
    var t = c.status.type;
    if (t === "poison" || t === "burn") {
      var d = Math.max(1, Math.floor(c.maxHp / 8));
      c.hp = Math.max(0, c.hp - d);
      battleLog(sideTag, c.mon.name_zh + (t === "poison" ? " 受到了毒伤害！" : " 受到了灼烧伤害！"));
      if (c.hp <= 0) c.fainted = true;
    }
  }
  function finishRound() {
    var you = active("you"), opp = active("opp");
    tickStatus(you, "you");
    tickStatus(opp, "foe");
    if (you && you.hp <= 0) { onFaint("you"); return; }
    if (opp && opp.hp <= 0) { onFaint("opp"); return; }
    if (typeof tickWeather === "function") tickWeather();
    battle.turn = "you"; battle.busy = false; battleRender();
  }

  function expected(att, def, mv) {
    if (!mv || !mv.power) return 0;
    var atk = isPhysMove(mv) ? att.stats.attack : att.stats.sp_attack;
    var dfs = isPhysMove(mv) ? def.stats.defense : def.stats.sp_defense;
    if (att.status && att.status.type === "burn" && isPhysMove(mv)) atk = Math.floor(atk * 0.5);
    var mult = typeMult(mv.type, def.mon.types);
    var stab = hasStab(att, mv) ? 1.5 : 1;
    return mv.power * (atk / (dfs + 8)) * 0.42 * mult * stab;
  }
  // 计算伤害（不修改 hp），供特效在"命中瞬间"再提交；含天气修正
  function resolveMove(att, def, mv) {
    if (!mv || (mv.pp != null && mv.pp <= 0)) {
      return { dmg: 0, mult: 1, statusApplied: false, miss: true, noPP: true, crit: false, stab: false, statusType: null };
    }
    if (!rollHit(att, def, mv)) {
      return { dmg: 0, mult: 1, statusApplied: false, miss: true, crit: false, stab: false, statusType: null };
    }
    var atk = isPhysMove(mv) ? att.stats.attack : att.stats.sp_attack;
    var dfs = isPhysMove(mv) ? def.stats.defense : def.stats.sp_defense;
    if (att.status && att.status.type === "burn" && isPhysMove(mv)) atk = Math.floor(atk * 0.5);
    var wType = (battle.weather && battle.weather.type) || "none";
    var mult = typeMult(mv.type, def.mon.types) * (typeof weatherMult === "function" ? weatherMult(mv.type, wType) : 1);
    var stab = hasStab(att, mv);
    if (stab) mult *= 1.5;
    var crit = Math.random() < (1 / 16);
    if (crit) mult *= 2;
    var base = (mv.power || 0) * (atk / (dfs + 8)) * 0.42 * mult;
    if (!mv.power) base = 0;
    var variance = 0.85 + Math.random() * 0.15;
    var dmg = mv.power ? Math.max(1, Math.floor(base * variance)) : 0;
    var statusApplied = false;
    var statusType = mv.status || null;
    if (statusType && !def.status && Math.random() < (mv.statusChance || 0)) {
      statusApplied = true;
    } else if (!statusType && !def.status) {
      var st = TYPE_STATUS[mv.type];
      if (st && Math.random() < 0.1) {
        statusType = st;
        statusApplied = true;
      }
    }
    return { dmg: dmg, mult: mult, statusApplied: statusApplied, miss: false, crit: crit, stab: stab, statusType: statusType };
  }
  // 命中瞬间落实伤害与状态
  function commitMove(def, res, mv) {
    if (res.miss) return;
    def.hp = Math.max(0, def.hp - res.dmg);
    if (res.statusApplied) {
      def.status = { type: res.statusType || mv.status, turns: statusDefaultTurns(res.statusType || mv.status) };
    }
  }
  // 触发技能粒子特效；若引擎不可用则直接回调（优雅降级）
  function castFX(side, mv, res, onImpact) {
    if (window.SkillFX && window.SkillFX.cast) {
      try { window.SkillFX.cast(side, mv, { mult: res.mult }, { onImpact: onImpact }); return; }
      catch (e) {}
    }
    onImpact();
  }
  // 命中瞬间给防守方卡牌加抖动反馈
  function flashHit(side) {
    try {
      var spr = document.getElementById(side === "you" ? "you-active-card" : "ai-active-card");
      var card = spr && spr.closest ? spr.closest(".rpg-bc") : null;
      if (!card) return;
      card.classList.add("hit");
      setTimeout(function () { card.classList.remove("hit"); }, 440);
    } catch (e) {}
  }
  // 音效（复用 battle-audio.js；引擎不可用时全部降级为 no-op，绝不抛错）
  var audioReady = false;
  function sfx(name) { try { if (window.BattleAudio) window.BattleAudio.play(name); } catch (e) {} }
  function audioKick() {
    if (audioReady) return;
    if (window.BattleAudio) {
      try {
        window.BattleAudio.init();
        window.BattleAudio.startBGM();
        audioReady = true;
        updateSoundIcon();
      } catch (e) {}
    }
  }
  function updateSoundIcon() {
    var b = document.getElementById("rpg-sound");
    if (!b) return;
    var muted = window.BattleAudio && window.BattleAudio.isMuted();
    b.textContent = muted ? "🔇 已静音" : "🔊 音效";
    if (muted) b.classList.add("muted"); else b.classList.remove("muted");
  }

  /* ---------- 战斗：玩家行动 ---------- */
  function playerAct(idx) {
    if (battle.over || battle.busy || battle.turn !== "you" || battle._switch) return;
    battle.busy = true; battle._switch = false;
    var att = active("you"), def = active("opp");
    if (preActionStatus(att, "you")) {
      setTimeout(safeRun(function () {
        if (att.hp <= 0) onFaint("you");
        else oppTurn();
      }), 420);
      battleRender();
      return;
    }
    var mv = att.moves[idx];
    if (!mv) { battle.busy = false; return; }
    ensureMovePP(mv);
    if (mv.pp != null && mv.pp <= 0) {
      battleLog("sys", mv.name + " 的 PP 用完了！");
      battle.busy = false; battleRender(); return;
    }
    if (mv.pp != null) mv.pp--;
    var res = resolveMove(att, def, mv);
    battleLog("you", "你 的 " + att.mon.name_zh + " 使用【" + mv.name + "】！");
    if (res.miss) {
      battleLog("sys", "但是没有命中！");
      try { sfx("miss"); } catch (e) {}
      battleRender();
      setTimeout(safeRun(function () { oppTurn(); }), 420);
      return;
    }
    if (typeof applyMoveWeather === "function") applyMoveWeather(att, mv);
    sfx("move");
    battleRender();
    castFX("you", mv, res, safeRun(function () {
      commitMove(def, res, mv);
      if (res.dmg > 0) spawnDmg("opp", res.dmg, res.mult, res.crit);
      flashHit("opp");
      sfx(res.crit || res.mult >= 2 ? "crit" : "hit");
      if (res.crit) battleLog("eff", "会心一击！");
      battleRender();
      setTimeout(safeRun(function () {
        if (def.hp <= 0) { onFaint("opp"); }
        else {
          if (res.statusApplied && def.status) battleLog("foe", def.mon.name_zh + " 陷入" + STATUS_ZH[def.status.type] + "状态！");
          oppTurn();
        }
      }), 420);
    }));
  }
  function doCapture(ballKind) {
    if (battle.over || battle.busy || battle.turn !== "you" || !battle.wild || battle._switch) return;
    ballKind = ballKind || "ball";
    var mult = 1;
    if (ballKind === "ball") {
      if (save.balls <= 0) { battleLog("sys", "没有精灵球了！无法捕捉！"); toast("没有精灵球了！"); battleRender(); return; }
    } else {
      if (!save.items[ballKind] || save.items[ballKind] <= 0) { toast("没有该精灵球了！"); return; }
      mult = (ITEM_CATALOG[ballKind] && ITEM_CATALOG[ballKind].ballMult) || 1.5;
    }
    if (battle.you.party.length >= 6) { battleLog("sys", "队伍已满（最多 6 只），无法捕捉！"); toast("队伍已满（最多 6 只），无法捕捉！"); battleRender(); return; }
    battle.busy = true;
    if (ballKind === "ball") save.balls--;
    else save.items[ballKind]--;
    renderPartyHUD();
    var opp = active("opp");
    var statusBonus = (opp.status && (opp.status.type === "sleep" || opp.status.type === "freeze")) ? 2
      : (opp.status ? 1.5 : 1);
    var rate = clamp((0.12 + (1 - opp.hp / opp.maxHp) * 0.55) * mult * statusBonus, 0.05, 0.98);
    var ballName = (ITEM_CATALOG[ballKind] && ITEM_CATALOG[ballKind].name) || "精灵球";
    battleLog("you", "你投出了" + ballName + "…");
    sfx("throw");
    battleRender();
    setTimeout(safeRun(function () {
      if (Math.random() < rate) {
        var mon = opp.mon;
        var member = makeMember(mon.id, opp.level);
        member.hp = Math.max(1, opp.hp);
        member.status = opp.status ? { type: opp.status.type, turns: opp.status.turns } : null;
        member.moves = (opp.moves || []).map(function (mv) {
          var copy = {};
          for (var k in mv) if (mv.hasOwnProperty(k)) copy[k] = mv[k];
          return copy;
        });
        if (!member.moves.length) member.moves = equippedMoves(member);
        // 战斗 party 必须是 combat 对象，不能直接 push member
        var caught = buildCombat(member, true);
        battle.you.party.push(caught);
        battle.you.participants[battle.you.party.length - 1] = true;
        markCaught(mon.id);
        battleLog("sys", "恭喜！捕捉到了 " + mon.name_zh + "！");
        toast("捕捉成功！" + mon.name_zh);
        sfx("catch");
        battle.over = true; battle.busy = false;
        battleRender();
        setTimeout(safeRun(function () { endBattle("caught"); }), 900);
      } else {
        battleLog("sys", "啊…差一点就抓住了！");
        sfx("miss");
        battleRender();
        // 捕捉失败消耗回合，由对手行动（oppTurn 内会 finishRound）
        setTimeout(safeRun(function () { if (!battle.over) oppTurn(); }), 500);
      }
    }), 700);
  }
  function doSwitch(idx) {
    if (battle.over || battle.busy || battle.turn !== "you") return;
    if (battle.you.idx === idx || battle.you.party[idx].fainted) return;
    battle.busy = true; battle._switch = false;
    battle.you.idx = idx;
    battle.you.participants[idx] = true;
    battleLog("sys", "你换上了 " + active("you").mon.name_zh + "！");
    sfx("switch");
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
  function doUseItem(kind) {
    if (battle.over || battle.busy || battle.turn !== "you" || battle._switch) return;
    var info = ITEM_CATALOG[kind] || ITEM_INFO[kind];
    if (!info || info.ball) return;
    if (!save.items[kind] || save.items[kind] <= 0) { toast("没有该道具了！"); return; }
    battle.busy = true; battle._item = false;
    var you = active("you");
    save.items[kind]--;
    if (info.full) { you.hp = you.maxHp; you.status = null; }
    else if (info.cure) {
      if (you.status && you.status.type === info.cure) you.status = null;
      else if (info.heal) you.hp = Math.min(you.maxHp, you.hp + (info.heal || 0));
    } else {
      you.hp = Math.min(you.maxHp, you.hp + (info.heal || 0));
    }
    battleLog("you", "你使用了" + info.icon + info.name + "！");
    sfx("heal");
    battleRender();
    setTimeout(safeRun(function () { if (!battle.over) oppTurn(); }), 700);
  }

  /* ---------- 战斗：对手回合 ---------- */
  function oppTurn() {
    if (battle.over) return;
    battle.turn = "opp"; battleRender();
    setTimeout(safeRun(function () {
      if (battle.over) return;
      var att = active("opp"), def = active("you");
      if (preActionStatus(att, "foe")) {
        setTimeout(safeRun(function () {
          if (att.hp <= 0) onFaint("opp");
          else finishRound();
        }), 360);
        return;
      }
      var usable = att.moves.filter(function (m) { return m.pp == null || m.pp > 0; });
      if (!usable.length) usable = att.moves;
      var best = usable[0], be = -1, ko = null;
      for (var i = 0; i < usable.length; i++) {
        var e = expected(att, def, usable[i]);
        if (e > be) { be = e; best = usable[i]; }
        if (e >= def.hp) ko = usable[i];
      }
      var allResisted = usable.every(function (m) { return typeMult(m.type, def.mon.types) < 1; });
      if (!ko && allResisted && typeof bestSwitchOpp === "function") {
        var sw = bestSwitchOpp(def);
        if (sw >= 0) { oppSwitch(sw); return; }
      }
      var mv = ko || best;
      ensureMovePP(mv);
      if (mv.pp != null && mv.pp > 0) mv.pp--;
      var res = resolveMove(att, def, mv);
      battleLog("foe", battle.opp.name + " 的 " + att.mon.name_zh + " 使用【" + mv.name + "】！");
      if (res.miss) {
        battleLog("sys", "但是没有命中！");
        battleRender();
        setTimeout(safeRun(finishRound), 420);
        return;
      }
      if (typeof applyMoveWeather === "function") applyMoveWeather(att, mv);
      sfx("move");
      battleRender();
      castFX("opp", mv, res, safeRun(function () {
        commitMove(def, res, mv);
        if (res.dmg > 0) spawnDmg("you", res.dmg, res.mult, res.crit);
        flashHit("you");
        sfx(res.crit || res.mult >= 2 ? "crit" : "hit");
        if (res.crit) battleLog("eff", "会心一击！");
        battleRender();
        setTimeout(safeRun(function () {
          if (def.hp <= 0) { onFaint("you"); }
          else {
            if (res.statusApplied && def.status) battleLog("you", def.mon.name_zh + " 陷入" + STATUS_ZH[def.status.type] + "状态！");
            finishRound();
          }
        }), 420);
      }));
    }), 520);
  }
  // 寻找属性克制对方(you 当前宝可梦)的替补下标，没有则返回 -1
  function bestSwitchOpp(def) {
    var party = battle.opp.party;
    for (var i = 0; i < party.length; i++) {
      if (i === battle.opp.idx || party[i].fainted) continue;
      var found = false;
      for (var j = 0; j < party[i].moves.length; j++) {
        if (typeMult(party[i].moves[j].type, def.mon.types) >= 2) { found = true; break; }
      }
      if (found) return i;
    }
    return -1;
  }
  function oppSwitch(idx) {
    battle.busy = true;
    battle.opp.idx = idx;
    battleLog("sys", battle.opp.name + " 换上了 " + active("opp").mon.name_zh + "！");
    sfx("switch");
    battleRender();
    setTimeout(safeRun(function () { battle.turn = "you"; battle.busy = false; battleRender(); }), 600);
  }

  /* ---------- 战斗：倒下 / 经验 / 升级 ---------- */
  function onFaint(side) {
    sfx("faint");
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
    setTimeout(safeRun(function () {
      // 初代：击倒方获得再行动（对方派出后备后仍由击倒方先手）
      if (side === "you") oppTurn();
      else endYourTurn();
    }), 650);
  }
  function endYourTurn() { battle.turn = "you"; battle.busy = false; battleRender(); }

  function awardExp(oppMember) {
    var exp = expReward(oppMember);
    battleLog("lv", "获得 " + exp + " 点经验值！");
    var parts = battle.you.participants;
    Object.keys(parts).forEach(function (k) {
      if (!parts[k]) return;
      var ci = battle.you.party[+k];
      if (!ci || ci.fainted || !ci.member) return;
      addExp(ci.member, exp);
      ci.level = ci.member.level;
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
    if (battle.over && result !== "win" && result !== "caught" && result !== "lose" && result !== "run") return;
    battle.over = true; battle.busy = false;
    // 同步回 save.party（combat 结构：属性在 member 上）
    save.party = battle.you.party.map(function (c) {
      var mem = c.member || c;
      return {
        id: mem.id || (c.mon && c.mon.id),
        level: mem.level != null ? mem.level : c.level,
        exp: mem.exp || 0,
        hp: c.hp != null ? c.hp : mem.hp,
        status: c.status != null ? c.status : mem.status,
        moves: c.moves || mem.moves
      };
    });
    if (result === "win" || result === "caught") {
      sfx("victory");
      // 多阶段训练家：若还有下一队，先推进阶段（不发奖金/徽章）
      if (!battle.wild && battle.opp.trainerRef && battle.trainerStage + 1 < battle.trainerStages) {
        var nextIdx = battle.trainerStage + 1;
        var tref = battle.opp.trainerRef;
        var events0 = collectLevelUpEvents();
        processLevelUpEvents(events0, function () {
          toast(tref.name + " 派出了下一队！");
          startStage(tref, nextIdx);
        });
        return;
      }
      // 最终阶段胜利：标记击败、发奖金与徽章
      if (battle.opp.trainerId) {
        save.defeated[battle.opp.trainerId] = true;
        var tr = battle.opp.trainerRef || null;
        if (!tr && LEVELS[save.level]) {
          var ts = LEVELS[save.level].trainers || [];
          for (var ti = 0; ti < ts.length; ti++) if (ts[ti].id === battle.opp.trainerId) tr = ts[ti];
        }
        if (tr) {
          var prize = tr.money != null ? tr.money : (120 + (save.level + 1) * 80);
          if (tr.rival) prize = Math.floor(prize * 1.2);
          if (tr.champion) prize = Math.floor(prize * 1.5);
          save.money = (save.money || 0) + prize;
          battleLog("lv", "获得奖金 ₽" + prize + "！");
          toast("获得 ₽" + prize);
          if (tr.badge) {
            if (!save.badges) save.badges = {};
            save.badges[tr.badge] = true;
            var bmeta = null;
            for (var bi = 0; bi < BADGE_ORDER.length; bi++) if (BADGE_ORDER[bi].id === tr.badge) bmeta = BADGE_ORDER[bi];
            var bname = bmeta ? bmeta.name : tr.badge;
            battleLog("lv", "得到了" + bname + "！");
            toast("徽章入手：" + bname);
          }
          if (tr.champion) {
            // 冠军标记在 finishReturnToMap 统一处理，避免跳过终章奖励/胜利界面
            toast("你成为了关都冠军！");
          }
        }
        if (typeof levelCleared === "function" && levelCleared()) toast("本区训练家已全部击败！传送门开启！");
        renderPartyHUD();
      }
      // 经验已在击倒时由 awardExp 结算；捕捉成功时补发一次
      if (result === "caught" && battle.opp && battle.opp.party && battle.opp.party[0]) {
        awardExp(battle.opp.party[0]);
      }
    } else if (result === "lose") {
      sfx("faint");
      battleLog("sys", "你被击败了……回到宝可梦中心吧。");
    } else if (result === "run") {
      battleLog("sys", "你顺利地逃跑了！");
    }
    saveGame();
    battleRender();
    // 升级/进化/学招 串行弹窗，再返回地图
    setTimeout(function () {
      var events = collectLevelUpEvents();
      processLevelUpEvents(events, function () { finishReturnToMap(result); });
    }, 900);
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
    if (save.level >= LEVELS.length - 1 && levelCleared()) {
      save.champion = true;
      if (!save.finalRewardClaimed) {
        save.finalRewardClaimed = true;
        saveGame();
        showLevelReward(LEVELS.length - 1, function () { showVictory(); });
      } else {
        saveGame();
      }
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
    if (events.length === 0) {
      if (battle && battle.you && battle.you.party) {
        save.party = battle.you.party.map(function (c) {
          var mem = c.member || c;
          return {
            id: mem.id || (c.mon && c.mon.id),
            level: mem.level != null ? mem.level : c.level,
            exp: mem.exp || 0,
            hp: c.hp != null ? c.hp : mem.hp,
            status: c.status != null ? c.status : mem.status,
            moves: c.moves || mem.moves
          };
        });
      }
      saveGame();
      if (onDone) onDone();
      return;
    }
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
          '<div class="rpg-bc-sprite" id="' + (isYou ? "you-active-card" : "ai-active-card") + '">' +
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
    var wb = document.getElementById("rpg-weather");
    if (wb) {
      var w = (battle.weather && battle.weather.type && battle.weather.type !== "none") ? battle.weather : null;
      if (w && WEATHER[w.type]) {
        wb.className = "rpg-weather " + w.type;
        wb.innerHTML = WEATHER[w.type].icon + " " + WEATHER[w.type].name +
          (w.turns >= 999 ? "" : "（剩余 " + w.turns + " 回合）");
        wb.classList.remove("hidden");
      } else {
        wb.className = "rpg-weather hidden"; wb.innerHTML = "";
      }
    }
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
    if (battle._item) {
      var itemBtns = Object.keys(ITEM_INFO).map(function (k) {
        var info = ITEM_INFO[k];
        var cnt = (save.items && save.items[k]) || 0;
        if (cnt <= 0) return "";
        return '<button class="rpg-act" data-bitem="' + k + '"' + (canAct ? "" : " disabled") + '>' +
          info.icon + ' ' + info.name + '（' + cnt + '）</button>';
      }).join("");
      return '<div class="rpg-subrow"><button class="rpg-act ghost" data-bitemcancel="1">返回</button></div>' +
        '<div class="rpg-bench">' + (itemBtns || '<div style="color:#cdd7ee;padding:6px;">没有可用道具</div>') + '</div>';
    }
    var att = active("you"), def = active("opp");
    var moves = att.moves.map(function (mv, i) {
      ensureMovePP(mv);
      var mult = typeMult(mv.type, def.mon.types);
      var effCls = mult >= 2 ? "sup" : mult < 1 ? "weak" : "";
      var effTxt = mult >= 2 ? "克制" : mult === 0 ? "无效" : mult < 1 ? "被抵抗" : "";
      var noPP = mv.pp != null && mv.pp <= 0;
      return '' +
        '<button class="rpg-move" data-bmove="' + i + '"' + (canAct && !noPP ? "" : " disabled") + '>' +
          '<div class="mn"><span class="type-chip" style="background:' + (TYPE_COLOR[mv.type] || "#888") + '">' +
            (TYPE_ZH[mv.type] || mv.type) + '</span>' + mv.name + '</div>' +
          '<div class="md"><span>威力 ' + (mv.power || 0) + '</span><span>PP ' + (mv.pp != null ? mv.pp : "-") + '/' + (mv.maxPp || "-") + '</span><span>' + ((mv.cat === "phys" || mv.cat === "physical") ? "物理" : "特殊") + '</span></div>' +
          (effTxt ? '<div class="eff ' + effCls + '">' + effTxt + '</div>' : "") +
          (mv.weather && WEATHER[mv.weather] ? '<div class="eff weather">' + WEATHER[mv.weather].icon + "天气</div>" : "") +
        '</button>';
    }).join("");
    var sub = '<div class="rpg-subrow">' +
      (function () {
        if (!battle.wild) return "";
        var s = "";
        s += '<button class="rpg-act catch" data-bcatch="ball"' + (canAct && save.balls > 0 ? "" : " disabled") + '>精灵球（' + save.balls + '）</button>';
        if ((save.items.greatball || 0) > 0) s += '<button class="rpg-act catch" data-bcatch="greatball"' + (canAct ? "" : " disabled") + '>超级球（' + save.items.greatball + '）</button>';
        if ((save.items.ultraball || 0) > 0) s += '<button class="rpg-act catch" data-bcatch="ultraball"' + (canAct ? "" : " disabled") + '>高级球（' + save.items.ultraball + '）</button>';
        return s;
      })() +
      '<button class="rpg-act ghost" data-bitemopen="1"' + (canAct ? "" : " disabled") + '>道具</button>' +
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
    var caps = root.querySelectorAll("[data-bcatch]");
    for (var ci = 0; ci < caps.length; ci++) (function (el) {
      el.addEventListener("click", function () { doCapture(el.getAttribute("data-bcatch") || "ball"); });
    })(caps[ci]);
    var sw = root.querySelector("[data-bswitchopen]"); if (sw) sw.addEventListener("click", function () { battle._switch = true; battle._item = false; battleRender(); });
    var swb = root.querySelectorAll("[data-bswitch]"); for (var j = 0; j < swb.length; j++) (function (el) {
      el.addEventListener("click", function () { doSwitch(+el.getAttribute("data-bswitch")); });
    })(swb[j]);
    var cancel = root.querySelector("[data-bcancel]"); if (cancel) cancel.addEventListener("click", function () { battle._switch = false; battleRender(); });
    var run = root.querySelector("[data-brun]"); if (run) run.addEventListener("click", doRun);
    var io = root.querySelector("[data-bitemopen]"); if (io) io.addEventListener("click", function () { battle._item = true; battle._switch = false; battleRender(); });
    var ic = root.querySelector("[data-bitemcancel]"); if (ic) ic.addEventListener("click", function () { battle._item = false; battleRender(); });
    var ib = root.querySelectorAll("[data-bitem]"); for (var k = 0; k < ib.length; k++) (function (el) {
      el.addEventListener("click", function () { doUseItem(el.getAttribute("data-bitem")); });
    })(ib[k]);
  }
  function battleLog(cls, msg) { battle.log.push({ cls: cls, msg: msg }); if (battle.log.length > 40) battle.log.shift(); }

  function showBattle() {
    var el = document.getElementById("rpg-battle");
    if (!el) return;
    el.classList.remove("hidden");
    var key = (save && LEVELS[save.level]) ? LEVELS[save.level].atmos : "day";
    ["day", "mist", "dusk", "fog", "night"].forEach(function (k) { el.classList.remove("atm-" + k); });
    el.classList.add("atm-" + key);
  }
  function hideBattle() {
    var el = document.getElementById("rpg-battle");
    if (!el) return;
    el.classList.add("hidden");
    ["day", "mist", "dusk", "fog", "night"].forEach(function (k) { el.classList.remove("atm-" + k); });
  }

  /* ---------- 浮动伤害文字 ---------- */
  function spawnDmg(side, dmg, mult, crit) {
    try {
      var spr = document.getElementById(side === "you" ? "you-active-card" : "ai-active-card");
      var fx = document.getElementById("rpg-fx");
      if (!spr || !fx) return;
      var r = spr.getBoundingClientRect();
      var d = document.createElement("div");
      d.className = "rpg-dmg" + (crit ? " sup" : mult >= 2 ? " sup" : mult < 1 ? " weak" : "");
      d.textContent = (crit ? "会心 " : "") + "-" + dmg;
      d.style.left = (r.left + r.width / 2 - 20) + "px";
      d.style.top = (r.top + 10) + "px";
      fx.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 900);
    } catch (e) {}
  }


  /* ---------- 友好商店 / 场外背包 ---------- */
  var currentShop = null;
  function openShop(npc) {
    currentShop = npc || { name: "友好商店", shopStock: defaultShopStock() };
    var modal = document.getElementById("rpg-shop");
    if (!modal) { toast("商店界面未加载"); return; }
    var nameEl = document.getElementById("rpg-shop-name");
    if (nameEl) nameEl.textContent = (currentShop.name || "友好商店");
    var monEl = document.getElementById("rpg-shop-money");
    if (monEl) monEl.textContent = "持有 ₽" + (save.money || 0);
    renderShopList();
    modal.classList.remove("hidden");
    inDialog = true;
  }
  function closeShop() {
    var modal = document.getElementById("rpg-shop");
    if (modal) modal.classList.add("hidden");
    currentShop = null;
    inDialog = false;
    renderPartyHUD();
  }
  function renderShopList() {
    var list = document.getElementById("rpg-shop-list");
    if (!list || !currentShop) return;
    var stock = currentShop.shopStock || defaultShopStock();
    list.innerHTML = stock.map(function (row) {
      var info = ITEM_CATALOG[row.id];
      if (!info) return "";
      var price = row.price != null ? row.price : info.price;
      var own = row.id === "ball" ? save.balls : ((save.items && save.items[row.id]) || 0);
      return '' +
        '<div class="rpg-shop-row">' +
          '<div class="sr-info"><span class="sr-icon">' + info.icon + '</span><b>' + info.name + '</b>' +
            '<small>持有 ' + own + '</small></div>' +
          '<div class="sr-price">₽' + price + '</div>' +
          '<button class="rpg-btn" data-buy="' + row.id + '" data-price="' + price + '"' +
            ((save.money || 0) < price ? " disabled" : "") + '>购买</button>' +
        '</div>';
    }).join("") || '<div class="pd-tm-empty">本店暂无商品</div>';
    var buys = list.querySelectorAll("[data-buy]");
    for (var i = 0; i < buys.length; i++) (function (el) {
      el.addEventListener("click", function () {
        buyItem(el.getAttribute("data-buy"), +el.getAttribute("data-price"));
      });
    })(buys[i]);
  }
  function buyItem(id, price) {
    if (!save) return;
    price = +price || 0;
    if (!id || price < 0) return;
    if (!ITEM_CATALOG[id]) { toast("未知商品"); return; }
    if ((save.money || 0) < price) { toast("金钱不足！"); return; }
    save.money -= price;
    if (id === "ball") save.balls = (save.balls || 0) + 1;
    else {
      ensureItems(save);
      save.items[id] = (save.items[id] || 0) + 1;
    }
    var info = ITEM_CATALOG[id];
    toast("购买了 " + (info ? info.icon + info.name : id));
    saveGame();
    var monEl = document.getElementById("rpg-shop-money");
    if (monEl) monEl.textContent = "持有 ₽" + save.money;
    renderShopList();
    renderPartyHUD();
  }
  function openBag() {
    if (!save) return;
    var modal = document.getElementById("rpg-bag");
    if (!modal) return;
    var monEl = document.getElementById("rpg-bag-money");
    if (monEl) monEl.textContent = "₽ " + (save.money || 0);
    var list = document.getElementById("rpg-bag-list");
    var rows = [];
    rows.push({ id: "ball", count: save.balls, info: ITEM_CATALOG.ball });
    Object.keys(ITEM_CATALOG).forEach(function (k) {
      if (k === "ball") return;
      var c = (save.items && save.items[k]) || 0;
      if (c > 0) rows.push({ id: k, count: c, info: ITEM_CATALOG[k] });
    });
    list.innerHTML = rows.map(function (r) {
      var canField = r.info.field && !r.info.ball;
      return '' +
        '<div class="rpg-shop-row">' +
          '<div class="sr-info"><span class="sr-icon">' + r.info.icon + '</span><b>' + r.info.name + '</b>' +
            '<small>×' + r.count + '</small></div>' +
          (canField ? '<button class="rpg-btn ghost" data-fielditem="' + r.id + '">使用</button>' : '<span class="sr-price">—</span>') +
        '</div>';
    }).join("") || '<div class="pd-tm-empty">背包是空的</div>';
    var btns = list.querySelectorAll("[data-fielditem]");
    for (var i = 0; i < btns.length; i++) (function (el) {
      el.addEventListener("click", function () { useFieldItem(el.getAttribute("data-fielditem")); });
    })(btns[i]);
    var bg = document.getElementById("rpg-bag-badges");
    if (bg) {
      bg.innerHTML = BADGE_ORDER.map(function (b) {
        var on = save.badges && save.badges[b.id];
        return '<div class="rpg-badge-card' + (on ? " on" : "") + '"><div class="bb-icon">' + (on ? "🏅" : "⚪") +
          '</div><div class="bb-name">' + b.name + '</div><div class="bb-gym">' + b.city + ' · ' + b.gym + '</div></div>';
      }).join("");
    }
    modal.classList.remove("hidden");
  }
  function closeBag() {
    var modal = document.getElementById("rpg-bag");
    if (modal) modal.classList.add("hidden");
  }
  function useFieldItem(kind) {
    var info = ITEM_CATALOG[kind];
    if (!info || !info.field) return;
    if (!save.items[kind] || save.items[kind] <= 0) return;
    var target = null;
    for (var i = 0; i < save.party.length; i++) {
      var m = save.party[i];
      var max = statLine(MON_BY_ID[m.id], m.level).hp;
      if (info.full && (m.hp < max || m.status)) { target = m; break; }
      if (info.cure && m.status && m.status.type === info.cure) { target = m; break; }
      if (info.heal && m.hp < max && m.hp > 0) { target = m; break; }
    }
    if (!target) { toast("没有需要使用的宝可梦"); return; }
    var maxHp = statLine(MON_BY_ID[target.id], target.level).hp;
    if (info.full) { target.hp = maxHp; target.status = null; }
    else if (info.cure) { target.status = null; }
    else if (info.heal) { target.hp = Math.min(maxHp, target.hp + info.heal); }
    save.items[kind]--;
    toast("对 " + MON_BY_ID[target.id].name_zh + " 使用了" + info.name);
    saveGame(); renderPartyHUD(); openBag();
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
  function renderTrainerHUD() {
    var moneyEl = document.getElementById("rpg-money");
    if (moneyEl) moneyEl.textContent = "₽ " + (save && save.money != null ? save.money : 0);
    var badgeEl = document.getElementById("rpg-badges");
    if (badgeEl) {
      badgeEl.innerHTML = BADGE_ORDER.map(function (b) {
        var on = save && save.badges && save.badges[b.id];
        return '<span class="rpg-badge' + (on ? " on" : "") + '" title="' + b.name + " · " + b.gym + '">' +
          (on ? "🏅" : "⚪") + "</span>";
      }).join("");
    }
    var bagBall = document.getElementById("rpg-ball");
    if (bagBall) bagBall.textContent = "🔘 " + (save ? save.balls : 0);
  }
  function renderPartyHUD() {
    renderTrainerHUD();
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
    save = normalizeSave({
      party: [ makeMember(starterId, 5) ], money: 3000,
      badges: {},
      balls: 10, items: { potion: 3, super: 0, hyper: 0, full: 0, antidote: 1, paralyzeheal: 1, greatball: 0, ultraball: 0 },
      defeated: {}, npcDone: {}, dex: { seen: {}, caught: {} }, level: 0, maxLevel: 0, champion: false
    });
    markCaught(starterId);
    player.starterId = starterId;
    hideStarter();
    saveGame();
    renderPartyHUD();
    showLevelSelect(); // 让玩家确认从哪一关开始（初始仅第 1 关可选）
  }

  /* ---------- 队伍详情弹窗 ---------- */
  var tmLearnIdx = -1;
  function showPartyModal() {
    var wrap = document.getElementById("rpg-partydetail");
    var modal = document.getElementById("rpg-partymodal");
    if (!wrap || !modal) return;
    if (tmLearnIdx >= 0 && save.party[tmLearnIdx]) { renderTMPicker(wrap); bindPartyTM(); return; }
    tmLearnIdx = -1;
    wrap.innerHTML = save.party.map(function (m, i) {
      var mon = MON_BY_ID[m.id];
      var st = statLine(mon, m.level);
      var tmCount = TM_LIST.filter(function (t) { return (save.items[t.key] || 0) > 0; }).length;
      return '' +
        '<div class="rpg-pd">' +
          '<div class="pd-spr"><img src="' + mon.sprite + '" alt="' + mon.name_zh + '"></div>' +
          '<div class="pd-info">' +
            '<div class="pd-name">' + mon.name_zh + ' <small>Lv.' + m.level + '</small></div>' +
            '<div class="pd-row"><span>HP</span><b>' + m.hp + '/' + st.hp + '</b></div>' +
            '<div class="pd-row"><span>攻 / 防</span><b>' + st.attack + ' / ' + st.defense + '</b></div>' +
            '<div class="pd-row"><span>特攻 / 特防</span><b>' + st.sp_attack + ' / ' + st.sp_defense + '</b></div>' +
            '<div class="pd-row"><span>速度</span><b>' + st.speed + '</b></div>' +
            '<div class="pd-moves">' + m.moves.map(function (mv) {
              return '<span class="mv-chip" style="background:' + (TYPE_COLOR[mv.type] || "#888") + '">' + mv.name + '</span>';
            }).join("") + '</div>' +
          '</div>' +
          '<button class="rpg-act ghost pd-tm"' + (tmCount ? "" : " disabled style=\"opacity:.5\"") + ' data-tmlearn="' + i + '">📖 技能机' + (tmCount ? "（" + tmCount + "）" : "") + '</button>' +
        '</div>';
    }).join("");
    modal.classList.remove("hidden");
    bindPartyTM();
  }
  function renderTMPicker(wrap) {
    var m = save.party[tmLearnIdx]; var mon = MON_BY_ID[m.id];
    var owned = TM_LIST.filter(function (t) { return (save.items[t.key] || 0) > 0; });
    var html = '<div class="pd-tm-head">为 <b>' + mon.name_zh + '</b> 选择技能机（已拥有 ' + owned.length + ' 个）</div>';
    if (owned.length === 0) {
      html += '<div class="pd-tm-empty">你还没有技能机。通关奖励会赠送技能机，可在「选关」查看每关奖励。</div>';
    } else {
      html += owned.map(function (t) {
        var mv = moveFromSlug(t.move);
        var have = m.moves.some(function (x) { return x.slug === t.move; });
        return '<button class="rpg-act tm-opt" data-tmuse="' + t.key + '"' + (have ? ' disabled style="opacity:.5"' : '') + '>' +
          t.icon + ' ' + t.name +
          (mv ? ' <small>· ' + (TYPE_ZH[mv.type] || mv.type) + (mv.power ? ' 威力' + mv.power : '') + '</small>' : '') +
          (have ? ' <span>（已会）</span>' : '') + '</button>';
      }).join("");
    }
    html += '<button class="rpg-act ghost" data-tmback="1">返回</button>';
    wrap.innerHTML = html;
  }
  function bindPartyTM() {
    var wrap = document.getElementById("rpg-partydetail");
    if (!wrap) return;
    var learns = wrap.querySelectorAll("[data-tmlearn]");
    for (var i = 0; i < learns.length; i++) (function (el) {
      el.addEventListener("click", function () { tmLearnIdx = +el.getAttribute("data-tmlearn"); showPartyModal(); });
    })(learns[i]);
    var uses = wrap.querySelectorAll("[data-tmuse]");
    for (var j = 0; j < uses.length; j++) (function (el) {
      el.addEventListener("click", function () { doTeachTM(tmLearnIdx, el.getAttribute("data-tmuse")); });
    })(uses[j]);
    var back = wrap.querySelector("[data-tmback]"); if (back) back.addEventListener("click", function () { tmLearnIdx = -1; showPartyModal(); });
  }
  function doTeachTM(idx, key) {
    var tm = tmByKey(key); if (!tm) return;
    if (!save.items[key] || save.items[key] <= 0) { toast("没有该技能机了"); return; }
    var m = save.party[idx]; if (!m) return;
    var mon = MON_BY_ID[m.id];
    var mv = moveFromSlug(tm.move); if (!mv) { toast("招式数据缺失"); return; }
    if (m.moves.some(function (x) { return x.slug === tm.move; })) { toast(mon.name_zh + " 已会【" + mv.name + "】"); return; }
    save.items[key]--;
    if (m.moves.length < 4) m.moves.push(mv);
    else { var rep = m.moves[3]; m.moves[3] = mv; toast("用【" + mv.name + "】替换了【" + rep.name + "】"); }
    saveGame(); renderPartyHUD();
    toast(mon.name_zh + " 学会了【" + mv.name + "】！");
    showPartyModal();
  }
  function hidePartyModal() { tmLearnIdx = -1; var el = document.getElementById("rpg-partymodal"); if (el) el.classList.add("hidden"); }

  /* ---------- 图鉴 ---------- */
  function showPokedex() {
    var grid = document.getElementById("rpg-dex-grid");
    var statEl = document.getElementById("rpg-dex-stat");
    var modal = document.getElementById("rpg-dexmodal");
    if (!grid || !modal || !save) return;
    var seen = 0, caught = 0;
    LIST.forEach(function (mon) {
      if (save.dex.seen[mon.id]) seen++;
      if (save.dex.caught[mon.id]) caught++;
    });
    statEl.innerHTML = '已见到 <b>' + seen + '</b> / 已捕获 <b>' + caught + '</b> / 共 ' + LIST.length + ' 种';
    grid.innerHTML = LIST.map(function (mon) {
      var s = save.dex.seen[mon.id], c = save.dex.caught[mon.id];
      if (c) {
        return '<div class="rpg-dex-cell caught" title="' + mon.name_zh + '">' +
          '<img src="' + mon.sprite + '" alt="' + mon.name_zh + '" ' +
          'onerror="this.style.visibility=\'hidden\';">' +
          '<span class="rpg-dex-no">#' + mon.id + '</span>' +
          '<span class="rpg-dex-name">' + mon.name_zh + '</span></div>';
      }
      if (s) {
        return '<div class="rpg-dex-cell seen" title="尚未捕获"><span class="rpg-dex-q">?</span>' +
          '<span class="rpg-dex-no">#' + mon.id + '</span><span class="rpg-dex-name">？？？</span></div>';
      }
      return '<div class="rpg-dex-cell" title="未发现"><span class="rpg-dex-q">·</span>' +
        '<span class="rpg-dex-no">#' + mon.id + '</span></div>';
    }).join("");
    modal.classList.remove("hidden");
  }
  function hidePokedex() { var el = document.getElementById("rpg-dexmodal"); if (el) el.classList.add("hidden"); }

  /* ---------- 友好 NPC 对话 ---------- */
  function triggerNPC(npc) {
    inDialog = true;
    var modal = document.getElementById("rpg-npcdialog");
    var title = document.getElementById("rpg-npc-name");
    var body = document.getElementById("rpg-npc-line");
    var btn = document.getElementById("rpg-npc-next");
    if (!modal || !title || !body || !btn) { inDialog = false; return; }
    var lines = (npc.lines && npc.lines.length) ? npc.lines : ["（……）"];
    var idx = 0;
    function render() {
      title.textContent = npc.name;
      body.textContent = lines[idx];
      btn.textContent = (idx < lines.length - 1) ? "继续 ▶" : "结束";
    }
    function next() {
      idx++;
      if (idx >= lines.length) { closeNPC(npc); return; }
      render();
    }
    btn.onclick = next;
    if (modal._keyHandler) document.removeEventListener("keydown", modal._keyHandler);
    modal._keyHandler = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); next(); } };
    document.addEventListener("keydown", modal._keyHandler);
    render();
    modal.classList.remove("hidden");
  }
  function closeNPC(npc) {
    var modal = document.getElementById("rpg-npcdialog");
    if (modal) {
      modal.classList.add("hidden");
      if (modal._keyHandler) { document.removeEventListener("keydown", modal._keyHandler); modal._keyHandler = null; }
    }
    if (npc.gift && !save.npcDone[npc.id]) {
      var n = npc.giftCount || 1;
      if (npc.gift === "ball") {
        save.balls += n;
        toast("获得精灵球 ×" + n);
      } else if (npc.gift.indexOf("tm_") === 0) {
        save.items[npc.gift] = (save.items[npc.gift] || 0) + n;
        toast("获得技能机 ×" + n);
      } else {
        save.items[npc.gift] = (save.items[npc.gift] || 0) + n;
        var info = (typeof ITEM_CATALOG !== "undefined" && ITEM_CATALOG[npc.gift]) || ITEM_INFO[npc.gift];
        toast("获得" + (info ? info.icon + info.name : npc.gift) + " ×" + n);
      }
    }
    if (npc.giftMoney && !save.npcDone[npc.id]) {
      save.money = (save.money || 0) + npc.giftMoney;
      toast("获得 ₽" + npc.giftMoney);
    }
    if (npc.once) save.npcDone[npc.id] = true;
    saveGame(); renderPartyHUD();
    inDialog = false;
    if (npc.shop) {
      openShop(npc);
    }
  }

  /* ---------- 关卡 UI ---------- */
  function renderLevelInfo() {
    var el = document.getElementById("rpg-levelinfo");
    if (!el || !save) return;
    var idx = save.level;
    var cfg = LEVELS[idx];
    if (!cfg) return;
    var total = TRAINERS.length, done = 0;
    for (var i = 0; i < total; i++) if (save.defeated[TRAINERS[i].id]) done++;
    el.innerHTML =
      '<div class="rpg-li-name">章节 ' + (idx + 1) + ' / ' + LEVELS.length +
        ' · 徽章 ' + badgeCount(save) + '/8 · ₽' + (save.money || 0) + ' · ' + cfg.name + '</div>' +
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
    var parts = [];
    if (idx == null || idx < 0) return parts;
    if (!save.claimedRewards || typeof save.claimedRewards !== "object") save.claimedRewards = {};
    if (save.claimedRewards[String(idx)]) return parts;
    var reward = LEVEL_REWARDS[idx];
    if (!reward) {
      save.claimedRewards[String(idx)] = true;
      return parts;
    }
    if (reward.money) {
      save.money = (save.money || 0) + reward.money;
      parts.push("₽ " + reward.money);
    }
    if (reward.balls) {
      save.balls = (save.balls || 0) + reward.balls;
      parts.push("精灵球 ×" + reward.balls);
    }
    if (reward.items) {
      Object.keys(reward.items).forEach(function (k) {
        var n = reward.items[k] || 0;
        if (!n) return;
        if (k === "ball") save.balls = (save.balls || 0) + n;
        else {
          ensureItems(save);
          save.items[k] = (save.items[k] || 0) + n;
        }
        var info = (ITEM_CATALOG && ITEM_CATALOG[k]) || (typeof ITEM_INFO !== "undefined" && ITEM_INFO[k]);
        parts.push((info ? info.icon + info.name : k) + " ×" + n);
      });
    }
    if (reward.mon) {
      if (save.party.length < 6) {
        var mem = makeMember(reward.mon, reward.monLevel || 5);
        save.party.push(mem);
        markCaught(reward.mon);
        var mon = MON_BY_ID[reward.mon];
        parts.push((mon ? mon.name_zh : ("#" + reward.mon)) + " Lv." + (reward.monLevel || 5));
      } else {
        parts.push("队伍已满，跳过赠送宝可梦");
      }
    }
    save.claimedRewards[String(idx)] = true;
    renderPartyHUD();
    return parts;
  }
  function showLevelReward(idx, onOk) {
    var parts = grantLevelReward(idx);
    if (!parts || !parts.length) {
      var reward = LEVEL_REWARDS[idx] || {};
      parts = [];
      if (reward.money) parts.push("₽ " + reward.money);
      if (reward.balls) parts.push("精灵球 ×" + reward.balls);
      if (reward.items) {
        Object.keys(reward.items).forEach(function (k) {
          var n = reward.items[k] || 0;
          if (!n) return;
          var info = (ITEM_CATALOG && ITEM_CATALOG[k]) || (typeof ITEM_INFO !== "undefined" && ITEM_INFO[k]);
          parts.push((info ? info.icon + info.name : k) + " ×" + n);
        });
      }
      if (reward.mon) {
        var mon2 = MON_BY_ID[reward.mon];
        parts.push((mon2 ? mon2.name_zh : ("#" + reward.mon)) + " Lv." + (reward.monLevel || 5));
      }
    }
    if ((!parts || !parts.length) && !(idx === LEVELS.length - 1 || (save && save.champion))) {
      if (onOk) onOk();
      return;
    }
    if (idx === LEVELS.length - 1 || (save && save.champion)) {
      if (parts.indexOf("🏆 关都联盟冠军") < 0) parts.push("🏆 关都联盟冠军");
    }
    saveGame();
    var modal = document.getElementById("rpg-reward");
    var title = document.getElementById("rpg-reward-title");
    var body = document.getElementById("rpg-reward-body");
    var okBtn = document.getElementById("rpg-reward-ok");
    if (!modal || !title || !body || !okBtn) {
      if (parts && parts.length) toast(parts.join(" / "));
      if (onOk) onOk();
      return;
    }
    title.textContent = "🎉 通关章节 " + (idx + 1) + " · " + (LEVELS[idx] ? LEVELS[idx].name : "");
    body.innerHTML = parts.map(function (p) { return '<div class="rpg-reward-item">' + p + '</div>'; }).join("");
    modal.classList.remove("hidden");
    okBtn.onclick = function () { modal.classList.add("hidden"); if (onOk) onOk(); };
  }

  function advanceLevel() {
    if (save.level >= LEVELS.length - 1) { showVictory(); return; }
    var cleared = save.level;
    save.level++;
    if (save.level > (save.maxLevel || 0)) save.maxLevel = save.level;
    if (save.level > (save.maxUnlocked || 0)) save.maxUnlocked = save.level;
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
      save = normalizeSave(loaded);
      // 修正可能的字段缺失
      save.party.forEach(function (m) {
        if (m.status === undefined) m.status = null;
        if (!m.moves || m.moves.length === 0) {
          var mon = MON_BY_ID[m.id];
          m.moves = getLearnset(mon).filter(function (mv) { return mv.level <= m.level; });
        }
        if (m.moves) m.moves.forEach(function (mv) { ensureMovePP(mv); });
      });
      if (typeof save.balls !== "number") save.balls = 10;
      if (!save.items) save.items = { potion: 0, full: 0 };
      ensureItems(save);
      if (!save.defeated) save.defeated = {};
      if (!save.npcDone) save.npcDone = {};
      if (!save.dex) save.dex = { seen: {}, caught: {} };
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
    var bagBtn = document.getElementById("rpg-bag-btn"); if (bagBtn) bagBtn.addEventListener("click", openBag);
    var bagClose = document.getElementById("rpg-bag-close"); if (bagClose) bagClose.addEventListener("click", closeBag);
    var shopClose = document.getElementById("rpg-shop-close"); if (shopClose) shopClose.addEventListener("click", closeShop);
    var dexBtn = document.getElementById("rpg-dex"); if (dexBtn) dexBtn.addEventListener("click", showPokedex);
    var dexClose = document.getElementById("rpg-dex-close"); if (dexClose) dexClose.addEventListener("click", hidePokedex);
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
    // 音效开关（首次点击会启动音频）
    var soundBtn = document.getElementById("rpg-sound");
    if (soundBtn) {
      updateSoundIcon();
      soundBtn.addEventListener("click", function () {
        audioKick();
        if (window.BattleAudio) { window.BattleAudio.toggleMute(); updateSoundIcon(); }
      });
    }
    // 首次用户手势启动音频（浏览器自动播放策略要求）
    var kick = function () { audioKick(); };
    document.addEventListener("pointerdown", kick, { once: true });
    document.addEventListener("keydown", kick, { once: true });

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
