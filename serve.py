#!/usr/bin/env python3
"""
宝可梦卡牌对战 - 静态文件服务器
================================
用于把本项目部署到服务器：启动后浏览器访问 http://<服务器IP>:<端口>/ 即可。

用法:
    python serve.py                       # 默认绑定 0.0.0.0:8000，目录为脚本所在目录
    python serve.py --port 8080          # 自定义端口
    python serve.py --host 127.0.0.1     # 仅本机访问（开发调试用）
    python serve.py --directory /path    # 指定网站根目录

部署到服务器后建议:
    nohup python serve.py --port 80 > server.log 2>&1 &
或注册为 systemd 服务（见文件末尾说明）。
"""

import argparse
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# 额外的 MIME 类型（部分老版本 Python 可能缺失）
EXTRA_MIME = {
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
}


class Handler(SimpleHTTPRequestHandler):
    """静态文件处理器，补充常见 MIME 类型。"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def end_headers(self):
        # 禁用缓存，方便部署后立刻看到更新（生产可按需移除）
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 更简洁的访问日志
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))

    parser = argparse.ArgumentParser(description="宝可梦卡牌对战 静态服务器")
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="监听地址 (默认 0.0.0.0，即允许外部访问；本地调试用 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="监听端口 (默认 8000)",
    )
    parser.add_argument(
        "--directory",
        default=base_dir,
        help="网站根目录 (默认脚本所在目录)",
    )
    args = parser.parse_args()

    directory = os.path.abspath(args.directory)
    if not os.path.isdir(directory):
        print(f"错误: 目录不存在 -> {directory}", file=sys.stderr)
        sys.exit(1)

    # 注入额外 MIME
    for ext, mime in EXTRA_MIME.items():
        SimpleHTTPRequestHandler.extensions_map.setdefault(ext, mime)

    os.chdir(directory)
    server = ThreadingHTTPServer((args.host, args.port), Handler)

    url = f"http://{args.host}:{args.port}/"
    print("=" * 52)
    print("  宝可梦卡牌对战 - 静态服务器已启动")
    print("=" * 52)
    print(f"  网站根目录 : {directory}")
    print(f"  本机访问   : http://127.0.0.1:{args.port}/")
    if args.host in ("0.0.0.0", ""):
        print(f"  外部访问   : http://<服务器IP>:{args.port}/")
    else:
        print(f"  访问地址   : {url}")
    print("  按 Ctrl+C 停止")
    print("=" * 52)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n正在关闭服务器...")
        server.shutdown()
        server.server_close()
        print("已停止。")


if __name__ == "__main__":
    main()
