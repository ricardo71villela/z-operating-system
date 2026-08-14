'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const authPath = path.join(
  root,
  'apps/zfind-web/src/services/auth.js'
);

const source = fs.readFileSync(authPath, 'utf8');

let captured = null;
let underlyingSignOutCalls = 0;

const fakeClient = {
  auth: {
    async signOut() {
      underlyingSignOutCalls += 1;

      // This is the successful shape Supabase Auth may legitimately
      // return for signOut: no error and no meaningful data payload.
      return {
        data: null,
        error: null
      };
    }
  }
};

const fakeSupabaseClientModule = {
  getSupabaseClient() {
    return fakeClient;
  },

  async safeQuery(queryFn, context, options) {
    captured = {
      context,
      options
    };

    const result = await queryFn();

    if (result.error) {
      return {
        data: null,
        error: result.error
      };
    }

    if (
      (result.data === null ||
       result.data === undefined) &&
      !(options && options.allowNullData)
    ) {
      return {
        data: null,
        error: {
          type: 'empty_result',
          context,
          message: 'Query succeeded but returned no data.'
        }
      };
    }

    return {
      data: result.data ?? null,
      error: null
    };
  }
};

const sandbox = {
  console,
  window: {
    ZFindServices: {
      supabaseClient: fakeSupabaseClientModule
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(
  source,
  sandbox,
  { filename: authPath }
);

(async () => {
  const auth =
    sandbox.window.ZFindServices.auth;

  assert.ok(
    auth,
    'auth service must register in browser mode'
  );

  assert.strictEqual(
    typeof auth.signOut,
    'function',
    'auth.signOut must remain exported'
  );

  const result =
    await auth.signOut();

  assert.strictEqual(
    underlyingSignOutCalls,
    1,
    'auth.signOut must call Supabase Auth exactly once'
  );

  assert.ok(
    captured,
    'auth.signOut must execute through safeQuery'
  );

  assert.strictEqual(
    captured.context,
    'auth.signOut',
    'safeQuery context must remain auth.signOut'
  );

  assert.ok(
    captured.options,
    'auth.signOut must pass safeQuery options'
  );

  assert.strictEqual(
    captured.options.allowNullData,
    true,
    'auth.signOut must explicitly allow null-data success'
  );

  assert.strictEqual(
    result.error,
    null,
    'successful Supabase signOut with null data must not become empty_result'
  );

  console.log(
    '✅ auth.signOut null-data contract PASSED'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
