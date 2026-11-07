'use client';
import { useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { actionInstruction, createInstruction, Escrow, explorer, formatSol, friendlyError, lamports, randomId, readEscrow, send, signatureStatus, states, TransactionUpdate, Wallet } from '../lib/escrow';
import { WalletSession } from '../lib/wallet-session';
import historical from '../evidence/devnet-lifecycle-1794018466146-rpc-verification.json';

declare global { interface Window { phantom?: { solana?: Wallet & { isPhantom?: boolean } }; solana?: Wallet & { isPhantom?: boolean } } }
type Action = 'fund' | 'submit_evidence' | 'approve' | 'release' | 'dispute' | 'refund';
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-5)}`;
const historyNames: Record<string, string> = {'release flow create':'Create escrow', fund:'Fund escrow', 'submit evidence':'Submit evidence', approve:'Approve evidence', release:'Release to seller', dispute:'Open dispute', refund:'Arbitrator refund', 'unauthorized approval':'Unauthorized approval', 'invalid recipient':'Invalid recipient', 'double release':'Second release', 'unauthorized refund':'Unauthorized refund', 'double refund':'Second refund'};
const proofGroups = [
  {id:'happy-path', title:'Happy Path', description:'Buyer approves the evidence and the seller is paid.', labels:['release flow create', 'fund', 'submit evidence', 'approve', 'release']},
  {id:'dispute-path', title:'Dispute Path', description:'A separate escrow is disputed and the arbitrator refunds the buyer.', labels:['dispute', 'refund']},
  {id:'rejection-tests', title:'Security checks', description:'These transactions were intentionally rejected by the program.', labels:['unauthorized approval', 'invalid recipient', 'double release', 'unauthorized refund', 'double refund']},
];
export default function Home() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [actor, setActor] = useState('');
  const [address, setAddress] = useState('');
  const [seller, setSeller] = useState('');
  const [arbitrator, setArbitrator] = useState('');
  const [amount, setAmount] = useState('0.001');
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [hash, setHash] = useState<Uint8Array>();
  const [filename, setFilename] = useState('');
  const [tx, setTx] = useState<TransactionUpdate | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const session = useRef(new WalletSession<Wallet>()).current;
  const walletMenu = useRef<HTMLDivElement>(null);
  const walletButton = useRef<HTMLButtonElement>(null);
  const connectButton = useRef<HTMLButtonElement>(null);
  const restoreConnectFocus = useRef(false);
  const role = escrow && actor ? actor === escrow.buyer.toBase58() ? 'buyer' : actor === escrow.seller.toBase58() ? 'seller' : actor === escrow.arbitrator.toBase58() ? 'arbitrator' : 'viewer' : '';
  useEffect(() => { const value = new URLSearchParams(window.location.search).get('escrow'); if (value) setAddress(value); }, []);
  function clearWalletView() {
    setEscrow(null); setHash(undefined); setFilename(''); setTx(null); setBusy(false);
    setSeller(''); setArbitrator(''); setAmount('0.001'); setMenuOpen(false);
  }
  useEffect(() => {
    if (!wallet) return;
    const accountChanged = (key: PublicKey | null) => {
      // Ignore delayed events from a previous account or connection.
      if ((wallet.publicKey?.toBase58() || '') !== (key?.toBase58() || '')) return;
      if (!session.switchAccount(wallet, key?.toBase58() || '')) return;
      clearWalletView(); setActor(key?.toBase58() || '');
      if (!key) setWallet(null);
      setMessage(key ? 'Wallet changed. Reload the escrow to continue with this account.' : 'Wallet disconnected. Reload the public escrow to view it.');
    };
    const disconnected = () => {
      if ((wallet.isConnected !== false && wallet.publicKey) || !session.clear(wallet)) return;
      clearWalletView(); setActor(''); setWallet(null);
      setMessage('Wallet disconnected. If a transaction was already submitted, check Explorer before retrying.');
    };
    wallet.on?.('accountChanged', accountChanged); wallet.on?.('disconnect', disconnected);
    return () => { wallet.removeListener?.('accountChanged', accountChanged); wallet.removeListener?.('disconnect', disconnected); };
  }, [wallet, session]);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: MouseEvent) => { if (!walletMenu.current?.contains(event.target as Node)) setMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); walletButton.current?.focus(); } };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [menuOpen]);
  useEffect(() => {
    if (!actor && !disconnecting && restoreConnectFocus.current) { connectButton.current?.focus(); restoreConnectFocus.current = false; }
  }, [actor, disconnecting]);
  type Scope = { revision: number; current: () => boolean };
  async function perform(task: (scope: Scope) => Promise<void>) {
    const revision = session.capture(); const current = () => session.isCurrent(revision);
    if (!current()) { setBusy(false); setMessage('Wallet account changed. Reconnect Phantom to continue.'); return; }
    setBusy(true); setMessage('');
    try { await task({revision, current}); }
    catch (e) { if (current()) { const detail = friendlyError(e); setMessage(detail); setTx(previous => previous?.status === 'awaiting-wallet' ? {status:'failed', detail} : previous); } }
    finally { if (current()) setBusy(false); }
  }
  function connect() { void perform(async scope => {
    const w = window.phantom?.solana ?? window.solana;
    if (!w?.isPhantom) throw new Error('Install or unlock the Phantom browser wallet to continue.');
    const connected = await w.connect();
    if (!scope.current()) return;
    const key = connected.publicKey.toBase58();
    if (w.publicKey?.toBase58() !== key) throw new Error('Wallet account changed while connecting. Please reconnect.');
    session.attach(w, key); clearWalletView(); setWallet(w); setActor(key); setMessage('Phantom connected.');
  }); }
  async function disconnect() {
    restoreConnectFocus.current = true;
    const pending = session.disconnect(); const revision = session.capture();
    clearWalletView(); setWallet(null); setActor(''); setDisconnecting(true);
    setMessage('Wallet disconnected from this app. If a transaction was already submitted, check Explorer before retrying.');
    try { await pending; }
    catch { if (session.isCurrent(revision)) setMessage('Wallet cleared from this app, but Phantom could not disconnect. Disconnect in Phantom before reconnecting.'); }
    finally { if (session.isCurrent(revision)) setDisconnecting(false); }
  }
  function copyWalletAddress() { void perform(async scope => {
    const value = actor; if (!value) return;
    try { await navigator.clipboard.writeText(value); }
    catch { throw new Error('Could not copy the address. Copy it from Phantom instead.'); }
    if (scope.current()) { setMenuOpen(false); walletButton.current?.focus(); setMessage('Wallet address copied.'); }
  }); }
  function activeWallet(revision: number): Wallet {
    if (!wallet || !actor || !session.matches(revision, wallet, actor)) throw new Error('Connect or reconnect your wallet first.');
    return wallet;
  }
  async function refresh(value: string, scope: Scope) {
    const e = await readEscrow(new PublicKey(value)); if (!scope.current()) return;
    setAddress(e.address.toBase58()); setEscrow(e); setHash(undefined); setFilename('');
  }
  function create() { void perform(async scope => {
    const w = activeWallet(scope.revision); if (!w.publicKey) throw new Error('Connect your buyer wallet first.');
    const { address: pda, instruction } = await createInstruction(w.publicKey, new PublicKey(seller), new PublicKey(arbitrator), randomId(), lamports(amount));
    const current = () => scope.current() && session.matches(scope.revision, w, actor);
    if (!current()) return; setEscrow(null); setAddress(pda.toBase58()); setTx(null);
    await send(w, instruction, value => { if (current()) setTx(value); }, current);
    if (!current()) return; await refresh(pda.toBase58(), scope);
    if (current()) setMessage('Escrow created. Fund it in a separate transaction.');
  }); }
  function act(name: Action) { void perform(async scope => {
    const w = activeWallet(scope.revision); if (!w.publicKey || !escrow) throw new Error('Connect a wallet and load an escrow first.');
    const instruction = await actionInstruction(name, escrow, w.publicKey, name === 'submit_evidence' ? hash : undefined);
    const current = () => scope.current() && session.matches(scope.revision, w, actor);
    if (!current()) return; setTx(null); await send(w, instruction, value => { if (current()) setTx(value); }, current);
    if (!current()) return; await refresh(escrow.address.toBase58(), scope);
    if (current()) setMessage('Escrow state refreshed.');
  }); }
  function chooseFile(file?: File) { void perform(async scope => {
    setHash(undefined); setFilename(''); if (!file) return;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
    if (scope.current()) { setHash(digest); setFilename(file.name); }
  }); }
  function checkStatus() { void perform(async scope => {
    if (!tx?.signature) return; const signature = tx.signature; const status = await signatureStatus(signature);
    if (scope.current()) setTx({ signature, status, detail: status === 'confirmed' ? 'Confirmed on Devnet. Reload the escrow to see the latest state.' : status === 'failed' ? 'The transaction failed on Devnet. Reload the escrow before retrying.' : 'Still pending or not found. Check Explorer before trying again.' });
  }); }
  async function copyShareLink() {
    const revision = session.capture();
    try { const url = new URL(window.location.href); url.searchParams.set('escrow', address); url.hash = 'workspace'; await navigator.clipboard.writeText(url.toString()); if (session.isCurrent(revision)) setMessage('Escrow link copied. Share it with your seller or arbitrator.'); }
    catch { if (session.isCurrent(revision)) setMessage('Copy the escrow address from the field and share it with the other participant.'); }
  }
  return <main><a className="skip-link" href="#workspace">Skip to escrow workspace</a><header><a className="brand" href="#"><span className="brand-icon">T</span> trustflow <span className="brand-light">commerce</span></a><div className="header-right"><span className="network"><span aria-hidden="true" /> SOLANA DEVNET · TEST NETWORK</span>{actor ? <div className="wallet-menu" ref={walletMenu}><button ref={walletButton} className="outline wallet-trigger" type="button" onClick={() => setMenuOpen(open => !open)} aria-expanded={menuOpen} aria-controls="wallet-options" aria-label={`Connected wallet ${actor}. Wallet options`}><span aria-hidden="true" className="wallet-indicator" />{short(actor)} <span aria-hidden="true">▾</span></button>{menuOpen && <div className="wallet-options" id="wallet-options" role="group" aria-label="Wallet options"><span className="wallet-menu-label">PHANTOM CONNECTED</span><button type="button" onClick={copyWalletAddress} disabled={busy}>Copy wallet address</button><button type="button" onClick={() => void disconnect()}>Disconnect wallet</button></div>}</div> : <button ref={connectButton} className="outline" onClick={connect} disabled={busy || disconnecting} aria-label="Connect Phantom wallet">{disconnecting ? 'Disconnecting…' : 'Connect Phantom'}</button>}</div></header>
    <section className="hero"><div><p className="eyebrow">SOLANA DEVNET · JUDGE DEMO</p><h1>Better work starts<br /><em>with trust.</em></h1><p className="lead">Fund a milestone in escrow, record an evidence hash, and let the buyer approve release to the seller. If a dispute arises, the named arbitrator can refund the buyer.</p><div className="hero-badges"><span>✓ Buyer-approved releases</span><span>✓ Public evidence hash</span><span>✓ Named arbitrator</span></div><div className="hero-links"><a className="hero-button" href="#workspace">Try the workflow →</a><a href="#proof">See historical transactions ↗</a><a href="https://github.com/zzzyyyddd/trustflow-commerce" target="_blank" rel="noreferrer">View GitHub ↗</a></div></div><div className="hero-card"><div className="card-top"><span>HOW IT WORKS</span><span className="dot">✳</span></div><div className="flow"><div><b>01</b><p><strong>Buyer creates & funds</strong><small>Name a seller and an independent arbitrator.</small></p></div><div><b>02</b><p><strong>Seller submits evidence</strong><small>Only a SHA-256 fingerprint goes on-chain.</small></p></div><div><b>03</b><p><strong>Buyer approves & releases</strong><small>Or either party disputes for an arbitrator refund.</small></p></div></div></div></section>
    <section className="guide" id="guide"><div className="section-heading"><div><p className="eyebrow">BEFORE YOU START</p><h2>Set up your Devnet demo.</h2><p>You can use three wallet accounts you control, or invite two other people.</p></div><span className="pill">DEVNET SOL ONLY</span></div><div className="guide-grid"><div><b>1</b><h3>Set up Phantom</h3><p>Install or unlock Phantom. In Settings → Developer Settings, turn on Testnet Mode and select Solana Devnet.</p><a href="https://help.phantom.com/articles/use-developer-settings-in-phantom-28951369255699" target="_blank" rel="noreferrer">Phantom setup ↗</a></div><div><b>2</b><h3>Fund three accounts</h3><p>Use distinct buyer, seller and arbitrator addresses. Fund each with free Devnet SOL for fees; the buyer also needs the escrow amount and account rent.</p><a href="https://faucet.solana.com/" target="_blank" rel="noreferrer">Open Solana faucet ↗</a></div><div><b>3</b><h3>Switch roles as you go</h3><p>Switch Phantom accounts between steps, or share the escrow link with each participant. Wallet signatures are requested for every transaction.</p><a href="#workspace">Start a new escrow ↓</a></div></div><p className="guide-note">Devnet only · Transactions specify zero priority fee; the base network fee still applies. The public faucet and RPC can be rate-limited. No real funds. Escrow accounts retain rent after settlement. This demo is not audited.</p></section>
    <section className="workspace" id="workspace"><div className="section-heading"><div><p className="eyebrow">YOUR LIVE DEVNET WORKSPACE</p><h2>Make the next move.</h2><p>Create a milestone, or open one shared with you. These actions create new transactions.</p></div><span className="pill">LIVE TRANSACTIONS</span></div>
      <div className="columns"><article className="panel"><div className="panel-title"><span className="number">01</span><div><h3>Create an escrow</h3><p>The connected wallet becomes the buyer.</p></div></div><label>Seller wallet address<input value={seller} onChange={e => setSeller(e.target.value)} placeholder="Solana public address" /></label><label>Arbitrator wallet address<input value={arbitrator} onChange={e => setArbitrator(e.target.value)} placeholder="Independent public address" /></label><label>Milestone amount <span>DEVNET SOL</span><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" /></label><p className="hint">All three addresses must be distinct, existing system wallets. Choose an arbitrator who can sign a refund if a dispute arises.</p><button className="primary" onClick={create} disabled={busy || !actor}>Create escrow <span>↗</span></button></article>
      <article className="panel"><div className="panel-title"><span className="number">02</span><div><h3>Open a milestone</h3><p>Paste the escrow address to see its current state.</p></div></div><label>Escrow address<input value={address} onChange={e => { setAddress(e.target.value); setEscrow(null); setHash(undefined); setFilename(''); }} placeholder="Escrow account address" /></label><button className="secondary" disabled={busy || !address} onClick={() => void perform(scope => refresh(address, scope))}>Load escrow <span>→</span></button>
      {escrow ? <div className="details"><div className="detail-head"><span>STATUS</span><b>{states[escrow.status]}</b></div><div className="row"><span>Amount</span><strong>{formatSol(escrow.amount)} SOL</strong></div><div className="row"><span>Your role</span><strong>{role || 'Connect wallet'}</strong></div><div className="row"><span>Buyer</span><a href={explorer('address', escrow.buyer.toBase58())} target="_blank" rel="noreferrer">{short(escrow.buyer.toBase58())} ↗</a></div><div className="row"><span>Seller</span><a href={explorer('address', escrow.seller.toBase58())} target="_blank" rel="noreferrer">{short(escrow.seller.toBase58())} ↗</a></div><div className="row"><span>Arbitrator</span><a href={explorer('address', escrow.arbitrator.toBase58())} target="_blank" rel="noreferrer">{short(escrow.arbitrator.toBase58())} ↗</a></div><div className="row"><span>Evidence SHA-256</span><code>{/^0+$/.test(escrow.evidence) ? 'Not submitted' : escrow.evidence}</code></div><div className="share-links"><a href={explorer('address', escrow.address.toBase58())} target="_blank" rel="noreferrer">View account on Explorer ↗</a><button onClick={() => void copyShareLink()}>Copy escrow link</button></div>
      {escrow.status === 1 && role === 'seller' && <label className="upload">Evidence file <input type="file" onChange={e => chooseFile(e.target.files?.[0])} /><small>{filename ? `SHA-256 ready: ${filename}` : 'The file stays on your device; only its hash is submitted.'}</small></label>}
      <div className="actions">{escrow.status === 0 && role === 'buyer' && <button onClick={() => act('fund')} disabled={busy}>Fund escrow</button>}{escrow.status === 1 && role === 'seller' && <button onClick={() => act('submit_evidence')} disabled={busy || !hash}>Submit evidence hash</button>}{escrow.status === 2 && role === 'buyer' && <button onClick={() => act('approve')} disabled={busy}>Approve evidence</button>}{escrow.status === 3 && actor && <button onClick={() => act('release')} disabled={busy}>Release to seller</button>}{[1, 2].includes(escrow.status) && ['buyer', 'seller'].includes(role) && <button className="danger" onClick={() => act('dispute')} disabled={busy}>Open dispute</button>}{escrow.status === 5 && role === 'arbitrator' && <button className="danger" onClick={() => act('refund')} disabled={busy}>Refund buyer</button>}</div><p className="hint">{escrow.status === 0 ? 'Buyer funds the milestone.' : escrow.status === 1 ? 'Seller submits evidence, or buyer or seller opens a dispute.' : escrow.status === 2 ? 'Buyer reviews and approves, or either party opens a dispute.' : escrow.status === 3 ? 'Approval is final. Any connected wallet can release funds to the recorded seller.' : escrow.status === 5 ? 'Only the recorded arbitrator can refund the buyer. There is no timeout refund.' : 'This escrow has settled and cannot be settled again.'}</p></div> : <div className="empty"><span>◇</span><strong>No milestone loaded</strong><p>Once opened, your escrow details and available actions will appear here.</p></div>}</article></div>
      {(message || tx || busy) && <div className="notice" role="status" aria-live="polite">{tx && <><strong>Transaction: {tx.status.replace('-', ' ')}</strong><p>{tx.detail}</p>{tx.signature && <><code className="signature">{tx.signature}</code><div className="notice-actions"><a href={explorer('tx', tx.signature)} target="_blank" rel="noreferrer">View on Devnet Explorer ↗</a>{!['failed','expired'].includes(tx.status) && <button onClick={checkStatus} disabled={busy}>Check status</button>}</div></>}</>}{message && <p>{message}</p>}{busy && !tx && <p>Working…</p>}</div>}
    </section><section className="proof" id="proof"><div className="section-heading"><div><p className="eyebrow">ON-CHAIN EVIDENCE</p><h2>See an escrow in action.</h2><p>Historical Devnet transactions from a previously verified run. These links do not create new transactions.</p></div><span className="pill">HISTORICAL · FINALIZED</span></div><div className="proof-groups">{proofGroups.map(group => <section className="proof-group" aria-labelledby={group.id} key={group.id}><h3 id={group.id}>{group.title}</h3><p>{group.description}</p><div className="proof-list">{group.labels.map(label => { const item = historical.transactions.find(transaction => transaction.label === label); if (!item) return null; const result = item.error ? 'Expected rejection' : 'Confirmed'; return <a key={item.signature} href={item.explorer} target="_blank" rel="noreferrer" aria-label={`${historyNames[item.label]}: ${result}, view on Devnet Explorer (opens in a new tab)`}><span>{historyNames[item.label]}</span><span className={item.error ? 'proof-rejected' : 'proof-ok'}>{result} ↗</span></a>; })}</div></section>)}</div><p className="hint">The dispute path uses a separate escrow because released funds cannot be settled twice. Explorer shows the original transactions and their timestamps.</p><a className="program-link" href={explorer('address', '8DK8Z1Uz8Nv3KTvVE7kxrm79mijQEL2nC5CAacPHgJ4Z')} target="_blank" rel="noreferrer">View deployed Devnet program ↗</a></section><footer><span>trustflow <span className="brand-light">commerce</span></span><p>Built for Devnet experimentation. Not audited. Never use real funds.</p><a href="https://explorer.solana.com/?cluster=devnet" target="_blank" rel="noreferrer">Solana Explorer ↗</a></footer></main>;
}
