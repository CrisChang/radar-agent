/** Public-chain read-only funding cost audit. No signer, transaction submit or credentials. */
import {request} from 'node:https';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),proxy=require('https-proxy-agent');
export async function rpc(method:string,params:any[]){
 const allowed=['eth_blockNumber','eth_chainId','eth_getLogs','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getBlockByNumber','eth_getBalance','eth_call'];if(!allowed.includes(method))throw Error('RPC scope');
 const j:any=await new Promise((resolve,reject)=>{
  const q=request('https://rpc.mainnet.arc.io',{method:'POST',agent:proxy('http://127.0.0.1:7897'),headers:{'content-type':'application/json'},signal:AbortSignal.timeout(25000)},r=>{
   const b:Buffer[]=[];r.on('data',c=>b.push(c));r.on('error',reject);
   r.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(b).toString()));}catch{reject(Error(`RPC HTTP ${r.statusCode}`));}});
  });
  q.on('error',reject);q.end(JSON.stringify({jsonrpc:'2.0',id:1,method,params}));
 });
 if(j.error)throw Error(String(j.error.message).slice(0,180));return j.result;
}
import {readFile,writeFile} from 'node:fs/promises';
const {decodeFunctionData,erc20Abi,parseAbi,formatUnits}=require('viem');
const buyer='0xefc70a0dedefee6a010bac44de489bafb2fd8422',usdc='0x3600000000000000000000000000000000000000',gateway='0x77777777dcc4d5a8b6e418fd04d8997ef11000ee';
const known=['0xecd1df736e620bfec9fa67849b27ab3a20bef9dc24d8c0725f9f7f31830507dd','0xa0286660f1881b42b2679b9e47ae06dfa6e393129a94c71f0fe8654f3a8d9b30','0x41ceb9019cf22cb650c94d241adb94a3ad47c2a1c7f2c7a1933d94c57d06a70e','0x5d47c5a42fa47347c20dc8c6b6d4ac4541f51104f2428079efca3e7ff2dc5947'];
const at='0x'+Number(BigInt(await rpc('eth_blockNumber',[]))).toString(16),count=Number(BigInt(await rpc('eth_getTransactionCount',[buyer,at])));
if(await rpc('eth_chainId',[])!=='0x13b2'||count!==7)throw Error('Snapshot scope changed');
const txs=new Map<number,any>();for(const hash of known){const t=await rpc('eth_getTransactionByHash',[hash]);if(t?.from?.toLowerCase()!==buyer)throw Error('Owner scope');txs.set(Number(BigInt(t.nonce)),t);}
console.log('Located 4 known funding/allowance transactions. Searching the remaining 3 by account nonce.');
const counts=new Map<number,number>();async function nonceAt(block:number){if(!counts.has(block))counts.set(block,Number(BigInt(await rpc('eth_getTransactionCount',[buyer,'0x'+block.toString(16)]))));return counts.get(block)!;}
for(let n=0;n<count;n++)if(!txs.has(n)){
 const lower=[...txs].filter(([k])=>k<n).map(([,t])=>Number(BigInt(t.blockNumber))),upper=[...txs].filter(([k])=>k>n).map(([,t])=>Number(BigInt(t.blockNumber)));
 let lo=lower.length?Math.max(...lower):0,hi=upper.length?Math.min(...upper):Number(BigInt(at));
 while(lo<hi){const mid=Math.floor((lo+hi)/2);if(await nonceAt(mid)>n)hi=mid;else lo=mid+1;}
 const block=await rpc('eth_getBlockByNumber',['0x'+lo.toString(16),true]),found=block.transactions.find((t:any)=>t.from?.toLowerCase()===buyer&&Number(BigInt(t.nonce))===n);
 if(!found)throw Error('Nonce history incomplete');txs.set(n,found);console.log(`Located original transaction nonce ${n}.`);
}
const rows=[];let gas=0n,deposits=0n;
for(let n=0;n<count;n++){
 const t=txs.get(n),receipt=await rpc('eth_getTransactionReceipt',[t.hash]),block=await rpc('eth_getBlockByNumber',[t.blockNumber,false]);
 if(receipt.status!=='0x1'||receipt.from.toLowerCase()!==buyer||receipt.blockHash!==block.hash||t.blockHash!==block.hash||Number(BigInt(at))<Number(BigInt(t.blockNumber))+2||BigInt(t.value)!==0n)throw Error('Canonical transaction check failed');
 let kind:string,amount:bigint;
 if(t.to.toLowerCase()===usdc){const decoded=decodeFunctionData({abi:erc20Abi,data:t.input});if(decoded.functionName!=='approve'||decoded.args[0].toLowerCase()!==gateway)throw Error('Unrelated outgoing transaction');amount=decoded.args[1];kind=amount===0n?'revoke':amount>223600n?'over_limit_approval':'approval';}
 else if(t.to.toLowerCase()===gateway){const decoded=decodeFunctionData({abi:parseAbi(['function deposit(address token,uint256 value)']),data:t.input});if(decoded.functionName!=='deposit'||decoded.args[0].toLowerCase()!==usdc)throw Error('Unrelated outgoing transaction');amount=decoded.args[1];kind='deposit';deposits+=amount;}
 else throw Error('Unrelated outgoing transaction');
 const fee=BigInt(receipt.gasUsed)*BigInt(receipt.effectiveGasPrice);gas+=fee;
 rows.push({wallet_transaction_nonce:n,hash:t.hash,block:Number(BigInt(t.blockNumber)),timestamp:new Date(Number(BigInt(block.timestamp))*1000).toISOString(),kind,scope:n<3?'shared_bootstrap_and_pilot':'campaign_incremental',amount_atomic:kind==='over_limit_approval'?null:amount.toString(),gas_used:BigInt(receipt.gasUsed).toString(),effective_gas_price_atomic_18:BigInt(receipt.effectiveGasPrice).toString(),gas_atomic_18:fee.toString(),gas_usdc:formatUnits(fee,18),status:'success'});
}
const startBlock=Number(BigInt(txs.get(0).blockNumber))-1,start=BigInt(await rpc('eth_getBalance',[buyer,'0x'+startBlock.toString(16)])),end=BigInt(await rpc('eth_getBalance',[buyer,at]));
const debit=start-end,expected=deposits*10n**12n+gas,residual=debit-expected;
if(residual!==0n)throw Error('Native wallet balance has unexplained movement');
const campaignGas=rows.filter(r=>r.scope==='campaign_incremental').reduce((n,r)=>n+BigInt(r.gas_atomic_18),0n);
const out={schema:'radar-owner-funding-cost-v1',checked_at:new Date().toISOString(),chain_id:5042,snapshot_block:Number(BigInt(at)),payer:buyer,transaction_count:count,complete_outgoing_nonce_range:[0,count-1],funding_deposit_usdc:formatUnits(deposits,6),wallet_debit_usdc:formatUnits(debit,18),expected_wallet_debit_usdc:formatUnits(expected,18),wallet_difference_atomic_18:residual.toString(),total_funding_and_allowance_gas_usdc:formatUnits(gas,18),campaign_incremental_funding_gas_usdc:formatUnits(campaignGas,18),shared_bootstrap_gas_usdc:formatUnits(gas-campaignGas,18),rows};
await writeFile('data/mainnet-funding-costs.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({transactions:count,gas_usdc:out.total_funding_and_allowance_gas_usdc,campaign_incremental_gas_usdc:out.campaign_incremental_funding_gas_usdc,wallet_difference_atomic_18:out.wallet_difference_atomic_18}));
