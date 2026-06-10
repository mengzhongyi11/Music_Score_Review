import { useEffect, useState } from 'react';
import { useSectionsStore } from '@/api/apiStore';
import type { SectionRow } from '@/api';
import styles from './FileTree.module.css';

interface FileTreeProps {
  scoreId: number;
  selectedSectionId: number | null;
  onSelect: (section: SectionRow) => void;
}

/* 递归构建树形结构 */
function buildTree(sections: SectionRow[]): (SectionRow & { children: SectionRow[] })[] {
  const map = new Map<number, SectionRow & { children: SectionRow[] }>();
  const roots: (SectionRow & { children: SectionRow[] })[] = [];

  sections.forEach((s) => map.set(s.id, { ...s, children: [] }));
  sections.forEach((s) => {
    const node = map.get(s.id)!;
    if (s.parent_id && map.has(s.parent_id)) {
      map.get(s.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function TreeNode({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: SectionRow & { children: SectionRow[] };
  depth: number;
  selectedId: number | null;
  onSelect: (s: SectionRow) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedId;
  const isFolder = node.type === 'folder';

  const handleClick = () => {
    if (hasChildren) setExpanded(!expanded);
    if (!isFolder) onSelect(node);
  };

  return (
    <div>
      <div
        className={`${styles.node} ${isSelected ? styles.selected : ''} ${isFolder ? styles.folder : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={handleClick}
      >
        {hasChildren && (
          <span className={`${styles.chevron} ${expanded ? styles.expanded : ''}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4 3l4 3-4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        )}
        {!hasChildren && <span className={styles.spacer} />}
        <span className={styles.icon}>
          {isFolder ? '🎵' : '🎵'}
        </span>
        <span className={styles.name}>{node.name}</span>
        {node.key_signature && (
          <span className={styles.badge}>{node.key_signature}</span>
        )}
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child as SectionRow & { children: SectionRow[] }}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ scoreId, selectedSectionId, onSelect }: FileTreeProps) {
  const { tree, fetchTree } = useSectionsStore();

  useEffect(() => {
    if (scoreId) fetchTree(scoreId);
  }, [scoreId]);

  const roots = buildTree(tree.data);

  if (tree.loading && tree.data.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>乐谱结构</h3>
        </div>
        <div className={styles.loading}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.skeleton} style={{ width: `${60 + i * 10}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (tree.error) {
    return <div className={styles.container}><div className={styles.error}>! {tree.error}</div></div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>乐谱结构</h3>
        <span className={styles.count}>{tree.data.length}</span>
      </div>
      <div className={styles.tree}>
        {roots.map((root) => (
          <TreeNode
            key={root.id}
            node={root}
            depth={0}
            selectedId={selectedSectionId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
