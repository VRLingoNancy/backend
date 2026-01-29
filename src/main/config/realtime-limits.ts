// Ce fichier contient les limites strictes pour les sessions Realtime AI
// afin d'éviter les surcoûts et les boucles infinies.

export const REALTIME_LIMITS = {
  // Durée maximale d'une session en millisecondes (ex: 5 minutes)
  MAX_SESSION_DURATION_MS: 5 * 60 * 1000,

  // Nombre maximum d'échanges (tours de parole) autorisés par session
  MAX_TURNS_PER_SESSION: 20,

  // Modèle OpenAI à utiliser (vérifier le prix avant de changer !)
  MODEL: 'gpt-4o-mini-realtime-preview',

  // Limite de taille pour un message texte reçu (si on utilise du texte en entrée)
  MAX_TEXT_INPUT_LENGTH: 1000,
};

export class SessionGuard {
  private startTime: number;
  private turnCount: number;

  constructor() {
    this.startTime = Date.now();
    this.turnCount = 0;
  }

  /**
   * Vérifie si la session est toujours valide.
   * Lance une erreur si une limite est atteinte.
   */
  checkLimits() {
    const elapsed = Date.now() - this.startTime;

    if (elapsed > REALTIME_LIMITS.MAX_SESSION_DURATION_MS) {
      throw new Error(
        `Session time limit reached (${
          REALTIME_LIMITS.MAX_SESSION_DURATION_MS / 1000
        }s)`
      );
    }

    if (this.turnCount >= REALTIME_LIMITS.MAX_TURNS_PER_SESSION) {
      throw new Error(
        `Session turn limit reached (${REALTIME_LIMITS.MAX_TURNS_PER_SESSION} turns)`
      );
    }
  }

  /**
   * Incrémente le compteur de tours. À appeler à chaque fois que l'IA répond.
   */
  incrementTurn() {
    this.turnCount++;
    this.checkLimits();
  }

  getStats() {
    return {
      duration: Date.now() - this.startTime,
      turns: this.turnCount,
    };
  }
}
