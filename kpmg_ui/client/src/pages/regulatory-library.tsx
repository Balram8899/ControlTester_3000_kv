import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload, FileText, X, Play, RotateCcw, BookOpen, Search, Trash2, Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useRegulatoryTesting, LibraryDocument } from "@/contexts/RegulatoryTestingContext";

const ENFORCEMENT_COLOR: Record<string, string> = {
  mandatory:    "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300",
  recommended:  "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300",
  optional:     "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400",
};

export default function RegulatoryLibraryPage() {
  const { toast } = useToast();
  const {
    libraryDocuments,
    setLibraryDocuments,
    libraryLoading,
    setLibraryLoading,
  } = useRegulatoryTesting();

  // Resizable panel
  const [panelWidth, setPanelWidth] = useState(320); // px
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: panelWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      const next = Math.min(600, Math.max(200, dragRef.current.startW + delta));
      setPanelWidth(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [panelWidth]);

  // Upload state
  const [libraryFiles, setLibraryFiles] = useState<File[]>([]);
  const [libraryIngesting, setLibraryIngesting] = useState(false);
  const [libraryIngestResults, setLibraryIngestResults] = useState<any[]>([]);

  // Detail-view state
  const [selectedLibraryDoc, setSelectedLibraryDoc] = useState<LibraryDocument | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [libraryDomainFilter, setLibraryDomainFilter] = useState<string>("all");
  const [librarySearch, setLibrarySearch] = useState("");

  // Cache: document_id → full obligations (from MongoDB or returned inline)
  const [obligationCache, setObligationCache] = useState<Record<string, LibraryDocument>>({});

  useEffect(() => {
    fetchLibraryDocuments();
  }, []);

  // ── API helpers ───────────────────────────────────────────────────────────

  const fetchLibraryDocuments = async () => {
    setLibraryLoading(true);
    try {
      const res = await fetch(`/api/regulatory-library/documents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.documents)) {
        // Only replace if we got a non-empty list OR we have nothing in memory
        if (data.documents.length > 0) {
          setLibraryDocuments(data.documents);
        }
      }
    } catch (err) {
      // Don't wipe existing in-memory docs on a transient fetch failure
      console.warn("fetchLibraryDocuments failed:", err);
    } finally {
      setLibraryLoading(false);
    }
  };

  const handleLibraryIngest = async () => {
    if (libraryFiles.length === 0) return;
    const selectedModel = localStorage.getItem("selectedModel") || "llama3";
    setLibraryIngesting(true);
    try {
      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      libraryFiles.forEach(f => formData.append("regulation_files", f));
      const res = await fetch(`/api/regulatory-library/ingest`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.error || "Ingest failed");

      const ingested: any[] = data.ingested || [];
      setLibraryIngestResults(ingested);
      setLibraryFiles([]);

      // Optimistic update — add ingested docs to the list immediately so
      // the library panel populates even if MongoDB is lagging or unavailable.
      if (ingested.length > 0) {
        const newDocs: LibraryDocument[] = ingested.map((r: any) => ({
          document_id: r.document_id,
          framework_name: r.framework_name || r.filename,
          issuing_authority: r.issuing_authority || "",
          source_filename: r.filename,
          upload_timestamp: new Date().toISOString(),
          model_used: selectedModel,
          total_obligations: r.total_obligations,
          obligations_by_domain: r.obligations_by_domain || {},
        }));
        const existingIds = new Set(libraryDocuments.map((d: LibraryDocument) => d.document_id));
        setLibraryDocuments([...libraryDocuments, ...newDocs.filter(d => !existingIds.has(d.document_id))]);
      }

      // Also try to sync from MongoDB (may or may not return more)
      await fetchLibraryDocuments();

      const mongoFailed = ingested.some((r: any) => !r.mongo_saved);
      toast({
        title: "Ingested",
        description: mongoFailed
          ? `${data.total_ingested} document(s) extracted. ⚠ MongoDB save failed — obligations visible this session only.`
          : `${data.total_ingested} document(s) added to library`,
        variant: mongoFailed ? "destructive" : "default",
      });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Ingest failed", variant: "destructive" });
    } finally {
      setLibraryIngesting(false);
    }
  };

  const handleLibraryDelete = async (documentId: string) => {
    try {
      const res = await fetch(`/api/regulatory-library/documents/${documentId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete failed");
      setLibraryDocuments(libraryDocuments.filter(d => d.document_id !== documentId));
      if (selectedLibraryDoc?.document_id === documentId) setSelectedLibraryDoc(null);
      toast({ title: "Deleted", description: "Document removed from library" });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Delete failed", variant: "destructive" });
    }
  };

  const handleLibraryDocClick = async (doc: LibraryDocument) => {
    if (selectedLibraryDoc?.document_id === doc.document_id) {
      setSelectedLibraryDoc(null);
      return;
    }

    // Show immediately from cache if we already fetched obligations
    if (obligationCache[doc.document_id]) {
      setSelectedLibraryDoc(obligationCache[doc.document_id]);
      setLibraryDomainFilter("all");
      setLibrarySearch("");
      return;
    }

    setDetailLoading(true);
    try {
      const res = await fetch(`/api/regulatory-library/documents/${doc.document_id}`);
      const data = await res.json();
      if (data.success && data.document) {
        const full: LibraryDocument = data.document;
        setObligationCache(prev => ({ ...prev, [doc.document_id]: full }));
        setSelectedLibraryDoc(full);
        setLibraryDomainFilter("all");
        setLibrarySearch("");
      } else {
        // MongoDB returned nothing — show the summary doc without obligations
        setSelectedLibraryDoc(doc);
        setLibraryDomainFilter("all");
        setLibrarySearch("");
        toast({
          title: "Obligations unavailable",
          description: "Document metadata loaded but obligations could not be retrieved from the database.",
          variant: "destructive",
        });
      }
    } catch {
      // Fall back to summary doc so the header at least shows
      setSelectedLibraryDoc(doc);
      setLibraryDomainFilter("all");
      setLibrarySearch("");
      toast({ title: "Warning", description: "Could not load obligations — showing document summary only.", variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Filtered obligations ──────────────────────────────────────────────────

  const filteredObligations = selectedLibraryDoc?.obligations?.filter(o =>
    (libraryDomainFilter === "all" || o.domain === libraryDomainFilter) &&
    (librarySearch === "" ||
      o.obligation_text.toLowerCase().includes(librarySearch.toLowerCase()) ||
      o.section_reference.toLowerCase().includes(librarySearch.toLowerCase()))
  ) ?? [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex overflow-hidden select-none">

      {/* ── LEFT PANEL — document list + upload ─────────────────────────── */}
      <div className="shrink-0 flex flex-col bg-background/50 overflow-hidden" style={{ width: panelWidth }}>

        {/* Upload section */}
        <div className="p-4 border-b space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Add Documents
          </h2>

          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              libraryFiles.length > 0
                ? "border-primary/50 bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onClick={() => document.getElementById("lib-file-input")?.click()}
          >
            <input
              id="lib-file-input"
              type="file"
              multiple
              accept=".pdf,.txt,.md"
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files || []);
                if (files.length) setLibraryFiles(prev => [...prev, ...files]);
                e.target.value = "";
              }}
            />
            <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-foreground font-medium">Click to browse</p>
            <p className="text-xs text-muted-foreground">PDF, TXT or MD</p>
          </div>

          {libraryFiles.length > 0 && (
            <div className="space-y-1.5">
              <div className="max-h-32 overflow-auto space-y-1">
                {libraryFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                    <span className="truncate flex-1 mr-1">{f.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 shrink-0"
                      onClick={() => setLibraryFiles(prev => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                className="w-full text-xs"
                disabled={libraryIngesting}
                onClick={handleLibraryIngest}
              >
                {libraryIngesting ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1.5" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 mr-1.5" />
                    Extract & Save
                  </>
                )}
              </Button>
            </div>
          )}

          {libraryIngestResults.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-green-600">Recently added</p>
              {libraryIngestResults.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-1.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded">
                  <span className="font-medium truncate">{r.framework_name || r.filename}</span>
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <Badge variant="outline" className="text-green-700 border-green-400 text-[10px]">
                      {r.total_obligations}
                    </Badge>
                    {!r.mongo_saved && (
                      <Badge variant="outline" className="text-orange-600 border-orange-400 text-[10px]" title="Not persisted to database">
                        ⚠ no DB
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Document list */}
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Library
            {libraryDocuments.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px]">{libraryDocuments.length}</Badge>
            )}
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchLibraryDocuments} disabled={libraryLoading}>
            <RotateCcw className={`h-3 w-3 ${libraryLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {libraryLoading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          )}
          {!libraryLoading && libraryDocuments.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8 px-4">
              No documents yet. Upload a regulatory document above.
            </p>
          )}
          {!libraryLoading && libraryDocuments.length > 0 && (
            <div className="p-2 space-y-1">
              {libraryDocuments.map((doc, i) => (
                <div
                  key={i}
                  className={`rounded-lg border cursor-pointer transition-colors group ${
                    selectedLibraryDoc?.document_id === doc.document_id
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/50 hover:bg-muted/40"
                  }`}
                  onClick={() => handleLibraryDocClick(doc)}
                >
                  <div className="flex items-start justify-between p-2.5 gap-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium break-words leading-snug">{doc.framework_name}</p>
                      <p className="text-xs text-muted-foreground break-all leading-snug mt-0.5">{doc.source_filename}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {doc.total_obligations} obligations
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 self-start mt-0.5 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                      onClick={e => { e.stopPropagation(); handleLibraryDelete(doc.document_id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── DRAG DIVIDER ─────────────────────────────────────────────────── */}
      <div
        className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 active:bg-primary/60 transition-colors"
        onMouseDown={onDividerMouseDown}
        title="Drag to resize"
      />

      {/* ── RIGHT PANEL — obligation viewer ─────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {detailLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="text-sm">Loading obligations...</p>
          </div>
        ) : !selectedLibraryDoc ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Library className="h-12 w-12 opacity-20" />
            <p className="text-sm">Select a document from the library to view its obligations</p>
          </div>
        ) : (
          <>
            {/* Framework header */}
            <div className="p-5 border-b bg-background/50 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl font-bold truncate">{selectedLibraryDoc.framework_name}</h1>
                  <p className="text-sm text-muted-foreground">
                    {selectedLibraryDoc.issuing_authority}
                    {selectedLibraryDoc.upload_timestamp && (
                      <> · Loaded {new Date(selectedLibraryDoc.upload_timestamp).toLocaleDateString()}</>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedLibraryDoc.source_filename}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-sm px-3 py-1">
                  {selectedLibraryDoc.total_obligations} obligations
                </Badge>
              </div>

              {/* Domain distribution mini-bar + legend */}
              {selectedLibraryDoc.obligations_by_domain && (() => {
                const hues = [220, 160, 30, 280, 10, 190, 120, 50, 340, 260, 90, 200];
                const sorted = Object.entries(selectedLibraryDoc.obligations_by_domain)
                  .sort((a, b) => b[1] - a[1]);
                return (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Domain coverage</p>
                    {/* Color bar */}
                    <div className="flex h-2 rounded-full overflow-hidden gap-px">
                      {sorted.map(([domain, count], i) => {
                        const pct = Math.round((count / selectedLibraryDoc.total_obligations) * 100);
                        return (
                          <div
                            key={domain}
                            title={`${domain.replace(/_/g, " ")}: ${count} (${pct}%)`}
                            style={{ width: `${pct}%`, backgroundColor: `hsl(${hues[i % hues.length]},60%,55%)` }}
                          />
                        );
                      })}
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {sorted.map(([domain, count], i) => {
                        const pct = Math.round((count / selectedLibraryDoc.total_obligations) * 100);
                        return (
                          <div key={domain} className="flex items-center gap-1">
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: `hsl(${hues[i % hues.length]},60%,55%)` }}
                            />
                            <span className="text-xs text-muted-foreground capitalize">
                              {domain.replace(/_/g, " ")}{" "}
                              <span className="text-foreground font-medium">{pct}%</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Domain filter chips + search — only when obligations are available */}
            <div className="p-4 border-b space-y-3 bg-background/30">
              {selectedLibraryDoc.obligations && selectedLibraryDoc.obligations_by_domain && (
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={libraryDomainFilter === "all" ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setLibraryDomainFilter("all")}
                  >
                    All ({selectedLibraryDoc.total_obligations})
                  </Badge>
                  {Object.entries(selectedLibraryDoc.obligations_by_domain)
                    .sort((a, b) => b[1] - a[1])
                    .map(([domain, count]) => (
                      <Badge
                        key={domain}
                        variant={libraryDomainFilter === domain ? "default" : "outline"}
                        className="cursor-pointer text-xs capitalize"
                        onClick={() => setLibraryDomainFilter(domain)}
                      >
                        {domain.replace(/_/g, " ")} ({count})
                      </Badge>
                    ))}
                </div>
              )}

              {selectedLibraryDoc.obligations && (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search obligations..."
                      value={librarySearch}
                      onChange={e => setLibrarySearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {librarySearch && (
                      <button
                        onClick={() => setLibrarySearch("")}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Showing {filteredObligations.length} of {selectedLibraryDoc.total_obligations} obligations
                  </p>
                </>
              )}
            </div>

            {/* Obligation list */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3 pr-5">
                {!selectedLibraryDoc.obligations && (
                  <div className="text-center py-12 space-y-2">
                    <p className="text-muted-foreground text-sm">Obligations not available in database.</p>
                    <p className="text-muted-foreground text-xs">The document was ingested but obligations may not have been saved persistently. Re-ingest to restore them.</p>
                  </div>
                )}
                {selectedLibraryDoc.obligations && filteredObligations.length === 0 && (
                  <p className="text-center text-muted-foreground py-12 text-sm">
                    No obligations match the current filter
                  </p>
                )}
                {filteredObligations.map((obl, j) => {
                  const heading = obl.obligation_text.length > 120
                    ? obl.obligation_text.slice(0, 120).replace(/\s\S*$/, "") + "…"
                    : obl.obligation_text;
                  const hasFullText = obl.obligation_text.length > 120;

                  return (
                    <Card key={j} className="shadow-none">
                      <CardHeader className="pb-2 pt-3 px-4">
                        {/* Header row: badges */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {obl.section_reference && (
                            <Badge variant="secondary" className="text-xs font-mono">
                              {obl.section_reference}
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-xs ${ENFORCEMENT_COLOR[obl.enforcement_level] ?? ""}`}
                          >
                            {obl.enforcement_level}
                          </Badge>
                          <Badge variant="outline" className="text-xs capitalize">
                            {obl.domain.replace(/_/g, " ")}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {obl.obligation_type.replace(/_/g, " ")}
                          </Badge>
                          {obl.has_metric && (
                            <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">metric</Badge>
                          )}
                          {obl.has_frequency && (
                            <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">frequency</Badge>
                          )}
                        </div>

                        {/* Brief description (first sentence / 120 chars) */}
                        <CardTitle className="text-sm font-medium text-muted-foreground leading-snug mt-1.5">
                          {heading}
                        </CardTitle>
                      </CardHeader>

                      {hasFullText && (
                        <CardContent className="pt-0 px-4 pb-3 space-y-2">
                          {/* Full obligation text */}
                          <p className="text-sm text-foreground leading-relaxed">
                            {obl.obligation_text}
                          </p>

                          {/* Keywords */}
                          {obl.keywords && obl.keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {obl.keywords.slice(0, 6).map((kw, k) => (
                                <span
                                  key={k}
                                  className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
                                >
                                  {kw}
                                </span>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      )}

                      {/* Show keywords even when text fits in heading */}
                      {!hasFullText && obl.keywords && obl.keywords.length > 0 && (
                        <CardContent className="pt-0 px-4 pb-3">
                          <div className="flex flex-wrap gap-1">
                            {obl.keywords.slice(0, 6).map((kw, k) => (
                              <span
                                key={k}
                                className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  );
}
