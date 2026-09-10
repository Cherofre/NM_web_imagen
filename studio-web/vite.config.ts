import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// static/studio/index.html is published as a classic (non-module) script so the page
// still opens straight from disk. A classic script must not contain `import.meta`, and
// Vite's preload helper injects `import.meta.url` as soon as any dynamic import exists.
// Rewrite that one occurrence, then fail loudly if anything module-only survives — a
// bundle the browser refuses to parse renders as a blank window with no other symptom.
const classicScriptCompat = (): Plugin => ({
  name: "nm-classic-script-compat",
  apply: "build",
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type !== "chunk") continue;
      file.code = file.code.replace(/import\.meta\.url/g, "document.baseURI");
      const leftover = file.code.match(/import\s*\.\s*meta|(^|[;}\s])import\s*\(/);
      if (leftover) {
        this.error(
          `${file.fileName} still contains "${leftover[0].trim()}", which a classic ` +
            "script cannot parse. Keep inlineDynamicImports enabled and avoid " +
            "module-only syntax in the Studio app.",
        );
      }
    }
  }
});

export default defineConfig({
  base: "./",
  plugins: [react(), classicScriptCompat()],
  build: {
    outDir: "../static/studio",
    emptyOutDir: true,
    // Colleagues run whatever WebView2/Chromium their machine happens to have; a
    // conservative target keeps the bundle parseable on older runtimes instead of
    // producing exactly the blank window this version fixed.
    target: "chrome105",
    // One self-contained file: no code-split chunks, so the preload helper stays out.
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  },
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:7861",
      "/outputs": "http://127.0.0.1:7861"
    }
  }
});
