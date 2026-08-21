const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../../src/platform/billing-ui.js'),'utf8');

function harness(platform='web'){
  const calls=[];
  const document={readyState:'loading',documentElement:{lang:'en'},addEventListener(){},querySelectorAll(){return[];}};
  const window={
    ZStudioCommercialConfig:{enabled:true,baseUrl:'https://commercial.example',currency:'EUR',trialDays:3,plans:{weekly:{priceMinor:599},monthly:{priceMinor:1499},annual:{priceMinor:11999}}},
    ZSTUDIO_COMMERCIAL_BASE_URL:'https://commercial.example',
    ZStudioAuth:{async getAccessToken(){return 'user-token';}},
    location:{assign(url){calls.push(['navigate',url]);}},
  };
  if(platform!=='web')window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>platform};
  const sandbox={window,document,URL,Intl,setTimeout,clearTimeout,console,fetch:async(url,options)=>{
    calls.push(['fetch',url,JSON.parse(options.body),options.headers.Authorization]);
    if(url.endsWith('/api/web/portal'))return{ok:true,status:200,async json(){return{portal_url:'https://billing.stripe.com/p/session/test'};}};
    return{ok:true,status:200,async json(){return{checkout_url:'https://checkout.stripe.com/c/pay/test'};}};
  }};
  vm.runInNewContext(source,sandbox,{filename:'billing-ui.js'});
  return{window,calls};
}

test('Web/Microsoft route plan purchase to authenticated hosted Stripe Checkout',async()=>{
  const h=harness('web');
  await h.window.ZStudioBilling.startPlan('monthly');
  assert.deepEqual(h.calls[0],['fetch','https://commercial.example/api/web/checkout',{plan_code:'monthly'},'Bearer user-token']);
  assert.deepEqual(h.calls[1],['navigate','https://checkout.stripe.com/c/pay/test']);
  await h.window.ZStudioBilling.manage();
  assert.equal(h.calls.at(-1)[1],'https://billing.stripe.com/p/session/test');
});

test('iOS route uses StoreKit bridge and never calls Stripe',async()=>{
  const h=harness('ios');
  h.window.ZStudioApple={isAvailable:()=>true,async startPurchase(plan){h.calls.push(['apple',plan]);}};
  await h.window.ZStudioBilling.startPlan('annual');
  assert.deepEqual(h.calls,[['apple','annual']]);
});

test('Android route uses Google Play bridge and never calls Stripe',async()=>{
  const h=harness('android');
  h.window.ZStudioGooglePlay={isAvailable:()=>true,async startPurchase(plan){h.calls.push(['google',plan]);}};
  await h.window.ZStudioBilling.startPlan('weekly');
  assert.deepEqual(h.calls,[['google','weekly']]);
});
