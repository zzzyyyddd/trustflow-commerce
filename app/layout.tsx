import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata = { title: 'TrustFlow Commerce | Devnet escrow', description: 'Evidence-driven milestone escrow on Solana Devnet.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
