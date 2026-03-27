import fs from 'fs-extra';
import path from 'path';

const WORKSPACE_BASE = process.env.WORKSPACE_BASE || '/tmp/workspaces';

export interface WorkspaceConfig {
  agentId: string;
  framework: string;
  model: string;
  temperature: number;
  maxTokens: number;
  skillContent: string;
}

export interface AgentWorkspace {
  agentId: string;
  workspacePath: string;
  skillContent: string;
  config: WorkspaceConfig;
}

export class WorkspaceService {
  private workspaces = new Map<string, AgentWorkspace>();

  getWorkspacePath(agentId: string): string {
    return path.join(WORKSPACE_BASE, agentId);
  }

  async create(config: WorkspaceConfig): Promise<AgentWorkspace> {
    const workspacePath = this.getWorkspacePath(config.agentId);

    // Validate agentId to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(config.agentId)) {
      throw new Error('Invalid agentId: must be alphanumeric with hyphens/underscores only');
    }

    await fs.ensureDir(workspacePath);

    // Write SKILL.md
    await fs.writeFile(
      path.join(workspacePath, 'SKILL.md'),
      config.skillContent,
      'utf-8',
    );

    // Write config.toml
    const configToml = this.generateConfigToml(config);
    await fs.writeFile(
      path.join(workspacePath, 'config.toml'),
      configToml,
      'utf-8',
    );

    // Initialize memory
    const memoryPath = path.join(workspacePath, 'memory.json');
    if (!(await fs.pathExists(memoryPath))) {
      await fs.writeJson(memoryPath, { messages: [], created: new Date().toISOString() });
    }

    const workspace: AgentWorkspace = {
      agentId: config.agentId,
      workspacePath,
      skillContent: config.skillContent,
      config,
    };

    this.workspaces.set(config.agentId, workspace);
    return workspace;
  }

  async update(agentId: string, updates: Partial<WorkspaceConfig>): Promise<void> {
    const workspacePath = this.getWorkspacePath(agentId);

    if (updates.skillContent !== undefined) {
      await fs.writeFile(
        path.join(workspacePath, 'SKILL.md'),
        updates.skillContent,
        'utf-8',
      );
    }

    const workspace = this.workspaces.get(agentId);
    if (workspace && updates) {
      Object.assign(workspace.config, updates);
      if (updates.skillContent) workspace.skillContent = updates.skillContent;

      const configToml = this.generateConfigToml(workspace.config);
      await fs.writeFile(path.join(workspacePath, 'config.toml'), configToml, 'utf-8');
    }
  }

  async delete(agentId: string): Promise<void> {
    const workspacePath = this.getWorkspacePath(agentId);
    await fs.remove(workspacePath);
    this.workspaces.delete(agentId);
  }

  async getSkillContent(agentId: string): Promise<string> {
    const skillPath = path.join(this.getWorkspacePath(agentId), 'SKILL.md');
    try {
      return await fs.readFile(skillPath, 'utf-8');
    } catch {
      return '';
    }
  }

  async getMemory(agentId: string): Promise<{ messages: Array<{ role: string; content: string }> }> {
    const memPath = path.join(this.getWorkspacePath(agentId), 'memory.json');
    try {
      return await fs.readJson(memPath);
    } catch {
      return { messages: [] };
    }
  }

  async updateMemory(
    agentId: string,
    messages: Array<{ role: string; content: string }>,
  ): Promise<void> {
    const memPath = path.join(this.getWorkspacePath(agentId), 'memory.json');
    const current = await this.getMemory(agentId);

    const allMessages = [...current.messages, ...messages];
    // Keep last 50 exchanges to bound memory
    const trimmed = allMessages.slice(-100);

    await fs.writeJson(memPath, { messages: trimmed, updated: new Date().toISOString() });
  }

  isRunning(agentId: string): boolean {
    return this.workspaces.has(agentId);
  }

  getWorkspace(agentId: string): AgentWorkspace | undefined {
    return this.workspaces.get(agentId);
  }

  private generateConfigToml(config: WorkspaceConfig): string {
    return `[agent]
id = "${config.agentId}"
framework = "${config.framework}"
model = "${config.model}"
temperature = ${config.temperature}
max_tokens = ${config.maxTokens}
created_at = "${new Date().toISOString()}"

[runtime]
workspace_base = "${WORKSPACE_BASE}"
max_memory_messages = 100
`;
  }
}
