import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebPortalAuthorityClient, WebPortalAuthorityRpcError } from '../lib/web-portal-authority-client.js';
import { createStripeWebPortalApi, StripeWebPortalApiError } from '../lib/stripe-web-portal-api.js';

const person='11111111-1111-4111-8111-111111111111';
function response(payload,status=200){return {ok:status>=200&&status<300,status,async json(){return payload;}};}

test('portal authority resolves only an already-bound Stripe Customer',async()=>{
  let body;
  const client=createWebPortalAuthorityClient({supabaseUrl:'https://example.supabase.co',supabaseSecretKey:'sb_secret_test'},{fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return response({result:'resolved',source_customer_ref:'cus_Abc123'});}});
  const value=await client.resolveCustomer({personId:person,billingEnvironment:'production'});
  assert.equal(value.sourceCustomerRef,'cus_Abc123');
  assert.deepEqual(body,{p_person_id:person,p_billing_environment:'production'});
});

test('Stripe portal session is server-only and accepts only stripe.com hosted URL',async()=>{
  let request;
  const api=createStripeWebPortalApi({environment:'sandbox',stripeSecretKey:'sk_test_example',successUrl:'https://zstudio.space/'},{fetchImpl:async(url,options)=>{request=[url,options];return response({url:'https://billing.stripe.com/p/session/test_123'});}});
  const session=await api.createSession('cus_Abc123');
  assert.equal(session.url,'https://billing.stripe.com/p/session/test_123');
  assert.match(request[1].body,/customer=cus_Abc123/);
  assert.match(request[1].body,/return_url=https%3A%2F%2Fzstudio.space%2F/);
});

test('portal clients classify invalid provider state fail closed',async()=>{
  const authority=createWebPortalAuthorityClient({supabaseUrl:'https://example.supabase.co',supabaseSecretKey:'sb_secret_test'},{fetchImpl:async()=>response({message:'WEB_PORTAL_CUSTOMER_NOT_FOUND'},404)});
  await assert.rejects(()=>authority.resolveCustomer({personId:person,billingEnvironment:'production'}),WebPortalAuthorityRpcError);
  const stripe=createStripeWebPortalApi({environment:'production',stripeSecretKey:'sk_live_example',successUrl:'https://zstudio.space/'},{fetchImpl:async()=>response({url:'https://evil.example/session'},200)});
  await assert.rejects(()=>stripe.createSession('cus_Abc123'),StripeWebPortalApiError);
});
