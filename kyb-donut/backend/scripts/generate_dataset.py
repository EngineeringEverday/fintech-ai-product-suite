"""Generate synthetic Indian KYB documents (PNG + paired JSON annotations).

Doc layouts roughly resemble:
  - GST Registration Certificate (GSTN portal style: blue header, seal, table)
  - PAN Card (NSDL/UTI style with Income Tax India header)
  - Shop & Establishment Certificate (state labour dept style)
  - Certificate of Incorporation (MCA style)
  - Udyam / MSME Registration

Output structure (HuggingFace ImageFolder-friendly):
    data/generated/
        train/ {doc_type}/ *.png  *.json
        val/   {doc_type}/ *.png  *.json
        test/  {doc_type}/ *.png  *.json
        metadata.jsonl   (each row: file_name, doc_type, ground_truth)

Usage:
    python scripts/generate_dataset.py --per-type 200 --out data/generated
"""
from __future__ import annotations

import argparse
import json
import os
import random
import string
import sys
from datetime import datetime, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Optional Faker; if missing, we fallback to internal lists.
try:
    from faker import Faker
    fake = Faker("en_IN")
except Exception:
    fake = None

# Local import for GSTIN checksum
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.validators import gstin_checksum  # noqa: E402

# ----------------- helpers -----------------
STATES = [
    ("27", "Maharashtra", "MH"),
    ("29", "Karnataka", "KA"),
    ("07", "Delhi", "DL"),
    ("33", "Tamil Nadu", "TN"),
    ("19", "West Bengal", "WB"),
    ("36", "Telangana", "TG"),
    ("24", "Gujarat", "GJ"),
    ("09", "Uttar Pradesh", "UP"),
]
ALPHA = string.ascii_uppercase
DIGITS = string.digits


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _rand_company(r: random.Random) -> str:
    if fake:
        return fake.company()
    return r.choice(["Lotus", "Sunrise", "Vega", "Indra", "Orchid"]) + " " + r.choice(["Foods Pvt Ltd", "Traders LLP", "Industries Pvt Ltd"])


def _rand_person(r: random.Random) -> str:
    if fake:
        return fake.name()
    return r.choice(["Aarav Sharma", "Ananya Iyer", "Ishaan Patel"])


def _rand_addr(r: random.Random, state: str) -> str:
    if fake:
        return f"{fake.building_number()}, {fake.street_name()}, {fake.city()}, {state}"
    return f"{r.randint(1, 999)}, MG Road, {state}"


def _date_dmy(r: random.Random, y_min: int = 2015, y_max: int = 2023) -> str:
    y = r.randint(y_min, y_max)
    m = r.randint(1, 12)
    d = r.randint(1, 28)
    return f"{d:02d}/{m:02d}/{y}"


def _gstin(r: random.Random, state_code: str | None = None) -> str:
    state = state_code or r.choice(STATES)[0]
    body = (
        state
        + "".join(r.choice(ALPHA) for _ in range(5))
        + "".join(r.choice(DIGITS) for _ in range(4))
        + r.choice(ALPHA)
        + r.choice("123456789" + ALPHA)
        + "Z"
    )
    return body + gstin_checksum(body)


def _pan(r: random.Random, entity_code: str | None = None) -> tuple[str, str]:
    code = entity_code or r.choice(["P", "C", "F"])
    entity_name = {"P": "Individual", "C": "Company", "F": "Firm"}[code]
    pan = (
        "".join(r.choice(ALPHA) for _ in range(3))
        + code
        + r.choice(ALPHA)
        + "".join(r.choice(DIGITS) for _ in range(4))
        + r.choice(ALPHA)
    )
    return pan, entity_name


# ----------------- layout primitives -----------------
def _new_canvas(w: int = 1280, h: int = 960, bg=(255, 255, 255)) -> Image.Image:
    return Image.new("RGB", (w, h), bg)


def _draw_seal(d: ImageDraw.ImageDraw, x: int, y: int, label: str = "GOVT OF INDIA"):
    d.ellipse([x - 55, y - 55, x + 55, y + 55], outline=(20, 40, 80), width=2)
    d.ellipse([x - 45, y - 45, x + 45, y + 45], outline=(20, 40, 80), width=1)
    d.text((x - 45, y - 8), label, fill=(20, 40, 80), font=_font(10, True))


def _apply_noise(img: Image.Image, r: random.Random) -> Image.Image:
    # rotation up to ±3 degrees
    angle = r.uniform(-3.0, 3.0)
    img = img.rotate(angle, resample=Image.BICUBIC, fillcolor=(255, 255, 255))
    # brightness 0.85..1.15
    from PIL import ImageEnhance
    img = ImageEnhance.Brightness(img).enhance(r.uniform(0.85, 1.15))
    # subtle blur
    if r.random() < 0.35:
        img = img.filter(ImageFilter.GaussianBlur(radius=0.6))
    # occasional watermark
    if r.random() < 0.18:
        wm = Image.new("RGBA", img.size, (255, 255, 255, 0))
        wd = ImageDraw.Draw(wm)
        wd.text((img.width // 2 - 90, img.height // 2 + 200), "SAMPLE", fill=(150, 150, 150, 90), font=_font(80, True))
        img = Image.alpha_composite(img.convert("RGBA"), wm).convert("RGB")
    return img


def _save_with_jpeg_artifact(img: Image.Image, path: Path, r: random.Random) -> None:
    if r.random() < 0.4:
        # roundtrip via JPEG to introduce real compression artifacts
        tmp = path.with_suffix(".jpg")
        img.save(tmp, "JPEG", quality=r.randint(55, 85))
        img2 = Image.open(tmp).convert("RGB")
        os.remove(tmp)
        img2.save(path)
    else:
        img.save(path)


# ----------------- per-doc renderers -----------------
def render_gst(r: random.Random) -> tuple[Image.Image, dict]:
    state_code, state_name, _ = r.choice(STATES)
    legal = _rand_company(r)
    trade = legal.replace(" Pvt Ltd", "").replace(" LLP", "")
    gstin = _gstin(r, state_code)
    reg_date = _date_dmy(r, 2017, 2024)
    btype = r.choice(["Regular", "Composition"])
    addr = _rand_addr(r, state_name)
    taxpayer = r.choice(["Regular", "SEZ Unit", "Casual Taxable Person"])

    img = _new_canvas()
    d = ImageDraw.Draw(img)
    # Header bar
    d.rectangle([0, 0, img.width, 88], fill=(11, 60, 120))
    d.text((40, 18), "GOVERNMENT OF INDIA", fill="white", font=_font(20, True))
    d.text((40, 50), "Goods and Services Tax  -  Registration Certificate", fill="white", font=_font(16))
    d.text((img.width - 220, 30), "Form GST REG-06", fill="white", font=_font(14, True))

    # Body
    fields = [
        ("Registration Number (GSTIN)", gstin),
        ("Legal Name of Business", legal),
        ("Trade Name (if any)", trade),
        ("Constitution / Business Type", btype),
        ("Date of Registration", reg_date),
        ("Principal Place of Business", addr),
        ("State Jurisdiction", state_name),
        ("Taxpayer Type", taxpayer),
    ]
    y = 140
    for label, value in fields:
        d.text((60, y), label, fill=(50, 50, 50), font=_font(14))
        d.line([(60, y + 26), (img.width - 60, y + 26)], fill=(220, 220, 220))
        d.text((420, y), str(value), fill=(15, 15, 15), font=_font(16, True))
        y += 52

    # Footer + seal
    _draw_seal(d, img.width - 130, img.height - 130, "GSTN")
    d.text((60, img.height - 60), "This is a system-generated certificate.", fill=(120, 120, 120), font=_font(12))

    gt = {
        "gstin": gstin,
        "legal_name": legal,
        "trade_name": trade,
        "registration_date": reg_date,
        "business_type": btype,
        "principal_place_of_business": addr,
        "state_jurisdiction": state_name,
        "taxpayer_type": taxpayer,
    }
    return img, gt


def render_pan(r: random.Random) -> tuple[Image.Image, dict]:
    pan, entity_name = _pan(r)
    is_individual = entity_name == "Individual"
    name = _rand_person(r) if is_individual else _rand_company(r)
    dob = _date_dmy(r, 1970 if is_individual else 2005, 2002 if is_individual else 2022)

    # PAN card is landscape 86mm x 54mm -> 800 x 500
    img = _new_canvas(800, 500, (243, 240, 232))
    d = ImageDraw.Draw(img)
    # Top: Govt of India + Income Tax Dept
    d.rectangle([0, 0, img.width, 68], fill=(193, 39, 45))
    d.text((20, 8), "INCOME TAX DEPARTMENT", fill="white", font=_font(18, True))
    d.text((20, 34), "GOVT. OF INDIA", fill="white", font=_font(14))
    d.text((img.width - 220, 34), "Permanent Account Number", fill="white", font=_font(12))

    # Field block
    d.text((30, 110), "Name", fill=(60, 60, 60), font=_font(12))
    d.text((30, 132), name.upper(), fill=(20, 20, 20), font=_font(18, True))

    d.text((30, 180), "Father's Name / Date of Birth" if is_individual else "Date of Incorporation",
           fill=(60, 60, 60), font=_font(12))
    d.text((30, 202), dob, fill=(20, 20, 20), font=_font(16, True))

    d.text((30, 250), "Permanent Account Number", fill=(60, 60, 60), font=_font(12))
    d.text((30, 272), pan, fill=(0, 0, 0), font=_font(28, True))

    d.text((30, 330), f"Entity Type: {entity_name}", fill=(60, 60, 60), font=_font(12))
    # Signature placeholder
    d.line([(30, 410), (300, 410)], fill=(120, 120, 120), width=1)
    d.text((30, 415), "Signature", fill=(120, 120, 120), font=_font(10))

    gt = {
        "pan_number": pan,
        "name": name,
        "dob_or_incorporation": dob,
        "entity_type": entity_name,
    }
    return img, gt


def render_shop(r: random.Random) -> tuple[Image.Image, dict]:
    state_code, state_name, abbr = r.choice(STATES)
    owner = _rand_person(r)
    establishment = _rand_company(r)
    year = r.randint(2020, 2024)
    reg_no = f"SE/{abbr}/{r.randint(1000, 9999)}/{year}"
    valid_from = f"01/01/{year}"
    valid_to_year = year + r.choice([1, 3, 5])
    valid_to = f"31/12/{valid_to_year}"
    category = r.choice(["Shop", "Commercial Establishment", "Restaurant"])
    auth = f"Labour Department, Government of {state_name}"
    addr = _rand_addr(r, state_name)

    img = _new_canvas()
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, img.width, 76], fill=(48, 92, 48))
    d.text((40, 16), f"GOVERNMENT OF {state_name.upper()}", fill="white", font=_font(20, True))
    d.text((40, 46), "Shops and Establishments Act - Certificate of Registration", fill="white", font=_font(14))

    fields = [
        ("Establishment Name", establishment),
        ("Owner / Employer", owner),
        ("Registration Number", reg_no),
        ("Category", category),
        ("Address of Establishment", addr),
        ("Valid From", valid_from),
        ("Valid To", valid_to),
        ("Issuing Authority", auth),
    ]
    y = 140
    for label, value in fields:
        d.text((60, y), label, fill=(60, 60, 60), font=_font(14))
        d.line([(60, y + 26), (img.width - 60, y + 26)], fill=(220, 220, 220))
        d.text((420, y), str(value), fill=(15, 15, 15), font=_font(16, True))
        y += 52
    _draw_seal(d, img.width - 130, img.height - 130, abbr + " LABOUR")

    gt = {
        "establishment_name": establishment,
        "owner_name": owner,
        "registration_number": reg_no,
        "address": addr,
        "category": category,
        "valid_from": valid_from,
        "valid_to": valid_to,
        "issuing_authority": auth,
    }
    return img, gt


def render_incorporation(r: random.Random) -> tuple[Image.Image, dict]:
    state_code, state_name, abbr = r.choice(STATES)
    year = r.randint(2010, 2024)
    cin = f"U{r.randint(10000, 99999)}{abbr}{year}PTC{r.randint(100000, 999999)}"
    company = _rand_company(r)
    inc_date = _date_dmy(r, year, year)
    addr = _rand_addr(r, state_name)
    cap = f"INR {r.choice([1, 5, 10, 25, 50]) * 100000:,}"

    img = _new_canvas()
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, img.width, 88], fill=(80, 30, 100))
    d.text((40, 16), "MINISTRY OF CORPORATE AFFAIRS", fill="white", font=_font(20, True))
    d.text((40, 48), "Certificate of Incorporation", fill="white", font=_font(16))

    fields = [
        ("Corporate Identity Number (CIN)", cin),
        ("Name of the Company", company),
        ("Date of Incorporation", inc_date),
        ("Registered Office Address", addr),
        ("Authorized Share Capital", cap),
    ]
    y = 160
    for label, value in fields:
        d.text((60, y), label, fill=(60, 60, 60), font=_font(14))
        d.line([(60, y + 26), (img.width - 60, y + 26)], fill=(220, 220, 220))
        d.text((480, y), str(value), fill=(15, 15, 15), font=_font(16, True))
        y += 64
    _draw_seal(d, img.width - 130, img.height - 130, "MCA")
    d.text((60, img.height - 60), "Issued under section 7(2) of the Companies Act, 2013", fill=(120, 120, 120), font=_font(12))

    gt = {
        "cin": cin,
        "company_name": company,
        "incorporation_date": inc_date,
        "registered_office": addr,
        "authorized_capital": cap,
    }
    return img, gt


def render_udyam(r: random.Random) -> tuple[Image.Image, dict]:
    state_code, state_name, abbr = r.choice(STATES)
    udyam = f"UDYAM-{abbr}-{r.randint(10, 99):02d}-{r.randint(1000000, 9999999):07d}"
    enterprise = _rand_company(r)
    activity = r.choice(["Manufacturing", "Services"])
    nic = f"{r.randint(10, 99)}{r.randint(100, 999)}"

    img = _new_canvas()
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, img.width, 84], fill=(204, 102, 0))
    d.text((40, 14), "MINISTRY OF MSME, GOVERNMENT OF INDIA", fill="white", font=_font(18, True))
    d.text((40, 46), "Udyam Registration Certificate", fill="white", font=_font(16))

    fields = [
        ("Udyam Registration Number", udyam),
        ("Name of Enterprise", enterprise),
        ("Major Activity", activity),
        ("NIC Code", nic),
        ("State", state_name),
    ]
    y = 160
    for label, value in fields:
        d.text((60, y), label, fill=(60, 60, 60), font=_font(14))
        d.line([(60, y + 26), (img.width - 60, y + 26)], fill=(220, 220, 220))
        d.text((420, y), str(value), fill=(15, 15, 15), font=_font(16, True))
        y += 64

    _draw_seal(d, img.width - 130, img.height - 130, "MSME")

    gt = {
        "udyam_number": udyam,
        "enterprise_name": enterprise,
        "major_activity": activity,
        "nic_code": nic,
    }
    return img, gt


RENDERERS = {
    "gst": render_gst,
    "pan": render_pan,
    "shop_establishment": render_shop,
    "incorporation": render_incorporation,
    "udyam": render_udyam,
}


# ----------------- driver -----------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-type", type=int, default=200)
    ap.add_argument("--out", default="data/generated")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    out_root = Path(args.out)
    metadata_path = out_root / "metadata.jsonl"
    out_root.mkdir(parents=True, exist_ok=True)

    splits = [("train", 0.8), ("val", 0.1), ("test", 0.1)]
    with open(metadata_path, "w") as mf:
        for dtype, renderer in RENDERERS.items():
            for split, _ in splits:
                (out_root / split / dtype).mkdir(parents=True, exist_ok=True)
            for i in range(args.per_type):
                # Deterministic per-doc rng for reproducibility
                doc_rng = random.Random(args.seed * 100003 + hash(dtype) + i)
                img, gt = renderer(doc_rng)
                img = _apply_noise(img, doc_rng)

                # split assignment
                t = doc_rng.random()
                if t < 0.8:
                    split = "train"
                elif t < 0.9:
                    split = "val"
                else:
                    split = "test"

                fname = f"{dtype}_{i:04d}.png"
                img_path = out_root / split / dtype / fname
                _save_with_jpeg_artifact(img, img_path, doc_rng)
                json_path = img_path.with_suffix(".json")
                json_path.write_text(json.dumps(gt, indent=2))
                mf.write(json.dumps({
                    "file_name": str(img_path.relative_to(out_root)),
                    "doc_type": dtype,
                    "split": split,
                    "ground_truth": gt,
                }) + "\n")

    # Summary
    total = args.per_type * len(RENDERERS)
    print(f"Generated {total} documents across {len(RENDERERS)} types in {out_root}")
    print(f"Manifest: {metadata_path}")


if __name__ == "__main__":
    main()
