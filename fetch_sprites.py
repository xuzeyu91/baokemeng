#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""下载全部宝可梦精灵图到 sprites/ 目录，实现离线可用。

用法：
    python fetch_sprites.py            # 下载全部（增量：已存在则跳过）
    python fetch_sprites.py --force    # 强制重新下载
"""
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.abspath(__file__))
SPRITE_DIR = os.path.join(ROOT, "sprites")
DATA_JS = os.path.join(ROOT, "data.js")
UA = {"User-Agent": "Mozilla/5.0 (sprite-fetch)"}
FORCE = "--force" in sys.argv

URL_RE = re.compile(r'"sprite"\s*:\s*"([^"]+)"')


def collect_urls():
    with open(DATA_JS, "r", encoding="utf-8") as f:
        text = f.read()
    urls = []
    seen = set()
    for u in URL_RE.findall(text):
        if u not in seen:
            seen.add(u)
            urls.append(u)
    return urls


def fetch(url):
    name = url.split("/")[-1]
    dst = os.path.join(SPRITE_DIR, name)
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
    urls = collect_urls()
    print("共需下载 %d 张精灵图" % len(urls))
    ok = skip = fail = 0
    with ThreadPoolExecutor(max_workers=10) as ex:
        for i, res in enumerate(ex.map(fetch, urls), 1):
            if res == "ok":
                ok += 1
            elif res == "skip":
                skip += 1
            else:
                fail += 1
                if fail <= 20:
                    print("  失败:", res)
            if i % 100 == 0:
                print("  进度 %d/%d (ok=%d skip=%d fail=%d)" % (i, len(urls), ok, skip, fail))
    print("完成：ok=%d skip=%d fail=%d" % (ok, skip, fail))
    print("精灵目录：%s" % SPRITE_DIR)


if __name__ == "__main__":
    main()
