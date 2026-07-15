#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""下载全部宝可梦精灵图（含普通 + 闪光形态）到 sprites/ 目录，实现离线可用。

用法：
    python fetch_sprites.py            # 下载全部（增量：已存在则跳过）
    python fetch_sprites.py --force    # 强制重新下载
    python fetch_sprites.py --shiny    # 只补闪光图
"""
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.abspath(__file__))
SPRITE_DIR = os.path.join(ROOT, "sprites")
SHINY_DIR = os.path.join(SPRITE_DIR, "shiny")
DATA_JS = os.path.join(ROOT, "data.js")
UA = {"User-Agent": "Mozilla/5.0 (sprite-fetch)"}
FORCE = "--force" in sys.argv
SHINY_ONLY = "--shiny" in sys.argv

URL_RE = re.compile(r'"sprite"\s*:\s*"([^"]+)"')


def to_shiny_url(url):
    """PokeAPI 普通图 URL -> 闪光图 URL：在 /pokemon/ 后插入 /shiny/。"""
    if not url:
        return None
    # 兼容已有 /pokemon/shiny/ 的 URL（不再重复插入）
    if "/pokemon/shiny/" in url:
        return url
    return url.replace("/pokemon/", "/pokemon/shiny/", 1)


def collect_urls():
    with open(DATA_JS, "r", encoding="utf-8") as f:
        text = f.read()
    normal_urls = []
    seen = set()
    for u in URL_RE.findall(text):
        if u not in seen:
            seen.add(u)
            normal_urls.append(u)

    if SHINY_ONLY:
        return [(to_shiny_url(u), SHINY_DIR) for u in normal_urls]

    tasks = [(u, SPRITE_DIR) for u in normal_urls]
    tasks += [(to_shiny_url(u), SHINY_DIR) for u in normal_urls]
    return tasks


def fetch(task):
    url, folder = task
    if not url:
        return "fail:no-url"
    name = url.split("/")[-1]
    dst = os.path.join(folder, name)
    if os.path.exists(dst) and not FORCE:
        return "skip"
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            if len(data) < 200:  # 太小的多半是错误页
                last = "too-small"
                continue
            os.makedirs(folder, exist_ok=True)
            with open(dst, "wb") as w:
                w.write(data)
            return "ok"
        except Exception as e:  # noqa
            last = str(e)
            import time
            time.sleep(0.5 * (attempt + 1))
    return "fail:" + last


def main():
    os.makedirs(SPRITE_DIR, exist_ok=True)
    os.makedirs(SHINY_DIR, exist_ok=True)
    tasks = collect_urls()
    normal_total = sum(1 for _, f in tasks if f == SPRITE_DIR)
    shiny_total = sum(1 for _, f in tasks if f == SHINY_DIR)
    print("共需下载：普通 %d 张，闪光 %d 张，合计 %d 张" % (normal_total, shiny_total, len(tasks)))
    ok = skip = fail = 0
    with ThreadPoolExecutor(max_workers=10) as ex:
        for i, res in enumerate(ex.map(fetch, tasks), 1):
            if res == "ok":
                ok += 1
            elif res == "skip":
                skip += 1
            else:
                fail += 1
                if fail <= 20:
                    print("  失败:", res)
            if i % 100 == 0:
                print("  进度 %d/%d (ok=%d skip=%d fail=%d)" % (i, len(tasks), ok, skip, fail))
    print("完成：ok=%d skip=%d fail=%d" % (ok, skip, fail))
    print("普通目录：%s" % SPRITE_DIR)
    print("闪光目录：%s" % SHINY_DIR)


if __name__ == "__main__":
    main()
