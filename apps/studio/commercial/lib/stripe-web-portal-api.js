const STRIPE_API_BASE='https://api.stripe.com/v1';
const CUSTOMER_RE=/^cus_[A-Za-z0-9]+$/;

export class StripeWebPortalApiError extends Error {
  constructor(code,{retryable=false,httpStatusCode=null,cause=null}={}){super(code);this.name='StripeWebPortalApiError';this.code=code;this.retryable=retryable;this.httpStatusCode=httpStatusCode;if(cause)this.cause=cause;}
}
function fail(code,options){throw new StripeWebPortalApiError(code,options);}
function retryable(status){return status===408||status===409||status===425||status===429||status>=500;}
function https(value,code){let u;try{u=new URL(String(value??'').trim());}catch{fail(code);}if(u.protocol!=='https:'||u.username||u.password)fail(code);return u.href;}

export function createStripeWebPortalApi(config,{fetchImpl=globalThis.fetch,timeoutMs=10000}={}) {
  const environment=String(config?.environment??'').trim().toLowerCase();
  const secret=String(config?.stripeSecretKey??'').trim();
  const prefix=environment==='production'?'sk_live_':'sk_test_';
  const returnUrl=https(config?.successUrl,'STRIPE_PORTAL_RETURN_URL_INVALID');
  if(!['sandbox','production'].includes(environment)||!secret.startsWith(prefix)||secret.length<=prefix.length||typeof fetchImpl!=='function') fail('STRIPE_PORTAL_CONFIG_INVALID');
  return Object.freeze({
    async createSession(customerId){
      const customer=String(customerId??'').trim(); if(!CUSTOMER_RE.test(customer))fail('STRIPE_PORTAL_CUSTOMER_INVALID');
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);let response;
      try{
        response=await fetchImpl(`${STRIPE_API_BASE}/billing_portal/sessions`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({customer,return_url:returnUrl}).toString(),signal:controller.signal});
      }catch(cause){fail('STRIPE_PORTAL_UNAVAILABLE',{retryable:true,cause});}
      finally{clearTimeout(timer);}
      let payload=null;try{payload=await response.json();}catch{}
      if(!response.ok)fail('STRIPE_PORTAL_CREATE_FAILED',{retryable:retryable(response.status),httpStatusCode:response.status});
      const url=https(payload?.url,'STRIPE_PORTAL_RESPONSE_INVALID');
      const parsed=new URL(url);if(!/(^|\.)stripe\.com$/.test(parsed.hostname))fail('STRIPE_PORTAL_RESPONSE_INVALID');
      return Object.freeze({url});
    },
  });
}
