# Z Find — market data (France, Belgium, Luxembourg)

Official price statistics shown on the France, Belgique and Luxembourg market pages
(`apps/zfind-web/src/services/market-prices.js`). Only aggregated statistics are
published — never an individual sale.

| Country | Source | Content | Update |
| --- | --- | --- | --- |
| France | DVF — DGFiP, data.gouv.fr (Licence Ouverte) | median €/m² (P25/P50/P75, n) of houses and apartments by commune, Paris/Lyon/Marseille arrondissement, department and France; last 5 years + last 2 years together | twice a year (April, October) |
| Belgium | Statbel (registered deeds, SPF Finances) | median sale price (P25/P50/P75, n) of houses and apartments by commune, arrondissement, province, region; 5 years + recent half-years | twice a year |
| Luxembourg | Observatoire de l'Habitat (data.public.lu) | €/m² of apartments from notarial deeds (existing and VEFA) and advertised prices of apartments/houses by commune; Luxembourg-City districts (advertised) | quarterly |

DVF excludes Bas-Rhin, Haut-Rhin, Moselle and Mayotte. Belgium publishes no price per m².

## Pipeline

1. **Extraction** — the official sites are not reachable from the build sandbox, so the
   raw files are processed in a browser session on an operator machine and only the
   aggregates are exported (`dvf_stats.csv`, `be_stats_communes.csv`,
   `be_stats_secteurs.csv`, `lu_raw.txt`). DVF method: sales (`Vente`) of exactly one
   dwelling (one house or one apartment, outbuildings allowed, no commercial premises),
   built surface ≥ 9 m², price per m² between 300 € and 40 000 €, figures published
   from 5 sales.
2. `build_market_tables.py` — tidy CSV tables keyed on INSEE / REFNIS / LU codes.
3. `build_market_data.py` — the compact JSON files in `apps/zfind-web/public/market-data/`.

A quarterly scheduled task re-runs the extraction and delivers refreshed tables.
