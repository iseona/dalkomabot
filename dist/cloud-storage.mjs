const TOKEN_KEY='dalkoma-cloud-access-token-v1';
const clone=value=>JSON.parse(JSON.stringify(value));

export function cloudConfig(config=globalThis.DALKOMA_CONFIG||{}){
 const required=['cloudEndpoint','cognitoDomain','cognitoClientId'];
 return required.every(key=>typeof config[key]==='string'&&config[key])?config:null;
}

export function takeLoginToken(location=globalThis.location,history=globalThis.history,storage=globalThis.sessionStorage){
 const hash=new URLSearchParams((location.hash||'').replace(/^#/,''));
 const token=hash.get('id_token');
 if(!token)return false;
 storage.setItem(TOKEN_KEY,token);
 history.replaceState(null,'',location.pathname+location.search);
 return true;
}

export function signedIn(storage=globalThis.sessionStorage){return Boolean(storage.getItem(TOKEN_KEY))}
export function signOut(storage=globalThis.sessionStorage){storage.removeItem(TOKEN_KEY)}

export function loginUrl(config,origin=globalThis.location.origin){
 const params=new URLSearchParams({client_id:config.cognitoClientId,response_type:'token',scope:'openid email profile',redirect_uri:origin+'/',identity_provider:'Google'});
 return `https://${config.cognitoDomain}/oauth2/authorize?${params}`;
}

async function request(config,path,options={},storage=globalThis.sessionStorage){
 const token=storage.getItem(TOKEN_KEY);if(!token)throw Error('로그인이 필요합니다.');
 const response=await fetch(config.cloudEndpoint+path,{...options,headers:{Authorization:`Bearer ${token}`,'content-type':'application/json',...(options.headers||{})}});
 if(response.status===401){signOut(storage);throw Error('로그인이 만료되었습니다. 다시 로그인해 주세요.')}
 if(!response.ok){const error=Error('클라우드 저장소에 연결하지 못했습니다.');error.status=response.status;throw error}
 return response.status===204?null:response.json();
}

export async function loadCloudWorkspace(config,storage){
 try{return await request(config,'/v1/workspace',{},storage)}catch(error){if(error.status===404)return undefined;if(error.message==='클라우드 저장소에 연결하지 못했습니다.')return null;throw error}
}

export async function saveCloudWorkspace(config,workspace,storage){
 const body=JSON.stringify({schemaVersion:1,teams:workspace.teams,library:workspace.library,updatedAt:Date.now()});
 if(body.length>180000)throw Error('클라우드 저장 용량을 초과했습니다.');
 return request(config,'/v1/workspace',{method:'PUT',body},storage);
}

export function validWorkspace(value,validate){
 if(!value||value.schemaVersion!==1||!value.teams||!Array.isArray(value.library))return null;
 const teams={};for(const mode of ['single','double']){const team=value.teams[mode];if(!Array.isArray(team)||team.length!==6||!team.every(set=>set===null||validate(set,mode)))return null;teams[mode]=clone(team)}
 return {teams,library:clone(value.library)};
}
