import { randomUUID } from 'node:crypto';
import { WebCheckoutAuthBoundaryError, validateWebSupabaseBearerAndResolvePerson } from './web-checkout-http.js';
import { WebPortalAuthorityRpcError } from './web-portal-authority-client.js';
import { StripeWebPortalApiError } from './stripe-web-portal-api.js';

const DEFAULT_ALLOWED_ORIGINS=new Set(['https://localhost','https://zstudio.space','https://www.zstudio.space']);
function bearer(req){const raw=String(req?.headers?.authorization??req?.headers?.Authorization??'').trim();return raw.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()||'';}
function body(req){if(Buffer.isBuffer(req.body))return JSON.parse(req.body.toString('utf8'));if(typeof req.body==='string')return JSON.parse(req.body);return req.body??{};}
function cors(origin,origins){const h={'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Cache-Control':'no-store',Vary:'Origin'};if(origin&&origins.has(origin))h['Access-Control-Allow-Origin']=origin;return h;}
function send(res,status,payload,origin,origins,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...cors(origin,origins),...extra});res.end(JSON.stringify(payload));}

export function createWebPortalHttpHandler({loadConfig,resolvePerson=validateWebSupabaseBearerAndResolvePerson,createAuthorityClient,createStripePortalClient,allowedOrigins=DEFAULT_ALLOWED_ORIGINS}={}) {
  if([loadConfig,resolvePerson,createAuthorityClient,createStripePortalClient].some((x)=>typeof x!=='function'))throw new Error('WEB_PORTAL_HANDLER_DEPENDENCIES_INVALID');
  return async function handler(req,res){
    const requestId=randomUUID();const origin=String(req?.headers?.origin??'');const origins=allowedOrigins instanceof Set?allowedOrigins:new Set(allowedOrigins??[]);
    if(origin&&!origins.has(origin)){send(res,403,{code:'ORIGIN_DENIED',request_id:requestId},origin,origins);return;}
    if(req.method==='OPTIONS'){res.writeHead(204,cors(origin,origins));res.end();return;}
    if(req.method!=='POST'){send(res,405,{code:'METHOD_NOT_ALLOWED',request_id:requestId},origin,origins,{Allow:'POST, OPTIONS'});return;}
    const token=bearer(req);if(!token){send(res,401,{code:'AUTH_REQUIRED',request_id:requestId},origin,origins,{'WWW-Authenticate':'Bearer'});return;}
    try{const value=body(req);if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==0)throw new Error();}catch{send(res,400,{code:'WEB_PORTAL_REQUEST_INVALID',request_id:requestId},origin,origins);return;}
    let config;try{config=loadConfig();}catch{send(res,500,{code:'COMMERCIAL_CONFIG_UNAVAILABLE',request_id:requestId},origin,origins);return;}
    let personId;try{personId=await resolvePerson(config,token);}catch(error){if(error instanceof WebCheckoutAuthBoundaryError&&error.invalid){send(res,401,{code:'AUTH_INVALID',request_id:requestId},origin,origins,{'WWW-Authenticate':'Bearer'});return;}send(res,503,{code:'AUTH_UNAVAILABLE',request_id:requestId},origin,origins,{'Retry-After':'5'});return;}
    let binding;try{binding=await createAuthorityClient(config).resolveCustomer({personId,billingEnvironment:config.environment});}catch(error){if(error instanceof WebPortalAuthorityRpcError&&error.retryable){send(res,503,{code:'WEB_PORTAL_UNAVAILABLE',request_id:requestId},origin,origins,{'Retry-After':'5'});return;}if(error instanceof WebPortalAuthorityRpcError&&error.databaseCode==='WEB_PORTAL_CUSTOMER_NOT_FOUND'){send(res,409,{code:'WEB_PORTAL_CUSTOMER_NOT_FOUND',request_id:requestId},origin,origins);return;}send(res,502,{code:'WEB_PORTAL_AUTHORITY_FAILED',request_id:requestId},origin,origins);return;}
    let session;try{session=await createStripePortalClient(config).createSession(binding.sourceCustomerRef);}catch(error){if(error instanceof StripeWebPortalApiError&&error.retryable){send(res,503,{code:'STRIPE_PORTAL_UNAVAILABLE',request_id:requestId},origin,origins,{'Retry-After':'5'});return;}send(res,502,{code:'STRIPE_PORTAL_CREATE_FAILED',request_id:requestId},origin,origins);return;}
    send(res,200,{ok:true,portal_url:session.url,request_id:requestId},origin,origins);
  };
}
