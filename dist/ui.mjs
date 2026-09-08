export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}

export function showToast(element,text,duration=4500){element.textContent=text;element.className='visible';clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>element.className='',duration)}
