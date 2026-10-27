"use client";

import React, { useState, useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DatabaseIcon,
  File02Icon,
  Search01Icon,
  Loading03Icon,
  CheckmarkCircle01Icon,
  Alert01Icon,
  Cancel01Icon,
  CloudIcon,
  CpuIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { API_BASE } from "@/lib/api/client";

interface DocumentItem {
  id: string;
  knowledge_base_id: string;
  filename: string;
  file_type: string;
  status: string;
  chunk_count: number;
  error_message: string | null;
  created_at: string;
}

interface KnowledgeBaseItem {
  id: string;
  agent_id: string;
  name: string;
  description: string | null;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  document_count: number;
  total_chunks: number;
  created_at: string;
}

interface SearchHit {
  chunk_id: string;
  document_id: string;
  content: string;
  similarity: number;
  chunk_index: number;
}

interface KnowledgePanelProps {
  agentId: string;
  onUpdateCount?: (count: number) => void;
}

export default function KnowledgePanel({ agentId, onUpdateCount }: KnowledgePanelProps) {
  const [kb, setKb] = useState<KnowledgeBaseItem | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Search playground
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load or initialize agent knowledge base
  const loadKnowledgeBase = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/agents/${agentId}/knowledge-bases`);
      if (!res.ok) throw new Error("Failed to load knowledge bases");
      const list: KnowledgeBaseItem[] = await res.json();

      let activeKb = list[0];
      if (!activeKb) {
        // Create initial default knowledge base
        const createRes = await fetch(`${API_BASE}/api/agents/${agentId}/knowledge-bases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Default Knowledge Base",
            description: "Agent knowledge repository for live RAG calls",
          }),
        });
        if (createRes.ok) {
          activeKb = await createRes.json();
        }
      }

      setKb(activeKb || null);

      if (activeKb) {
        await loadDocuments(activeKb.id);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load knowledge base");
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async (kbId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/knowledge-bases/${kbId}/documents`);
      if (res.ok) {
        const docs: DocumentItem[] = await res.json();
        setDocuments(docs);
        if (onUpdateCount) onUpdateCount(docs.length);
      }
    } catch (err) {
      console.error("Error loading documents:", err);
    }
  };

  useEffect(() => {
    loadKnowledgeBase();
  }, [agentId]);

  const handleFileUpload = async (files: FileList | File[]) => {
    if (!kb) return;
    const file = files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploading(true);
      toast.info(`Ingesting "${file.name}"... Parsing & embedding text.`);
      const res = await fetch(`${API_BASE}/api/knowledge-bases/${kb.id}/documents`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Upload and ingestion failed");
      }

      const newDoc = await res.json();
      toast.success(`"${file.name}" indexed successfully into ${newDoc.chunk_count} chunks!`);
      await loadDocuments(kb.id);
      // Refresh KB stats
      const kbRes = await fetch(`${API_BASE}/api/agents/${agentId}/knowledge-bases`);
      if (kbRes.ok) {
        const list = await kbRes.json();
        if (list[0]) setKb(list[0]);
      }
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteDoc = async (docId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}" and its vector embeddings?`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/documents/${docId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success(`Deleted ${filename}`);
      if (kb) {
        await loadDocuments(kb.id);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete document");
    }
  };

  const handleTestSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kb || !searchQuery.trim()) return;

    try {
      setSearching(true);
      setHasSearched(true);
      const res = await fetch(`${API_BASE}/api/knowledge-bases/${kb.id}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery.trim(),
          top_k: 4,
          similarity_threshold: 0.1,
        }),
      });

      if (!res.ok) throw new Error("Search query failed");
      const data = await res.json();
      setSearchHits(data.hits || []);
    } catch (err: any) {
      toast.error(err.message || "Search test failed");
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Clean Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/50">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HugeiconsIcon icon={DatabaseIcon} className="size-4.5" />
            </span>
            <h2 className="text-base font-bold tracking-tight text-foreground">Agent Knowledge Base</h2>
          </div>
          <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
            Upload documents (PDF, Word, Text) so your voice agent can accurately answer questions during live phone calls.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="rounded-xl border border-border/60 bg-card/60 px-3.5 py-1.5 text-center shadow-2xs">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Documents
            </span>
            <span className="text-sm font-bold text-foreground">{documents.length}</span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 px-3.5 py-1.5 text-center shadow-2xs">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Sections
            </span>
            <span className="text-sm font-bold text-foreground">{kb?.total_chunks || 0}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Upload & Document Manager (7 cols) */}
        <div className="lg:col-span-7 space-y-4 flex flex-col">
          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files) handleFileUpload(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-300 ${
              dragOver
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border/60 hover:border-primary/50 bg-accent/5 hover:bg-accent/10"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md,.json,.csv"
              className="hidden"
              onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
              disabled={uploading}
            />

            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                {uploading ? (
                  <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" />
                ) : (
                  <HugeiconsIcon icon={CloudIcon} className="size-5" />
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-foreground">
                  {uploading ? "Parsing & generating embeddings..." : "Click to upload or drag & drop files here"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Supported: PDF, Word (DOCX), Text, Markdown, CSV (up to 20MB)
                </p>
              </div>
            </div>
          </div>

          {/* Document Table */}
          <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-md overflow-hidden shadow-sm flex-1">
            <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Indexed Documents ({documents.length})
              </span>
            </div>

            {documents.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center space-y-2">
                <HugeiconsIcon icon={File02Icon} className="size-8 text-muted-foreground/40" />
                <p>No documents uploaded yet. Add a PDF or text file above to populate knowledge.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-accent/10 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <HugeiconsIcon icon={File02Icon} className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{doc.filename}</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span className="uppercase font-mono">{doc.file_type}</span>
                          <span>•</span>
                          <span>{doc.chunk_count} sections</span>
                          <span>•</span>
                          <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {doc.status === "ready" ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/20 bg-emerald-500/5">
                          Indexed
                        </Badge>
                      ) : doc.status === "processing" ? (
                        <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/20 bg-amber-500/5">
                          Processing
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">
                          Error
                        </Badge>
                      )}

                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteDoc(doc.id, doc.filename)}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Search & Test Retrieval (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-md p-5 shadow-sm space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Search01Icon} className="size-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Test Knowledge Retrieval
                </h3>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Ask a question to see what relevant information your agent finds in its documents.
              </p>
            </div>

            <form onSubmit={handleTestSearch} className="flex gap-2">
              <Input
                placeholder="Ask a question (e.g. What are your store hours?)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs h-9 bg-background/50 rounded-xl"
              />
              <Button type="submit" size="sm" disabled={searching || !searchQuery.trim()} className="h-9 px-3.5 rounded-xl font-bold">
                {searching ? <HugeiconsIcon icon={Loading03Icon} className="size-3.5 animate-spin" /> : "Query"}
              </Button>
            </form>

            {/* Results Display */}
            <div className="space-y-2.5 pt-2">
              {hasSearched && searchHits.length === 0 && !searching && (
                <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                  No matching excerpts found for this question.
                </div>
              )}

              {searchHits.map((hit, idx) => (
                <div
                  key={hit.chunk_id || idx}
                  className="rounded-xl border border-border/40 bg-accent/5 p-3.5 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-muted-foreground uppercase tracking-wide">
                      Result #{idx + 1}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-semibold text-primary border-primary/20 bg-primary/5">
                      Relevance: {(hit.similarity * 100).toFixed(1)}%
                    </Badge>
                  </div>
                  <p className="text-foreground/90 text-xs leading-relaxed bg-background/40 p-2.5 rounded-lg border border-border/20 whitespace-pre-wrap">
                    {hit.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
