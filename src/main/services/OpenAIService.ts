// Typage de la réponse OpenAI
export interface OpenAIChatCompletion {
  choices: Array<{
    message: { content: string };
  }>;
  // ... autres champs si besoin
}
export class OpenAIService {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.CHATGPT_API_KEY || '';
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
    if (!this.apiKey) {
      throw new Error('Missing OpenAI API key');
    }
  }

  async chatCompletion({
    messages,
    model = 'gpt-4o',
    temperature = 0.2,
    max_tokens = 800,
  }: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    model?: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<OpenAIChatCompletion> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
      }),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }
    return response.json() as Promise<OpenAIChatCompletion>;
  }
}
