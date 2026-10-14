import test from "node:test";
import assert from "node:assert/strict";
import { createAgentNetwork } from "../lib/agent-network";
test("reference transport refuses foreign origins, writes and authorization on readiness probes",async()=>{
 let calls=0;const n=createAgentNetwork("https://radar.example",{source:"direct"},async()=>{calls++;return new Response("{}");});
 for(const [url,init] of [["https://other.example/api/signals/latest",{}],["https://radar.example/api/gateway-funding",{}],["https://radar.example/api/signals/latest",{method:"POST",body:"{}"}],["https://radar.example/api/health",{headers:{"payment-signature":"synthetic-must-not-forward"}}]] as const)await assert.rejects(n.fetcher(url,init));
 assert.equal(calls,0);assert.equal((await n.fetcher("https://radar.example/api/health")).status,200);assert.equal(calls,1);
});
test("redirect responses never forward the retained authorization",async()=>{
 let calls=0;const n=createAgentNetwork("https://radar.example",{source:"direct"},async(_u,init)=>{calls++;assert.equal(init?.redirect,"error");return new Response(null,{status:302,headers:{location:"https://other.example"}});});
 await assert.rejects(n.fetcher("https://radar.example/api/signals/latest",{headers:{"payment-signature":"synthetic-original"}}));assert.equal(calls,1);
});
