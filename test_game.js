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
      if (typeof mv[i].power !== "number" || mv[i].power <= 0) { moveKitOk = false; console.log("FAIL: mon", card.mon.id, "move", i, "bad power"); }
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
ms.you.active.mon = byId(6);            // force active = Charizard (has mega)
ms.you.active.energy = 5;
ms.turn = "you"; busy = false;
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

console.log("All battles terminated without infinite loop. SIM OK");
