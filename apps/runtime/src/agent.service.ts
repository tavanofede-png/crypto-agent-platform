import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { WorkspaceService } from './workspace.service';
import { Response } from 'express';

const ANTHROPIC_MODELS = [
  'claude-3-5-sonnet-20241022',
  'claude-3-haiku-20240307',
  'claude-3-opus-20240229',
];

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class AgentService {
  private openai: OpenAI;
  private anthropic: Anthropic;

  constructor(private readonly workspaceService: WorkspaceService) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async streamMessage(
    agentId: string,
    userMessage: string,
    history: ChatMessage[],
    res: Response,
  ): Promise<void> {
    const workspace = this.workspaceService.getWorkspace(agentId);

    if (!workspace) {
      res.status(404).json({ error: 'Agent workspace not found' });
      return;
    }

    const skillContent = await this.workspaceService.getSkillContent(agentId);
    const { model, temperature, maxTokens } = workspace.config;

    // Build messages array (cap history at 20 exchanges = 40 messages)
    const recentHistory = history.slice(-40);
    const messages: ChatMessage[] = [
      { role: 'system', content: skillContent || 'You are a helpful AI assistant.' },
      ...recentHistory,
      { role: 'user', content: userMessage },
    ];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const isAnthropic = ANTHROPIC_MODELS.includes(model);

      if (isAnthropic) {
        await this.streamAnthropic(messages, model, temperature, maxTokens, res);
      } else {
        await this.streamOpenAI(messages, model, temperature, maxTokens, res);
      }

      // Update workspace memory
      await this.workspaceService.updateMemory(agentId, [
        { role: 'user', content: userMessage },
      ]);
    } catch (err: any) {
      console.error(`[AgentService] Stream error for ${agentId}: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  private async streamOpenAI(
    messages: ChatMessage[],
    model: string,
    temperature: number,
    maxTokens: number,
    res: Response,
  ): Promise<void> {
    const stream = await this.openai.chat.completions.create({
      model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature,
      max_tokens: maxTokens,
      stream: true,
    });

    let totalTokens = 0;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }

      if (chunk.usage) {
        totalTokens = chunk.usage.total_tokens;
      }
    }

    if (totalTokens > 0) {
      res.write(`data: ${JSON.stringify({ tokens: totalTokens })}\n\n`);
    }
  }

  private async streamAnthropic(
    messages: ChatMessage[],
    model: string,
    temperature: number,
    maxTokens: number,
    res: Response,
  ): Promise<void> {
    const systemMessage = messages.find((m) => m.role === 'system')?.content ?? '';
    const userMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const stream = await this.anthropic.messages.create({
      model,
      system: systemMessage,
      messages: userMessages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }

      if (event.type === 'message_delta' && event.usage) {
        outputTokens = event.usage.output_tokens;
      }

      if (event.type === 'message_start' && event.message.usage) {
        inputTokens = event.message.usage.input_tokens;
      }
    }

    const totalTokens = inputTokens + outputTokens;
    if (totalTokens > 0) {
      res.write(`data: ${JSON.stringify({ tokens: totalTokens })}\n\n`);
    }
  }
}
