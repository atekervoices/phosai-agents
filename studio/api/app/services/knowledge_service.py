"""Knowledge Base Ingestion and Semantic Search Service."""

from __future__ import annotations

import io
import math
import os
import re
import uuid
import hashlib
from typing import Any

from loguru import logger
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge import KnowledgeBase, KnowledgeDocument, KnowledgeChunk

# Optional document parsing libraries
try:
    import fitz  # PyMuPDF
    _HAS_PDF = True
except ImportError:
    _HAS_PDF = False

try:
    from docx import Document as DocxDocument
    _HAS_DOCX = True
except ImportError:
    _HAS_DOCX = False


def extract_text_from_bytes(filename: str, content: bytes) -> str:
    """Extract plain text from uploaded file bytes based on file extension."""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if ext == "pdf":
        if not _HAS_PDF:
            raise ValueError("PDF parsing library (PyMuPDF) is not installed.")
        doc = fitz.open(stream=content, filetype="pdf")
        pages = []
        for page in doc:
            text = page.get_text()
            if text:
                pages.append(text)
        return "\n\n".join(pages)

    if ext in ("docx", "doc"):
        if not _HAS_DOCX:
            raise ValueError("DOCX parsing library (python-docx) is not installed.")
        doc = DocxDocument(io.BytesIO(content))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paragraphs)

    # Default text formats (.txt, .md, .json, .csv, etc.)
    return content.decode("utf-8", errors="replace")


def chunk_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 150) -> list[str]:
    """Split text into overlapping semantic chunks respecting paragraphs and sentences."""
    cleaned = re.sub(r"\r\n?", "\n", text).strip()
    if not cleaned:
        return []

    if len(cleaned) <= chunk_size:
        return [cleaned]

    chunks: list[str] = []
    start = 0
    text_len = len(cleaned)

    while start < text_len:
        end = start + chunk_size
        if end >= text_len:
            chunk = cleaned[start:].strip()
            if chunk:
                chunks.append(chunk)
            break

        # Look for the best split point before `end`
        slice_window = cleaned[start:end]
        split_idx = -1

        # Priority 1: Paragraph break (\n\n)
        p_idx = slice_window.rfind("\n\n")
        if p_idx > chunk_size // 2:
            split_idx = p_idx + 2
        else:
            # Priority 2: Sentence boundary (. ! ? followed by space or newline)
            s_match = re.search(r"[.!?]\s", slice_window[::-1])
            if s_match:
                candidate = len(slice_window) - s_match.start()
                if candidate > chunk_size // 3:
                    split_idx = candidate

        # Priority 3: Line break (\n)
        if split_idx == -1:
            l_idx = slice_window.rfind("\n")
            if l_idx > chunk_size // 3:
                split_idx = l_idx + 1

        # Priority 4: Space
        if split_idx == -1:
            sp_idx = slice_window.rfind(" ")
            if sp_idx > chunk_size // 3:
                split_idx = sp_idx + 1

        # Fallback: Hard cut
        if split_idx == -1:
            split_idx = chunk_size

        chunk = cleaned[start : start + split_idx].strip()
        if chunk:
            chunks.append(chunk)

        start += max(1, split_idx - chunk_overlap)

    return chunks


_fastembed_model = None


def get_fastembed_model():
    """Retrieve or initialize the cached FastEmbed ONNX neural embedding model."""
    global _fastembed_model
    if _fastembed_model is None:
        try:
            from fastembed import TextEmbedding

            # BAAI/bge-small-en-v1.5: 384 dimensions, ~67MB ONNX model, ~5-11ms CPU inference
            _fastembed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
            logger.info("FastEmbed BAAI/bge-small-en-v1.5 neural model initialized successfully")
        except Exception as e:
            logger.warning(f"FastEmbed initialization failed ({e}), falling back to local hashing vectorizer")
            _fastembed_model = False
    return _fastembed_model if _fastembed_model is not False else None


def warm_embedding_model() -> None:
    """Pre-warm the embedding model so the very first voice query has zero cold-start delay."""
    try:
        model = get_fastembed_model()
        if model is not None:
            list(model.embed(["warmup"]))
            logger.info("FastEmbed neural model pre-warmed and ready for low-latency queries")
    except Exception as e:
        logger.warning(f"Failed to pre-warm FastEmbed model: {e}")


def compute_local_embedding(text: str, dim: int = 384) -> list[float]:
    """Zero-subscription, high-performance local fallback vector embedding.

    Generates a 384-dimensional L2-normalized feature vector using sublinear
    term-frequency hashing over word unigrams and bigrams.
    Used as an immediate fallback if the neural ONNX model is unavailable.
    """
    vec = [0.0] * dim
    clean_text = text.lower()
    words = re.findall(r"\b\w+\b", clean_text)
    if not words:
        return vec

    # Unigrams + Bigrams for phrase preservation
    tokens: list[str] = list(words)
    for i in range(len(words) - 1):
        tokens.append(f"{words[i]}_{words[i+1]}")

    counts: dict[str, int] = {}
    for t in tokens:
        counts[t] = counts.get(t, 0) + 1

    for token, count in counts.items():
        weight = 1.0 + math.log(count)
        h = int(hashlib.sha256(token.encode("utf-8")).hexdigest(), 16)
        idx = h % dim
        sign = 1.0 if ((h >> 8) & 1) == 0 else -1.0
        vec[idx] += sign * weight

    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [x / norm for x in vec]
    return vec


async def get_embeddings(
    texts: list[str],
    model: str = "BAAI/bge-small-en-v1.5",
    **kwargs: Any,
) -> list[list[float]]:
    """Generate vector embeddings using local FastEmbed neural model (BAAI/bge-small-en-v1.5).

    100% local, zero-subscription, zero OpenAI dependency. Runs in ONNX C++ runtime (~5-11ms).
    """
    if not texts:
        return []

    embed_model = get_fastembed_model()
    if embed_model is not None:
        try:
            vectors = list(embed_model.embed(texts))
            return [v.tolist() for v in vectors]
        except Exception as e:
            logger.warning(f"FastEmbed embedding failed ({e}), falling back to hashing vectorizer.")

    return [compute_local_embedding(t, dim=384) for t in texts]


class KnowledgeService:
    """Service to handle document ingestion, chunking, and semantic vector search."""

    @staticmethod
    async def create_knowledge_base(
        session: AsyncSession,
        agent_id: uuid.UUID,
        name: str,
        description: str | None = None,
        chunk_size: int = 1000,
        chunk_overlap: int = 150,
    ) -> KnowledgeBase:
        kb = KnowledgeBase(
            agent_id=agent_id,
            name=name,
            description=description,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        session.add(kb)
        await session.commit()
        await session.refresh(kb)
        return kb

    @staticmethod
    async def ingest_document(
        session: AsyncSession,
        kb: KnowledgeBase,
        filename: str,
        content: bytes,
    ) -> KnowledgeDocument:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"
        doc = KnowledgeDocument(
            knowledge_base_id=kb.id,
            filename=filename,
            file_type=ext,
            status="processing",
            chunk_count=0,
        )
        session.add(doc)
        await session.commit()
        await session.refresh(doc)

        try:
            raw_text = extract_text_from_bytes(filename, content)
            chunks = chunk_text(raw_text, chunk_size=kb.chunk_size, chunk_overlap=kb.chunk_overlap)

            if not chunks:
                doc.status = "ready"
                doc.chunk_count = 0
                await session.commit()
                return doc

            embeddings = await get_embeddings(chunks, model=kb.embedding_model)

            for idx, (chunk_str, emb) in enumerate(zip(chunks, embeddings)):
                chunk_record = KnowledgeChunk(
                    knowledge_base_id=kb.id,
                    document_id=doc.id,
                    chunk_index=idx,
                    content=chunk_str,
                    embedding=emb,
                )
                session.add(chunk_record)

            doc.chunk_count = len(chunks)
            doc.status = "ready"
            await session.commit()
            await session.refresh(doc)
            return doc

        except Exception as e:
            logger.exception(f"Failed to ingest document {filename}: {e}")
            doc.status = "error"
            doc.error_message = str(e)
            await session.commit()
            await session.refresh(doc)
            raise

    @staticmethod
    async def search(
        session: AsyncSession,
        knowledge_base_id: uuid.UUID,
        query: str,
        top_k: int = 3,
        similarity_threshold: float = 0.2,
    ) -> list[dict[str, Any]]:
        """Perform semantic search against knowledge chunks using pgvector cosine distance."""
        query_embeddings = await get_embeddings([query])
        if not query_embeddings:
            return []

        query_emb = query_embeddings[0]

        # In pgvector: <=> operator calculates cosine distance (0 = identical, 1 = orthogonal, 2 = opposite)
        # Cosine similarity = 1 - cosine_distance
        distance_col = KnowledgeChunk.embedding.cosine_distance(query_emb).label("distance")

        stmt = (
            select(KnowledgeChunk, distance_col)
            .where(KnowledgeChunk.knowledge_base_id == knowledge_base_id)
            .where(KnowledgeChunk.embedding.isnot(None))
            .order_by(distance_col)
            .limit(top_k)
        )

        result = await session.execute(stmt)
        hits = []

        for chunk, distance in result.all():
            similarity = 1.0 - float(distance) if distance is not None else 0.0
            if similarity >= similarity_threshold:
                hits.append({
                    "chunk_id": str(chunk.id),
                    "document_id": str(chunk.document_id),
                    "content": chunk.content,
                    "similarity": round(similarity, 4),
                    "chunk_index": chunk.chunk_index,
                })

        return hits
