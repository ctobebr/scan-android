"""
ptcrMobile Chaquopy bridge.

This module is intentionally lightweight for the first Android test version:
- It proves local Python execution on Android.
- It exposes cmd-usage flat-mode steps as callable tasks.
- If the full ptcr Python sources are copied into the app's Python path later,
  run_command can execute the real scripts in-process.

Limitations:
- PC DAP/PyTorch depth estimation is not expected to run through Chaquopy.
  The Android DAP model should be bridged separately from dapMobile.
- Heavy SciPy/Torch dependencies should be migrated or replaced step by step.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import runpy
import sys
import time
import traceback
from dataclasses import dataclass
from typing import Callable, Dict, List


@dataclass
class TaskResult:
    ok: bool
    name: str
    elapsed_sec: float
    log: str
    outputs: List[str]

    def to_json(self) -> str:
        return json.dumps(
            {
                "ok": self.ok,
                "name": self.name,
                "elapsedSec": self.elapsed_sec,
                "log": self.log,
                "outputs": self.outputs,
            },
            ensure_ascii=False,
        )


def _emit_header(name: str, args: List[str]) -> None:
    print(f"[ptcrMobile] task={name}")
    print("[ptcrMobile] argv=" + " ".join(args))
    print(f"[ptcrMobile] cwd={os.getcwd()}")


def run_script(script_path: str, args: List[str]) -> None:
    if not os.path.exists(script_path):
        raise FileNotFoundError(f"script not found: {script_path}")
    old_argv = sys.argv[:]
    script_dir = os.path.dirname(os.path.abspath(script_path))
    old_path = sys.path[:]
    try:
        if script_dir not in sys.path:
            sys.path.insert(0, script_dir)
        sys.argv = [script_path] + list(args)
        runpy.run_path(script_path, run_name="__main__")
    except SystemExit as e:
        if e.code not in (0, None):
            raise RuntimeError(f"script exited with code: {e.code}") from e
    finally:
        sys.argv = old_argv
        sys.path = old_path


def _task_prepare(work_dir: str, raw_dir: str, pointcloud: str) -> List[str]:
    return [
        "ptcrCommon/prepare_dataset.py",
        "-i", raw_dir,
        "-o", os.path.join(work_dir, "imgs"),
        "--size", "1440x1080",
        "--pitch-offset-deg", "0",
        "-r", "180",
        "--eq-focal-mm", "23",
        "-f",
    ]


def _task_stitch(work_dir: str, mode: str, pointcloud: str) -> List[str]:
    args = [
        f"ptcrPanoStitch/ptcrPanoStitch.py",
        mode,
        "-i", os.path.join(work_dir, "imgs"),
        "-p", os.path.join(work_dir, "imgs", "params.txt"),
        "-o", os.path.join(work_dir, f"pano_{mode}.png"),
    ]
    if mode != "raw":
        args += ["--laser-anchor-file", pointcloud]
    return args


def _task_sparse_depth(work_dir: str, pointcloud: str) -> List[str]:
    return [
        "ptcrCommon/ply_to_depth.py",
        "-i", pointcloud,
        "-o", os.path.join(work_dir, "depth_sparse_ref.png"),
        "--size", "adapt",
        "--yaw-offset-deg", "0",
        "--sparse-fill", "idw",
        "--fill-radius", "2",
        "--fill-iters", "2",
    ]


def _task_depth_placeholder(work_dir: str, mode: str) -> List[str]:
    return [
        "ptcrDepEstimate/ptcrDepEstimate.py",
        "-i", os.path.join(work_dir, f"pano_{mode}.png"),
        "-o", os.path.join(work_dir, f"depth_{mode}.png"),
    ]


def _task_geom_raw(work_dir: str) -> List[str]:
    return [
        "ptcrGeomRefine/ptcrGeomRefine.py",
        "raw",
        "-i", os.path.join(work_dir, "depth_sparse_ref.png"),
        "--color-image", os.path.join(work_dir, "pano_raw.png"),
        "-o", os.path.join(work_dir, "ply_raw.ply"),
    ]


def _task_geom_fusion(work_dir: str, mode: str) -> List[str]:
    return [
        "ptcrGeomRefine/ptcrGeomRefine.py",
        "fusion_v2",
        "-i", os.path.join(work_dir, f"depth_{mode}.png"),
        "--ref", os.path.join(work_dir, "depth_sparse_ref.png"),
        "-o", os.path.join(work_dir, f"fused_{mode}.png"),
        "--color-image", os.path.join(work_dir, f"pano_{mode}.png"),
        "--ply",
    ]


def build_flat_commands(work_dir: str, raw_dir: str, pointcloud: str, modes: List[str]) -> Dict[str, List[str]]:
    commands: Dict[str, List[str]] = {
        "prepare": _task_prepare(work_dir, raw_dir, pointcloud),
        "sparse_depth": _task_sparse_depth(work_dir, pointcloud),
        "geom_raw": _task_geom_raw(work_dir),
    }
    for mode in modes:
        commands[f"stitch_{mode}"] = _task_stitch(work_dir, mode, pointcloud)
        commands[f"depth_{mode}"] = _task_depth_placeholder(work_dir, mode)
        commands[f"fusion_{mode}"] = _task_geom_fusion(work_dir, mode)
    return commands


def run_task(project_root: str, task_name: str, work_dir: str, raw_dir: str, pointcloud: str, modes_csv: str = "raw,standard,opt") -> str:
    start = time.time()
    modes = [m.strip() for m in modes_csv.split(",") if m.strip()]
    commands = build_flat_commands(work_dir, raw_dir, pointcloud, modes)
    log_io = io.StringIO()
    outputs: List[str] = []
    ok = True

    with contextlib.redirect_stdout(log_io), contextlib.redirect_stderr(log_io):
        try:
            os.makedirs(work_dir, exist_ok=True)
            os.chdir(project_root)
            if task_name == "all":
                sequence = ["prepare"]
                sequence += [f"stitch_{m}" for m in modes]
                sequence += [f"depth_{m}" for m in modes]
                sequence += ["sparse_depth", "geom_raw"]
                sequence += [f"fusion_{m}" for m in modes]
            else:
                sequence = [task_name]
            for name in sequence:
                if name not in commands:
                    raise KeyError(f"unknown task: {name}. available={sorted(commands.keys()) + ['all']}")
                cmd = commands[name]
                script = cmd[0]
                args = cmd[1:]
                _emit_header(name, cmd)
                run_script(script, args)
                print(f"[ptcrMobile] done={name}\n")
            outputs = [
                os.path.join(work_dir, name)
                for name in os.listdir(work_dir)
                if name.endswith((".png", ".ply", ".txt"))
            ]
        except SystemExit as e:
            if e.code not in (0, None):
                ok = False
                traceback.print_exc()
        except Exception:
            ok = False
            traceback.print_exc()

    return TaskResult(ok, task_name, time.time() - start, log_io.getvalue(), outputs).to_json()


def preview_commands(work_dir: str, raw_dir: str, pointcloud: str, modes_csv: str = "raw,standard,opt") -> str:
    modes = [m.strip() for m in modes_csv.split(",") if m.strip()]
    commands = build_flat_commands(work_dir, raw_dir, pointcloud, modes)
    lines = []
    for name, cmd in commands.items():
        lines.append(f"[{name}] python " + " ".join(cmd))
    return "\n".join(lines)


def health_check() -> str:
    modules = {}
    for name in ["numpy", "PIL", "cv2"]:
        try:
            __import__(name)
            modules[name] = "ok"
        except Exception as exc:  # pragma: no cover
            modules[name] = f"missing: {exc}"
    return json.dumps({"ok": True, "python": sys.version, "modules": modules}, ensure_ascii=False)
