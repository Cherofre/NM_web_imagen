export class ReferenceImageIdentity {
  private sources = new WeakMap<Blob, string>();
  private hashes = new WeakMap<Blob, Promise<string>>();

  setSource(file: Blob, source: string) {
    this.sources.set(file, new URL(source, "http://local.invalid/").pathname);
  }
  inheritSource(file: Blob, original: Blob | undefined) {
    const source = original && this.sources.get(original);
    if (source) this.sources.set(file, source);
  }
  async key(file: Blob) {
    return this.sources.get(file) || await this.contentKey(file);
  }
  async contentKey(file: Blob) {
    return `sha256:${await this.hash(file)}`;
  }
  private hash(file: Blob) {
    let promise = this.hashes.get(file);
    if (!promise) {
      promise = file.arrayBuffer().then(async (bytes) => {
        const digest = globalThis.crypto?.subtle
          ? new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
          : sha256Bytes(new Uint8Array(bytes));
        return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      })
        .catch((error) => { this.hashes.delete(file); throw error; });
      this.hashes.set(file, promise);
    }
    return promise;
  }
  async matches(file: File, references: File[], source: string) {
    this.setSource(file, source);
    const sourceKey = this.sources.get(file);
    const matches = new Set<File>();
    let bytes: Uint8Array | undefined;
    // Read candidate images sequentially to bound memory for large reference sets.
    for (const reference of references) {
      if (reference === file || this.sources.get(reference) === sourceKey) { matches.add(reference); continue; }
      if (reference.size !== file.size) continue;
      if (globalThis.crypto?.subtle) {
        if (await this.hash(reference) === await this.hash(file)) matches.add(reference);
      } else {
        bytes ||= new Uint8Array(await file.arrayBuffer());
        const candidate = new Uint8Array(await reference.arrayBuffer());
        if (candidate.every((byte, index) => byte === bytes![index])) matches.add(reference);
      }
    }
    return matches;
  }
}

// Shared HTTP/LAN pages may lack WebCrypto. Keep content keys identical to HTTPS.
function sha256Bytes(bytes: Uint8Array) {
  const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const state = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes); padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer), bits = bytes.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padded.length - 4, bits >>> 0);
  const rotate = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount));
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15], y = words[i - 2];
      words[i] = words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3))
        + words[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10));
    }
    let [a,b,c,d,e,f,g,h] = state;
    for (let i = 0; i < 64; i++) {
      const first = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + constants[i] + words[i]) >>> 0;
      const second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h=g; g=f; f=e; e=(d+first)>>>0; d=c; c=b; b=a; a=(first+second)>>>0;
    }
    [a,b,c,d,e,f,g,h].forEach((value, i) => { state[i] = (state[i] + value) >>> 0; });
  }
  const digest = new Uint8Array(32), output = new DataView(digest.buffer);
  state.forEach((value, i) => output.setUint32(i * 4, value));
  return digest;
}

export function mergeCopiedReference(references: File[], incoming: File, matches: Set<File>, limit: number) {
  const existing = references.find((file) => matches.has(file));
  if (existing) {
    let kept = false;
    const files = references.filter((file) => {
      if (!matches.has(file)) return true;
      if (!kept) { kept = true; return true; }
      return false;
    });
    return { files, selected: existing, reused: true, removed: references.length - files.length, blocked: false };
  }
  if (references.length >= limit) return { files: references, selected: incoming, reused: false, removed: 0, blocked: true };
  return { files: [...references, incoming], selected: incoming, reused: false, removed: 0, blocked: false };
}
