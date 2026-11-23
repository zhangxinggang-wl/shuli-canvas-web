#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""数理无限画布 · 网页版本地服务器（零依赖，Python 3.7+）

用法：
    python serve.py            # 自动选端口并打开浏览器
    PORT=9000 python serve.py  # 指定起始端口
"""

import functools
import http.server
import os
import socket
import socketserver
import sys
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
START_PORT = 8776


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({
        ".wasm": "application/wasm",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".ttf": "font/ttf",
        ".otf": "font/otf",
        ".gewu": "application/octet-stream",
    })

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    # 首屏会并发请求上百个资源（core/*.js、sims/*.js、ggb 分片），
    # 默认 backlog=5 在多文件并发下会直接把连接 RST 掉，表现为白屏 / 504。
    request_queue_size = 512

    def handle_error(self, request, client_address):
        pass


def free_port(port):
    while port < 65535:
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
        port += 1
    return port


def main():
    start = int(os.environ.get("PORT", START_PORT))
    port = free_port(start)
    url = f"http://127.0.0.1:{port}/index.html"
    handler = functools.partial(Handler, directory=ROOT)
    with Server(("127.0.0.1", port), handler) as httpd:
        print("=" * 56)
        print("  数理无限画布 · 网页版已启动")
        print(f"  地址：{url}")
        print("  关闭此窗口（或 Ctrl+C）即停止服务")
        print("=" * 56)
        try:
            webbrowser.open(url)
        except Exception:
            pass
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止。")


if __name__ == "__main__":
    main()
