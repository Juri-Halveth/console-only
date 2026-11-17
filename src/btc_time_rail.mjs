// KORRIDOT BTC 4D time rail. Source of records: existing Garden notes only.
// No Bitcoin network calls, no wall clock inference, no automatic Garden writes.
const H = /^[0-9a-f]{64}$/;
const NODE = /^BTC H([0-9]{1,12})$/;
const utc = text => {
  if (typeof text !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?\+00:00$/.test(text)) return NaN;
  const time = Date.parse(text);
  return Number.isFinite(time) ? time : NaN;
};
function token(note, key, next) {
  const match = note.match(new RegExp('(?:^|\\|)\\s*'+key+'\\s+([^|]+)'));
  return match ? match[1].trim() : next;
}

// Only records with a matching Garden branch and one attributed note qualify.
export function extractBitcoinRail(rows) {
  if (!Array.isArray(rows)) return {blocks:[], playable:false, reason:'Keine Garden-Ereignisse'};
  const notes = new Map();
  for (const row of rows) {
    if (row?.source !== 'GARTEN' || row.entry?.kind !== 'note') continue;
    const n = row.entry.name;
    if (!notes.has(n)) notes.set(n, []);
    notes.get(n).push(row.entry.text);
  }
  const blocks = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const e = row?.entry;
    if (row?.source !== 'GARTEN' || e?.kind !== 'branch' || typeof e.name !== 'string') continue;
    const found = NODE.exec(e.name);
    if (!found) continue;
    const desc = notes.get(e.name);
    if (!desc || desc.length !== 1 || typeof desc[0] !== 'string') continue;
    const note = desc[0];
    const height = Number(found[1]);
    const parsedHeight = Number(token(note, 'Hoehe', 'NaN'));
    const hash = token(note, 'Hash', '');
    const previous = token(note, 'Vorgaenger', '');
    const time = token(note, 'Blockzeit UTC', '');
    const timeMs = utc(time);
    if (!Number.isSafeInteger(height) || parsedHeight !== height || !H.test(hash) || !H.test(previous) ||
        !Number.isFinite(timeMs) || !note.includes('BITCOIN BLOCKHEADER') ||
        !note.includes('Header-PoW-Pruefung OK')) continue;
    blocks.push({index,key:row.key,height,name:e.name,parent:e.parent,hash,previous,time,timeMs});
  }
  blocks.sort((a,b)=>a.height-b.height);
  if (blocks.length < 2) return {blocks,playable:false,reason:'Weniger als zwei Blockheader mit Garden-Quellenbeleg'};
  // A valid Bitcoin header can have an older timestamp than its predecessor.
  // If so, do not silently invent a chronological interval for this demo.
  for (let i=1;i<blocks.length;i++) {
    const old=blocks[i-1], now=blocks[i];
    if (now.height !== old.height+1 || now.previous !== old.hash || now.parent !== old.name) {
      return {blocks,playable:false,reason:'Luecke oder Widerspruch in Hash-Vorgaengern'};
    }
    if (now.timeMs <= old.timeMs) {
      return {blocks,playable:false,reason:'BTC-Headerzeit nicht streng steigend; keine erfundene Zeitinterpolation'};
    }
  }
  return {blocks,playable:true,reason:'BTC-Blockzeiten und Hash-Vorgaenger passen zum Garden-Abbild'};
}

export function sampleBitcoinRail(blocks, timeMs) {
  if (!Array.isArray(blocks) || blocks.length < 2 || !Number.isFinite(timeMs)) return null;
  const first=blocks[0], last=blocks[blocks.length-1];
  const t=Math.max(first.timeMs,Math.min(last.timeMs,timeMs));
  let i=0;
  while (i < blocks.length-2 && t>blocks[i+1].timeMs) i++;
  const a=blocks[i], b=blocks[i+1];
  const duration=b.timeMs-a.timeMs;
  if (!(duration>0)) return null;
  const f=Math.max(0,Math.min(1,(t-a.timeMs)/duration));
  if (![a.position?.x,a.position?.y,a.position?.z,b.position?.x,b.position?.y,b.position?.z].every(Number.isFinite)) return null;
  return {
    x:a.position.x+(b.position.x-a.position.x)*f,
    y:a.position.y+(b.position.y-a.position.y)*f,
    z:a.position.z+(b.position.z-a.position.z)*f,
    from:a.height,to:b.height,fraction:f,timeMs:t
  };
}

export function formatBitcoinUTC(timeMs) {
  if (!Number.isFinite(timeMs)) return 'Zeit unbekannt';
  return new Date(timeMs).toISOString().replace('T',' ').slice(0,19) + ' UTC';
}
