import re
import json
import shutil
import subprocess
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

    @unittest.skipUnless(shutil.which("node"), "Node is required for the classic result handler simulation")
    def test_classic_partial_results_keep_images_and_report_actual_count(self) -> None:
        block = re.search(r"lastMetaPayload = buildDisplayPayload\([\s\S]*?\n    finishGenerationProgress\([^\n]+;", self.app_source).group(0)
        script = """
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = CODE;
for (const partial of [true, false]) {
  let removed = false;
  let status = '';
  const ctx = { payload: {ok:true, meta:{partial_result:partial, n:3}}, preparedImages:[{}], job:{},
    buildDisplayPayload: p => p, removeSuccessfulQueueJob: () => {removed=true;},
    resultTitle:{textContent:''}, setStatus: (_kind, text) => {status=text;}, finishGenerationProgress: () => {} };
  vm.runInNewContext(source, ctx);
  assert.equal(ctx.job.status, 'done');
  assert.equal(removed, true);
  assert.equal(ctx.resultTitle.textContent, partial ? '部分生成完成' : '生成完成');
  if (partial) {assert(status.includes('1/3'));assert(ctx.job.message.includes('已保留成功图片'));}
}
""".replace("CODE", json.dumps(block, ensure_ascii=False))
        result = subprocess.run([shutil.which("node"), "-e", script], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(0, result.returncode, result.stderr)


if __name__ == "__main__":
    unittest.main()
