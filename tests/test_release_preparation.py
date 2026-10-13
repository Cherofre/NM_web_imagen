"""Release control flow tests use temporary fixtures, never real installers or keys."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PS = shutil.which("powershell.exe") or shutil.which("powershell")


def run_ps(command, root, **env):
    process_env = {**os.environ, **env}
    # A Python child inherits PS7's module path; let Windows PS5.1 use its own modules.
    process_env["PSModulePath"] = str(Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/Modules")
    return subprocess.run(
        [PS, "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
        cwd=root, env=process_env, capture_output=True,
        text=True, encoding="utf-8", errors="replace", timeout=30,
    )


def fixture(root):
    (root / "scripts").mkdir()
    for name in ("release_validation.ps1", "package_desktop_updater.ps1", "package_desktop_installer.ps1", "package_desktop_portable.ps1", "verify_v1_1_0_packages.ps1"):
        shutil.copy2(ROOT / "scripts" / name, root / "scripts" / name)
    for name in ("release_preflight.ps1", "sync_release_to_g.ps1", "release_one_click.ps1", "package_web_tool.ps1", "release_package_smoke.ps1"):
        shutil.copy2(ROOT / name, root / name)
    tauri = root / "studio-web" / "src-tauri"
    tauri.mkdir(parents=True)
    (tauri / "tauri.conf.json").write_text('{"version":"9.8.7"}', encoding="utf-8")
    (tauri / "Cargo.toml").write_text('[package]\nversion = "9.8.7"\n', encoding="utf-8")
    (root / "VERSION").write_text("9.8.7\n", encoding="utf-8")
    for name in ("app.py", "image_safety.py", "storage.py", "upstream.py", "requirements.txt", "config.example.json", "start_web.ps1", "stop_web.ps1", "start_web.bat", "stop_web.bat", "一键启动.bat", "一键停止.bat", "README.md"):
        (root / name).write_text("fixture\n", encoding="utf-8")
    files = {
        "static/index.html": "classic", "static/styles.css": "body{}", "static/app.js": "void 0;",
        "static/studio/index.html": '<link href="./assets/index-test.css"><script src="./assets/index-test.js"></script>',
        "static/studio/boot-guard.js": "void 0;", "static/studio/assets/index-test.js": "fixture", "static/studio/assets/index-test.css": "body{}",
        "vendor/python/python-3.12.10-embed-amd64.zip": "fake python", "vendor/wheels/demo-py3-none-any.whl": "fake wheel",
    }
    for name, data in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data, encoding="utf-8")
    return tauri


def package(root, desktop=False):
    kind = "desktop" if desktop else "web"
    name = "NM-Image-Studio-v9.8.7-Portable-x64.zip" if desktop else "NM_web_imagen-v9.8.7-Web-x64.zip"
    target = root / "_release" / kind / name
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w") as archive:
        if desktop:
            archive.writestr("NM Image Studio/nm-image-studio-desktop.exe", b"fake exe")
            archive.writestr("NM Image Studio/backend/nm-image-studio-backend.exe", b"fake sidecar")
            archive.writestr("NM Image Studio/portable.mode", b"")
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(root).as_posix()
            if "/" not in rel and (path.suffix in (".zip", ".sha256") or rel == "dummy-key"):
                continue
            if rel.startswith(("scripts/", "studio-web/", "_release/")) or rel in ("release_preflight.ps1", "sync_release_to_g.ps1", "release_one_click.ps1", "package_web_tool.ps1", "release_package_smoke.ps1"):
                continue
            if desktop and rel != "VERSION" and not rel.startswith("static/studio/"):
                continue
            prefix = "NM Image Studio/backend/" if desktop else "NM_web_imagen/"
            archive.writestr(prefix + rel, path.read_bytes())
    manifest(target, mode="desktop-portable" if desktop else "web-portable")
    return target


def manifest(path, **fields):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    path.with_suffix(".manifest.json").write_text(json.dumps({"version": "9.8.7", "sha256": digest, **fields}), encoding="utf-8")
    path.with_suffix(".sha256").write_text(digest + "  " + path.name, encoding="ascii")


@unittest.skipUnless(PS, "Windows PowerShell required")
class ReleasePreparationTests(unittest.TestCase):
    def test_skip_build_refuses_an_old_backend_before_overwriting_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            tauri = fixture(root)
            backend = tauri / "target/release/backend"
            backend.mkdir(parents=True)
            (backend.parent / "nm-image-studio-desktop.exe").write_bytes(b"fake shell")
            (backend / "nm-image-studio-backend.exe").write_bytes(b"old sidecar")
            (backend / "VERSION").write_text("9.8.6", encoding="utf-8")
            output = root / "keep.zip"
            output.write_bytes(b"keep existing artifact")
            result = run_ps("& ./scripts/package_desktop_portable.ps1 -SkipBuild -OutputPath ./keep.zip", root)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("Release backend version mismatch", result.stderr)
            self.assertEqual(b"keep existing artifact", output.read_bytes())

    def test_one_click_passes_the_same_selected_zip_to_every_release_step(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            fixture(root)
            source = root / "studio-web/src"
            source.mkdir()
            (source / "fixture.test.mjs").write_text("", encoding="utf-8")
            command = r"""
$global:calls = @()
function node { $global:LASTEXITCODE = 0 }
function npm { $global:LASTEXITCODE = 0 }
function python { $global:LASTEXITCODE = 0 }
function powershell { $global:calls += [pscustomobject]@{ arguments = [string[]]$args }; $global:LASTEXITCODE = 0 }
& ./release_one_click.ps1 -ZipPath './selected release.zip' -DestinationRoot './unused'
$global:calls | ConvertTo-Json -Depth 5 | Set-Content ./calls.json -Encoding UTF8
"""
            result = run_ps(command, root)
            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
            calls = [call["arguments"] for call in json.loads((root / "calls.json").read_text(encoding="utf-8-sig"))]
            selected = str((root / "selected release.zip").resolve())
            self.assertEqual(5, len(calls))
            self.assertEqual(selected, calls[0][calls[0].index("-OutputPath") + 1])
            for call in calls[1:]:
                self.assertEqual(selected, call[call.index("-ZipPath") + 1])
            self.assertIn("-SkipPackage", calls[3])
            self.assertFalse((root / "unused").exists())

    def test_version_mismatch_stops_before_build_and_output_mutation(self):
        for name in ("installer", "portable", "updater"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                fixture(root)
                (root / "dummy-key").write_bytes(b"")
                key = " -PrivateKeyPath ./dummy-key" if name == "updater" else ""
                output = " -OutputDirectory ./untouched" if name == "updater" else " -OutputPath ./untouched/package.zip"
                result = run_ps(f"$ErrorActionPreference='Stop'; function npm {{ throw 'build must not run' }}; & ./scripts/package_desktop_{name}.ps1 -ReleaseVersion 9.8.8{key}{output}", root)
                self.assertNotEqual(0, result.returncode)
                self.assertIn("Release version mismatch", result.stderr)
                self.assertFalse((root / "untouched").exists())

    def test_verification_accepts_any_consistent_version_and_rejects_stale_packages(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            fixture(root)
            web = package(root)
            portable = package(root, desktop=True)
            for suffix, mode in (("Setup", "download-bootstrapper"), ("Offline-WebView2-Setup", "embedded-offline-installer")):
                path = portable.parent / f"NM-Image-Studio-v9.8.7-{suffix}-x64.exe"
                path.write_bytes(b"fake installer")
                manifest(path, webview2=mode)
            command = "& ./scripts/verify_v1_1_0_packages.ps1 -ExpectedVersion 9.8.7"
            result = run_ps(command, root)
            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
            self.assertIn("does not prove", result.stdout)
            (root / "app.py").write_text("new backend", encoding="utf-8")
            result = run_ps(command, root)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("app.py differs", result.stderr)
            package(root)  # Refresh only web; desktop should still fail on changed resource.
            (root / "static/studio/assets/index-test.css").write_text("new css", encoding="utf-8")
            package(root)
            result = run_ps(command, root)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("NM Image Studio/backend/static/studio/assets/index-test.css", result.stderr)

    def test_explicit_zip_preflight_ignores_default_decoy_and_checks_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            fixture(root)
            old = package(root)
            (root / "app.py").write_text("current", encoding="utf-8")
            fresh = root / "selected.zip"
            shutil.copy2(package(root), fresh)
            # The default artifact becomes an older payload after explicit selection.
            (root / "app.py").write_text("old", encoding="utf-8")
            package(root)
            (root / "app.py").write_text("current", encoding="utf-8")
            result = run_ps("& ./release_preflight.ps1 -LocalOnly -ZipPath ./selected.zip -ExpectedVersion 9.8.7", root)
            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
            result = run_ps("& ./release_preflight.ps1 -LocalOnly", root)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("app.py differs", result.stderr)
            result = run_ps("& ./sync_release_to_g.ps1 -SkipPackage -ZipPath ./missing.txt -DestinationRoot ./unused", root)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("Release ZIP was not found", result.stderr)
            self.assertFalse((root / "unused").exists())

    def test_web_freshness_rejects_changed_launchers_and_offline_inputs(self):
        runtime_files = (
            "start_web.ps1", "stop_web.ps1", "start_web.bat", "stop_web.bat",
            "一键启动.bat", "一键停止.bat", "config.example.json",
            "vendor/python/python-3.12.10-embed-amd64.zip", "vendor/wheels/demo-py3-none-any.whl",
        )
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            fixture(root)
            archive = package(root)
            for name in runtime_files:
                with self.subTest(name=name):
                    source = root / name
                    original = source.read_bytes()
                    source.write_bytes(original + b"changed")
                    result = run_ps(". ./scripts/release_validation.ps1; Assert-ReleaseZipFreshness -ZipPath $env:TEST_ZIP -RepoRoot $PWD.Path -Kind web", root, TEST_ZIP=str(archive))
                    self.assertNotEqual(0, result.returncode)
                    self.assertIn("Release package is stale", result.stderr)
                    source.write_bytes(original)

    def test_updater_keeps_snapshot_and_rejects_reusing_residual_signature_next_run(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            tauri = fixture(root)
            bundle = tauri / "target/release/bundle/nsis"
            bundle.mkdir(parents=True)
            source = bundle / "Studio_9.8.7_x64-setup.exe"
            source.write_bytes(b"signed payload A")
            Path(str(source) + ".sig").write_bytes(b"fake signature paired with A")
            (root / "dummy-key").write_bytes(b"")
            command = r"""
$ErrorActionPreference = 'Stop'
function powershell.exe {
  $items = @($args)
  $file = $items[$items.IndexOf('-File') + 1]
  if ($file -like '*package_desktop_installer.ps1') {
    [IO.File]::WriteAllBytes($env:TEST_NSIS_SOURCE, [Text.Encoding]::UTF8.GetBytes('ordinary payload B'))
    $output = $items[$items.IndexOf('-OutputPath') + 1]
    Copy-Item -LiteralPath $env:TEST_NSIS_SOURCE -Destination $output
  } elseif ($file -like '*package_desktop_portable.ps1') {
    $output = $items[$items.IndexOf('-OutputPath') + 1]
    [IO.File]::WriteAllBytes($output, [Text.Encoding]::UTF8.GetBytes('fake portable'))
  } elseif ($file -notlike '*generate_desktop_update_feed.ps1') { throw 'unexpected native command' }
  $global:LASTEXITCODE = 0
}
function npm {
  if ($args -contains 'build') {
    [IO.File]::WriteAllBytes($env:TEST_NSIS_SOURCE, [Text.Encoding]::UTF8.GetBytes('signed payload A'))
    [IO.File]::WriteAllBytes(($env:TEST_NSIS_SOURCE + '.sig'), [Text.Encoding]::UTF8.GetBytes('fake signature paired with A'))
  }
  $global:LASTEXITCODE = 0
}
& ./scripts/package_desktop_updater.ps1 -PrivateKeyPath ./dummy-key -OutputDirectory ./result
"""
            result = run_ps(command, root, TEST_NSIS_SOURCE=str(source))
            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
            updater = root / "result/NM-Image-Studio-v9.8.7-Updater-x64.exe"
            self.assertEqual(b"ordinary payload B", source.read_bytes())
            self.assertEqual(b"signed payload A", updater.read_bytes())
            self.assertEqual(b"fake signature paired with A", Path(str(updater) + ".sig").read_bytes())
            # After the ordinary build, shared source B still has residual fake signature A.
            self.assertEqual(b"fake signature paired with A", Path(str(source) + ".sig").read_bytes())
            second = run_ps("& ./scripts/package_desktop_updater.ps1 -SkipBuild -PrivateKeyPath ./dummy-key -OutputDirectory ./result", root)
            self.assertNotEqual(0, second.returncode)
            self.assertIn("shared NSIS directory", second.stderr)
            self.assertIn("fresh signed build", second.stderr)
            self.assertEqual(b"signed payload A", updater.read_bytes())
            self.assertEqual(b"fake signature paired with A", Path(str(updater) + ".sig").read_bytes())


if __name__ == "__main__":
    unittest.main()
