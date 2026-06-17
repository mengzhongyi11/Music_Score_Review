/**
 * Layer 3: DashScope（通义千问）AI 调用
 * 对通过规则层和 RAG 层的内容进行 LLM 分析
 */

const DASHSCOPE_API = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
const MODEL = 'qwen-plus';

interface DashScopeMessage {
  role: 'system' | 'user';
  content: string;
}

interface DashScopeRequest {
  model: string;
  input: { messages: DashScopeMessage[] };
  parameters: {
    result_format: 'message';
    temperature: number;
  };
}

interface DashScopeResponse {
  output?: {
    choices?: {
      message?: { content?: string; role?: string };
      finish_reason?: string;
    }[];
  };
  usage?: { output_tokens: number };
}

export interface AiSuggestionResult {
  suggestionType: 'auto_accept' | 'auto_reject' | 'discuss' | 'info';
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  reason: string;
}

const SYSTEM_PROMPT = `你是一位专业的乐谱审阅助手，精通简谱记谱法和音乐理论。
请分析用户提交的审阅建议，输出 JSON 格式结果：

{
  "suggestion_type": "auto_accept | auto_reject | discuss | info",
  "priority": "P0 | P1 | P2",
  "title": "简短的标题",
  "reason": "判断理由"
}

分类规则：
- auto_accept：明确的错误修正（如错音、错拍号、错调号）
- auto_reject：无意义或错误的内容
- discuss：需要人工讨论的修改建议
- info：仅信息提示，无需处理

优先级：
- P0 紧急：节拍错误、音域超限、和声冲突、调号/拍号错误
- P1 建议：表情记号、力度微调、速度标记建议
- P2 可忽略：格式微调、排版调整、措辞建议`;

/**
 * 调用 DashScope API 进行 AI 审阅分析
 */
export async function aiReviewAnalyze(
  content: string,
  ragContext?: string,
  apiKey?: string,
): Promise<AiSuggestionResult> {
  const key = apiKey || process.env.DASHSCOPE_API_KEY;
  if (!key) {
    throw new Error('DASHSCOPE_API_KEY 未配置');
  }

  const userPrompt = ragContext
    ? `【参考上下文】\n${ragContext}\n\n【待分析内容】\n${content}`
    : `【待分析内容】\n${content}`;

  const body: DashScopeRequest = {
    model: MODEL,
    input: {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    },
    parameters: {
      result_format: 'message',
      temperature: 0.3,
    },
  };

  const response = await fetch(DASHSCOPE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DashScope API 错误 (${response.status}): ${errorText}`);
  }

  const data = await response.json() as DashScopeResponse;
  const reply = data.output?.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error('DashScope 返回空结果');
  }

  // 尝试从中提取 JSON
  try {
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        suggestionType: validateSuggestionType(result.suggestion_type),
        priority: validatePriority(result.priority),
        title: result.title || 'AI 审阅建议',
        reason: result.reason || 'AI 分析完成',
      };
    }
  } catch {
    // JSON 解析失败，回退到纯文本
  }

  return {
    suggestionType: 'discuss',
    priority: 'P2',
    title: 'AI 审阅建议',
    reason: reply.slice(0, 500),
  };
}

/**
 * 带重试的 AI 分析，失败时返回安全默认值
 */
export async function aiReviewWithFallback(
  content: string,
  ragContext?: string,
): Promise<AiSuggestionResult> {
  const MAX_RETRIES = 1;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await aiReviewAnalyze(content, ragContext);
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        continue;
      }
      // 最终失败：降级为 discuss + P2
      return {
        suggestionType: 'discuss',
        priority: 'P2',
        title: 'AI 暂不可用',
        reason: `AI 服务调用失败：${err instanceof Error ? err.message : '未知错误'}。已降级为人工讨论。`,
      };
    }
  }

  return { suggestionType: 'discuss', priority: 'P2', title: 'AI 暂不可用', reason: 'AI 服务异常' };
}

function validateSuggestionType(t: string): AiSuggestionResult['suggestionType'] {
  return ['auto_accept', 'auto_reject', 'discuss', 'info'].includes(t)
    ? (t as AiSuggestionResult['suggestionType'])
    : 'discuss';
}

function validatePriority(p: string): AiSuggestionResult['priority'] {
  return ['P0', 'P1', 'P2'].includes(p)
    ? (p as AiSuggestionResult['priority'])
    : 'P2';
}
