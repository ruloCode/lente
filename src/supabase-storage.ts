// Supabase Storage for sealed media objects (add-media-archive 2.1): upload, download and delete in a
// private bucket with the hub's secret key. The bytes are ciphertext sealed in the hub; object keys
// carry no content. No signed URL is ever made: the hub streams media itself (design decision 5).

export type StorageFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: Uint8Array | string }) => Promise<{ status: number; ok: boolean; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> }>;

export class SupabaseStorage {
  private readonly base: string;
  private readonly key: string;
  private readonly fetchFn: StorageFetch;

  constructor(options: { url: string; secretKey: string; fetch?: StorageFetch }) {
    if (!options.secretKey) throw new Error("SUPABASE_SECRET_KEY is not set");
    this.base = `${options.url.replace(/\/+$/, "")}/storage/v1`;
    this.key = options.secretKey;
    this.fetchFn = options.fetch ?? (fetch as unknown as StorageFetch);
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.key}`, apikey: this.key, ...extra };
  }

  async put(bucket: string, path: string, bytes: Uint8Array): Promise<void> {
    const res = await this.fetchFn(`${this.base}/object/${bucket}/${path}`, { method: "POST", headers: this.headers({ "Content-Type": "application/octet-stream", "x-upsert": "true" }), body: bytes });
    // Storage errors carry no content of ours; still, only the status goes into the message.
    if (!res.ok) throw new Error(`storage: uploading an object to ${bucket} failed with ${res.status}`);
  }

  async get(bucket: string, path: string): Promise<Uint8Array | undefined> {
    const res = await this.fetchFn(`${this.base}/object/${bucket}/${path}`, { method: "GET", headers: this.headers() });
    if (res.status === 404 || res.status === 400) return undefined;
    if (!res.ok) throw new Error(`storage: reading an object from ${bucket} failed with ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    if (!paths.length) return;
    const res = await this.fetchFn(`${this.base}/object/${bucket}`, { method: "DELETE", headers: this.headers({ "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: paths }) });
    if (!res.ok) throw new Error(`storage: deleting ${paths.length} object(s) from ${bucket} failed with ${res.status}`);
  }
}
