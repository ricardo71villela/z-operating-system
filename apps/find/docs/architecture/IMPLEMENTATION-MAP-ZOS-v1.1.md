# Z Find — ZOS v1.1 Implementation Map

| Area | Existing implementation | Decision | ZOS v1.1 action |
|---|---|---|---|
| Property identity | `properties` | KEEP | Registry binding only |
| Development identity | `developments` | KEEP | Registry binding only |
| Organisation | `organisations` | ADAPT | Future ZOS Organisation binding |
| Partner | `partners` | ADAPT | Keep vertical profile/capability; bridge legacy identity |
| Representation | `representations` | KEEP | First-class relationship; add durable history/Trust |
| Listing | `listings` | KEEP | Marketplace projection, not Registry entity |
| Listing lifecycle | `listings.status` | ADAPT | Preserve states, record transitions |
| Representation lifecycle | `representations.status` | ADAPT | Preserve states, record transitions |
| Trust | `partners.trust_level` | ADAPT | Legacy projection; assessments become source of verification truth |
| Property facts | columns on `properties` | KEEP + EVOLVE | Columns stay read projection; Observations add provenance/history |
| Price history | `price_history` | KEEP | Domain-specific temporal projection |
| Geography | `zones_lite`, `packages/geography` | ADAPT | Zone Lite stays UI/search projection; optional canonical binding |
| Import workflow | `packages/import-engine` | KEEP | Strong bounded-context workflow; no premature ZOS extraction |
| Canonical import store | `canonical-store-v2` | ADAPT | Clarified as Geography local authoritative history, not global Registry |
| Integration | implicit/direct | ADAPT | Transactional outbox foundation |
| Identity | `profiles` + Supabase Auth | ADAPT | Future ZOS Person binding without changing auth IDs |
