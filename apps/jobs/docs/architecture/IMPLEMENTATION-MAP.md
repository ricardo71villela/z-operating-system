# Z Jobs implementation map — ZOS v1.1

| Area | Existing implementation | Decision |
|---|---|---|
| Person identity | `persons`, Supabase Auth | ADAPT / future ZOS Registry ref |
| Organizations | `organizations`, memberships, invitations | ADAPT / strongest promotion candidate |
| Geography | countries/locales/locations/currencies | ADAPT / shared ZOS candidate |
| Candidate | candidate tables + domain rules | KEEP in Z Jobs |
| Employer profile | `company_profiles` | KEEP in Z Jobs |
| Verification | operational status on company profile | ADAPT; assessment history separated |
| Job Offer | `job_offers`, rules, revisions | KEEP in Z Jobs |
| Job Offer lifecycle | explicit enum + transition rules | KEEP; add durable history |
| Applications | application state machine + history | KEEP |
| Salary reference | sourced employment data | KEEP semantics; map sourced facts to Observations over time |
| Matching | `matching.ts`, migration 0024 | KEEP in Z Jobs |
| Candidate score | advisory domain rule | KEEP in Z Jobs |
| i18n | normalized translations | ADAPT / shared capability candidate |
| Audit | `audit_logs` + security-definer writer | ADAPT / shared ZOS candidate |
| Integration | direct API today | ADAPT; outbox bridge added |
| Data observations | not previously formalized | ADDED |
| Registry bridge | not previously formalized | ADDED |

## Promotion rule

Nothing is moved to a shared package merely because it looks generic. Promotion
requires demonstrated use by at least two verticals and a stable contract.
