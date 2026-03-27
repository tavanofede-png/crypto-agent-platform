import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { WorkspaceService } from './workspace.service';
import { AgentService } from './agent.service';

const app = express();
const workspaceService = new WorkspaceService();
const agentService = new AgentService(workspaceService);

app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '1mb' }));

// ─── Health ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Start / provision agent workspace ───────────────────
app.post('/agents/:agentId/start', async (req: Request, res: Response) => {
  const { agentId } = req.params;
  try {
    const workspace = await workspaceService.create({
      agentId,
      framework: req.body.framework || 'ZEROCLAW',
      model: req.body.model || 'gpt-4o',
      temperature: req.body.temperature ?? 0.7,
      maxTokens: req.body.maxTokens ?? 2048,
      skillContent: req.body.skillContent || '',
    });

    console.log(`[Runtime] Agent ${agentId} workspace created at ${workspace.workspacePath}`);
    res.json({ workspacePath: workspace.workspacePath, status: 'running' });
  } catch (err: any) {
    console.error(`[Runtime] Failed to start agent ${agentId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Send message (SSE streaming) ────────────────────────
app.post('/agents/:agentId/message', async (req: Request, res: Response) => {
  const { agentId } = req.params;
  const { message, history = [], stream = true } = req.body;

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  console.log(`[Runtime] Message for agent ${agentId}: "${message.slice(0, 60)}…"`);

  if (!workspaceService.isRunning(agentId)) {
    // Auto-recover workspace if config exists on disk
    try {
      const workspacePath = workspaceService.getWorkspacePath(agentId);
      const fs = await import('fs-extra');
      const configPath = `${workspacePath}/config.toml`;

      if (await fs.pathExists(configPath)) {
        const skill = await workspaceService.getSkillContent(agentId);
        await workspaceService.create({
          agentId,
          framework: 'ZEROCLAW',
          model: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 2048,
          skillContent: skill,
        });
      } else {
        res.status(404).json({ error: 'Agent workspace not found. Please restart the agent.' });
        return;
      }
    } catch {
      res.status(404).json({ error: 'Agent workspace not found' });
      return;
    }
  }

  await agentService.streamMessage(agentId, message, history, res);
});

// ─── Get agent status ─────────────────────────────────────
app.get('/agents/:agentId/status', (req: Request, res: Response) => {
  const { agentId } = req.params;
  const workspace = workspaceService.getWorkspace(agentId);

  if (!workspace) {
    res.json({ agentId, status: 'stopped', workspacePath: null });
    return;
  }

  res.json({
    agentId,
    status: 'running',
    workspacePath: workspace.workspacePath,
    model: workspace.config.model,
    framework: workspace.config.framework,
  });
});

// ─── Restart agent ────────────────────────────────────────
app.post('/agents/:agentId/restart', async (req: Request, res: Response) => {
  const { agentId } = req.params;

  try {
    const existing = workspaceService.getWorkspace(agentId);
    if (existing) {
      // Re-provision with same config
      await workspaceService.create(existing.config);
    }
    res.json({ status: 'running', agentId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Update SKILL.md ─────────────────────────────────────
app.put('/agents/:agentId/skill', async (req: Request, res: Response) => {
  const { agentId } = req.params;
  const { content } = req.body;

  try {
    await workspaceService.update(agentId, { skillContent: content });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete agent workspace ───────────────────────────────
app.delete('/agents/:agentId', async (req: Request, res: Response) => {
  const { agentId } = req.params;

  try {
    await workspaceService.delete(agentId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Error handler ────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Runtime Error]', err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.RUNTIME_PORT || 3002;
app.listen(PORT, () => {
  console.log(`🤖 Runtime service running on port ${PORT}`);
  console.log(`📂 Workspace base: ${process.env.WORKSPACE_BASE || '/tmp/workspaces'}`);
});
