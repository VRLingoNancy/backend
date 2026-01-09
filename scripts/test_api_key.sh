#!/bin/bash

# Vérification de la présence de la clé
if [ -z "$CHATGPT_API_KEY" ]; then
  echo "⚠️  Attention : La variable CHATGPT_API_KEY n'est pas définie."
  echo "Exécutez : export CHATGPT_API_KEY='sk-...' avant de lancer ce script."
  exit 1
fi

echo "🧪 Test de la clé API avec gpt-4o-mini..."

# Note: jq est utilisé pour formater le JSON. Si vous ne l'avez pas, retirez "| jq ." à la fin de la commande curl.
curl https://api.openai.com/v1/chat/completions \
  -s \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CHATGPT_API_KEY" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {
        "role": "user",
        "content": "Si tu reçois ce message, réponds simplement 'OK'."
      }
    ],
    "max_tokens": 10
  }' | jq .

echo -e "\n\n✅ Fin du test."
