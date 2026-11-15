/* Presentation only: no SQL calls, session changes or business data mutations. */
(function(){
 'use strict';
 const names={admin:'Quản trị',reception:'Lễ tân',housekeeping:'Buồng phòng'};
 const pages={admin:'index.html',reception:'reception.html',housekeeping:'housekeeping.html'};
 function mount(){
  const area=document.body.dataset.naPortal;
  if(!area)return true;
  const sidebar=document.querySelector('.sidebar')||document.querySelector('.ops-sidebar');
  const top=document.querySelector('.topbar')||document.querySelector('.ops-topbar');
  if(!sidebar||!top)return false;
  if(sidebar.dataset.naMounted==='true')return true;
  const brand=sidebar.querySelector('.pms-brand');
  if(document.body.classList.contains('na-portal')&&!brand)return false;
  if(!document.body.classList.contains('na-portal')&&!document.body.classList.contains('sl-api-workspace'))return false;
  sidebar.dataset.naMounted='true';
  if(brand){
   const mark=brand.querySelector('.pms-brand-mark');
   if(mark){mark.replaceChildren();const icon=document.createElement('i');icon.className='bi bi-building';icon.setAttribute('aria-hidden','true');mark.append(icon);}
   const title=brand.querySelector('strong');if(title)title.textContent='SongLam PMS';
   top.prepend(brand);
  }
  const key='songlam.niceadmin.sidebar.'+area;
  try{sidebar.scrollTop=Number(sessionStorage.getItem(key))||0;}catch(_){}
  const save=()=>{try{sessionStorage.setItem(key,String(sidebar.scrollTop));}catch(_){}};
  sidebar.addEventListener('scroll',save,{passive:true});sidebar.addEventListener('click',save);
  sidebar.querySelectorAll('.sidebar-footer a').forEach(a=>{if(a.getAttribute('href')===pages[area])a.setAttribute('aria-current','page');});
  if(document.body.classList.contains('na-portal')){
   const switcher=document.createElement('details');switcher.className='na-portal-switch';
   const summary=document.createElement('summary');summary.textContent=names[area]+' ▾';switcher.append(summary);
   const nav=document.createElement('nav');nav.setAttribute('aria-label','Ba giao diện riêng');
   for(const [id,label]of Object.entries(names)){const a=document.createElement('a');a.href=pages[id];a.textContent=label;if(id===area)a.setAttribute('aria-current','page');nav.append(a);}
   const all=document.createElement('a');all.href='XEM-GIAO-DIEN.html';all.textContent='Chọn giao diện';nav.append(all);switcher.append(nav);
   const end=top.querySelector('.pms-topbar-end');if(end)end.prepend(switcher);else top.append(switcher);
   document.addEventListener('click',e=>{if(!switcher.contains(e.target))switcher.open=false;});
   document.addEventListener('keydown',e=>{if(e.key==='Escape'&&switcher.open){switcher.open=false;summary.focus();}});
  }
  return true;
 }
 function ready(){
  let observer;
  const attempt=()=>{if(mount())observer?.disconnect();};
  observer=new MutationObserver(attempt);
  observer.observe(document.body,{childList:true,subtree:true});
  attempt();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
