import fs from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const master = JSON.parse(await fs.readFile(new URL('dist/data.json', ROOT), 'utf8')).master.moves;
const source = 'https://pokemon.yodams.com/dex/move';
const headers = {'user-agent': 'Googlebot'};
const decode = value => String(value)
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

const indexHtml = await (await fetch(source, {headers})).text();
const links = new Map();
for (const match of indexHtml.matchAll(/<a[^>]+href="(\/dex\/move\/[^"?#]+\/?)[^"']*"[^>]*>([\s\S]*?)<\/a>/g)) {
  const name = decode(match[2]);
  if (name) links.set(name, new URL(match[1], source).href);
}

const details = {};
const failures = [];
const matches = (text, pattern) => pattern.test(String(text));
const traitsFor = (name, effect) => {
  const performance = [];
  if (matches(effect, /우선도|먼저 공격/) || matches(name, /마하펀치|불릿펀치|신속|아쿠아제트|액셀록|야습|얼음뭉치|전광석화|제트펀치|진공파|기습|속이기|만나자마자|물수리검/)) performance.push('선공');
  if (matches(effect, /상대 전체|상대 2마리|주위의 포켓몬|모든 포켓몬|전체를 공격/)) performance.push('광역');
  if (matches(effect, /(?:2|3|4|5)[~～-](?:3|5)회|(?:2|3|4|5)회 연속|연속으로 공격/)) performance.push('연격');
  const properties = [];
  if (matches(name, /가루|포자/)) properties.push('가루');
  if (matches(name, /구슬|파동|폭탄|캐논|웨더볼|에너지볼|자이로볼|일렉트릭볼|미스트볼|섀도볼/)) properties.push('구슬·파동');
  if (matches(name, /바람|폭풍|열풍|눈보라|순풍|에어커터|에어슬래시|봄의폭풍|모래지옥/)) properties.push('바람');
  if (matches(name, /베기|커터|블레이드|성스러운칼|원념의칼|깜짝베기|시저크로스|에어슬래시|사이코커터|셸블레이드/)) properties.push('베기');
  if (matches(name, /노래|보이스|소리|폭음파|바크아웃|벌레의야단법석|오버드라이브|스케일노이즈|울부짖기|부르짖기|금속음|싫은소리/)) properties.push('소리');
  if (matches(name, /춤|댄스/)) properties.push('춤');
  if (matches(name, /펀치|암해머|집게해머|스카이업퍼|플라스마피스트/)) properties.push('펀치');
  return {performance, properties};
};
let cursor = 0;
async function worker() {
  while (cursor < master.length) {
    const entry = master[cursor++];
    const name = entry[0], url = links.get(name);
    if (!url) { failures.push({name, reason: 'index-link-missing'}); continue; }
    try {
      const response = await fetch(url, {headers});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const parsed = decode(html.match(/<th>효과<\/th>\s*<td>([\s\S]*?)<\/td>/)?.[1] || '');
      const effect = parsed || (entry[3] === '변화' ? '상태 변화 기술. 별도의 효과 설명이 제공되지 않았다.' : '통상 공격 기술. 별도의 추가 효과가 없다.');
      details[name] = {effect, url, ...traitsFor(name, effect)};
    } catch (error) {
      failures.push({name, reason: String(error.message || error)});
    }
  }
}
await Promise.all(Array.from({length: 8}, worker));
const output = {source, builtAt: new Date().toISOString(), total: master.length, count: Object.keys(details).length, failures, details};
await fs.writeFile(new URL('dist/move-details.json', ROOT), JSON.stringify(output, null, 2) + '\n');
console.log(`wrote ${output.count}/${output.total}; failures=${failures.length}`);
