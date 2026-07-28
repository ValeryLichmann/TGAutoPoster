#!/usr/bin/env python3
"""
TGAutoPoster — start / restart everything in one console (Windows/macOS/Linux).

  python start.py

- stops anything already listening on ports 8787 / 5173 (so it's also a restart)
- installs dependencies on first run
- runs the API+scheduler+bot and the Mini App together, log lines prefixed
- auto-restarts a process if it crashes (up to 5 times)
- Ctrl+C stops both cleanly
"""
from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
PORTS = (8787, 5173)
MAX_RESTARTS = 5

PROCS = [
    ("server", ["dev:server"], "\033[36m"),   # cyan
    ("miniapp", ["dev:miniapp"], "\033[35m"), # magenta
]
RESET = "\033[0m"
IS_WIN = os.name == "nt"

if IS_WIN:
    os.system("")  # enable ANSI colors in the Windows console


def find_pnpm() -> str:
    pnpm = shutil.which("pnpm") or shutil.which("pnpm.cmd")
    if not pnpm:
        sys.exit("[!] pnpm is not installed. Run:  npm install -g pnpm")
    return pnpm


def kill_port(port: int) -> None:
    """Terminate whatever is listening on `port` (best-effort, cross-platform)."""
    try:
        if IS_WIN:
            out = subprocess.run(
                ["netstat", "-aon"], capture_output=True, text=True, check=False
            ).stdout
            pids = {
                line.split()[-1]
                for line in out.splitlines()
                if f":{port}" in line and "LISTENING" in line
            }
            for pid in pids:
                subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True, check=False)
        else:
            out = subprocess.run(
                ["lsof", "-ti", f"tcp:{port}", "-sTCP:LISTEN"],
                capture_output=True, text=True, check=False,
            ).stdout
            for pid in out.split():
                try:
                    os.kill(int(pid), signal.SIGTERM)
                except (ProcessLookupError, ValueError):
                    pass
    except FileNotFoundError:
        pass  # netstat/lsof missing — just try to start anyway


def ensure_deps(pnpm: str) -> None:
    if not os.path.isdir(os.path.join(ROOT, "node_modules")):
        print("[start] First run — installing dependencies (takes a minute)…")
        subprocess.run([pnpm, "install"], cwd=ROOT, check=True)


def pump(name: str, color: str, proc: subprocess.Popen) -> None:
    """Prefix and forward a child's output lines."""
    assert proc.stdout is not None
    for raw in proc.stdout:
        line = raw.rstrip()
        if line:
            print(f"{color}[{name}]{RESET} {line}")


class Child:
    def __init__(self, pnpm: str, name: str, args: list[str], color: str):
        self.pnpm, self.name, self.args, self.color = pnpm, name, args, color
        self.proc: subprocess.Popen | None = None
        self.restarts = 0

    def start(self) -> None:
        # Run each child in its own process group/tree so stop() can take down
        # the whole chain (pnpm → tsx/vite → node), not just the wrapper.
        kwargs: dict = {}
        if IS_WIN:
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            kwargs["start_new_session"] = True
        self.proc = subprocess.Popen(
            [self.pnpm, *self.args],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            **kwargs,
        )
        threading.Thread(target=pump, args=(self.name, self.color, self.proc), daemon=True).start()
        print(f"[start] {self.name} running (pid {self.proc.pid})")

    def poll_and_maybe_restart(self) -> bool:
        """Returns False when the child died too many times."""
        if self.proc and self.proc.poll() is not None:
            if self.restarts >= MAX_RESTARTS:
                print(f"[start] {self.name} crashed {MAX_RESTARTS}× — giving up.")
                return False
            self.restarts += 1
            print(f"[start] {self.name} exited (code {self.proc.returncode}) — restarting "
                  f"({self.restarts}/{MAX_RESTARTS})…")
            time.sleep(2)
            self.start()
        return True

    def stop(self) -> None:
        if not self.proc or self.proc.poll() is not None:
            return
        if IS_WIN:
            # /T kills the whole tree (pnpm → tsx/vite → node)
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(self.proc.pid)],
                capture_output=True, check=False,
            )
        else:
            try:
                os.killpg(self.proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                return
        try:
            self.proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            if not IS_WIN:
                try:
                    os.killpg(self.proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass


def main() -> None:
    pnpm = find_pnpm()

    print("[start] Stopping any previous instances…")
    for port in PORTS:
        kill_port(port)
    time.sleep(1)

    ensure_deps(pnpm)

    children = [Child(pnpm, name, args, color) for name, args, color in PROCS]
    for c in children:
        c.start()

    print("[start] Up! API http://localhost:8787 · Mini App http://localhost:5173")
    print("[start] Ctrl+C to stop both.")

    try:
        while True:
            time.sleep(2)
            if not all(c.poll_and_maybe_restart() for c in children):
                break
    except KeyboardInterrupt:
        print("\n[start] Stopping…")
    finally:
        for c in children:
            c.stop()
        print("[start] Stopped.")


if __name__ == "__main__":
    main()
