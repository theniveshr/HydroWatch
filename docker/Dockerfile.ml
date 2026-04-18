# HydroWatch — ML Training Dockerfile
# Context: hydrowatch/ (root folder)
FROM python:3.11-slim

WORKDIR /app

# Copy and install ML dependencies
COPY ml/requirements_ml.txt .
RUN pip install --no-cache-dir -r requirements_ml.txt

# Copy ML source code
COPY ml/ .

# Create models output directory
RUN mkdir -p /app/models

CMD ["python", "train_model.py"]
