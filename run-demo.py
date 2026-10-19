#!/usr/bin/env python3
"""Start the packaged demo using only Python's standard library."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser


def main():
    parser = argparse.ArgumentParser(description="未来制造三维教学图谱本地启动器")
    parser.add_argument("--port", type=int, default=8791)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError:
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    url = "http://127.0.0.1:{}/".format(server.server_port)
    print("\n未来制造三维教学图谱已启动。", flush=True)
    print("浏览器访问：" + url, flush=True)
    print("运行期间请保留此窗口；按 Ctrl+C 停止。\n", flush=True)
    if not args.no_browser:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n本地演示已停止。")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
