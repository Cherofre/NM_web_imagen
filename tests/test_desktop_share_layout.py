"""Exercise the actual distribution script only in isolated temporary shares."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
PS = shutil.which("powershell.exe")
SUFFIXES = [("Setup-x64.exe", "安装版.exe"), ("Offline-WebView2-Setup-x64.exe", "离线安装版.exe"), ("Portable-x64.zip", "便携版.zip")]


def fixture(root):
    scripts = root / "scripts"
    scripts.mkdir()
    shutil.copy2(ROOT / "scripts/release_validation.ps1", scripts / "release_validation.ps1")
    source = (ROOT / "scripts/sync_desktop_release_to_g.ps1").read_text(encoding="utf-8-sig")
    source = source.replace("$AllowedRoot = 'G:\\doc\\Tools\\AI产出工具插件\\美术\\特效组\\网页生图工具'", "$AllowedRoot = Join-Path $RepoRoot 'distribution'")
    (scripts / "sync_desktop_release_to_g.ps1").write_text(source, encoding="utf-8-sig")
    (root / "VERSION").write_text("9.8.7", encoding="utf-8")
    tauri = root / "studio-web/src-tauri"
    tauri.mkdir(parents=True)
    (tauri / "Cargo.toml").write_text('[package]\nversion = "9.8.7"', encoding="utf-8")
    (tauri / "tauri.conf.json").write_text('{"version":"9.8.7"}', encoding="utf-8")
    packages = root / "_release/desktop"
    packages.mkdir(parents=True)
    for suffix, _ in SUFFIXES:
        file = packages / ("NM-Image-Studio-v9.8.7-" + suffix)
        file.write_bytes(suffix.encode())
        file.with_suffix(".manifest.json").write_text(json.dumps({"version": "9.8.7", "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}), encoding="utf-8")
    desktop = root / "distribution/NM Image Studio Desktop"
    desktop.mkdir(parents=True)
    (desktop / "说明-如何选择版本.txt").write_text("NM Image Studio Desktop v1.1.6\n自定义说明要保留\n", encoding="utf-8")
    (root / "distribution/custom.md").write_text("user material", encoding="utf-8")
    return desktop


def run(root, extra="", destination="./distribution"):
    env = dict(os.environ)
    env["PSModulePath"] = str(Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/Modules")
    return subprocess.run([PS, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/sync_desktop_release_to_g.ps1", "-DestinationRoot", destination, *extra.split()], cwd=root, env=env, encoding="utf-8", errors="replace", capture_output=True, timeout=30)


@unittest.skipUnless(PS, "Windows PowerShell 5.1 required")
class DesktopShareLayoutTests(unittest.TestCase):
    def test_updates_only_three_packages_and_archives_old_files_outside_share(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); desktop = fixture(root)
            old = desktop / "NM Image Studio 1.1.6 安装版.exe"
            old.write_bytes(b"older installer")
            Path(str(old) + ".sha256").write_text("old checksum", encoding="utf-8")
            # Existing application data is not a distribution artifact to mirror.
            data = desktop / "my-app/data/config.local.json"
            data.parent.mkdir(parents=True); data.write_text("user data", encoding="utf-8")
            result = run(root)
            self.assertEqual(0, result.returncode, result.stderr)
            expected = {"说明-如何选择版本.txt", "my-app"} | {"NM Image Studio 9.8.7 " + label for _, label in SUFFIXES}
            self.assertEqual(expected, {p.name for p in desktop.iterdir()})
            self.assertEqual("user data", data.read_text())
            self.assertEqual("user material", (root / "distribution/custom.md").read_text())
            self.assertIn("自定义说明要保留", (desktop / "说明-如何选择版本.txt").read_text(encoding="utf-8"))
            self.assertEqual(2, len(list((root / "_release/share-backups").rglob("*.*"))))
            self.assertFalse((desktop / "NM Image Studio").exists())
            before = {p.name: p.stat().st_mtime_ns for p in desktop.iterdir()}
            self.assertEqual(0, run(root).returncode)
            self.assertEqual(before, {p.name: p.stat().st_mtime_ns for p in desktop.iterdir()})

    def test_all_source_hashes_checked_before_any_copy(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); desktop = fixture(root)
            bad = root / "_release/desktop/NM-Image-Studio-v9.8.7-Portable-x64.zip"
            bad.write_bytes(b"tampered")
            before = {p.name for p in desktop.iterdir()}
            result = run(root)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("version/hash verification failed", result.stderr)
            self.assertEqual(before, {p.name for p in desktop.iterdir()})

    def test_preview_never_copies_or_rotates(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); desktop = fixture(root)
            (desktop / "NM Image Studio 1.1.6 安装版.exe").write_bytes(b"old")
            before = {p.name: p.read_bytes() for p in desktop.iterdir()}
            result = run(root, "-Preview")
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual(before, {p.name: p.read_bytes() for p in desktop.iterdir()})
            self.assertFalse((root / "_release/share-backups").exists())

    def test_newer_share_version_blocks_downgrade_before_copy(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); desktop = fixture(root)
            (desktop / "NM Image Studio 10.0.0 安装版.exe").write_bytes(b"newer")
            before = {p.name for p in desktop.iterdir()}
            result = run(root)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("refusing downgrade", result.stderr)
            self.assertEqual(before, {p.name for p in desktop.iterdir()})

    def test_wrong_destination_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); fixture(root)
            result = run(root, destination="./another")
            self.assertNotEqual(0, result.returncode)
            self.assertIn("approved share layout", result.stderr)
            self.assertFalse((root / "another").exists())


if __name__ == "__main__":
    unittest.main()
