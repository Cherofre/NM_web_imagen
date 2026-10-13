import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { prepareStudioClientIdentity, STUDIO_CLIENT_ID_KEY, STUDIO_CLIENT_LOCK_PREFIX } from "./studioClientIdentity.ts";
import { normalizeStoredQueueJobs } from "./queuePersistence.ts";
import { reconcileInterruptedQueueTurns } from "./queueSessionBoundaries.ts";

function storage(entries = []) {
  const map = new Map(entries);
  return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
}
function lockManager() {
  const held = new Set();
  return { held, request(name, options, callback) {
    assert.equal(options.ifAvailable, true);
    const granted = !held.has(name);
    if (granted) held.add(name); // Atomic admission precedes the asynchronous callback.
    return Promise.resolve().then(() => callback(granted ? {} : null)).finally(() => { if (granted) held.delete(name); });
  } };
}
const ids = () => { let i = 0; return () => `id-${++i}`; };
const tick = () => new Promise(setImmediate);
const running = (clientId) => [{ id: "session", turns: [{ id: "turn", status: "running", meta: clientId ? { client_id: clientId } : {} }] }];
const job = (clientId) => ({ id: "job", turnId: "turn", sessionId: "session", clientId, status: "running", engine: "gpt-image-2", createdAt: "2026-01-01T00:00:00Z" });
const storedId = (session) => JSON.parse(session.getItem(STUDIO_CLIENT_ID_KEY)).clientId;

test("a copied sessionStorage tab gets a new locked identity and cannot consume the original task's recovery evidence", async () => {
  const locks = lockManager(), originalSession = storage(), next = ids();
  const original = await prepareStudioClientIdentity(originalSession, locks, next);
  const copied = await prepareStudioClientIdentity(storage(originalSession.map.entries()), locks, next);
  assert.notEqual(copied.clientId, original.clientId); assert.equal(storedId(originalSession), original.clientId);
  const jobs = normalizeStoredQueueJobs([job(original.clientId)], copied.clientId);
  assert.equal(jobs.length, 0);
  assert.equal(reconcileInterruptedQueueTurns(running(original.clientId), jobs, copied.clientId)[0].turns[0].status, "running");
  const legacyJobs = [{ ...job(undefined), status: "canceled", error: "__refresh_interrupted__" }];
  assert.equal(normalizeStoredQueueJobs(legacyJobs, copied.clientId).length, 0);
  assert.equal(reconcileInterruptedQueueTurns(running(undefined), legacyJobs, copied.clientId)[0].turns[0].status, "running");
  copied.release(); await tick();
  assert.ok(locks.held.has(STUDIO_CLIENT_LOCK_PREFIX + original.clientId));
  original.release(); await tick();
});

test("a genuine refresh reuses a released locked identity and ends only its interrupted task", async () => {
  const session = storage(), locks = lockManager(), next = ids();
  const before = await prepareStudioClientIdentity(session, locks, next);
  before.release(); await tick();
  const after = await prepareStudioClientIdentity(session, locks, next);
  assert.equal(after.clientId, before.clientId);
  const jobs = normalizeStoredQueueJobs([job(before.clientId)], after.clientId);
  assert.equal(jobs.length, 1);
  assert.equal(reconcileInterruptedQueueTurns(running(before.clientId), jobs, after.clientId)[0].turns[0].status, "error");
  assert.equal(reconcileInterruptedQueueTurns(running(before.clientId), jobs, after.clientId, new Set(["session:turn"]))[0].turns[0].status, "running");
  before.release(); await tick();
  assert.ok(locks.held.has(STUDIO_CLIENT_LOCK_PREFIX + after.clientId), "stale release cannot free the next document's lock");
  after.release(); await tick();
});

test("concurrent refresh A and copied tab B can grant released-id recovery authority to exactly one document", async () => {
  for (const order of [["A", "B"], ["B", "A"]]) {
    const stored = [[STUDIO_CLIENT_ID_KEY, JSON.stringify({ version: 2, clientId: "released-id", recoverable: true })]];
    const locks = lockManager(), next = ids();
    const leases = await Promise.all(order.map(() => prepareStudioClientIdentity(storage(stored), locks, next)));
    assert.equal(leases.filter((lease) => lease.clientId === "released-id").length, 1);
    assert.notEqual(leases[0].clientId, leases[1].clientId);
    const states = leases.map((lease) => reconcileInterruptedQueueTurns(running("released-id"), normalizeStoredQueueJobs([job("released-id")], lease.clientId), lease.clientId)[0].turns[0].status);
    assert.equal(states.filter((status) => status === "error").length, 1);
    assert.equal(states.filter((status) => status === "running").length, 1);
    leases.forEach((lease) => lease.release()); await tick();
  }
});

test("new windows and held old documents get distinct ids; foreign and unknown tasks remain active without TTL checks", async () => {
  const locks = lockManager(), next = ids(), oldSession = storage();
  const held = await prepareStudioClientIdentity(oldSession, locks, next);
  const later = await prepareStudioClientIdentity(oldSession, locks, next);
  const newWindow = await prepareStudioClientIdentity(storage(), locks, next);
  assert.notEqual(later.clientId, held.clientId); assert.notEqual(newWindow.clientId, later.clientId);
  for (const owner of [held.clientId, undefined]) assert.equal(reconcileInterruptedQueueTurns(running(owner), [], newWindow.clientId)[0].turns[0].status, "running");
  assert.ok(locks.held.has(STUDIO_CLIENT_LOCK_PREFIX + held.clientId));
  [held, later, newWindow].forEach((lease) => lease.release()); await tick();
});

test("missing/failed Web Locks, blocked storage and legacy ids grant no authority to reuse an old client id", async () => {
  for (const locks of [undefined, { request() { throw new Error("failed"); } }, { request() { return Promise.reject(new Error("failed")); } }]) {
    const session = storage([[STUDIO_CLIENT_ID_KEY, JSON.stringify({ version: 2, clientId: "old", recoverable: true })]]);
    const next = ids(), first = await prepareStudioClientIdentity(session, locks, next);
    assert.notEqual(first.clientId, "old"); assert.equal(first.recoverable, false);
    assert.equal(JSON.parse(session.getItem(STUDIO_CLIENT_ID_KEY)).recoverable, false);
    const second = await prepareStudioClientIdentity(session, locks, next);
    assert.notEqual(second.clientId, first.clientId); assert.equal(second.recoverable, false);
  }
  const locks = lockManager(), next = ids();
  const legacy = await prepareStudioClientIdentity(storage([[STUDIO_CLIENT_ID_KEY, "legacy-id"]]), locks, next);
  assert.notEqual(legacy.clientId, "legacy-id");
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const fallback = await prepareStudioClientIdentity(blocked, locks, next);
  assert.equal(fallback.recoverable, false);
  legacy.release(); await tick(); assert.equal(locks.held.size, 0);
});

test("actual browser preparation keeps identity stable and its BFCache lock until real pagehide; bootstrap awaits it before React", async () => {
  const source = fs.readFileSync(new URL("./studioClientIdentity.ts", import.meta.url), "utf8");
  const locks = lockManager(), session = storage(), listeners = {};
  const ctx = { exports: {}, navigator: { locks }, crypto: { randomUUID: ids() },
    window: { sessionStorage: session, addEventListener(name, fn) { listeners[name] = fn; } } };
  vm.createContext(ctx); vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, ctx);
  assert.throws(() => ctx.exports.getStudioClientId(), /not been prepared/);
  await ctx.exports.prepareBrowserStudioClientIdentity();
  const id = ctx.exports.getStudioClientId();
  await ctx.exports.prepareBrowserStudioClientIdentity(); assert.equal(ctx.exports.getStudioClientId(), id);
  listeners.pagehide({ persisted: true }); await tick();
  assert.ok(locks.held.has(STUDIO_CLIENT_LOCK_PREFIX + id));
  const copied = await prepareStudioClientIdentity(storage(session.map.entries()), locks, ids());
  assert.notEqual(copied.clientId, id);
  listeners.pagehide({ persisted: false }); await tick();
  assert.equal(locks.held.has(STUDIO_CLIENT_LOCK_PREFIX + id), false);
  assert.ok(locks.held.has(STUDIO_CLIENT_LOCK_PREFIX + copied.clientId));
  copied.release(); await tick();
  const main = fs.readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
  assert.ok(main.indexOf("await prepareBrowserStudioClientIdentity();") < main.indexOf("createRoot(root).render("));
  assert.match(main, /import \{ prepareBrowserStudioClientIdentity \} from "\.\/studioClientIdentity"/);
  assert.doesNotMatch(source, /localStorage|setInterval|setTimeout/);
});
