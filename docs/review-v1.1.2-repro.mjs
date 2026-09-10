// Former review reproductions now execute assertions for the corrected behavior.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('../studio-web/src/releaseConfigRegression.test.mjs', import.meta.url))], { stdio: 'inherit' });
process.exit(result.status ?? 1);
