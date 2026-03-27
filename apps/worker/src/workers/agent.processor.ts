import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const RUNTIME_URL = process.env.RUNTIME_URL || 'http://localhost:3002';

export class AgentProcessor {
  private prisma!: PrismaClient;

  async init() {
    this.prisma = new PrismaClient();
    await this.prisma.$connect();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'provision':
        return this.handleProvision(job);
      case 'provision-from-order':
        return this.handleProvisionFromOrder(job);
      case 'delete':
        return this.handleDelete(job);
      case 'restart':
        return this.handleRestart(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }

  private async handleProvisionFromOrder(job: Job<{ orderId: string }>) {
    const { orderId } = job.data;
    console.log(`Provisioning from order ${orderId}...`);

    const order = await this.prisma.agentCreationOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new Error(`Order ${orderId} not found`);

    // Create the agent record if not already done
    let agentId = order.agentId;
    if (!agentId) {
      const agent = await this.prisma.$transaction(async (tx) => {
        const newAgent = await tx.agent.create({
          data: {
            userId:      order.userId,
            name:        order.agentName,
            description: order.agentDescr ?? undefined,
            framework:   order.framework,
            model:       order.model,
            temperature: order.temperature,
            maxTokens:   order.maxTokens,
            status:      'PROVISIONING',
          },
        });
        await tx.skill.create({
          data: {
            agentId:  newAgent.id,
            content:  order.skillContent,
            template: order.skillTemplate,
          },
        });
        await tx.agentCreationOrder.update({
          where: { id: orderId },
          data: { agentId: newAgent.id, status: 'PROVISIONING' },
        });
        return newAgent;
      });
      agentId = agent.id;
    }

    // Delegate to the existing provision handler
    await this.handleProvision({ data: { agentId, userId: order.userId } } as any);

    // Mark order completed
    await this.prisma.agentCreationOrder.update({
      where: { id: orderId },
      data: { status: 'COMPLETED' },
    });

    console.log(`✅ Order ${orderId} completed — agent ${agentId}`);
  }

  private async handleProvision(job: Job<{ agentId: string; userId: string }>) {
    const { agentId } = job.data;
    console.log(`Provisioning agent ${agentId}...`);

    await this.setAgentStatus(agentId, 'PROVISIONING');
    await this.addLog(agentId, 'INFO', 'Starting provisioning...');

    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: { skill: true },
    });

    if (!agent) throw new Error(`Agent ${agentId} not found`);

    try {
      // Call runtime to create workspace
      const response = await axios.post(
        `${RUNTIME_URL}/agents/${agentId}/start`,
        {
          agentId,
          framework: agent.framework,
          model: agent.model,
          temperature: agent.temperature,
          maxTokens: agent.maxTokens,
          skillContent: agent.skill?.content ?? '',
        },
        { timeout: 30000 },
      );

      const { workspacePath } = response.data as { workspacePath: string };

      await this.prisma.agent.update({
        where: { id: agentId },
        data: { status: 'RUNNING', workspacePath },
      });

      await this.addLog(agentId, 'INFO', `Agent provisioned at ${workspacePath}`);
      console.log(`✅ Agent ${agentId} provisioned successfully`);
    } catch (err: any) {
      await this.setAgentStatus(agentId, 'ERROR');
      await this.addLog(agentId, 'ERROR', `Provisioning failed: ${err.message}`);
      throw err;
    }
  }

  private async handleDelete(job: Job<{ agentId: string }>) {
    const { agentId } = job.data;
    console.log(`Deleting agent workspace ${agentId}...`);

    try {
      await axios.delete(`${RUNTIME_URL}/agents/${agentId}`, { timeout: 15000 });
      await this.addLog(agentId, 'INFO', 'Workspace cleaned up');
    } catch (err: any) {
      // Workspace may not exist — log but don't fail
      console.warn(`Workspace cleanup warning for ${agentId}: ${err.message}`);
    }
  }

  private async handleRestart(job: Job<{ agentId: string; userId: string }>) {
    const { agentId } = job.data;
    console.log(`Restarting agent ${agentId}...`);

    try {
      await axios.post(`${RUNTIME_URL}/agents/${agentId}/restart`, {}, { timeout: 30000 });
      await this.setAgentStatus(agentId, 'RUNNING');
      await this.addLog(agentId, 'INFO', 'Agent restarted successfully');
    } catch (err: any) {
      await this.setAgentStatus(agentId, 'ERROR');
      await this.addLog(agentId, 'ERROR', `Restart failed: ${err.message}`);
      throw err;
    }
  }

  private async setAgentStatus(agentId: string, status: string) {
    await this.prisma.agent.update({
      where: { id: agentId },
      data: { status: status as any },
    });
  }

  private async addLog(agentId: string, level: string, message: string) {
    await this.prisma.agentLog.create({
      data: { agentId, level: level as any, message },
    });
  }
}
