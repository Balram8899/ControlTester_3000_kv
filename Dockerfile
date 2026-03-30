FROM python:3.11-slim

WORKDIR /app
# Create directories for files with proper permissions
RUN mkdir -p /app/workbooks /app/temp_files
RUN chmod 755 /app/workbooks /app/temp_files
COPY streamlit_requirements.txt .
RUN pip install --no-cache-dir --progress-bar off -r streamlit_requirements.txt

COPY . .

EXPOSE 8501

CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]