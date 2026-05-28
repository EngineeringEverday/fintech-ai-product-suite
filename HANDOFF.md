# Merchant Risk Scoring — Build Handoff

## Status: COMPLETE

A runnable full-stack repo and portfolio artifact framed as a **risk scoring** system (likelihood of financial loss to platform from chargebacks, fraud, regulatory/compliance violations) for an Indian payments aggregator like Paytm. Risk is the primary label; churn is secondary.

## Deployed Preview

- **URL:** https://www.perplexity.ai/computer/a/sentinel-merchant-risk-_moXnbG0TVuK0WJBgbb4rA
- The static preview uses an in-browser **mock API** (`frontend/src/lib/mockApi.ts`) that mirrors the FastAPI scoring + rules logic, so all four pages (Lookup, Merchant 360, Portfolio, Model) are fully interactive without the backend running.
- Verified visually: Lookup page renders gauge + waterfall + override card; Portfolio shows KPIs (60% / +34% / 100→38% / 7.1% override), 4 charts, top-20 table; Model page shows global SHAP, all 6 artifact PNGs, confusion matrix heatmap, and the rendered model card.

## Project Path

`/home/user/workspace/merchant-risk-scoring/`

## Run It Locally

```bash
cd /home/user/workspace/merchant-risk-scoring
docker-compose up --build      # API on :8000, web on :5173
```

Without docker:

```bash
pip install -r requirements.txt
python scripts/generate_dataset.py --quick
python training/train_models.py --quick
uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev   # :5173
```

## Key Files

| Path | Purpose |
| --- | --- |
| `README.md` | Mermaid architecture, business impact table, score→action map, XGBoost rationale, plain-English SHAP, business rules, API ref, limitations, v2 roadmap |
| `notebooks/merchant_risk_eda_modeling.ipynb` | EDA → modeling → SHAP → impact simulation |
| `scripts/generate_dataset.py` | 50K rows (`--quick` = 5K), 65/25/10 risk mix, 5% noise |
| `training/train_models.py` | XGBoost + Optuna (50 trials; `--quick` = 5), isotonic calibration, native `pred_contribs` SHAP plots, MLflow optional |
| `app/main.py` | FastAPI lifespan: loads artifacts, seeds SQLite from CSV |
| `app/services/scoring.py` | `ModelBundle` lazy-load, model + deterministic fallback, applies business rules |
| `app/services/rules.py` | 4 rules: prohibited MCC (7995) / dispute > 5% / KYB < 0.3 / vintage < 30d |
| `frontend/src/pages/*` | Lookup / Merchant360 / Dashboard / ModelPage |
| `frontend/src/lib/mockApi.ts` | In-browser mirror for static preview |
| `tests/` | 19 pytest tests (dataset, rules, API) |
| `Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` | Two-service setup |
| `.pre-commit-config.yaml` | ruff + pytest |

## Generated Artifacts (in `artifacts/`)

- `risk_model.json`, `churn_model.json`, `encoders.pkl`, `features.json`
- `metrics.json` — risk macro-F1 ~0.77, churn AUC ~0.56 (on 5K quick run)
- `model_card.md` — owner, intended use, risk vs churn, calibration, limitations, v2
- `confusion_matrix.png`, `roc_curve.png`, `pr_curve.png`, `shap_summary.png`, `shap_dependence.png`, `shap_waterfall.png`
- `industry_benchmarks.json`

## Verification

- `python -m pytest tests/ -q` → **19 passed**
- `python scripts/generate_dataset.py --quick` → 5K rows, mix 0.62/0.26/0.11
- `python training/train_models.py --quick` → all artifacts created
- `cd frontend && npm run build` → succeeds (655KB JS, 22KB CSS)
- Playwright on built dist: scoring flow works (prohibited MCC → tier=Critical, 1 override fired, top SHAP factors `chargebacks_per_1k_txn`, `prohibited_mcc_flag`, `aml_alerts_30d`); Portfolio page renders all KPIs and charts; Model page renders all artifact images + model card.

## Debug Fix Applied After Handoff

- `Dockerfile` now uses `python:3.11-slim` to match the requested stack.
- `docker-compose.yml` no longer bind-mounts `./data` or `./artifacts`, because those mounts can hide the generated in-image demo artifacts on a fresh unzip/clone.
- `web` now waits for the API service health check before starting.
- Added `.dockerignore` so Docker builds do not package `node_modules`, cache folders, built frontend files, local SQLite DBs, or zip archives.
- Reverified after the patch: `python -m pytest tests -q` → **19 passed**; `cd frontend && npm run build` → succeeds.

## Notable Technical Decisions

- **XGBoost native `pred_contribs`** for SHAP (Tree SHAP values) instead of the `shap` library — avoids NumPy 2.x dtype crash and removes a heavy dependency from serve time.
- **Saved `booster` directly** (not `XGBClassifier`) — XGBoost 2.1.2 sklearn-wrapper has a save-bug.
- **Mock API fallback** lets the static deploy show full UX without the FastAPI service.
- **HashRouter** in the frontend so the static deploy works inside iframes/proxies.
- **Dynamic Tailwind col-span** fixed in `ModelPage.tsx` `ArtifactCard` by mapping integer → literal class string so the JIT purge keeps the classes.
- **Override-rate dedup** in `app/db.py` — groups by `(merchant_id, ts-minute)` so a single scoring event with 4 rules fired counts as one override.
