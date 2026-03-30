# ============================================================================
# COMPLETE utils/chat.py WITH PHASE 2 IMPLEMENTATION
# Replace your entire utils/chat.py with this file
# ============================================================================

import os
import logging
try:
    import streamlit as st
except ImportError:
    st = None  # Not available in FastAPI container — only needed for Streamlit UI functions
from langchain_ollama import OllamaLLM, OllamaEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.schema import Document
from datetime import datetime

logger = logging.getLogger(__name__)

KPMG_BLUE = "#00338d"
KPMG_COBALT = "#0091da"
KPMG_WHITE = "#ffffff"
KPMG_PURPLE = "#470a68"

# ============================================================================
# PHASE 2: AGENT DECISION LOGIC
# ============================================================================

def analyze_query_needs(user_input: str, kb_vectorstore, company_kb_vectorstore, 
                       evid_vectorstore) -> dict:
    """
    Analyze user query to determine if agent can proceed or needs additional context.

    Returns:
        dict with keys:
            - can_proceed: bool
            - missing_context: list of missing resource types
            - clarification_needed: bool
            - reasoning: str explaining the decision
    """
    needs = {
        'can_proceed': True,
        'missing_context': [],
        'clarification_needed': False,
        'reasoning': ''
    }

    query_lower = user_input.lower()

    # Define keyword patterns for different contexts
    policy_keywords = ['policy', 'policies', 'standard', 'standards', 'guideline', 
                      'compliance', 'regulation', 'requirement', 'framework']
    evidence_keywords = ['assess', 'audit', 'test', 'verify', 'evidence', 'log', 
                        'logs', 'analyze', 'review', 'check', 'examine', 'investigate']
    company_keywords = ['company', 'organization', 'soc', 'soc2', 'cri', 'profile',
                       'specific', 'our', 'internal']

    # Check for missing knowledge bases
    if any(keyword in query_lower for keyword in policy_keywords):
        if not kb_vectorstore:
            needs['can_proceed'] = False
            needs['missing_context'].append('policy_documents')
            needs['reasoning'] = 'Query requires security policies/standards but none are loaded'

    if any(keyword in query_lower for keyword in evidence_keywords):
        if not evid_vectorstore:
            needs['can_proceed'] = False
            needs['missing_context'].append('evidence_files')
            needs['reasoning'] = 'Query requires evidence/log files for assessment but none are loaded'

    if any(keyword in query_lower for keyword in company_keywords):
        if not company_kb_vectorstore:
            needs['can_proceed'] = False
            needs['missing_context'].append('company_documents')
            needs['reasoning'] = 'Query requires company-specific documents but none are loaded'

    # Check for vague queries
    words = user_input.strip().split()
    if len(words) < 3:
        needs['clarification_needed'] = True
        needs['reasoning'] = 'Query is too vague or short to determine intent'

    # Check for generic/ambiguous queries
    generic_patterns = ['help', 'hi', 'hello', 'what can you do', 'explain', 'tell me']
    if any(pattern in query_lower for pattern in generic_patterns) and len(words) < 5:
        needs['clarification_needed'] = True
        needs['reasoning'] = 'Query is generic and needs more specific context'

    logger.info(f"Query analysis: can_proceed={needs['can_proceed']}, "
               f"missing={needs['missing_context']}, needs_clarification={needs['clarification_needed']}")

    return needs


def create_agent_request(needs: dict) -> dict:
    """
    Create a structured request for user to provide missing context.

    Args:
        needs: Output from analyze_query_needs()

    Returns:
        dict with request details or None if no request needed
    """
    if not needs['missing_context'] and not needs['clarification_needed']:
        return None

    if needs['clarification_needed']:
        return {
            'type': 'clarification',
            'message': generate_clarification_message(needs['reasoning']),
            'request_id': st.session_state.get('request_counter', 0)
        }

    if needs['missing_context']:
        # Map missing context to file requirements
        file_requirements = {
            'policy_documents': {
                'description': 'information security policies and standards',
                'examples': 'ISO 27001, NIST frameworks, security policies',
                'accepted_types': ['pdf', 'txt', 'docx', 'xlsx'],
                'category': 'policy'
            },
            'evidence_files': {
                'description': 'security logs, audit evidence, or system outputs',
                'examples': 'access logs, firewall logs, configuration files',
                'accepted_types': ['log', 'txt', 'csv', 'pdf', 'json'],
                'category': 'evidence'
            },
            'company_documents': {
                'description': 'company-specific documents',
                'examples': 'SOC 2 reports, CRI profiles, internal policies',
                'accepted_types': ['pdf', 'txt', 'docx', 'xlsx'],
                'category': 'company'
            }
        }

        # Get first missing item (handle one at a time)
        missing_type = needs['missing_context'][0]
        file_req = file_requirements.get(missing_type, {
            'description': 'required files',
            'examples': 'relevant documentation',
            'accepted_types': ['pdf', 'txt'],
            'category': 'general'
        })

        message = generate_file_request_message(missing_type, file_req, needs['reasoning'])

        return {
            'type': 'file_upload',
            'message': message,
            'file_category': file_req['category'],
            'accepted_types': file_req['accepted_types'],
            'missing_type': missing_type,
            'request_id': st.session_state.get('request_counter', 0)
        }

    return None


def generate_clarification_message(reasoning: str) -> str:
    """Generate a helpful clarification message"""
    base_message = "I'd like to help you better. "

    suggestions = [
        "Could you please provide more details about what you'd like to know?",
        "",
        "For example, you could ask:",
        "• 'What are the key access control policies?'",
        "• 'Assess my firewall logs for compliance'",
        "• 'Compare our practices with SOC 2 requirements'"
    ]

    return base_message + "\n".join(suggestions)


def generate_file_request_message(missing_type: str, file_req: dict, reasoning: str) -> str:
    """Generate a clear file request message"""

    message_templates = {
        'policy_documents': """📋 **Missing Security Policies**

To answer your question, I need access to your security policies and standards.

**What I need:**
{description}

**Examples:**
{examples}

**How to proceed:**
1. Upload your policy documents using the file uploader below
2. Accepted formats: {formats}
3. I'll process them and answer your question

{reasoning}""",

        'evidence_files': """🔍 **Missing Evidence Files**

To perform the assessment you requested, I need the relevant evidence or log files.

**What I need:**
{description}

**Examples:**
{examples}

**How to proceed:**
1. Upload your log/evidence files using the file uploader below
2. Accepted formats: {formats}
3. I'll analyze them against the security standards

{reasoning}""",

        'company_documents': """🏢 **Missing Company Documents**

To provide company-specific guidance, I need your organization's documentation.

**What I need:**
{description}

**Examples:**
{examples}

**How to proceed:**
1. Upload your company documents using the file uploader below
2. Accepted formats: {formats}
3. I'll tailor my response to your organization

{reasoning}"""
    }

    template = message_templates.get(missing_type, 
                                    "I need {description} to proceed. Please upload files ({formats}).")

    formats = ', '.join(file_req['accepted_types'])

    return template.format(
        description=file_req['description'],
        examples=file_req['examples'],
        formats=formats.upper(),
        reasoning=f"\n*Why: {reasoning}*" if reasoning else ""
    )

# ============================================================================
# ENHANCED CHAT FUNCTION WITH PHASE 2 DECISION LOGIC
# ============================================================================

def chat_with_bot(kb_vectorstore, company_kb_vectorstore, assessment, 
                  evid_vectorstore, chat_attachment_vectorstore, selected_model):
    """
    Enhanced chat function with active feedback loop.
    Analyzes user queries and requests missing context before proceeding.
    """
    st.markdown(
        f"""
        <style>
        .stApp {{
            background-color: {KPMG_WHITE};
        }}
        div[data-testid="column"] {{
            padding-right: 0px !important;
            padding-left: 0px !important;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )

    if "chat_history" not in st.session_state:
        st.session_state["chat_history"] = []

    # PHASE 2: Check if agent is waiting for user input
    if st.session_state.get('agent_pending_request'):
        render_pending_request_ui(
            kb_vectorstore, company_kb_vectorstore, evid_vectorstore,
            chat_attachment_vectorstore, selected_model
        )
        return

    # Normal chat flow
    with st.form(key="chat_form", clear_on_submit=True):
        user_input = st.text_input("Ask a question about your audit:", key="chat_input")
        col1, col2, col3 = st.columns([2, 2, 2])
        with col1:
            send_clicked = st.form_submit_button("📨 Send")
        with col2:
            clear_clicked = st.form_submit_button(
                "🧹 Clear Chat",
                disabled=len(st.session_state["chat_history"]) == 0,
                help="Clear the chat history and all memory",
            )
        with col3:
            export_clicked = st.form_submit_button(
                "📥 Export",
                disabled=len(st.session_state["chat_history"]) == 0,
                help="Export conversation history"
            )

    if clear_clicked:
        import app
        app.clear_all_memory()
        st.session_state['agent_pending_request'] = None
        st.session_state['original_query'] = None
        st.success("🧹 All chat history and memory cleared!")
        if hasattr(st, "rerun"):
            st.rerun()
        else:
            st.experimental_rerun()

    if export_clicked:
        export_conversation_history()

    if send_clicked and user_input.strip() != "":
        embed_name = os.getenv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest')
        embedding_model = OllamaEmbeddings(
            model=embed_name,
            base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
        )

        # PHASE 2: Analyze query before proceeding
        needs = analyze_query_needs(
            user_input,
            kb_vectorstore,
            company_kb_vectorstore,
            evid_vectorstore
        )

        # Create agent request if needed
        agent_request = create_agent_request(needs)

        if not needs['can_proceed'] or needs['clarification_needed']:
            # Cannot proceed - request missing context
            st.session_state['agent_pending_request'] = agent_request
            st.session_state['original_query'] = user_input
            st.session_state['request_counter'] += 1

            # Add to chat history
            st.session_state["chat_history"].append({
                "user": user_input,
                "bot": agent_request['message']
            })

            logger.info(f"Agent requesting: {agent_request['type']}")
            if hasattr(st, "rerun"):
                st.rerun()
            else:
                st.experimental_rerun()
        else:
            # Can proceed normally
            import app
            app.add_message_to_enhanced_history('user', user_input, {
                'kb_ready': kb_vectorstore is not None,
                'company_ready': company_kb_vectorstore is not None,
                'evidence_ready': evid_vectorstore is not None
            })

            response = chat_with_ai_with_memory(
                kb_vectorstore,
                company_kb_vectorstore,
                evid_vectorstore,
                chat_attachment_vectorstore,
                selected_model,
                user_input,
                embedding_model
            )

            app.add_message_to_enhanced_history('assistant', response, {
                'model': selected_model
            })

            st.session_state["chat_history"].append({"user": user_input, "bot": response})

            if 'conversation_memory' in st.session_state:
                st.session_state['conversation_memory'].save_context(
                    {"input": user_input},
                    {"output": response}
                )

            update_conversation_vectorstore(user_input, response, embedding_model)
            if hasattr(st, "rerun"):
                st.rerun()
            else:
                st.experimental_rerun()

    # Display chat history
    for chat in reversed(st.session_state["chat_history"]):
        user_chat_box(chat["user"])
        bot_chat_box(chat["bot"])


def render_pending_request_ui(kb_vectorstore, company_kb_vectorstore, evid_vectorstore,
                               chat_attachment_vectorstore, selected_model):
    """Render UI for pending agent request (file upload or clarification)"""

    request = st.session_state['agent_pending_request']
    original_query = st.session_state.get('original_query', '')

    if request['type'] == 'file_upload':
        st.warning("📁 **The assistant needs additional files to continue**")
        st.info(request['message'])

        # Show file uploader
        uploaded_files = st.file_uploader(
            f"Upload {request['file_category']} files",
            type=request['accepted_types'],
            accept_multiple_files=True,
            key=f"agent_request_upload_{request['request_id']}"
        )

        col1, col2 = st.columns([1, 3])
        with col1:
            submit_files = st.button("✅ Submit Files", disabled=not uploaded_files)
        with col2:
            cancel = st.button("❌ Cancel")

        if cancel:
            st.session_state['agent_pending_request'] = None
            st.session_state['original_query'] = None
            st.info("Request cancelled. You can ask a different question.")
            if hasattr(st, "rerun"):
                st.rerun()
            else:
                st.experimental_rerun()

        if submit_files and uploaded_files:
            # Process uploaded files
            with st.spinner("Processing uploaded files..."):
                missing_type = request['missing_type']

                if missing_type == 'policy_documents':
                    from utils.llm_chain import build_knowledge_base
                    kb_vectorstore, _ = build_knowledge_base(uploaded_files, selected_model)
                    st.session_state['kb_vectorstore'] = kb_vectorstore
                    st.session_state['kb_ready'] = True
                    st.success("✅ Policy documents processed!")

                elif missing_type == 'evidence_files':
                    from utils.llm_chain import build_knowledge_base
                    evid_vectorstore, _ = build_knowledge_base(uploaded_files, selected_model)
                    st.session_state['evid_vectorstore'] = evid_vectorstore
                    st.session_state['evidence_kb_ready'] = True
                    st.success("✅ Evidence files processed!")

                elif missing_type == 'company_documents':
                    from utils.llm_chain import build_knowledge_base
                    company_kb_vectorstore, _ = build_knowledge_base(uploaded_files, selected_model)
                    st.session_state['company_kb_vectorstore'] = company_kb_vectorstore
                    st.session_state['company_files_ready'] = True
                    st.success("✅ Company documents processed!")

            # Clear pending request
            st.session_state['agent_pending_request'] = None

            # Now process the original query
            st.info("Files processed! Now answering your original question...")

            embed_name = os.getenv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest')
            embedding_model = OllamaEmbeddings(
                model=embed_name,
                base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
            )

            # Get updated vectorstores
            kb_vectorstore = st.session_state.get('kb_vectorstore')
            company_kb_vectorstore = st.session_state.get('company_kb_vectorstore')
            evid_vectorstore = st.session_state.get('evid_vectorstore')

            response = chat_with_ai_with_memory(
                kb_vectorstore,
                company_kb_vectorstore,
                evid_vectorstore,
                chat_attachment_vectorstore,
                selected_model,
                original_query,
                embedding_model
            )

            st.session_state["chat_history"].append({
                "user": f"[After uploading files] {original_query}",
                "bot": response
            })

            st.session_state['original_query'] = None
            if hasattr(st, "rerun"):
                st.rerun()
            else:
                st.experimental_rerun()

    elif request['type'] == 'clarification':
        st.warning("⚠️ **The assistant needs clarification**")
        st.info(request['message'])

        clarification = st.text_input(
            "Please provide more details:",
            key=f"clarification_input_{request['request_id']}"
        )

        col1, col2 = st.columns([1, 3])
        with col1:
            submit_clarification = st.button("✅ Submit", disabled=not clarification)
        with col2:
            cancel = st.button("❌ Cancel")

        if cancel:
            st.session_state['agent_pending_request'] = None
            st.session_state['original_query'] = None
            st.info("Request cancelled.")
            if hasattr(st, "rerun"):
                st.rerun()
            else:
                st.experimental_rerun()

        if submit_clarification and clarification:
            # Combine original query with clarification
            enhanced_query = f"{original_query}\n\nAdditional context: {clarification}"

            st.session_state['agent_pending_request'] = None
            st.session_state['original_query'] = None

            embed_name = os.getenv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest')
            embedding_model = OllamaEmbeddings(
                model=embed_name,
                base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
            )

            response = chat_with_ai_with_memory(
                kb_vectorstore,
                company_kb_vectorstore,
                evid_vectorstore,
                chat_attachment_vectorstore,
                selected_model,
                enhanced_query,
                embedding_model
            )

            st.session_state["chat_history"].append({
                "user": enhanced_query,
                "bot": response
            })

            if hasattr(st, "rerun"):
                st.rerun()
            else:
                st.experimental_rerun()


# ============================================================================
# PHASE 1 + PHASE 2: ENHANCED CHAT WITH MEMORY
# ============================================================================

def chat_with_ai_with_memory(
    kb_vectorstore,
    company_kb_vectorstore, 
    evid_vectorstore,
    chat_attachment_vectorstore,
    selected_model: str,
    user_input: str,
    session_manager,
    session_id: str,
    embedding_model=None,
    include_history: bool = True
) -> str:
    """
    Enhanced chat function with full memory and context integration.
    This is the CORE logic extracted from api/main.py /chat endpoint.

    Args:
        kb_vectorstore: Global knowledge base vectorstore
        company_kb_vectorstore: Company-specific vectorstore
        evid_vectorstore: Evidence vectorstore
        chat_attachment_vectorstore: Chat attachments vectorstore
        selected_model: LLM model name
        user_input: User query
        session_manager: Session manager instance (API) or mock for Streamlit
        session_id: Session identifier
        embedding_model: Optional embedding model (created if None)
        include_history: Whether to include conversation history

    Returns:
        str: LLM response
    """
    ollama_base_url = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
    llm = OllamaLLM(model=selected_model, base_url=ollama_base_url)

    # Default embedding model
    if embedding_model is None:
        embed_name = os.getenv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest')
        embedding_model = OllamaEmbeddings(model=embed_name, base_url=ollama_base_url)

    # ========== GET SESSION CONTEXT ==========
    session = session_manager.get_session(session_id)

    # Get conversation history
    conversation_history = ""
    past_relevant_context = ""

    if include_history and session:
        # Get recent history from session manager
        recent_messages = session_manager.get_recent_history(session_id, k=10)
        if recent_messages:
            conversation_history = "\n".join([
                f"{msg['role']}: {msg['content']}" for msg in recent_messages
            ])
            logger.info(f"Loaded {len(recent_messages)} recent messages from session")

        # Get semantically relevant past exchanges from conversation vectorstore
        conv_vectorstore = session.get('conversation_vectorstore')
        if conv_vectorstore:
            try:
                past_relevant = conv_vectorstore.similarity_search(user_input, k=3)
                if past_relevant:
                    past_relevant_context = "\n\n".join([
                        f"Past exchange: {doc.page_content}" 
                        for doc in past_relevant
                    ])
                    logger.info(f"Retrieved {len(past_relevant)} relevant past exchanges")
            except Exception as e:
                logger.error(f"Error retrieving from conversation vectorstore: {e}")

    # ========== GET KNOWLEDGE BASE CONTEXTS ==========

    def safe_similarity_search(store, query, k=3):
        """Safely perform similarity search with error handling"""
        if store is None:
            return []
        try:
            return store.similarity_search(query, k=k)
        except Exception as e:
            logger.error(f"Error during similarity search: {e}")
            return []

    kb_contexts = safe_similarity_search(kb_vectorstore, user_input)
    company_contexts = safe_similarity_search(company_kb_vectorstore, user_input)
    evid_contexts = safe_similarity_search(evid_vectorstore, user_input)
    chat_file_contexts = safe_similarity_search(chat_attachment_vectorstore, user_input)

    # Format contexts for prompt
    kb_context = "\n\n".join([c.page_content for c in kb_contexts]) if kb_contexts else "No policy context available"
    company_kb_context = "\n\n".join([c.page_content for c in company_contexts]) if company_contexts else "No company context available"
    evid_context = "\n\n".join([c.page_content for c in evid_contexts]) if evid_contexts else "No evidence context available"
    chat_files_context = "\n\n".join([c.page_content for c in chat_file_contexts]) if chat_file_contexts else "No chat attachments"

    logger.info(f"Using model: {selected_model}")
    logger.info(f"Context sources - KB: {len(kb_contexts)}, Company: {len(company_contexts)}, Evidence: {len(evid_contexts)}")

    # ========== BUILD ENHANCED PROMPT ==========

    enhanced_prompt = f"""You are a highly capable cybersecurity audit and analysis assistant with comprehensive memory and context awareness.

You have been designed to provide accurate, actionable guidance based on available information. If you lack necessary context, you should clearly state what is missing rather than guessing.

=== KNOWLEDGE SOURCES LEARN FROM===

**Information Security Standards & Policies:**
{kb_context}

**Company-Specific Policies & Procedures:**
{company_kb_context}

=== Evidence & Log Files ===

**Security Logs & Evidence:**
{evid_context}

=== CHAT CONTEXT ===

**Chat File Attachments:**
{chat_files_context}

=== CONVERSATION CONTEXT ===

**Recent Conversation History:**
{conversation_history if conversation_history else "No previous conversation"}

**Relevant Past Discussions:**
{past_relevant_context if past_relevant_context else "No relevant past discussions"}

=== CURRENT USER QUESTION ===
{user_input}

=== INSTRUCTIONS ===

**Context-Aware Responding:**
- Use only available context to provide the most comprehensive answer possible
- Reference previous conversations when relevant (e.g., "As we discussed earlier...")
- Cite your sources by mentioning which context you're using (policies, company docs, evidence, past discussion)
- Maintain conversation continuity - build upon previous answers for follow-up questions
- If the document name, type, or purpose is not explicit, infer it from content.
- Always answer based on the chat context and uploaded chat files

**Quality Guidelines:**
- Develop your understanding from KNOWLEDGE SOURCES LEARN FROM
- Be specific and actionable with concrete recommendations
- Use bullet points, numbered lists, and tables where appropriate
- Provide examples when explaining concepts
- If uncertainty exists, state assumptions clearly
- Always validate if Chat File Attachments are relevant to the context or user input, if not say why it is not relevant and stop further processing.

**Professional Standards:**
- Maintain a professional cybersecurity audit assistant tone
- Acknowledge limitations - if critical information is missing, state it clearly
- Never hallucinate or invent information

**Response Format:**
- For policy questions: Quote relevant sections and provide interpretation
- For assessments: Provide structured analysis with findings and recommendations. ONLY perform an assessment if logs, evidence, controls, or incidents are explicitly provided
- For comparisons: Use tables to show differences
- For follow-ups: Build on previous context seamlessly
- If the user message is a greeting, casual message, or unrelated to security analysis, DO NOT perform an assessment. Instead, respond with a short clarification question.

Your comprehensive response:"""

    try:
        response = llm.invoke(enhanced_prompt)
        return response
    except Exception as e:
        logger.error(f"Error generating response: {e}")
        raise


def update_conversation_vectorstore_api(
    user_input: str,
    bot_response: str,
    session_manager,
    session_id: str,
    embedding_model
):
    """
    Update conversation vectorstore for API context.
    Adds new conversation exchange to vectorstore for semantic retrieval.

    Args:
        user_input: User's question
        bot_response: Assistant's response
        session_manager: Session manager instance
        session_id: Session identifier
        embedding_model: Embedding model for vectorization
    """
    try:
        session = session_manager.get_session(session_id)
        if not session:
            logger.error(f"Session {session_id} not found")
            return

        conversation_text = f"""User Question: {user_input}

Assistant Response: {bot_response}

Context: Exchange on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"""

        if session['conversation_vectorstore'] is None:
            logger.info("Creating new conversation vectorstore")
            session['conversation_vectorstore'] = FAISS.from_texts(
                [conversation_text],
                embedding_model
            )
            logger.info("Conversation vectorstore created")
        else:
            new_doc = [Document(
                page_content=conversation_text,
                metadata={
                    'timestamp': datetime.now().isoformat(),
                    'user_query': user_input[:100]
                }
            )]
            session['conversation_vectorstore'].add_documents(new_doc)
            logger.info(f"Vectorstore now has {session['conversation_vectorstore'].index.ntotal} vectors")

        # Update session in session_manager
        session_manager.update_vectorstore(session_id, session['conversation_vectorstore'])

    except Exception as e:
        logger.error(f"Error updating conversation vectorstore: {e}")


def update_conversation_vectorstore(user_input, bot_response, embedding_model):
    """Add new conversation exchange to vectorstore for semantic retrieval"""
    try:
        conversation_text = f"""User Question: {user_input}

Assistant Response: {bot_response}

Context: This exchange occurred on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"""

        if st.session_state['conversation_vectorstore'] is None:
            logger.info("Creating new conversation vectorstore")
            st.session_state['conversation_vectorstore'] = FAISS.from_texts(
                [conversation_text],
                embedding_model
            )
            logger.info("Conversation vectorstore created")
        else:
            new_doc = [Document(
                page_content=conversation_text,
                metadata={
                    'timestamp': datetime.now().isoformat(),
                    'user_query': user_input[:100]
                }
            )]
            st.session_state['conversation_vectorstore'].add_documents(new_doc)
            logger.info(f"Vectorstore now has {st.session_state['conversation_vectorstore'].index.ntotal} vectors")

    except Exception as e:
        logger.error(f"Error updating conversation vectorstore: {e}")


def export_conversation_history():
    """Export conversation history to JSON"""
    import json

    if not st.session_state.get('enhanced_chat_history'):
        st.warning("No conversation history to export")
        return

    export_data = {
        'metadata': st.session_state['chat_metadata'],
        'conversation': st.session_state['enhanced_chat_history']
    }

    json_str = json.dumps(export_data, indent=2)

    st.download_button(
        label="📥 Download Conversation JSON",
        data=json_str,
        file_name=f"conversation_{st.session_state['chat_metadata']['session_id']}.json",
        mime="application/json"
    )

    logger.info("Conversation history exported")


def user_chat_box(message):
    """Display user message"""
    st.markdown(
        f"""
        <div style='background-color: {KPMG_COBALT}; color: white; padding: 15px; 
        border-radius: 10px; margin: 10px 0; text-align: right;'>
            <strong>You:</strong> {message}
        </div>
        """,
        unsafe_allow_html=True,
    )


def bot_chat_box(message):
    """Display bot message"""
    st.markdown(
        f"""
        <div style='background-color: #f0f0f0; color: black; padding: 15px; 
        border-radius: 10px; margin: 10px 0;'>
            <strong>Assistant:</strong> {message}
        </div>
        """,
        unsafe_allow_html=True,
    )
