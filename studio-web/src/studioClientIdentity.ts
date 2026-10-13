type ClientStorage = Pick<Storage, "getItem" | "setItem">;
type ClientLocks = {
  request(name: string, options: { ifAvailable: true }, callback: (lock: object | null) => Promise<void>): Promise<unknown>;
};
export type StudioClientIdentity = { clientId: string; recoverable: boolean; release: () => void };
export const STUDIO_CLIENT_ID_KEY = "image-generate-web-tool:studio-client-id";
export const STUDIO_CLIENT_LOCK_PREFIX = "image-generate-web-tool:studio-client-page:";

function inheritedClientId(session: ClientStorage | undefined) {
  try {
    const record = JSON.parse(session?.getItem(STUDIO_CLIENT_ID_KEY) || "null");
    // Legacy plain ids were not protected by an atomic document lock.
    return record?.version === 2 && record.recoverable === true && typeof record.clientId === "string"
      ? record.clientId : undefined;
  } catch { return undefined; }
}

function saveIdentity(session: ClientStorage | undefined, identity: StudioClientIdentity) {
  session?.setItem(STUDIO_CLIENT_ID_KEY, JSON.stringify({ version: 2, clientId: identity.clientId, recoverable: identity.recoverable }));
}

export async function prepareStudioClientIdentity(session: ClientStorage | undefined, locks: ClientLocks | undefined, newId: () => string) {
  const fresh = (): StudioClientIdentity => ({ clientId: newId(), recoverable: false, release() {} });
  if (!locks) {
    const identity = fresh();
    try { saveIdentity(session, identity); } catch { /* No previous identity can be recovered. */ }
    return identity;
  }
  const inherited = inheritedClientId(session);
  // Try the inherited id once; a copied tab must use a fresh id when it is held.
  for (const clientId of [inherited, undefined]) {
    const candidate = clientId || newId();
    const identity = await new Promise<StudioClientIdentity | null>((resolve) => {
      try {
        void locks.request(STUDIO_CLIENT_LOCK_PREFIX + candidate, { ifAvailable: true }, async (lock) => {
          if (!lock) { resolve(null); return; }
          let release!: () => void;
          const held = new Promise<void>((done) => { release = done; });
          resolve({ clientId: candidate, recoverable: true, release });
          await held;
        }).catch(() => resolve(null));
      } catch { resolve(null); }
    });
    if (!identity) continue;
    try { saveIdentity(session, identity); return identity; }
    catch { identity.release(); break; }
  }
  const identity = fresh();
  try { saveIdentity(session, identity); } catch { /* Storage failures grant no recovery authority. */ }
  return identity;
}

let browserIdentity: StudioClientIdentity | undefined;
export async function prepareBrowserStudioClientIdentity() {
  if (browserIdentity) return;
  let session: Storage | undefined, locks: ClientLocks | undefined;
  try { session = window.sessionStorage; } catch { /* Use a fresh identity. */ }
  try { locks = navigator.locks; } catch { /* HTTP/LAN browsers may not expose Web Locks. */ }
  const identity = await prepareStudioClientIdentity(session, locks, () =>
    `client-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`);
  browserIdentity = identity;
  window.addEventListener("pagehide", (event) => {
    // A cached document can resume without another React mount: keep its lock.
    if (!event.persisted) identity.release();
  });
}

export function getStudioClientId() {
  if (!browserIdentity) throw new Error("Studio client identity has not been prepared");
  return browserIdentity.clientId;
}
