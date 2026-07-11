import json, urllib.request, sys
from concurrent.futures import ThreadPoolExecutor

BASE = "https://pokeapi.co/api/v2"
UA = {"User-Agent": "Mozilla/5.0"}

def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode())

TYPE_NAMES = ["normal","fire","water","electric","grass","ice","fighting","poison",
              "ground","flying","psychic","bug","rock","ghost","dragon"]

TYPE_ZH = {
    "normal":"一般","fire":"火","water":"水","electric":"电","grass":"草",
    "ice":"冰","fighting":"格斗","poison":"毒","ground":"地面","flying":"飞行",
    "psychic":"超能力","bug":"虫","rock":"岩石","ghost":"幽灵","dragon":"龙"
}

# ---------- 1. Type chart ----------
print("Fetching type chart...", flush=True)
def fetch_type(t):
    d = get(f"{BASE}/type/{t}")
    rel = d["damage_relations"]
    return t, {
        "double": [x["name"] for x in rel["double_damage_to"]],
        "half":   [x["name"] for x in rel["half_damage_to"]],
        "none":   [x["name"] for x in rel["no_damage_to"]],
    }
type_chart = {}
with ThreadPoolExecutor(max_workers=8) as ex:
    for t, out in ex.map(fetch_type, TYPE_NAMES):
        type_chart[t] = out

eff = {a: {d: 1.0 for d in TYPE_NAMES} for a in TYPE_NAMES}
for atk, rel in type_chart.items():
    for d in rel["double"]: eff[atk][d] = 2.0
    for d in rel["half"]:   eff[atk][d] = 0.5
    for d in rel["none"]:   eff[atk][d] = 0.0

# ---------- 2. Pokémon ----------
print("Fetching 151 pokemon...", flush=True)
def fetch_mon(id):
    p = get(f"{BASE}/pokemon/{id}")
    name_en = p["name"]
    types = [t["type"]["name"] for t in p["types"]]
    stats = {s["stat"]["name"]: s["base_stat"] for s in p["stats"]}
    sprite = p["sprites"].get("front_default")
    if not sprite:
        sprite = f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{id}.png"
    sp = get(f"{BASE}/pokemon-species/{id}")
    name_zh = name_en
    for nm in sp.get("names", []):
        if nm["language"]["name"] == "zh-Hans":
            name_zh = nm["name"]; break
    return {
        "id": id,
        "name": name_en,
        "name_zh": name_zh,
        "types": types,
        "hp": stats.get("hp", 50),
        "attack": stats.get("attack", 50),
        "defense": stats.get("defense", 50),
        "sp_attack": stats.get("special-attack", 50),
        "sp_defense": stats.get("special-defense", 50),
        "speed": stats.get("speed", 50),
        "sprite": sprite,
    }

mons = []
with ThreadPoolExecutor(max_workers=12) as ex:
    for i, m in enumerate(ex.map(fetch_mon, range(1, 152)), 1):
        mons.append(m)
        if i % 25 == 0:
            print(f"  {i}/151 fetched", flush=True)

mons.sort(key=lambda x: x["id"])

out = {
    "pokemon": mons,
    "type_effect": eff,
    "type_zh": TYPE_ZH,
}
with open("data.js", "w", encoding="utf-8") as f:
    f.write("window.POKEMON_LIST = " + json.dumps(mons, ensure_ascii=False) + ";\n")
    f.write("window.TYPE_EFFECT = " + json.dumps(eff, ensure_ascii=False) + ";\n")
    f.write("window.TYPE_ZH = " + json.dumps(TYPE_ZH, ensure_ascii=False) + ";\n")

print(f"Done. {len(mons)} pokemon written to data.js", flush=True)
