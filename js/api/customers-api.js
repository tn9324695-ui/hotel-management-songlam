(function(root){'use strict';root.SongLamCustomersApi=Object.freeze({createCustomersApi({client=root.SongLamHttp.getClient(),getCsrfToken=()=>root.SongLamSession.csrf()}={}){
 return Object.freeze({async create(body,{idempotencyKey}={}){if(!/^[A-Za-z0-9._:-]{1,120}$/.test(idempotencyKey||''))throw new Error('Cần khóa yêu cầu tạo khách.');return client.request('/customers',{method:'POST',body,headers:{'X-CSRF-Token':await getCsrfToken(),'Idempotency-Key':idempotencyKey}});}});
}});}(window));
