#!/usr/bin/env python3
"""
HomeSignal — Local Server Launcher
Run this script to serve the app correctly (needed because the
browser blocks API calls from file:// pages).

Usage:
  python3 serve.py

Then open: http://localhost:8080/homesignal.html
"""
import http.server, socketserver, os, webbrowser, threading

PORT = 8080
FILE = "homesignal.html"

os.chdir(os.path.dirname(os.path.abspath(__file__)))

handler = http.server.SimpleHTTPRequestHandler

def open_browser():
    import time; time.sleep(0.8)
    webbrowser.open(f"http://localhost:{PORT}/{FILE}")

threading.Thread(target=open_browser, daemon=True).start()

print(f"\n  ✓ HomeSignal running at http://localhost:{PORT}/{FILE}")
print(f"  ✓ Browser should open automatically")
print(f"  Press Ctrl+C to stop\n")

with socketserver.TCPServer(("", PORT), handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
