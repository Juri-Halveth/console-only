"""Generate the four KORRIDOT events from the pinned reports and public chain records."""
from pathlib import Path
from argparse import ArgumentParser
import json
import gg24, op_beleg, vorschlag

ROOT=Path(__file__).resolve().parent
def read(name): return json.loads((ROOT/name).read_bytes())
def usd(n): return format(n,',').replace(',','.')+' USD'
def blockurl(tx):return 'https://optimism.blockscout.com/tx/'+tx
def build():
    data=read('QUELLZAHLEN.json');summary=gg24.summarize(data);payment=op_beleg.check(read('OP_RECEIPT.json'))
    evidence=read('PROPOSAL_7.json');reg=vorschlag.bind(evidence['registration'],payment)
    title=evidence['metadata']['title'];labels=[name for name,amount in data['final']['tables']['pilot']['rows'] if title==name or title.startswith(name+' - ')]
    if len(labels)!=1:raise ValueError('Ambiguous project title in the final pilot table')
    n=payment['units'];amount=f'{n:,}'.replace(',','.')+' '+payment['symbol']
    project=labels[0];dec=data['interim'];may=data['final'];growth=summary['finalPools']['growth'];pilot=summary['finalPools']['pilot'];retro=summary['finalPools']['retro']
    def report(section,name,metrics):
        d=section['source'];return dict(at=d['published'],sourceUrl=d['url'],sourceDigest=d['bodySHA256'],name=name,asOf=section.get('asOf'),metrics=metrics,kind='funding-report')
    return [
      dict(at=reg['when'],kind='funding-registration',name=project+' · Antrag',asOf=None,sourceUrl=blockurl(reg['registration']),sourceDigest=reg['blockHash'],metrics=[
           ['Gardens',f"Pool {reg['poolId']} · Proposal {reg['proposal']} · registriert auf OP Mainnet"],
           ['Antrag',amount+' · derselbe Begünstigte wie im späteren Transfer'],['IPFS-Titel',title],['CIDv0',reg['cid']],
           ['Beleg',f"Block {reg['block']} · Log {reg['logIndex']} · SHA-256 des IPFS-Blocks geprüft"]]),
      report(dec,'Zwischenbericht · Dezember 2025',[['Growth',f"{dec['growthCount']} Projekte · {usd(dec['growthUSD'])}"],
           ['Pilot',f"{dec['pilotCount']} Projekte · {usd(dec['pilotUSD'])}"],['Proaktiv',f"{dec['totalCount']} Projekte · {usd(dec['totalUSD'])}"]]),
      dict(name='Pilot-Pool · Ausschüttung auf OP Mainnet',kind='funding-transfer',at=payment['when'],asOf=None,sourceUrl=blockurl(payment['transaction']),
           sourceDigest=payment['blockHash'],metrics=[['ERC-20 Transfer',amount+' · Pilot-Pool an Begünstigten'],
           ['Distributed',f"Proposal {payment['proposal']} · gleicher Empfänger und Betrag"],
           ['OP Mainnet',f"Chain-ID {payment['chainId']} · Block {payment['block']} · Logs {payment['transferLog']} und {payment['distributionLog']}"],
           ['Projekt',project+' · bestätigt durch Registrierung und IPFS-Titel']]),
      report(may,'Abschlussbericht · Mai 2026',[['Growth-Tabelle',f"{growth['rows']} Projekte · {usd(growth['usd'])}"],
           ['Pilot-Tabelle',f"{pilot['rows']} Projekte · {usd(pilot['usd'])}"],
           ['Proaktive Tabellen',f"{summary['finalDistinctProactiveLabels']} verschiedene Projektnamen · {usd(summary['finalProactiveUSD'])}"],
           ['Fließtext',f"{may['summaryCount']} Projekte insgesamt · Pilot {may['pilotTextCount']} Projekte, {usd(may['pilotTextUSD'])}"],
           ['Retro',f"{retro['rows']} veröffentlichte Zeilen · {usd(retro['usd'])} · Berichtssumme {usd(may['summaryRetroUSD'])}"]])]
def main():
    ap=ArgumentParser(__doc__);ap.add_argument('--check',type=Path);a=ap.parse_args()
    source='// Public reports and pinned OP Mainnet receipts. Report amounts are USD. Chain amounts are DAI.\nexport const reports = '+json.dumps(build(),ensure_ascii=False,indent=2)+';\n'
    if a.check:
        if a.check.read_bytes()!=source.encode('utf-8'):raise SystemExit('Funding timeline differs from the checked evidence')
        print('Four source-bound events verified')
    else:print(source,end='')
if __name__=='__main__':main()
