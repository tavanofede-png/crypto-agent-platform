import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAgentDto } from './dto/update-agent.dto';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('agents') private readonly agentsQueue: Queue,
  ) {}

  async findAll(userId: string) {
    return this.prisma.agent.findMany({
      where: { userId, status: { not: 'DELETED' } },
      include: { skill: true, _count: { select: { chatSessions: true, logs: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      include: { skill: true, _count: { select: { chatSessions: true } } },
    });

    if (!agent || agent.status === 'DELETED') {
      throw new NotFoundException(`Agent ${id} not found`);
    }
    if (agent.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return agent;
  }

  async update(id: string, dto: UpdateAgentDto, userId: string) {
    await this.findOne(id, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.agent.update({
        where: { id },
        data: {
          ...(dto.name && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.model && { model: dto.model }),
          ...(dto.temperature !== undefined && { temperature: dto.temperature }),
          ...(dto.maxTokens !== undefined && { maxTokens: dto.maxTokens }),
        },
      });

      if (dto.skillContent) {
        await tx.skill.upsert({
          where: { agentId: id },
          create: { agentId: id, content: dto.skillContent },
          update: { content: dto.skillContent, version: { increment: 1 } },
        });
        await tx.agentLog.create({
          data: { agentId: id, level: 'INFO', message: 'SKILL.md updated by user' },
        });
      }
    });

    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);

    await this.prisma.agent.update({
      where: { id },
      data: { status: 'DELETED' },
    });

    await this.agentsQueue.add('delete', { agentId: id }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });

    this.logger.log(`Agent ${id} marked for deletion`);
    return { success: true };
  }

  async restart(id: string, userId: string) {
    const agent = await this.findOne(id, userId);

    if (agent.status === 'DELETED') {
      throw new BadRequestException('Cannot restart a deleted agent');
    }

    await this.prisma.agent.update({
      where: { id },
      data: { status: 'PROVISIONING' },
    });

    await this.agentsQueue.add('restart', { agentId: id, userId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    await this.prisma.agentLog.create({
      data: { agentId: id, level: 'INFO', message: 'Agent restart requested' },
    });

    return { success: true, message: 'Restart queued' };
  }

  async getLogs(id: string, userId: string, limit = 50) {
    await this.findOne(id, userId);

    return this.prisma.agentLog.findMany({
      where: { agentId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getSessions(id: string, userId: string) {
    await this.findOne(id, userId);

    return this.prisma.chatSession.findMany({
      where: { agentId: id },
      include: { _count: { select: { messages: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getSessionMessages(sessionId: string, userId: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { agent: true },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.agent.userId !== userId) throw new ForbiddenException();

    return this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
