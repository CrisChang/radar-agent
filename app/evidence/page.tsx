import type { Metadata } from "next";
import SiteNav from "../site-nav";
import EvidencePanel from "./panel";
import { publicEvidence } from "@/lib/public-evidence";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "1,000-payment mainnet evidence | Radar Agent", description: "Expected versus actual USDC charges, retries, shared batch hashes and scenario evidence for Radar Agent." };
export default async function Evidence(){return <main><SiteNav/><EvidencePanel initial={await publicEvidence()}/></main>;}
