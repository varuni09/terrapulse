FROM python:3.12-slim
WORKDIR /app
COPY ../../requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" "psycopg[binary]" numpy
ENV PYTHONPATH=/app
CMD ["uvicorn", "services.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
