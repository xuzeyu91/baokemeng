// RPG headless validation + battle simulation
// Usage: node test_rpg.js
global.window = global;
// run setTimeout callbacks immediately (battle flow is timeout-chained)
global.setTimeout = function (fn) {
  try { if (typeof fn === "function") fn(); } catch (e) { console.error("setTimeout fn error:", e && e.message); }
  return 0;
};
global.clearTimeout = function () {};
global.requestAnimationFrame = function () { return 0; };
global.Image = function () {
  this.complete = false;
  this.naturalWidth = 0;
  this.src = "";
  this.onerror = null;
};
global.localStorage = (function () {
  var store = {};
  return {
    getItem: function (k) { return store.hasOwnProperty(k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    clear: function () { store = {}; },
    _dump: function () { return store; }
  };
})();

function fakeEl() {
  return {
    innerHTML: "", textContent: "", value: "", disabled: false,
    style: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    addEventListener: function () {}, setAttribute: function () {}, getAttribute: function () { return null; },
    appendChild: function () {}, removeChild: function () {}, remove: function () {}, insertAdjacentHTML: function () {},
    querySelector: function () { return fakeEl(); }, querySelectorAll: function () { return []; },
    parentNode: null, parentElement: null,
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 100, height: 100 }; },
    getContext: function () {
      return {
        setTransform: function () {}, clearRect: function () {}, save: function () {}, restore: function () {},
        translate: function () {}, scale: function () {}, drawImage: function () {}, fillRect: function () {},
        strokeRect: function () {}, beginPath: function () {}, arc: function () {}, ellipse: function () {},
        moveTo: function () {}, lineTo: function () {}, closePath: function () {}, fill: function () {},
        stroke: function () {}, fillText: function () {},
        fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", textAlign: "", textBaseline: "", globalAlpha: 1
      };
    }
  };
}
var _els = {};
global.document = {
  readyState: "complete",
  body: null,
  getElementById: function (id) { return _els[id] || (_els[id] = fakeEl()); },
  querySelectorAll: function () { return []; },
  querySelector: function () { return fakeEl(); },
  createElement: function () { return fakeEl(); },
  addEventListener: function () {},
  removeEventListener: function () {}
};
global.matchMedia = function () { return { matches: false }; };

var fs = require("fs");
eval(fs.readFileSync("data.js", "utf8"));
try { eval(fs.readFileSync("moves.js", "utf8")); } catch (e) { console.log("WARN: moves.js", e.message); }
try { eval(fs.readFileSync("mon_moves.js", "utf8")); } catch (e) { console.log("WARN: mon_moves.js", e.message); }

// Load rpg.js but prevent auto-init races by ensuring DOM ready path uses our fake doc
var rpgSrc = fs.readFileSync("rpg.js", "utf8");
// Extract internal helpers by re-eval under a hook: patch end so we can access nothing private.
// Instead: re-implement critical pure helpers + smoke-run via DOM simulation of public flows.
// We eval rpg.js as-is; it will call init() which binds events. Then we drive via localStorage + exposed state is private.
// So we re-extract pure functions by evaluating a stripped copy with exports.

// ---- Approach: parse and re-run pure functions via a sandbox that exports them ----
var exportHook = "\n" +
  "window.__RPG_TEST__ = {\n" +
  "  LIST: LIST, MON_BY_ID: MON_BY_ID, LEVELS: LEVELS, LEVEL_POS: LEVEL_POS, LEVEL_REWARDS: LEVEL_REWARDS,\n" +
  "  BADGE_ORDER: BADGE_ORDER, ITEM_CATALOG: ITEM_CATALOG, ITEM_INFO: ITEM_INFO,\n" +
  "  TYPE_COLOR: TYPE_COLOR, TYPE_STATUS: TYPE_STATUS,\n" +
  "  clamp: clamp, typeMult: typeMult, movePower: movePower, getLearnset: getLearnset,\n" +
  "  evolutionLevel: evolutionLevel, nextEvolution: nextEvolution, equippedMoves: equippedMoves,\n" +
  "  statLine: statLine, expToNext: expToNext, expReward: expReward, baseStatTotal: baseStatTotal,\n" +
  "  isEligibleWild: isEligibleWild, buildLevelMap: buildLevelMap, ensureConnectivity: ensureConnectivity,\n" +
  "  isBlocking: isBlocking, buildWildPool: buildWildPool, makeMember: makeMember,\n" +
  "  ensureMovePP: ensureMovePP, ensureItems: ensureItems, normalizeSave: normalizeSave,\n" +
  "  badgeCount: badgeCount, defaultShopStock: defaultShopStock, moveFromSlug: moveFromSlug,\n" +
  "  statusDefaultTurns: statusDefaultTurns, weatherMult: weatherMult,\n" +
  "  isPhysMove: isPhysMove, hasStab: hasStab, expected: expected,\n" +
  "  grantLevelReward: grantLevelReward,\n" +
  "  getSave: function(){ return save; }, setSave: function(s){ save = s; },\n" +
  "  getPlayer: function(){ return player; }, getBattle: function(){ return battle; },\n" +
  "  getMap: function(){ return { MAP: MAP, MAP_W: MAP_W, MAP_H: MAP_H, START: START, TRAINERS: TRAINERS, NPCS: NPCS }; },\n" +
  "  loadLevel: loadLevel, buildCombat: buildCombat, startBattle: startBattle,\n" +
  "  resolveMove: resolveMove, commitMove: commitMove, preActionStatus: preActionStatus,\n" +
  "  tickStatus: tickStatus, finishRound: finishRound, playerAct: playerAct, doCapture: doCapture,\n" +
  "  doSwitch: doSwitch, doRun: doRun, doUseItem: doUseItem, oppTurn: oppTurn, onFaint: onFaint,\n" +
  "  endBattle: endBattle, healParty: healParty, saveGame: saveGame, loadGame: loadGame,\n" +
  "  markSeen: markSeen, markCaught: markCaught, playerSpriteId: playerSpriteId,\n" +
  "  hasConsciousMember: hasConsciousMember, levelCleared: levelCleared,\n" +
  "  openShop: openShop, buyItem: buyItem, useFieldItem: useFieldItem,\n" +
  "  newGame: newGame, advanceLevel: advanceLevel, showLevelReward: showLevelReward,\n" +
  "  tryMove: tryMove, onArrive: onArrive\n" +
  "};\n";

// Avoid double-init issues: replace auto-init with no-op after defining test export
var patched = rpgSrc
  .replace(
    /if \(typeof document !== "undefined" && document\.getElementById\) \{\s*if \(document\.readyState === "loading"\) document\.addEventListener\("DOMContentLoaded", init\);\s*else init\(\);\s*\}/,
    exportHook + "\n  window.__RPG_INIT__ = init;\n"
  );
eval(patched);

var R = window.__RPG_TEST__;
var fails = 0, passes = 0;
function assert(c, m) {
  if (!c) { fails++; console.log("FAIL:", m); }
  else { passes++; }
}

console.log("=== RPG automated tests ===\n");

// 1) Data / learnset basics
assert(R.LIST && R.LIST.length === 1025, "POKEMON_LIST length 1025");
assert(!!R.MON_BY_ID[1] && R.MON_BY_ID[1].name_zh === "妙蛙种子", "MON_BY_ID[1] 妙蛙种子");
assert(R.LEVELS.length === 10, "LEVELS 10 chapters");
assert(R.LEVEL_POS.length === 10, "LEVEL_POS 10");
assert(R.BADGE_ORDER.length === 8, "8 badges");
assert(R.LEVEL_REWARDS.length === 10, "LEVEL_REWARDS 10");

// 2) stat / exp / type
var st5 = R.statLine(R.MON_BY_ID[1], 5);
assert(st5.hp > 0 && st5.attack > 0, "statLine level 5 positive");
assert(R.expToNext(5) > 0, "expToNext > 0");
assert(R.typeMult("fire", ["grass"]) === 2, "fire>grass 2x");
assert(R.typeMult("electric", ["ground"]) === 0, "electric>ground 0x");
assert(R.typeMult("water", ["fire", "rock"]) === 4, "water>fire/rock 4x");

// 3) makeMember + moves
var m1 = R.makeMember(1, 5);
assert(m1.id === 1 && m1.level === 5 && m1.hp === st5.hp, "makeMember hp/level");
assert(Array.isArray(m1.moves) && m1.moves.length >= 1, "makeMember has moves");
m1.moves.forEach(function (mv) {
  assert(mv.name && mv.type, "move has name/type: " + (mv && mv.name));
  assert(mv.power != null || mv.kind === "status", "move power defined for " + mv.name);
  R.ensureMovePP(mv);
  assert(mv.pp > 0 && mv.maxPp > 0, "move PP for " + mv.name);
});

// 4) learnset always has at least one damaging 1-cost-ish move for starters
[1, 4, 7, 25, 133, 152].forEach(function (id) {
  var mon = R.MON_BY_ID[id];
  var ls = R.getLearnset(mon);
  assert(ls.length >= 1, "learnset nonempty for " + mon.name_zh);
  var dmg = ls.filter(function (x) { return x.power > 0; });
  assert(dmg.length >= 1, mon.name_zh + " has damage move");
});

// 5) normalizeSave dex migration + defaults
var raw = R.normalizeSave({ party: [R.makeMember(25, 10)], balls: 3 });
assert(raw.money === 3000, "normalize money default 3000");
assert(raw.dex && raw.dex.seen && raw.dex.caught, "normalize creates dex");
assert(raw.items && raw.items.potion === 0, "normalize items");
var legacy = R.normalizeSave({ party: [R.makeMember(4, 8)], seen: { "4": true }, caught: { "4": true } });
assert(legacy.dex.seen["4"] === true && legacy.dex.caught["4"] === true, "legacy seen/caught migrate into dex");

// 6) Map generation: all levels build, connectivity for trainers+NPCs, no NPC on blocking tile
for (var li = 0; li < R.LEVELS.length; li++) {
  var cfg = R.LEVELS[li];
  var grid = R.buildLevelMap(cfg);
  assert(grid.length === 20 && grid[0].length === 30, "map size 30x20 level " + li);
  var pos = R.LEVEL_POS[li];
  // BFS walkability
  function bfs(start) {
    var W = 30, H = 20, seen = {}, q = [start.slice()];
    seen[start[0] + "," + start[1]] = true;
    while (q.length) {
      var p = q.shift(), x = p[0], y = p[1];
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(function (d) {
        var nx = x + d[0], ny = y + d[1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
        var k = nx + "," + ny;
        if (seen[k]) return;
        if (R.isBlocking(grid[ny][nx])) return;
        seen[k] = true; q.push([nx, ny]);
      });
    }
    return seen;
  }
  var reach = bfs(pos.start);
  assert(!!reach[pos.goal[0] + "," + pos.goal[1]], "goal reachable L" + li);
  cfg.trainers.forEach(function (t) {
    assert(!!reach[t.x + "," + t.y], "trainer " + t.id + " reachable L" + li);
    assert(!R.isBlocking(grid[t.y][t.x]), "trainer " + t.id + " not on block L" + li);
  });
  (cfg.npcs || []).forEach(function (n) {
    assert(!!reach[n.x + "," + n.y], "npc " + n.id + " reachable L" + li);
    assert(!R.isBlocking(grid[n.y][n.x]), "npc " + n.id + " not on block L" + li);
  });
  // center is always C (even if spawn coincides with center)
  assert(grid[cfg.center[1]][cfg.center[0]] === "C", "center tile C L" + li + " got " + grid[cfg.center[1]][cfg.center[0]]);
  // start tile is walkable (P or C if colocated)
  var sc = grid[pos.start[1]][pos.start[0]];
  assert(sc === "P" || sc === "C", "start walkable L" + li + " got " + sc);
}

// 7) Save/load roundtrip
R.setSave(R.normalizeSave({
  party: [R.makeMember(1, 5)], money: 1234, balls: 7,
  badges: { boulder: true }, defeated: { "r1-boy": true },
  npcDone: {}, dex: { seen: { "1": true }, caught: { "1": true } },
  level: 0, maxLevel: 0, items: { potion: 2 }
}));
R.saveGame();
var loaded = R.loadGame();
assert(loaded && loaded.money === 1234, "save/load money");
assert(loaded.balls === 7, "save/load balls");
assert(loaded.badges.boulder === true, "save/load badge");
assert(loaded.party[0].id === 1 && loaded.party[0].level === 5, "save/load party");
assert(loaded.dex.caught["1"] === true, "save/load dex");

// 8) Battle: start with fainted lead should pick conscious mon
R.setSave(R.normalizeSave({
  party: [
    (function () { var m = R.makeMember(1, 10); m.hp = 0; return m; })(),
    R.makeMember(4, 10)
  ],
  balls: 5, money: 1000, level: 0, maxLevel: 0,
  defeated: {}, npcDone: {}, dex: { seen: {}, caught: {} },
  items: { potion: 1 }
}));
R.loadLevel(0, false);
var opp = [R.makeMember(16, 3)];
R.startBattle({ wild: true, name: "野生宝可梦", oppParty: opp });
var b = R.getBattle();
assert(b && b.you.idx === 1, "startBattle skips fainted lead (idx=1)");
assert(b.you.party[b.you.idx].hp > 0, "active mon conscious");
assert(b.you.participants[1] === true, "participant marks living lead");

// 9) resolveMove damage positive for tackle-like, STAB/crit fields present
var att = R.buildCombat(R.makeMember(4, 20), true); // 小火龙
var def = R.buildCombat(R.makeMember(1, 20), false); // 妙蛙种子
// force hit by stubbing Math.random high for hit, low for status/crit variance mid
var realRandom = Math.random;
Math.random = function () { return 0.5; };
var dmgMv = att.moves.find(function (x) { return x.power > 0; }) || att.moves[0];
var res = R.resolveMove(att, def, dmgMv);
assert(!res.miss, "resolveMove hit");
assert(res.dmg > 0, "resolveMove dmg > 0 got " + res.dmg);
R.commitMove(def, res, dmgMv);
assert(def.hp < def.maxHp, "commitMove reduces hp");

// type advantage: fire vs grass should deal more than fire vs water
var grassDef = R.buildCombat(R.makeMember(1, 20), false);
var waterDef = R.buildCombat(R.makeMember(7, 20), false);
var fireMv = att.moves.find(function (x) { return x.type === "fire" && x.power > 0; }) || dmgMv;
var rGrass = R.resolveMove(att, grassDef, fireMv);
var rWater = R.resolveMove(att, waterDef, fireMv);
assert(rGrass.dmg >= rWater.dmg, "fire dmg grass >= water (got " + rGrass.dmg + " vs " + rWater.dmg + ")");
Math.random = realRandom;

// 10) Capture success path adds to party
R.setSave(R.normalizeSave({
  party: [R.makeMember(25, 15)],
  balls: 10, money: 500, level: 0, maxLevel: 0,
  defeated: {}, npcDone: {}, dex: { seen: {}, caught: {} },
  items: {}
}));
R.loadLevel(0, false);
var wild = R.makeMember(16, 3);
wild.hp = 1;
R.startBattle({ wild: true, name: "野生", oppParty: [wild] });
// force capture success
Math.random = function () { return 0; };
var before = R.getSave().party.length;
R.doCapture("ball");
var after = R.getSave().party.length;
// doCapture ends battle asynchronously via setTimeout (sync in our stub)
assert(after === before + 1 || (R.getBattle() && R.getBattle().you.party.length === before + 1),
  "capture adds mon to party");
assert(R.getSave().balls === 9, "capture consumes ball");
Math.random = realRandom;

// 11) Shop buy reduces money / increases item
R.setSave(R.normalizeSave({
  party: [R.makeMember(1, 5)], money: 1000, balls: 0, level: 0,
  items: { potion: 0 }, badges: {}, defeated: {}, npcDone: {}, dex: { seen: {}, caught: {} }
}));
R.buyItem("potion", 300);
assert(R.getSave().money === 700, "buy potion money 1000-300");
assert(R.getSave().items.potion === 1, "buy potion stock +1");
R.buyItem("ball", 200);
assert(R.getSave().balls === 1, "buy ball increments balls");

// 12) grantLevelReward idempotent
R.setSave(R.normalizeSave({
  party: [R.makeMember(1, 5)], money: 0, balls: 0, level: 0,
  items: {}, badges: {}, defeated: {}, npcDone: {}, claimedRewards: {},
  dex: { seen: {}, caught: {} }
}));
var p1 = R.grantLevelReward(0);
var moneyAfter = R.getSave().money;
var p2 = R.grantLevelReward(0);
assert(p1.length > 0, "grantLevelReward 0 yields parts");
assert(p2.length === 0, "grantLevelReward 0 second time empty");
assert(R.getSave().money === moneyAfter, "reward money not double-granted");

// 13) playerSpriteId prefers living party mon
R.setSave(R.normalizeSave({
  party: [
    (function () { var m = R.makeMember(1, 5); m.hp = 0; return m; })(),
    R.makeMember(25, 5)
  ]
}));
assert(R.playerSpriteId() === 25, "playerSpriteId skips fainted lead");

// 14) hasConsciousMember
assert(R.hasConsciousMember() === true, "has conscious when one alive");
R.getSave().party.forEach(function (m) { m.hp = 0; });
assert(R.hasConsciousMember() === false, "no conscious when all fainted");

// 15) healParty restores
R.healParty();
assert(R.getSave().party.every(function (m) { return m.hp > 0; }), "healParty restores hp");

// 16) Trainer prize + badge on endBattle win
R.setSave(R.normalizeSave({
  party: [R.makeMember(25, 30)],
  money: 0, balls: 5, level: 1, maxLevel: 1,
  badges: {}, defeated: {}, npcDone: {}, dex: { seen: {}, caught: {} }, items: {}
}));
R.loadLevel(1, false);
var map = R.getMap();
var gym = (map.TRAINERS || []).filter(function (t) { return t.badge; })[0];
if (gym) {
  R.startBattle({
    wild: false, name: gym.name, trainerId: gym.id, trainerRef: gym,
    trainerStage: 0, trainerStages: 1,
    oppParty: gym.party.map(function (p) { return R.makeMember(p.id, p.level); })
  });
  // KO all opp
  var bb = R.getBattle();
  bb.opp.party.forEach(function (c) { c.hp = 0; c.fainted = true; });
  R.endBattle("win");
  assert(R.getSave().defeated[gym.id] === true, "trainer defeated marked");
  assert(R.getSave().money > 0, "prize money granted");
  assert(R.getSave().badges[gym.badge] === true, "badge granted " + gym.badge);
} else {
  assert(false, "gym trainer with badge found on level 1");
}

// 17) weatherMult sanity
assert(R.weatherMult("fire", "sunny") === 1.5, "sunny boosts fire");
assert(R.weatherMult("water", "sunny") < 1, "sunny weakens water");
assert(R.weatherMult("water", "rain") === 1.5, "rain boosts water");

// 18) evolution data for bulbasaur
var evo = R.nextEvolution(R.MON_BY_ID[1]);
assert(evo && evo.id === 2, "bulbasaur evolves to ivysaur");
assert(R.evolutionLevel(R.MON_BY_ID[1]) > 0, "evolution level defined");

// 19) draw path / player sprite id used after newGame-like save
R.setSave(R.normalizeSave({ party: [R.makeMember(7, 5)], balls: 10, money: 3000, level: 0, dex: { seen: {}, caught: {} } }));
assert(R.playerSpriteId() === 7, "playerSpriteId uses party[0]");

// 20) Multi-stage trainers exist and stages valid
var multi = 0;
R.LEVELS.forEach(function (lv) {
  (lv.trainers || []).forEach(function (t) {
    if (t.stages) {
      multi++;
      assert(t.stages.length >= 2, "multi-stage has >=2 " + t.id);
      t.stages.forEach(function (st) {
        assert(Array.isArray(st) && st.length >= 1, "stage party nonempty " + t.id);
      });
    }
  });
});
console.log("  multi-stage trainers:", multi);

console.log("\n=== Results: " + passes + " passed, " + fails + " failed ===");
process.exit(fails ? 1 : 0);
