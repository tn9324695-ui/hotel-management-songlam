// Uses existing local secrets, never prints credentials, cookies or hashes.
import{readFile}from'node:fs/promises';
const credentials=JSON.parse((await readFile(new URL('../sql/private/test-staff-B20261112_UI01/credentials.local.json',import.meta.url),'utf8')).replace(/^\uFEFF/,'')),origin='http://127.0.0.1:8093';
for(const a of credentials.accounts){let cookie,csrf;try{const r=await fetch(origin+'/api/v1/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:a.username,password:a.password})}),j=await r.json();cookie=r.headers.get('set-cookie')?.split(';')[0];csrf=j.data?.csrfToken;
let meStatus=null;if(cookie){const me=await fetch(origin+'/api/v1/auth/me',{headers:{Cookie:cookie}});meStatus=me.status;}
console.log(JSON.stringify({role:a.roleCode,loginStatus:r.status,meStatus,errorCode:j.error?.code||null}));
}finally{if(cookie&&csrf)await fetch(origin+'/api/v1/auth/logout',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:'{}'}).catch(()=>{});}}
