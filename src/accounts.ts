// Accounts and who may open one (add-accounts 3.5, design decisions 0 and 5). While Lente is in a
// closed test only emails on `LENTE_ALLOWED_EMAILS` get an account; with open sign-up
// (ship-hackathon decision 1) anyone may until its end date. Anyone else is refused with a clear
// message and no row is written; an existing account keeps signing in. A new account gets its own
// data key, stored only wrapped under the KEK. The store is an interface: a JSON file here,
// `accounts` + `user_keys` on Supabase.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { SIGNUP_CLOSED_MESSAGE, type SignupAnswer } from "./access-gate.ts";
import { type Kek, newDek, unwrapDek, wrapDek } from "./seal.ts";

/** What the app and the page show someone outside the allow list. */
export const CLOSED_TEST_MESSAGE = "Lente está en prueba cerrada. Tu cuenta de Google no está en la lista de invitados.";

/** What a refused caller reads, in Spanish; `no_account` means the session outlived its account. */
export function admissionMessage(reason: "closed_test" | "signup_closed" | "no_account"): string {
  return reason === "closed_test" ? CLOSED_TEST_MESSAGE : reason === "signup_closed" ? SIGNUP_CLOSED_MESSAGE : "Inicia sesión de nuevo.";
}

export interface AccountRecord {
  userId: string;
  createdAt: number;
  locale: string;
  kekVersion: number;
  /** The user's DEK wrapped under the KEK of `kekVersion`, base64. */
  wrappedDek: string;
}

export interface AccountStore {
  get(userId: string): Promise<AccountRecord | undefined>;
  /** Creates the account and its wrapped key together (one RPC on Supabase, 4.4). */
  create(account: AccountRecord): Promise<void>;
}

/** Emails from `LENTE_ALLOWED_EMAILS`, separated by commas or spaces, compared lowercased. Empty means nobody. */
export function parseAllowList(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(/[\s,]+/).map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export type Admission = { ok: true; created: boolean } | { ok: false; reason: "closed_test" | "signup_closed" | "no_account" };

/** Who may get a new account: an allow list alone, or a sign-up policy (`mayCreateAccount`). */
export type MayCreate = (email: string) => SignupAnswer;

export class Accounts {
  private readonly store: AccountStore;
  private readonly keks: readonly Kek[];
  private readonly mayCreate: MayCreate;
  private readonly now: () => number;
  /** Unwrapped data keys of active users; dropped when their runtime is evicted. */
  private readonly deks = new Map<string, Buffer>();
  private readonly creating = new Map<string, Promise<void>>();

  constructor(store: AccountStore, keks: readonly Kek[], allowed: Set<string> | MayCreate, now: () => number = Date.now) {
    if (keks.length === 0) throw new Error("accounts need a KEK (LENTE_KEK)");
    this.store = store;
    this.keks = keks;
    this.mayCreate = typeof allowed === "function" ? allowed : (email) => (allowed.has(email.trim().toLowerCase()) ? { ok: true } : { ok: false, reason: "closed_test" });
    this.now = now;
  }

  /**
   * May this caller act? An existing account always may (ship-hackathon: closing sign-up never locks
   * out who already signed up; deleting the account does). Otherwise a caller with an email (an
   * access token) gets an account on first sign-in if the policy lets it; a caller without one (a
   * session cookie or a device token) must already have an account.
   */
  async admit(userId: string, email: string | undefined): Promise<Admission> {
    if (await this.store.get(userId)) return { ok: true, created: false };
    if (email === undefined) return { ok: false, reason: "no_account" };
    const may = this.mayCreate(email);
    if (!may.ok) return may;
    let pending = this.creating.get(userId);
    const mine = !pending;
    if (!pending) {
      pending = this.create(userId).finally(() => this.creating.delete(userId));
      this.creating.set(userId, pending);
    }
    await pending;
    return { ok: true, created: mine };
  }

  private async create(userId: string): Promise<void> {
    const [current] = this.keks;
    const dek = newDek();
    await this.store.create({ userId, createdAt: this.now(), locale: "es-CO", kekVersion: current!.version, wrappedDek: wrapDek(dek, current!, userId).toString("base64") });
    this.deks.set(userId, dek);
  }

  /** The user's data key, unwrapped once and kept while they are active. */
  async dek(userId: string): Promise<Buffer> {
    const cached = this.deks.get(userId);
    if (cached) return cached;
    const account = await this.store.get(userId);
    if (!account) throw new Error(`no account for user ${userId}`);
    const dek = unwrapDek(Buffer.from(account.wrappedDek, "base64"), account.kekVersion, this.keks, userId);
    this.deks.set(userId, dek);
    return dek;
  }

  /** Forgets the user's data key (runtime evicted, account deleted). */
  forget(userId: string): void {
    this.deks.get(userId)?.fill(0);
    this.deks.delete(userId);
  }
}

/** One JSON file of plain records on the hub's volume, written atomically (0600). */
export class JsonFile<T> {
  private readonly file: string;
  private readonly empty: () => T;

  constructor(file: string, empty: () => T) {
    this.file = file;
    this.empty = empty;
  }

  read(): T {
    if (!existsSync(this.file)) return this.empty();
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as T;
    } catch (error) {
      throw new Error(`${this.file} is not valid JSON (${(error as Error).message})`);
    }
  }

  write(value: T): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}

/** Accounts in memory; with a file, kept across restarts (accounts mode before the Supabase stores). */
export class FileAccountStore implements AccountStore {
  private readonly json: JsonFile<{ accounts: AccountRecord[] }> | undefined;
  private accounts: AccountRecord[];

  constructor(file?: string) {
    this.json = file ? new JsonFile(file, () => ({ accounts: [] })) : undefined;
    this.accounts = this.json?.read().accounts ?? [];
  }

  async get(userId: string): Promise<AccountRecord | undefined> {
    const found = this.accounts.find((a) => a.userId === userId);
    return found && { ...found };
  }

  async create(account: AccountRecord): Promise<void> {
    if (this.accounts.some((a) => a.userId === account.userId)) throw new Error(`account ${account.userId} already exists`);
    this.accounts.push({ ...account });
    this.json?.write({ accounts: this.accounts });
  }
}
