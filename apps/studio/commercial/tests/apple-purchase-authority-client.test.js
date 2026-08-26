import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplePurchaseAuthorityClient, ApplePurchaseAuthorityRpcError } from '../lib/apple-purchase-authority-client.js';

const person='11111111-1111-4111-8111-111111111111';
const intent='22222222-2222-4222-8222-222222222222';
const config={supabaseUrl:'https://example.supabase.co',supabaseSecretKey:'sb_secret_test'};

function response(payload,status=200){return {ok:status>=200&&status<300,status,async json(){return payload;}};}

test('Apple authority client sends only server-validated purchase intent fields', async()=>{
  const calls=[];
  const client=createApplePurchaseAuthorityClient(config,{fetchImpl:async(url,options)=>{
    calls.push([url,JSON.parse(options.body)]);
    if(url.endsWith('/zstudio_prepare_apple_purchase'))return response({result:'prepared',intent_id:intent,plan_code:'monthly',product_id:'com.zoperatingsystem.zstudio.subscription.monthly',billing_environment:'production',trial_eligible:true,intent_expires_at:'2026-08-21T03:00:00Z'});
    if(url.endsWith('/zstudio_reconcile_apple_purchase_intent'))return response({result:'reconciled'});
    return response({result:'completed'});
  }});
  const prepared=await client.prepare({personId:person,planCode:'monthly',billingEnvironment:'production',productId:'com.zoperatingsystem.zstudio.subscription.monthly'});
  assert.equal(prepared.trialEligible,true);
  await client.reconcileIntent({intentId:intent,personId:person,billingEnvironment:'production',planCode:'monthly',productId:'com.zoperatingsystem.zstudio.subscription.monthly',sourceSubscriptionRef:'2000000000000000',providerTrialing:true});
  await client.completeIntent({intentId:intent,personId:person,billingEnvironment:'production',sourceSubscriptionRef:'2000000000000000',providerTrialing:true});
  assert.equal(calls.length,3);
  assert.deepEqual(Object.keys(calls[0][1]).sort(),['p_billing_environment','p_person_id','p_plan_code','p_product_id']);
  assert.equal(JSON.stringify(calls).includes('sb_secret_test'),false);
});

test('Apple authority client fails closed on product/identity and classifies retryable RPC outage', async()=>{
  const client=createApplePurchaseAuthorityClient(config,{fetchImpl:async()=>response({message:'APPLE_PURCHASE_RECONCILIATION_REQUIRED',code:'55000'},503)});
  await assert.rejects(()=>client.prepare({personId:person,planCode:'monthly',billingEnvironment:'production',productId:'wrong'}),ApplePurchaseAuthorityRpcError);
  await assert.rejects(async()=>{
    try { await client.prepare({personId:person,planCode:'monthly',billingEnvironment:'production',productId:'com.zoperatingsystem.zstudio.subscription.monthly'}); }
    catch(e){ assert.equal(e.retryable,true); throw e; }
  },ApplePurchaseAuthorityRpcError);
});
