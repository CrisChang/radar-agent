import { request, type Agent } from "node:https";
import createProxyAgent from "https-proxy-agent";
import { checkedProxy, type NetworkChoice } from "./validation-local-network";
/** Local reference-client transport. Pin the origin; never forward credentials through redirects. */
export function createAgentNetwork(origin:string,choice:NetworkChoice,direct:typeof fetch=globalThis.fetch){
 const base=new URL(origin);if(base.origin!==origin||base.username||base.password||base.protocol!=="https:")throw Error("Pin an HTTPS API origin");
 const proxy=choice.proxy?checkedProxy(choice.proxy):undefined;
 const fetcher:typeof fetch=async(input,init)=>{
  const url=new URL(typeof input==="string"||input instanceof URL?String(input):input.url),headers=new Headers(init?.headers);
  if(url.origin!==origin||url.username||url.password||url.hash||!["/api/health","/api/signals/latest"].includes(url.pathname)||(init?.method&&init.method!=="GET")||init?.body||
   (input instanceof Request&&input.method!=="GET")||(url.pathname==="/api/health"&&headers.has("payment-signature")))throw Error("Client request outside the pinned API scope");
  const response=!proxy?await direct(input,{...init,redirect:"error"}):await new Promise<Response>((resolve,reject)=>{
   const signal=init?.signal??AbortSignal.timeout(30000);
   const agent=createProxyAgent({...new URL(proxy),host:new URL(proxy).hostname,port:Number(new URL(proxy).port||(new URL(proxy).protocol==="https:"?443:80)),protocol:new URL(proxy).protocol,signal});
   const req=request(url,{method:"GET",headers:Object.fromEntries(headers),agent:agent as unknown as Agent,signal},res=>{
    const chunks:Buffer[]=[];let size=0;res.on("error",reject);res.on("data",c=>{size+=c.length;if(size>65536)req.destroy(Error("API response too large"));else chunks.push(c);});
    res.on("end",()=>{if(!res.complete){reject(Error("Incomplete API response"));return;}const h=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)h.append(res.rawHeaders[i],res.rawHeaders[i+1]);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode??502,headers:h}));});
   });req.on("error",reject);req.end();
  });
  if(response.status>=300&&response.status<400)throw Error("API redirect blocked");return response;
 };
 return {fetcher,description:proxy?`${choice.source} HTTP proxy ${proxy}`:"direct"};
}
