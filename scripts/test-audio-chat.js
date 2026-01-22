import WebSocket from 'ws';
import { spawn } from 'child_process';
import readline from 'readline';

// --- CONFIGURATION ---
const API_URL = 'http://localhost:4242'; // Adapter le port si besoin
const EMAIL = 'john@john.com';        // Mettre un user valide de ta BDD
const PASSWORD = 'john';          // Mettre le mot de passe valide

// Configuration Audio (Standard OpenAI Realtime)
const AUDIO_FORMAT = 'S16_LE'; // PCM 16-bit
const SAMPLE_RATE = '24000';   // 24kHz
const CHANNELS = '1';          // Mono

async function main() {
  console.log('🎤 VRLingo Audio Terminal Client');
  console.log('--------------------------------');

  // 1. LOGIN
  console.log(`📡 Authentification pour ${EMAIL}...`);
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!loginRes.ok) {
    console.error('❌ Login failed:', await loginRes.text());
    process.exit(1);
  }

  const responseBody = await loginRes.json();
  const token = responseBody.accessToken; // Changé de 'token' à 'accessToken'

  if (!token) {
    console.error('❌ Token non trouvé dans la réponse du login:', responseBody);
    process.exit(1);
  }

  console.log('✅ Token récupéré:', token.substring(0, 10) + '...');

  // 2. CONNECTION WEBSOCKET
  // On passe le code langue Italien pour tester la transcription multilingue
  const wsUrl = API_URL.replace('http', 'ws') + '/api/realtime/session?lang=fr-FR';
  console.log(`🔌 Connexion au WebSocket: ${wsUrl}`);
  
  // Clean token just in case
  const cleanToken = token.trim();

  const ws = new WebSocket(wsUrl, {
    headers: { Authorization: `Bearer ${cleanToken}` }
  });

  // 3. GESTION AUDIO (PROCESSUS PARENTS)
  // Processus de lecture (Audio OUT)
  const player = spawn('aplay', [
    '-f', AUDIO_FORMAT,
    '-r', SAMPLE_RATE,
    '-c', CHANNELS,
    '-t', 'raw',
    '--buffer-size=2048' // Faible buffer pour réduire la latence
  ]);

  // Processus d'enregistrement (Audio IN)
  const recorder = spawn('arecord', [
    '-f', AUDIO_FORMAT,
    '-r', SAMPLE_RATE,
    '-c', CHANNELS,
    '-t', 'raw',
    '--buffer-size=2048'
  ]);

  // --- WEBSOCKET EVENTS ---

  let isAiSpeaking = false;
  let silenceTimer = null;

  ws.on('open', () => {
    console.log('✅ Connecté ! L\'IA t\'écoute (Server VAD actif). Parle...');
    console.log('🔴 Enregistrement micro actif (CTRL+C pour quitter)');
  });

  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString());

      // Gestion du flux audio entrant (de l'IA vers nous)
      if (event.type === 'response.audio.delta' && event.delta) {
        isAiSpeaking = true;
        
        // Reset du timer de silence à chaque paquet reçu
        if (silenceTimer) clearTimeout(silenceTimer);
        // On considère que l'IA a fini de parler après 500ms de silence
        silenceTimer = setTimeout(() => {
            isAiSpeaking = false;
        }, 500);

        player.stdin.write(Buffer.from(event.delta, 'base64'));
      }

      // Affichage visuel des événements intéressants
      if (event.type === 'response.audio_transcript.delta' && event.delta) {
        process.stdout.write(event.delta); // Effet machine à écrire
      }
      if (event.type === 'response.done') {
        process.stdout.write('\n'); // Saut de ligne à la fin de la réponse
        // Sécurité supplémentaire : Fin explicite de réponse
        isAiSpeaking = false; 
        if (silenceTimer) clearTimeout(silenceTimer);
      }
      if (event.type === 'input_audio_buffer.speech_started') {
        console.log('\n[User started speaking...]');
      }
      
    } catch (e) {
      console.error('Erreur parsing:', e);
    }
  });

  ws.on('error', (e) => console.error('WS Error:', e));
  ws.on('close', () => {
    console.log('Session fermée.');
    process.exit(0);
  });

  // --- MICROPHONE PIPING ---

  const CHUNK_SIZE = 4096; // Envoyer par petits paquets
  recorder.stdout.on('data', (chunk) => {
    // PROTECTION ANTI-ECHO : Si l'IA parle, on coupe le micro logiciel
    if (isAiSpeaking) {
        return;
    }

    if (ws.readyState === WebSocket.OPEN) {
      // Conversion Raw PCM -> Base64 -> Événement OpenAI
      const event = {
        type: 'input_audio_buffer.append',
        audio: chunk.toString('base64'),
      };
      ws.send(JSON.stringify(event));
    }
  });

  recorder.stderr.on('data', () => {}); // Ignorer les logs alsa
  player.stderr.on('data', () => {});   // Ignorer les logs alsa

  // Gestion de l'arrêt
  process.on('SIGINT', () => {
    console.log('\nArrêt...');
    recorder.kill();
    player.kill();
    ws.close();
    process.exit();
  });
}

main().catch(console.error);
