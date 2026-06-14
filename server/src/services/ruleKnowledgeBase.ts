/**
 * GB/T 46845-2025 简谱规则知识库
 *
 * 从简谱规则/ 目录加载 GB/T 标准文档，
 * 提取章节标题和核心规则描述，
 * 构建内存索引用于 RAG 匹配。
 *
 * 数据来源：项目内 4 个 .md 文件
 *  - 简谱规则/GBT+46845-2025-1-20.md   (谱表体式)
 *  - 简谱规则/GBT+46845-2025-21-40.md  (多声部/横纵列)
 *  - 简谱规则/GBT+46845-2025-41-60.md  (基本符号/时值/变音号)
 *  - 简谱规则/GBT+46845-2025-61-79.md  (演奏法/名称术语)
 */

import fs from 'fs';
import path from 'path';

/* ── 一条规则条目 ── */
export interface RuleEntry {
  sectionId: string;     // e.g. "5.2.1" "6.3.9" "10.4.5"
  title: string;         // e.g. "小节线"
  description: string;   // 核心描述（第一段正文）
  keywords: string[];    // 提取的关键词
}

/* ── 匹配结果 ── */
export interface RuleMatch {
  entry: RuleEntry;
  score: number;         // 匹配得分
  matchedKeywords: string[];
}

/* ── 内存知识库 ── */
let knowledgeBase: RuleEntry[] | null = null;
/** 中文分词关键词 → 规则条目索引 */
let keywordIndex: Map<string, Set<number>> = new Map();

const RULE_DIR = path.resolve(__dirname, '../../../简谱规则');
const STAFF_RULE_DIR = path.resolve(__dirname, '../../../五线谱规则');
const MAPPING_FILE = path.resolve(__dirname, '../../../简谱五线谱映射规范.md');

/**
 * 加载目录下所有 .md 文件并解析
 */
function loadDir(dirPath: string): RuleEntry[] {
  const entries: RuleEntry[] = [];
  if (!fs.existsSync(dirPath)) {
    console.warn(`⚠ RAG 知识库目录不存在：${dirPath}`);
    return entries;
  }
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const text = fs.readFileSync(path.join(dirPath, file), 'utf-8');
    entries.push(...parseRuleFile(text));
  }
  return entries;
}

/**
 * 加载/初始化知识库（首次调用时加载，后续用缓存）
 */
export function loadKnowledgeBase(): RuleEntry[] {
  if (knowledgeBase) return knowledgeBase;
  knowledgeBase = [];

  // 简谱规则 GB/T 46845-2025
  knowledgeBase.push(...loadDir(RULE_DIR));
  knowledgeBase.push(...loadDir(STAFF_RULE_DIR));

  // 额外加载映射规范文档
  if (fs.existsSync(MAPPING_FILE)) {
    const mappingText = fs.readFileSync(MAPPING_FILE, 'utf-8');
    knowledgeBase.push(...parseMappingFile(mappingText));
  }

  // 构建关键词索引
  buildKeywordIndex();

  console.log(`📚 RAG 知识库加载完成：${knowledgeBase.length} 条规则（简谱 + 五线谱 + 映射）`);
  return knowledgeBase;
}

/** 解析 GB/T 标准 .md 文件 */
function parseRuleFile(text: string): RuleEntry[] {
  const entries: RuleEntry[] = [];
  const lines = text.split('\n');

  // 匹配章节标题模式：如 "5.2.1　小节线" 或 "6.3.9.2　延音线的标记要求"
  const sectionPattern = /^(\d+(?:\.\d+)+)\s+(.+)$/;
  // 匹配英文标题模式（可能另起一行）
  const enPattern = /^[A-Z][a-zA-Z\s]+$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const m = line.match(sectionPattern);
    if (!m) continue;

    const sectionId = m[1];
    const title = m[2].replace(/^[A-Z][a-zA-Z\s]+$/, '').trim();

    // 跳过纯页码/格式行
    if (title.length < 2) continue;
    if (/^[0-9]+$/.test(title)) continue;

    // 收集后续描述（取接下来 3 行的非空文本）
    const descLines: string[] = [];
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      const nl = lines[j].trim();
      if (!nl || /^[0-9]+$/.test(nl) || /^[A-Z][a-z]+$/.test(nl)) continue;
      if (sectionPattern.test(nl)) break; // 下一个章节开始了
      if (nl.startsWith('GB/T') || nl.startsWith('示例') || nl.startsWith('注意')) break;
      // 跳过分页/GitBook 标记
      if (nl.includes('')) continue;
      descLines.push(nl);
      if (descLines.join('').length > 120) break;
    }

    const description = descLines.join('').slice(0, 200);
    if (description.length < 10) continue;

    const keywords = extractKeywords(title + ' ' + description);

    entries.push({ sectionId, title, description, keywords });
  }

  return entries;
}

/** 解析映射规范文档（提取表格中的规则） */
function parseMappingFile(text: string): RuleEntry[] {
  const entries: RuleEntry[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // 匹配三级标题：### 2.1 基本音级映射
    const m = line.match(/^###\s+(.+)$/);
    if (!m) continue;

    const title = m[1];
    const descLines: string[] = [];
    for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
      const nl = lines[j].trim();
      if (nl.startsWith('###') || nl.startsWith('##')) break;
      if (!nl || nl.startsWith('|')) continue; // 跳过表格行
      descLines.push(nl);
    }

    const description = descLines.join(' ').slice(0, 200);
    if (description.length < 10) continue;

    const keywords = extractKeywords(title + ' ' + description);
    const sectionId = `MAP.${i}`;
    entries.push({ sectionId, title, description, keywords });
  }

  return entries;
}

/** 提取中文/英文关键词 */
function extractKeywords(text: string): string[] {
  const words = new Set<string>();

  // 中文关键词（双字 + 三字组合）
  for (let i = 0; i < text.length - 1; i++) {
    const ch = text.charCodeAt(i);
    if (ch >= 0x4e00 && ch <= 0x9fff) {
      if (i + 1 < text.length) {
        const bigram = text.slice(i, i + 2);
        if (/^[一-鿿]{2}$/.test(bigram)) words.add(bigram);
      }
      if (i + 2 < text.length) {
        const trigram = text.slice(i, i + 3);
        if (/^[一-鿿]{3}$/.test(trigram)) words.add(trigram);
      }
    }
  }

  // 英文关键词
  const enWords = text.match(/[a-zA-Z]{3,}/g);
  if (enWords) enWords.forEach(w => words.add(w.toLowerCase()));

  return Array.from(words).slice(0, 30);
}

/** 构建关键词 → 条目索引 */
function buildKeywordIndex(): void {
  keywordIndex.clear();
  if (!knowledgeBase) return;

  for (let ei = 0; ei < knowledgeBase.length; ei++) {
    for (const kw of knowledgeBase[ei].keywords) {
      if (!keywordIndex.has(kw)) {
        keywordIndex.set(kw, new Set());
      }
      keywordIndex.get(kw)!.add(ei);
    }
  }
}

/**
 * RAG 匹配：在知识库中搜索与输入最匹配的规则
 */
export function searchRules(input: string, topK: number = 3): RuleMatch[] {
  const kb = loadKnowledgeBase();
  if (!kb.length) return [];

  const inputKeywords = extractKeywords(input);
  if (!inputKeywords.length) return [];

  // 计算每条规则的匹配分数
  const scores: { idx: number; score: number; matched: string[] }[] = [];

  for (let ei = 0; ei < kb.length; ei++) {
    const entry = kb[ei];
    let score = 0;
    const matched: string[] = [];

    for (const kw of inputKeywords) {
      if (entry.keywords.includes(kw)) {
        score += 3; // 精确关键词匹配
        matched.push(kw);
      } else if (entry.title.includes(kw) || entry.description.includes(kw)) {
        score += 1; // 子串匹配
      }
    }

    // 标题全匹配加成
    for (const kw of inputKeywords) {
      if (entry.title.includes(kw)) score += 5;
    }

    if (score > 0) {
      scores.push({ idx: ei, score, matched });
    }
  }

  // 排序取前 K
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK).map(s => ({
    entry: kb[s.idx],
    score: s.score,
    matchedKeywords: s.matched,
  }));
}
