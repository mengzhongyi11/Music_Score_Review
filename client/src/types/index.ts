/* ── 核心类型定义 ── */

export type ReviewStatus = 'pending' | 'working' | 'approved' | 'rejected';

export type ScoreType = 'staff' | 'jianpu';

export type AnnotationStatus = 'awaiting_reply' | 'replied' | 'resolved';

export type DiffType = 'added' | 'deleted' | 'modified';

export interface User {
  id: string;
  name: string;
  avatar: string;
  online: boolean;
  cursorColor?: string;
  cursorPosition?: { staff: number; measure: number; x: number; y: number };
}

export interface Score {
  id: string;
  name: string;
  composer: string;
  description?: string;
  type: ScoreType;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Section {
  id: string;
  scoreId: string;
  parentId?: string;
  name: string;
  path: string;
  type: ScoreType;
  content: string;
  tempo?: number;
  keySignature?: string;
  timeSignature?: string;
  sortOrder: number;
}

export interface Annotation {
  id: string;
  sectionId: string;
  measureRef: number;
  noteRef?: number;
  author: User;
  content: string;
  type: 'text' | 'voice' | 'reaction';
  status: AnnotationStatus;
  createdAt: string;
  replies: AnnotationReply[];
  position: { x: number; y: number };
}

export interface AnnotationReply {
  id: string;
  author: User;
  content: string;
  createdAt: string;
}

export interface Version {
  id: string;
  scoreId: string;
  version: number;
  label: string;
  author: User;
  createdAt: string;
  message: string;
  annotationCount: number;
  isCurrent: boolean;
}

export interface DiffLine {
  type: DiffType;
  measure: number;
  content: string;
  oldContent?: string;
}

export interface DiffSummary {
  added: number;
  deleted: number;
  modified: number;
  netChange: number;
}

export interface KanbanCard {
  id: string;
  score: Score;
  submitter: User;
  submittedAt: string;
  annotationCount: number;
  status: ReviewStatus;
}

export interface Notification {
  id: string;
  type: 'annotation' | 'review' | 'mention';
  message: string;
  read: boolean;
  createdAt: string;
}
