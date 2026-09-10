// Verifies that a running desktop build actually renders its interface.
//
// The v1.1.2 release shipped a bundle the WebView refused to parse; every smoke test
// still passed because the backend was healthy, and the user only saw a white window.
// This attaches to the WebView2 page over CDP and fails when the app did not render or
// when a loaded script is not valid classic JavaScript (the exact shipped defect).
//
// Usage: node assert_desktop_ui.mjs <debugPort>
import process from "node:process";
import vm from "node:vm";

const port = Number(process.argv[2] || 0);
if (!port) {
  console.error("usage: node assert_desktop_ui.mjs <cdpPort>");
  process.exit(2);
}

// WebView2 exposes a bare about:blank target until the app navigates to its assets.
const deadline = Date.now() + 30000;
let target = null;
while (Date.now() < deadline) {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target =
      targets.find(
        (entry) => entry.type === "page" && /^https?:/.test(entry.url) && !entry.url.startsWith("about:")
      ) || null;
    if (target) break;
  } catch {
    // The webview may not be up yet.
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

if (!target) {
  console.error(`FAIL: no WebView page target on 127.0.0.1:${port}`);
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const events = [];
let nextId = 1;

ws.addEventListener("message", (message) => {
  const payload = JSON.parse(message.data);
  if (payload.id && pending.has(payload.id)) {
    pending.get(payload.id)(payload);
    pending.delete(payload.id);
  } else if (payload.method) {
    events.push(payload);
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", () => reject(new Error("CDP connection failed")), { once: true });
});

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

await send("Runtime.enable");
await send("Log.enable");

// Poll instead of reloading: a reload of the custom-protocol page races the app's own
// bootstrap, and a cold or slow WebView2 session simply needs more time.
const renderExpression = `JSON.stringify({
  readyState: document.readyState,
  url: location.href,
  rootChildren: (document.getElementById('root') || {childElementCount: -1}).childElementCount,
  rootText: ((document.getElementById('root') || {}).textContent || '').trim().slice(0, 160),
  guardVisible: Boolean(document.getElementById('nm-boot-guard')),
  scripts: Array.from(document.querySelectorAll('script[src]')).map((element) => element.src)
})`;

let facts = {};
const renderDeadline = Date.now() + 30000;
while (Date.now() < renderDeadline) {
  const probe = await send("Runtime.evaluate", { expression: renderExpression, returnByValue: true });
  facts = JSON.parse(probe.result?.result?.value || "{}");
  if (facts.rootChildren > 0) break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

// A classic script that contains module-only syntax (import.meta, import(...)) fails to
// compile in the WebView. The page's CSP forbids eval, so pull the sources out and parse
// them here as classic scripts — exactly how the browser would treat them.
const sourceExpression = `(async () => {
  const sources = {};
  for (const url of ${JSON.stringify(facts.scripts || [])}) {
    try {
      sources[url] = await (await fetch(url)).text();
    } catch (error) {
      sources[url] = 'FETCH_FAILED: ' + (error && error.message ? error.message : String(error));
    }
  }
  return JSON.stringify(sources);
})()`;
const sourceResult = await send("Runtime.evaluate", {
  expression: sourceExpression,
  awaitPromise: true,
  returnByValue: true
});
const sources = JSON.parse(sourceResult.result?.result?.value || "{}");
const parseProblems = [];
for (const [url, source] of Object.entries(sources)) {
  const name = url.split("/").pop();
  if (source.startsWith("FETCH_FAILED:")) {
    parseProblems.push(`${name}: ${source}`);
    continue;
  }
  try {
    new vm.Script(source, { filename: name });
  } catch (error) {
    parseProblems.push(`${name}: ${error.message}`);
  }
}
const runtimeSyntaxErrors = events
  .filter((event) => event.method === "Runtime.exceptionThrown")
  .map((event) => event.params.exceptionDetails)
  .filter((details) => /SyntaxError|import\.meta|Unexpected token|Unexpected reserved word/i.test(
    `${details.text} ${details.exception?.description || ""}`
  ))
  .map((details) => details.exception?.description?.split("\n")[0] || details.text);

const problems = [];
if (facts.rootChildren <= 0) problems.push(`#root has no rendered content (readyState=${facts.readyState})`);
if (facts.guardVisible) problems.push("the boot guard is showing a load-failure notice");
problems.push(...parseProblems.map((entry) => `script failed to parse: ${entry}`));
problems.push(...runtimeSyntaxErrors.map((entry) => `script syntax error: ${entry}`));

console.log(`page: ${facts.url} readyState=${facts.readyState} rootChildren=${facts.rootChildren}`);
if (facts.rootText) console.log(`rendered text: ${facts.rootText}`);
if (problems.length) {
  console.error("FAIL: desktop UI did not render correctly");
  for (const problem of problems) console.error(`  - ${problem}`);
  ws.close();
  process.exit(1);
}

console.log("PASS: desktop UI rendered");
ws.close();
process.exit(0);
