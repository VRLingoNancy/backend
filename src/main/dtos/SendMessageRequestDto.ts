import { z } from 'zod';

export const SendMessageRequestDto = z.object({
  conversationId: z.uuid({ message: 'conversationId is required' }),
  content: z
    .string()
    .min(1, { message: 'Content cannot be empty.' })
    .max(4000, { message: 'Content cannot exceed 4000 characters.' }),
});

export type SendMessageRequestDtoType = z.infer<typeof SendMessageRequestDto>;

export default SendMessageRequestDto;
