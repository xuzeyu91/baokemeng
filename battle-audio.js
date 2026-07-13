/* 宝可梦卡牌对战 — 音效与背景音乐引擎 (dependency-free Web Audio)
 * 暴露 window.BattleAudio：
 *   init()        首次用户手势时创建 AudioContext（浏览器自动播放策略要求）
 *   play(name)    播放指定音效（出手/命中/暴击/击倒/进化/极巨/换人/回复/天气/胜负/成就）
 *   startBGM()    开始循环背景音乐
 *   stopBGM()     停止背景音乐
 *   toggleMute()  静音开关，返回是否静音
 *   isMuted()     当前是否静音
 * 无 AudioContext 环境（如 headless 测试）下全部降级为 no-op，绝不抛错。
 */
(function () {
  "use strict";

  var AC = (typeof window !== "undefined")
    ? (window.AudioContext || window.webkitAudioContext)
    : null;
  var ctx = null, master = null;
  var muted = false;
  var ready = false;
  var bgmOn = false, bgmStep = 0, bgmTimer = null;

  function ensure() {
    if (ready) return true;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.22;
      master.connect(ctx.destination);
      ready = true;
      return true;
    } catch (e) { return false; }
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function blip(freq, dur, type, vol, when) {
    if (!ctx || !master) return;
    var t = now() + (when || 0);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.15));
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + (dur || 0.15) + 0.03);
  }

  function noise(dur, vol, when) {
    if (!ctx || !master) return;
    var t = now() + (when || 0);
    var len = Math.floor(ctx.sampleRate * (dur || 0.12));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) { data[i] = (Math.random() * 2 - 1) * (1 - i / len); }
    var src = ctx.createBufferSource(); src.buffer = buf;
    var g = ctx.createGain(); g.gain.value = vol || 0.25;
    src.connect(g); g.connect(master); src.start(t);
  }

  function play(name) {
    if (muted) return;
    if (!ensure()) return;
    try { if (ctx.state === "suspended") ctx.resume(); } catch (e) {}
    switch (name) {
      case "move":    blip(520, 0.10, "triangle", 0.25, 0); break;
      case "hit":     noise(0.12, 0.30, 0); blip(160, 0.10, "square", 0.20, 0); break;
      case "crit":    noise(0.12, 0.35, 0); blip(700, 0.10, "square", 0.25, 0); blip(900, 0.12, "square", 0.20, 0.05); break;
      case "ko":      blip(300, 0.18, "sawtooth", 0.30, 0); blip(180, 0.25, "sawtooth", 0.25, 0.06); break;
      case "faint":   blip(200, 0.40, "sine", 0.25, 0); blip(120, 0.50, "sine", 0.20, 0.10); break;
      case "mega":    [523, 659, 784, 1046].forEach(function (f, i) { blip(f, 0.18, "square", 0.22, i * 0.06); }); break;
      case "dynamax": blip(120, 0.50, "sawtooth", 0.30, 0); blip(240, 0.50, "sawtooth", 0.20, 0.05); break;
      case "switch":  blip(440, 0.08, "triangle", 0.20, 0); blip(660, 0.10, "triangle", 0.20, 0.06); break;
      case "heal":    blip(660, 0.12, "sine", 0.20, 0); blip(880, 0.16, "sine", 0.20, 0.08); break;
      case "weather": [784, 988, 1175].forEach(function (f, i) { blip(f, 0.20, "sine", 0.15, i * 0.07); }); break;
      case "victory": [523, 659, 784, 1046, 1318].forEach(function (f, i) { blip(f, 0.22, "square", 0.22, i * 0.10); }); break;
      case "defeat":  [392, 330, 262, 196].forEach(function (f, i) { blip(f, 0.30, "sawtooth", 0.22, i * 0.12); }); break;
      case "achv":    [660, 880, 1100].forEach(function (f, i) { blip(f, 0.16, "triangle", 0.20, i * 0.08); }); break;
      default: break;
    }
  }

  // 简单循环琶音作为背景音乐
  var BGM_NOTES = [392, 523, 659, 523, 440, 587, 698, 587];
  function bgmTick() {
    if (!bgmOn) return;
    if (!ensure()) return;
    try { if (ctx.state === "suspended") ctx.resume(); } catch (e) {}
    var f = BGM_NOTES[bgmStep % BGM_NOTES.length];
    blip(f, 0.35, "triangle", 0.10, 0);
    if (bgmStep % 2 === 0) blip(f / 2, 0.40, "sine", 0.07, 0);
    bgmStep++;
  }
  function startBGM() {
    if (bgmOn) return;
    if (!ensure()) return;
    bgmOn = true; bgmStep = 0; bgmTick();
    bgmTimer = setInterval(bgmTick, 520);
  }
  function stopBGM() {
    bgmOn = false;
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
  }
  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.22;
    return muted;
  }
  function isMuted() { return muted; }

  if (typeof window !== "undefined") {
    window.BattleAudio = {
      init: function () { return ensure(); },
      play: play,
      startBGM: startBGM,
      stopBGM: stopBGM,
      toggleMute: toggleMute,
      isMuted: isMuted
    };
  }
})();
