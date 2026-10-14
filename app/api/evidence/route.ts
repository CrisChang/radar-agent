import { NextRequest, NextResponse } from "next/server";
import { publicEvidence } from "@/lib/public-evidence";
export const dynamic = "force-dynamic";
export async function GET(request:NextRequest){
 const kind=request.nextUrl.searchParams.get("format")??"json";
 if(!["json","csv"].includes(kind)||[...request.nextUrl.searchParams.keys()].some(k=>k!=="format"))return NextResponse.json({error:"Use format=json or csv"},{status:400});
 const data=await publicEvidence({fullAudit:request.nextUrl.searchParams.get("format")==="json"});
 const headers={"cache-control":"no-store","content-disposition":`attachment; filename="radar-mainnet-evidence.${kind}"`};
 if(kind==="json")return NextResponse.json(data,{headers});
 const columns=["intent","stage","scenario","amount_atomic","amount_usdc","local_state","transfer_status","scenario_passed","batch_hash","proof","http_attempts","supplemental_replay_attempts","concurrent_evidence","money_difference_atomic","response_sha256"] as const;
 const csv=[columns.join(","),...data.report.rows.map(r=>columns.map(k=>`"${String(r[k]??"").replaceAll('"','""')}"`).join(","))].join("\r\n");
 return new NextResponse(csv,{headers:{...headers,"content-type":"text/csv; charset=utf-8"}});
}
