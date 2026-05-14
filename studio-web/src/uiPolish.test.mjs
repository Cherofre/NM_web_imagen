import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.resolve("src/styles.css"), "utf8");

function cssBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[1];
}

function mediaBlock(query) {
  const start = css.indexOf(`@media (${query})`);
  assert.notEqual(start, -1, `Missing media query ${query}`);
  const next = css.indexOf("@media", start + 1);
  return css.slice(start, next === -1 ? undefined : next);
}

function cssBlockIn(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[1];
}

test("text settings actions keep their button on one line and expose focus styling", () => {
  assert.match(cssBlock(".composer"), /--composer-prompt-height:\s*148px;[\s\S]*grid-template-rows:\s*auto minmax\(0, var\(--composer-prompt-height\)\);/);
  assert.match(cssBlock(".composer-input"), /align-items:\s*stretch;[\s\S]*min-height:\s*0;/);
  assert.match(cssBlock(".composer-resize-handle"), /position:\s*absolute;[\s\S]*top:\s*-9px;[\s\S]*right:\s*18px;[\s\S]*cursor:\s*ns-resize;/);
  assert.match(cssBlock(".composer-textarea-wrap"), /height:\s*100%;[\s\S]*min-height:\s*118px;/);
  assert.match(cssBlock(".composer-prompt-actions"), /position:\s*absolute;[\s\S]*bottom:\s*12px;[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
  assert.match(cssBlock(".session-prompt-button"), /grid-template-columns:\s*auto minmax\(0, 1fr\);[\s\S]*min-height:\s*36px;/);
  assert.match(cssBlock(".session-prompt-button-summary"), /text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/);
  assert.doesNotMatch(cssBlock(".composer-textarea-wrap"), /resize:\s*vertical;/);
  assert.match(cssBlock(".composer-input textarea"), /width:\s*100%;/);
  assert.match(cssBlock(".composer-input textarea"), /height:\s*100%;/);
  assert.match(cssBlock(".composer-reset-button"), /position:\s*absolute;[\s\S]*top:\s*12px;[\s\S]*right:\s*18px;[\s\S]*width:\s*30px;[\s\S]*height:\s*30px;/);
  assert.match(cssBlock(".submit-button"), /grid-row:\s*1;[\s\S]*align-self:\s*end;/);
  assert.match(cssBlock(".drawer-actions"), /justify-content:\s*flex-end;/);
  assert.match(cssBlock(".session-prompt-drawer"), /grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto;/);
  assert.doesNotMatch(css, /\.composer-top-actions\s*\{/);
  assert.doesNotMatch(css, /\.session-prompt-pill\s*\{/);
  assert.doesNotMatch(css, /\.composer-textarea-meta\s*\{/);
});

test("floating tooltip uses stronger readable styling", () => {
  assert.match(css, /\.floating-tooltip,\s*\.inline-tooltip\s*\{[\s\S]*background:\s*rgba\(17, 17, 17, 0\.96\);/);
  assert.match(css, /\.floating-tooltip,\s*\.inline-tooltip\s*\{[\s\S]*color:\s*#f8fafc;/);
  assert.match(css, /\.floating-tooltip,\s*\.inline-tooltip\s*\{[\s\S]*font-size:\s*13px;/);
  assert.match(css, /\.floating-tooltip,\s*\.inline-tooltip\s*\{[\s\S]*font-weight:\s*700;/);
  assert.match(cssBlock(".inline-tooltip"), /position:\s*fixed;/);
  assert.match(cssBlock(".inline-tooltip.top"), /transform:\s*translate\(-50%, calc\(-100% \+ 4px\)\);/);
});

test("advanced parameter toggles align to input height without stretching", () => {
  assert.match(cssBlock(".settings-grid"), /align-items:\s*start;/);
  assert.match(css, /\.toggle\s*\{[\s\S]*align-self:\s*end;[\s\S]*height:\s*42px;[\s\S]*min-height:\s*42px;/);
  assert.match(css, /\.toggle\s*\{[\s\S]*box-sizing:\s*border-box;/);
});

test("save-like actions are visually primary and clear", () => {
  assert.match(css, /button\.primary-action,\s*\.header-actions button\.primary-action,\s*\.drawer-actions button\.primary-action,\s*\.composer-popover button\.primary-action\s*\{[\s\S]*border-color:\s*rgba\(17, 17, 17, 0\.32\);[\s\S]*background:\s*#111;/);
  assert.match(css, /button\.primary-action,\s*\.header-actions button\.primary-action,\s*\.drawer-actions button\.primary-action,\s*\.composer-popover button\.primary-action\s*\{[\s\S]*color:\s*#fff;/);
  assert.doesNotMatch(fs.readFileSync(path.resolve("src/App.tsx"), "utf8"), /清空 GPT 辅助项/);
  assert.match(fs.readFileSync(path.resolve("src/App.tsx"), "utf8"), /清空负面和画面文字/);
});

test("narrow layout keeps sessions as a left drawer and pins composer to the bottom", () => {
  const tablet = mediaBlock("max-width: 920px");
  const phone = mediaBlock("max-width: 560px");
  assert.match(cssBlockIn(tablet, ".history-sidebar"), /position:\s*fixed;[\s\S]*left:\s*10px;[\s\S]*bottom:\s*10px;/);
  assert.match(cssBlockIn(tablet, ".composer"), /position:\s*sticky;[\s\S]*bottom:\s*0;/);
  assert.match(cssBlockIn(tablet, ".composer-toolbar"), /flex-wrap:\s*wrap;[\s\S]*overflow-y:\s*visible;/);
  assert.doesNotMatch(cssBlockIn(tablet, ".composer-toolbar"), /overflow-y:\s*auto;/);
  assert.match(cssBlockIn(phone, ".composer-input"), /grid-template-columns:\s*minmax\(0, 1fr\) 52px;/);
  assert.match(cssBlockIn(phone, ".submit-button"), /grid-column:\s*2;[\s\S]*width:\s*52px;/);
});
