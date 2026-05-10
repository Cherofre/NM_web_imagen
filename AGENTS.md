# AGENTS.md

## Self-Improvement

Use the global memory directory at `C:\Users\Cherofre\.codex\memories`.

Before starting any new task:
1. Read `C:\Users\Cherofre\.codex\memories\PROFILE.md`
2. Read `C:\Users\Cherofre\.codex\memories\ACTIVE.md`
3. Apply them as global memory before analyzing the user request

If any of the memory files are missing, create minimal templates first instead of skipping the loop.

Only log memories when the outcome is non-obvious, reusable, or likely to recur.

Evaluate whether to log a memory entry when any of the following happens:
1. A command, tool call, or operation fails unexpectedly
2. The user corrects a mistake, assumption, or outdated statement
3. A requested capability does not exist yet
4. An external API, integration, or tool behaves differently than expected
5. A non-obvious workaround, debugging insight, or better recurring approach is discovered

Write entries by type:
- `C:\Users\Cherofre\.codex\memories\LEARNINGS.md` for reusable learnings, corrections, knowledge gaps, and best practices
- `C:\Users\Cherofre\.codex\memories\ERRORS.md` for unexpected errors, environment-specific failures, and debugging notes
- `C:\Users\Cherofre\.codex\memories\FEATURE_REQUESTS.md` for missing capabilities the user wants to keep track of

Promotion rules:
1. If a pattern recurs or is broadly useful across tasks, promote it into `C:\Users\Cherofre\.codex\memories\ACTIVE.md`
2. Keep `ACTIVE.md` concise, current, and deduplicated
3. Only promote something into this `AGENTS.md` when it becomes a stable top-level rule, or when the user explicitly asks

Behavior expectations:
- Default to Chinese when writing memory entries unless the user asks otherwise.
- Do not interrupt the user for every possible learning; log silently when confidence is high.
- Do not log trivial typos, one-off noise, or low-value observations.
- Do not edit this `AGENTS.md` automatically unless the user explicitly asks.

## Windows UTF-8 Handling

- On Windows, prefer UTF-8 when reading or writing code, Markdown, JSON, TOML, YAML, and other text files that may contain Chinese.
- Before using PowerShell to read Chinese UTF-8 text, set `[Console]::OutputEncoding` and `$OutputEncoding` to UTF-8 when needed to avoid mojibake in terminal output.
- When a file may already use a legacy encoding such as GBK/ANSI, inspect or preserve the existing encoding first instead of blindly rewriting it as UTF-8.
- Avoid relying on the Windows system locale option `Beta: Use Unicode UTF-8 for worldwide language support` as the default fix, because it can break compatibility in some apps and games.

## Project Snapshot

- This directory is a local FastAPI web image-generation tool, not currently a Git repository.
- Main backend entry: `app.py`.
- Static frontend files: `static/index.html`, `static/app.js`, and `static/styles.css`.
- Runtime dependencies are listed in `requirements.txt`.
- User-facing launchers are `一键启动.bat`, `start_web.bat`, and `start_web.ps1`.
- Stop scripts are `一键停止.bat`, `stop_web.bat`, and `stop_web.ps1`.
- The default local URL for this Studio branch is `http://127.0.0.1:7861`.
- Generated images and history are written under `outputs/`; local secrets are saved in `config.local.json`.

## Development Notes

- Keep changes small and practical; this tool is meant to be easy to share and double-click on Windows.
- Do not commit or package `config.local.json`, `outputs/`, `logs/`, `.chrome-debug/`, `.venv/`, `.runtime/`, `saved_images/`, or `__pycache__/`.
- Prefer preserving the existing no-build frontend structure unless the user explicitly asks for a framework migration.
- Keep launcher scripts compatible with Windows PowerShell 5.1.
- Avoid Bash-only shell syntax in PowerShell commands. For example, `python - <<'PY'` does not work in PowerShell.
- When probing Python imports on this machine, use `import importlib.util` explicitly before `importlib.util.find_spec(...)`.

## Verification

Use the smallest useful check for the change:

```powershell
$env:PYTHONUTF8='1'
python -m py_compile .\app.py
```

For dependency availability:

```powershell
$env:PYTHONUTF8='1'
python -c "import importlib.util; names=['fastapi','uvicorn','requests','multipart']; [print(f'{n}: OK') if importlib.util.find_spec(n) else print(f'{n}: FAIL missing') for n in names]"
```

For real startup, prefer:

```powershell
.\start_web.ps1
```

Then open:

```text
http://127.0.0.1:7861/api/health
```
