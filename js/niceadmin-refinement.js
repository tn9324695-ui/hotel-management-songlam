/* UI labels, grouping and feedback only. Existing event handlers own all actions. */
(function(){
 'use strict';
 const screens={overview:'Tổng quan',room_rack:'Sơ đồ phòng',timeline:'Lịch đặt phòng',bookings:'Đặt phòng',stays:'Khách đang lưu trú',customers:'Khách hàng',room_classes:'Hạng phòng',rooms_catalog:'Danh sách phòng',rates_policies:'Bảng giá & chính sách',services_catalog:'Dịch vụ & minibar',housekeeping:'Buồng phòng',billing:'Thanh toán & hóa đơn',reports:'Báo cáo',system_admin:'Tài khoản & quyền',exceptions:'Ngoại lệ',shifts_audit:'Chốt ca & ngày',rec_room_rack:'Sơ đồ phòng',rec_timeline:'Lịch đặt phòng',rec_arrivals:'Khách đến',rec_departures:'Khách trả phòng',rec_bookings:'Đặt phòng',rec_stays:'Khách đang lưu trú',rec_services:'Dịch vụ',hk_room_board:'Tình trạng phòng',hk_task_list:'Công việc',hk_minibar_check:'Kiểm minibar',hk_maintenance_reports:'Sự cố phòng',hk_lost_found:'Đồ thất lạc'};
 const areas={admin:'Quản trị',reception:'Lễ tân',housekeeping:'Buồng phòng'};
 const labels={'Tạo đơn đặt phòng mới':'Tạo đặt phòng','Xác nhận tạo đơn':'Tạo đặt phòng','Đặt phòng mới':'Tạo đặt phòng','Nhận phòng nhanh (Walk-in)':'Nhận phòng nhanh','Thêm Hạng phòng mới':'Thêm hạng phòng','Thêm hạng phòng mới':'Thêm hạng phòng','Thêm phòng mới':'Thêm phòng','Thêm dịch vụ mới':'Thêm dịch vụ','Hồ sơ khách & Khách đoàn':'Khách hàng','Báo cáo & Doanh thu':'Báo cáo','Quản trị & Phân quyền':'Tài khoản & quyền','Ngoại lệ & Tranh chấp':'Ngoại lệ','Chốt ca & Chốt ngày':'Chốt ca & ngày','MÃ ĐƠN':'Mã đơn','KHÁCH ĐẠI DIỆN':'Khách đại diện','ĐIỆN THOẠI':'Điện thoại','THỜI GIAN LƯU TRÚ':'Thời gian lưu trú','SỐ ĐÊM':'Số đêm','HẠNG PHÒNG':'Hạng phòng','SỐ LƯỢNG':'Số lượng','TỔNG TIỀN DỰ KIẾN':'Tổng dự kiến','TIỀN CỌC GHI NHẬN':'Tiền cọc','TRẠNG THÁI':'Trạng thái','THAO TÁC':'Thao tác'};
 const normalized=el=>(el.textContent||'').replace(/\s+/g,' ').trim();
 function setLabel(el,label){
  if(normalized(el)===label)return;
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const nodes=[];let n;
  while((n=walker.nextNode()))if(n.textContent.trim()&&!n.parentElement.closest('svg'))nodes.push(n);
  if(nodes.length){nodes[0].textContent=label;for(const extra of nodes.slice(1))extra.textContent='';}
 }
 function section(body,row,text){
  if(!row||!body.contains(row)||row.previousElementSibling?.classList.contains('na-form-section'))return;
  const h=document.createElement('h3');h.className='na-form-section';h.textContent=text;row.before(h);
 }
 function boot(){
  const main=document.querySelector('#mainContent,.ops-main');if(!main)return;
  const area=areas[document.body.dataset.naPortal]||'SongLam PMS';
  let pending=false,lastHeading=null,dialogNumber=0,fieldNumber=0;
  function enhance(){
   pending=false;
   const quick=main.querySelector(':scope > .rec-quick-actions-bar');
   if(quick&&!quick.classList.contains('page-header')){
    quick.classList.add('page-header');
    const box=quick.firstElementChild;box?.classList.add('page-title-box');
    box?.firstElementChild?.classList.add('page-title');
    if(box?.children[1])box.children[1].classList.add('page-breadcrumb');
    quick.children[1]?.classList.add('page-actions');
   }
   const header=main.querySelector('.page-header,.pms-page-heading,.ops-heading');
   const title=header?.querySelector('h1,.page-title');
   const screen=document.body.dataset.screen;
   if(title&&screens[screen])setLabel(title,screens[screen]);
   if(title&&title.tagName!=='H1'){title.setAttribute('role','heading');title.setAttribute('aria-level','1');}
   if(header&&!main.querySelector(':scope > .na-breadcrumb')){
    const nav=document.createElement('nav');nav.className='na-breadcrumb';nav.setAttribute('aria-label','Đường dẫn');
    const a=document.createElement('a');a.href='XEM-GIAO-DIEN.html';a.textContent='SongLam PMS';nav.append(a);
    const sep=document.createElement('span');sep.textContent='/';nav.append(sep);
    const current=document.createElement('span');current.textContent=area;nav.append(current);header.before(nav);
   }
   if(header&&header!==lastHeading){header.classList.add('na-screen-enter');lastHeading=header;}
   document.querySelectorAll('#mainContent button,#mainContent th,.nav-text,#appModal .modal-title,#appModal button,.ops-main th,.ops-main button').forEach(el=>{
    const current=normalized(el);const key=Object.keys(labels).find(k=>k.toLocaleLowerCase('vi')===current.toLocaleLowerCase('vi'));if(key)setLabel(el,labels[key]);
   });
   if(header){
    const buttons=Array.from(header.querySelectorAll('button.btn')).filter(b=>!b.hidden);
    const action=buttons.find(b=>b.matches('.btn-primary'))||buttons.find(b=>/Tạo|Thêm|Phân công|Nhận phòng nhanh/.test(normalized(b)));
    for(const b of buttons){b.classList.toggle('na-primary-action',b===action);b.classList.toggle('na-secondary-action',b!==action);}
   }
   document.querySelectorAll('.modal-close-btn,.drawer-close-btn').forEach(b=>{if(!b.getAttribute('aria-label'))b.setAttribute('aria-label','Đóng');if(b.tagName==='BUTTON'&&!b.getAttribute('type'))b.setAttribute('type','button');});
   document.querySelectorAll('.btn[title],button[title]').forEach(b=>{if(!normalized(b)&&!b.getAttribute('aria-label'))b.setAttribute('aria-label',b.title);});
   document.querySelectorAll('.modal-container,.modal-card').forEach(dialog=>{
    dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    const h=dialog.querySelector('.modal-title');if(h){if(!h.id)h.id='na-dialog-title-'+(++dialogNumber);dialog.setAttribute('aria-labelledby',h.id);}
    const body=dialog.querySelector('.modal-body');if(!body)return;
    const dates=body.querySelectorAll('input[type=date]');
    if(dates.length>=2&&/đặt phòng|nhận phòng/i.test(h?.textContent||'')){
     section(body,dates[0].closest('.form-row'),'Thông tin lưu trú');
     section(body,body.querySelector('[name=guestName]')?.closest('.form-row'),'Thông tin khách');
    }
   });
   document.querySelectorAll('.sl-empty,.pms-empty,[role=status]').forEach(el=>{
    const text=normalized(el);const loading=/^(Đang tải|Đang kiểm tra|Đang xác minh)/.test(text)&&text.length<150;
    el.classList.toggle('na-loading',loading);if(loading)el.setAttribute('aria-busy','true');else if(el.getAttribute('aria-busy')==='true')el.removeAttribute('aria-busy');
   });
   document.querySelectorAll('.toast,.toast-notification').forEach(el=>{if(!el.hasAttribute('role'))el.setAttribute('role',/error|danger/.test(el.className)?'alert':'status');});
   main.querySelectorAll('table').forEach(table=>{if(table.querySelectorAll('thead th').length>=10)table.classList.add('na-wide-table');if(/Thao tác/i.test(table.querySelector('thead th:last-child')?.textContent||''))table.classList.add('na-has-actions');});
   main.querySelectorAll('td[colspan]').forEach(td=>{if(/^(Không có|Chưa có|Không tìm thấy)/.test(normalized(td)))td.classList.add('na-empty-cell');});
  }
  const schedule=()=>{if(!pending){pending=true;requestAnimationFrame(enhance);}};
  const observer=new MutationObserver(schedule);observer.observe(main,{childList:true,subtree:true});
  for(const node of document.querySelectorAll('#appModal,#roomDrawer,.toast-container'))observer.observe(node,{childList:true,subtree:true});
  new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-screen']});
  document.addEventListener('invalid',event=>{
   const field=event.target;if(!field.matches('input,select,textarea'))return;
   field.setAttribute('aria-invalid','true');
   if(!field.id)field.id='na-field-'+(++fieldNumber);
   const id=field.id+'-error';let error=document.getElementById(id);
   if(!error){error=document.createElement('small');error.id=id;error.className='na-field-error';field.after(error);}
   error.textContent=field.validity.valueMissing?'Vui lòng điền thông tin này.':field.validity.typeMismatch?'Thông tin chưa đúng định dạng.':field.validationMessage;
   if(!field.getAttribute('aria-describedby')?.split(' ').includes(id))field.setAttribute('aria-describedby',[field.getAttribute('aria-describedby'),id].filter(Boolean).join(' '));
  },true);
  document.addEventListener('input',event=>{const field=event.target;if(field.getAttribute?.('aria-invalid')==='true'&&field.validity?.valid){field.removeAttribute('aria-invalid');document.getElementById(field.id+'-error')?.remove();}});
  enhance();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
