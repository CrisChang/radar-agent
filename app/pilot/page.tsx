export const metadata = { robots: { index: false, follow: false } };
import WalletTools from "../wallet-tools";
import { getArcConfig, getPilotBuyerAddress, getSellerAddress } from "@/lib/arc";
export const dynamic = "force-dynamic";
export default function Pilot() {
  const arc = getArcConfig({ ARC_NETWORK: getArcConfig().mode });
  return <WalletTools arc={arc} seller={getSellerAddress()} pilotBuyer={getPilotBuyerAddress()} price={process.env.SIGNAL_PRICE_USDC ?? "0.001"}
    mode="pilot" paymentsEnabled={process.env.RADAR_ACCEPT_PAYMENTS === "true"}/>;
}
