#!/usr/bin/env python3
"""Restart the TGAutoPoster dev servers (API/bot + Mini App).

Kills anything already listening on the dev ports, then starts both dev
servers fresh. Works on Windows, macOS and Linux.

  Windows : each server opens in its own console window.
  mac/Linux: both run in the background; logs go to ./logs/.

Usage:
    python restart.py           # (re)start both servers
    python restart.py --stop    # just stop them, don't restart
    python restart.py --no-install   # skip `pnpm install`
"""
from __future__ import annotations

import os
import platform
import shutil
import signal
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
PORTS = [8787, 5173]  # server, miniapp
IS_WIN = platform.system() == "Windows"


def pnpm_cmd() -> str:
    """Locate pnpm (it's pnpm.cmd on Windows)."""
    return shutil.which("pnpm") or ("pnpm.cmd" if IS_WIN else "pnpm")


def kill_port(port: int) -> None:
    """Kill whatever process is listening on `port`."""
    if IS_WIN:
        out = subprocess.run(
            ["netstat", "-ano"], capture_output=True, text=True
        ).stdout
        pids = {
            line.split()[-1]
            for line in out.splitlines()
            if f":{port}" in line and "LISTENING" in line
        }
        for pid in pids:
            print(f"  killing PID {pid} on port {port}")
            subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
    else:
        lsof = shutil.which("lsof")
        if not lsof:
            return  # nothing we can do portably; new server will error if busy
        out = subprocess.run(
            [lsof, "-ti", f"tcp:{port}"], capture_output=True, text=True
        ).stdout
        for pid in out.split():
            print(f"  killing PID {pid} on port {port}")
            try:
                os.kill(int(pid), signal.SIGKILL)
            except (ProcessLookupError, ValueError):
                pass


def start(name: str, script: str, pnpm: str) -> None:
    """Start a `pnpm <script>` dev server."""
    if IS_WIN:
        # Open a new console window that stays open (cmd /k).
        subprocess.Popen(
            f'start "{name}" cmd /k "{pnpm} {script}"',
            shell=True,
            cwd=ROOT,
        )
    else:
        os.makedirs(os.path.join(ROOT, "logs"), exist_ok=True)
        log_path = os.path.join(ROOT, "logs", f"{script.replace(':', '-')}.log")
        log = open(log_path, "a")
        subprocess.Popen(
            [pnpm, script],
            cwd=ROOT,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,  # survive this script exiting
        )
        print(f"  {name}: logging to {log_path}")


def main() -> None:
    stop_only = "--stop" in sys.argv
    do_install = "--no-install" not in sys.argv

    print("[TGAutoPoster] Stopping anything on ports", ", ".join(map(str, PORTS)))
    for port in PORTS:
        kill_port(port)

    if stop_only:
        print("[TGAutoPoster] Stopped.")
        return

    pnpm = pnpm_cmd()
    if do_install:
        print("[TGAutoPoster] pnpm install ...")
        subprocess.run([pnpm, "install"], cwd=ROOT)

    time.sleep(1)  # let ports free up
    print("[TGAutoPoster] Starting API + bot   -> http://localhost:8787")
    start("TGAP Server", "dev:server", pnpm)
    print("[TGAutoPoster] Starting Mini App    -> http://localhost:5173")
    start("TGAP MiniApp", "dev:miniapp", pnpm)

    print()
    print("[TGAutoPoster] Started. Open http://localhost:5173 in your browser.")
    if not IS_WIN:
        print("Stop them later with:  python restart.py --stop")


if __name__ == "__main__":
    main()
