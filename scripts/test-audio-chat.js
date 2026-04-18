import WebSocket from 'ws';
import { spawn } from 'child_process';
import readline from 'readline';

// --- CONFIGURATION ---
const API_URL = 'http://localhost:3000'; // Adapter le port si besoin
const EMAIL = 'user@example.com';      // User créé pour les tests
const PASSWORD = 'string';             // Mot de passe de test

// Configuration Audio (Standard OpenAI Realtime)
const AUDIO_FORMAT = 'S16_LE'; // PCM 16-bit
const SAMPLE_RATE = '24000';   // 24kHz
const CHANNELS = '1';          // Mono
const AUDIO_DEVICE = process.env.AUDIO_DEVICE; // ex: "plughw:1,0"

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
  let player = null;

  function startPlayer() {
    if (player) {
      if (player.stdin) player.stdin.end();
      player.kill();
    }

    const playerArgs = [
      '-f', AUDIO_FORMAT,
      '-r', SAMPLE_RATE,
      '-c', CHANNELS,
      '-t', 'raw',
      '--buffer-size=2048' // Faible buffer pour réduire la latence
    ];
    if (AUDIO_DEVICE) playerArgs.unshift('-D', AUDIO_DEVICE);

    // Processus de lecture (Audio OUT)
    player = spawn('aplay', playerArgs);

    // IMPORTANT: Attraper les erreurs sur le stdin pour éviter le crash EPIPE global
    player.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE') {
        console.error('Player Stdin Error:', err);
      }
    });
    player.on('error', (err) => {
      console.error('❌ aplay failed to start:', err.message);
      process.exit(1);
    });
    player.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[aplay] ${msg}`);
    });
  }

  // Démarrage initial
  startPlayer();

  // Processus d'enregistrement (Audio IN)
  const recorderArgs = [
    '-f', AUDIO_FORMAT,
    '-r', SAMPLE_RATE,
    '-c', CHANNELS,
    '-t', 'raw',
    '--buffer-size=2048'
  ];
  if (AUDIO_DEVICE) recorderArgs.unshift('-D', AUDIO_DEVICE);
  const recorder = spawn('arecord', recorderArgs);

  // --- WEBSOCKET EVENTS ---

  let isAiSpeaking = false;
  let silenceTimer = null;
  let latestUserTranscript = '';

  ws.on('open', () => {
    console.log('✅ Connecté ! L\'IA t\'écoute (Server VAD actif). Parle...');
    console.log('🔴 Enregistrement micro actif (CTRL+C pour quitter)');
  });

  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString());

      // Fallback local: conserver la dernière transcription utilisateur finalisée.
      if (
        event.type === 'conversation.item.input_audio_transcription.completed' &&
        typeof event.transcript === 'string'
      ) {
        latestUserTranscript = event.transcript.trim();
      }

      // Log uniquement les tours enrichis côté backend
      if (event.type === 'response.done') {
        process.stdout.write('\n');
        isAiSpeaking = false;
        if (silenceTimer) clearTimeout(silenceTimer);
        // Log question/réponse
        const userQuestion =
          (typeof event.user_transcript === 'string' && event.user_transcript.trim()) ||
          latestUserTranscript ||
          '(inconnue)';

        console.log('\n[IA LOG] Question comprise :', userQuestion);
        let iaText = '';
        if (event.response && event.response.output) {
          event.response.output.forEach((item) => {
            item.content?.forEach((contentPart) => {
              if (typeof contentPart.transcript === 'string') {
                iaText += contentPart.transcript;
              } else if (typeof contentPart.text === 'string') {
                iaText += contentPart.text;
              }
            });
          });
        }
        console.log('[IA LOG] Réponse IA :', iaText || '(aucune)');
        latestUserTranscript = '';
      }

      // ...existing code...
      if (event.type === 'response.audio.delta' && event.delta) {
        isAiSpeaking = true;
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
            isAiSpeaking = false;
        }, 1500);
        try {
            if (player && player.stdin && !player.stdin.destroyed && player.stdin.writable) {
                player.stdin.write(Buffer.from(event.delta, 'base64'));
            }
        } catch (err) {
            if (err.code !== 'EPIPE') console.error('Audio write error:', err);
        }
      }
      if (event.type === 'response.audio_transcript.delta' && event.delta) {
        process.stdout.write(event.delta);
      }
      if (event.type === 'input_audio_buffer.speech_started') {
        console.log('\n[User started speaking...]');
        console.log('⚡ Interruption détectée (Purger Audio Output)...');
        startPlayer();
        isAiSpeaking = false;
        if (silenceTimer) clearTimeout(silenceTimer);
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

  recorder.on('error', (err) => {
    console.error('❌ arecord failed to start:', err.message);
    process.exit(1);
  });

  recorder.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[arecord] ${msg}`);
  });

  // Note: player stderr/error is managed in startPlayer()

  // Gestion de l'arrêt
  process.on('SIGINT', () => {
    console.log('\nArrêt...');
    recorder.kill();
    if (player) player.kill();
    ws.close();
    process.exit();
  });
}

main().catch(console.error);
