"""Recheck the public registration, proposal identity, and original IPFS title."""
from argparse import ArgumentParser
from datetime import datetime,timezone
from hashlib import sha256
from pathlib import Path
from urllib.request import Request,urlopen
import json
from op_beleg import rpc,require,POOL,HERE,check

REG='0x526c7c1c9440e0b7058a85af322a443e5e89cb1942014768faeb61ebf9e0c671'
BLOCK='0xb7578b98c920ef463d3e257f4c6ca7d8bcef60d23db67bc7c196cc6be5fbc5d1'
CREATED='0xfcf3b1aa65a464cef2889608f99e8b8c0f680a4be6c2acb9d961c536a5a9294b'
ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def registration():
    tx=rpc('eth_getTransactionByHash',[REG]);r=rpc('eth_getTransactionReceipt',[REG])
    b=rpc('eth_getBlockByNumber',[r['blockNumber'],False])
    return {'chainId':rpc('eth_chainId',[]),'receipt':r,'transaction':{k:tx[k] for k in ['hash','input','to','blockHash','blockNumber']},
            'block':{k:b[k] for k in ['number','hash','timestamp']},'indexedTx':b['transactions'][int(r['transactionIndex'],16)]}

def bind(data,pay):
    tx=data['transaction'];r=data['receipt'];b=data['block']
    require(data['chainId']=='0xa' and tx['hash']==r['transactionHash']==data['indexedTx']==REG,'Registration identity')
    require(tx['blockHash']==r['blockHash']==b['hash']==BLOCK and r['status']=='0x1' and tx['blockNumber']==r['blockNumber']==b['number'],'Registration block')
    log,=[l for l in r['logs'] if l['address'].lower()==POOL and l['topics']==[CREATED] and int(l['logIndex'],16)==90]
    require(log['removed'] is False and log['blockHash']==BLOCK and log['transactionHash']==REG,'Registration log')
    raw=bytes.fromhex(tx['input'][2:]);integer=lambda buf:int.from_bytes(buf,'big')
    def word(buf,i):
        a=buf[i*32:(i+1)*32];require(len(a)==32,'Incomplete ABI word');return integer(a)
    require(raw[:4].hex()=='075c0e9c','Expected registerRecipient');args=raw[4:];pool=word(args,0)
    off=word(args,1);require(off==64,'Outer ABI offset');size=word(args[off:],0);args=args[off+32:off+32+size]
    require(word(args,0)==32,'Tuple offset');arg=args[32:]
    proposal=bytes.fromhex(log['data'][2:]);require(len(proposal)==64 and word(proposal,0)==word(arg,0)==pool==178 and word(proposal,1)==pay['proposal'],'Pool/proposal binding')
    require(word(arg,1)==int(pay['beneficiary'],16) and word(arg,2)==int(pay['rawAmount']) and word(arg,3)==int(pay['token'],16),'Recipient/token/value binding')
    require(word(arg,4)==160,'Metadata offset');meta=arg[160:]
    require(word(meta,0)==1 and word(meta,1)==64 and word(meta,2)==46,'IPFS metadata format');cid=meta[96:142].decode('ascii')
    require(len(cid)==46 and all(v in ALPHABET for v in cid),'CIDv0')
    return {'proposal':pay['proposal'],'poolId':pool,'registration':REG,'block':int(b['number'],16),'blockHash':BLOCK,'logIndex':90,'cid':cid,
            'when':datetime.fromtimestamp(int(b['timestamp'],16),timezone.utc).isoformat()}

def number(b,i):
    v=0
    for shift in range(0,64,7):
        byte=b[i];i+=1;v|=(byte&127)<<shift
        if byte<128:return v,i
    raise ValueError('Invalid varint')

def fields(b):
    i=0;out={}
    while i<len(b):
        key,i=number(b,i);n,t=divmod(key,8);require(n not in out,'Repeated field')
        if t==0: value,i=number(b,i)
        elif t==2:
            size,i=number(b,i);value=b[i:i+size];require(len(value)==size,'Incomplete protobuf field');i+=size
        else: raise ValueError('Unsupported protobuf type')
        out[n]=value
    return out

def resolve(cid):
    url='https://gateway.pinata.cloud/ipfs/'+cid+'?format=raw'
    req=Request(url,headers={'Accept':'application/vnd.ipld.raw','User-Agent':'HALVETH-public-proposal/1'})
    with urlopen(req,timeout=16) as response: raw=response.read(1024*1024+1)
    require(0<len(raw)<=1024*1024,'CID block size')
    key=0
    for char in cid:key=key*58+ALPHABET.index(char)
    require(key.to_bytes(34,'big')==b'\x12\x20'+sha256(raw).digest(),'IPFS multihash')
    node=fields(raw);require(node.keys()=={1},'Expected a single DAG-PB leaf')
    file=fields(node[1]);require(file[1]==2 and len(file[2])==file[3],'UnixFS file');title=json.loads(file[2])['title']
    return {'title':title,'rawBlockSHA256':sha256(raw).hexdigest(),'rawBlockBytes':len(raw),'jsonBytes':len(file[2]),'jsonSHA256':sha256(file[2]).hexdigest()}

def main():
    ap=ArgumentParser(__doc__);ap.add_argument('--verify-live',action='store_true');a=ap.parse_args()
    pay=check(json.loads((HERE/'OP_RECEIPT.json').read_bytes()))
    proof=json.loads((HERE/'PROPOSAL_7.json').read_bytes());link=bind(proof['registration'],pay)
    if a.verify_live:
        require(bind(registration(),pay)==link,'Fresh registration differs')
        require(resolve(link['cid'])==proof['metadata'],'Fresh CID/title differs')
    print(json.dumps({**link,**proof['metadata']},indent=2))
if __name__=='__main__':main()
