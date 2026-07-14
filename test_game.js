// Headless validation + full auto-battle simulation
global.window = global;
global.setTimeout = function (fn) { fn(); return 0; }; // run synchronously
function fakeEl() {
  return {
    innerHTML: "", textContent: "", value: "", disabled: false,
    style: {}, classList: { add(){}, remove(){}, toggle(){} },
    addEventListener(){}, setAttribute(){}, getAttribute(){ return null; },
    appendChild(){}, removeChild(){}, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { left:0, top:0, width:100, height:100 }; }
  };
}
const _els = {};
global.document = {
  readyState: "complete",
  body: null,
  getElementById: function (id) { return _els[id] || (_els[id] = fakeEl()); },
  querySelectorAll: function () { return []; },
  createElement: function () { return fakeEl(); },
  addEventListener: function () {}
};

const fs = require("fs");
// load data + game
eval(fs.readFileSync("data.js", "utf8"));
try { eval(fs.readFileSync("moves.js", "utf8")); } catch (e) { console.log("WARN: moves.js not ready, using fallback moves"); }
try { eval(fs.readFileSync("mon_moves.js", "utf8")); } catch (e) { console.log("WARN: mon_moves.js not ready, using fallback moves"); }
eval(fs.readFileSync("game.js", "utf8"));

// ---- 1. dataset integrity ----
const L = window.POKEMON_LIST, E = window.TYPE_EFFECT, TZ = window.TYPE_ZH;
let ok = true;
function assert(c, m) { if (!c) { ok = false; console.log("FAIL:", m); } }

assert(L.length === 1025, "count == 1025 (got " + L.length + ")");
const types = Object.keys(E);
assert(types.length === 18, "18 types (got " + types.length + ")");
L.forEach(p => {
  assert(p.name_zh && p.name_zh.length > 0, "zh name for " + p.id);
  assert(p.types.length >= 1 && p.types.length <= 2, "types 1-2 for " + p.id);
  ["hp","attack","defense","sp_attack","sp_defense","speed"].forEach(s =>
    assert(typeof p[s] === "number" && p[s] > 0, s + " for " + p.id));
  p.types.forEach(t => assert(TZ[t], "type_zh for " + t));
  // evolution + mega fields present and well-typed
  assert(Array.isArray(p.evolves_to), "evolves_to array for " + p.id);
  assert(p.evolves_from === null || typeof p.evolves_from === "number", "evolves_from null/number for " + p.id);
  assert(Array.isArray(p.mega), "mega array for " + p.id);
  p.mega.forEach(m => {
    assert(m.isMega === true, "mega flag for base " + p.id);
    assert(m.types.length >= 1 && m.types.length <= 2, "mega types for base " + p.id);
    ["hp","attack","defense","sp_attack","sp_defense","speed"].forEach(s =>
      assert(typeof m[s] === "number" && m[s] > 0, "mega " + s + " for base " + p.id));
    assert(!!m.name_zh, "mega zh name for base " + p.id);
  });
  // matrix complete
  types.forEach(d => assert(E[t = p.types[0]] !== undefined, "matrix row " + t));
});
// matrix fully populated 18x18
types.forEach(a => types.forEach(b => assert(E[a][b] !== undefined, "cell " + a + "/" + b)));

// ---- 2. known type multipliers ----
assert(E.fire.grass === 2, "fire>grass 2x");
assert(E.electric.ground === 0, "electric>ground 0x");
assert(E.normal.ghost === 0, "normal>ghost 0x");
assert(E.dragon.dragon === 2, "dragon>dragon 2x");
assert(E.water.fire === 2, "water>fire 2x");
assert(E.grass.fire === 0.5, "grass>fire 0.5x");
assert(E.ghost.psychic === 0, "ghost>psychic 0x (gen1 bug)");
assert(E.psychic.ghost === 1, "psychic>ghost 1x (gen1: ghost not weak to psychic)");

// ---- Gen2 (steel/dark) known multipliers ----
assert(E.steel.ice === 2, "steel>ice 2x");
assert(E.steel.rock === 2, "steel>rock 2x");
assert(E.dark.psychic === 2, "dark>psychic 2x");
assert(E.dark.ghost === 2, "dark>ghost 2x");
assert(E.fire.steel === 2, "fire>steel 2x");
assert(E.fighting.steel === 2, "fighting>steel 2x");
assert(E.ground.steel === 2, "ground>steel 2x");
assert(E.poison.steel === 0, "poison>steel 0x (steel immune to poison)");
assert(E.psychic.dark === 0, "psychic>dark 0x (dark immune to psychic)");
assert(E.fighting.dark === 2, "fighting>dark 2x");
assert(E.bug.dark === 2, "bug>dark 2x");
assert(E.steel.steel === 0.5, "steel>steel 0.5x");

// ---- Gen6 (fairy) known multipliers ----
assert(E.fairy.dragon === 2, "fairy>dragon 2x");
assert(E.fairy.dark === 2, "fairy>dark 2x");
assert(E.fairy.fighting === 2, "fairy>fighting 2x");
assert(E.fairy.fire === 0.5, "fairy>fire 0.5x");
assert(E.fairy.poison === 0.5, "fairy>poison 0.5x");
assert(E.fairy.steel === 0.5, "fairy>steel 0.5x");
assert(E.dragon.fairy === 0, "dragon>fairy 0x (fairy immune to dragon)");
assert(E.poison.fairy === 2, "poison>fairy 2x");
assert(E.steel.fairy === 2, "steel>fairy 2x");
assert(E.bug.fairy === 0.5, "bug>fairy 0.5x");
assert(E.dark.fairy === 0.5, "dark>fairy 0.5x");
assert(E.fighting.fairy === 0.5, "fighting>fairy 0.5x");

// ---- evolution chain + mega spot checks ----
const byId = id => L.find(p => p.id === id);
assert(byId(4).evolves_to.length === 1 && byId(4).evolves_to[0] === 5, "charmander -> charmeleon");
assert(byId(5).evolves_from === 4 && byId(5).evolves_to[0] === 6, "charmeleon chain 4->5->6");
assert(byId(6).evolves_from === 5, "charizard evolves_from charmander? no, from charmeleon(5)");
assert(byId(133).evolves_to.length === 8, "eevee has 8 evolutions");
assert(byId(6).mega.length === 2 && byId(6).mega[0].isMega, "charizard 2 mega forms");
assert(byId(3).mega.length === 1, "venusaur 1 mega form");
assert(byId(888).mega.length === 0, "zacian is not a mega base");
assert(L.filter(p => p.mega.length > 0).length === 47, "47 mega base species (got " + L.filter(p => p.mega.length > 0).length + ")");

console.log(ok ? "DATASET OK (1025 pokemon, 18 types, chart valid)" : "DATASET HAS ISSUES");

// ---- 2b. 4-move kit structure for ALL 721 pokemon ----
let moveKitOk = true;
const expectCosts = [1, 1, 2, 3];
const decks = [];
for (let s = 0; s + 12 <= L.length; s += 12) decks.push(L.slice(s, s + 12));
decks.push(L.slice(L.length - 12, L.length)); // tail coverage (1014-1025)
for (const deck of decks) {
  window.PK._beginCustom(deck);
  const st = window.PK._state();
  [st.you.active, ...st.you.bench, ...st.you.deck].forEach(card => {
    const mv = card.moves;
    if (mv.length !== 4) { moveKitOk = false; console.log("FAIL: mon", card.mon.id, "has", mv.length, "moves"); }
    for (let i = 0; i < 4; i++) {
      if (mv[i].cost !== expectCosts[i]) { moveKitOk = false; console.log("FAIL: mon", card.mon.id, "move", i, "cost", mv[i].cost); }
      // 伤害招必须 power>0；变化招(强化/削弱/回复/异常/控场)power 为 0 属正常
      if (mv[i].kind === "damage" && (typeof mv[i].power !== "number" || mv[i].power <= 0)) { moveKitOk = false; console.log("FAIL: mon", card.mon.id, "move", i, "bad power"); }
      if (!TZ[mv[i].type]) { moveKitOk = false; console.log("FAIL: mon", card.mon.id, "move", i, "bad type", mv[i].type); }
    }
  });
}
assert(moveKitOk, "every mon has 4 moves with costs [1,1,2,3], valid power & type");
console.log(ok ? "MOVE KIT OK (4 moves per mon, costs [1,1,2,3], all 1025 covered)" : "MOVE KIT ISSUES");

// ---- 3. full auto battle (human always uses move 0) ----
let wins = { you: 0, ai: 0 }, battles = 30, maxTurns = 0;
for (let b = 0; b < battles; b++) {
  window.PK.restart();
  let st = window.PK._state();
  let guard = 0;
  while (!st.over && guard < 3000) {
    // in the synchronous model each move cascades back to the human turn
    if (st.turn === "you") {
      window.PK._useMove(0);
    }
    st = window.PK._state();
    guard++;
  }
  maxTurns = Math.max(maxTurns, guard);
  assert(st.over, "battle " + b + " ended (guard=" + guard + ")");
  wins[st.winner]++;
}
console.log("Battles:", battles, "| you wins:", wins.you, "| ai wins:", wins.ai, "| maxSteps:", maxTurns);

// ---- 4. custom deck start ----
// NOTE: _beginCustom -> beginGame -> startRound. In this headless harness
// setTimeout runs synchronously, so if the AI moves first the whole battle
// cascades to completion and mutates the roster before we can inspect it.
// Make setTimeout a no-op here so we can assert the *initial* 12-mon line-up.
// (In a real browser setTimeout is async, so startRound just begins turn 1.)
const _realSetTimeout = global.setTimeout;
global.setTimeout = function () { return 0; };
const custom = L.slice(0, 12);
window.PK._beginCustom(custom);
const st2 = window.PK._state();
assert(st2 && st2.you.active.mon.id === 1, "custom active is #1");
assert(st2.you.bench.length === 4, "custom bench 4");
assert(st2.you.deck.length === 7, "custom deck 7");
assert(st2.ai.active.mon.id !== 1, "ai avoids player's #1");

console.log(ok ? "CUSTOM DECK OK (12 chosen, 4 bench, 7 deck)" : "CUSTOM DECK ISSUES");

// ---- 5. Mega Evolution mechanics (player path) ----
global.setTimeout = function () { return 0; }; // no-op: isolate mega effects from turn flow
const megaTeam = [byId(6), byId(4), byId(5), byId(7), byId(8), byId(9), byId(1), byId(2), byId(3), byId(10), byId(11), byId(12)];
window.PK._beginCustom(megaTeam);
let ms = window.PK._state();
// no-op setTimeout may have cascaded a full battle (if AI moved first); reset to a clean,
// non-finished state so onMega's `state.over` guard doesn't block the test.
ms.over = false; ms.winner = null; busy = false;
ms.turn = "you"; ms.firstMover = "you";
const _ch = byId(6);
ms.you.active.mon = _ch;                // force active = Charizard (has mega)
ms.you.active.maxHp = _ch.hp; ms.you.active.hp = _ch.hp;
ms.you.active.buffs = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
ms.you.active.status = null;
ms.you.active.energy = 5;
ms.you.megaUsed = false; ms.you.dynamaxUsed = false;
const beforeName = ms.you.active.mon.name_zh;
window.PK._mega(0);                      // Mega Evolve into X form
const ac = ms.you.active;
assert(ac.mon.name_zh === "喷火龙 超级进化 X", "charizard mega -> X name (got " + ac.mon.name_zh + ")");
assert(ac.mon.types.join("/") === "fire/dragon", "mega X is fire/dragon");
assert(ms.you.megaUsed === true, "megaUsed flag set");
assert(ac.energy === 3, "mega cost 2 energy (got " + ac.energy + ")");
assert(ac.maxHp === 78, "mega maxHp updated (got " + ac.maxHp + ")");
assert(ac.moves.length === 4, "mega moves rebuilt (got " + ac.moves.length + ")");
window.PK._mega(0);                      // second mega attempt must be blocked
assert(ac.mon.name_zh === "喷火龙 超级进化 X", "no second mega (still X)");
console.log(ok ? "MEGA OK (player path: transform, cost, once-per-battle, moves rebuilt)" : "MEGA ISSUES");

// ---- 6. Dynamax mechanics (player path + timed revert) ----
global.setTimeout = function (fn) { fn(); return 0; }; // synchronous: drive turns directly
const dmaxTeam = [byId(6), byId(4), byId(5), byId(7), byId(8), byId(9), byId(1), byId(2), byId(3), byId(10), byId(11), byId(12)];
window.PK._beginCustom(dmaxTeam);
let ds = window.PK._state();
// synchronous setTimeout cascades a full battle to completion; reset to a clean state
ds.over = false; ds.winner = null; busy = false;
ds.turn = "you"; ds.firstMover = "you";
const _dch = byId(6);
ds.you.active.mon = _dch;               // Charizard (any species can Dynamax)
ds.you.active.maxHp = _dch.hp; ds.you.active.hp = _dch.hp;
ds.you.active.buffs = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
ds.you.active.status = null; ds.you.active.dynamaxTurns = 0;
ds.you.active.energy = 5;
ds.you.megaUsed = false; ds.you.dynamaxUsed = false;
// make the opponent harmless so our mon survives the 3-turn sim (no HP/maxHp pollution)
[ds.ai.active, ...ds.ai.bench, ...ds.ai.deck].forEach(function (c) {
  c.mon.attack = 0; c.mon.sp_attack = 0;
});
// edge: blocked when not enough energy (no turn consumed)
ds.you.active.energy = 2; // < DYNAMAX_COST (3)
window.PK._dynamax();
assert(ds.you.dynamaxUsed === false, "dynamax blocked when energy < cost (no turn consumed)");
assert(!ds.you.active.dynamaxTurns, "dynamax not started on insufficient energy");
// edge: mutually exclusive with Mega
ds.you.active.energy = 5;
ds.you.megaUsed = true;
window.PK._dynamax();
assert(ds.you.dynamaxUsed === false, "dynamax blocked after mega used");
ds.you.megaUsed = false;
// activate
let e0 = 5; ds.you.active.energy = e0;
window.PK._dynamax();
const dc = ds.you.active;
assert(ds.you.dynamaxUsed === true, "dynamaxUsed flag set");
// -DYNAMAX_COST, then the auto-beginTurn on the next player turn grants +1
assert(dc.energy === e0 - 3 + 1, "dynamax cost 3 energy (got " + dc.energy + ", expected " + (e0 - 3 + 1) + ")");
assert(dc.maxHp === Math.round(78 * 1.5), "dynamax maxHp boosted (got " + dc.maxHp + ")");
assert(dc.moves.length === 4 && dc.moves[0].name.indexOf("极巨") === 0, "max moves generated (got " + dc.moves[0].name + ")");
assert(dc.dynamaxTurns === 3, "dynamax turns set to 3 (got " + dc.dynamaxTurns + ")");
// drive turns until the 3 boosted turns elapse and it auto-reverts
let loop = 0;
while (loop < 8 && !ds.over && ds.turn === "you" && ds.you.active.dynamaxTurns) {
  ds.you.active.energy = Math.max(ds.you.active.energy, 1);
  window.PK._useMove(0);
  loop++;
}
assert(ds.you.dynamaxUsed === true, "dynamaxUsed stays true after revert");
assert(ds.you.active.mon.id === 6, "same active survived the sim");
assert(ds.you.active.dynamaxTurns === 0, "dynamax reverted after 3 turns (got " + ds.you.active.dynamaxTurns + ")");
assert(ds.you.active.maxHp === 78, "maxHp restored after revert (got " + ds.you.active.maxHp + ")");
assert(ds.you.active.moves[0].name.indexOf("极巨") !== 0, "normal moves restored after revert (got " + ds.you.active.moves[0].name + ")");
// cannot dynamax again this battle
window.PK._dynamax();
assert(ds.you.dynamaxUsed === true && !ds.you.active.dynamaxTurns, "no second dynamax this battle");
console.log(ok ? "DYNAMAX OK (activate, cost, HP boost, max moves, timed revert, once-per-battle, mutual exclusion)" : "DYNAMAX ISSUES");

console.log("All battles terminated without infinite loop. SIM OK");

// ---- 7. strategy-depth systems: items / weather / stat-stages / cooldown ----
global.setTimeout = function () { return 0; }; // no-op: inspect data without cascading
var D = window.PK._debug;
assert(Math.abs(D.stageMult(0) - 1) < 1e-9, "stage 0 -> x1");
assert(Math.abs(D.stageMult(6) - 4) < 1e-9, "stage +6 -> x4");
assert(Math.abs(D.stageMult(-6) - 0.25) < 1e-9, "stage -6 -> x0.25");
assert(Math.abs(D.stageMult(1) - 1.5) < 1e-9, "stage +1 -> x1.5");
assert(Math.abs(D.weatherMult("fire", "sunny") - 1.5) < 1e-9, "sunny fire x1.5");
assert(Math.abs(D.weatherMult("water", "sunny") - (1 / 1.5)) < 1e-9, "sunny water x2/3");
assert(Math.abs(D.weatherMult("water", "rain") - 1.5) < 1e-9, "rain water x1.5");
assert(D.weatherMult("fire", "rain") === (1 / 1.5), "rain fire weakened");
assert(D.weatherMult("normal", "none") === 1, "no weather -> x1");
assert(D.itemMult({ item: "band" }, { cat: "phys" }) === 1.5, "band phys x1.5");
assert(D.itemMult({ item: "specs" }, { cat: "spec" }) === 1.5, "specs spec x1.5");
assert(Math.abs(D.itemMult({ item: "lifeorb" }, { cat: "phys" }) - 1.3) < 1e-9, "lifeorb x1.3");
assert(D.itemMult({ item: null }, { cat: "phys" }) === 1, "no item x1");

// move metadata attached by genMoves
window.PK._beginCustom([byId(6), byId(4), byId(5), byId(7), byId(8), byId(9), byId(1), byId(2), byId(3), byId(10), byId(11), byId(12)]);
var fm = window.PK._state().you.active;
assert(fm.moves.length === 4, "fire mon 4 moves");
assert(fm.moves[3].cooldown === 1, "3-cost big move has cooldown 1");
assert(fm.moves[0].cooldown === 0, "1-cost move no cooldown");
// 招式真实化后，策略深度由真实招式提供（不再保证特定费用槽）；改为校验招式库确实带出这些系统
assert(fm.moves.some(function (m) { return m.kind === "control" || m.kind === "status" || m.kind === "boost" || m.kind === "debuff"; }),
  "fire mon kit carries a strategy move (control/status/boost/debuff)");
// 扫描全图：确认 强化 / 削弱 系统被真实招式实装并进入对战
var anyBuff = false, anyDebuff = false, anyWeather = false;
for (var z = 1; z <= 1025 && !(anyBuff && anyDebuff && anyWeather); z++) {
  window.PK._beginCustom([byId(z)].concat(L.slice(0, 11)));
  var k = window.PK._state().you.active.moves;
  k.forEach(function (m) {
    if (m.kind === "boost") anyBuff = true;
    if (m.kind === "debuff") anyDebuff = true;
    if (m.kind === "control" && (m.slug === "sunny-day" || m.slug === "rain-dance" || m.slug === "sandstorm" || m.slug === "hail")) anyWeather = true;
  });
}
assert(anyBuff, "some mon's real kit includes a self-buff move (强化 system used)");
assert(anyDebuff, "some mon's real kit includes a foe-debuff move (削弱 system used)");
assert(anyWeather, "some mon's real kit includes a weather move (天气 system used)");

// item assignment is deterministic by id (id%3===0 carries an item)
function findCard(st, id) { return [st.active].concat(st.bench, st.deck).filter(function (c) { return c.mon.id === id; })[0]; }
window.PK._beginCustom([byId(3), byId(1), byId(2), byId(4), byId(5), byId(6), byId(7), byId(8), byId(9), byId(10), byId(11), byId(12)]);
var it7 = window.PK._state().you;
var c3 = findCard(it7, 3), c1 = findCard(it7, 1);
assert(c3 && c3.item, "mon #3 (id%3==0) carries an item (got " + (c3 && c3.item) + ")");
assert(c1 && !c1.item, "mon #1 (id%3!=0) carries no item");
assert(c3.cooldowns && c3.cooldowns.length === 4 && c3.cooldowns.every(function (x) { return x === 0; }), "cooldowns init [0,0,0,0]");
assert(c3.buffs && c3.buffs.atk === 0, "buffs init zeroed");

console.log(ok ? "STRATEGY SYSTEMS OK (items/weather/stages/cooldown metadata + multipliers)" : "STRATEGY SYSTEMS ISSUES");

// ---- 8. polish features: stats/achievements, difficulty, replay ----
var Dbg = window.PK._debug;
var s0 = Dbg.loadStats();
var w0 = s0.wins || 0, t0 = s0.total || 0;
Dbg.recordResult(true, "hard");
var s1 = Dbg.loadStats();
assert(s1.wins === w0 + 1, "recordResult increments wins (got " + s1.wins + " vs " + w0 + ")");
assert(s1.total === t0 + 1, "recordResult increments total");
assert(s1.byDiff.hard === 1, "recordResult records hard-difficulty win");
assert(s1.ach.first_win === true, "first-win achievement unlocked");
var u = Dbg.recordResult(true, "easy");
assert(Array.isArray(u), "recordResult returns unlocked-achievement array");
// 难度设置会带入新对局
Dbg.setDifficulty("hard");
window.PK.restart();
var rs = window.PK._state();
assert(rs.difficulty === "hard", "difficulty applied to battle state (got " + rs.difficulty + ")");
// 回放：跑一场完整对战，验证 replay 记录了关键帧
global.setTimeout = function (fn) { fn(); return 0; };
window.PK.restart();
var rp = window.PK._state();
var rg = 0;
while (!rp.over && rg < 3000) {
  if (rp.turn === "you") window.PK._useMove(0);
  rp = window.PK._state();
  rg++;
}
assert(rp.over, "replay-battle ended (guard=" + rg + ")");
assert(rp.replay && rp.replay.length > 0, "replay recorded frames (got " + (rp.replay ? rp.replay.length : 0) + ")");
var fr0 = rp.replay[0];
assert(fr0 && typeof fr0.text === "string", "replay frame has text");
assert(fr0 && typeof fr0.youHp === "number" && typeof fr0.aiHp === "number", "replay frame has HP snapshot");
console.log(ok ? "POLISH OK (stats/achievements, difficulty, replay recording)" : "POLISH ISSUES");

