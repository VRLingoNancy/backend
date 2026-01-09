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
  const wsUrl = API_URL.replace('http', 'ws') + '/api/realtime/session';
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

  ws.on('open', () => {
    console.log('✅ Connecté ! L\'IA t\'écoute (Server VAD actif). Parle...');
    console.log('🔴 Enregistrement micro actif (CTRL+C pour quitter)');
  });

  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString());

      // Gestion du flux audio entrant (de l'IA vers nous)
      if (event.type === 'response.audio.delta' && event.delta) {
        player.stdin.write(Buffer.from(event.delta, 'base64'));
      }

      // Affichage visuel des événements intéressants
      if (event.type === 'response.audio_transcript.delta' && event.delta) {
        process.stdout.write(event.delta); // Effet machine à écrire
      }
      if (event.type === 'response.done') {
        process.stdout.write('\n'); // Saut de ligne à la fin de la réponse
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
