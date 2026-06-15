FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ffmpeg \
		python3 \
		python3-pip \
		ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python3 -m pip install --no-cache-dir -r requirements.txt

COPY handler.py .
COPY test_input.json .

CMD ["python3", "-u", "handler.py"]
