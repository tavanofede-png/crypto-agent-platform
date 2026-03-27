import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedSocket extends Socket {
  userId: string;
  walletAddress: string;
}

interface SendMessagePayload {
  agentId: string;
  sessionId: string;
  content: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token) as {
        sub: string;
        walletAddress: string;
      };

      client.userId = payload.sub;
      client.walletAddress = payload.walletAddress;
      this.logger.log(`Client connected: ${client.id} (${payload.walletAddress.slice(0, 8)}…)`);
    } catch {
      this.logger.warn(`Unauthorized socket connection: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-agent')
  async handleJoinAgent(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() agentId: string,
  ) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent || agent.userId !== client.userId) {
      throw new WsException('Access denied');
    }

    const room = `agent-${agentId}`;
    await client.join(room);
    this.logger.debug(`${client.id} joined room ${room}`);
    return { joined: room };
  }

  @SubscribeMessage('leave-agent')
  handleLeaveAgent(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() agentId: string,
  ) {
    client.leave(`agent-${agentId}`);
    return { left: `agent-${agentId}` };
  }

  @SubscribeMessage('new-session')
  async handleNewSession(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() agentId: string,
  ) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent || agent.userId !== client.userId) {
      throw new WsException('Access denied');
    }

    // Returns the latest existing session with its message history,
    // or creates a new one if the agent has never been chatted with.
    const session = await this.chatService.getOrCreateSession(agentId);
    return session;
  }

  @SubscribeMessage('new-chat')
  async handleNewChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() agentId: string,
  ) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent || agent.userId !== client.userId) {
      throw new WsException('Access denied');
    }

    const session = await this.chatService.createNewSession(agentId);
    return session;
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SendMessagePayload,
  ) {
    const { agentId, sessionId, content } = payload;

    if (!content?.trim()) throw new WsException('Message cannot be empty');

    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent || agent.userId !== client.userId) {
      throw new WsException('Access denied');
    }

    if (agent.status !== 'RUNNING') {
      client.emit('message-error', {
        sessionId,
        error: `Agent is ${agent.status.toLowerCase()}. Please wait for it to start.`,
      });
      return;
    }

    await this.chatService.saveUserMessage(sessionId, content);

    client.emit('message-start', { sessionId });

    let fullResponse = '';

    this.chatService.streamMessageFromRuntime(
      agentId,
      sessionId,
      content,
      (chunk) => {
        client.emit('message-chunk', { sessionId, chunk });
        fullResponse += chunk;
      },
      async (response, tokensUsed) => {
        await this.chatService.saveAssistantMessage(
          sessionId,
          response,
          tokensUsed,
        );

        await this.chatService.addAgentLog(
          agentId,
          'INFO',
          `Processed message (${tokensUsed ?? '?'} tokens)`,
        );

        client.emit('message-complete', {
          sessionId,
          content: response,
          tokensUsed,
        });
      },
      (error) => {
        this.logger.error(`Stream error for agent ${agentId}: ${error.message}`);
        client.emit('message-error', {
          sessionId,
          error: 'Failed to get response from agent. Please try again.',
        });

        this.chatService.addAgentLog(agentId, 'ERROR', `Stream error: ${error.message}`);
      },
    );
  }
}
