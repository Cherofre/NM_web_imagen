from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ReleaseCacheBustingTests(unittest.TestCase):
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
                r"if\s*\(Test-LocalServer\)\s*\{(?:(?!\n\}).)*if\s*\(\(Test-StudioAssets\) -and \(Test-RequiredApiRoutes\)\)",
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

    def test_one_click_release_runs_checks_before_sync(self) -> None:
        script = (ROOT / "release_one_click.ps1").read_text(encoding="utf-8")

        self.assertIn("node --test", script)
        self.assertIn("generationQueue.test.mjs", script)
        self.assertIn("npm run build", script)
        self.assertIn("python -m py_compile .\\app.py", script)
        self.assertIn("python -m unittest tests.test_studio_sessions tests.test_release_cache_busting", script)
        self.assertIn("failed with exit code", script)
        self.assertLess(script.index("Frontend tests"), script.index("Package and sync"))
        self.assertLess(script.index("Package and sync"), script.index("Release preflight"))
        self.assertIn("sync_release_to_g.ps1", script)
        self.assertIn("release_preflight.ps1", script)

    def test_preflight_checks_versioned_zip_and_exclusions(self) -> None:
        script = (ROOT / "release_preflight.ps1").read_text(encoding="utf-8")

        self.assertIn('"^\\d+\\.\\d+\\.\\d+$"', script)
        self.assertIn("$AppName-v$Version.zip", script)
        self.assertIn("Test-ZipClean", script)
        self.assertIn("config\\.local\\.json", script)
        self.assertIn("outputs", script)
        self.assertIn(".runtime", script)
        self.assertIn("PROJECT_STATUS|NEXT_ACTIONS|DECISIONS", script)
        self.assertIn("release_one_click", script)
        self.assertIn("sync_release_to_g", script)
        self.assertIn('"^$AppName/tests/"', script)
        self.assertIn('"^$AppName/studio-web/"', script)
        self.assertIn("Assert-DirectoryMatchesZip", script)
        self.assertIn("Get-ForbiddenReleasePatterns", script)
        self.assertIn("Package contains release batch launcher", script)
        self.assertIn("Package text contains development or local token", script)

    def test_package_script_excludes_release_only_files(self) -> None:
        script = (ROOT / "package_web_tool.ps1").read_text(encoding="utf-8")

        self.assertIn('"package_web_tool.ps1"', script)
        self.assertIn('"release_one_click.ps1"', script)
        self.assertIn('"release_preflight.ps1"', script)
        self.assertIn('"sync_release_to_g.ps1"', script)
        self.assertIn("release_one_click.ps1", script)
        self.assertIn('"studio-web"', script)
        self.assertIn('"tests"', script)
        self.assertIn("Write-PackageReadme", script)

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
        self.assertNotIn("$DestinationZip", script)
        self.assertNotIn("$LatestZip", script)
        self.assertNotIn('Join-Path $DestinationRoot "$AppName.zip"', script)


if __name__ == "__main__":
    unittest.main()
