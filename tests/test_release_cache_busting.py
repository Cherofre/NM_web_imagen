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


if __name__ == "__main__":
    unittest.main()
