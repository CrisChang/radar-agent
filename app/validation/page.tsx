import ValidationTools from "./tools";
import { getArcConfig, getPilotBuyerAddress, getSellerAddress } from "@/lib/arc";
export const dynamic = "force-dynamic";
export default function ValidationPage() {
  const arc = getArcConfig({ ARC_NETWORK: "mainnet" });
  return <ValidationTools arc={arc} payer={getPilotBuyerAddress()} seller={getSellerAddress()}/>;
}
