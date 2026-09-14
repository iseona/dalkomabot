// Keep correction controls identical to the party-image correction list.
export function renderLeadPokemonMatches(target,rows,side,slot,escapeHtml){
 target.innerHTML=rows.map(p=>`<button class="pickrow" data-leadside="${side}" data-leadindex="${slot}" data-leadname="${escapeHtml(p.name)}"><span>${escapeHtml(p.name)}</span><small>${p.rank}위 · ${escapeHtml(p.types.join(' / '))}</small></button>`).join('')||'<small>검색 결과가 없습니다.</small>';
}
