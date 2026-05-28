from fastapi import APIRouter

from app.schemas import (
    MerchantFeatures, ScoreResponse, BatchScoreRequest, BatchScoreResponse
)
from app.services.scoring import score_one

router = APIRouter(prefix="/api/score", tags=["scoring"])


@router.post("", response_model=ScoreResponse)
def score(payload: MerchantFeatures) -> ScoreResponse:
    return score_one(payload)


@router.post("/batch", response_model=BatchScoreResponse)
def score_batch(payload: BatchScoreRequest) -> BatchScoreResponse:
    results = [score_one(m) for m in payload.merchants]
    return BatchScoreResponse(results=results)
