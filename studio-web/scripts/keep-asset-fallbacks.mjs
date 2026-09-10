import fs from "node:fs";
import path from "node:path";

const studioDir = path.resolve("..", "static", "studio");
const assetsDir = path.join(studioDir, "assets");
const indexPath = path.join(studioDir, "index.html");
let indexHtml = fs.readFileSync(indexPath, "utf8");

const fileOpenableIndexHtml = indexHtml.replace(
  /<script\s+type="module"\s+crossorigin\s+src="(\.\/assets\/[^"]+\.js)"><\/script>/,
  '<script defer src="$1"></script>',
);
if (fileOpenableIndexHtml !== indexHtml) {
  fs.writeFileSync(indexPath, fileOpenableIndexHtml, "utf8");
  indexHtml = fileOpenableIndexHtml;
}

const assetRefs = [...indexHtml.matchAll(/(?:src|href)="(?:\.\/|\/static\/studio\/)?assets\/([^"]+\.(?:js|css))"/g)]
  .map((match) => match[1]);
const jsAsset = assetRefs.find((asset) => asset.endsWith(".js"));
const cssAsset = assetRefs.find((asset) => asset.endsWith(".css"));

if (!jsAsset || !cssAsset) {
  throw new Error("Could not find studio JS/CSS assets in static/studio/index.html");
}

// The Studio bundle is loaded as a classic script (see the rewrite above), so it must
// not contain module-only syntax. `import.meta` appears as soon as Vite emits a
// separate code-split chunk, because its preload helper reads import.meta.url; the
// browser then rejects the entire file with "Cannot use 'import.meta' outside a
// module" and the window stays blank. Fail the build here instead of shipping that.
const emittedJs = fs.readFileSync(path.join(assetsDir, jsAsset), "utf8");
if (emittedJs.includes("import.meta")) {
  const chunks = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js") && !name.startsWith("index-"));
  throw new Error(
    `static/studio/${jsAsset} contains import.meta but index.html loads it as a classic script. ` +
      "Keep build.rollupOptions.output.inlineDynamicImports enabled and avoid import.meta in app code." +
      (chunks.length ? ` Code-split chunks present: ${chunks.join(", ")}` : ""),
  );
}

const fallbacks = [
  { source: cssAsset, fallback: "index-8pzV_2va.css" },
  { source: jsAsset, fallback: "index-BiyMHVvw.js" },
  { source: cssAsset, fallback: "index-D6wyuxyS.css" },
  { source: jsAsset, fallback: "index-DjJyEBb1.js" },
  { source: cssAsset, fallback: "index-Dr4xysUg.css" },
  { source: jsAsset, fallback: "index-CnP0RvwW.js" },
];

for (const { source, fallback } of fallbacks) {
  if (source === fallback) continue;
  fs.copyFileSync(path.join(assetsDir, source), path.join(assetsDir, fallback));
}
