/**
 * 向量化服务
 * 调用 DashScope embedding API 生成规则向量，支持余弦相似度检索
 */

import fs from 'fs';
import path from 'path';

const EMBEDDING_API = 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';
const MODEL = 'text-embedding-v2';
const CACHE_FILE = path.resolve(__dirname, '../data/rule_embeddings.json');

interface EmbeddingResponse {
  output?: {
    embeddings?: { text_index: number; embedding: number[] }[];
  };
  usage?: { total_tokens: number };
}

/** 从 DashScope 获取一批文本的向量 */
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error('DASHSCOPE_API_KEY 未配置');

  const resp = await fetch(EMBEDDING_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, input: { texts } }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Embedding API 错误 (${resp.status}): ${err}`);
  }

  const data = await resp.json() as EmbeddingResponse;
  const embeddings = data.output?.embeddings;
  if (!embeddings || !embeddings.length) throw new Error('Embedding 返回空');

  return embeddings.sort((a, b) => a.text_index - b.text_index).map(e => e.embedding);
}

/** 存储缓存的向量数据 */
interface CacheData {
  model: string;
  dimension: number;
  texts: string[];
  embeddings: number[][];
}

/** 从缓存加载向量 */
function loadCache(): CacheData | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch {}
  return null;
}

/** 保存向量到缓存 */
function saveCache(data: CacheData): void {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf-8');
  } catch {}
}

/** 余弦相似度 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * 为规则列表生成并缓存向量
 * @param texts 每条规则的标题 + 描述拼接
 * @param force 是否强制重新生成
 */
export async function ensureEmbeddings(texts: string[], force = false): Promise<number[][]> {
  if (!force) {
    const cached = loadCache();
    if (cached && cached.texts.length === texts.length) {
      return cached.embeddings;
    }
  }

  // 分批调用 API（每批 10 条）
  const BATCH_SIZE = 10;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const embeddings = await getEmbeddings(batch);
      allEmbeddings.push(...embeddings);
      console.log(`  Embedding ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length}`);
    } catch (err) {
      console.error(`  Embedding 失败 (batch ${i}): ${err instanceof Error ? err.message : ''}`);
      throw err;
    }
  }

  if (allEmbeddings.length !== texts.length) {
    throw new Error(`Embedding 数量不匹配：预期 ${texts.length}，实际 ${allEmbeddings.length}`);
  }

  saveCache({
    model: MODEL,
    dimension: allEmbeddings[0]?.length || 0,
    texts,
    embeddings: allEmbeddings,
  });

  return allEmbeddings;
}

/**
 * 异步检索：将 query 转为向量后在缓存中搜索
 */
export async function searchSimilar(query: string, topK = 5): Promise<{ index: number; score: number }[]> {
  const cached = loadCache();
  if (!cached || !cached.embeddings.length) return [];

  // 为 query 生成向量
  const [queryVec] = await getEmbeddings([query]);

  // 计算与所有缓存条目的余弦相似度
  const scored = cached.embeddings.map((emb, i) => ({
    index: i,
    score: cosineSimilarity(queryVec, emb),
  }));

  // 按相似度降序排列取 topK
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
