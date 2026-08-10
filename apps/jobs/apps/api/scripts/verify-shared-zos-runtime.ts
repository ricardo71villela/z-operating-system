import assert from 'node:assert/strict';

import { PgStore } from '../src/pgStore';
import { fileStorageService } from '../src/fileStorageService';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

if (process.env.JOBS_DB_SCHEMA !== 'jobs') {
  throw new Error('JOBS_DB_SCHEMA=jobs is required');
}

const SIGNUP_USER =
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const COMMIT_USER =
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ROLLBACK_USER =
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const COMMIT_DOCUMENT =
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const ROLLBACK_DOCUMENT =
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const COMMIT_PATH = 'runtime-commit/cv.pdf';
const ROLLBACK_PATH = 'runtime-rollback/cv.pdf';

const store = new PgStore(connectionString);

const deletedPaths: string[] = [];

const storage = fileStorageService as typeof fileStorageService & {
  delete: (relativePath: string) => Promise<void>;
};

const originalDelete = storage.delete;

storage.delete = async (relativePath: string) => {
  deletedPaths.push(relativePath);
};

async function seedCandidate(
  userId: string,
  fullName: string,
  documentId: string,
  storagePath: string,
) {
  await store.withRequestContext(userId, async () => {
    const identity = await store.query(
      `select auth.uid()::text as uid`,
    );

    assert.equal(
      identity.rows[0]?.uid,
      userId,
      'auth.uid() must match request context',
    );

    await store.bootstrapPersonRecord(
      userId,
      fullName,
      'ci-shared-runtime-v1',
    );

    await store.query(
      `insert into candidate_profiles (
         user_id,
         professional_title
       )
       values ($1, $2)`,
      [userId, `${fullName} Profile`],
    );

    await store.query(
      `insert into candidate_documents (
         id,
         user_id,
         doc_type,
         storage_path
       )
       values ($1, $2, 'cv', $3)`,
      [documentId, userId, storagePath],
    );

    const ownPerson = await store.query(
      `select full_name
       from persons
       where user_id = $1`,
      [userId],
    );

    assert.equal(
      ownPerson.rows[0]?.full_name,
      fullName,
      'bootstrapPersonRecord must create own jobs.persons row',
    );
  });
}

async function assertCandidateRows(
  userId: string,
  expectedProfileCount: number,
  expectedDocumentCount: number,
) {
  await store.withRequestContext(userId, async () => {
    const result = await store.query(
      `select
         (
           select count(*)::int
           from candidate_profiles
           where user_id = $1
         ) as profiles,
         (
           select count(*)::int
           from candidate_documents
           where user_id = $1
         ) as documents,
         (
           select count(*)::int
           from persons
           where user_id = $1
         ) as persons`,
      [userId],
    );

    assert.equal(
      result.rows[0]?.profiles,
      expectedProfileCount,
      'unexpected candidate profile count',
    );

    assert.equal(
      result.rows[0]?.documents,
      expectedDocumentCount,
      'unexpected candidate document count',
    );

    assert.equal(
      result.rows[0]?.persons,
      1,
      'candidate erasure must preserve jobs.persons',
    );
  });
}

async function main() {
  try {
    console.log('=== PgStore shared ZOS runtime ===');

    const searchPath = await store.query(`show search_path`);

    assert.equal(
      searchPath.rows[0]?.search_path,
      'jobs',
      'PgStore must force search_path=jobs',
    );

    console.log('✓ search_path=jobs');

    const currentUser = await store.query(
      `select current_user as current_user`,
    );

    assert.equal(
      currentUser.rows[0]?.current_user,
      'jobs_runtime_ci',
      'PgStore must use the dedicated runtime login',
    );

    console.log('✓ dedicated jobs_runtime_ci login');

    await assert.rejects(
      () => store.query(`select id from auth.users limit 1`),
      (error: any) => {
        return error?.code === '42501';
      },
      'runtime login must not directly read auth.users',
    );

    console.log('✓ direct auth.users SELECT denied');

    // ----------------------------------------------------------
    // Anonymous signup bootstrap:
    //
    // POST /candidates começa sem Authorization Bearer, portanto
    // auth.uid() é null. O UUID usado no bootstrap não vem do cliente:
    // é o UUID já emitido pelo Supabase Auth.
    //
    // A tarefa equivalente ao Identity Adapter deve ficar pendente
    // durante a transação e só conseguir observar jobs.persons depois
    // do COMMIT.
    // ----------------------------------------------------------

    let signupPostCommitObserved = false;

    await store.withRequestContext(null, async () => {
      const anonymousIdentity = await store.query(
        `select auth.uid()::text as uid`,
      );

      assert.equal(
        anonymousIdentity.rows[0]?.uid ?? null,
        null,
        'anonymous signup request must start with auth.uid() = null',
      );

      await store.bootstrapPersonRecord(
        SIGNUP_USER,
        'Runtime Signup User',
        'ci-shared-runtime-v1',
      );

      const insideTransaction = await store.query(
        `select full_name
         from persons
         where user_id = $1`,
        [SIGNUP_USER],
      );

      assert.equal(
        insideTransaction.rows[0]?.full_name,
        'Runtime Signup User',
        'bootstrap must create jobs.persons before COMMIT',
      );

      await store.scheduleAfterCommit(async () => {
        const committedPerson = await store.query(
          `select full_name
           from persons
           where user_id = $1`,
          [SIGNUP_USER],
        );

        assert.equal(
          committedPerson.rows[0]?.full_name,
          'Runtime Signup User',
          'post-COMMIT task must observe committed jobs.persons',
        );

        signupPostCommitObserved = true;
      });

      assert.equal(
        signupPostCommitObserved,
        false,
        'identity task must not run inside signup transaction',
      );
    });

    assert.equal(
      signupPostCommitObserved,
      true,
      'identity task must run after successful signup COMMIT',
    );

    console.log(
      '✓ anonymous signup bootstrap + post-COMMIT identity ordering',
    );

    await seedCandidate(
      COMMIT_USER,
      'Runtime Commit User',
      COMMIT_DOCUMENT,
      COMMIT_PATH,
    );

    await seedCandidate(
      ROLLBACK_USER,
      'Runtime Rollback User',
      ROLLBACK_DOCUMENT,
      ROLLBACK_PATH,
    );

    console.log('✓ bootstrap + owner RLS writes');

    // ----------------------------------------------------------
    // COMMIT path:
    // DB erasure happens in the request transaction.
    // Physical storage deletion must happen only afterwards.
    // ----------------------------------------------------------

    await store.withRequestContext(COMMIT_USER, async () => {
      await store.executeCandidateErasure(COMMIT_USER);

      assert.deepEqual(
        deletedPaths,
        [],
        'storage deletion must not run before COMMIT',
      );

      const stateInsideTransaction = await store.query(
        `select
           (
             select count(*)::int
             from candidate_profiles
             where user_id = $1
           ) as profiles,
           (
             select count(*)::int
             from candidate_documents
             where user_id = $1
           ) as documents,
           (
             select count(*)::int
             from persons
             where user_id = $1
           ) as persons`,
        [COMMIT_USER],
      );

      assert.equal(
        stateInsideTransaction.rows[0]?.profiles,
        0,
      );

      assert.equal(
        stateInsideTransaction.rows[0]?.documents,
        0,
      );

      assert.equal(
        stateInsideTransaction.rows[0]?.persons,
        1,
      );
    });

    assert.deepEqual(
      deletedPaths,
      [COMMIT_PATH],
      'storage deletion must run after successful COMMIT',
    );

    await assertCandidateRows(
      COMMIT_USER,
      0,
      0,
    );

    console.log('✓ erasure COMMIT + post-COMMIT cleanup ordering');

    // ----------------------------------------------------------
    // ROLLBACK path:
    // executeCandidateErasure schedules storage cleanup, but a later
    // exception must rollback DB changes and discard afterCommit tasks.
    // ----------------------------------------------------------

    let rollbackObserved = false;

    try {
      await store.withRequestContext(
        ROLLBACK_USER,
        async () => {
          await store.executeCandidateErasure(
            ROLLBACK_USER,
          );

          assert.deepEqual(
            deletedPaths,
            [COMMIT_PATH],
            'rollback candidate storage deletion ran before COMMIT',
          );

          throw new Error(
            'intentional-shared-runtime-rollback',
          );
        },
      );
    } catch (error: any) {
      assert.match(
        String(error?.message ?? error),
        /intentional-shared-runtime-rollback/,
      );

      rollbackObserved = true;
    }

    assert.equal(
      rollbackObserved,
      true,
      'intentional rollback was not observed',
    );

    assert.deepEqual(
      deletedPaths,
      [COMMIT_PATH],
      'storage cleanup must not run after ROLLBACK',
    );

    await assertCandidateRows(
      ROLLBACK_USER,
      1,
      1,
    );

    console.log('✓ ROLLBACK preserves DB + suppresses storage cleanup');

    console.log();
    console.log(
      'OK: PgStore shared ZOS runtime integration passed',
    );
  } finally {
    storage.delete = originalDelete;
    await store.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
