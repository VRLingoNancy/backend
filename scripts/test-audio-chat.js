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

async function askTargetLanguage() {
  // Liste stricte des langues supportées (codes courts)
  const supportedLangs = [
    { code: 'fr', label: 'français' },
    { code: 'en', label: 'anglais' },
    { code: 'it', label: 'italien' },
    { code: 'de', label: 'allemand' },
  ];

  console.log('Langues disponibles :');
  supportedLangs.forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.label} (${l.code})`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question(
      'Choisissez la langue cible (1-4 ou code court, ex: fr) [1] : ',
      (value) => resolve((value || '').trim())
    );
  });

  rl.close();
  if (!answer || answer === '1') return 'fr';
  if (answer === '2') return 'en';
  if (answer === '3') return 'it';
  if (answer === '4') return 'de';
  // Si l'utilisateur tape un code personnalisé, on ne garde que fr/en/it/de
  if (['fr', 'en', 'it', 'de'].includes(answer)) return answer;
  console.error('Langue non supportée. Choisissez fr, en, it ou de.');
  process.exit(1);
}

async function askConversationMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question(
      'Mode de conversation ? (1 = professeur classique, 2 = professeur medieval) : ',
      (value) => resolve((value || '').trim())
    );
  });

  rl.close();

  if (answer === '2') {
    return 'medieval';
  }

  return null;
}

async function main() {
  console.log('🎤 VRLingo Audio Terminal Client');
  console.log('--------------------------------');

  const targetLang = await askTargetLanguage();
  const selectedContext = await askConversationMode();
  console.log(`🌐 Langue sélectionnée (UI): ${targetLang}`);
  if (selectedContext === 'medieval') {
    console.log('🏰 Mode sélectionné: professeur médiéval');
  } else {
    console.log('📘 Mode sélectionné: professeur classique');
  }

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
  const wsQuery = new URLSearchParams({ lang: targetLang });
  if (selectedContext) {
    wsQuery.set('context', selectedContext);
  }
  const wsUrl =
    API_URL.replace('http', 'ws') + `/api/realtime/session?${wsQuery.toString()}`;
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
      // if (msg) console.error(`[aplay] ${msg}`);
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
  let waitForFirstAssistantTurn = true;
  let firstTurnWatchdogInterval = null;
  let firstTurnRetryCount = 0;

  // Plus de bootstrap côté client : on laisse le backend piloter le premier tour IA
  function startFirstTurnWatchdog() {
    if (firstTurnWatchdogInterval) {
      clearInterval(firstTurnWatchdogInterval);
      firstTurnWatchdogInterval = null;
    }

    // On garde le micro verrouillé tant que l'IA n'a pas commencé son premier tour.
    // Si aucun son n'arrive, on débloque le micro après 15s pour éviter un blocage infini.
    let elapsed = 0;
    firstTurnWatchdogInterval = setInterval(() => {
      if (!waitForFirstAssistantTurn) {
        clearInterval(firstTurnWatchdogInterval);
        firstTurnWatchdogInterval = null;
        return;
      }
      elapsed += 1;
      if (elapsed >= 15) {
        waitForFirstAssistantTurn = false;
        clearInterval(firstTurnWatchdogInterval);
        firstTurnWatchdogInterval = null;
        console.log('⚠️ Aucun tour IA détecté après 15s, micro activé en secours.');
      }
    }, 1000);
  }

  ws.on('open', () => {
    console.log('✅ Connecté ! L\'IA va démarrer en premier...');
    console.log('🔴 Enregistrement micro actif (CTRL+C pour quitter)');
    startFirstTurnWatchdog();
  });

  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString());
      handleUserTranscriptEvent(event);
      handleAssistantTurnEvent(event);
      handleResponseDoneEvent(event);
      handleAudioDeltaEvent(event);
      handleAudioTranscriptDeltaEvent(event);
      handleErrorEvent(event);
      handleSpeechStartedEvent(event);
    } catch (e) {
      console.error('Erreur parsing:', e);
    }
  });

  function handleUserTranscriptEvent(event) {
    if (
      event.type === 'conversation.item.input_audio_transcription.completed' &&
      typeof event.transcript === 'string'
    ) {
      latestUserTranscript = event.transcript.trim();
    }
  }

  function handleAssistantTurnEvent(event) {
    if (
      event.type === 'response.done' ||
      (event.type === 'response.audio.delta' && event.delta) ||
      (event.type === 'response.audio_transcript.delta' && event.delta)
    ) {
      if (waitForFirstAssistantTurn) {
        waitForFirstAssistantTurn = false;
        if (firstTurnWatchdogInterval) {
          clearInterval(firstTurnWatchdogInterval);
          firstTurnWatchdogInterval = null;
        }
      }
    }
  }

  function handleResponseDoneEvent(event) {
    if (event.type === 'response.done') {
      process.stdout.write('\n');
      isAiSpeaking = false;
      if (silenceTimer) clearTimeout(silenceTimer);
      const userInput =
        (typeof event.user_transcript === 'string' && event.user_transcript.trim()) ||
        latestUserTranscript ||
        '(tour d\'ouverture: aucune entrée utilisateur)';
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
      console.log('\n[IA LOG] Entrée utilisateur :', userInput);
      console.log('[IA LOG] Réponse IA :', iaText || '(aucune)');
      console.log('[IA LOG] conversation_id :', event.conversation_id ?? null);
      latestUserTranscript = '';
    }
  }

  function handleAudioDeltaEvent(event) {
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
  }

  function handleAudioTranscriptDeltaEvent(event) {
    if (event.type === 'response.audio_transcript.delta' && event.delta) {
      process.stdout.write(event.delta);
    }
  }

  function handleErrorEvent(event) {
    if (event.type === 'error') {
      console.error('\n[Realtime Error Event]', JSON.stringify(event, null, 2));
    }
  }

  function handleSpeechStartedEvent(event) {
    if (event.type === 'input_audio_buffer.speech_started') {
      console.log('\n[User started speaking...]');
      startPlayer();
      isAiSpeaking = false;
      if (silenceTimer) clearTimeout(silenceTimer);
    }
  }

  ws.on('error', (e) => console.error('WS Error:', e));
  ws.on('close', () => {
    if (firstTurnWatchdogInterval) {
      clearInterval(firstTurnWatchdogInterval);
      firstTurnWatchdogInterval = null;
    }
    console.log('Session fermée.');
    process.exit(0);
  });

  // --- MICROPHONE PIPING ---

  const CHUNK_SIZE = 4096; // Envoyer par petits paquets
  recorder.stdout.on('data', (chunk) => {
    if (waitForFirstAssistantTurn) {
      return;
    }

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
    if (firstTurnWatchdogInterval) {
      clearInterval(firstTurnWatchdogInterval);
      firstTurnWatchdogInterval = null;
    }
    recorder.kill();
    if (player) player.kill();
    ws.close();
    process.exit();
  });
}

main().catch(console.error);
