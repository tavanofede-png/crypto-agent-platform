import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly runtimeUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.runtimeUrl = this.config.get<string>('RUNTIME_URL', 'http://localhost:3002');
  }

  async getOrCreateSession(agentId: string): Promise<{ id: string; agentId: string; title: string | null; createdAt: Date; messages: Array<{ id: string; role: string; content: string; tokensUsed: number | null; createdAt: Date }> }> {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);

    // Return the most recent session with its last 40 messages.
    // Create a new session only if none exists yet.
    const existing = await this.prisma.chatSession.findFirst({
      where: { agentId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 40,
          select: { id: true, role: true, content: true, tokensUsed: true, createdAt: true },
        },
      },
    });

    if (existing) return existing;

    const session = await this.prisma.chatSession.create({
      data: {
        agentId,
        title: `Chat ${new Date().toLocaleDateString()}`,
      },
      include: {
        messages: true,
      },
    });

    return { ...session, messages: [] };
  }

  async createNewSession(agentId: string) {
    return this.prisma.chatSession.create({
      data: {
        agentId,
        title: `Chat ${new Date().toLocaleDateString()}`,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 40,
          select: { id: true, role: true, content: true, tokensUsed: true, createdAt: true },
        },
      },
    });
  }

  async saveUserMessage(sessionId: string, content: string) {
    return this.prisma.chatMessage.create({
      data: { sessionId, role: 'user', content },
    });
  }

  async saveAssistantMessage(
    sessionId: string,
    content: string,
    tokensUsed?: number,
    durationMs?: number,
  ) {
    return this.prisma.chatMessage.create({
      data: { sessionId, role: 'assistant', content, tokensUsed, durationMs },
    });
  }

  async getSessionHistory(sessionId: string) {
    return this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 40,
    });
  }

  async streamMessageFromRuntime(
    agentId: string,
    sessionId: string,
    userMessage: string,
    onChunk: (chunk: string) => void,
    onDone: (fullResponse: string, tokensUsed?: number) => void,
    onError: (error: Error) => void,
  ) {
    const history = await this.getSessionHistory(sessionId);
    const start = Date.now();

    try {
      const response = await axios.post(
        `${this.runtimeUrl}/agents/${agentId}/message`,
        {
          message: userMessage,
          history: history.map((m) => ({ role: m.role, content: m.content })),
          sessionId,
          stream: true,
        },
        {
          responseType: 'stream',
          timeout: 120000,
        },
      );

      let fullResponse = '';
      let tokensUsed: number | undefined;

      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data) as { content?: string; tokens?: number };
              if (parsed.content) {
                fullResponse += parsed.content;
                onChunk(parsed.content);
              }
              if (parsed.tokens) tokensUsed = parsed.tokens;
            } catch {
              // non-JSON chunk, ignore
            }
          }
        }
      });

      response.data.on('end', () => {
        const durationMs = Date.now() - start;
        onDone(fullResponse, tokensUsed);
        this.logger.debug(
          `Message completed for agent ${agentId}, ${durationMs}ms, ~${tokensUsed ?? '?'} tokens`,
        );
      });

      response.data.on('error', (err: Error) => {
        onError(err);
      });
    } catch (err: any) {
      this.logger.error(`Runtime call failed for agent ${agentId}: ${err.message}`);
      onError(err as Error);
    }
  }

  async addAgentLog(agentId: string, level: string, message: string) {
    return this.prisma.agentLog.create({
      data: { agentId, level: level as any, message },
    });
  }
}
