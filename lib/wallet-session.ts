// Tracks wallet identity and invalidates asynchronous work when it changes.
export type SessionProvider = { publicKey: { toBase58(): string } | null; disconnect(): Promise<void> };
export class WalletSession<T extends SessionProvider> {
  private revision = 0;
  private provider: T | null = null;
  private address = '';
  capture(): number { return this.revision; }
  isCurrent(revision: number): boolean { return this.revision === revision && (!this.provider || this.provider.publicKey?.toBase58() === this.address); }
  matches(revision: number, provider: T, address: string): boolean {
    return this.isCurrent(revision) && this.provider === provider && this.address === address && provider.publicKey?.toBase58() === address;
  }
  attach(provider: T, address: string): void { this.revision++; this.provider = provider; this.address = address; }
  switchAccount(provider: T, address: string): boolean {
    if (this.provider !== provider || this.address === address) return false;
    this.revision++; this.address = address;
    if (!address) this.provider = null;
    return true;
  }
  clear(provider?: T): boolean {
    if (provider && this.provider !== provider) return false;
    this.revision++; this.provider = null; this.address = '';
    return true;
  }
  disconnect(): Promise<void> {
    const provider = this.provider;
    this.clear();
    return provider ? Promise.resolve().then(() => provider.disconnect()) : Promise.resolve();
  }
}
