import os
import shutil
import streamlit as st
from utils.find_llm import _ollama_models
from utils.file_handlers import save_and_load_files
from utils.llm_chain import assess_evidence_with_kb, build_knowledge_base
from utils.pdf_generator import generate_workbook
from utils.chat import chat_with_bot
import base64
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings
from langchain.memory import ConversationBufferWindowMemory, ConversationSummaryBufferMemory
from langchain_community.chat_message_histories import StreamlitChatMessageHistory
from datetime import datetime
from langchain.schema import Document
import json
import utils.llm_chain as llm_chain

import logging
import os

# Get Ollama base URL from environment variable
OLLAMA_BASE_URL = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
OLLAMA_EMBEDDING_MODEL = os.getenv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest')



# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# Trace - Cyber Risk Audit Bot
# This is a Streamlit app for a Cyber Risk Audit Bot that allows users to upload policies and evidence files,
# train a knowledge base, assess evidence against the knowledge base, and generate an audit workbook.

# Path to save the trained model
VECTORSTORE_PATH = "saved_kb_vectorstore"
COMPANY_VECTORSTORE_PATH = "saved_company_vectorstore"


MODELS_PATH = "models"  

@st.cache_data(ttl=60)  # Cache for 60 seconds to avoid frequent API calls
def get_ollama_models():
    return _ollama_models()

def initialize_conversation_memory():
    """
    Initialize all memory systems for the chat.
    This runs once when the app starts.
    """

    # 1. LangChain conversation memory - keeps last K exchanges
    if 'conversation_memory' not in st.session_state:
        logger.info("Initializing conversation memory")
        message_history = StreamlitChatMessageHistory(key="chat_messages_history")
        st.session_state['conversation_memory'] = ConversationBufferWindowMemory(
            chat_memory=message_history,
            k=10,  # Keep last 10 message pairs
            return_messages=True,
            memory_key="chat_history",
            input_key="input",
            output_key="output"
        )

    # 2. Conversation vectorstore for semantic retrieval
    if 'conversation_vectorstore' not in st.session_state:
        st.session_state['conversation_vectorstore'] = None
        logger.info("Conversation vectorstore initialized as None")

    # 3. Enhanced chat history with metadata
    if 'enhanced_chat_history' not in st.session_state:
        st.session_state['enhanced_chat_history'] = []
        st.session_state['chat_metadata'] = {
            'session_id': datetime.now().strftime('%Y%m%d_%H%M%S'),
            'total_messages': 0,
            'session_start': datetime.now().isoformat()
        }
        logger.info(f"Enhanced chat history initialized for session: {st.session_state['chat_metadata']['session_id']}")

def clear_all_memory():
    """Clear all memory systems"""
    logger.info("Clearing all memory systems")

    # Clear LangChain memory
    if 'conversation_memory' in st.session_state:
        st.session_state['conversation_memory'].clear()

    # Clear conversation vectorstore
    st.session_state['conversation_vectorstore'] = None

    # Clear enhanced history
    st.session_state['enhanced_chat_history'] = []
    st.session_state['chat_metadata']['total_messages'] = 0

    # Clear old chat history (backward compatibility)
    st.session_state['chat_history'] = []

    logger.info("All memory systems cleared")

def add_message_to_enhanced_history(role, content, metadata=None):
    """Add message to enhanced chat history with full metadata"""
    message = {
        'role': role,
        'content': content,
        'timestamp': datetime.now().isoformat(),
        'message_id': st.session_state['chat_metadata']['total_messages'],
        'metadata': metadata or {}
    }

    st.session_state['enhanced_chat_history'].append(message)
    st.session_state['chat_metadata']['total_messages'] += 1

    logger.info(f"Added {role} message #{message['message_id']} to enhanced history")

# Initialize memory at module level
initialize_conversation_memory()

def initialize_agent_state():
    """Initialize agent state for feedback loops"""

    if 'agent_pending_request' not in st.session_state:
        st.session_state['agent_pending_request'] = None

    if 'original_query' not in st.session_state:
        st.session_state['original_query'] = None

    if 'request_counter' not in st.session_state:
        st.session_state['request_counter'] = 0

    logger.info("Agent state initialized for Phase 2")

initialize_agent_state()

st.set_page_config(page_title="Control Risk Audit Bot", layout="wide")
with open("kpmg_logo.png", "rb") as logo_file:
    logo_base64 = base64.b64encode(logo_file.read()).decode("utf-8")

st.markdown(
    f"""
    <div style="display: flex; align-items: center; justify-content: flex-end; padding: 12px 0 18px 0; border-bottom: 1px solid #eaeaea;">
        <img src="data:image/png;base64,{logo_base64}" alt="Logo" style="height:48px;">
    </div>
    """,
    unsafe_allow_html=True
)

st.title("🤖 Risk Control Audit Assistant")
st.markdown("Welcome to your Risk Control Assistant. Start by uploading your policies and files below.")

# Check if Ollama is running and get available models
available_models = _ollama_models()
logger.info(f"Available Ollama models: {available_models}")
if not available_models:
    st.error(
        "🚨 **No LLM models found!**\n\n"
        "No Ollama models are available. Please ensure Ollama is running and at least one model is installed.",
        icon="🚨"
    )
    st.stop()


# Model selection
if 'model_selected' not in st.session_state:
    st.session_state['model_selected'] = False
if 'selected_model' not in st.session_state:
    st.session_state['selected_model'] = None


model_disabled = st.session_state['model_selected']

model_choice = st.selectbox(
    "Choose an Ollama model:",
    options=available_models,
    help="Select the Ollama model to use for embeddings and processing",
    disabled=model_disabled,
    key="model_choice"
)

ok_btn = st.button(
    "👍 Confirm Model",
    disabled=model_disabled or model_choice is None,
    help="Confirm model selection"
)

if ok_btn and not st.session_state['model_selected']:
    st.session_state['selected_model'] = model_choice
    st.session_state['model_selected'] = True
    if hasattr(st, "rerun"):
        st.rerun()
    else:
        st.experimental_rerun()

selected_model = st.session_state['selected_model']


# --- Load saved bot at app start ---
if os.path.exists(VECTORSTORE_PATH) and not st.session_state.get('kb_ready', False):    
    st.session_state['kb_vectorstore'] = FAISS.load_local(
        VECTORSTORE_PATH,
        OllamaEmbeddings(model=OLLAMA_EMBEDDING_MODEL, base_url=OLLAMA_BASE_URL),
        allow_dangerous_deserialization=True
    )
    st.session_state['kb_ready'] = True
    st.session_state['kb_loaded_from_saved'] = True
    

# --- Step 1: Upload Knowledge Base Documents ---
with st.expander("1️⃣ Upload training documents", expanded=True):
    
    policy_files = st.file_uploader(
        "Upload Information Security Policies (PDF, TXT, CSV, XLSX)",
        type=["pdf", "txt", "csv", "xlsx"], accept_multiple_files=True
    )

    # --- Training & Bot Controls ---
    if 'kb_ready' not in st.session_state:
        st.session_state['kb_ready'] = False
    if 'assessment_done' not in st.session_state:
        st.session_state['assessment_done'] = False
    if 'kb_loaded_from_saved' not in st.session_state:
        st.session_state['kb_loaded_from_saved'] = False
    if 'bot_trained_success' not in st.session_state:
        st.session_state['bot_trained_success'] = False
    if 'assessment' not in st.session_state:
        st.session_state['assessment'] = None
    if 'kb_vectorstore' not in st.session_state:
        st.session_state['kb_vectorstore'] = None
    if 'evid_vectorstore' not in st.session_state:
        st.session_state['evid_vectorstore'] = None   
    if 'merged_vectorstore' not in st.session_state:
        st.session_state['merged_vectorstore'] = None
    if 'evidence_kb_ready' not in st.session_state:
        st.session_state['evidence_kb_ready'] = False

     # --- Dynamic Button States ---
    upload_disabled = not (policy_files and len(policy_files) > 0)
    save_disabled = not st.session_state.get('bot_trained_success', False)
    delete_disabled = not os.path.exists(VECTORSTORE_PATH)

    col1, col2, _ = st.columns([2, 2, 2])
    with col1:
        upld_btn = st.button(
            "📤 Upload",
            help="Upload information security policies",
            disabled=upload_disabled,
            key="upld_btn"
        )
    # with col2:
    #     save_btn = st.button(
    #         "💾 Save model",
    #         disabled=save_disabled,
    #         help="Save the trained model",
    #         key="save_btn"
    #     )
    with col2:
        delete_btn = st.button(
            "🗑️ Clear",
            disabled=delete_disabled,
            help="Delete the saved model",
            key="delete_btn"
        ) 

   # Train bot on KB
    if upld_btn:
        with st.spinner("Processing and indexing knowledge base..."):
            # kb_docs = save_and_load_files(policy_files)
            # kb_vectorstore = build_knowledge_base(kb_docs,selected_model)
            kb_vectorstore, _ = build_knowledge_base(policy_files,selected_model)
            st.session_state['kb_vectorstore'] = kb_vectorstore
            st.session_state['kb_ready'] = True
            st.session_state['bot_trained_success'] = True  # <-- enable Save on next rerun!
            st.session_state['bot_saved'] = False  # Not yet saved after new training
            st.session_state['kb_loaded_from_saved'] = False
            if( st.session_state['kb_vectorstore'] and st.session_state['kb_ready']):
                st.session_state['kb_vectorstore'].save_local(VECTORSTORE_PATH)           
                st.success("✅ Information Security Policies uploaded successfully")   
        # Optionally force a rerun so Save enables immediately
        if hasattr(st, "rerun"):
            st.rerun()
        else:
            st.experimental_rerun()

    # Save trained bot
    # if save_btn and not save_disabled:
    #     if 'kb_vectorstore' in st.session_state and st.session_state['kb_vectorstore'] is not None:
    #         st.session_state['kb_vectorstore'].save_local(VECTORSTORE_PATH)
    #         st.success("💾 Trained bot saved successfully!")
    #         st.session_state['bot_trained_success'] = False
    #         st.session_state['bot_saved'] = True
    #         st.session_state['kb_loaded_from_saved'] = True
    #     else:
    #         st.error("No trained model to save. Please train the model first.")
        
    #     if hasattr(st, "rerun"):
    #         st.rerun()
    #     else:
    #         st.experimental_rerun()

    # Delete previous trained bot
    if delete_btn and not delete_disabled:
        if os.path.exists(VECTORSTORE_PATH):
            shutil.rmtree(VECTORSTORE_PATH)
            st.success("🗑️ Previous trained model deleted successfully.")
            st.session_state['kb_ready'] = False
            st.session_state['kb_vectorstore'] = None
            st.session_state['bot_trained_success'] = False
            st.session_state['bot_saved'] = False
            st.session_state['kb_loaded_from_saved'] = False
        else:
            st.info("No saved model found to delete.")

        if hasattr(st, "rerun"):
            st.rerun()
        else:
            st.experimental_rerun()

    # Show persistent training success message
    if st.session_state.get('bot_trained_success', False):
        st.success("✅ Training documents uploaded!")
    elif st.session_state.get('bot_saved', False):
        st.info("💾 Model is trained on documents, ready for use.")
    elif st.session_state.get('kb_loaded_from_saved', False):
        st.warning("💽 A saved trained model is loaded and ready for use.")
    else:
        st.warning("🚫 No trained model loaded. Please train or load a saved model.")

# Check if a saved company vectorstore exists
if os.path.exists(COMPANY_VECTORSTORE_PATH) and not st.session_state.get('company_files_ready', False):
    st.session_state['company_kb_vectorstore'] = FAISS.load_local(
        COMPANY_VECTORSTORE_PATH,
        OllamaEmbeddings(model=OLLAMA_EMBEDDING_MODEL, base_url=OLLAMA_BASE_URL),
        allow_dangerous_deserialization=True
    )
    st.session_state['company_files_ready'] = True  
    st.session_state['company_kb_loaded_from_saved'] = True

# --- Step 2: Upload Company Resources ---
with st.expander("2️⃣ Upload company documents", expanded=True):
    st.markdown(
        "Upload your company resources such as SOC 2 reports, CRI profiles, or other relevant documents. "
        "These will be used to assess your files against the knowledge base."
    )

    if 'company_files_ready' not in st.session_state:
        st.session_state['company_files_ready'] = False
    if 'company_kb_vectorstore' not in st.session_state:
        st.session_state['company_kb_vectorstore'] = None
    if 'company_kb_loaded_from_saved' not in st.session_state:
        st.session_state['company_kb_loaded_from_saved'] = False   
    
    company_files = st.file_uploader(
        "Upload Company Resources (PDF, TXT, CSV, XLSX)",
        type=["pdf", "txt", "csv", "xlsx"], accept_multiple_files=True
    )

    col1, col2, _ = st.columns([2, 2, 2])
    with col1:
        upload_btn = st.button(
            "📤 Upload",
            disabled=not (company_files and len(company_files) > 0),
            help="Upload company documents"
        )
    with col2:
        clear_btn = st.button(
            "🗑️ Clear",
            help="Clear uploaded company resources.",
            key="clear_company_files_btn"
        )
    if upload_btn:
        with st.spinner("Processing company resources..."):
            # Here you can process the company files if needed            
            # company_docs =  save_and_load_files(company_files)
            company_kb_vectorstore, _ = build_knowledge_base(company_files,selected_model)
            st.session_state['company_kb_vectorstore'] = company_kb_vectorstore           
            st.session_state['company_files_ready'] = True
            st.session_state['company_kb_loaded_from_saved'] = False
            if( st.session_state['company_kb_vectorstore'] and st.session_state['company_files_ready']):
                st.session_state['company_kb_vectorstore'].save_local(COMPANY_VECTORSTORE_PATH)           
                st.success("✅ Company documents uploaded successfully") 
           
    if clear_btn:
        if os.path.exists(COMPANY_VECTORSTORE_PATH):
            shutil.rmtree(COMPANY_VECTORSTORE_PATH)
            st.session_state['company_files'] = None
            st.session_state['company_files_ready'] = False            
            st.session_state['company_kb_loaded_from_saved'] = False
            st.toast("🗑️ Company resources cleared successfully.")
        else:
            st.info("No saved resources found to delete.")     
        # if hasattr(st, "rerun"):
        #     st.rerun()
        # else:
        #     st.experimental_rerun()
        
    
    if st.session_state.get('company_files_ready', False):
        st.success("✅ Company resources uploaded!")
    elif st.session_state.get('company_kb_loaded_from_saved', False):      
        st.warning("💽 Saved Company resources loaded") 
    else:
        st.warning("🚫 No company resources present. Please upload company resources.")

# --- Step 2: Upload Evidence Files ---
with st.expander("3️⃣ Upload files for assessment", expanded=True):   
    evidence_files = st.file_uploader(
        "Upload files (Logs, Configs, Screenshots - PDF, TXT, CSV, XLSX, JPEG)",
        type=["pdf", "txt", "csv", "xlsx", "jpeg", "jpg"], accept_multiple_files=True
    )

    evidence_ready = st.session_state.get('kb_ready') and (evidence_files is not None and len(evidence_files) > 0)
    download_report = st.session_state.get('assessment_done') and  st.session_state.get('workbook_path')

    col1, col2, _ = st.columns([2, 2, 2])
    with col1:
        upload_evidence_btn = st.button(
            "📤 Upload",
            disabled=not (evidence_files and len(evidence_files) > 0),
            help="Upload files to assess."
        )
    with col2:
        process_btn = st.button(
            "🧮 Audit & generate workbook",
            disabled=not evidence_ready,  # Initially disabled until evidence is uploaded
            help="Assess uploaded files using the knowledge base and generate an audit workbook."
        )
    evidence_docs_screenshot = None
    if upload_evidence_btn:
        with st.spinner("Processing files..."):
            # evidence_docs = save_and_load_files(evidence_files)
            evidence_docs_screenshot = llm_chain.render_text_to_image(evidence_files)
            evid_vectorstore, _ = build_knowledge_base(evidence_files,selected_model)
            st.session_state['evid_vectorstore'] = evid_vectorstore
            st.session_state['evidence_kb_ready'] = True
            st.toast("✅ Files Uploaded Successfully!")
            st.success("✅ Files Uploaded Successfully")

    if process_btn and evidence_ready:
        with st.spinner("Assessing files using knowledge base..."):
            assessment = None           
            #ASSESSMENT_PATH = "saved_assessment.json"
            # if os.path.exists(ASSESSMENT_PATH):
            #         with open(ASSESSMENT_PATH, "r") as f:
            #             assessment = json.load(f)
                  
            if assessment is None:
                #evidence_docs = save_and_load_files(evidence_files)
                assessment = assess_evidence_with_kb(
                    evidence_files,
                    st.session_state['kb_vectorstore'],
                    st.session_state['company_kb_vectorstore'],
                    selected_model
                )
                # Render to image and save to a variable (PIL Image object)
                

                summary = llm_chain.generate_executive_summary(assessment, selected_model)
                assessment.append(summary)
                # with open(ASSESSMENT_PATH, "w") as f:
                #     json.dump(assessment, f, indent=2)
                                       
                
            workbook_path = generate_workbook(assessment, evidence_docs_screenshot)
            st.session_state['assessment'] = assessment
            st.session_state['workbook_path'] = workbook_path
            st.session_state['assessment_done'] = True
           
        st.toast("✅ Files processed! Audit workbook ready.")
        st.info("You can now download the audit workbook and chat with the assistant.")  

# --- Step 3: Download ---
if st.session_state.get('assessment_done'):
    with st.expander("3️⃣ Download audit workbook", expanded=True):
        st.subheader("Download Cyber Risk Audit Workbook")
        workbook_path = st.session_state.get('workbook_path')
        if workbook_path is not None and os.path.exists(workbook_path):
            with open(workbook_path, "rb") as f:
                pdf_bytes = f.read()
                st.download_button(
                    label="⬇️ Download audit workbook",
                    data=pdf_bytes,  
                    file_name="CyberRisk_Audit_Workbook.pdf",
                    mime="application/pdf" 
                )       
        else:
            st.warning("No audit workbook available for download. Please process the documents first.")
else:
    with st.expander("3️⃣ Download audit workbook", expanded=False):
        st.info("Process documents first for report generation.")

# --- Step 4: Chat with the Bot ---

with st.expander("4️⃣ Chat with the agent", expanded=True):
    if model_disabled:
        st.toast(f"Currently selected model: **{selected_model}**")

    st.subheader("Chat with the Audit Bot")

    # Display conversation statistics
    if st.session_state['chat_metadata']['total_messages'] > 0:
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Messages", st.session_state['chat_metadata']['total_messages'])
        with col2:
            session_id = st.session_state['chat_metadata']['session_id'][-8:]
            st.metric("Session", session_id)
        with col3:
            context_count = sum([
                st.session_state.get('kb_ready', False),
                st.session_state.get('company_files_ready', False),
                st.session_state.get('evidence_kb_ready', False)
            ])
            st.metric("Context Sources", f"{context_count}/3")

    # Call enhanced chat function
    chat_with_bot(
        st.session_state['kb_vectorstore'],
        st.session_state['company_kb_vectorstore'],
        st.session_state['assessment'],
        st.session_state['evid_vectorstore'],
        None,
        st.session_state['selected_model']
    )

    # Show contextual information
    if st.session_state.get('assessment_done') or st.session_state.get('kb_ready') or st.session_state.get('company_files_ready'):
        st.info("💡 The bot has access to conversation history and can reference previous discussions.")
    else:
        st.warning("Please upload policies and files, then train the bot to start chatting.")

    # ✅ FIXED: Use st.container instead of st.expander
    if st.session_state['chat_metadata']['total_messages'] > 0:
        with st.container(border=True):  # Changed from st.expander()
            st.write("📊 **Memory Statistics**")
            st.write("**Session Information:**")
            st.json(st.session_state['chat_metadata'])

            # Show memory contents
            if 'conversation_memory' in st.session_state:
                try:
                    memory_vars = st.session_state['conversation_memory'].load_memory_variables({})
                    st.write("**Loaded Memory Variables:**")
                    st.write(f"History length: {len(str(memory_vars.get('chat_history', '')))} characters")
                except Exception as e:
                    st.write(f"Memory status: {str(e)}")

            # Show vectorstore status
            if st.session_state['conversation_vectorstore']:
                st.write(f"**Conversation Vectorstore:** {st.session_state['conversation_vectorstore'].index.ntotal} vectors")
            else:
                st.write("**Conversation Vectorstore:** Not yet created")
