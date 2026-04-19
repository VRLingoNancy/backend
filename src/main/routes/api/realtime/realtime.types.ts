export type RealtimeContentPart = {
  type?: string;
  text?: string;
  transcript?: string;
};

export type RealtimeUserItem = {
  id?: string;
  role?: string;
  content?: RealtimeContentPart[];
};

export type RealtimeConversationContext = 'medieval';

export type RealtimeEvent = {
  type: string;
  item_id?: string;
  previous_item_id?: string;
  delta?: string;
  transcript?: string;
  item?: RealtimeUserItem;
  response?: {
    id?: string;
    status?: string;
    output?: Array<{
      id?: string;
      role?: string;
      content?: RealtimeContentPart[];
    }>;
    usage?: {
      total_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
      input_token_details?: {
        text_tokens?: number;
        audio_tokens?: number;
      };
      output_token_details?: {
        text_tokens?: number;
        audio_tokens?: number;
      };
    };
  };
};
