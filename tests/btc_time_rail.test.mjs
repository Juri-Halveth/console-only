import test from 'node:test';
import assert from 'node:assert/strict';
import {extractBitcoinRail,sampleBitcoinRail,formatBitcoinUTC} from '../src/btc_time_rail.mjs';

const head=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64),'d'.repeat(64)];
const start=Date.parse('2026-11-15T16:34:27+00:00');
const seconds=[0,438,747,996];
function fixture(){
 const rows=[{source:'GARTEN',key:'g-6',entry:{kind:'branch',name:'Funktionsatlas',parent:'Konsole'}}];
 for(let i=0;i<4;i++){
  const h=975987+i,n='BTC H'+h,hash=head[i],prev=i>0?head[i-1]:'e'.repeat(64),time=new Date(start+seconds[i]*1000).toISOString().replace('Z','+00:00');
  rows.push({source:'GARTEN',key:'g-'+(11+i*2),entry:{kind:'branch',name:n,parent:i?'BTC H'+(h-1):'BTC 4D Beobachtung'}});
  rows.push({source:'GARTEN',key:'g-'+(12+i*2),entry:{kind:'note',name:n,text:`BITCOIN BLOCKHEADER | Hoehe ${h} | Blockzeit UTC ${time} | Hash ${hash} | Vorgaenger ${prev} | API-TX-Anzahl 7000 | Header-PoW-Pruefung OK`}});
 }
 return rows;
}
test('reads 4 Garden blocks in height order with real header timestamps',()=>{
 const found=extractBitcoinRail(fixture());
 assert.equal(found.playable,true);
 assert.deepEqual(found.blocks.map(b=>b.height),[975987,975988,975989,975990]);
 assert.equal(found.blocks[3].timeMs-start,996000);
});
test('interpolates in source header time, not equally spaced blocks',()=>{
 const f=extractBitcoinRail(fixture());
 const b=f.blocks.map((e,i)=>({...e,position:{x:i*2,y:i,z:i*20}}));
 const p=sampleBitcoinRail(b,start+219000);
 assert.equal(p.from,975987);assert.equal(p.to,975988);
 assert.equal(p.fraction,.5);assert.equal(p.z,10);
 const q=sampleBitcoinRail(b,start+438000);
 assert.equal(q.z,20);
});
test('refuses a wrong predecessor without changing source rows',()=>{
 const rows=fixture();rows[4].entry.text=rows[4].entry.text.replace('Vorgaenger '+head[0],'Vorgaenger '+'f'.repeat(64));
 const out=extractBitcoinRail(rows);assert.equal(out.playable,false);
});
test('refuses a non-chronological source time; still returns blocks',()=>{
 const rows=fixture();rows[4].entry.text=rows[4].entry.text.replace('2026-11-15T16:41:45.000+00:00','2026-11-15T16:31:45.000+00:00');
 const result=extractBitcoinRail(rows);assert.equal(result.blocks.length,4);assert.equal(result.playable,false);assert.match(result.reason,/nicht streng steigend/);
});
test('ignores unrelated potentially malicious garden notes',()=>{
 const rows=fixture();rows.push({source:'GARTEN',key:'g-99',entry:{kind:'note',name:'BTC H975987 <script>',text:'x'}});
 assert.equal(extractBitcoinRail(rows).playable,true);
});
test('refuses missing source description',()=>{
 const rows=fixture().filter(r=>r.entry.name!=='BTC H975988'||r.entry.kind!=='note');
 assert.equal(extractBitcoinRail(rows).playable,false);
});
test('returns null for invalid position or time',()=>{
 const blocks=extractBitcoinRail(fixture()).blocks;
 assert.equal(sampleBitcoinRail(blocks,start),null);
 assert.equal(sampleBitcoinRail(blocks,NaN),null);
});
test('formats header time as UTC, not local receipt time',()=>{
 assert.equal(formatBitcoinUTC(start),'2026-11-15 16:34:27 UTC');
});
