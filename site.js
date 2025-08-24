const $=(s,d=document)=>d.querySelector(s);const $$=(s,d=document)=>[...d.querySelectorAll(s)];
function year(){const y=$('#year'); if(y) y.textContent=new Date().getFullYear();}
async function j(url){ const r=await fetch(url); return r.json(); }
function money(v){ return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }

async function loadHome(){
  year();
  const cfg = await j('/api/config'); if(cfg){
    $('#storeName').textContent = cfg.storeName||'TEC Games';
    $('#tagline').textContent = cfg.tagline||$('#tagline').textContent;
  }
  const f = await j('/api/listings?featured=true');
  $('#featured').innerHTML = (f.items||[]).slice(0,3).map(it=>`
    <div class="card">
      <div class="badge">${it.category}</div>
      <h4>${it.title}</h4>
      <div class="price">${money(it.price)}</div>
      <a class="btn" href="produto.html?id=${it.id}">Ver</a>
    </div>`).join('');

  const cats = await j('/api/categories');
  $('#cats').innerHTML = (cats||[]).map(c=>`
    <a class="card" href="categorias.html?c=${encodeURIComponent(c)}"><strong>${c}</strong><div class="muted">ver anúncios</div></a>`).join('');

  const p = await j('/api/listings?sort=popular');
  $('#popular').innerHTML = (p.items||[]).slice(0,8).map(it=>`
    <article class="card">
      <div class="badge">${it.category}</div>
      <h3>${it.title}</h3>
      <div class="muted">${it.vendorName||'Vendedor'}</div>
      <div class="price">${money(it.price)}</div>
      <a class="btn" href="produto.html?id=${it.id}">Ver</a>
    </article>`).join('');

  $('#reviews').innerHTML = (await j('/api/reviews')).slice(0,3).map(r=>`
    <div class="card"><strong>★ ${r.rating.toFixed(1)}</strong><p class="muted">${r.comment}</p><div class="muted">por ${r.user}</div></div>`).join('');
}
document.addEventListener('DOMContentLoaded', loadHome);
