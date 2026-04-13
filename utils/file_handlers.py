import os
import shutil
import tempfile
from langchain_community.document_loaders import PyPDFLoader
from langchain_unstructured import UnstructuredLoader
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi import FastAPI
from fastapi import UploadFile

def save_temp_file(file):
    suffix = file.name.split(".")[-1]
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix="."+suffix)
    temp_file.write(file.read())
    temp_file.close()
    return temp_file.name

def save_and_load_files(files, source: str):
    docs = []

    if not files:
        return docs

    for file in files:
        temp_path = save_temp_file(file)       
        file_name = getattr(file, "name", os.path.basename(temp_path))        
        ext = os.path.splitext(temp_path)[-1].lower()
        print(f"Processing temp_path: {temp_path} file_name: {file_name} ext: {ext}")
        try:
            if ext == ".pdf":
                loader = PyPDFLoader(temp_path)
                file_type = "PDF"
            elif ext in [".txt", ".csv", ".xlsx"]:
                loader = UnstructuredLoader(temp_path)
                file_type = ext.replace(".", "").upper()
            elif ext in [".jpeg", ".jpg", ".png"]:
                loader = UnstructuredLoader(temp_path)
                file_type = "IMAGE"
            else:
                continue

            loaded_docs = loader.load()

            for doc in loaded_docs:
                # 🔥 Inject file-level metadata HERE
                doc.metadata = {
                    **doc.metadata,  # keep page/section metadata
                    "file_name": file_name,
                    "file_type": file_type,
                    "source": source,
                    "doc_category": infer_doc_category(file_name),
                    "control_domain": infer_control_domain(file_name),
                }

                docs.append(doc)

        finally:
           os.unlink(temp_path)

    return docs

def infer_doc_category(file_name: str) -> str:
    name = file_name.lower()
    if "policy" in name:
        return "Information Security Policy"
    if "procedure" in name or "sop" in name:
        return "Procedure"
    if "log" in name:
        return "System Log"
    if "config" in name:
        return "Configuration File"
    if "report" in name:
        return "Audit Report"
    return "Unknown"

def infer_control_domain(file_name: str) -> str:
    name = file_name.lower()
    if any(k in name for k in ["access", "iam", "user"]):
        return "Identity & Access Management"
    if any(k in name for k in ["network", "firewall"]):
        return "Network Security"
    if any(k in name for k in ["malware", "virus", "endpoint"]):
        return "Endpoint Security"
    if any(k in name for k in ["backup", "dr", "bc"]):
        return "Business Continuity"
    return "General IT Controls"

