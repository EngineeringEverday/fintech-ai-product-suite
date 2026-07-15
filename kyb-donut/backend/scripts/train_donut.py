"""Fine-tune naver-clova-ix/donut-base on the synthetic KYB dataset.

Run after generate_dataset.py. Requires GPU for realistic runtime. CPU is
supported but slow (~hours per epoch on full set; minutes on a tiny subset).

Examples:
    # GPU (recommended)
    python scripts/train_donut.py --data data/generated --epochs 8

    # CPU smoke test
    python scripts/train_donut.py --data data/generated --epochs 1 --subset 16

Logs to MLflow at MLFLOW_TRACKING_URI (default http://localhost:5500).
Saves best-by-overall-F1 checkpoint to DONUT_CHECKPOINT_DIR.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

import mlflow
import torch
from PIL import Image
from torch.utils.data import Dataset, DataLoader
from torch.optim import AdamW
from torch.optim.lr_scheduler import LambdaLR
from transformers import DonutProcessor, VisionEncoderDecoderModel

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import settings
from app.models.schemas import DOC_FIELDS
from app.services.inference import TASK_PROMPTS

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("train_donut")


def encode_target(doc_type: str, gt: dict) -> str:
    """Serialize ground-truth as Donut-style nested tokens."""
    parts = [TASK_PROMPTS[doc_type]]
    for f in DOC_FIELDS[doc_type]:
        v = gt.get(f, "")
        parts.append(f"<s_{f}>{v}</s_{f}>")
    return "".join(parts)


def parse_target(seq: str, doc_type: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for f in DOC_FIELDS[doc_type]:
        m = re.search(fr"<s_{f}>(.*?)</s_{f}>", seq)
        out[f] = m.group(1).strip() if m else ""
    return out


class KYBDataset(Dataset):
    def __init__(self, root: Path, split: str, processor: DonutProcessor, max_length: int = 512, subset: int | None = None):
        self.root = root
        self.split = split
        self.processor = processor
        self.max_length = max_length
        self.samples: list[tuple[Path, str, dict]] = []
        for dtype_dir in sorted((root / split).iterdir()):
            if not dtype_dir.is_dir():
                continue
            dtype = dtype_dir.name
            for img_path in sorted(dtype_dir.glob("*.png")):
                json_path = img_path.with_suffix(".json")
                if not json_path.exists():
                    continue
                gt = json.loads(json_path.read_text())
                self.samples.append((img_path, dtype, gt))
        if subset:
            self.samples = self.samples[:subset]

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, i: int):
        img_path, dtype, gt = self.samples[i]
        image = Image.open(img_path).convert("RGB").resize((1280, 960))
        pixel_values = self.processor(image, return_tensors="pt").pixel_values.squeeze(0)
        target = encode_target(dtype, gt)
        labels = self.processor.tokenizer(
            target,
            add_special_tokens=False,
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        ).input_ids.squeeze(0)
        labels[labels == self.processor.tokenizer.pad_token_id] = -100
        return {"pixel_values": pixel_values, "labels": labels, "doc_type": dtype, "gt": gt}


def collate(batch):
    return {
        "pixel_values": torch.stack([b["pixel_values"] for b in batch]),
        "labels": torch.stack([b["labels"] for b in batch]),
        "doc_types": [b["doc_type"] for b in batch],
        "gts": [b["gt"] for b in batch],
    }


def field_f1(preds: list[dict], gts: list[dict], doc_types: list[str]) -> dict[str, float]:
    """Per-field exact-match F1 averaged across docs."""
    tp = defaultdict(int)
    total = defaultdict(int)
    for pred, gt, dtype in zip(preds, gts, doc_types):
        for f in DOC_FIELDS[dtype]:
            total[f] += 1
            if pred.get(f, "").strip() == gt.get(f, "").strip():
                tp[f] += 1
    out = {f: (tp[f] / total[f] if total[f] else 0.0) for f in total}
    out["__overall__"] = sum(tp.values()) / max(sum(total.values()), 1)
    return out


def linear_warmup(optimizer, warmup_steps: int, total_steps: int) -> LambdaLR:
    def fn(step: int) -> float:
        if step < warmup_steps:
            return step / max(warmup_steps, 1)
        return max(0.0, (total_steps - step) / max(total_steps - warmup_steps, 1))
    return LambdaLR(optimizer, fn)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/generated")
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--batch-size", type=int, default=2)
    ap.add_argument("--grad-accum", type=int, default=4)
    ap.add_argument("--lr", type=float, default=3e-5)
    ap.add_argument("--warmup-frac", type=float, default=0.1)
    ap.add_argument("--patience", type=int, default=3)
    ap.add_argument("--subset", type=int, default=None, help="Use only N samples per split for smoke tests")
    args = ap.parse_args()

    mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
    mlflow.set_experiment("kyb-donut")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    log.info("Using device: %s", device)
    use_fp16 = device == "cuda"
    scaler = torch.cuda.amp.GradScaler() if use_fp16 else None

    processor = DonutProcessor.from_pretrained(settings.DONUT_MODEL_NAME)
    model = VisionEncoderDecoderModel.from_pretrained(settings.DONUT_MODEL_NAME)

    # Add special tokens for prompts and fields
    new_tokens: list[str] = list(TASK_PROMPTS.values())
    for fields in DOC_FIELDS.values():
        for f in fields:
            new_tokens.append(f"<s_{f}>")
            new_tokens.append(f"</s_{f}>")
    processor.tokenizer.add_tokens(new_tokens)
    model.decoder.resize_token_embeddings(len(processor.tokenizer))
    model.config.decoder_start_token_id = processor.tokenizer.convert_tokens_to_ids("<s>")
    model.config.pad_token_id = processor.tokenizer.pad_token_id

    train_ds = KYBDataset(Path(args.data), "train", processor, subset=args.subset)
    val_ds = KYBDataset(Path(args.data), "val", processor, subset=args.subset)
    log.info("Train: %d  Val: %d", len(train_ds), len(val_ds))

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=2, collate_fn=collate)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, num_workers=2, collate_fn=collate)

    optimizer = AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    total_steps = (len(train_loader) // args.grad_accum) * args.epochs
    warmup_steps = int(args.warmup_frac * total_steps)
    scheduler = linear_warmup(optimizer, warmup_steps, total_steps)

    model.to(device)
    best_overall = -1.0
    epochs_since_improve = 0
    save_dir = Path(settings.DONUT_CHECKPOINT_DIR)
    save_dir.mkdir(parents=True, exist_ok=True)

    with mlflow.start_run():
        mlflow.log_params({
            "model": settings.DONUT_MODEL_NAME,
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "grad_accum": args.grad_accum,
            "lr": args.lr,
            "device": device,
            "n_train": len(train_ds),
            "n_val": len(val_ds),
        })

        for epoch in range(args.epochs):
            t0 = time.time()
            model.train()
            optimizer.zero_grad()
            running = 0.0
            for step, batch in enumerate(train_loader):
                pixel = batch["pixel_values"].to(device)
                labels = batch["labels"].to(device)
                if use_fp16:
                    with torch.cuda.amp.autocast(dtype=torch.float16):
                        out = model(pixel_values=pixel, labels=labels)
                        loss = out.loss / args.grad_accum
                    scaler.scale(loss).backward()
                else:
                    out = model(pixel_values=pixel, labels=labels)
                    loss = out.loss / args.grad_accum
                    loss.backward()
                running += float(loss.detach()) * args.grad_accum
                if (step + 1) % args.grad_accum == 0:
                    if use_fp16:
                        scaler.step(optimizer); scaler.update()
                    else:
                        optimizer.step()
                    scheduler.step()
                    optimizer.zero_grad()
            avg_train_loss = running / max(len(train_loader), 1)

            # Validation
            model.eval()
            val_loss = 0.0
            preds_all: list[dict] = []
            gts_all: list[dict] = []
            dtypes_all: list[str] = []
            with torch.no_grad():
                for batch in val_loader:
                    pixel = batch["pixel_values"].to(device)
                    labels = batch["labels"].to(device)
                    out = model(pixel_values=pixel, labels=labels)
                    val_loss += float(out.loss)
                    # Greedy generation for F1
                    for i, dtype in enumerate(batch["doc_types"]):
                        prompt_ids = processor.tokenizer(
                            TASK_PROMPTS[dtype], add_special_tokens=False, return_tensors="pt"
                        ).input_ids.to(device)
                        gen = model.generate(
                            pixel_values=pixel[i:i+1],
                            decoder_input_ids=prompt_ids,
                            max_length=384,
                            num_beams=1,
                            pad_token_id=processor.tokenizer.pad_token_id,
                            eos_token_id=processor.tokenizer.eos_token_id,
                            early_stopping=True,
                        )
                        decoded = processor.batch_decode(gen)[0]
                        preds_all.append(parse_target(decoded, dtype))
                        gts_all.append(batch["gts"][i])
                        dtypes_all.append(dtype)
            val_loss /= max(len(val_loader), 1)
            f1_map = field_f1(preds_all, gts_all, dtypes_all)
            elapsed = time.time() - t0

            log.info(
                "Epoch %d  train_loss=%.4f  val_loss=%.4f  overall_f1=%.4f  gstin_f1=%.4f  (%.1fs)",
                epoch, avg_train_loss, val_loss, f1_map["__overall__"], f1_map.get("gstin", 0.0), elapsed,
            )
            metrics = {
                "train_loss": avg_train_loss,
                "val_loss": val_loss,
                "overall_f1": f1_map["__overall__"],
                "epoch_time_s": elapsed,
            }
            for k, v in f1_map.items():
                if k != "__overall__":
                    metrics[f"f1_{k}"] = v
            mlflow.log_metrics(metrics, step=epoch)

            overall = f1_map["__overall__"]
            if overall > best_overall:
                best_overall = overall
                epochs_since_improve = 0
                model.save_pretrained(save_dir)
                processor.save_pretrained(save_dir)
                log.info("Saved new best checkpoint -> %s (overall F1 %.4f)", save_dir, overall)
                mlflow.log_metric("best_overall_f1", best_overall, step=epoch)
            else:
                epochs_since_improve += 1
                if epochs_since_improve >= args.patience:
                    log.info("Early stopping at epoch %d", epoch)
                    break

        mlflow.log_metric("final_best_overall_f1", best_overall)
        print(f"Best overall field-F1: {best_overall:.4f}")
        print(f"Checkpoint: {save_dir}")


if __name__ == "__main__":
    main()
