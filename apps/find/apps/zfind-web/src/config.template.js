/* ============================================================
   Z FIND — BUILD-TIME CONFIG INJECTION (Sprint 1.1)
   ============================================================
   __SUPABASE_URL__ and __SUPABASE_ANON_KEY__ are resolved by
   scripts/build.js from the BUILDER's environment variables
   (SUPABASE_URL / SUPABASE_ANON_KEY) at build time — never
   committed here as real values, exactly like __PATH_D__ in
   body.html. The build refuses to produce output if either
   placeholder survives unresolved (see build.js).
   ============================================================ */
window.__ZFIND_CONFIG__ = {
  supabaseUrl: '__SUPABASE_URL__',
  supabaseAnonKey: '__SUPABASE_ANON_KEY__',
};
