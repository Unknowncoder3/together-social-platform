FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends nodejs npm \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev
COPY ml ./ml
COPY server/experience-ai.js ./server/experience-ai.js
COPY data ./data

RUN pip install --no-cache-dir -r ml/requirements.txt \
  && python ml/dataset/generate_dataset.py \
  && python ml/training/train_scene_model.py \
  && python ml/training/train_activity_model.py \
  && python ml/training/build_question_engine.py

ENV NODE_ENV=production
ENV EXPERIENCE_AI_PORT=5003
EXPOSE 5003

CMD ["node", "server/experience-ai.js"]
