#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""数理无限画布 · 网页版本地服务器（零依赖，Python 3.7+）

用法：
    python serve.py                 # 默认监听所有网卡，自动选端口并打开本机浏览器
    HOST=127.0.0.1 python serve.py  # 只允许本机访问
    PORT=9000 python serve.py       # 指定起始端口

局域网用法（iPad / 平板 / 手机）：
    1. 电脑和 iPad 连同一个 Wi-Fi
    2. 双击运行本脚本（或运行 启动网页版.bat）
    3. 看窗口里打印的「局域网地址」，在 iPad 的 Safari 里照着输入
       —— 例如 http://192.168.1.23:8776/index.html
    4. 若 iPad 打不开，多半是 Windows 防火墙拦了，按窗口里的提示放行即可
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
HOST = os.environ.get("HOST", "0.0.0.0")


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


def lan_ips():
    """尽力找出本机在局域网里的 IPv4 地址，供 iPad 等其它设备访问。"""
    ips = []
    try:
        # 连一个外部地址只为拿到出口网卡 IP，不会真的发包
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("223.5.5.5", 80))
            ips.append(s.getsockname()[0])
        finally:
            s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    # 常见的家用/校园网私有段优先
    def rank(ip):
        for i, p in enumerate(("192.168.", "10.", "172.")):
            if ip.startswith(p):
                return i
        return 9
    ips.sort(key=rank)
    return ips


def firewall_hint(port):
    print()
    print("  【iPad 打不开？按顺序看这几条】")
    print(f"   1) iPad 必须和电脑连同一个 Wi-Fi（不能是 4G/5G，也不能连别的热点）")
    print(f"   2) 地址要完整带上 http:// 和端口，例如 http://192.168.x.x:{port}/index.html")
    print(f"   3) Windows 防火墙可能拦了：以管理员身份运行下面这条命令放行本端口 ——")
    print(f'      netsh advfirewall firewall add rule name="数理画布{port}" dir=in action=allow protocol=TCP localport={port}')
    print(f"   4) 仍然不行就先在 iPad 打开 http://192.168.x.x:{port}/diag.html 自检，看是哪一步卡住")
    print("=" * 62)


def main():
    start = int(os.environ.get("PORT", START_PORT))
    port = free_port(start)
    loopback = f"http://127.0.0.1:{port}/index.html"
    handler = functools.partial(Handler, directory=ROOT)

    try:
        httpd = Server((HOST, port), handler)
    except OSError as e:
        print(f"端口 {port} 启动失败：{e}")
        sys.exit(1)

    ips = [] if HOST == "127.0.0.1" else lan_ips()

    print("=" * 62)
    print("  数理无限画布 · 网页版已启动")
    print(f"  本机访问：{loopback}")
    print(f"  自检页面：http://127.0.0.1:{port}/diag.html")
    if ips:
        print()
        print("  ★ iPad / 平板 / 手机（同一 Wi-Fi）请用下面这个地址：")
        for ip in ips:
            print(f"      http://{ip}:{port}/index.html")
        print(f"      （自检页面：http://{ips[0]}:{port}/diag.html）")
    elif HOST == "127.0.0.1":
        print()
        print("  当前为「仅本机」模式（HOST=127.0.0.1），其它设备无法访问。")
        print("  想去掉这个限制，运行：python serve.py（不带 HOST 环境变量）")
    print()
    print("  关闭此窗口（或 Ctrl+C）即停止服务")
    print("=" * 62)

    if ips:
        firewall_hint(port)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
