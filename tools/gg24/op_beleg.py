"""One pinned OP Mainnet receipt, offline by default. Uses public read methods only."""
from argparse import ArgumentParser
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from urllib.request import Request, urlopen
import json

HERE=Path(__file__).resolve().parent
RPC='https://mainnet.optimism.io'
TX='0x03c236561bf1cb5a88c14170478735dd0fd640c02debf3015430b13774022e35'
POOL='0x588e935cf4dae4361f33af2aadd4c3c3a06cab7d'
TOKEN='0xda10009cbd5d07dd0cecc66161fc93d7c9000da1'
SEAL='0xa46ad0876174a365148f801f78fd862c5ff1498b4d228b33d4d4a523c715a733'
TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
DISTRIBUTED='0xa7932e9c92f31e1ed56b29d00bbe669a97484dc24de28dd9c8c0429df7f35847'

def rpc(method,params):
    body=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params}).encode()
    req=Request(RPC,data=body,headers={'Content-Type':'application/json','User-Agent':'HALVETH-public-receipt/1'})
    with urlopen(req,timeout=12) as r: reply=json.load(r)
    if 'error' in reply or reply['result'] is None: raise ValueError(method+' unavailable')
    return reply['result']

def collect():
    receipt=rpc('eth_getTransactionReceipt',[TX])
    block=rpc('eth_getBlockByNumber',[receipt['blockNumber'],False])
    n=receipt['blockNumber']
    return {'chainId':rpc('eth_chainId',[]),'receipt':receipt,
            'block':{k:block[k] for k in ('number','hash','timestamp')},
            'containsTxAtIndex':block['transactions'][int(receipt['transactionIndex'],16)],
            'decimals':rpc('eth_call',[{'to':TOKEN,'data':'0x313ce567'},n]),
            'symbol':rpc('eth_call',[{'to':TOKEN,'data':'0x95d89b41'},n])}

def require(ok,msg):
    if not ok: raise ValueError(msg)

def check(d):
    r=d['receipt'];b=d['block'];n=int(b['number'],16)
    require(int(d['chainId'],16)==10 and r['transactionHash'].lower()==TX and d['containsTxAtIndex'].lower()==TX,'Chain/transaction binding')
    require(r['status']=='0x1' and r['blockHash']==b['hash']==SEAL and r['blockNumber']==b['number'],'Receipt/block binding')
    def event(contract,topic,index):
        records=[l for l in r['logs'] if l['address'].lower()==contract and l['topics'][0].lower()==topic and int(l['logIndex'],16)==index]
        require(len(records)==1,'Event identity');l=records[0]
        require(l.get('removed') is False and l['blockHash']==SEAL and l['transactionHash']==TX and l['blockNumber']==b['number'],'Log binding')
        return l
    t=event(TOKEN,TRANSFER,1);p=event(POOL,DISTRIBUTED,3)
    word=lambda x:len(x)==64 and all(c in '0123456789abcdef' for c in x)
    require(len(t['topics'])==3 and len(p['topics'])==1 and t['topics'][1][2:]=='0'*24+POOL[2:],'Pilot pool sender')
    fields=[p['data'][2:][i:i+64] for i in (0,64,128)];recipient=t['topics'][2].lower()[2:]
    require(len(recipient)==64 and recipient.startswith('0'*24) and len(p['data'])==194 and all(word(w) for w in fields),'Distribution encoding')
    require(word(t['data'][2:]) and int(fields[2],16)==int(t['data'],16) and fields[1]==recipient,'Recipient/value mismatch')
    decimals=int(d['decimals'],16);sym=bytes.fromhex(d['symbol'][2:])
    require(decimals==18 and len(sym)==96 and int.from_bytes(sym[:32])==32 and int.from_bytes(sym[32:64])==3 and sym[64:67]==b'DAI','Token metadata')
    units=int(t['data'],16)
    require(units%10**decimals==0,'Fractional amount')
    return dict(chainId=10,block=n,blockHash=SEAL,transaction=TX,when=datetime.fromtimestamp(int(b['timestamp'],16),timezone.utc).isoformat(),
                transferLog=1,distributionLog=3,token=TOKEN,symbol='DAI',rawAmount=str(units),decimals=decimals,units=units//10**decimals,
                fromPool=POOL,beneficiary='0x'+recipient[-40:],proposal=int(fields[0],16))

def main():
    args=ArgumentParser(__doc__);args.add_argument('--verify-live',action='store_true');a=args.parse_args()
    data=json.loads((HERE/'OP_RECEIPT.json').read_bytes());result=check(data)
    if a.verify_live:require(check(collect())==result,'Fresh provider observation differs')
    print(json.dumps(result,indent=2))
if __name__=='__main__':main()
