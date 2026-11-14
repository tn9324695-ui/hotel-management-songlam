(function(root){
 'use strict';
 const C=root.SongLamComponents,U=root.SongLamUi,S=root.SongLamSession,$=id=>document.getElementById(id),el=C.el;
 const api=root.SongLamCatalogApi.createCatalogApi({client:S.client});
 const definitions={
  roomTypes:{title:'Hạng phòng',path:'room-types',columns:[['code','Mã'],['name','Tên hạng'],['standardOccupancy','Khách tiêu chuẩn'],['maxOccupancy','Khách tối đa'],['active','Hoạt động']]},
  rooms:{title:'Phòng',path:'rooms',columns:[['number','Phòng'],['roomTypeId','Mã hạng'],['floor','Tầng'],['occupancyStatus','Hiện diện'],['cleanlinessStatus','Vệ sinh'],['exploitationStatus','Khai thác']]},
  services:{title:'Danh mục dịch vụ',path:'services',columns:[['code','Mã'],['name','Dịch vụ'],['category','Nhóm'],['unit','Đơn vị'],['priceVnd','Đơn giá'],['active','Hoạt động']]},
  hotelSettings:{title:'Cấu hình khách sạn',path:'hotel-settings',singleton:true,columns:[['name','Khách sạn'],['timeZoneId','Múi giờ'],['currency','Tiền tệ'],['workingDate','Ngày nghiệp vụ'],['checkInTime','Giờ nhận'],['checkOutTime','Giờ trả']]},
  businessDays:{title:'Ngày nghiệp vụ',path:'business-days',columns:[['date','Ngày'],['status','Trạng thái'],['closedAtUtc','Thời điểm chốt']]}
 };
 const labels={q:'Tìm kiếm',active:'Hoạt động',category:'Nhóm dịch vụ',roomTypeId:'Mã hạng phòng',floor:'Tầng',occupancyStatus:'Hiện diện',cleanlinessStatus:'Vệ sinh',exploitationStatus:'Khai thác',from:'Từ ngày',to:'Đến ngày',status:'Trạng thái'};
 const choices={active:[['true','Đang hoạt động'],['false','Ngừng hoạt động']],occupancyStatus:['VACANT','OCCUPIED'],cleanlinessStatus:['CLEAN','DIRTY','CLEANING','INSPECTING'],exploitationStatus:['ACTIVE','INACTIVE','MAINTENANCE'],status:[['OPEN','Đang mở'],['CLOSED','Đã chốt']]};
 let capabilities={},selected,offset=0,generation=0,actorId,sqlVerified=false;
 const note=(text,tone='info')=>C.notification.set($('catalog-message'),text,tone);
 function choose(key){if(!definitions[key]||!capabilities[key]?.supported)return;selected=key;offset=0;history.replaceState(null,'','#'+key);navigation();filters();load();}
 function navigation(){
  $('catalog-nav').replaceChildren();
  for(const [key,definition] of Object.entries(definitions)){
   if(!capabilities[key])continue;
   const button=el('button',definition.title);button.type='button';button.disabled=!capabilities[key].supported;
   button.setAttribute('aria-current',selected===key?'page':'false');button.onclick=()=>choose(key);$('catalog-nav').append(button);
  }
  $('catalog-title').textContent=definitions[selected]?.title||'Danh mục & cấu hình';
 }
 function filters(){
  const form=$('catalog-filters');form.replaceChildren();
  for(const name of capabilities[selected]?.filters||[]){
   if(!labels[name])continue;
   const label=el('label',labels[name]),input=document.createElement(choices[name]?'select':'input');input.name=name;
   input.className=choices[name]?'form-select':'form-control';
   if(choices[name]){for(const [value,text] of [['','Tất cả'],...choices[name].map(v=>Array.isArray(v)?v:[v,U.label(v)])]){const o=el('option',text);o.value=value;input.append(o);}}
   else{input.type=['from','to'].includes(name)?'date':name==='roomTypeId'?'number':'search';if(name==='roomTypeId')input.min='1';input.maxLength=160;}
   label.append(input);form.append(label);
  }
  form.hidden=!form.children.length;
  if(!form.hidden){const apply=el('button','Áp dụng bộ lọc','btn btn-primary');apply.type='submit';form.append(apply);}
 }
 function value(key,v){if(v==null)return '—';if(key==='priceVnd')return U.money(v);if(typeof v==='boolean')return v?'Có':'Không';if(key==='status')return {OPEN:'Đang mở',CLOSED:'Đã chốt'}[v]||U.label(v);if(['date','workingDate','closedAtUtc'].includes(key))return U.date(v);return U.label(v);}
 async function detail(row){
  const ticket=generation,identity=actorId,definition=definitions[selected];
  try{const result=definition.singleton?{data:row}:await api.detail(definition.path,row.id||row.date);
   if(ticket!==generation||S.current()?.user.appUserId!==identity)return;
   const dl=el('dl',null,'ops-detail');for(const [key,label] of definition.columns)dl.append(el('dt',label),el('dd',value(key,result.data[key])));
   $('catalog-detail-body').replaceChildren(dl);C.modal.open($('catalog-detail'));
  }catch(error){C.notification.error($('catalog-message'),error);}
 }
 async function load(){
  const ticket=++generation;$('catalog-results').setAttribute('aria-busy','true');$('catalog-trace').textContent='';$('catalog-pagination').replaceChildren();
  $('catalog-results').replaceChildren(el('div','Đang tải từ máy chủ…','sl-empty'));note('Đang tải…');
  try{
   const me=await S.restore();actorId=me.data.user.appUserId;
   if(!capabilities[selected]?.supported)throw new Error('Chưa khả dụng: không có hợp đồng đọc phù hợp với quyền hiện tại.');
   const definition=definitions[selected],cap=capabilities[selected],limit=Math.min(50,cap.maxLimit);
   const query=definition.singleton?{}:{...Object.fromEntries(new FormData($('catalog-filters'))),offset,limit};
   const response=await api.list(definition.path,query);if(ticket!==generation||S.current()?.user.appUserId!==me.data.user.appUserId)return;
   const rows=definition.singleton?[response.data]:response.data;
   C.table.mount($('catalog-results'),definition.columns.map(([key,label])=>({key,label,render:row=>value(key,row[key])})),rows,{empty:'Chưa có dữ liệu trong phạm vi đã chọn. Không dùng dữ liệu demo.',onSelect:detail});
   if(!definition.singleton)C.pagination.mount($('catalog-pagination'),{offset,limit,count:rows.length,hasMore:response.meta?.hasMore,onPage:n=>{offset=n;load();}});
   note(selected==='rooms'&&cap.readScope==='CURRENT_STATUS_ONLY'?'Chỉ hiển thị trạng thái hiện tại. Chưa xác minh block/lịch theo khoảng ngày; không dùng danh sách này để xác nhận phòng khả dụng.':'Đã nhận dữ liệu từ API. Màn hình chỉ đọc.',selected==='rooms'?'warning':'info');
   $('catalog-trace').textContent='Mã yêu cầu: '+response.requestId;
  }catch(error){if(ticket!==generation)return;
   $('catalog-results').replaceChildren(el('div',error.status===404?'Chưa có dữ liệu cấu hình/ngày nghiệp vụ. Không tạo mặc định.':'Chưa tải được dữ liệu. Không dùng localStorage thay thế.','sl-empty'));
   C.notification.error($('catalog-message'),error);
  }finally{if(ticket===generation)$('catalog-results').setAttribute('aria-busy','false');}
 }
 async function initialize(){
  const ticket=++generation;
  try{const me=await S.restore();const [caps,connection]=await Promise.all([api.capabilities(),S.client.request('/connection/status')]);
   if(ticket!==generation||S.current()?.user.appUserId!==me.data.user.appUserId)return;
   capabilities=caps.data.resources;sqlVerified=connection.data.sqlConnected===true&&connection.data.identityVerified===true;
   $('catalog-source').textContent=sqlVerified?'SQL Server qua backend API · chỉ đọc':'API · chưa xác minh kết nối SQL';
   const hash=location.hash.slice(1);selected=definitions[hash]&&capabilities[hash]?.supported?hash:Object.keys(definitions).find(key=>capabilities[key]?.supported);
   navigation();filters();await load();
  }catch(error){if(ticket!==generation)return;note('Chưa xác minh phiên hoặc khả năng đọc dữ liệu. Vui lòng đăng nhập và tải lại.','warning');C.notification.error($('catalog-message'),error);}
 }
 $('catalog-filters').onsubmit=event=>{event.preventDefault();offset=0;load();};$('catalog-refresh').onclick=initialize;
 $('catalog-close').onclick=()=>C.modal.close($('catalog-detail'));
 root.addEventListener('hashchange',()=>choose(location.hash.slice(1)));
 root.addEventListener('songlam:session',()=>{if(!S.current()){generation++;$('catalog-results').replaceChildren(el('div','Phiên chưa được xác minh.','sl-empty'));C.modal.close($('catalog-detail'));}});
 initialize();
}(window));
