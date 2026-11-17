from copy import deepcopy
import json
from pathlib import Path
import unittest
import gg24,op_beleg as op,vorschlag as proposal
root=Path(__file__).resolve().parent
def read(name):return json.loads((root/name).read_bytes())

class PublicEvidence(unittest.TestCase):
    def test_report_totals(self):
        result=gg24.summarize(read('QUELLZAHLEN.json'))
        self.assertEqual((result['finalDistinctProactiveLabels'],result['finalProactiveUSD']),(13,83800))
        self.assertEqual((result['interim']['rows'],result['interim']['usd']),(12,81800))
        self.assertEqual(result['displayedRetroDeltaUSD'],2)
    def test_total_rows_and_duplicate_labels(self):
        original=read('QUELLZAHLEN.json')
        for change in ('total','duplicate'):
            data=deepcopy(original);table=data['final']['tables']['pilot']
            if change=='total':table['totalRowUSD']+=1
            else:table['rows'][1][0]=table['rows'][0][0]
            with self.assertRaises(ValueError):gg24.summarize(data)
    def test_no_silent_currency_coercion(self):
        for raw in ('2 ETH','$13,00','$1.000','1 DAI','4e3'):
            with self.assertRaises(ValueError):gg24.money(raw)
    def test_transfer(self):
        p=op.check(read('OP_RECEIPT.json'))
        self.assertEqual((p['chainId'],p['units'],p['symbol'],p['proposal'],p['transferLog'],p['distributionLog']),(10,2000,'DAI',7,1,3))
    def test_mismatched_receipt_or_log(self):
        original=read('OP_RECEIPT.json')
        for field in ('chain','status','removed','amount','recipient','block'):
            d=deepcopy(original);r=d['receipt'];log=r['logs'][0]
            if field=='chain':d['chainId']='0x1'
            if field=='status':r['status']='0x0'
            if field=='removed':log['removed']=True
            if field=='amount':log['data']='0x'+'0'*63+'1'
            if field=='recipient':log['topics'][2]='0x'+'0'*64
            if field=='block':r['blockHash']='0x'+'0'*64
            with self.assertRaises(ValueError):op.check(d)
    def test_registration_to_payment(self):
        pay=op.check(read('OP_RECEIPT.json'));proof=read('PROPOSAL_7.json');link=proposal.bind(proof['registration'],pay)
        self.assertEqual(link['poolId'],178)
        key=0
        for ch in link['cid']:key=key*58+proposal.ALPHABET.index(ch)
        self.assertEqual(key.to_bytes(34,'big')[2:].hex(),proof['metadata']['rawBlockSHA256'])
        self.assertTrue(proof['metadata']['title'].startswith('Taiwan Hypercerts Dashboard'))
        pay['beneficiary']='0x'+'0'*40
        with self.assertRaises(ValueError):proposal.bind(proof['registration'],pay)

if __name__=='__main__':unittest.main()
