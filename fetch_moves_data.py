# -*- coding: utf-8 -*-
"""统一抓取宝可梦招式数据 -> moves.js (window.MOVE_DB) + mon_moves.js (window.MON_MOVES)
并行 + 断点续传，数据形状对齐 game.js 的 realMove 契约。
用法: python fetch_moves_data.py   (可重复运行，已抓取的会跳过)
"""
import json, os, time, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "https://pokeapi.co/api/v2/"
WORKERS = 6
MON_CACHE = "._moncache.json"
MOVE_CACHE = "._movecache.json"
TOTAL = 1025

# 内置招式中文名（覆盖主流/对战常用；缺失则回退英文名）
ZH = {
    "tackle":"撞击","scratch":"抓","quick-attack":"电光一闪","body-slam":"泰山压顶",
    "hyper-beam":"破坏光线","giga-impact":"终极冲击","return":"报恩","double-edge":"舍身冲撞",
    "swift":"高速星星","protect":"守住","substitute":"替身","rest":"睡觉","recover":"自我再生",
    "soft-boiled":"生蛋","reflect":"反射壁","light-screen":"光墙","safeguard":"神秘守护",
    "double-team":"影子分身","calm-mind":"冥想","focus-blast":"波导弹","psychic":"精神强念",
    "sludge-bomb":"污泥炸弹","sludge-wave":"污泥波","gunk-shot":"毒击","toxic":"剧毒",
    "poison-jab":"毒针","thunderbolt":"十万伏特","thunder":"打雷","thunder-shock":"电击",
    "thunder-punch":"雷电拳","volt-tackle":"伏特攻击","thunder-wave":"电磁波","discharge":"放电",
    "zap-cannon":"电磁炮","nuzzle":"蹭蹭脸颊","spark":"电火花","thunder-fang":"雷电牙",
    "flamethrower":"喷射火焰","fire-blast":"大字爆炎","fire-punch":"火焰拳","ember":"火花",
    "flame-wheel":"火焰轮","heat-wave":"热风","fire-spin":"火焰漩涡","will-o-wisp":"鬼火",
    "lava-plume":"岩浆风暴","flare-blitz":"闪焰冲锋","sunny-day":"大晴天",
    "water-gun":"水枪","surf":"冲浪","hydro-pump":"水炮","bubble":"泡沫","bubble-beam":"泡沫光线",
    "aqua-tail":"水流尾","scald":"沸水","rain-dance":"下雨","dive":"潜水","waterfall":"攀瀑",
    "liquidation":"水流裂破","vine-whip":"藤鞭","razor-leaf":"飞叶快刀","solar-beam":"日光束",
    "petal-dance":"花瓣舞","sleep-powder":"催眠粉","spore":"孢子","leech-seed":"寄生种子",
    "giga-drain":"终极吸取","energy-ball":"能量球","leaf-blade":"叶刃","synthesis":"光合作用",
    "ingrain":"扎根","bullet-seed":"种子机关枪","grass-knot":"草绳结","power-whip":"强力鞭打",
    "ice-beam":"冰冻光束","blizzard":"暴风雪","ice-punch":"冰冻拳","icicle-spear":"冰柱坠",
    "aurora-beam":"极光光线","hail":"冰雹","frost-breath":"冰息",
    "close-combat":"近身战","drain-punch":"吸取拳","focus-punch":"集中猛击","mach-punch":"音速拳",
    "cross-chop":"十字劈","low-kick":"低空踢","rock-smash":"碎岩","aura-sphere":"波导导弹",
    "bullet-punch":"子弹拳","quick-guard":"快速防守","detect":"看穿","counter":"反击",
    "reversal":"返拳","endure":"忍耐","focus-energy":"聚气","bulk-up":"健美",
    "toxic-spikes":"毒菱","poison-tail":"毒尾","acid":"酸液","venoshock":"毒液冲击",
    "earthquake":"地震","dig":"挖洞","earth-power":"大地之力","fissure":"地狱突刺",
    "bulldoze":"重踏","mud-shot":"泥巴射击","mud-slap":"泥巴射击","sand-attack":"沙暴",
    "sandstorm":"沙暴","gust":"起风","wing-attack":"翼攻击","hurricane":"暴风","air-slash":"空气斩",
    "brave-bird":"勇鸟猛攻","acrobatics":"杂技","peck":"啄","drill-peck":"钻孔啄击","roost":"栖息",
    "tailwind":"顺风","feather-dance":"羽毛舞","psybeam":"幻象光线","confusion":"念力",
    "hypnosis":"催眠术","dream-eater":"食梦","future-sight":"预知未来","psyshock":"精神冲击",
    "extrasensory":"神通力","zen-headbutt":"冥想头锤","teleport":"瞬间移动","trick":"戏法",
    "bug-bite":"虫咬","leech-life":"吸血","pin-missile":"飞弹针","x-scissor":"十字剪",
    "string-shot":"吐丝","quiver-dance":"蝶舞","bug-buzz":"虫鸣","struggle-bug":"虫之抵抗",
    "u-turn":"急速折返","silver-wind":"银色旋风","rock-throw":"落石","rock-slide":"岩崩",
    "rock-blast":"尖石攻击","stone-edge":"尖石攻击","stealth-rock":"隐形岩","power-gem":"力量宝石",
    "head-smash":"尖石强击","rock-polish":"岩石打磨","ancient-power":"原始之力",
    "shadow-ball":"暗影球","shadow-claw":"暗影爪","shadow-punch":"暗影拳","lick":"舌舔",
    "nightmare":"噩梦","hex":"祸不单行","curse":"诅咒","shadow-sneak":"影子偷袭",
    "phantom-force":"潜灵奇袭","destiny-bond":"同命","dragon-claw":"龙爪","dragon-rage":"龙怒",
    "dragon-pulse":"龙之波动","dragon-dance":"龙之舞","outrage":"逆鳞","twister":"龙卷风",
    "draco-meteor":"流星群","dragon-tail":"龙尾","dual-chop":"双斧","dragon-breath":"龙息",
    "roar-of-time":"时光咆哮","spacial-rend":"亚空裂斩","bite":"咬","crunch":"咬碎",
    "dark-pulse":"恶之波动","snarl":"大声咆哮","foul-play":"以牙还牙","nasty-plot":"阴谋",
    "sucker-punch":"突袭","knock-off":"拍落","thrash":"横冲直撞","taunt":"挑衅","torment":"骚扰",
    "embargo":"封印","snatch":"抢夺","iron-tail":"铁尾","iron-head":"铁头","flash-cannon":"加农光炮",
    "metal-claw":"金属爪","gyro-ball":"陀螺球","steel-wing":"钢翼","kings-shield":"王者盾牌",
    "moonblast":"月亮之力","dazzling-gleam":"魔法闪耀","play-rough":"嬉闹","charm":"撒娇",
    "moonlight":"月光","fairy-wind":"妖精之风","petal-blast":"花瓣风暴","misty-terrain":"薄雾场地",
    "sweet-kiss":"天使之吻","aromatherapy":"芳香治疗","swords-dance":"剑舞","growl":"叫声",
    "leer":"瞪眼","tail-whip":"摇尾巴","howl":"吼叫","work-up":"磨练","agility":"高速移动",
    "minimize":"变小","defense-curl":"变硬","harden":"变硬","withdraw":"缩入壳中","sharpen":"磨爪",
    "meditate":"瑜伽姿势","iron-defense":"铁壁","acid-armor":"溶化","cosmic-power":"宇宙力量",
    "poison-powder":"毒粉","stun-spore":"麻痹粉","spikes":"撒菱","trick-room":"戏法空间",
    "electric-terrain":"电气场地","grassy-terrain":"青草场地","psychic-terrain":"精神场地",
    "sticky-web":"黏黏网","aqua-ring":"水流环","morning-sun":"朝之太阳","fire-fang":"火焰牙",
    "ice-fang":"冰冻牙","leaf-storm":"叶暴风","dark-void":"黑洞","volt-switch":"伏特替换",
    "flip-turn":"水流连击","scale-shot":"鳞片击","tri-attack":"三重攻击","hyper-voice":"爆音波",
    "boomburst":"爆音波","headbutt":"头锤","rock-climb":"攀岩","whirlpool":"漩涡","bind":"绑紧",
    "wrap":"紧束","megahorn":"百万角击","drill-run":"钻头直击","wild-charge":"野性伏特",
    "bolt-strike":"雷电交错","blue-flare":"青焰","fusion-flare":"融合烈焰","fusion-bolt":"融合闪电",
    "glaciate":"冰封世界","freeze-shock":"冻结伏特","ice-burn":"冰封燃烧","techno-blast":"科技炸弹",
    "gear-grind":"齿轮飞盘","shift-gear":"齿轮变换","v-create":"V热焰","psystrike":"精神破坏",
    "sacred-sword":"圣剑","leaf-tornado":"叶风暴","dragons-fury":"龙之怒焰","clangorous-soul":"响亮魂",
    "dynamax-cannon":"极巨炮","snipe-shot":"狙击","pyro-ball":"火球","meteor-assault":"陨石冲锋",
    "clangingscales":"铿锵铠甲","decorate":"装饰","stuff-cheeks":"囤积","bolt-beak":"雷鸟指标",
    "fishious-rend":"鱼龙撕咬","jaw-lock":"颌锁","no-retreat":"破釜沉舟","spirit-break":"精神冲击",
    "strange-steam":"奇异蒸汽","lifedew":"生命之泉","branching-bolt":"伏特分支","rising-voltage":"升腾电压",
    "tera-blast":"太晶爆发","psyspark":"念力火花","syrup-bomb":"糖浆炸弹","pounce":"猛扑",
    "thunder-shock":"电击","vise-grip":"夹住","guillotine":"断头钳","razor-wind":"真空斩",
    "hydro-cannon":"水炮","blast-burn":"燃烧殆尽","frenzy-plant":"硬化植物","rock-wrecker":"岩石炮",
    "roost":"栖息","tail-glow":"尾立","charge-beam":"充电光束","flash":"闪光","roar":"吼叫",
    "whirlwind":"风吹","growth":"生长","amnesia":"瞬间失忆","barrier":"屏障","acupressure":"点穴",
    "conversion":"变身","conversion-2":"变身2","haze":"雾","mirror-coat":"镜面反射",
    "spikes":"撒菱","toxic-spikes":"毒菱","stealth-rock":"隐形岩","sticky-web":"黏黏网",
    "defog":"清除浓雾","court-change":"交换场地","heal-bell":"治愈铃铛","aromatherapy":"芳香治疗",
    "psych-up":"心眼","swagger":"虚张声势","flatter":"煽动","confuse-ray":"迷惑","supersonic":"音爆",
    "teeter-dance":"摇晃舞","sing":"唱歌","grass-whistle":"青草笛","yawn":"哈欠","toxic-thread":"毒丝",
    "sludge-wave":"污泥波","lunge":"突袭","superpower":"蛮力","aerial-ace":"飞翔","shadow-sneak":"影子偷袭",
    "aqua-jet":"水流喷射","extreme-speed":"神速","vacuum-wave":"波导弹","fake-out":"假装攻击",
    "ivy-cudgel":"棘藤棒","matcha-gotcha":"刷刷茶炮",
}

# 状态异常白名单（其余 status 招丢弃）
STATUS_OK = {
    "thunder-wave","will-o-wisp","toxic","poison-powder","sleep-powder","spore",
    "stun-spore","toxic-thread","yawn","sing","hypnosis","dark-void","grass-whistle",
    "confuse-ray","supersonic","teeter-dance","swagger","flatter","sludge-bomb",
}
# 控场白名单（只保留已实装的：寄生种子/替身/反射壁/光墙/神秘守护/四种天气）
CONTROL_OK = {
    "leech-seed","substitute","reflect","light-screen","safeguard",
    "sunny-day","rain-dance","sandstorm","hail",
}
# 明确丢弃的无用招式
EXCLUDE = {
    "splash","celebrate","hold-hands","heal-block","foresight","transform",
    "mimic","sketch","metronome","mirror-move","copycat","me-first","assist",
    "nature-power","struggle","belch","explosion","self-destruct","destiny-bond",
    "grudge","memento","final-gambit","misty-explosion",
}


def get(url, retry=6):
    for i in range(retry):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "moves-data"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(3 * (i + 1)); continue
            time.sleep(1.2 * (i + 1))
        except Exception:
            time.sleep(1.2 * (i + 1))
    return None


def zh_name(nm, d):
    if nm in ZH:
        return ZH[nm]
    for n in d.get("names", []):
        if n["language"]["name"] == "zh-hans":
            return n["name"]
    for n in d.get("names", []):
        if n["language"]["name"] == "zh-hant":
            return n["name"]
    return nm.replace("-", " ").title()


def build_meta(d):
    slug = d["name"]
    dc = (d.get("damage_class") or {}).get("name")
    meta = d.get("meta") or {}
    ail = (meta.get("ailment") or {}).get("name")
    cat = (meta.get("category") or {}).get("name")
    healing = meta.get("healing") or 0
    sc = [(s["change"], s["stat"]["name"]) for s in (d.get("stat_changes") or [])]
    acc = d.get("accuracy")
    power = d.get("power")
    effect_chance = d.get("effect_chance")

    kind = "damage"; effect = None; chance = 0; heal = 0
    if dc == "status":
        if healing and healing > 0:
            kind = "heal"
            heal = 100 if slug == "rest" else healing
            effect = "sleep2" if slug == "rest" else None
        elif ail and ail not in ("none",):
            if ail == "leech-seed":
                kind = "control"; effect = "leech"
            else:
                kind = "status"; effect = ail
            chance = acc if acc is not None else 100
        elif cat in ("field-effect", "unique", "whole-field-effect", "weather"):
            kind = "control"
        else:
            if any(c > 0 for c, _ in sc):
                kind = "boost"
            elif any(c < 0 for c, _ in sc):
                kind = "debuff"
            else:
                kind = "control"
    else:
        kind = "damage"
        if ail and ail not in ("none",):
            effect = ail
            chance = effect_chance if effect_chance is not None else 0

    return {
        "zh": zh_name(slug, d),
        "type": d["type"]["name"],
        "power": power,
        "cat": dc if dc in ("physical", "special") else "status",
        "acc": acc,
        "pp": d.get("pp"),
        "kind": kind,
        "effect": effect,
        "chance": chance,
        "heal": heal,
        "stat": sc,
    }


def keep(slug, db):
    if slug in EXCLUDE:
        return False
    m = db.get(slug)
    if not m:
        return False
    if m["cat"] in ("physical", "special"):
        # 剔除 power 为 0/null 的固定伤害/一击必杀招（本系统用威力结算，无法表示）
        return (m.get("power") or 0) > 0
    if m["kind"] in ("boost", "debuff", "heal"):
        return True
    if m["kind"] == "status" and slug in STATUS_OK:
        return True
    if m["kind"] == "control" and slug in CONTROL_OK:
        return True
    return False


def load_cache(p):
    if os.path.exists(p):
        try:
            return json.load(open(p, encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_cache(p, d):
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False)
    os.replace(tmp, p)


def fetch_mon(pid):
    d = get(BASE + "pokemon/%d" % pid)
    if not d:
        return pid, []
    seen = set(); slugs = []
    for m in d.get("moves", []):
        s = m["move"]["name"]
        if s not in seen:
            seen.add(s); slugs.append(s)
    return pid, slugs


def fetch_move(slug):
    d = get(BASE + "move/" + slug)
    if not d:
        return slug, None
    return slug, build_meta(d)


def main():
    moncache = {int(k): v for k, v in load_cache(MON_CACHE).items()}
    print("[1/3] 抓取 %d 只宝可梦招式池..." % TOTAL, flush=True)
    pids = [p for p in range(1, TOTAL + 1) if p not in moncache]
    done = 0
    if pids:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {ex.submit(fetch_mon, p): p for p in pids}
            for fut in as_completed(futs):
                pid, slugs = fut.result()
                moncache[pid] = slugs
                done += 1
                if done % 100 == 0:
                    save_cache(MON_CACHE, moncache)
                    print("    mon %d/%d" % (done, len(pids)), flush=True)
        save_cache(MON_CACHE, moncache)
    print("    已完成 %d 只" % len(moncache), flush=True)

    union = set()
    for v in moncache.values():
        union.update(v)
    print("[2/3] 抓取 %d 个招式元数据..." % len(union), flush=True)
    movecache = load_cache(MOVE_CACHE)
    todo = [s for s in union if s not in movecache]
    done = 0
    if todo:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {ex.submit(fetch_move, s): s for s in todo}
            for fut in as_completed(futs):
                slug, meta = fut.result()
                movecache[slug] = meta or {}
                done += 1
                if done % 100 == 0:
                    save_cache(MOVE_CACHE, movecache)
                    print("    move %d/%d" % (done, len(todo)), flush=True)
        save_cache(MOVE_CACHE, movecache)
    print("    已获取 %d 个" % len(movecache), flush=True)

    print("[3/3] 过滤 + 写出 moves.js / mon_moves.js ...", flush=True)
    MON_MOVES = {}
    kept_union = set()
    empty = 0
    for pid in range(1, TOTAL + 1):
        slugs = moncache.get(pid, [])
        kept = [s for s in slugs if keep(s, movecache)]
        MON_MOVES[pid] = kept
        if not kept:
            empty += 1
        kept_union.update(kept)
    MOVE_DB = {s: movecache[s] for s in kept_union if s in movecache}

    with open("moves.js", "w", encoding="utf-8") as f:
        f.write("window.MOVE_DB=" + json.dumps(MOVE_DB, ensure_ascii=False, indent=0) + ";\n")
    with open("mon_moves.js", "w", encoding="utf-8") as f:
        f.write("window.MON_MOVES=" + json.dumps(MON_MOVES, ensure_ascii=False) + ";\n")

    kept_total = sum(len(v) for v in MON_MOVES.values())
    print("完成: moves.js 含 %d 招, mon_moves.js 含 %d 只宝可梦, 共保留 %d 个招式关联, %d 只无可用招式(走模板兜底)"
          % (len(MOVE_DB), len(MON_MOVES), kept_total, empty), flush=True)


if __name__ == "__main__":
    main()
