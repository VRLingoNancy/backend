export class ConversationServiceError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ConversationServiceError';
    this.statusCode = statusCode;
  }
}
