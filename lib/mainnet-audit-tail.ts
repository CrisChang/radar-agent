import { CAMPAIGN_ID } from "./validation-plan";
type EventExport={campaign:string;kind:string;offset?:number;items:unknown[]};
function stable(value:unknown):string { if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable((value as Record<string,unknown>)[k])).join(",")+"}";return JSON.stringify(value); }
/** Merge only an authenticated existing-export tail with matching overlap. No API or permission changes. */
export function mergeEventExport(base:EventExport,tail:EventExport):EventExport {
 if(base.campaign!==CAMPAIGN_ID||tail.campaign!==CAMPAIGN_ID||base.kind!=="events"||tail.kind!=="events"||(base.offset??0)!==0||!Array.isArray(base.items)||!Array.isArray(tail.items)||!Number.isInteger(tail.offset)||tail.offset!<0||tail.offset!>=base.items.length||tail.items.length>100000)throw Error("Event exports have incompatible scope or no overlap");
 const overlap=base.items.length-tail.offset!;if(tail.items.length<overlap||base.items.length+tail.items.length-overlap>100000)throw Error("Event continuation is incomplete");
 for(let i=0;i<overlap;i++)if(stable(base.items[tail.offset!+i])!==stable(tail.items[i]))throw Error("Previously exported event history changed");
 return {campaign:CAMPAIGN_ID,kind:"events",offset:0,items:[...base.items,...tail.items.slice(overlap)]};
}
