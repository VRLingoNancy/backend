import WebSocket from 'ws';
import dotenv from 'dotenv';

// Charge les variables du fichier .env
dotenv.config();

// Récupération de la clé API
const apiKey = process.env.CHATGPT_API_KEY;

if (!apiKey) {
    console.error("❌ Erreur: La variable d'environnement CHATGPT_API_KEY n'est pas définie.");
    process.exit(1);
}

const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview';

console.log(`Connecting to: ${url}`);
console.log(`Using Key: ${apiKey.substring(0, 10)}...`);

const ws = new WebSocket(url, {
    headers: {
        "Authorization": `Bearer ${apiKey}`,
        "OpenAI-Beta": "realtime=v1",
    },
});

ws.on('open', () => {
    console.log('✅ Connected to OpenAI.');
});

ws.on('message', (data) => {
    try {
        const event = JSON.parse(data.toString());
        console.log(`\n📩 Received event: ${event.type}`);
        
        // Afficher les erreurs en détail
        if (event.type === 'error') {
            console.error('❌ ERROR DETAIL:', JSON.stringify(event.error, null, 2));
        }

        // Une fois la session créée, on envoie un petit message texte pour tester la réponse
        if (event.type === 'session.created') {
            console.log('✨ Session created. Sending test message...');
            
            // On fait parler l'IA
            const item = {
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: 'Dis simplement "Test réussi" en français.'
                        }
                    ]
                }
            };
            ws.send(JSON.stringify(item));
            
            // On demande à l'IA de générer sa réponse
            ws.send(JSON.stringify({ type: 'response.create' }));
        }

        // Afficher le contenu de la réponse (texte ou transcript)
        if (event.type === 'response.audio_transcript.delta') {
            process.stdout.write(event.delta); // Affiche le texte au fur et à mesure
        }
        
        if (event.type === 'response.text.delta') {
             process.stdout.write(event.delta);
        }
        
        if (event.type === 'response.done') {
            console.log('\n✅ Response finished interactions.');
            ws.close();
            process.exit(0);
        }

    } catch (e) {
        console.error('Error parsing message:', e);
    }
});

ws.on('close', () => console.log('🔴 Connection closed.'));
ws.on('error', (err) => console.error('🔥 WebSocket Error:', err));
