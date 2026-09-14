// Shared result markup keeps party-image corrections independent from recognition transport.
export function renderPartyPokemonMatches(target,rows,slot,escapeHtml){
 target.innerHTML=rows.map(p=>`<button class="pickrow" data-ocrcandidate="${slot}" data-name="${escapeHtml(p.name)}"><span>${escapeHtml(p.name)}</span><small>${p.rank}위 · ${escapeHtml(p.types.join(' / '))}</small></button>`).join('')||'<p>검색 결과가 없습니다.</p>';
}
