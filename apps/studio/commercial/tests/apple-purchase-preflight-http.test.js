import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplePurchasePreflightHttpHandler } from '../lib/apple-purchase-preflight-http.js';

const person='11111111-1111-4111-8111-111111111111';
const intent='22222222-2222-4222-8222-222222222222';
const product='com.zoperatingsystem.zstudio.subscription.monthly';
const config={environment:'production',privateKey:'k',keyId:'kid',issuerId:'issuer',bundleId:'com.zoperatingsystem.zstudio'};
function response(){return{status:null,headers:null,payload:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(text=''){this.payload=text?JSON.parse(text):null;}};}
function handler(overrides={}){return createApplePurchasePreflightHttpHandler({
  loadConfig:()=>config,
  resolvePerson:async()=>person,
  resolvePlan:(plan)=>{if(plan!=='monthly')throw new Error('APPLE_PLAN_INVALID');return{planCode:'monthly',productId:product};},
  createAuthorityClient:()=>({prepare:async()=>({intentId:intent,planCode:'monthly',productId:product,billingEnvironment:'production',trialEligible:true,intentExpiresAt:'2026-08-22T00:00:00Z'})}),
  createSignatureCreator:()=>({createSignature:(productId,allowIntro,appTransactionId)=>{assert.equal(productId,product);assert.equal(allowIntro,true);assert.equal(appTransactionId,'app_tx_customer_1');return'h.p.s';}}),
  ...overrides,
});}

test('Apple prepare authenticates canonical person and returns signed server trial decision',async()=>{
  const res=response();
  await handler()({method:'POST',headers:{authorization:'Bearer user',origin:'capacitor://localhost'},body:{plan_code:'monthly',app_transaction_id:'app_tx_customer_1'}},res);
  assert.equal(res.status,200);
  assert.equal(res.payload.purchase_intent_id,intent);
  assert.equal(res.payload.app_account_token,person);
  assert.equal(res.payload.product_id,product);
  assert.equal(res.payload.trial_eligible,true);
  assert.equal(res.payload.introductory_offer_eligibility_jws,'h.p.s');
});

test('Apple prepare rejects client trial/person/product authority fields before RPC',async()=>{
  let touched=false;const res=response();
  await handler({createAuthorityClient:()=>({prepare:async()=>{touched=true;return{};}})})({method:'POST',headers:{authorization:'Bearer user'},body:{plan_code:'monthly',app_transaction_id:'app_tx_customer_1',trial_eligible:true}},res);
  assert.equal(res.status,400);assert.equal(touched,false);
});
