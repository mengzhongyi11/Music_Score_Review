/**
 * Layer 1: 规则过滤器（零成本）
 * 基于长度和关键词规则过滤无意义/非专业内容
 */

// 音乐相关关键词（扩展自 GB/T 简谱记谱规范术语）
const MUSIC_KEYWORDS = [
  '节奏', '音符', '和弦', '调号', '拍号', '力度', '速度', '旋律',
  '和声', '小节', '休止', '连音', '附点', '符干', '符头', '符尾',
  '音高', '音域', '音阶', '唱名', '高音', '低音', '中音',
  '全音', '半音', '变音', '升号', '降号', '还原', '调性',
  '大调', '小调', '转调', '移调', '临时', '终止', '反复',
  '跳越', '渐强', '渐弱', '渐慢', '渐快', '原速',
  '断音', '重音', '保持音', '延长', '琶音', '滑音', '颤音',
  '波音', '回音', '倚音', '震音', '和弦',
  '声部', '纵列', '对位', '复调', '主调',
  'cresc', 'dim', 'rit', 'a tempo', 'legato', 'stacc',
  '力度标记', '表情记号', '速度标记', '演奏法',
  '小节线', '终止线', '段落线', '连谱号',
  '增时线', '减时线', '延音线', '圆滑线',
  '分句', '乐句', '乐段', '乐章',
  '1=', '4/4', '3/4', '2/4', '6/8', '3/8',
];

// 明确的错误/无意义模式
const MEANINGLESS_PATTERNS = [
  /^\d{1,3}$/,           // 纯数字 1-3 位
  /^(test|asdf|qwer)$/i, // 常见测试字符串
  /^(哈哈|呵呵|嗯|哦)$/,  // 语气词
];

export interface RuleFilterResult {
  passed: boolean;
  reason?: string;
  suggestionType?: 'auto_accept' | 'auto_reject' | 'discuss' | 'info';
}

/**
 * 规则层过滤
 * 返回 { passed: false } 表示被拦截，{ passed: true } 表示通过
 */
export function ruleFilter(input: string): RuleFilterResult {
  if (!input || !input.trim()) {
    return { passed: false, reason: '内容为空', suggestionType: 'auto_reject' };
  }

  const text = input.trim();

  // 长度检查
  if (text.length < 5) {
    return { passed: false, reason: '内容过短（少于5个字），无意义的测试内容', suggestionType: 'auto_reject' };
  }

  // 明确的无意义模式
  for (const pattern of MEANINGLESS_PATTERNS) {
    if (pattern.test(text)) {
      return { passed: false, reason: '匹配无意义模式，自动驳回', suggestionType: 'auto_reject' };
    }
  }

  // 检查是否包含音乐关键词（至少需要包含一个）
  const hasKeyword = MUSIC_KEYWORDS.some(kw => text.includes(kw));
  if (!hasKeyword) {
    return { passed: false, reason: '内容不包含任何音乐相关关键词，非专业术语', suggestionType: 'auto_reject' };
  }

  return { passed: true };
}

/** 获取推荐的 P2 建议（规则层通过的、明确可识别的简单固定模式） */
export function guessPriorityFromRule(text: string): 'P0' | 'P1' | 'P2' {
  const t = text.toLowerCase();
  if (t.includes('错误') || t.includes('冲突') || t.includes('超') || t.includes('节拍') && t.includes('异常')) {
    return 'P0';
  }
  if (t.includes('建议') || t.includes('可以') || t.includes('优化') || t.includes('调整')) {
    return 'P1';
  }
  return 'P2';
}
