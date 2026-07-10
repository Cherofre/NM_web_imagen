import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
import zipfile

from fastapi.testclient import TestClient

import app as webapp


ROOT = Path(__file__).resolve().parents[1]
POWERSHELL = shutil.which("powershell.exe") or shutil.which("powershell")
WINDOWS_RELEASE_SCRIPTS = (
    "start_web.ps1",
    "package_web_tool.ps1",
    "release_one_click.ps1",
    "release_preflight.ps1",
    "release_package_smoke.ps1",
    "sync_release_to_g.ps1",
)


def run_powershell(
    arguments: list[str],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    if not POWERSHELL:
        raise unittest.SkipTest("Windows PowerShell is unavailable")
    process_env = os.environ.copy()
    process_env["PYTHONUTF8"] = "1"
    if env:
        process_env.update(env)
    return subprocess.run(
        [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", *arguments],
        cwd=cwd,
        env=process_env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
        check=False,
    )


def invoke_script_function(
    script_path: Path,
    function_name: str,
    invocation: str,
    *,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    command = r"""
$ErrorActionPreference = 'Stop'
$Tokens = $null
$Errors = $null
$Ast = [System.Management.Automation.Language.Parser]::ParseFile(
  $env:CODEX_SCRIPT_PATH,
  [ref]$Tokens,
  [ref]$Errors
)
if ($Errors.Count -gt 0) {
  throw ($Errors | ForEach-Object { $_.Message } | Out-String)
}
$Function = $Ast.Find({
  param($Node)
  $Node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $Node.Name -eq $env:CODEX_FUNCTION_NAME
}, $true)
if ($null -eq $Function) {
  throw "Function was not found: $env:CODEX_FUNCTION_NAME"
}
Invoke-Expression $Function.Extent.Text
Invoke-Expression $env:CODEX_FUNCTION_INVOCATION
"""
    process_env = {
        "CODEX_SCRIPT_PATH": str(script_path),
        "CODEX_FUNCTION_NAME": function_name,
        "CODEX_FUNCTION_INVOCATION": invocation,
    }
    if env:
        process_env.update(env)
    return run_powershell(["-Command", command], env=process_env)


class ReleaseCacheBustingTests(unittest.TestCase):
    def test_windows_release_scripts_have_utf8_bom(self) -> None:
        for relative_path in WINDOWS_RELEASE_SCRIPTS:
            path = ROOT / relative_path
            self.assertTrue(path.exists(), relative_path)
            self.assertTrue(
                path.read_bytes().startswith(b"\xef\xbb\xbf"),
                f"{relative_path} must start with a UTF-8 BOM",
            )

    def test_windows_release_scripts_parse_in_powershell_51(self) -> None:
        for relative_path in WINDOWS_RELEASE_SCRIPTS:
            self.assertTrue((ROOT / relative_path).exists(), relative_path)
        command = r"""
$ErrorActionPreference = 'Stop'
foreach ($Path in $env:CODEX_PARSE_PATHS.Split([System.IO.Path]::PathSeparator)) {
  $Tokens = $null
  $Errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile(
    $Path,
    [ref]$Tokens,
    [ref]$Errors
  ) | Out-Null
  if ($Errors.Count -gt 0) {
    throw "$Path`n$($Errors | ForEach-Object { $_.Message } | Out-String)"
  }
}
"""
        result = run_powershell(
            ["-Command", command],
            env={
                "CODEX_PARSE_PATHS": os.pathsep.join(
                    str(ROOT / path) for path in WINDOWS_RELEASE_SCRIPTS
                )
            },
        )

        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_compute_instance_id_matches_normalized_root_hash(self) -> None:
        self.assertTrue(hasattr(webapp, "compute_instance_id"))
        with tempfile.TemporaryDirectory(prefix="实例 身份 ") as folder:
            root = Path(folder) / "中文 子目录"
            root.mkdir()
            normalized = str(root.resolve()).replace("/", "\\").rstrip("\\").casefold()
            expected = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:20]

            self.assertEqual(expected, webapp.compute_instance_id(root))
            self.assertEqual(expected, webapp.compute_instance_id(root / "."))

    def test_health_returns_non_empty_instance_id(self) -> None:
        with TestClient(webapp.create_app()) as client:
            payload = client.get("/api/health").json()

        self.assertIn("instance_id", payload)
        self.assertTrue(payload["instance_id"])
        self.assertEqual(webapp.compute_instance_id(), payload["instance_id"])

    def test_start_script_instance_id_matches_python(self) -> None:
        self.assertTrue(hasattr(webapp, "compute_instance_id"))
        with tempfile.TemporaryDirectory(prefix="脚本 身份 ") as folder:
            root = Path(folder) / "中文 工具"
            root.mkdir()
            result = invoke_script_function(
                ROOT / "start_web.ps1",
                "Get-InstanceId",
                "Get-InstanceId -RootPath $env:CODEX_INSTANCE_ROOT",
                env={"CODEX_INSTANCE_ROOT": str(root)},
            )

        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual(webapp.compute_instance_id(root), result.stdout.strip().splitlines()[-1])

    def test_runtime_fingerprint_invalidates_for_every_runtime_input(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            python_zip = root / "python.zip"
            requirements = root / "requirements.txt"
            wheels = root / "wheels"
            wheels.mkdir()
            python_zip.write_bytes(b"python-one")
            requirements.write_text("demo==1\n", encoding="utf-8")
            (wheels / "z-demo-py3-none-any.whl").write_bytes(b"wheel-z")
            (wheels / "a-demo-py3-none-any.whl").write_bytes(b"wheel-a")
            process_env = {
                "CODEX_PYTHON_ZIP": str(python_zip),
                "CODEX_REQUIREMENTS": str(requirements),
                "CODEX_WHEEL_DIR": str(wheels),
            }
            invocation = (
                "$PortablePythonZip=$env:CODEX_PYTHON_ZIP; "
                "$RequirementsPath=$env:CODEX_REQUIREMENTS; "
                "$WheelDir=$env:CODEX_WHEEL_DIR; Get-RuntimeFingerprint"
            )

            def fingerprint() -> str:
                result = invoke_script_function(
                    ROOT / "start_web.ps1",
                    "Get-RuntimeFingerprint",
                    invocation,
                    env=process_env,
                )
                self.assertEqual(0, result.returncode, result.stdout + result.stderr)
                value = result.stdout.strip().splitlines()[-1]
                self.assertRegex(value, r"^[0-9a-f]{64}$")
                return value

            baseline = fingerprint()
            self.assertEqual(baseline, fingerprint())
            requirements.write_text("demo==2\n", encoding="utf-8")
            requirements_changed = fingerprint()
            self.assertNotEqual(baseline, requirements_changed)
            requirements.write_text("demo==1\n", encoding="utf-8")
            python_zip.write_bytes(b"python-two")
            zip_changed = fingerprint()
            self.assertNotEqual(baseline, zip_changed)
            python_zip.write_bytes(b"python-one")
            (wheels / "a-demo-py3-none-any.whl").write_bytes(b"wheel-a-two")
            wheel_content_changed = fingerprint()
            self.assertNotEqual(baseline, wheel_content_changed)
            (wheels / "a-demo-py3-none-any.whl").write_bytes(b"wheel-a")
            (wheels / "z-demo-py3-none-any.whl").rename(
                wheels / "b-demo-py3-none-any.whl"
            )
            wheel_name_changed = fingerprint()
            self.assertNotEqual(baseline, wheel_name_changed)

    def test_start_script_hardens_runtime_reuse_and_backend_identity(self) -> None:
        script = (ROOT / "start_web.ps1").read_text(encoding="utf-8")

        self.assertIn("function Get-RuntimeFingerprint", script)
        self.assertIn('Join-Path $RuntimeDir "runtime.fingerprint"', script)
        self.assertIn("[switch]$PrepareOnly", script)
        self.assertIn("[switch]$NoBrowser", script)
        self.assertIn("$HealthPayload.instance_id -eq $InstanceId", script)
        self.assertNotRegex(
            script,
            re.compile(r"Remove-Item\s+-LiteralPath\s+\$PortablePythonZip", re.IGNORECASE),
        )

    def test_version_file_exists_for_release_url_cache_busting(self) -> None:
        version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()

        self.assertRegex(version, r"^\d+\.\d+\.\d+$")

    def test_start_script_opens_versioned_url(self) -> None:
        script = (ROOT / "start_web.ps1").read_text(encoding="utf-8")

        self.assertIn('Join-Path $ScriptDir "VERSION"', script)
        self.assertIn("[System.Uri]::EscapeDataString($AppVersion)", script)
        self.assertRegex(script, re.compile(r'\$OpenUrl\s*=\s*"\$Url/\?v=\$\(', re.MULTILINE))
        self.assertIn("Start-Process $OpenUrl", script)
        self.assertNotIn("Start-Process $Url", script)

    def test_start_script_validates_studio_assets_before_reusing_server(self) -> None:
        script = (ROOT / "start_web.ps1").read_text(encoding="utf-8")

        self.assertIn("function Test-StudioAssets", script)
        self.assertRegex(
            script,
            re.compile(
                r"if\s*\(Test-LocalServer\)\s*\{(?:(?!\n\}).)*Test-StudioAssets",
                re.DOTALL,
            ),
        )
        self.assertIn("Restarting current web tool service", script)

    def test_start_script_validates_required_api_routes_before_reusing_server(self) -> None:
        script = (ROOT / "start_web.ps1").read_text(encoding="utf-8")

        self.assertIn("function Test-RequiredApiRoutes", script)
        self.assertIn("$DiagnosticsUrl = \"$Url/api/diagnostics\"", script)
        self.assertIn('"checks" = @("chat")', script)
        self.assertRegex(
            script,
            re.compile(
                r"if\s*\(Test-LocalServer\)\s*\{(?:(?!\n\}).)*if\s*\(\(Test-BackendVersion\) -and \(Test-StudioAssets\) -and \(Test-RequiredApiRoutes\)\)",
                re.DOTALL,
            ),
        )

    def test_start_script_validates_backend_version_before_reusing_server(self) -> None:
        script = (ROOT / "start_web.ps1").read_text(encoding="utf-8")

        self.assertIn("function Test-BackendVersion", script)
        self.assertIn("$HealthPayload = $Response.Content | ConvertFrom-Json", script)
        self.assertIn("$HealthPayload.version -eq $AppVersion", script)
        self.assertRegex(
            script,
            re.compile(
                r"if\s*\(Test-LocalServer\)\s*\{(?:(?!\n\}).)*if\s*\(\(Test-BackendVersion\) -and \(Test-StudioAssets\) -and \(Test-RequiredApiRoutes\)\)",
                re.DOTALL,
            ),
        )

    def test_start_script_can_restart_recognized_old_backend(self) -> None:
        script = (ROOT / "start_web.ps1").read_text(encoding="utf-8")

        self.assertIn("function Stop-ExistingWebToolProcesses", script)
        self.assertIn("Get-NetTCPConnection -LocalPort $Port -State Listen", script)
        self.assertIn("Stop-Process -Id $ProcessId -Force", script)
        self.assertIn("$ResolvedAppPath = [System.IO.Path]::GetFullPath($AppPath)", script)
        self.assertNotIn('$NormalizedCommand -like "*\\app.py*"', script)
        self.assertNotIn('$NormalizedCommand -like "* app.py*"', script)
        self.assertNotIn('$NormalizedCommand -like "*.\\app.py*"', script)

    def test_studio_index_uses_file_openable_asset_urls(self) -> None:
        index_path = ROOT / "static" / "studio" / "index.html"
        html = index_path.read_text(encoding="utf-8")

        asset_refs = re.findall(r'(?:src|href)="([^"]*assets/[^"]+\.(?:js|css))"', html)

        self.assertGreaterEqual(len(asset_refs), 2)
        for asset_ref in asset_refs:
            self.assertFalse(
                asset_ref.startswith("/"),
                f"{asset_ref} breaks when static/studio/index.html is opened directly",
            )
            self.assertTrue((index_path.parent / asset_ref).resolve().exists(), asset_ref)

    def test_studio_index_does_not_require_module_script_for_file_open(self) -> None:
        html = (ROOT / "static" / "studio" / "index.html").read_text(encoding="utf-8")

        self.assertNotIn('type="module"', html)
        self.assertRegex(html, r'<script defer src="\./assets/[^"]+\.js"></script>')

    def test_release_keeps_v104_hashed_assets_as_cache_fallbacks(self) -> None:
        assets_dir = ROOT / "static" / "studio" / "assets"
        fallback_script = (ROOT / "studio-web" / "scripts" / "keep-asset-fallbacks.mjs").read_text(encoding="utf-8")

        for asset_name in ["index-CnP0RvwW.js", "index-Dr4xysUg.css"]:
            self.assertTrue((assets_dir / asset_name).exists(), asset_name)
            self.assertIn(asset_name, fallback_script)

    def test_one_click_release_runs_checks_before_sync(self) -> None:
        script = (ROOT / "release_one_click.ps1").read_text(encoding="utf-8")

        self.assertIn("node --test", script)
        self.assertIn("generationQueue.test.mjs", script)
        self.assertIn("npm run build", script)
        self.assertIn("python -m py_compile .\\app.py", script)
        self.assertIn("python -m unittest tests.test_studio_sessions tests.test_release_cache_busting", script)
        self.assertIn("failed with exit code", script)
        self.assertIn("Package clean zip", script)
        self.assertIn("Package smoke", script)
        self.assertIn("Local release preflight", script)
        self.assertIn("Sync clean package", script)
        self.assertIn("Destination verification", script)
        self.assertLess(script.index("Frontend tests"), script.index("Package clean zip"))
        self.assertLess(script.index("Package clean zip"), script.index("Package smoke"))
        self.assertLess(script.index("Package smoke"), script.index("Local release preflight"))
        self.assertLess(script.index("Local release preflight"), script.index("Sync clean package"))
        self.assertLess(script.index("Sync clean package"), script.index("Destination verification"))
        self.assertIn("-SkipPackage", script)
        self.assertIn("-LocalOnly", script)
        self.assertIn("-ExpectedVersion", script)
        self.assertIn("release_package_smoke.ps1", script)
        self.assertIn("sync_release_to_g.ps1", script)
        self.assertIn("release_preflight.ps1", script)

    def test_package_smoke_uses_only_extracted_package_and_started_pid(self) -> None:
        path = ROOT / "release_package_smoke.ps1"
        self.assertTrue(path.exists())
        script = path.read_text(encoding="utf-8")

        self.assertIn("[string]$ZipPath", script)
        self.assertIn("[System.Guid]::NewGuid()", script)
        self.assertIn("Expand-Archive", script)
        self.assertIn('Join-Path $ExtractedAppDir "start_web.ps1"', script)
        self.assertIn("-PrepareOnly", script)
        self.assertIn("-NoBrowser", script)
        self.assertIn("Get-FreeLoopbackPort", script)
        self.assertIn("-WindowStyle Hidden", script)
        self.assertIn("/api/health", script)
        self.assertIn("instance_id", script)
        self.assertIn("Stop-Process -Id $BackendProcess.Id", script)
        self.assertNotIn("G:\\", script)

    def test_preflight_checks_versioned_zip_and_exclusions(self) -> None:
        script = (ROOT / "release_preflight.ps1").read_text(encoding="utf-8")

        self.assertIn('"^\\d+\\.\\d+\\.\\d+$"', script)
        self.assertIn("$AppName-v$Version.zip", script)
        self.assertIn("Test-ZipClean", script)
        self.assertIn("config\\.local\\.json", script)
        self.assertIn('"^$AppName/output/"', script)
        self.assertIn("outputs", script)
        self.assertIn(".runtime", script)
        self.assertIn("PROJECT_STATUS|NEXT_ACTIONS|DECISIONS", script)
        self.assertIn("release_one_click", script)
        self.assertIn("sync_release_to_g", script)
        self.assertIn('"^$AppName/tests/"', script)
        self.assertIn('"^$AppName/studio-web/"', script)
        self.assertIn("Assert-DirectoryMatchesZip", script)
        self.assertIn("Get-StreamSha256", script)
        self.assertIn("Get-FileSha256", script)
        self.assertIn("ExpectedVersion", script)
        self.assertIn("Get-ForbiddenReleasePatterns", script)
        self.assertIn("Package contains release batch launcher", script)
        self.assertIn("Package text contains development or local token", script)
        self.assertIn("[switch]$LocalOnly", script)

    def test_local_only_preflight_does_not_resolve_destination(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            app_dir = root / "NM_web_imagen"
            studio_dir = app_dir / "static" / "studio"
            assets_dir = studio_dir / "assets"
            assets_dir.mkdir(parents=True)
            shutil.copy2(ROOT / "release_preflight.ps1", app_dir / "release_preflight.ps1")
            (app_dir / "VERSION").write_text("1.0.5\n", encoding="utf-8")
            (studio_dir / "index.html").write_text(
                '<link href="./assets/app.css" rel="stylesheet">\n'
                '<script defer src="./assets/app.js"></script>\n',
                encoding="utf-8",
            )
            (assets_dir / "app.css").write_text("body{}", encoding="utf-8")
            (assets_dir / "app.js").write_text("void 0;", encoding="utf-8")
            package_path = root / "NM_web_imagen-v1.0.5.zip"
            with zipfile.ZipFile(package_path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("NM_web_imagen/README.md", "portable")
                archive.writestr("NM_web_imagen/static/studio/assets/app.css", "body{}")
                archive.writestr("NM_web_imagen/static/studio/assets/app.js", "void 0;")

            result = run_powershell(
                [
                    "-File",
                    str(app_dir / "release_preflight.ps1"),
                    "-LocalOnly",
                    "-ExpectedVersion",
                    "1.0.5",
                    "-DestinationRoot",
                    r"G:\__codex_local_only_must_not_resolve__",
                ],
                cwd=app_dir,
            )

        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("Local release preflight passed", result.stdout)

    def test_package_script_uses_explicit_release_allowlist(self) -> None:
        script = (ROOT / "package_web_tool.ps1").read_text(encoding="utf-8")

        self.assertIn("$ReleaseFiles = @(", script)
        for name in (
            "app.py",
            "image_safety.py",
            "storage.py",
            "upstream.py",
            "requirements.txt",
            "VERSION",
            "config.example.json",
            "start_web.ps1",
            "stop_web.ps1",
            "start_web.bat",
            "stop_web.bat",
            "一键启动.bat",
            "一键停止.bat",
        ):
            self.assertIn(f'"{name}"', script)
        self.assertIn("$ReleaseTrees = @(", script)
        self.assertIn('"static"', script)
        self.assertIn('"vendor"', script)
        self.assertNotIn("$ExcludedDirs", script)
        self.assertNotIn("$ExcludedFiles", script)
        self.assertNotIn("function Test-IsExcludedFile", script)
        self.assertNotRegex(
            script,
            re.compile(r"Get-ChildItem\s+-LiteralPath\s+\$ScriptDir\s+-Recurse", re.IGNORECASE),
        )
        self.assertIn("Test-PackageZipClean", script)
        self.assertIn("$AppName-v$Version.zip", script)
        self.assertIn("Write-PackageReadme", script)

    def test_package_smoke_script_is_rejected_by_release_validators(self) -> None:
        forbidden_pattern = r"release_package_smoke\.ps1"
        for name in (
            "package_web_tool.ps1",
            "release_preflight.ps1",
            "sync_release_to_g.ps1",
        ):
            script = (ROOT / name).read_text(encoding="utf-8")
            self.assertIn(forbidden_pattern, script, name)

    def test_package_manifest_is_allowlisted_and_ignores_nested_chinese_privacy_file(self) -> None:
        release_files = (
            "app.py",
            "image_safety.py",
            "storage.py",
            "upstream.py",
            "requirements.txt",
            "VERSION",
            "config.example.json",
            "start_web.ps1",
            "stop_web.ps1",
            "start_web.bat",
            "stop_web.bat",
            "一键启动.bat",
            "一键停止.bat",
        )
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / "source"
            source.mkdir()
            shutil.copy2(ROOT / "package_web_tool.ps1", source / "package_web_tool.ps1")
            for name in release_files:
                content = "1.0.5\n" if name == "VERSION" else f"fixture: {name}\n"
                (source / name).write_text(content, encoding="utf-8")
            (source / "static").mkdir()
            (source / "static" / "asset.txt").write_text("asset", encoding="utf-8")
            (source / "vendor" / "python").mkdir(parents=True)
            (source / "vendor" / "wheels").mkdir()
            (source / "vendor" / "python" / "python-3.12.10-embed-amd64.zip").write_bytes(
                b"portable-python"
            )
            (source / "vendor" / "wheels" / "demo-py3-none-any.whl").write_bytes(
                b"wheel"
            )
            privacy_dir = source / "临时资料" / "客户 A"
            privacy_dir.mkdir(parents=True)
            (privacy_dir / "企业微信截图-隐私.txt").write_text(
                "must stay outside package", encoding="utf-8"
            )
            (source / "release_one_click.ps1").write_text("development", encoding="utf-8")
            output_path = root / "package.zip"

            result = run_powershell(
                [
                    "-File",
                    str(source / "package_web_tool.ps1"),
                    "-OutputPath",
                    str(output_path),
                ],
                cwd=source,
            )
            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
            with zipfile.ZipFile(output_path) as archive:
                manifest = {
                    name.replace("\\", "/")
                    for name in archive.namelist()
                    if not name.endswith("/")
                }

        expected = {f"NM_web_imagen/{name}" for name in release_files}
        expected.update(
            {
                "NM_web_imagen/README.md",
                "NM_web_imagen/static/asset.txt",
                "NM_web_imagen/vendor/python/python-3.12.10-embed-amd64.zip",
                "NM_web_imagen/vendor/wheels/demo-py3-none-any.whl",
            }
        )
        self.assertEqual(expected, manifest)

    def test_stop_script_only_stops_current_tool_backend(self) -> None:
        script = (ROOT / "stop_web.ps1").read_text(encoding="utf-8")

        self.assertIn("$ResolvedAppPath = [System.IO.Path]::GetFullPath($AppPath)", script)
        self.assertNotIn('$NormalizedCommand -like "*\\app.py*"', script)
        self.assertNotIn('$NormalizedCommand -like "* app.py*"', script)
        self.assertNotIn('$NormalizedCommand -like "*.\\\\app.py*"', script)

    def test_one_click_batch_uses_release_script(self) -> None:
        script = (ROOT / "一键发布.bat").read_text(encoding="utf-8")

        self.assertIn("release_one_click.ps1", script)
        self.assertIn("ExecutionPolicy Bypass", script)

    def test_sync_script_updates_only_versioned_zip(self) -> None:
        script = (ROOT / "sync_release_to_g.ps1").read_text(encoding="utf-8")

        self.assertIn("$AppName-v$Version.zip", script)
        self.assertIn("Assert-CleanPackageZip", script)
        self.assertIn("Refusing to create missing company share anchor", script)
        self.assertNotIn("$DestinationZip", script)
        self.assertNotIn("$LatestZip", script)
        self.assertNotIn('Join-Path $DestinationRoot "$AppName.zip"', script)

    def test_release_scripts_allow_known_company_share_mount_variants(self) -> None:
        sync_script = (ROOT / "sync_release_to_g.ps1").read_text(encoding="utf-8")
        preflight_script = (ROOT / "release_preflight.ps1").read_text(encoding="utf-8")

        for script in (sync_script, preflight_script):
            self.assertIn("Get-CompanyShareRootCandidates", script)
            self.assertIn('Join-Path "G:\\su\\doc\\Tools"', script)
            self.assertIn('Join-Path "G:\\doc\\Tools"', script)
            self.assertIn("Resolve-CompanyShareRoot", script)
            self.assertIn("Assert-AllowedCompanyShareRoot", script)


if __name__ == "__main__":
    unittest.main()
