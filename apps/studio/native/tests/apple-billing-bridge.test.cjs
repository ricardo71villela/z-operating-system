const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../../src/platform/apple-billing.js'),'utf8');
const person='11111111-1111-4111-8111-111111111111';
const intent='22222222-2222-4222-8222-222222222222';
const product='com.zoperatingsystem.zstudio.subscription.monthly';

function harness(){
  const calls=[];
  const Store={
    async appTransaction(){calls.push(['appTransaction']);return{verification:'verified',appTransactionId:'app_tx_2026_unique_customer'};},
    async purchase(args){calls.push(['purchase',args]);return{status:'verified',transaction:{verification:'verified',transactionId:'2005',originalTransactionId:'2000',jwsRepresentation:'a.b.c'}};},
    async finishTransaction(args){calls.push(['finish',args]);return{finished:true};},
    async unfinishedTransactions(){return{transactions:[]};},async currentEntitlements(){return{transactions:[]};},async syncPurchases(){return{synced:true};},async loadProducts(){return{products:[]};},async addListener(){},
  };
  const Http={async request(args){calls.push(['http',args.url,args.data]);if(args.url.endsWith('/prepare'))return{status:200,data:{ok:true,purchase_intent_id:intent,app_account_token:person,product_id:product,plan_code:'monthly',trial_eligible:true,introductory_offer_eligibility_jws:'h.p.s',expires_at:new Date(Date.now()+600000).toISOString()}};return{status:200,data:{ok:true,finish_transaction_id:'2005'}};}};
  const window={
    ZStudioCommercialConfig:{plans:{monthly:{appleProductId:product},weekly:{appleProductId:'com.zoperatingsystem.zstudio.subscription.weekly'},annual:{appleProductId:'com.zoperatingsystem.zstudio.subscription.annual'}}},
    ZSTUDIO_COMMERCIAL_BASE_URL:'https://commercial.example',
    ZStudioAuth:{async getAccessToken(){return'user-token';}},
    Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'ios',Plugins:{ZStudioStoreKit:Store,CapacitorHttp:Http}},
  };
  const document={readyState:'loading',addEventListener(){}};
  vm.runInNewContext(source,{window,document,URL,fetch:()=>{throw new Error('fetch should not be used');},setTimeout,clearTimeout,console},{filename:'apple-billing.js'});
  return{window,calls};
}

test('Apple purchase is preflighted by ZOS, receives signed intro eligibility, reconciles then finishes',async()=>{
  const h=harness();
  const result=await h.window.ZStudioApple.startPurchase('monthly');
  assert.equal(result.ok,true);
  assert.deepEqual(h.calls.map(x=>x[0]),['appTransaction','http','purchase','http','finish']);
  const prepare=h.calls[1];
  assert.equal(prepare[1],'https://commercial.example/api/apple/prepare');
  assert.equal(JSON.stringify(prepare[2]),JSON.stringify({plan_code:'monthly',app_transaction_id:'app_tx_2026_unique_customer'}));
  const purchase=h.calls[2][1];
  assert.equal(purchase.productId,product);
  assert.equal(purchase.appAccountToken,person);
  assert.equal(purchase.introductoryOfferEligibilityJws,'h.p.s');
  const reconcile=h.calls[3];
  assert.equal(reconcile[1],'https://commercial.example/api/apple/reconcile');
  assert.equal(reconcile[2].purchase_intent_id,intent);
  assert.equal(reconcile[2].jwsRepresentation,'a.b.c');
  assert.equal(JSON.stringify(h.calls[4]),JSON.stringify(['finish',{transactionId:'2005'}]));
});
