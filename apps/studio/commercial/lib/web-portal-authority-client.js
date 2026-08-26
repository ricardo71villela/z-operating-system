const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOMER_RE = /^cus_[A-Za-z0-9]+$/;

export class WebPortalAuthorityRpcError extends Error {
  constructor(code,{retryable=false,httpStatusCode=null,databaseCode=null,cause=null}={}) {
    super(code); this.name='WebPortalAuthorityRpcError'; this.code=code; this.retryable=retryable; this.httpStatusCode=httpStatusCode; this.databaseCode=databaseCode; if(cause)this.cause=cause;
  }
}
function fail(code,options){throw new WebPortalAuthorityRpcError(code,options);}
function retryable(status){return status===408||status===425||status===429||status>=500;}
function databaseCode(payload){const m=typeof payload?.message==='string'?payload.message.trim():'';return /^WEB_PORTAL_[A-Z0-9_]+$/.test(m)?m:null;}

export function createWebPortalAuthorityClient(config,{fetchImpl=globalThis.fetch,timeoutMs=8000}={}) {
  const url=String(config?.supabaseUrl??'').trim().replace(/\/+$/,'');
  const secret=String(config?.supabaseSecretKey??'').trim();
  if(!/^https:\/\//.test(url)||!/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)||typeof fetchImpl!=='function') fail('WEB_PORTAL_AUTHORITY_CONFIG_INVALID');
  return Object.freeze({
    async resolveCustomer({personId,billingEnvironment}) {
      const person=String(personId??'').trim().toLowerCase();
      const env=String(billingEnvironment??'').trim().toLowerCase();
      if(!UUID_RE.test(person)||!['sandbox','production'].includes(env)) fail('WEB_PORTAL_AUTHORITY_REQUEST_INVALID');
      const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs); let response;
      try {
        response=await fetchImpl(`${url}/rest/v1/rpc/zstudio_get_web_stripe_customer_for_portal`,{method:'POST',headers:{apikey:secret,Authorization:`Bearer ${secret}`,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({p_person_id:person,p_billing_environment:env}),signal:controller.signal});
      } catch(cause){fail('WEB_PORTAL_AUTHORITY_UNAVAILABLE',{retryable:true,cause});}
      finally{clearTimeout(timer);}
      let payload=null; try{payload=await response.json();}catch{}
      if(!response.ok) fail('WEB_PORTAL_AUTHORITY_FAILED',{retryable:retryable(response.status),httpStatusCode:response.status,databaseCode:databaseCode(payload)});
      const customer=String(payload?.source_customer_ref??'').trim();
      if(payload?.result!=='resolved'||!CUSTOMER_RE.test(customer)) fail('WEB_PORTAL_AUTHORITY_RESPONSE_INVALID');
      return Object.freeze({sourceCustomerRef:customer});
    },
  });
}
