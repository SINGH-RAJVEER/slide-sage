FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PIP_DEFAULT_TIMEOUT=180
ENV PIP_RETRIES=10

RUN apt-get update \
	&& apt-get install -y --no-install-recommends curl \
	&& rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.cache/pip \
	sh -ec 'for attempt in 1 2 3; do \
		pip install --retries "${PIP_RETRIES}" --timeout "${PIP_DEFAULT_TIMEOUT}" "litellm[proxy]" "litellm[google]" && exit 0; \
		echo "pip install failed (attempt ${attempt}), retrying..."; \
		sleep "$((attempt * 5))"; \
	done; \
	echo "pip install failed after retries"; \
	exit 1'

COPY litellm_config.yaml /app/litellm_config.yaml

EXPOSE 4000

CMD ["litellm", "--config", "/app/litellm_config.yaml", "--port", "4000"]
