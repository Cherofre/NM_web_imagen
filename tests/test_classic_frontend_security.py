import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ClassicFrontendSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.app_source = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
        cls.html_source = (ROOT / "static" / "index.html").read_text(encoding="utf-8")

    def test_browser_config_is_recursively_sanitized_before_storage(self) -> None:
        self.assertIn("function sanitizeBrowserConfig", self.app_source)
        self.assertRegex(
            self.app_source,
            re.compile(
                r"function saveFormState\(form\)\s*\{[\s\S]*?sanitizeBrowserConfig\(collectFormState\(form\)\)",
            ),
        )
        self.assertRegex(
            self.app_source,
            re.compile(
                r"function writeConfigProfiles\(profiles\)\s*\{[\s\S]*?sanitizeBrowserConfig\(profiles\)",
            ),
        )

    def test_legacy_browser_storage_is_rewritten_without_api_keys(self) -> None:
        restore_source = re.search(
            r"function restoreFormState\(form\)\s*\{([\s\S]*?)\n\}",
            self.app_source,
        )
        self.assertIsNotNone(restore_source)
        self.assertIn("sanitizeBrowserConfig", restore_source.group(1))
        self.assertIn("localStorage.setItem", restore_source.group(1))

        profiles_source = re.search(
            r"function readConfigProfiles\(\)\s*\{([\s\S]*?)\n\}",
            self.app_source,
        )
        self.assertIsNotNone(profiles_source)
        self.assertIn("sanitizeBrowserConfig", profiles_source.group(1))
        self.assertIn("localStorage.setItem", profiles_source.group(1))

    def test_classic_hides_unsupported_edit_controls(self) -> None:
        self.assertNotIn('name="edit_mode"', self.html_source)
        self.assertNotIn('name="reference_strength"', self.html_source)


if __name__ == "__main__":
    unittest.main()
