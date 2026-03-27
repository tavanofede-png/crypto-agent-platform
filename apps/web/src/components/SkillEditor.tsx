'use client';

import { useState } from 'react';
import { Save, RotateCw, FileText, Loader2, CheckCircle } from 'lucide-react';
import { agentsApi } from '@/lib/api';

interface Props {
  agentId: string;
  initialContent: string;
  onSaved?: (content: string) => void;
}

export function SkillEditor({ agentId, initialContent, onSaved }: Props) {
  const [content, setContent] = useState(initialContent);
  const [originalContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = content !== originalContent;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      await agentsApi.update(agentId, { skillContent: content });
      setSaved(true);
      onSaved?.(content);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to save SKILL.md');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setContent(initialContent);
    setError(null);
  };

  const lineCount = content.split('\n').length;
  const charCount = content.length;

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-medium text-white">SKILL.md</span>
          {isDirty && (
            <span className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved changes" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600">
            {lineCount} lines · {charCount} chars
          </span>

          {isDirty && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
            >
              <RotateCw className="h-3 w-3" />
              Reset
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="flex items-center gap-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving…
              </>
            ) : saved ? (
              <>
                <CheckCircle className="h-3 w-3" />
                Saved!
              </>
            ) : (
              <>
                <Save className="h-3 w-3" />
                Save
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="flex-1 bg-transparent p-4 text-sm text-zinc-200 font-mono resize-none outline-none scrollbar-thin placeholder:text-zinc-600"
        placeholder="# Agent Identity&#10;&#10;## Core Skills&#10;- Skill 1&#10;- Skill 2"
        spellCheck={false}
      />

      {/* Footer */}
      {error && (
        <div className="px-4 py-3 border-t border-red-500/20 bg-red-500/10 text-red-400 text-xs">
          {error}
        </div>
      )}

      <div className="px-4 py-2 border-t border-zinc-800 text-xs text-zinc-600 flex items-center gap-2">
        <span>Markdown</span>
        <span>·</span>
        <span>SKILL.md format</span>
      </div>
    </div>
  );
}
