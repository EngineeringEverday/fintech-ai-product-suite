"""
PayCommander mock data generator.

Creates everything the pipeline needs on first run:
- data/mock/merchant_profile.json      80+ US merchants -> MIDs
- data/mock/DOMAIN_REGISTRY.json       domain -> skills/domains/*.py
- data/mock/ach_tx_YYYY_MM_DD.csv      seven daily ACH files
- data/mock/card_analytics.db          SQLite DWH with 10,000+ rows
                                       and pipeline_events audit log

Deterministic: seeded RNG so dashboards are stable across restarts.
"""

from __future__ import annotations

import csv
import json
import os
import random
import sqlite3
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent
MOCK_DIR = HERE / "mock"
MOCK_DIR.mkdir(parents=True, exist_ok=True)

MERCHANT_FILE = MOCK_DIR / "merchant_profile.json"
DOMAIN_REGISTRY_FILE = MOCK_DIR / "DOMAIN_REGISTRY.json"
DWH_FILE = MOCK_DIR / "card_analytics.db"

SEED = 7
random.seed(SEED)

# ---------------------------------------------------------------------------
# Merchant catalog -- 80+ real US brands across required verticals
# ---------------------------------------------------------------------------
@dataclass
class Merchant:
    mid: str
    name: str
    vertical: str
    primary_payment_method: str  # "ACH" | "Card"
    risk_tier: str               # "Low" | "Medium" | "High"
    acquiring_bank: str


ACQUIRERS = [
    "JPMorgan Chase Merchant Services",
    "Bank of America Merchant Services",
    "Wells Fargo Merchant Services",
    "Stripe (Wells Fargo BIN-sponsored)",
    "Adyen N.V.",
    "Fiserv (First Data)",
    "Worldpay from FIS",
    "Global Payments",
    "Elavon (U.S. Bank)",
    "Square Financial Services",
]

# (name, vertical, primary_payment_method, risk_tier)
_CATALOG = [
    # E-commerce
    ("Amazon",         "E-commerce", "Card", "Low"),
    ("eBay",           "E-commerce", "Card", "Medium"),
    ("Etsy",           "E-commerce", "Card", "Medium"),
    ("Walmart.com",    "E-commerce", "Card", "Low"),
    ("Target.com",     "E-commerce", "Card", "Low"),
    ("Wayfair",        "E-commerce", "Card", "Medium"),
    ("Newegg",         "E-commerce", "Card", "Medium"),
    ("Best Buy",       "E-commerce", "Card", "Low"),
    ("Chewy",          "E-commerce", "Card", "Low"),
    ("Costco.com",     "E-commerce", "Card", "Low"),

    # Food delivery
    ("DoorDash",       "Food Delivery", "Card", "Medium"),
    ("Uber Eats",      "Food Delivery", "Card", "Medium"),
    ("Grubhub",        "Food Delivery", "Card", "Medium"),
    ("Instacart",      "Food Delivery", "Card", "Medium"),
    ("Postmates",      "Food Delivery", "Card", "Medium"),
    ("Caviar",         "Food Delivery", "Card", "Medium"),
    ("Gopuff",         "Food Delivery", "Card", "Medium"),

    # Mobility
    ("Uber",           "Mobility", "Card", "Medium"),
    ("Lyft",           "Mobility", "Card", "Medium"),
    ("Turo",           "Mobility", "Card", "High"),
    ("Lime",           "Mobility", "Card", "Medium"),
    ("Bird",           "Mobility", "Card", "Medium"),
    ("Hertz",          "Mobility", "Card", "Medium"),
    ("Avis",           "Mobility", "Card", "Medium"),
    ("Enterprise",     "Mobility", "Card", "Low"),
    ("Zipcar",         "Mobility", "Card", "Medium"),

    # Streaming / SaaS
    ("Netflix",        "Streaming/SaaS", "Card", "Low"),
    ("Hulu",           "Streaming/SaaS", "Card", "Low"),
    ("Disney+",        "Streaming/SaaS", "Card", "Low"),
    ("Spotify",        "Streaming/SaaS", "Card", "Low"),
    ("Apple Music",    "Streaming/SaaS", "Card", "Low"),
    ("HBO Max",        "Streaming/SaaS", "Card", "Low"),
    ("Peacock",        "Streaming/SaaS", "Card", "Low"),
    ("Paramount+",     "Streaming/SaaS", "Card", "Low"),
    ("YouTube Premium","Streaming/SaaS", "Card", "Low"),
    ("Adobe Creative Cloud", "Streaming/SaaS", "Card", "Low"),
    ("Microsoft 365",  "Streaming/SaaS", "Card", "Low"),
    ("Dropbox",        "Streaming/SaaS", "Card", "Low"),
    ("Slack",          "Streaming/SaaS", "Card", "Low"),
    ("Zoom",           "Streaming/SaaS", "Card", "Low"),
    ("Notion",         "Streaming/SaaS", "Card", "Low"),

    # Travel
    ("Airbnb",         "Travel", "Card", "Medium"),
    ("Booking.com",    "Travel", "Card", "Medium"),
    ("Expedia",        "Travel", "Card", "Medium"),
    ("Vrbo",           "Travel", "Card", "Medium"),
    ("Delta Air Lines","Travel", "Card", "Low"),
    ("United Airlines","Travel", "Card", "Low"),
    ("Southwest Airlines","Travel", "Card", "Low"),
    ("American Airlines","Travel", "Card", "Low"),
    ("JetBlue",        "Travel", "Card", "Low"),
    ("Marriott",       "Travel", "Card", "Low"),
    ("Hilton",         "Travel", "Card", "Low"),
    ("Hyatt",          "Travel", "Card", "Low"),

    # Retail / QSR
    ("Starbucks",      "Retail/QSR", "Card", "Low"),
    ("McDonald's",     "Retail/QSR", "Card", "Low"),
    ("Chipotle",       "Retail/QSR", "Card", "Low"),
    ("Domino's",       "Retail/QSR", "Card", "Low"),
    ("Subway",         "Retail/QSR", "Card", "Low"),
    ("Taco Bell",      "Retail/QSR", "Card", "Low"),
    ("Panera Bread",   "Retail/QSR", "Card", "Low"),
    ("Dunkin'",        "Retail/QSR", "Card", "Low"),
    ("Home Depot",     "Retail/QSR", "Card", "Low"),
    ("Lowe's",         "Retail/QSR", "Card", "Low"),
    ("CVS",            "Retail/QSR", "Card", "Low"),
    ("Walgreens",      "Retail/QSR", "Card", "Low"),

    # Fintech (ACH-heavy)
    ("PayPal",         "Fintech", "ACH", "Medium"),
    ("Venmo",          "Fintech", "ACH", "Medium"),
    ("Cash App",       "Fintech", "ACH", "Medium"),
    ("Zelle",          "Fintech", "ACH", "Low"),
    ("Robinhood",      "Fintech", "ACH", "High"),
    ("Coinbase",       "Fintech", "ACH", "High"),
    ("Chime",          "Fintech", "ACH", "Medium"),
    ("SoFi",           "Fintech", "ACH", "Medium"),
    ("Plaid",          "Fintech", "ACH", "Medium"),
    ("Stripe Treasury","Fintech", "ACH", "Medium"),
    ("Brex",           "Fintech", "ACH", "Medium"),
    ("Ramp",           "Fintech", "ACH", "Medium"),

    # Healthcare
    ("Teladoc",        "Healthcare", "Card", "Low"),
    ("CVS Health",     "Healthcare", "ACH", "Low"),
    ("Walgreens Health","Healthcare", "ACH", "Low"),
    ("One Medical",    "Healthcare", "Card", "Low"),
    ("Hims & Hers",    "Healthcare", "Card", "Medium"),
    ("Ro",             "Healthcare", "Card", "Medium"),
    ("GoodRx",         "Healthcare", "Card", "Low"),
    ("Capsule Pharmacy","Healthcare", "Card", "Medium"),
]


def build_merchants() -> List[Merchant]:
    merchants: List[Merchant] = []
    for i, (name, vertical, ppm, risk) in enumerate(_CATALOG, start=1):
        mid = f"MID{1000 + i:05d}"
        bank = ACQUIRERS[i % len(ACQUIRERS)]
        merchants.append(Merchant(mid, name, vertical, ppm, risk, bank))
    return merchants


# ---------------------------------------------------------------------------
# Domain registry
# ---------------------------------------------------------------------------
DOMAIN_REGISTRY = {
    "authorization_rate": "skills/domains/authorization_rate.py",
    "payment_volume":     "skills/domains/payment_volume.py",
    "decline_analysis":   "skills/domains/decline_analysis.py",
    "chargeback_rate":    "skills/domains/chargeback_rate.py",
    "fraud_signals":      "skills/domains/fraud_signals.py",
}

# ---------------------------------------------------------------------------
# Card warehouse + ACH file generators
# ---------------------------------------------------------------------------
CARD_NETWORKS = ["Visa", "Mastercard", "Amex", "Discover"]
CARD_TYPES = ["Credit", "Debit", "Prepaid"]
ISSUERS = [
    "Chase", "Bank of America", "Wells Fargo", "Citi", "Capital One",
    "American Express", "Discover Bank", "US Bank", "PNC", "TD Bank",
]
DECLINE_CODES = [
    ("00",  "Approved"),
    ("05",  "Do Not Honor"),
    ("14",  "Invalid Card Number"),
    ("41",  "Lost Card"),
    ("43",  "Stolen Card"),
    ("51",  "Insufficient Funds"),
    ("54",  "Expired Card"),
    ("57",  "Transaction Not Permitted"),
    ("61",  "Exceeds Withdrawal Limit"),
    ("65",  "Activity Limit Exceeded"),
    ("91",  "Issuer Unavailable"),
]

ACH_RETURN_CODES = [
    "R01",  # Insufficient Funds
    "R02",  # Account Closed
    "R03",  # No Account / Unable to Locate Account
    "R04",  # Invalid Account Number
    "R05",  # Unauthorized Debit to Consumer Account
    "R07",  # Authorization Revoked
    "R08",  # Payment Stopped
    "R09",  # Uncollected Funds
    "R10",  # Customer Advises Not Authorized
    "R11",  # Customer Advises Entry Not in Accordance
    "R16",  # Account Frozen
    "R20",  # Non-Transaction Account
    "R29",  # Corporate Customer Advises Not Authorized
]
DEVICE_TYPES = ["mobile-ios", "mobile-android", "desktop-web", "in-app", "pos-terminal"]


def _utc(date: datetime, hour: int, minute: int, second: int) -> str:
    return date.replace(hour=hour, minute=minute, second=second, microsecond=0,
                        tzinfo=timezone.utc).isoformat()


def write_ach_files(merchants: List[Merchant], days: int = 7) -> List[Path]:
    """Write 7 daily ACH CSVs (ending yesterday) for ACH-primary merchants."""
    ach_merchants = [m for m in merchants if m.primary_payment_method == "ACH"]
    today = datetime.now(timezone.utc).date()
    files: List[Path] = []

    for d in range(days, 0, -1):
        day = today - timedelta(days=d)
        fname = MOCK_DIR / f"ach_tx_{day.strftime('%Y_%m_%d')}.csv"
        with open(fname, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow([
                "MID", "transaction_id", "timestamp", "status",
                "amount_usd", "bank_routing", "return_code", "device_type",
            ])
            # 400-700 ACH transactions per day per merchant for realistic GPV
            for m in ach_merchants:
                n_tx = random.randint(400, 700)
                # Risk tier shapes return rate
                base_return = {"Low": 0.012, "Medium": 0.025, "High": 0.055}[m.risk_tier]
                for i in range(n_tx):
                    txid = f"ACH-{m.mid}-{day.strftime('%Y%m%d')}-{i:05d}"
                    ts = _utc(datetime.combine(day, datetime.min.time()),
                              random.randint(0, 23),
                              random.randint(0, 59),
                              random.randint(0, 59))
                    amt = round(random.lognormvariate(4.2, 0.85), 2)  # ~$30-$500
                    routing = f"{random.randint(10000000, 99999999):08d}"

                    r = random.random()
                    if r < base_return:
                        status = "returned"
                        rcode = random.choices(
                            ACH_RETURN_CODES,
                            weights=[35, 15, 8, 7, 6, 5, 5, 4, 6, 3, 3, 2, 1]
                        )[0]
                    elif r < base_return + 0.02:
                        status = "pending"
                        rcode = ""
                    else:
                        status = "settled"
                        rcode = ""

                    w.writerow([
                        m.mid, txid, ts, status, amt, routing, rcode,
                        random.choice(DEVICE_TYPES),
                    ])
        files.append(fname)
    return files


def write_card_dwh(merchants: List[Merchant], rows_target: int = 120000) -> None:
    """Create SQLite DWH with card_analytics_dwh table + pipeline_events log."""
    if DWH_FILE.exists():
        DWH_FILE.unlink()
    conn = sqlite3.connect(DWH_FILE)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE card_analytics_dwh (
            MID TEXT,
            transaction_id TEXT PRIMARY KEY,
            timestamp TEXT,
            card_network TEXT,
            card_type TEXT,
            auth_status TEXT,          -- 'approved' | 'declined'
            amount_usd REAL,
            decline_code TEXT,
            issuer_bank TEXT,
            is_cnp INTEGER,            -- 1 = card-not-present
            is_fraud_flagged INTEGER
        )
    """)
    cur.execute("CREATE INDEX idx_card_mid_ts ON card_analytics_dwh(MID, timestamp)")
    cur.execute("CREATE INDEX idx_card_network ON card_analytics_dwh(card_network)")

    cur.execute("""
        CREATE TABLE pipeline_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT,
            run_id TEXT,
            agent TEXT,
            level TEXT,                -- INFO | WARN | CRITICAL
            payload_json TEXT
        )
    """)
    cur.execute("CREATE INDEX idx_events_run ON pipeline_events(run_id)")

    card_merchants = [m for m in merchants if m.primary_payment_method == "Card"]
    today = datetime.now(timezone.utc).date()
    rows = []

    # Roughly even distribution across last 30 days
    per_day = max(1, rows_target // 30)
    for d in range(30, 0, -1):
        day = today - timedelta(days=d)
        for _ in range(per_day):
            m = random.choice(card_merchants)
            # Auth rate base by risk tier
            base_auth = {"Low": 0.965, "Medium": 0.91, "High": 0.80}[m.risk_tier]
            # Wobble per day to create trend and produce a few sub-85% merchants
            auth_rate = max(0.72, min(0.995, base_auth + random.uniform(-0.04, 0.03)))
            approved = random.random() < auth_rate
            net = random.choices(CARD_NETWORKS, weights=[55, 30, 10, 5])[0]
            ctype = random.choices(CARD_TYPES, weights=[60, 35, 5])[0]
            amt = round(random.lognormvariate(3.7, 0.9), 2)  # ~$15-$300 typical
            ts = _utc(datetime.combine(day, datetime.min.time()),
                      random.randint(0, 23),
                      random.randint(0, 59),
                      random.randint(0, 59))
            decline_code = ""
            if not approved:
                decline_code = random.choices(
                    [c for c, _ in DECLINE_CODES if c != "00"],
                    weights=[30, 8, 6, 6, 18, 10, 7, 6, 5, 4],
                )[0]
            is_cnp = 1 if random.random() < 0.65 else 0
            is_fraud = 1 if (is_cnp and random.random() < 0.008) else 0
            txid = f"CARD-{m.mid}-{day.strftime('%Y%m%d')}-{random.randint(0, 9_999_999):07d}"
            rows.append((
                m.mid, txid, ts, net, ctype,
                "approved" if approved else "declined",
                amt, decline_code, random.choice(ISSUERS),
                is_cnp, is_fraud,
            ))

    cur.executemany(
        "INSERT OR IGNORE INTO card_analytics_dwh VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        rows,
    )
    conn.commit()

    # Verify count
    cur.execute("SELECT COUNT(*) FROM card_analytics_dwh")
    n = cur.fetchone()[0]
    if n < 10_000:
        # Top off if dedupe trimmed us
        extra = []
        for _ in range(10_500 - n):
            m = random.choice(card_merchants)
            day = today - timedelta(days=random.randint(1, 30))
            ts = _utc(datetime.combine(day, datetime.min.time()),
                      random.randint(0, 23), random.randint(0, 59), random.randint(0, 59))
            extra.append((
                m.mid,
                f"CARD-{m.mid}-{day.strftime('%Y%m%d')}-EXT-{random.randint(0,99999999):08d}",
                ts, random.choice(CARD_NETWORKS), random.choice(CARD_TYPES),
                "approved" if random.random() < 0.93 else "declined",
                round(random.lognormvariate(3.7, 0.9), 2),
                "" if random.random() < 0.93 else "05",
                random.choice(ISSUERS),
                1 if random.random() < 0.65 else 0,
                1 if random.random() < 0.005 else 0,
            ))
        cur.executemany(
            "INSERT OR IGNORE INTO card_analytics_dwh VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            extra,
        )
        conn.commit()

    conn.close()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def generate_all(force: bool = False) -> dict:
    """Generate all mock data. Skip files that already exist unless force=True."""
    merchants = build_merchants()

    if force or not MERCHANT_FILE.exists():
        with open(MERCHANT_FILE, "w") as f:
            json.dump([asdict(m) for m in merchants], f, indent=2)

    if force or not DOMAIN_REGISTRY_FILE.exists():
        with open(DOMAIN_REGISTRY_FILE, "w") as f:
            json.dump(DOMAIN_REGISTRY, f, indent=2)

    # Check whether 7 ACH files for the last 7 days already exist
    today = datetime.now(timezone.utc).date()
    needed = [MOCK_DIR / f"ach_tx_{(today - timedelta(days=d)).strftime('%Y_%m_%d')}.csv"
              for d in range(7, 0, -1)]
    if force or not all(p.exists() for p in needed):
        # Clean any stale ACH files
        for old in MOCK_DIR.glob("ach_tx_*.csv"):
            old.unlink()
        write_ach_files(merchants, days=7)

    if force or not DWH_FILE.exists():
        write_card_dwh(merchants)

    # Verify
    conn = sqlite3.connect(DWH_FILE)
    row_count = conn.execute("SELECT COUNT(*) FROM card_analytics_dwh").fetchone()[0]
    conn.close()

    return {
        "merchant_count": len(merchants),
        "ach_files": sorted(p.name for p in MOCK_DIR.glob("ach_tx_*.csv")),
        "card_rows": row_count,
        "mock_dir": str(MOCK_DIR),
    }


if __name__ == "__main__":
    info = generate_all(force=True)
    print(json.dumps(info, indent=2))
