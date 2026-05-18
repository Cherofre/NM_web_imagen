import fs from "node:fs";
import path from "node:path";

const studioDir = path.resolve("..", "static", "studio");
const assetsDir = path.join(studioDir, "assets");
const indexHtml = fs.readFileSync(path.join(studioDir, "index.html"), "utf8");

const jsAsset = indexHtml.match(/\/static\/studio\/assets\/([^"]+\.js)"/)?.[1];
const cssAsset = indexHtml.match(/\/static\/studio\/assets\/([^"]+\.css)"/)?.[1];

if (!jsAsset || !cssAsset) {
  throw new Error("Could not find studio JS/CSS assets in static/studio/index.html");
}

const fallbacks = [
  { source: cssAsset, fallback: "index-8pzV_2va.css" },
  { source: jsAsset, fallback: "index-BiyMHVvw.js" },
];

for (const { source, fallback } of fallbacks) {
  if (source === fallback) continue;
  fs.copyFileSync(path.join(assetsDir, source), path.join(assetsDir, fallback));
}
