"""
Complete FastAPI wrapper for Trace with Session & Memory Management
File: api/main.py
Includes session management, conversation memory, and enhanced chat capabilities
Phase 1 + Phase 2 implementation - FIXED VERSION
"""

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
import tempfile
import os
import json
import time
import logging
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from utils.audit_session_store import audit_session_store
from utils.test_script_parser import parse_test_script, validate_controls
from utils.evidence_validator import validate_evidence_file
from utils.audit_analyzer import analyze_all_controls, generate_overall_summary
from utils.workpaper_filler import fill_workpaper_template

# utils imports
from utils.llm_chain import build_knowledge_base, assess_evidence_with_kb, generate_executive_summary
from utils.graph_rag import KnowledgeGraph
from utils.find_llm import get_ollama_model_names
from langchain.schema import Document
from utils.pdf_generator import generate_workbook

# Add for session management
from datetime import datetime
import uuid

from utils.regulatory_comparision import compare_regulatory_documents, save_analysis_artifacts
from utils.regulatory_library import ingest_regulatory_document, MongoLibraryStore, merge_similar_obligations
from utils.controls_library import ingest_controls_document, MongoControlsStore, merge_similar_controls, remap_obligations_for_all
from utils.frameworks_library import (
    ingest_framework_document, MongoFrameworksStore, merge_similar_framework_elements,
    build_and_save_library_graph as build_frameworks_graph,
    load_library_graph as load_frameworks_graph,
    LIBRARY_GRAPH_DIR as FRAMEWORKS_GRAPH_DIR,
)
from utils.rcm_compliance_analyzer import (
    load_document,
    get_text_splitter,
    RegulatoryRequirementExtractor,
    RCMControlExtractor,
    ComplianceAnalyzer,
    RemediationSuggester,
    ComplianceReportGenerator,
    analyze_rcm_against_obligations,
)
from utils.rcm_report_store import RCMReportStore
from api.routers.assets import router as assets_router
from api.routers.risk_assessment import router as risk_assessment_router

# ----------------------------------------------------------------------------
# Logging
# ----------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("api.log", mode="a")
    ]
)
logger = logging.getLogger(__name__)

class AuditStartResponse(BaseModel):
    session_id: str
    status: str
    controls_found: int
    evidence_checklist: List[Dict[str, Any]]
    message: str
    warnings: Optional[List[str]] = None

class EvidenceUploadResponse(BaseModel):
    session_id: str
    status: str
    files_processed: List[Dict[str, Any]]
    evidence_summary: Dict[str, int]
    pending_controls: List[Dict[str, Any]]
    ready_to_generate: bool
    message: str

class WorkpaperResponse(BaseModel):
    session_id: str
    status: str
    workpaper_filename: Optional[str]
    pdf_filename: Optional[str]
    summary: Dict[str, Any]
    download_url: Optional[str]
    message: str

# ----------------------------------------------------------------------------
# FastAPI instance & CORS
# ----------------------------------------------------------------------------
app = FastAPI(
    title="Trace API",
    version="2.2.0",
    description="Cybersecurity audit service with memory management, session handling, and multi-source context integration.",
    openapi_tags=[
        {"name": "meta", "description": "API information and health checks"},
        {"name": "models", "description": "Available language models"},
        {"name": "knowledge-base", "description": "Knowledge base creation"},
        {"name": "assessment", "description": "Evidence assessment and audit analysis"},
        {"name": "chat", "description": "Chat with memory and context"},
        {"name": "session", "description": "Session management"},
        {"name": "analysis", "description": "Query analysis for active feedback"}
    ]
)

from dataclasses import dataclass
from typing import BinaryIO

@dataclass
class FileWrapper:
    # file: BinaryIO
    # filename: str

    def __init__(self, filepath, filename):
        self.name = filename  # Original filename for extension detection
        self._path = filepath

    def read(self):
        with open(self._path, 'rb') as f:
            return f.read()

# Candidate directories where generated reports may be stored inside the container
DEFAULT_REPORT_DIR = Path.cwd() / "app"
API_DIR = Path(__file__).parent
REPO_ROOT = Path.cwd()
REPORTS_DIRS = [DEFAULT_REPORT_DIR, API_DIR, REPO_ROOT]

try:
    DEFAULT_REPORT_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assets_router)
app.include_router(risk_assessment_router)

# ============================================================================
# SESSION & MEMORY MANAGEMENT
# ============================================================================

class SessionMemory:
    """
    Manages conversation memory per session.
    Each client gets a unique session_id and isolated memory.
    """
    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}

    def create_session(self, session_id: str = None) -> str:
        """Create a new session with isolated memory"""
        if not session_id:
            session_id = str(uuid.uuid4())

        if session_id not in self.sessions:
            self.sessions[session_id] = {
                'created_at': datetime.now().isoformat(),
                'message_count': 0,
                'chat_history': [],
                'last_activity': datetime.now().isoformat()
            }
            logger.info(f"Created new session: {session_id}")

        return session_id

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session data"""
        return self.sessions.get(session_id)

    def add_message(self, session_id: str, role: str, content: str):
        """Add message to session history"""
        if session_id not in self.sessions:
            self.create_session(session_id)

        self.sessions[session_id]['chat_history'].append({
            'role': role,
            'content': content,
            'timestamp': datetime.now().isoformat()
        })
        self.sessions[session_id]['message_count'] += 1
        self.sessions[session_id]['last_activity'] = datetime.now().isoformat()

    def get_recent_history(self, session_id: str, k: int = 10) -> List[Dict]:
        """Get recent k messages from session"""
        session = self.get_session(session_id)
        if not session:
            return []
        return session['chat_history'][-k*2:]  # Get last k exchanges (user + assistant)

    def clear_session(self, session_id: str):
        """Clear session memory"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Cleared session: {session_id}")


# Global session manager
session_manager = SessionMemory()

# ----------------------------------------------------------------------------
# Config & Helpers
# ----------------------------------------------------------------------------
class _Cfg:
    MAX_FILE_SIZE = 1024 * 1024 * 1024 
    MAX_FILES = None
    DEFAULT_BATCH = 15
    DEFAULT_DELAY = 0.2
    DEFAULT_RETRIES = 3

app_start = time.time()
request_counter = 0

def _req_id() -> str:
    global request_counter
    request_counter += 1
    return f"req_{int(time.time())}_{request_counter}"

# ----------------------------------------------------------------------------
# In-memory Knowledge Graph Cache
# ----------------------------------------------------------------------------
GRAPH_CACHE: Dict[str, Any] = {"global": None, "company": None, "evidence": None, "chat": None}

# ----------------------------------------------------------------------------
# Pydantic models
# ----------------------------------------------------------------------------
class KBReq(BaseModel):
    selected_model: str = Field(..., description="Ollama model name")
    batch_size: int = Field(_Cfg.DEFAULT_BATCH, ge=1, le=100)
    delay_between_batches: float = Field(_Cfg.DEFAULT_DELAY, ge=0.0, le=10.0)
    max_retries: int = Field(_Cfg.DEFAULT_RETRIES, ge=1, le=10)

    @validator("selected_model")
    def _not_blank(cls, v):
        if not v.strip():
            raise ValueError("Model name must not be blank")
        return v.strip()

class FileResult(BaseModel):
    filename: str
    size_bytes: int
    status: str
    processing_time: float

class KBResp(BaseModel):
    success: bool
    message: str
    processing_summary: Dict[str, Any]
    error_details: Optional[str] = None
    files_processed: Optional[List[FileResult]] = None
    graph_node_count: Optional[int] = None
    graph_edge_count: Optional[int] = None

class AssessmentRequest(BaseModel):
    selected_model: str = Field(..., description="Ollama model for assessment")
    max_workers: int = Field(4, ge=1, le=20, description="Number of worker threads")

class AssessmentResponse(BaseModel):
    success: bool
    message: str
    workbook_path: Optional[str] = None
    processing_summary: Dict[str, Any]
    error_details: Optional[str] = None

class ChatRequest(BaseModel):
    selected_model: str = Field(..., description="Ollama model for chat")
    user_input: str = Field(..., description="User question or prompt")
    session_id: Optional[str] = Field(None, description="Session ID for conversation continuity")
    include_history: bool = Field(True, description="Whether to include conversation history")
    global_kb_path: Optional[str] = Field(None, description="Path to saved global KB graph")
    company_kb_path: Optional[str] = Field(None, description="Path to saved company KB graph")
    chat_kb_path: Optional[str] = Field(None, description="Path to saved chat attachments KB graph")
    evid_kb_path: Optional[str] = Field(None, description="Path to saved evidence KB graph")
    embedding_model: Optional[str] = Field(None, description="Optional embedding model name")

class ChatResponse(BaseModel):
    success: bool
    session_id: str
    response: Optional[str] = None
    error: Optional[str] = None
    message_count: int = 0
    loaded_paths: Optional[Dict[str, Optional[str]]] = None

# ============================================================================
# PHASE 2: QUERY ANALYSIS MODELS
# ============================================================================

class QueryAnalysisRequest(BaseModel):
    user_input: str = Field(..., description="User query to analyze")
    kb_loaded: bool = Field(False, description="Whether knowledge base is loaded")
    company_loaded: bool = Field(False, description="Whether company KB is loaded")
    evidence_loaded: bool = Field(False, description="Whether evidence KB is loaded")

class QueryAnalysisResponse(BaseModel):
    can_proceed: bool
    missing_context: List[str]
    clarification_needed: bool
    reasoning: str
    agent_request: Optional[Dict[str, Any]] = None

# ----------------------------------------------------------------------------
# Validation helpers
# ----------------------------------------------------------------------------
def _validate_upload(file: UploadFile) -> List[str]:
    errs = []
    if not file.filename:
        errs.append("Missing filename")
        return errs
    if file.size and file.size > _Cfg.MAX_FILE_SIZE:
        size_mb = file.size / 1024 / 1024
        max_mb = _Cfg.MAX_FILE_SIZE / 1024 / 1024
        errs.append(f"File {file.filename} is {size_mb:.1f} MB (max {max_mb} MB)")
    return errs

# ----------------------------------------------------------------------------
# Meta Endpoints
# ----------------------------------------------------------------------------
@app.get("/", tags=["meta"], summary="API root")
async def root():
    return {
        "name": app.title,
        "version": app.version,
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "build_kb": "/build-knowledge-base",
            "assess": "/assess-evidence",
            "summary": "/generate-summary",
            "models": "/models",
            "chat": "/chat",
            "compare-regulations": "/compare-regulations",
            "analyze": "/analyze-query",
            "session_create": "/session/create",
            "session_info": "/session/{session_id}",
            "session_clear": "/session/{session_id}",
            "session_history": "/session/{session_id}/history"
        }
    }

@app.get("/health", tags=["meta"], summary="Health check")
async def health():
    return {
        "status": "ok",
        "uptime_seconds": time.time() - app_start,
        "requests": request_counter,
        "active_sessions": len(session_manager.sessions)
    }

@app.get("/models", tags=["models"], summary="Available Ollama models")
async def models():
    try:
        names = get_ollama_model_names()
        return {"models": names, "count": len(names)}
    except Exception as e:
        raise HTTPException(500, f"Failed fetching models: {e}")

# ============================================================================
# SESSION MANAGEMENT ENDPOINTS
# ============================================================================

@app.post("/session/create", tags=["session"])
async def create_session():
    """Create a new chat session"""
    session_id = session_manager.create_session()
    return {"session_id": session_id, "created_at": datetime.now().isoformat()}

@app.get("/session/{session_id}", tags=["session"])
async def get_session_info(session_id: str):
    """Get session information"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    return {
        "session_id": session_id,
        "created_at": session['created_at'],
        "message_count": session['message_count'],
        "last_activity": session['last_activity'],
        "has_vectorstore": False
    }

@app.delete("/session/{session_id}", tags=["session"])
async def clear_session(session_id: str):
    """Clear session memory"""
    session_manager.clear_session(session_id)
    return {"success": True, "message": f"Session {session_id} cleared"}

@app.get("/session/{session_id}/history", tags=["session"])
async def get_session_history(session_id: str, limit: int = 50):
    """Get session conversation history"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    history = session['chat_history'][-limit:]
    return {"session_id": session_id, "messages": history, "total": len(history)}

# ============================================================================
# PHASE 2: HELPER FUNCTION
# ============================================================================

def create_agent_request_api(needs: dict) -> dict:
    """Create agent request for API"""
    if needs['clarification_needed']:
        return {
            'type': 'clarification',
            'message': 'Please provide more details about what you would like to know. For example, you could ask about specific security policies, request an assessment of evidence files, or inquire about company-specific compliance requirements.'
        }

    if needs['missing_context']:
        file_map = {
            'policy_documents': {
                'category': 'policy',
                'types': ['pdf', 'txt', 'docx'],
                'description': 'security policies and standards (e.g., ISO 27001, NIST frameworks)'
            },
            'evidence_files': {
                'category': 'evidence',
                'types': ['log', 'txt', 'csv', 'pdf'],
                'description': 'security logs and evidence files (e.g., access logs, firewall logs)'
            },
            'company_documents': {
                'category': 'company',
                'types': ['pdf', 'txt', 'docx', 'xlsx'],
                'description': 'company-specific documents (e.g., SOC 2 reports, CRI profiles)'
            }
        }

        missing = needs['missing_context'][0]
        file_info = file_map.get(missing, {})

        return {
            'type': 'file_upload',
            'message': f"To proceed with your request, I need {file_info.get('description', 'required files')}. Please upload the necessary files.",
            'file_category': file_info.get('category', 'general'),
            'accepted_types': file_info.get('types', ['pdf', 'txt']),
            'missing_type': missing
        }

    return None

# ============================================================================
# PHASE 2: ANALYSIS ENDPOINT
# ============================================================================

@app.post("/analyze-query", response_model=QueryAnalysisResponse, tags=["analysis"])
async def analyze_query(request: QueryAnalysisRequest):
    """
    Analyze user query to determine if agent can proceed or needs additional context.
    This enables the active feedback loop.
    """
    needs = {
        'can_proceed': True,
        'missing_context': [],
        'clarification_needed': False,
        'reasoning': ''
    }

    query_lower = request.user_input.lower()

    # Define keyword patterns
    policy_keywords = ['policy', 'policies', 'standard', 'standards', 'guideline', 
                      'compliance', 'regulation', 'requirement', 'framework', 'iso', 'nist']
    evidence_keywords = ['assess', 'audit', 'test', 'verify', 'evidence', 'log', 
                        'logs', 'analyze', 'review', 'check', 'examine', 'investigate']
    company_keywords = ['company', 'organization', 'soc', 'soc2', 'cri', 'profile',
                       'specific', 'our', 'internal', 'organizational']

    # Check for missing knowledge bases
    if any(keyword in query_lower for keyword in policy_keywords):
        if not request.kb_loaded:
            needs['can_proceed'] = False
            needs['missing_context'].append('policy_documents')
            needs['reasoning'] = 'Query requires security policies/standards but none are loaded'

    if any(keyword in query_lower for keyword in evidence_keywords):
        if not request.evidence_loaded:
            needs['can_proceed'] = False
            needs['missing_context'].append('evidence_files')
            needs['reasoning'] = 'Query requires evidence/log files for assessment but none are loaded'

    if any(keyword in query_lower for keyword in company_keywords):
        if not request.company_loaded:
            needs['can_proceed'] = False
            needs['missing_context'].append('company_documents')
            needs['reasoning'] = 'Query requires company-specific documents but none are loaded'

    # Check for vague queries
    words = request.user_input.strip().split()
    if len(words) < 3:
        needs['clarification_needed'] = True
        needs['reasoning'] = 'Query is too short or vague to determine intent'

    # Check for generic queries
    generic_patterns = ['help', 'hi', 'hello', 'what can you do', 'explain']
    if any(pattern in query_lower for pattern in generic_patterns) and len(words) < 5:
        needs['clarification_needed'] = True
        needs['reasoning'] = 'Query is generic and needs more specific context'

    # Create agent request if needed
    agent_request = None
    if not needs['can_proceed'] or needs['clarification_needed']:
        agent_request = create_agent_request_api(needs)

    logger.info(f"Query analysis: can_proceed={needs['can_proceed']}, missing={needs['missing_context']}, clarification={needs['clarification_needed']}")

    return QueryAnalysisResponse(
        can_proceed=needs['can_proceed'],
        missing_context=needs['missing_context'],
        clarification_needed=needs['clarification_needed'],
        reasoning=needs['reasoning'],
        agent_request=agent_request
    )

# ============================================================================
# ENHANCED CHAT ENDPOINT WITH MEMORY (FIXED)
# ============================================================================

@app.post("/chat", response_model=ChatResponse, tags=["chat"], summary="Chat with memory")
async def chat_with_memory(request: ChatRequest):
    """
    Enhanced chat endpoint with conversation memory.
    Maintains per-session history and semantic retrieval.

    ALL BUSINESS LOGIC IS DELEGATED TO utils/chat.py
    This endpoint only handles HTTP concerns: validation, session mgmt, error handling
    """
    rid = _req_id()
    logger.info(f"[{rid}] Chat request - model: {request.selected_model}, session: {request.session_id}")

    # ========================================================================
    # IMPORT CHAT LOGIC FROM utils/chat.py
    # ========================================================================
    from utils.chat import chat_with_ai_with_memory

    # Validate input
    try:
        request.selected_model = request.selected_model.strip()
        request.user_input = request.user_input.strip()
        if not request.selected_model or not request.user_input:
            raise ValueError("selected_model and user_input are required")
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))

    # Create or get session
    session_id = request.session_id or session_manager.create_session()
    session = session_manager.get_session(session_id)
    if not session:
        session_id = session_manager.create_session(session_id)
        session = session_manager.get_session(session_id)

    # Setup paths
    request.global_kb_path = request.global_kb_path or "saved_global_vectorstore"
    request.company_kb_path = request.company_kb_path or "saved_company_vectorstore"
    request.chat_kb_path = request.chat_kb_path or "chat_attachment_vectorstore"

    # Load knowledge graphs from disk or memory cache
    loaded_graphs: Dict[str, Any] = {"global": None, "company": None, "evidence": None, "chat": None}
    loaded_paths: Dict[str, Optional[str]] = {"global": None, "company": None, "evidence": None, "chat": None}

    try:
        if request.global_kb_path and KnowledgeGraph.exists(request.global_kb_path):
            loaded_graphs['global'] = KnowledgeGraph.load(request.global_kb_path)
            loaded_paths['global'] = request.global_kb_path
        elif GRAPH_CACHE.get("global"):
            loaded_graphs['global'] = GRAPH_CACHE["global"]
            loaded_paths['global'] = "in-memory"

        if request.company_kb_path and KnowledgeGraph.exists(request.company_kb_path):
            loaded_graphs['company'] = KnowledgeGraph.load(request.company_kb_path)
            loaded_paths['company'] = request.company_kb_path
        elif GRAPH_CACHE.get("company"):
            loaded_graphs['company'] = GRAPH_CACHE["company"]
            loaded_paths['company'] = "in-memory"

        if request.evid_kb_path and KnowledgeGraph.exists(request.evid_kb_path):
            loaded_graphs['evidence'] = KnowledgeGraph.load(request.evid_kb_path)
            loaded_paths['evidence'] = request.evid_kb_path
        elif GRAPH_CACHE.get("evidence"):
            loaded_graphs['evidence'] = GRAPH_CACHE["evidence"]
            loaded_paths['evidence'] = "in-memory"

        if request.chat_kb_path and KnowledgeGraph.exists(request.chat_kb_path):
            loaded_graphs['chat'] = KnowledgeGraph.load(request.chat_kb_path)
            loaded_paths['chat'] = request.chat_kb_path
        elif GRAPH_CACHE.get("chat"):
            loaded_graphs['chat'] = GRAPH_CACHE["chat"]
            loaded_paths['chat'] = "in-memory"
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Graph loading error: {e}")

    # Load persisted library graphs (controls, regulatory, frameworks) — non-fatal if absent
    from utils.controls_library import LIBRARY_GRAPH_DIR as CONTROLS_GRAPH_DIR
    from utils.regulatory_library import LIBRARY_GRAPH_DIR as REGULATORY_GRAPH_DIR
    from utils.frameworks_library import LIBRARY_GRAPH_DIR as FRAMEWORKS_GRAPH_DIR

    def _load_lib_graph(path: str):
        try:
            return KnowledgeGraph.load(path) if KnowledgeGraph.exists(path) else None
        except Exception as exc:
            logger.warning(f"Could not load library graph from {path}: {exc}")
            return None

    controls_lib_graph   = _load_lib_graph(CONTROLS_GRAPH_DIR)
    regulatory_lib_graph = _load_lib_graph(REGULATORY_GRAPH_DIR)
    frameworks_lib_graph = _load_lib_graph(FRAMEWORKS_GRAPH_DIR)

    logger.info(
        f"Library graphs — controls: {'loaded' if controls_lib_graph else 'absent'}, "
        f"regulatory: {'loaded' if regulatory_lib_graph else 'absent'}, "
        f"frameworks: {'loaded' if frameworks_lib_graph else 'absent'}"
    )

    try:
        response_text = chat_with_ai_with_memory(
            kb_graph=loaded_graphs['global'],
            company_kb_graph=loaded_graphs['company'],
            evid_graph=loaded_graphs['evidence'],
            chat_graph=loaded_graphs['chat'],
            controls_lib_graph=controls_lib_graph,
            regulatory_lib_graph=regulatory_lib_graph,
            frameworks_lib_graph=frameworks_lib_graph,
            selected_model=request.selected_model,
            user_input=request.user_input,
            session_manager=session_manager,
            session_id=session_id,
            include_history=request.include_history
        )

        # Save to session memory
        session_manager.add_message(session_id, "user", request.user_input)
        session_manager.add_message(session_id, "assistant", response_text)

        return ChatResponse(
            success=True,
            session_id=session_id,
            response=response_text,
            message_count=session['message_count'],
            loaded_paths=loaded_paths
        )

    except Exception as e:
        logger.error(f"Chat error: {e}")
        return ChatResponse(
            success=False,
            session_id=session_id,
            error=str(e),
            message_count=session.get('message_count', 0),
            loaded_paths=loaded_paths
        )


# ----------------------------------------------------------------------------
# Knowledge Base Building Endpoint
# ----------------------------------------------------------------------------
@app.post(
    "/build-knowledge-base",
    response_model=KBResp,
    tags=["knowledge-base"],
    summary="Build a knowledge base from uploaded files"
)
async def build_kb(
    selected_model: str = Form(...),
    batch_size: int = Form(_Cfg.DEFAULT_BATCH),
    delay_between_batches: float = Form(_Cfg.DEFAULT_DELAY),
    max_retries: int = Form(_Cfg.DEFAULT_RETRIES),
    files: List[UploadFile] = File(...),
    kb_type: str = Form("global", description="Type of KB: global/company/evidence"),
    files_source: str = Form("User Upload", description="Source of the uploaded files")
):
    rid = _req_id()
    t0 = time.time()
    logger.info(f"[{rid}] Received request with {len(files)} files for kb_type={kb_type}")

    try:
        KBReq(
            selected_model=selected_model,
            batch_size=batch_size,
            delay_between_batches=delay_between_batches,
            max_retries=max_retries
        )
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))

    if _Cfg.MAX_FILES and len(files) > _Cfg.MAX_FILES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Max {_Cfg.MAX_FILES} files per request")

    errs: List[str] = []
    for f in files:
        errs.extend([f"{f.filename}: {e}" for e in _validate_upload(f)])
    if errs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "; ".join(errs))

    tmp_paths: List[str] = []
    file_objs: List[Any] = []
    file_results: List[FileResult] = []

    try:
        for uf in files:
            start = time.time()
            ext = Path(uf.filename).suffix or ".tmp"

            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            tmp.write(await uf.read())
            tmp.close()
            file_objs.append(FileWrapper(tmp.name, uf.filename))

            file_results.append(FileResult(
                filename=uf.filename,
                size_bytes=uf.size or 0,
                status="saved",
                processing_time=time.time() - start
            ))

        knowledge_graph = build_knowledge_base(
            files=file_objs,
            source=files_source,
            selected_model=selected_model,
        )

        if knowledge_graph is None:
            return KBResp(
                success=False,
                message="Knowledge base build failed: no valid content found.",
                processing_summary={},
                error_details="No documents could be processed."
            )

        GRAPH_CACHE[kb_type] = knowledge_graph

        graph_stats = knowledge_graph.get_graph_stats()
        summary = {
            "files": len(file_objs),
            "processing_seconds": time.time() - t0,
            "model": selected_model,
            "graph_nodes": graph_stats.get("nodes", 0),
            "graph_edges": graph_stats.get("edges", 0),
            "graph_chunks": graph_stats.get("chunk_nodes", 0),
        }
        return KBResp(
            success=True,
            message="Knowledge base built",
            processing_summary=summary,
            files_processed=file_results,
            graph_node_count=graph_stats.get("nodes"),
            graph_edge_count=graph_stats.get("edges"),
        )
    except Exception as e:
        return KBResp(
            success=False, 
            message="Failed", 
            processing_summary={}, 
            error_details=str(e)
        )
    finally:
        for fh in file_objs:
            try: fh.close()
            except Exception: pass
        for p in tmp_paths:
            try: os.unlink(p)
            except Exception: pass

# ----------------------------------------------------------------------------
# Evidence Assessment Endpoint
# ----------------------------------------------------------------------------
@app.post(
    "/assess-evidence",
    response_model=AssessmentResponse,
    tags=["assessment"],
    summary="Assess evidence files against knowledge bases"
)
async def assess_evidence(
    selected_model: str = Form(...),
    max_workers: int = Form(4),
    evidence_files: List[UploadFile] = File(...)    
):   
    t0 = time.time()

    try:
        AssessmentRequest(selected_model=selected_model, max_workers=max_workers)
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))

    if not evidence_files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Evidence files are required")  

    evidence_objs: List[Any] = []
    tmp_paths: List[str] = []
    file_results: List[FileResult] = []

    try:
        for uf in evidence_files:           

            start = time.time()
            ext = Path(uf.filename).suffix or ".tmp"

            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            content = await uf.read()
            tmp.write(content)
            tmp.close()
            tmp_paths.append(tmp.name)

            evidence_objs.append(FileWrapper(tmp.name, uf.filename))

            file_results.append(FileResult(
                filename=uf.filename,
                size_bytes=len(content),
                status="saved",
                processing_time=time.time() - start
            ))

        # Load Controls Library knowledge graph (replaces saved_global/company vectorstores)
        controls_lib_graph = None
        try:
            from utils.graph_rag import KnowledgeGraph
            from utils.controls_library import LIBRARY_GRAPH_DIR as CONTROLS_GRAPH_DIR
            if KnowledgeGraph.exists(CONTROLS_GRAPH_DIR):
                controls_lib_graph = KnowledgeGraph.load(CONTROLS_GRAPH_DIR)
                logger.info(f"Loaded controls library graph from {CONTROLS_GRAPH_DIR} for assessment")
            else:
                logger.warning(
                    f"Controls library graph not found at {CONTROLS_GRAPH_DIR}. "
                    "Ingest documents via Controls Library first."
                )
        except Exception as graph_exc:
            logger.warning(f"Could not load controls library graph (non-fatal): {graph_exc}")

        # Build evidence knowledge graph
        evidence_graph = build_knowledge_base(
            files=evidence_objs,
            source="Evidence Upload",
            selected_model=selected_model,
        )
        GRAPH_CACHE["evidence"] = evidence_graph

        assessment_results = assess_evidence_with_kb(
            evidence_files=evidence_objs,
            selected_model=selected_model,
            max_workers=max_workers,
            controls_lib_graph=controls_lib_graph,
        )
        raw_assessment_results = list(assessment_results)

        assessment_summary = generate_executive_summary(raw_assessment_results,selected_model)
        report_payload = raw_assessment_results + [assessment_summary]
        workbook_path = generate_workbook(report_payload, None)

        controls_graph_stats = controls_lib_graph.get_graph_stats() if controls_lib_graph else {}

        # Persist to Reports page
        try:
            rpt_store = RCMReportStore()
            if rpt_store.is_connected and workbook_path and os.path.exists(workbook_path):
                with open(workbook_path, "rb") as f:
                    workbook_bytes = f.read()
                exec_summary_text = ""
                if assessment_summary:
                    exec_summary_text = (
                        assessment_summary.get("executive_summary", "")
                        or assessment_summary.get("summary", "")
                        or ""
                    )
                rpt_store.save_evidence_assessment_report(
                    report_data={
                        "model_used": selected_model,
                        "evidence_files": [uf.filename for uf in evidence_files],
                        "evidence_file_count": len(evidence_files),
                        "assessment_count": len(raw_assessment_results),
                        "controls_graph_nodes": controls_graph_stats.get("chunk_nodes", 0),
                        "executive_summary": exec_summary_text,
                    },
                    workbook_bytes=workbook_bytes,
                    workbook_filename=os.path.basename(workbook_path),
                )
        except Exception as rpt_exc:
            logger.warning(f"Failed to save evidence assessment report: {rpt_exc}")
        processing_summary = {
            "evidence_files": len(evidence_files),
            "evidence_documents": len(evidence_files),
            "assessment_count": len(raw_assessment_results),
            "assessment_results": raw_assessment_results,
            "executive_summary": assessment_summary.get("executive_summary", ""),
            "workbook_path": workbook_path,
            "controls_graph_nodes": controls_graph_stats.get("chunk_nodes", 0),
            "processing_seconds": time.time() - t0,
            "model_used": selected_model,
            "max_workers": max_workers
        }

        return AssessmentResponse(
            success=True,
            message="Evidence assessment completed successfully",
            workbook_path=workbook_path,
            processing_summary=processing_summary
        )
    except Exception as e:
        logger.error(f"Assessment failed: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return AssessmentResponse(
            success=False,
            message="Assessment failed",
            processing_summary={},
            error_details=str(e)
        )
    finally:
        # Clean up temp files only (FileWrapper objects don't need closing)
        for p in tmp_paths:
            try: os.unlink(p)
            except Exception: pass

# ----------------------------------------------------------------------------
# Executive Summary Endpoint
# ----------------------------------------------------------------------------
@app.post("/generate-summary", tags=["assessment"])
async def generate_summary(selected_model, assessment_results: List[Dict[str, Any]]):
    try:
        formatted_results = [{"assessment": r} for r in assessment_results]
        summary = generate_executive_summary(formatted_results,selected_model)
        return {"success": True,"executive_summary": summary.get("executive_summary", ""),"input_count": len(assessment_results)}
    except Exception as e:
        return {"success": False,"error": str(e),"executive_summary": ""}

# ----------------------------------------------------------------------------
# Report download endpoint
# ----------------------------------------------------------------------------
@app.get("/download-report", tags=["assessment"])
async def download_report(filename: str):
    rid = _req_id()
    logger.info(f"[{rid}] Download request for: {filename}")
    if not filename or '/' in filename or '\\' in filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid filename")
    found_path = None
    for d in REPORTS_DIRS:
        candidate = d / filename
        if candidate.exists() and candidate.is_file():
            found_path = candidate
            break
    if not found_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    if found_path.suffix.lower() != '.pdf':
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only PDF reports can be downloaded")
    return FileResponse(path=str(found_path), filename=filename, media_type='application/pdf')

# ----------------------------------------------------------------------------
# Knowledge Graph Save/Load Endpoints
# ----------------------------------------------------------------------------
@app.post("/save-graph", tags=["knowledge-base"])
async def save_graph_api(
    dir_path: str = Form(...),
    kb_type: str = Form("global")
):
    try:
        graph = GRAPH_CACHE.get(kb_type)
        if graph is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"No knowledge graph cached for {kb_type}")
        saved_path = graph.save(dir_path)
        graph_stats = graph.get_graph_stats()
        return {
            "success": True,
            "path": saved_path,
            "kb_type": kb_type,
            "graph_nodes": graph_stats.get("nodes", 0),
            "graph_edges": graph_stats.get("edges", 0),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

@app.post("/load-graph", tags=["knowledge-base"])
async def load_graph_api(
    dir_path: str = Form(...),
    kb_type: str = Form("global")
):
    try:
        if not KnowledgeGraph.exists(dir_path):
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"No graph file found at {dir_path}")
        GRAPH_CACHE[kb_type] = KnowledgeGraph.load(dir_path)
        graph_stats = GRAPH_CACHE[kb_type].get_graph_stats()
        return {
            "success": True,
            "path": dir_path,
            "kb_type": kb_type,
            "graph_nodes": graph_stats.get("nodes", 0),
            "graph_edges": graph_stats.get("edges", 0),
            "graph_chunks": graph_stats.get("chunk_nodes", 0),
        }
    except HTTPException:
        raise
    except FileNotFoundError as fe:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(fe))
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

#-----------------------------------------------------------------------------
# Regulatoy Compliance Endpoint Placeholder
#-----------------------------------------------------------------------------
@app.post(
    "/compare-regulations",
    tags=["analysis"],
    summary="Compare cybersecurity regulations and assess control stringency"
)
async def compare_regulations(
    selected_model: str = Form(..., description="LLM model to use (e.g., llama3, llama3:70b)"),
    max_workers: int = Form(4, description="Reserved for future parallel processing"),
    save_artifacts: bool = Form(False, description="Save detailed analysis artifacts to disk"),
    output_format: str = Form("json", description="Response format: json or markdown"),
    regulation_files: List[UploadFile] = File(..., description="Regulatory documents to compare (min 2)")
):
    """
    Compare regulatory frameworks with detailed stringency analysis.
    
    This endpoint:
    1. Analyzes document structure and regulatory approach
    2. Extracts all risk control requirements
    3. Groups similar controls across documents
    4. Calculates multi-dimensional stringency scores
    5. Generates comprehensive comparison report
    
    Returns:
    - Document framework analysis
    - Extracted controls with metadata
    - Stringency scores by domain
    - Overall compliance gap analysis
    - Detailed markdown report
    """
    rid = _req_id()
    logger.info(f"[{rid}] Regulation comparison request - Model: {selected_model}")

    # Validation
    if len(regulation_files) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least two regulation files are required for comparison"
        )
    
    if len(regulation_files) > 5:
        raise HTTPException(
            status_code=400,
            detail="Maximum 5 documents supported per comparison"
        )

    tmp_paths, filenames = [], []
    output_dir = None

    try:
        # Save uploaded files
        for uf in regulation_files:
            # Validate file type
            if not uf.filename.lower().endswith(('.pdf', '.txt', '.md')):
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file type: {uf.filename}. Use PDF, TXT, or MD."
                )
            
            ext = Path(uf.filename).suffix or ".tmp"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            content = await uf.read()
            
            if len(content) == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Empty file: {uf.filename}"
                )
            
            tmp.write(content)
            tmp.close()
            tmp_paths.append(tmp.name)
            filenames.append(uf.filename)
            
            logger.info(f"[{rid}] Uploaded: {uf.filename} ({len(content)} bytes)")

        kb_g = GRAPH_CACHE.get("global")
        logger.info(f"[{rid}] Starting analysis...")
        result = compare_regulatory_documents(
            file_paths=tmp_paths,
            filenames=filenames,
            selected_model=selected_model,
            kb_vectorstore=None,
            kb_graph=kb_g,
        )
        
        # Check for errors
        if not result.get("success", False):
            error_msg = result.get("error", "Unknown error during analysis")
            logger.error(f"[{rid}] Analysis failed: {error_msg}")
            raise HTTPException(status_code=500, detail=error_msg)
        
        logger.info(f"[{rid}] Analysis complete - {result.get('extracted_controls', 0)} controls, "
                   f"{result.get('control_groups', 0)} groups")

        # Save artifacts if requested
        if save_artifacts:
            output_dir = f"./analysis_output/{rid}"
            save_analysis_artifacts(result, output_dir)
            result["artifacts_location"] = output_dir
            logger.info(f"[{rid}] Artifacts saved to {output_dir}")

        # Return based on format
        if output_format.lower() == "markdown":
            # Return just the markdown report
            return JSONResponse({
                "success": True,
                "request_id": rid,
                "model_used": selected_model,
                "documents": filenames,
                "report": result.get("final_report", ""),
                "summary": {
                    "controls_extracted": result.get("extracted_controls", 0),
                    "control_groups": result.get("control_groups", 0),
                    "overall_stringency": result.get("stringency_analysis", {}).get("overall_stringency", {})
                }
            })
        else:
            # Return full JSON
            return JSONResponse({
                "success": True,
                "request_id": rid,
                **result
            })

    except HTTPException:
        raise
    
    except Exception as e:
        logger.error(f"[{rid}] Regulatory comparison failed")
        logger.error(traceback.format_exc())
        
        # Return detailed error info
        raise HTTPException(
            status_code=500,
            detail={
                "error": str(e),
                "request_id": rid,
                "traceback": traceback.format_exc() if os.getenv("DEBUG") else None
            }
        )

    finally:
        # Cleanup temporary files
        for p in tmp_paths:
            try:
                os.unlink(p)
            except Exception as e:
                logger.warning(f"[{rid}] Failed to delete temp file {p}: {e}")

#-----------------------------------------------------------------------------
# RCM Compliance Endpoint
#-----------------------------------------------------------------------------
@app.post(
    "/rcm_compliance",
    tags=["analysis"],
    summary="Analyze organization's RCM against regulatory/policy documents and generate compliance report"
)
async def rcm_compliance(
    selected_model: str = Form(..., description="LLM model to use (e.g., llama3:13b)"),
    regulation_files: List[UploadFile] = File(..., description="Regulatory, policy and guideline documents (min 1)"),
    rcm_file: UploadFile = File(..., description="Organization Risk Control Matrix (single file)"),
    save_artifacts: bool = Form(False, description="Save detailed artifacts to disk"),
    output_format: str = Form("json", description="Response format: json or markdown")
):
    rid = _req_id()
    logger.info(f"[{rid}] RCM compliance request - Model: {selected_model}")

    if not regulation_files or len(regulation_files) < 1:
        raise HTTPException(status_code=400, detail="At least one regulatory/policy document is required")

    tmp_paths = []
    filenames = []
    try:
        # Save regulation files
        for uf in regulation_files:
            ext = Path(uf.filename).suffix or ".tmp"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            content = await uf.read()
            if len(content) == 0:
                raise HTTPException(status_code=400, detail=f"Empty file: {uf.filename}")
            tmp.write(content)
            tmp.close()
            tmp_paths.append(tmp.name)
            filenames.append(uf.filename)
            logger.info(f"[{rid}] Uploaded regulation: {uf.filename} ({len(content)} bytes)")

        # Save RCM file
        ext = Path(rcm_file.filename).suffix or ".tmp"
        tmp_rcm = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
        rcm_content = await rcm_file.read()
        if len(rcm_content) == 0:
            raise HTTPException(status_code=400, detail=f"Empty RCM file: {rcm_file.filename}")
        tmp_rcm.write(rcm_content)
        tmp_rcm.close()
        tmp_paths.append(tmp_rcm.name)
        filenames.append(rcm_file.filename)
        logger.info(f"[{rid}] Uploaded RCM: {rcm_file.filename} ({len(rcm_content)} bytes)")

        # Load and chunk documents
        splitter = get_text_splitter()
        reg_docs = []
        for p, name in zip(tmp_paths[:-1], filenames[:-1]):
            docs = load_document(p, name)
            reg_docs.extend(docs)

        rcm_docs = load_document(tmp_rcm.name, rcm_file.filename)

        reg_chunks = splitter.split_documents(reg_docs) if reg_docs else []
        rcm_chunks = splitter.split_documents(rcm_docs) if rcm_docs else []

        if not reg_chunks:
            raise HTTPException(status_code=400, detail="No text extracted from regulatory documents")
        if not rcm_chunks:
            raise HTTPException(status_code=400, detail="No text extracted from RCM file")

        # Extract requirements and controls
        req_extractor = RegulatoryRequirementExtractor(selected_model)
        requirements = req_extractor.run(reg_chunks)

        rcm_extractor = RCMControlExtractor(selected_model)
        controls = rcm_extractor.run(rcm_chunks)

        # Analyze compliance
        analyzer = ComplianceAnalyzer(selected_model)
        analysis = analyzer.analyze_compliance(requirements, controls)

        # Generate remediation suggestions
        suggester = RemediationSuggester(selected_model)
        suggestions = suggester.generate_suggestions(analysis.get("gaps", []), analysis.get("domain_analyses", {}))

        # Generate reports
        reporter = ComplianceReportGenerator(selected_model)
        executive_summary = reporter.generate_executive_summary(analysis, suggestions)

        domain_reports = {}
        for domain, domain_analysis in analysis.get("domain_analyses", {}).items():
            domain_suggestions = suggestions.get(domain, [])
            domain_reports[domain] = reporter.generate_domain_report(domain, domain_analysis, domain_suggestions)

        result = {
            "success": True,
            "request_id": rid,
            "model_used": selected_model,
            "filenames": filenames,
            "analysis": analysis,
            "suggestions_summary_counts": {k: len(v) for k, v in suggestions.items()},
            "executive_summary": executive_summary,
            "domain_reports": domain_reports
        }

        # Save artifacts if requested
        if save_artifacts:
            output_dir = f"./rcm_analysis_output/{rid}"
            os.makedirs(output_dir, exist_ok=True)
            # Save raw analysis and suggestions
            with open(os.path.join(output_dir, "analysis.json"), "w") as fh:
                json_str = str(result.get("analysis"))
                fh.write(json_str)
            with open(os.path.join(output_dir, "suggestions.json"), "w") as fh:
                fh.write(str(suggestions))
            result["artifacts_location"] = output_dir
            logger.info(f"[{rid}] Artifacts saved to {output_dir}")

        # Return based on output_format
        if output_format.lower() == "markdown":
            # Return executive summary and domain reports concatenated
            md_report = {
                "executive_summary_md": executive_summary,
                "domain_reports_md": domain_reports
            }
            return JSONResponse({"success": True, "request_id": rid, **md_report})

        return JSONResponse(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{rid}] RCM compliance failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail={"error": str(e), "request_id": rid})
    finally:
        for p in tmp_paths:
            try:
                os.unlink(p)
            except Exception:
                pass

#-----------------------------------------------------------------------------
# RCM Compliance V2 — library-backed analysis
#-----------------------------------------------------------------------------

@app.post(
    "/rcm_compliance_v2",
    tags=["analysis"],
    summary="Analyze RCM against Regulatory Library obligations (v2 — no file upload for regulations)",
)
async def rcm_compliance_v2(
    selected_model: str = Form(..., description="LLM model to use"),
    document_ids: str = Form(..., description="JSON array of regulatory library document IDs"),
    rcm_file: UploadFile = File(..., description="Organization RCM file (Excel/PDF)"),
    save_report: bool = Form(True, description="Persist report to MongoDB"),
):
    rid = _req_id()
    logger.info(f"[{rid}] RCM compliance v2 request — model={selected_model}")

    # Parse document IDs
    try:
        doc_ids = json.loads(document_ids)
        if not isinstance(doc_ids, list) or len(doc_ids) < 1:
            raise ValueError("Need at least one document ID")
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid document_ids: {exc}")

    tmp_path = None
    try:
        # Fetch obligations from Regulatory Library
        store = MongoLibraryStore()
        all_obligations = []
        regulation_names = []

        for doc_id in doc_ids:
            doc = store.get_document(doc_id)
            if not doc:
                raise HTTPException(status_code=404, detail=f"Library document not found: {doc_id}")
            regulation_names.append(doc.get("framework_name", doc.get("source_filename", doc_id)))
            for obl in doc.get("obligations", []):
                obl["framework_name"] = doc.get("framework_name", "")
                all_obligations.append(obl)

        if not all_obligations:
            raise HTTPException(status_code=400, detail="Selected documents contain no obligations")

        logger.info(f"[{rid}] Collected {len(all_obligations)} obligations from {len(doc_ids)} documents")

        # Save RCM file to temp
        ext = Path(rcm_file.filename).suffix or ".tmp"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
        rcm_content = await rcm_file.read()
        if len(rcm_content) == 0:
            raise HTTPException(status_code=400, detail=f"Empty RCM file: {rcm_file.filename}")
        tmp.write(rcm_content)
        tmp.close()
        tmp_path = tmp.name

        # Run analysis
        result = analyze_rcm_against_obligations(
            rcm_file_path=tmp_path,
            obligations=all_obligations,
            model_name=selected_model,
        )

        if not result.get("success"):
            error_msg = result.get("error", "Analysis failed")
            # Still save report with error status
            if save_report:
                try:
                    report_store = RCMReportStore()
                    report_store.save_report(
                        {
                            "regulation_document_ids": doc_ids,
                            "regulation_names": regulation_names,
                            "model_used": selected_model,
                            "status": "error",
                            "error_message": error_msg,
                        },
                        rcm_content,
                        rcm_file.filename,
                    )
                except Exception:
                    pass
            raise HTTPException(status_code=500, detail={"error": error_msg, "request_id": rid})

        # Save report to MongoDB
        report_id = None
        if save_report:
            try:
                report_store = RCMReportStore()
                analysis = result.get("compliance_analysis", {})
                report_id = report_store.save_report(
                    {
                        "regulation_document_ids": doc_ids,
                        "regulation_names": regulation_names,
                        "model_used": selected_model,
                        "status": "success",
                        "compliance_stats": analysis.get("overall_metrics", {}),
                        "analysis": analysis,
                        "executive_summary": result.get("final_report", ""),
                        "domain_reports": {},  # v2 uses final_report as single report
                    },
                    rcm_content,
                    rcm_file.filename,
                )
                logger.info(f"[{rid}] Report saved as {report_id}")
            except Exception as exc:
                logger.warning(f"[{rid}] Failed to save report: {exc}")

        return JSONResponse({
            "success": True,
            "request_id": rid,
            "report_id": report_id,
            "model_used": selected_model,
            "filenames": [rcm_file.filename] + regulation_names,
            "analysis": result.get("compliance_analysis", {}),
            "executive_summary": result.get("final_report", ""),
            "domain_reports": {},
            "suggestions_summary_counts": {},
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{rid}] RCM compliance v2 failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail={"error": str(e), "request_id": rid})
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


#-----------------------------------------------------------------------------
# RCM Reports CRUD
#-----------------------------------------------------------------------------

@app.get("/rcm-reports", tags=["rcm-reports"], summary="List all RCM compliance reports")
async def list_rcm_reports():
    try:
        store = RCMReportStore()
        reports = store.list_reports()
        return JSONResponse({"success": True, "reports": reports, "total": len(reports)})
    except Exception as e:
        logger.error(f"Failed to list RCM reports: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/rcm-reports/{report_id}", tags=["rcm-reports"], summary="Get a full RCM report")
async def get_rcm_report(report_id: str):
    try:
        store = RCMReportStore()
        report = store.get_report(report_id)
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        return JSONResponse({"success": True, "report": report})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get RCM report {report_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/rcm-reports/{report_id}/rcm-file", tags=["rcm-reports"], summary="Download the RCM file for a report")
async def download_rcm_file(report_id: str):
    from fastapi.responses import StreamingResponse
    import io
    try:
        store = RCMReportStore()
        result = store.get_rcm_file(report_id)
        if not result:
            raise HTTPException(status_code=404, detail="Report or file not found")
        file_bytes, filename = result
        return StreamingResponse(
            io.BytesIO(file_bytes),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to download RCM file for {report_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/rcm-reports/{report_id}", tags=["rcm-reports"], summary="Delete an RCM report")
async def delete_rcm_report(report_id: str):
    try:
        store = RCMReportStore()
        deleted = store.delete_report(report_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Report not found")
        return JSONResponse({"success": True, "deleted": report_id})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete RCM report {report_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


#-----------------------------------------------------------------------------
# Regulatory Library Endpoints
#-----------------------------------------------------------------------------

@app.post(
    "/regulatory-library/ingest",
    tags=["regulatory-library"],
    summary="Upload regulatory documents and extract all obligations into the library",
)
async def library_ingest(
    selected_model: str = Form(..., description="LLM model to use"),
    regulation_files: List[UploadFile] = File(..., description="Regulatory documents (PDF, TXT, MD) — up to 10"),
):
    rid = _req_id()
    logger.info(f"[{rid}] Library ingest — {len(regulation_files)} file(s), model={selected_model}")

    if not regulation_files:
        raise HTTPException(status_code=400, detail="At least one file is required")
    if len(regulation_files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 files per request")

    tmp_paths: List[str] = []
    # Collect (tmp_path, filename) for valid files; build errors list for invalid ones
    file_jobs: List[tuple] = []
    errors = []

    try:
        # --- Phase 1: read uploads and validate (must be async, so sequential here) ---
        for uf in regulation_files:
            if not uf.filename.lower().endswith((".pdf", ".txt", ".md")):
                errors.append({"filename": uf.filename, "error": "Unsupported file type. Use PDF, TXT, or MD."})
                continue

            content = await uf.read()
            if len(content) == 0:
                errors.append({"filename": uf.filename, "error": "Empty file"})
                continue

            ext = Path(uf.filename).suffix or ".tmp"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            tmp.write(content)
            tmp.close()
            tmp_paths.append(tmp.name)
            file_jobs.append((tmp.name, uf.filename))
            logger.info(f"[{rid}] Queued for ingest: {uf.filename} ({len(content)} bytes)")

        # --- Phase 2: ingest all files in parallel (each is CPU/LLM-bound) ---
        kb_g  = GRAPH_CACHE.get("global")

        def _ingest(tmp_path: str, filename: str) -> dict:
            return ingest_regulatory_document(
                file_path=tmp_path,
                filename=filename,
                selected_model=selected_model,
                kb_vectorstore=None,
                kb_graph=kb_g,
            )

        ingested = []
        if file_jobs:
            with ThreadPoolExecutor(max_workers=min(len(file_jobs), 4)) as pool:
                future_map = {pool.submit(_ingest, p, n): n for p, n in file_jobs}
                for fut in as_completed(future_map):
                    fname = future_map[fut]
                    try:
                        result = fut.result()
                    except Exception as exc:
                        logger.error(f"[{rid}] Ingest failed for {fname}: {exc}")
                        errors.append({"filename": fname, "error": str(exc)})
                        continue

                    if result.get("success"):
                        ingested.append({
                            "document_id": result["document_id"],
                            "framework_name": result["framework_name"],
                            "issuing_authority": result.get("issuing_authority", ""),
                            "filename": result["source_filename"],
                            "total_obligations": result["total_obligations"],
                            "obligations_by_domain": result.get("obligations_by_domain", {}),
                            "mongo_saved": result.get("mongo_saved", False),
                        })
                    else:
                        errors.append({"filename": fname, "error": result.get("error", "Unknown error")})

        # Auto-remap: when new regulations are ingested, refresh all existing controls' mapped_obligations
        _remap_result = {"controls_updated": 0}
        if ingested:
            try:
                _controls_store = MongoControlsStore()
                _remap_result = remap_obligations_for_all(_controls_store, MongoLibraryStore())
                logger.info(f"[{rid}] Auto-remap after reg ingest: {_remap_result}")
            except Exception as _remap_exc:
                logger.warning(f"[{rid}] Auto-remap after regulation ingest failed (non-fatal): {_remap_exc}")

        return JSONResponse({
            "success": True,
            "request_id": rid,
            "ingested": ingested,
            "errors": errors,
            "total_ingested": len(ingested),
            "controls_remapped": _remap_result.get("controls_updated", 0),
        })

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[{rid}] Library ingest failed: {exc}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail={"error": str(exc), "request_id": rid})
    finally:
        for p in tmp_paths:
            try:
                os.unlink(p)
            except Exception:
                pass


@app.get(
    "/regulatory-library/documents",
    tags=["regulatory-library"],
    summary="List all documents stored in the regulatory library",
)
async def library_list_documents():
    try:
        store = MongoLibraryStore()
        docs = store.list_documents()
        return JSONResponse({"success": True, "documents": docs, "total": len(docs)})
    except Exception as exc:
        logger.error(f"Library list failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get(
    "/regulatory-library/documents/{document_id}",
    tags=["regulatory-library"],
    summary="Get a single library document with all its obligations",
)
async def library_get_document(document_id: str):
    try:
        store = MongoLibraryStore()
        doc = store.get_document(document_id)
        if doc is None:
            raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
        return JSONResponse({"success": True, "document": doc})
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Library get failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete(
    "/regulatory-library/documents/{document_id}",
    tags=["regulatory-library"],
    summary="Remove a document from the regulatory library",
)
async def library_delete_document(document_id: str):
    try:
        store = MongoLibraryStore()
        deleted = store.delete_document(document_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
        return JSONResponse({"success": True, "deleted": document_id})
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Library delete failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete(
    "/regulatory-library/all",
    tags=["regulatory-library"],
    summary="Delete ALL documents from the regulatory library",
)
async def library_delete_all():
    try:
        store = MongoLibraryStore()
        count = store.delete_all()
        return JSONResponse({"success": True, "deleted_count": count})
    except Exception as exc:
        logger.error(f"Library delete-all failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get(
    "/regulatory-library/search",
    tags=["regulatory-library"],
    summary="Search obligations across all library documents",
)
async def library_search(
    domain: Optional[str] = None,
    enforcement_level: Optional[str] = None,
    keyword: Optional[str] = None,
):
    try:
        store = MongoLibraryStore()
        results = store.search_obligations(
            domain=domain,
            enforcement_level=enforcement_level,
            keyword=keyword,
        )
        return JSONResponse({"success": True, "obligations": results, "total": len(results)})
    except Exception as exc:
        logger.error(f"Library search failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get(
    "/regulatory-library/all-obligations",
    tags=["regulatory-library"],
    summary="Return all obligations across all library documents (flat list)",
)
async def library_all_obligations():
    try:
        store = MongoLibraryStore()
        obligations = store.search_obligations()  # no filters = all
        return JSONResponse({"success": True, "obligations": obligations, "total": len(obligations)})
    except Exception as exc:
        logger.error(f"Library all-obligations failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get(
    "/regulatory-library/merged-obligations",
    tags=["regulatory-library"],
    summary="Return deduplicated obligations across all library documents",
)
async def library_merged_obligations():
    try:
        store = MongoLibraryStore()
        all_obls = store.search_obligations()
        merged = merge_similar_obligations(all_obls)
        return JSONResponse({
            "success": True,
            "merged_obligations": merged,
            "total_raw": len(all_obls),
            "total_merged": len(merged),
        })
    except Exception as exc:
        logger.error(f"Library merged-obligations failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


class LibraryGapAnalysisRequest(BaseModel):
    document_ids: List[str]
    selected_model: str = ""   # empty -> use default Ollama model
    generate_report: bool = True


class GapReportPdfRequest(BaseModel):
    final_report: str
    title: str = "Regulatory Gap Analysis Report"


@app.post(
    "/regulatory-library/gap-analysis",
    tags=["regulatory-library"],
    summary="Similarity, differences and gap analysis across selected library documents",
)
async def library_gap_analysis(request: LibraryGapAnalysisRequest):
    if len(request.document_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 documents are required for gap analysis")

    try:
        store = MongoLibraryStore()

        docs_data: Dict[str, Any] = {}
        for doc_id in request.document_ids:
            doc = store.get_document(doc_id)
            if doc:
                docs_data[doc_id] = doc

        if len(docs_data) < 2:
            raise HTTPException(status_code=404, detail="Could not find at least 2 documents in the library")

        # Build per-doc domain → obligations mapping
        doc_domain_map: Dict[str, Dict[str, List]] = {}
        all_domains: set = set()

        for doc_id, doc in docs_data.items():
            obligations = doc.get("obligations", [])
            by_domain: Dict[str, List] = {}
            for obl in obligations:
                domain = obl.get("domain", "general")
                by_domain.setdefault(domain, []).append(obl)
            doc_domain_map[doc_id] = by_domain
            all_domains.update(by_domain.keys())

        # ── Domain coverage matrix ───────────────────────────────────────────
        domain_coverage: Dict[str, Any] = {}
        for domain in sorted(all_domains):
            present_in = [d for d in docs_data if domain in doc_domain_map[d]]
            absent_in  = [d for d in docs_data if domain not in doc_domain_map[d]]
            domain_coverage[domain] = {
                "present_in":  present_in,
                "absent_in":   absent_in,
                "coverage_pct": round(len(present_in) / len(docs_data) * 100, 1),
                "obligation_counts": {
                    d: len(doc_domain_map[d].get(domain, []))
                    for d in present_in
                },
            }

        # ── Similarities (domains present in ALL selected docs) ──────────────
        similarities: List[Dict] = []
        for domain, info in domain_coverage.items():
            if info["absent_in"]:
                continue  # skip domains not universally covered
            entry: Dict[str, Any] = {"domain": domain, "docs": {}}
            for doc_id in docs_data:
                obls = doc_domain_map[doc_id].get(domain, [])
                # Pick top 3 most keyword-rich obligations as representatives
                top = sorted(obls, key=lambda o: len(o.get("keywords", [])), reverse=True)[:3]
                entry["docs"][doc_id] = {
                    "count": len(obls),
                    "enforcement_breakdown": {
                        lvl: sum(1 for o in obls if o.get("enforcement_level") == lvl)
                        for lvl in ("mandatory", "recommended", "optional")
                    },
                    "sample_obligations": [
                        {
                            "text": o["obligation_text"][:250],
                            "section": o.get("section_reference", ""),
                            "enforcement": o.get("enforcement_level", ""),
                            "keywords": o.get("keywords", [])[:5],
                        }
                        for o in top
                    ],
                }
            similarities.append(entry)

        # ── Unique obligations per doc (domains not covered by any other doc) ─
        unique_by_doc: Dict[str, Any] = {}
        for doc_id in docs_data:
            other_domains = set().union(
                *(doc_domain_map[other].keys() for other in docs_data if other != doc_id)
            )
            unique_domains = set(doc_domain_map[doc_id].keys()) - other_domains
            partial_domains = set(doc_domain_map[doc_id].keys()) - unique_domains  # covered elsewhere too

            sample: List[Dict] = []
            for domain in list(unique_domains)[:5]:
                for obl in doc_domain_map[doc_id].get(domain, [])[:2]:
                    sample.append({
                        "domain": domain,
                        "text": obl["obligation_text"][:250],
                        "section": obl.get("section_reference", ""),
                        "enforcement": obl.get("enforcement_level", ""),
                    })

            unique_by_doc[doc_id] = {
                "unique_domains": list(unique_domains),
                "unique_domain_count": len(unique_domains),
                "unique_obligation_count": sum(
                    len(doc_domain_map[doc_id].get(d, [])) for d in unique_domains
                ),
                "shared_domain_count": len(partial_domains),
                "sample_obligations": sample,
            }

        # ── Differences (domains present in some but not all docs) ──────────
        differences: List[Dict] = []
        for domain, info in domain_coverage.items():
            if not info["absent_in"]:
                continue  # already in similarities
            differences.append({
                "domain": domain,
                "coverage_pct": info["coverage_pct"],
                "present_in": info["present_in"],
                "absent_in": info["absent_in"],
                "obligation_counts": info["obligation_counts"],
            })
        differences.sort(key=lambda x: x["coverage_pct"], reverse=True)

        # ── Gap summary ──────────────────────────────────────────────────────
        most_unique_doc = max(unique_by_doc, key=lambda k: unique_by_doc[k]["unique_obligation_count"]) if unique_by_doc else None
        best_covered_doc = max(docs_data, key=lambda k: len(doc_domain_map[k])) if docs_data else None

        gap_summary = {
            "total_documents": len(docs_data),
            "total_domains": len(all_domains),
            "shared_domain_count": len(similarities),
            "shared_domains": [s["domain"] for s in similarities],
            "partial_coverage_domain_count": len(differences),
            "most_unique_doc": most_unique_doc,
            "best_covered_doc": best_covered_doc,
            "doc_domain_counts": {d: len(doc_domain_map[d]) for d in docs_data},
        }

        # ── LLM-generated report (non-fatal if it fails) ────────────────────
        final_report = ""
        graph_context_used = False
        graph_stats = None
        if request.generate_report:
            try:
                from utils.graph_rag import KnowledgeGraph
                from utils.regulatory_library import (
                    generate_library_gap_report,
                    LIBRARY_GRAPH_DIR as REG_LIB_GRAPH_DIR,
                )
                kb_graph_local = None
                if KnowledgeGraph.exists(REG_LIB_GRAPH_DIR):
                    kb_graph_local = KnowledgeGraph.load(REG_LIB_GRAPH_DIR)
                    graph_stats = kb_graph_local.get_graph_stats()
                    graph_context_used = True
                final_report = generate_library_gap_report(
                    gap_data={
                        "domain_coverage": domain_coverage,
                        "similarities": similarities,
                        "differences": differences,
                        "unique_by_doc": unique_by_doc,
                        "gap_summary": gap_summary,
                    },
                    docs_data=docs_data,
                    selected_model=request.selected_model,
                    kb_graph=kb_graph_local,
                )
            except Exception as exc:
                logger.warning(f"Gap report generation failed (non-fatal): {exc}")

        # ── Persist record in Reports store (non-fatal) ─────────────────────
        saved_report_id = None
        try:
            from utils.rcm_report_store import RCMReportStore
            rpt_store = RCMReportStore()
            if rpt_store.is_connected:
                doc_names = [d.get("framework_name", did) for did, d in docs_data.items()]
                saved_report_id = rpt_store.save_gap_analysis_report({
                    "regulation_document_ids": list(docs_data.keys()),
                    "document_names": doc_names,
                    "document_count": len(docs_data),
                    "model_used": request.selected_model,
                    "final_report": final_report,
                    "gap_summary": gap_summary,
                    "graph_context_used": graph_context_used,
                    "graph_stats": graph_stats,
                    "gap_analysis_data": {
                        "domain_coverage": domain_coverage,
                        "similarities": [
                            {k: v for k, v in s.items() if k != "docs"} for s in similarities
                        ],
                        "differences": differences,
                        "unique_by_doc": {
                            did: {k: v for k, v in u.items() if k != "sample_obligations"}
                            for did, u in unique_by_doc.items()
                        },
                    },
                })
                logger.info(f"Gap analysis report saved to store: {saved_report_id}")
        except Exception as exc:
            logger.warning(f"Failed to persist gap analysis report (non-fatal): {exc}")

        return JSONResponse({
            "success": True,
            "documents": {
                doc_id: {
                    "framework_name": doc.get("framework_name", doc_id),
                    "source_filename": doc.get("source_filename", ""),
                    "total_obligations": doc.get("total_obligations", 0),
                    "domains_count": len(doc_domain_map[doc_id]),
                }
                for doc_id, doc in docs_data.items()
            },
            "domain_coverage": domain_coverage,
            "similarities": similarities,
            "differences": differences,
            "unique_by_doc": unique_by_doc,
            "gap_summary": gap_summary,
            "final_report": final_report,
            "graph_context_used": graph_context_used,
            "graph_stats": graph_stats,
            "saved_report_id": saved_report_id,
        })

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Library gap analysis failed: {exc}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post(
    "/regulatory-library/gap-analysis-pdf",
    tags=["regulatory-library"],
    summary="Generate PDF from a regulatory gap analysis markdown report",
)
async def library_gap_analysis_pdf(body: GapReportPdfRequest):
    """Accept a markdown report string and return a formatted PDF file."""
    if not body.final_report.strip():
        raise HTTPException(status_code=400, detail="final_report is empty")
    try:
        from utils.regulatory_library import generate_gap_report_pdf
        from fastapi.responses import Response
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.close()
        ok = generate_gap_report_pdf(body.final_report, tmp.name)
        if not ok:
            raise HTTPException(status_code=500, detail="PDF generation failed")
        with open(tmp.name, "rb") as f:
            pdf_bytes = f.read()
        os.unlink(tmp.name)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=\"regulatory_gap_analysis.pdf\""},
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Gap analysis PDF generation failed: {exc}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(exc))


#-----------------------------------------------------------------------------
# Controls Library Endpoints
#-----------------------------------------------------------------------------

@app.post(
    "/controls-library/ingest",
    tags=["controls-library"],
    summary="Upload company policy documents and extract controls into the controls library",
)
async def controls_library_ingest(
    selected_model: str = Form(..., description="LLM model to use"),
    policy_files: List[UploadFile] = File(..., description="Policy documents (PDF, DOCX, TXT, MD) — up to 10"),
):
    rid = _req_id()
    logger.info(f"[{rid}] Controls library ingest — {len(policy_files)} file(s), model={selected_model}")

    if not policy_files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    tmp_paths: List[str] = []
    file_jobs: List[tuple] = []
    errors = []

    try:
        for uf in policy_files:
            if not uf.filename.lower().endswith((".pdf", ".docx", ".doc", ".txt", ".md", ".xlsx", ".xls", ".csv")):
                errors.append({"filename": uf.filename, "error": "Unsupported file type. Use PDF, DOCX, TXT, MD, XLSX, or CSV."})
                continue

            content = await uf.read()
            if len(content) == 0:
                errors.append({"filename": uf.filename, "error": "Empty file"})
                continue

            ext = Path(uf.filename).suffix or ".tmp"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            tmp.write(content)
            tmp.close()
            tmp_paths.append(tmp.name)
            file_jobs.append((tmp.name, uf.filename))
            logger.info(f"[{rid}] Queued for controls ingest: {uf.filename} ({len(content)} bytes)")

        # Provide the regulatory store so controls get mapped to obligations
        reg_store = MongoLibraryStore()
        kb_g  = GRAPH_CACHE.get("global")

        def _ingest(tmp_path: str, filename: str) -> dict:
            return ingest_controls_document(
                file_path=tmp_path,
                filename=filename,
                selected_model=selected_model,
                regulatory_store=reg_store,
                kb_vectorstore=None,
                kb_graph=kb_g,
            )

        ingested = []
        if file_jobs:
            with ThreadPoolExecutor(max_workers=min(len(file_jobs), 8)) as pool:
                future_map = {pool.submit(_ingest, p, n): n for p, n in file_jobs}
                for fut in as_completed(future_map):
                    fname = future_map[fut]
                    try:
                        result = fut.result()
                    except Exception as exc:
                        logger.error(f"[{rid}] Controls ingest failed for {fname}: {exc}")
                        errors.append({"filename": fname, "error": str(exc)})
                        continue

                    if result.get("success"):
                        ingested.append({
                            "document_id": result["document_id"],
                            "filename": result["source_filename"],
                            "total_controls": result["total_controls"],
                            "controls_by_domain": result.get("controls_by_domain", {}),
                            "mongo_saved": result.get("mongo_saved", False),
                        })
                    else:
                        errors.append({"filename": fname, "error": result.get("error", "Unknown error")})

        # Compute cross-doc merged count for response metadata
        merged_count = 0
        try:
            ctrl_store = MongoControlsStore()
            all_ctrls = ctrl_store.all_controls()
            merged = merge_similar_controls(all_ctrls)
            merged_count = len(merged)
        except Exception as exc:
            logger.warning(f"[{rid}] Merge count computation failed (non-fatal): {exc}")

        return JSONResponse({
            "success": True,
            "request_id": rid,
            "ingested": ingested,
            "errors": errors,
            "total_ingested": len(ingested),
            "merged_count": merged_count,
        })

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[{rid}] Controls library ingest failed: {exc}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail={"error": str(exc), "request_id": rid})
    finally:
        for p in tmp_paths:
            try:
                os.unlink(p)
            except Exception:
                pass


@app.get(
    "/controls-library/documents",
    tags=["controls-library"],
    summary="List all documents in the controls library",
)
async def controls_list_documents():
    try:
        store = MongoControlsStore()
        docs = store.list_documents()
        return JSONResponse({"success": True, "documents": docs, "total": len(docs)})
    except Exception as exc:
        logger.error(f"Controls library list failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get(
    "/controls-library/documents/{document_id}",
    tags=["controls-library"],
    summary="Get a single controls document with all its controls",
)
async def controls_get_document(document_id: str):
    try:
        store = MongoControlsStore()
        doc = store.get_document(document_id)
        if doc is None:
            raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
        return JSONResponse({"success": True, "document": doc})
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Controls library get failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete(
    "/controls-library/documents/{document_id}",
    tags=["controls-library"],
    summary="Remove a document from the controls library",
)
async def controls_delete_document(document_id: str):
    try:
        store = MongoControlsStore()
        deleted = store.delete_document(document_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
        return JSONResponse({"success": True, "deleted": document_id})
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Controls library delete failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete(
    "/controls-library/all",
    tags=["controls-library"],
    summary="Delete ALL documents from the controls library",
)
async def controls_delete_all():
    try:
        store = MongoControlsStore()
        count = store.delete_all()
        return JSONResponse({"success": True, "deleted_count": count})
    except Exception as exc:
        logger.error(f"Controls library delete-all failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post(
    "/controls-library/remap-obligations",
    tags=["controls-library"],
    summary="Re-map all stored controls against the current regulatory obligations library",
)
async def controls_remap_obligations():
    try:
        controls_store = MongoControlsStore()
        reg_store = MongoLibraryStore()
        if not controls_store.is_connected:
            raise HTTPException(status_code=503, detail="Controls DB unavailable")
        if not reg_store.is_connected:
            raise HTTPException(status_code=503, detail="Regulatory DB unavailable")
        result = remap_obligations_for_all(controls_store, reg_store)
        return JSONResponse({"success": True, **result})
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[CONTROLS] Remap obligations failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get(
    "/controls-library/all-controls",
    tags=["controls-library"],
    summary="Return all raw extracted controls across all documents, with source filename injected",
)
async def controls_get_all():
    try:
        store = MongoControlsStore()
        controls = store.all_controls()
        # Strip internal-only keys before sending to client
        for c in controls:
            c.pop("_document_id", None)
        return JSONResponse({"success": True, "controls": controls, "total": len(controls)})
    except Exception as exc:
        logger.error(f"Controls library all-controls failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get(
    "/controls-library/merged",
    tags=["controls-library"],
    summary="Get deduplicated merged controls across all documents in the controls library",
)
async def controls_get_merged():
    try:
        store = MongoControlsStore()
        all_ctrls = store.all_controls()
        merged = merge_similar_controls(all_ctrls)
        return JSONResponse({
            "success": True,
            "merged_controls": merged,
            "total_raw": len(all_ctrls),
            "total_merged": len(merged),
        })
    except Exception as exc:
        logger.error(f"Controls library merged failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


#-----------------------------------------------------------------------------
# Frameworks Library Endpoints
#-----------------------------------------------------------------------------

@app.post(
    "/frameworks-library/ingest",
    tags=["frameworks-library"],
    summary="Upload and extract framework elements from one or more framework documents",
)
async def frameworks_ingest(
    selected_model: str = Form(...),
    framework_files: List[UploadFile] = File(...),
):
    if not framework_files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(framework_files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 files per request")

    ALLOWED_EXT = {".pdf", ".docx", ".doc", ".txt", ".md"}
    results = []

    for upload in framework_files:
        ext = Path(upload.filename).suffix.lower()
        if ext not in ALLOWED_EXT:
            results.append({
                "success": False,
                "source_filename": upload.filename,
                "error": f"Unsupported file type: {ext}",
            })
            continue

        tmp = None
        try:
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            tmp.write(await upload.read())
            tmp.close()

            kb_g = GRAPH_CACHE.get("global")

            result = ingest_framework_document(
                file_path=tmp.name,
                filename=upload.filename,
                selected_model=selected_model,
                kb_vectorstore=None,
                kb_graph=kb_g,
            )
            results.append(result)
        except Exception as exc:
            logger.error(f"Frameworks ingest failed for {upload.filename}: {exc}")
            results.append({"success": False, "source_filename": upload.filename, "error": str(exc)})
        finally:
            if tmp and os.path.exists(tmp.name):
                os.unlink(tmp.name)

    succeeded = sum(1 for r in results if r.get("success"))
    return JSONResponse({
        "success": succeeded > 0,
        "processed": len(results),
        "succeeded": succeeded,
        "failed": len(results) - succeeded,
        "results": results,
    })


@app.get(
    "/frameworks-library/documents",
    tags=["frameworks-library"],
    summary="List all documents in the frameworks library",
)
async def frameworks_list_documents():
    try:
        store = MongoFrameworksStore()
        docs = store.list_documents()
        return JSONResponse({"success": True, "documents": docs, "total": len(docs)})
    except Exception as exc:
        logger.error(f"Frameworks list documents failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get(
    "/frameworks-library/documents/{document_id}",
    tags=["frameworks-library"],
    summary="Get a single frameworks library document with all elements",
)
async def frameworks_get_document(document_id: str):
    try:
        store = MongoFrameworksStore()
        doc = store.get_document(document_id)
        if not doc:
            raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
        return JSONResponse({"success": True, "document": doc})
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Frameworks get document failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete(
    "/frameworks-library/documents/{document_id}",
    tags=["frameworks-library"],
    summary="Delete a single document from the frameworks library",
)
async def frameworks_delete_document(document_id: str):
    try:
        store = MongoFrameworksStore()
        deleted = store.delete_document(document_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
        # Rebuild graph after deletion
        try:
            build_frameworks_graph(store, FRAMEWORKS_GRAPH_DIR)
        except Exception as _exc:
            pass
        return JSONResponse({"success": True, "document_id": document_id})
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Frameworks delete document failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete(
    "/frameworks-library/all",
    tags=["frameworks-library"],
    summary="Delete all documents from the frameworks library",
)
async def frameworks_delete_all():
    try:
        store = MongoFrameworksStore()
        count = store.delete_all()
        return JSONResponse({"success": True, "deleted_count": count})
    except Exception as exc:
        logger.error(f"Frameworks delete all failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get(
    "/frameworks-library/all-elements",
    tags=["frameworks-library"],
    summary="Return all raw extracted elements across all framework documents",
)
async def frameworks_get_all_elements():
    try:
        store = MongoFrameworksStore()
        elements = store.all_elements()
        for e in elements:
            e.pop("_document_id", None)
        return JSONResponse({"success": True, "elements": elements, "total": len(elements)})
    except Exception as exc:
        logger.error(f"Frameworks all-elements failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get(
    "/frameworks-library/merged",
    tags=["frameworks-library"],
    summary="Get deduplicated merged framework elements across all documents",
)
async def frameworks_get_merged():
    try:
        store = MongoFrameworksStore()
        all_elems = store.all_elements()
        merged = merge_similar_framework_elements(all_elems)
        return JSONResponse({
            "success": True,
            "merged_elements": merged,
            "total_raw": len(all_elems),
            "total_merged": len(merged),
        })
    except Exception as exc:
        logger.error(f"Frameworks merged failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get(
    "/frameworks-library/graph-stats",
    tags=["frameworks-library"],
    summary="Return stats for the saved frameworks library knowledge graph",
)
async def frameworks_graph_stats():
    try:
        from utils.graph_rag import KnowledgeGraph
        if KnowledgeGraph.exists(FRAMEWORKS_GRAPH_DIR):
            graph = KnowledgeGraph.load(FRAMEWORKS_GRAPH_DIR)
            stats = graph.get_graph_stats()
            graph_path = os.path.join(FRAMEWORKS_GRAPH_DIR, "graph.json")
            graph_mtime = os.path.getmtime(graph_path) if os.path.exists(graph_path) else None
            import datetime as _dt
            last_updated = (
                _dt.datetime.utcfromtimestamp(graph_mtime).isoformat() + "Z"
                if graph_mtime else None
            )
            return JSONResponse({"success": True, "graph_exists": True, "stats": stats, "last_updated": last_updated})
        return JSONResponse({"success": True, "graph_exists": False, "stats": {}, "last_updated": None})
    except Exception as exc:
        logger.error(f"Frameworks graph-stats failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


#-----------------------------------------------------------------------------
# AI Control Testing Endpoint
#-----------------------------------------------------------------------------

@app.post("/audit/start", tags=["audit"], response_model=AuditStartResponse)
async def audit_start(
    selected_model: str = Form(...),
    test_script: UploadFile = File(...)
):
    """
    Start an audit session by uploading a test script.
    Parses the test script and returns evidence checklist.
    """
    rid = _req_id()
    logger.info(f"[{rid}] POST /audit/start - model={selected_model}, file={test_script.filename}")
    
    # Cleanup expired sessions
    audit_session_store.cleanup_expired_sessions()
    
    # Validate file
    errs = _validate_upload(test_script)
    if errs:
        raise HTTPException(400, {"errors": errs, "request_id": rid})
    
    tmp_test_script = None
    
    try:
        # Save test script to temp file
        tmp_test_script = tempfile.NamedTemporaryFile(
            delete=False, 
            suffix=Path(test_script.filename).suffix
        )
        tmp_test_script.write(test_script.file.read())
        tmp_test_script.close()
        
        # Parse test script
        controls = parse_test_script(tmp_test_script.name)
        
        if not controls:
            raise HTTPException(400, {"error": "No controls found in test script", "request_id": rid})
        
        # Validate controls
        warnings = validate_controls(controls)
        
        # Create audit session
        session_id = audit_session_store.create_session(model=selected_model)
        
        # Store test script in session directory
        session_dir = audit_session_store.get_session_temp_dir(session_id)
        test_script_path = session_dir / test_script.filename
        
        import shutil
        shutil.copy(tmp_test_script.name, test_script_path)
        
        # Set test script data in session
        audit_session_store.set_test_script(
            session_id=session_id,
            filename=test_script.filename,
            controls=controls
        )
        
        # Build evidence checklist
        evidence_checklist = []
        for control in controls:
            evidence_checklist.append({
                "control_id": control.get("control_id"),
                "control_description": control.get("control_description", "")[:150],
                "evidence_required": control.get("evidence_required", ""),
                "status": "pending"
            })
        
        logger.info(f"[{rid}] Created audit session {session_id} with {len(controls)} controls")
        
        return AuditStartResponse(
            session_id=session_id,
            status="awaiting_evidence",
            controls_found=len(controls),
            evidence_checklist=evidence_checklist,
            message=f"Test script parsed successfully. Please upload evidence files for {len(controls)} controls.",
            warnings=warnings if warnings else None
        )
    
    except HTTPException:
        raise
    
    except Exception as e:
        logger.error(f"[{rid}] Audit start failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(500, {"error": str(e), "request_id": rid})
    
    finally:
        if tmp_test_script:
            try:
                os.unlink(tmp_test_script.name)
            except:
                pass


@app.post("/audit/upload-evidence", tags=["audit"], response_model=EvidenceUploadResponse)
async def audit_upload_evidence(
    session_id: str = Form(...),
    evidence_files: List[UploadFile] = File(...)
):
    """
    Upload evidence files for an audit session.
    Validates files and maps them to controls.
    """
    rid = _req_id()
    logger.info(f"[{rid}] POST /audit/upload-evidence - session={session_id}, files={len(evidence_files)}")
    
    # Get session
    session = audit_session_store.get_session(session_id)
    if not session:
        raise HTTPException(404, {"error": "Session not found", "request_id": rid})
    
    if session["status"] == "complete":
        raise HTTPException(400, {"error": "Session already completed", "request_id": rid})
    
    model = session["model"]
    session_dir = audit_session_store.get_session_temp_dir(session_id)
    evidence_dir = session_dir / "evidence"
    
    files_processed = []
    
    try:
        # Get pending controls
        pending_controls = audit_session_store.get_pending_controls(session_id)
        
        # Process each file
        for evidence_file in evidence_files:
            # Validate file
            errs = _validate_upload(evidence_file)
            if errs:
                files_processed.append({
                    "filename": evidence_file.filename,
                    "validation_status": "rejected",
                    "reason": "; ".join(errs)
                })
                continue
            
            # Save file to evidence directory
            file_path = evidence_dir / evidence_file.filename
            with open(file_path, "wb") as f:
                f.write(evidence_file.file.read())
            
            # Validate evidence
            validation_result = validate_evidence_file(
                file_path=str(file_path),
                filename=evidence_file.filename,
                pending_controls=pending_controls,
                model=model
            )
            
            # Add to session
            audit_session_store.add_uploaded_file(
                session_id=session_id,
                filename=evidence_file.filename,
                tmp_path=str(file_path),
                file_size=file_path.stat().st_size,
                validation_result=validation_result
            )
            
            # Build response for this file
            files_processed.append({
                "filename": evidence_file.filename,
                "validation_status": validation_result["validation_status"],
                "content_type_detected": validation_result.get("content_type_detected"),
                "satisfies_controls": validation_result.get("satisfies_controls", []),
                "reason": validation_result.get("rejection_reason") or "File accepted"
            })
        
        # Get updated session state
        session = audit_session_store.get_session(session_id)
        evidence_summary = audit_session_store.get_evidence_summary(session_id)
        pending_controls_updated = audit_session_store.get_pending_controls(session_id)
        ready_to_generate = evidence_summary["pending"] == 0
        
        message = f"Processed {len(files_processed)} files. "
        if ready_to_generate:
            message += "All evidence received. Ready to generate workpaper."
        else:
            message += f"{evidence_summary['pending']} controls still need evidence."
        
        logger.info(f"[{rid}] Evidence upload complete. {evidence_summary['received']}/{evidence_summary['total_controls']} received")
        
        return EvidenceUploadResponse(
            session_id=session_id,
            status=session["status"],
            files_processed=files_processed,
            evidence_summary=evidence_summary,
            pending_controls=pending_controls_updated,
            ready_to_generate=ready_to_generate,
            message=message
        )
    
    except HTTPException:
        raise
    
    except Exception as e:
        logger.error(f"[{rid}] Evidence upload failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(500, {"error": str(e), "request_id": rid})


@app.post("/audit/generate-workpaper", tags=["audit"], response_model=WorkpaperResponse)
async def audit_generate_workpaper(
    session_id: str = Form(...),
    force_generate: bool = Form(False)
):
    """
    Generate workpaper from analyzed evidence.
    Set force_generate=True to generate even with missing evidence.
    """
    rid = _req_id()
    logger.info(f"[{rid}] POST /audit/generate-workpaper - session={session_id}, force={force_generate}")
    
    # Get session
    session = audit_session_store.get_session(session_id)
    if not session:
        raise HTTPException(404, {"error": "Session not found", "request_id": rid})
    
    # Check if evidence is complete
    evidence_summary = audit_session_store.get_evidence_summary(session_id)
    pending_controls = audit_session_store.get_pending_controls(session_id)
    
    if evidence_summary["pending"] > 0 and not force_generate:
        raise HTTPException(400, {
            "error": "Incomplete evidence",
            "message": f"{evidence_summary['pending']} controls still need evidence. Set force_generate=true to proceed anyway.",
            "pending_controls": pending_controls,
            "request_id": rid
        })
    
    try:
        # Load Control Library knowledge graph (non-fatal if absent)
        kb1_graph = None
        try:
            from utils.controls_library import LIBRARY_GRAPH_DIR as CONTROLS_GRAPH_DIR
            if KnowledgeGraph.exists(CONTROLS_GRAPH_DIR):
                kb1_graph = KnowledgeGraph.load(CONTROLS_GRAPH_DIR)
                logger.info(f"[{rid}] Loaded control library graph from {CONTROLS_GRAPH_DIR}")
            else:
                logger.info(f"[{rid}] No control library graph at {CONTROLS_GRAPH_DIR} — graph-RAG skipped.")
        except Exception as graph_exc:
            logger.warning(f"[{rid}] Could not load control library graph (non-fatal): {graph_exc}")

        # Analyze all controls
        model = session["model"]

        logger.info(f"[{rid}] Starting analysis of {len(session['controls'])} controls")

        analysis_results = analyze_all_controls(
            session_data=session,
            kb1_vectorstore=None,
            kb2_vectorstore=None,
            model=model,
            kb1_graph=kb1_graph,
            controls_lib_graph=kb1_graph,
        )
        
        logger.info(f"[{rid}] Analysis complete. Generating workpaper.")
        
        # Generate summary
        summary = generate_overall_summary(analysis_results)
        
        # Fill workpaper template
        template_path = Path(__file__).parent / "utils" / "Consolidated_WP_Template.xlsx"
        session_dir = audit_session_store.get_session_temp_dir(session_id)
        output_dir = session_dir / "output"
        
        workpaper_filename = f"workpaper_{session_id}.xlsx"
        workpaper_path = output_dir / workpaper_filename
        
        fill_workpaper_template(
            template_path=str(template_path),
            output_path=str(workpaper_path),
            session_data=session,
            analysis_results=analysis_results
        )
        
        logger.info(f"[{rid}] Workpaper generated: {workpaper_path}")

        # Save to Reports page (non-fatal)
        try:
            from utils.rcm_report_store import RCMReportStore
            rpt_store = RCMReportStore()
            if rpt_store.is_connected:
                with open(workpaper_path, "rb") as _f:
                    wp_bytes = _f.read()
                rpt_store.save_control_testing_report(
                    report_data={
                        "session_id": session_id,
                        "model_used": model,
                        "controls_tested": len(session.get("controls", [])),
                        "summary": summary,
                        "analysis": {r["control_id"]: r for r in analysis_results},
                    },
                    workpaper_bytes=wp_bytes,
                    workpaper_filename=workpaper_filename,
                )
                logger.info(f"[{rid}] Saved control testing report to Records")
        except Exception as rpt_exc:
            logger.warning(f"[{rid}] Failed to save control testing report (non-fatal): {rpt_exc}")

        # Mark session complete
        audit_session_store.mark_analysis_complete(
            session_id=session_id,
            workpaper_path=str(workpaper_path),
            pdf_path=None
        )
        
        # Build download URL
        download_url = f"/audit/download/{session_id}/{workpaper_filename}"
        
        return WorkpaperResponse(
            session_id=session_id,
            status="complete",
            workpaper_filename=workpaper_filename,
            pdf_filename=None,
            summary=summary,
            download_url=download_url,
            message=f"Workpaper generated successfully. {summary['controls_tested']} controls tested, {summary['pass_count']} passed."
        )
    
    except HTTPException:
        raise
    
    except Exception as e:
        logger.error(f"[{rid}] Workpaper generation failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(500, {"error": str(e), "request_id": rid, "traceback": traceback.format_exc()})


@app.get("/audit/download/{session_id}/{filename}", tags=["audit"])
async def audit_download_file(session_id: str, filename: str):
    """Download generated workpaper file."""
    session = audit_session_store.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    
    session_dir = audit_session_store.get_session_temp_dir(session_id)
    file_path = session_dir / "output" / filename
    
    if not file_path.exists():
        raise HTTPException(404, "File not found")
    
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


@app.delete("/audit/session/{session_id}", tags=["audit"])
async def audit_clear_session(session_id: str):
    """Clear audit session and delete temp files."""
    session = audit_session_store.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    
    audit_session_store.clear_session(session_id)
    
    return {"message": f"Session {session_id} cleared", "success": True}

# ----------------------------------------------------------------------------
# Run with:  uvicorn api.main:app --reload
# ----------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn    
    uvicorn.run("api.main:app", host="0.0.0.0", port=5000, reload=True)
