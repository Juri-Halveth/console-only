"""Reproduce reported GG24 Public Goods Tooling allocations, offline by default."""
from argparse import ArgumentParser
from datetime import datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
import json
import re

ROOT = Path(__file__).resolve().parent
REPORTS = {
    'interim': (24912, 55951, 'gg24-public-goods-tooling-development-round-december-2025-progress-report'),
    'final': (25276, 56689, 'gg24-public-goods-tooling-development-round-full-retrospective'),
}

def digest(data):
    return sha256(data).hexdigest()

def money(text):
    if text == '0': return 0
    if not re.fullmatch(r'\$(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)', text):
        raise ValueError('Invalid whole USD amount: '+text)
    return int(text[1:].replace(',',''))

class Tables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables, self.prose = [], []
        self.heading, self.current, self.cell, self.row, self.text = '', None, None, None, None

    def handle_starttag(self, tag, attrs):
        if tag in ('h1','h2','h3','h4','p','li'): self.text = []
        if tag == 'table':
            self.current = {'heading': self.heading, 'rows': []}
            self.tables.append(self.current)
        if self.current is not None:
            if tag == 'tr': self.row = []
            if tag in ('td','th'): self.cell = []

    def handle_data(self, data):
        if self.cell is not None: self.cell.append(data)
        if self.text is not None: self.text.append(data)

    def handle_endtag(self, tag):
        if tag in ('td','th') and self.cell is not None:
            self.row.append(' '.join(''.join(self.cell).split()))
            self.cell = None
        if tag == 'tr' and self.row is not None:
            self.current['rows'].append(self.row); self.row = None
        if tag == 'table': self.current = None
        if tag in ('h1','h2','h3','h4','p','li') and self.text is not None:
            value=' '.join(''.join(self.text).split()); self.text=None
            if value: self.prose.append(value)
            if tag.startswith('h'): self.heading=value

def match(text, pattern):
    matches = re.findall(pattern, text, re.I)
    if len(matches)!=1: raise ValueError('Source wording changed or ambiguous: '+pattern)
    return matches[0]

def extract(which, post):
    topic, post_id, slug = REPORTS[which]
    if post['id'] != post_id or post['post_number'] != 1 or post['topic_id'] != topic:
        raise ValueError('Unexpected source post')
    html=post['cooked']; parser=Tables(); parser.feed(html); text='\n'.join(parser.prose)
    meta = dict(topic=topic,post=post_id,version=post['version'],published=post['created_at'],
                updated=post['updated_at'],bodySHA256=digest(html.encode('utf-8')),
                url=f'https://gov.gitcoin.co/t/{slug}/{topic}/1')
    if which=='interim':
        count,amount=match(text,r'Pilot Pool:\s*\d+ proposals \((\d+) funded\)\s*[-–]\s*(\$[\d,]+) allocated')
        gcount,gamount=match(text,r'Growth Pool:\s*\d+ proposals \((\d+) funded\)\s*[-–]\s*(\$[\d,]+) allocated')
        total,n=match(text,r'Total proactive funding:\s*(\$[\d,]+) across (\d+) projects')
        day=match(text,r'Program Stats \(As of ([A-Za-z]+ \d+, \d{4})\)')
        return dict(source=meta,asOf=datetime.strptime(day,'%B %d, %Y').date().isoformat(),
                    growthCount=int(gcount),growthUSD=money(gamount),pilotCount=int(count),pilotUSD=money(amount),
                    totalCount=int(n),totalUSD=money(total))
    tables={}
    for group,title in [('growth','Growth Pool'),('pilot','Pilot Pool'),('retro','Retroactive Funding')]:
        table,=[t for t in parser.tables if t['heading'].startswith(title+' (')]
        headers,*rows=table['rows']
        amount_i=headers.index('Retro Funding' if group=='retro' else 'Amount')
        projects=[]; totals=[]
        for row in rows:
            if len(row)!=len(headers): raise ValueError('Unexpected table row')
            n=row[0]; a=money(row[amount_i])
            if n.lower()=='total': totals.append(a)
            else: projects.append([n,a])
        if len(totals) != int(group!='retro'): raise ValueError('Unexpected total rows')
        tables[group]={'rows':projects,'totalRowUSD':totals[0] if totals else None}
    n=match(text,r'in proactive funding to (\d+) projects')
    pc,pa=match(text,r'(Four|Five) proposals were funded, (?:[^.\n]*?)(\$[\d,]+)')
    prose_total=match(text,r'distributing (\$[\d,]+) in proactive funding')
    retro=match(text,r'awarding (\$[\d,]+) in performance-based retro funding')
    return dict(source=meta,summaryCount=int(n),summaryProactiveUSD=money(prose_total),
                pilotTextCount={'four':4,'five':5}[pc.lower()],pilotTextUSD=money(pa),
                summaryRetroUSD=money(retro),tables=tables)

def read_live():
    result={}
    for which,(tid,_,_) in REPORTS.items():
        q=Request(f'https://gov.gitcoin.co/t/{tid}.json',headers={'User-Agent':'HALVETH-public-report-reader/1.0','Accept':'application/json'})
        with urlopen(q,timeout=18) as response:
            data=json.load(response)
        post,=[post for post in data['post_stream']['posts'] if post['post_number']==1]
        result[which]=extract(which,post)
    return result

def summarize(data):
    dec,may=data['interim'],data['final']
    if dec['growthUSD']+dec['pilotUSD']!=dec['totalUSD'] or dec['growthCount']+dec['pilotCount']!=dec['totalCount']:
        raise ValueError('Interim pool totals disagree')
    pools={}
    for key,table in may['tables'].items():
        names=[row[0] for row in table['rows']]
        if len(set(names))!=len(names): raise ValueError('Repeated project label in '+key)
        amount=sum(row[1] for row in table['rows'])
        if table['totalRowUSD'] is not None and table['totalRowUSD']!=amount: raise ValueError('Displayed total differs in '+key)
        pools[key]={'rows':len(names),'usd':amount}
    awarded=[name for pool in ('growth','pilot') for name,_ in may['tables'][pool]['rows']]
    return {'currency':'USD','sourceType':'published reports','interim':{'asOf':dec['asOf'],'rows':dec['totalCount'],'usd':dec['totalUSD']},
            'finalPools':pools,'finalDistinctProactiveLabels':len(set(awarded)),
            'finalProactiveUSD':pools['growth']['usd']+pools['pilot']['usd'],
            'finalProactiveTextCount':may['summaryCount'],'finalPilotTextCount':may['pilotTextCount'],'finalPilotTextUSD':may['pilotTextUSD'],
            'finalProactiveTextUSD':may['summaryProactiveUSD'],'displayedRetroDeltaUSD':pools['retro']['usd']-may['summaryRetroUSD'],
            'transactionsChecked':0}

def main():
    ap=ArgumentParser(__doc__);ap.add_argument('--verify-live',action='store_true');a=ap.parse_args()
    snap=ROOT/'QUELLZAHLEN.json';data=json.loads(snap.read_bytes());summary=summarize(data)
    if a.verify_live:
        live=read_live()
        if live!=data: raise SystemExit('Public sources differ from the recorded snapshot. Compare the two source revisions.')
    print(json.dumps(summary,indent=2,ensure_ascii=False))
if __name__=='__main__': main()
