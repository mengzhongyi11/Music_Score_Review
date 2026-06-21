import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConflictCard } from './ConflictCard';
import { mergeApi } from '@/api';

vi.mock('@/api', () => ({
  mergeApi: {
    resolveConflict: vi.fn(),
  },
}));

const mockConflict = {
  id: 1,
  branch_id: 3,
  score_id: 1,
  section_id: 2,
  section_name: '第一乐章',
  conflict_type: 'note_content' as const,
  conflict_detail: '第1小节第3个音 3→4：主库为 3（mi），分支改为 4（fa）。',
  merge_suggestion: 'AI 分析：建议接受',
  mainValue: '3',
  branchValue: '4',
  measureIndex: 1,
  noteIndex: 3,
  status: 'pending',
  created_at: '2026-01-01',
};

describe('ConflictCard', () => {
  it('renders conflict type badge', () => {
    render(<ConflictCard conflict={mockConflict} onResolved={() => {}} />);
    expect(screen.getByText('♪ 音符冲突')).toBeTruthy();
  });

  it('renders section name', () => {
    render(<ConflictCard conflict={mockConflict} onResolved={() => {}} />);
    expect(screen.getByText(/第一乐章/)).toBeTruthy();
  });

  it('renders AI suggestion when present', () => {
    render(<ConflictCard conflict={mockConflict} onResolved={() => {}} />);
    expect(screen.getByText(/AI 分析：建议接受/)).toBeTruthy();
  });

  it('renders system detection detail', () => {
    render(<ConflictCard conflict={mockConflict} onResolved={() => {}} />);
    expect(screen.getByText(/第1小节第3个音/)).toBeTruthy();
  });

  it('renders both resolution buttons', () => {
    render(<ConflictCard conflict={mockConflict} onResolved={() => {}} />);
    expect(screen.getByText('✓ 采用分支')).toBeTruthy();
    expect(screen.getByText('✓ 采用主库')).toBeTruthy();
  });

  it('calls resolveConflict on button click and fires onResolved', async () => {
    const onResolved = vi.fn();
    (mergeApi.resolveConflict as any).mockResolvedValue({ message: 'ok' });

    render(<ConflictCard conflict={mockConflict} onResolved={onResolved} />);
    fireEvent.click(screen.getByText('✓ 采用分支'));

    await waitFor(() => {
      expect(mergeApi.resolveConflict).toHaveBeenCalledWith(1, {
        resolution: 'accept_branch',
        resolved_by: 1,
      });
    });
    expect(onResolved).toHaveBeenCalled();
  });

  it('does not show buttons for resolved conflict', () => {
    render(
      <ConflictCard conflict={{ ...mockConflict, status: 'accepted' }} onResolved={() => {}} />
    );
    expect(screen.queryByText('✓ 采用分支')).toBeNull();
  });

  it('does not render AI suggestion section when absent', () => {
    render(
      <ConflictCard
        conflict={{ ...mockConflict, merge_suggestion: null }}
        onResolved={() => {}}
      />
    );
    expect(screen.queryByText(/AI/)).toBeNull();
  });
});
