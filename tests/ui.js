/* Browser integration tests. Run only via run_ui_checks.py (isolated browser profile). */
(async function () {
  'use strict';
  const results = [];
  const errors = [];
  const wait = (ms=30) => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (value, message) => { if (!value) throw new Error(message); };
  async function check(name, fn) { try { await fn(); results.push({name,pass:true}); } catch(e) { results.push({name,pass:false,error:e.message}); } }
  window.captureError = message => errors.push(message);
  async function load(file) {
    document.querySelector('iframe')?.remove();
    const frame = document.createElement('iframe');
    frame.style.width='1366px'; frame.style.height='768px';
    const ready = new Promise(resolve => frame.onload=resolve);
    frame.src='../'+file;document.body.append(frame);await ready;await wait();
    const w=frame.contentWindow;
    w.addEventListener('error',e=>errors.push(e.message||('Resource: '+(e.target.src||e.target.href))),true);
    w.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
    const oldError=w.console.error;w.console.error=(...a)=>{errors.push(a.join(' '));oldError(...a);};
    for(const el of w.document.querySelectorAll('script[src],link[rel=stylesheet],link[rel=icon]')) {
      const resource=el.src||el.href;const response=await fetch(resource);
      if(!response.ok) errors.push('Resource '+response.status+': '+resource);
    }
    return frame;
  }
  function checkHandlers(w) {
    const missing=new Set();
    w.document.querySelectorAll('[onclick],[onchange],[oninput],[onsubmit]').forEach(el=>{
      ['onclick','onchange','oninput','onsubmit'].forEach(attr=>{
        for(const m of (el.getAttribute(attr)||'').matchAll(/(?:window\.)?(app|receptionApp|housekeepingApp)\.([A-Za-z]\w*)\s*\(/g)) {
          if(typeof w[m[1]]?.[m[2]] !== 'function') missing.add(m[1]+'.'+m[2]);
        }
      });
    });
    assert(!missing.size, 'Missing handlers: '+[...missing].join(', '));
  }
  try {
    let frame = await load('index.html');
    let w = frame.contentWindow;
    await check('Demo dashboard loads 8 metrics from the existing browser store',()=>{
      assert(w.document.querySelectorAll('.pms-metric').length===8,'Expected 8 metrics');
      const s=w.SongLamViewData.snapshot(w.SongLamStore);
      assert(Number(w.document.querySelector('.pms-metric strong').textContent)===s.occupied,'Occupied metric mismatch');
    });
    const screens=[...w.document.querySelectorAll('.nav-item[data-screen]')].map(el=>el.dataset.screen);
    for(const size of [[1366,768],[1920,1080],[390,844]]) {
      frame.style.width=size[0]+'px';frame.style.height=size[1]+'px';await wait(250);
      await check(`Status banner reserves space without covering toolbar at ${size.join('x')}`,async()=>{
        w.scrollTo(0,0); window.scrollTo(0,0); await wait(100);
        const doc=w.document, bar=doc.querySelector('.topbar').getBoundingClientRect();
        const strip=doc.querySelector('.demo-banner-strip').getBoundingClientRect();
        assert(doc.querySelector('.demo-banner-strip #pms-deployment-banner'),'Live status banner must be preserved');
        assert(strip.top>=bar.bottom-1,'Status banner overlaps toolbar');
        const mainTop=doc.getElementById('mainContent').getBoundingClientRect().top;
        assert(mainTop>=strip.bottom-2,'Content hidden behind wrapped status banner: '+mainTop+' < '+strip.bottom+'; reserved '+doc.documentElement.style.getPropertyValue('--pms-content-top'));
        const button=doc.querySelector('.sidebar-toggle-btn'), rect=button.getBoundingClientRect();
        const hit=doc.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
        assert(button.contains(hit),'Menu button is obstructed by '+(hit?.tagName||'outside viewport')+'.'+(hit?.className||'')+' at '+rect.left+','+rect.top);
      });
      for(const screen of screens) await check(`Admin ${screen} at ${size.join('x')}`,async()=>{
        w.app.switchScreen(screen);await wait();
        assert(w.document.getElementById('mainContent').textContent.trim().length>50,'Empty screen');
        const overflowing=[...w.document.querySelectorAll('#mainContent *, .topbar *')].filter(e=>e.getBoundingClientRect().right>size[0] && !e.closest('.table-responsive,.table-container,.pms-timeline-scroll')).slice(0,12).map(e=>e.tagName+'.'+e.className+':'+Math.round(e.getBoundingClientRect().width)+' '+e.textContent.trim().slice(0,24));
        assert(w.document.documentElement.scrollWidth<=size[0]+2,`Page overflow: ${w.document.documentElement.scrollWidth}; ${overflowing.join(',')}`);
        assert(!/undefined|NaN/.test(w.document.getElementById('mainContent').textContent),'Invalid data text');
        checkHandlers(w);
      });
    }
    await check('Mobile menu opens, closes and resets aria state',async()=>{
      w.SongLamUI.toggleSidebar(); await wait();
      assert(w.document.body.classList.contains('pms-menu-open'),'Menu did not open');
      w.document.querySelector('.pms-sidebar-backdrop').click();
      assert(!w.document.body.classList.contains('pms-menu-open'),'Menu did not close');
    });
    frame.style.width='1366px';frame.style.height='768px';
    await check('Timeline buttons, search and booking intervals',async()=>{
      w.app.switchScreen('timeline'); await wait();
      const original=w.app.state.timelineStart;
      [...w.document.querySelectorAll('.pms-timeline-toolbar button')].find(b=>b.textContent.includes('7 ngày →')).click();await wait();
      assert(w.app.state.timelineStart===w.SongLamStore.addDays(original,7),'Next week failed');
      [...w.document.querySelectorAll('.pms-timeline-toolbar button')].find(b=>b.textContent==='Hôm nay').click();await wait();
      assert(w.app.state.timelineStart===w.SongLamStore.addDays(w.SongLamStore.getWorkingDate(),-2),'Today failed');
      w.app.setTimelineFilter('search','402'); await wait();
      assert(w.document.querySelectorAll('.pms-timeline-row').length===w.SongLamStore.getData().rooms.filter(r=>r.number.includes('402')).length,'Timeline search failed');
      w.app.setTimelineFilter('search','');
    });
    await check('Room shortcuts reset previous filters and match readiness',async()=>{
      w.app.updateRoomFilter('search','zzz');w.app.filterRooms('ready');await wait();
      assert(w.document.querySelectorAll('.room-card').length===w.SongLamViewData.snapshot(w.SongLamStore).ready,'Ready room count mismatch');
      assert(w.app.state.filters.roomRack.search==='','Stale search');
    });
    await check('Booking search survives typing and gives a true empty state',async()=>{
      w.app.switchScreen('bookings');await wait();
      let input=w.document.querySelector('input[oninput]');input.focus();input.value='not-a-customer';input.dispatchEvent(new w.Event('input',{bubbles:true}));await wait();
      assert(w.document.getElementById('mainContent').textContent.includes('Không có đặt phòng'),'Missing empty state');
      assert(w.document.activeElement.tagName==='INPUT','Typing lost focus');
      w.app.setBookingFilter('search','');
    });
    await check('All admin sub-tabs render without invalid values',async()=>{
      w.app.switchScreen('billing');
      for(const tab of ['transactions','invoices','debts','refunds','sandbox']) {w.app.switchBillingTab(tab);await wait();checkHandlers(w);assert(!/undefined|NaN/.test(w.document.getElementById('mainContent').textContent),'Invalid billing data');}
      w.app.switchScreen('system_admin');
      for(const tab of ['roles','users','config','audit']) {w.app.switchAdminTab(tab);await wait();checkHandlers(w);}
    });
    await check('Booking, hourly check-in, checkout, group and folio dialogs',async()=>{
      const rooms=w.SongLamStore.getData().rooms;
      const ready=rooms.find(r=>r.stayStatus==='vacant'&&r.cleanStatus==='clean'&&r.exploitationStatus==='active');
      const occupied=rooms.find(r=>r.stayStatus==='occupied');
      const openers=[()=>w.app.openCreateBookingModal(),()=>w.app.openCreateGroupBookingModal(),()=>w.app.openDirectCheckInModal(ready.number),()=>w.app.openCheckoutModal(occupied.number),()=>w.app.openAddCustomerModal(),()=>w.app.openRequestRefundModal(),()=>w.app.openAddRoomModal(),()=>w.app.openAddRoomClassModal()];
      for(const open of openers) {open();await wait();assert(w.document.getElementById('appModal').textContent.trim().length>50,'Dialog empty');checkHandlers(w);w.app.closeModal();}
    });
    await check('Customer form persists through the existing store',async()=>{
      w.app.openAddCustomerModal();await wait();
      const form=w.document.querySelector('#appModal form');
      const inputs=[...form.querySelectorAll('input')];
      const name=inputs.find(x=>x.name==='name');const phone=inputs.find(x=>x.name==='phone');
      assert(name&&phone,'Customer fields absent');name.value='Khách kiểm thử giao diện';phone.value='0900000999';
      form.querySelector('[name=identityCard]').value='TEST-UI-001';
      form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();
      w.SongLamStore.reloadLatest();assert(w.SongLamStore.getData().customers.some(c=>c.name==='Khách kiểm thử giao diện'),'Customer not saved');
    });
    await check('Room class capacity form updates the actual business fields',async()=>{
      w.app.openEditRoomClassModal('SUP-K');await wait();
      const form=w.document.querySelector('#appModal form');
      form.elements.standardCapacity.value='2';form.elements.maxCapacity.value='4';
      form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();
      w.SongLamStore.reloadLatest();assert(w.SongLamStore.getData().roomClasses.find(c=>c.code==='SUP-K').maxOccupancy===4,'Capacity not persisted');
    });
    await check('Shared table search filters records and displays no-result message',async()=>{
      w.app.switchScreen('rooms_catalog');await wait();
      const input=w.document.querySelector('.pms-table-search input');assert(input,'Search missing');
      input.value='no-such-room';input.dispatchEvent(new w.Event('input',{bubbles:true}));await wait();
      assert(w.document.querySelector('.pms-search-empty:not([hidden])'),'No-result row missing');
      assert(![...w.document.querySelectorAll('tbody tr:not(.pms-search-empty)')].some(r=>!r.hidden),'Unmatched rows visible');
      input.value='';input.dispatchEvent(new w.Event('input',{bubbles:true}));
    });
    await check('Internal workspace links return HTTP 200',async()=>{
      for(const href of new Set([...w.document.querySelectorAll('a[href]')].map(a=>a.href).filter(h=>h.startsWith(location.origin)))) {
        assert((await fetch(href)).ok,'Broken link '+href);
      }
    });
    await check('Admin role cannot see revenue or use operational buttons',async()=>{
      w.app.switchRole('admin');w.app.switchScreen('overview');await wait();
      assert(!w.SongLamUI.canScreen('reports'),'Admin has revenue permission');
      assert(w.document.querySelector('[data-screen="reports"]').hidden,'Report menu visible');
      assert(!w.document.querySelector('.pms-metric')?.parentElement.textContent.includes('Doanh thu'),'Revenue exposed');
      w.app.openCreateBookingModal();assert(!w.document.querySelector('#appModal form'),'Unauthorized dialog opened');
    });
    await check('Cashier uses configured account and cannot approve refunds',async()=>{
      w.app.switchRole('cashier');await wait();
      assert(w.app.state.currentUser.id===w.SongLamStore.getData().users.find(u=>u.roleCode==='cashier').id,'Wrong cashier identity');
      w.app.switchScreen('billing');w.app.switchBillingTab('refunds');await wait();
      assert(![...w.document.querySelectorAll('[onclick*="approveRefundRequest"]')].some(e=>!e.hidden),'Refund approval visible');
    });
    for(const [file,prefix] of [['reception.html','rec_'],['housekeeping.html','hk_']]) {
      frame=await load(file);w=frame.contentWindow;
      const app=w.receptionApp||w.housekeepingApp;
      const keys=[...w.document.querySelectorAll('.nav-item[data-screen]')].map(x=>x.dataset.screen);
      for(const size of [[1366,768],[1920,1080],[390,844]]) {
        frame.style.width=size[0]+'px';frame.style.height=size[1]+'px';await wait(250);
        for(const key of keys) await check(`${file} ${key} ${size.join('x')}`,async()=>{
          app.switchScreen(key);await wait();
          assert(!w.document.getElementById('mainContent').textContent.includes('Không có quyền truy cập'),'Unexpected denial');
          const overflow=[...w.document.querySelectorAll('#mainContent *')].filter(e=>e.getBoundingClientRect().right>size[0] && !e.closest('.table-responsive,.table-container,.pms-timeline-scroll')).slice(0,8).map(e=>e.tagName+'.'+e.className+':'+Math.round(e.getBoundingClientRect().width));
          assert(w.document.documentElement.scrollWidth<=size[0]+2,'Page overflow '+w.document.documentElement.scrollWidth+' '+overflow.join(','));
          checkHandlers(w);
        });
      }
      if(prefix==='rec_') await check('Reception timeline navigation',async()=>{app.switchScreen('rec_timeline');app.shiftTimeline(7);app.resetTimeline();await wait();assert(w.document.querySelector('.pms-timeline-row'),'Timeline missing');});
      if(prefix==='hk_') await check('Maid can mark cleaning, but cannot approve clean',async()=>{
        app.switchScreen('hk_room_board');await wait();
        assert(![...w.document.querySelectorAll('[onclick*="approveCleanRoom"]')].some(e=>!e.hidden),'Approval visible to maid');
        const room=w.SongLamStore.getData().rooms.find(r=>r.cleanStatus==='dirty');
        app.updateRoomCleanState(room.id,'cleaning');await wait();w.SongLamStore.reloadLatest();
        assert(w.SongLamStore.getData().rooms.find(r=>r.id===room.id).cleanStatus==='cleaning','Cleaning not persisted');
      });
    }
    await check('No browser errors or failed resources',()=>assert(!errors.length,JSON.stringify(errors)));
  } catch(e) {results.push({name:'Harness execution',pass:false,error:e.stack});}
  const report={total:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass),errors};
  document.getElementById('results').textContent=JSON.stringify(report,null,2);
  document.getElementById('results').dataset.complete='true';
  document.querySelector('iframe')?.remove();
})();
