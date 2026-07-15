SHELL := /bin/bash
.PHONY: up down logs build test typecheck dataset train clean

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=200

build:
	docker compose build

test:
	cd backend && python -m pytest -q

typecheck:
	cd frontend && npx tsc --noEmit

dataset:
	cd backend && python scripts/generate_dataset.py --per-type 200 --out ../data/generated

train:
	cd backend && python scripts/train_donut.py --data ../data/generated --epochs 8

clean:
	rm -rf data/generated data/checkpoints data/uploads
	find . -type d -name "__pycache__" -prune -exec rm -rf {} +
	rm -rf frontend/dist frontend/.vite
