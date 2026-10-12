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
  private hash(file: Blob) {
    let promise = this.hashes.get(file);
    if (!promise) {
      promise = file.arrayBuffer().then((bytes) => crypto.subtle.digest("SHA-256", bytes))
        .then((digest) => [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""))
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
