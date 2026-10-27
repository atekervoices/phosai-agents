"""Knowledge Base API endpoints."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.database import get_db
from app.models.agent import Agent
from app.models.knowledge import KnowledgeBase, KnowledgeDocument, KnowledgeChunk
from app.services.knowledge_service import KnowledgeService

router = APIRouter(tags=["knowledge"])


# ── Schemas ───────────────────────────────────────────────────────


class CreateKnowledgeBaseRequest(BaseModel):
    name: str = Field(default="Agent Knowledge Base", max_length=255)
    description: str | None = Field(default=None)
    chunk_size: int = Field(default=1000, ge=100, le=4000)
    chunk_overlap: int = Field(default=150, ge=0, le=500)


class KnowledgeBaseResponse(BaseModel):
    id: str
    agent_id: str
    name: str
    description: str | None
    embedding_model: str
    chunk_size: int
    chunk_overlap: int
    document_count: int = 0
    total_chunks: int = 0
    created_at: str


class DocumentResponse(BaseModel):
    id: str
    knowledge_base_id: str
    filename: str
    file_type: str
    status: str
    chunk_count: int
    error_message: str | None
    created_at: str


class QueryRequest(BaseModel):
    query: str
    top_k: int = Field(default=3, ge=1, le=10)
    similarity_threshold: float = Field(default=0.2, ge=0.0, le=1.0)


class SearchHit(BaseModel):
    chunk_id: str
    document_id: str
    content: str
    similarity: float
    chunk_index: int


class QueryResponse(BaseModel):
    query: str
    hits: list[SearchHit]


# ── Knowledge Base Endpoints ──────────────────────────────────────


@router.get("/knowledge-bases", response_model=list[KnowledgeBaseResponse])
async def list_all_knowledge_bases(
    session: AsyncSession = Depends(get_db),
):
    """List all knowledge bases across all agents."""
    stmt = select(KnowledgeBase).order_by(KnowledgeBase.created_at.desc())
    res = await session.execute(stmt)
    kbs = res.scalars().all()

    output = []
    for kb in kbs:
        doc_count_res = await session.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.knowledge_base_id == kb.id)
        )
        docs = doc_count_res.scalars().all()
        doc_count = len(docs)
        total_chunks = sum(d.chunk_count for d in docs)

        output.append(
            KnowledgeBaseResponse(
                id=str(kb.id),
                agent_id=str(kb.agent_id),
                name=kb.name,
                description=kb.description,
                embedding_model=kb.embedding_model,
                chunk_size=kb.chunk_size,
                chunk_overlap=kb.chunk_overlap,
                document_count=doc_count,
                total_chunks=total_chunks,
                created_at=kb.created_at.isoformat(),
            )
        )
    return output


@router.get("/agents/{agent_id}/knowledge-bases", response_model=list[KnowledgeBaseResponse])
async def list_agent_knowledge_bases(
    agent_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
):
    """List all knowledge bases belonging to an agent."""
    stmt = (
        select(KnowledgeBase)
        .where(KnowledgeBase.agent_id == agent_id)
        .order_by(KnowledgeBase.created_at.desc())
    )
    res = await session.execute(stmt)
    kbs = res.scalars().all()

    output = []
    for kb in kbs:
        doc_count_res = await session.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.knowledge_base_id == kb.id)
        )
        docs = doc_count_res.scalars().all()
        doc_count = len(docs)
        total_chunks = sum(d.chunk_count for d in docs)

        output.append(
            KnowledgeBaseResponse(
                id=str(kb.id),
                agent_id=str(kb.agent_id),
                name=kb.name,
                description=kb.description,
                embedding_model=kb.embedding_model,
                chunk_size=kb.chunk_size,
                chunk_overlap=kb.chunk_overlap,
                document_count=doc_count,
                total_chunks=total_chunks,
                created_at=kb.created_at.isoformat(),
            )
        )
    return output


@router.post("/agents/{agent_id}/knowledge-bases", response_model=KnowledgeBaseResponse)
async def create_agent_knowledge_base(
    agent_id: uuid.UUID,
    body: CreateKnowledgeBaseRequest,
    session: AsyncSession = Depends(get_db),
):
    """Create a new knowledge base for an agent."""
    agent_res = await session.execute(select(Agent).where(Agent.id == agent_id))
    if not agent_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Agent not found")

    kb = await KnowledgeService.create_knowledge_base(
        session=session,
        agent_id=agent_id,
        name=body.name,
        description=body.description,
        chunk_size=body.chunk_size,
        chunk_overlap=body.chunk_overlap,
    )

    return KnowledgeBaseResponse(
        id=str(kb.id),
        agent_id=str(kb.agent_id),
        name=kb.name,
        description=kb.description,
        embedding_model=kb.embedding_model,
        chunk_size=kb.chunk_size,
        chunk_overlap=kb.chunk_overlap,
        document_count=0,
        total_chunks=0,
        created_at=kb.created_at.isoformat(),
    )


@router.delete("/knowledge-bases/{kb_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knowledge_base(
    kb_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
):
    """Delete a knowledge base and all associated documents and chunks."""
    kb_res = await session.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = kb_res.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    await session.delete(kb)
    await session.commit()


# ── Document Management ───────────────────────────────────────────


@router.get("/knowledge-bases/{kb_id}/documents", response_model=list[DocumentResponse])
async def list_documents(
    kb_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
):
    """List all documents uploaded to a knowledge base."""
    stmt = (
        select(KnowledgeDocument)
        .where(KnowledgeDocument.knowledge_base_id == kb_id)
        .order_by(KnowledgeDocument.created_at.desc())
    )
    res = await session.execute(stmt)
    docs = res.scalars().all()

    return [
        DocumentResponse(
            id=str(d.id),
            knowledge_base_id=str(d.knowledge_base_id),
            filename=d.filename,
            file_type=d.file_type,
            status=d.status,
            chunk_count=d.chunk_count,
            error_message=d.error_message,
            created_at=d.created_at.isoformat(),
        )
        for d in docs
    ]


@router.post("/knowledge-bases/{kb_id}/documents", response_model=DocumentResponse)
async def upload_document(
    kb_id: uuid.UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
):
    """Upload, parse, chunk, embed, and store a document in the knowledge base."""
    kb_res = await session.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = kb_res.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    doc = await KnowledgeService.ingest_document(
        session=session,
        kb=kb,
        filename=file.filename or "uploaded_doc.txt",
        content=content,
    )

    return DocumentResponse(
        id=str(doc.id),
        knowledge_base_id=str(doc.knowledge_base_id),
        filename=doc.filename,
        file_type=doc.file_type,
        status=doc.status,
        chunk_count=doc.chunk_count,
        error_message=doc.error_message,
        created_at=doc.created_at.isoformat(),
    )


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
):
    """Delete a document and all its chunks from the knowledge base."""
    doc_res = await session.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.id == doc_id)
    )
    doc = doc_res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await session.delete(doc)
    await session.commit()


# ── Semantic Search / Query ───────────────────────────────────────


@router.post("/knowledge-bases/{kb_id}/query", response_model=QueryResponse)
@router.post("/knowledge-bases/{kb_id}/search", response_model=QueryResponse)
async def query_knowledge_base(
    kb_id: uuid.UUID,
    body: QueryRequest,
    session: AsyncSession = Depends(get_db),
):
    """Perform semantic search on a knowledge base using vector cosine distance."""
    kb_res = await session.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    if not kb_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    hits_raw = await KnowledgeService.search(
        session=session,
        knowledge_base_id=kb_id,
        query=body.query,
        top_k=body.top_k,
        similarity_threshold=body.similarity_threshold,
    )

    hits = [SearchHit(**h) for h in hits_raw]
    return QueryResponse(query=body.query, hits=hits)


@router.post("/agents/{agent_id}/knowledge-search", response_model=QueryResponse)
async def query_agent_knowledge(
    agent_id: uuid.UUID,
    body: QueryRequest,
    session: AsyncSession = Depends(get_db),
):
    """Direct query endpoint for the Rust voice engine using the agent's ID."""
    stmt = (
        select(KnowledgeBase)
        .where(KnowledgeBase.agent_id == agent_id)
        .order_by(KnowledgeBase.created_at.desc())
        .limit(1)
    )
    res = await session.execute(stmt)
    kb = res.scalar_one_or_none()
    if not kb:
        return QueryResponse(query=body.query, hits=[])

    hits_raw = await KnowledgeService.search(
        session=session,
        knowledge_base_id=kb.id,
        query=body.query,
        top_k=body.top_k,
        similarity_threshold=body.similarity_threshold,
    )

    hits = [SearchHit(**h) for h in hits_raw]
    return QueryResponse(query=body.query, hits=hits)
