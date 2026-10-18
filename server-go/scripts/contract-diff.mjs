/**
 * 契约对比脚本：同一份数据库上，逐端点比对 Node 版与 Go 版的响应。
 *
 * 用法：
 *   1) 启动 Node 版（3001）：cd server && npx tsx src/index.ts
 *   2) 启动 Go 版（3002）  ：PORT=3002 ./api-go.exe
 *   3) node scripts/contract-diff.mjs
 *
 * 对比维度：HTTP 状态码、Content-Type、JSON 结构（键集合 / 值类型 / 空值语义）。
 * 递归定位到具体差异路径，而不只是"整体不等"。
 */

const NODE_BASE = process.env.NODE_BASE || 'http://localhost:3001';
const GO_BASE = process.env.GO_BASE || 'http://localhost:3002';

/* ── 待比对端点 ── */
const CASES = [
  { name: 'health', method: 'GET', path: '/api/health' },

  { name: 'scores 列表', method: 'GET', path: '/api/scores' },
  { name: 'scores 按 owner 筛选', method: 'GET', path: '/api/scores?owner_id=1' },
  { name: 'scores 分页', method: 'GET', path: '/api/scores?page=1&pageSize=2' },
  { name: 'scores 分页第2页', method: 'GET', path: '/api/scores?page=2&pageSize=3' },
  { name: 'scores 详情', method: 'GET', path: '/api/scores/1' },
  { name: 'scores 详情不存在', method: 'GET', path: '/api/scores/99999' },
  { name: 'scores 搜索', method: 'GET', path: '/api/scores/search/' + encodeURIComponent('月') },
  { name: 'scores 搜索无结果', method: 'GET', path: '/api/scores/search/' + encodeURIComponent('zzz不存在') },

  { name: 'sections 顶级', method: 'GET', path: '/api/sections/score/1' },
  { name: 'sections 树', method: 'GET', path: '/api/sections/score/1/tree' },
  { name: 'sections 子乐段', method: 'GET', path: '/api/sections/1/children' },
  { name: 'sections 详情', method: 'GET', path: '/api/sections/1' },
  { name: 'sections 详情不存在', method: 'GET', path: '/api/sections/99999' },
  { name: 'sections 版本历史', method: 'GET', path: '/api/sections/1/versions' },

  { name: 'users 列表', method: 'GET', path: '/api/users' },
  { name: 'users 详情', method: 'GET', path: '/api/users/1' },
  { name: 'users 详情不存在', method: 'GET', path: '/api/users/99999' },
  { name: 'users 资料+统计', method: 'GET', path: '/api/users/1/profile' },
  { name: 'users 拥有的乐谱', method: 'GET', path: '/api/users/1/scores' },
  { name: 'users 协作的乐谱', method: 'GET', path: '/api/users/2/collaborations' },
  { name: 'users 动态', method: 'GET', path: '/api/users/1/activity' },
  { name: 'users 动态 limit', method: 'GET', path: '/api/users/1/activity?limit=3' },

  { name: 'tags 列表', method: 'GET', path: '/api/tags' },
  { name: 'tags 乐谱标签', method: 'GET', path: '/api/tags/score/1' },
  { name: 'tags 乐谱标签(空)', method: 'GET', path: '/api/tags/score/99999' },

  { name: 'collaborators 列表', method: 'GET', path: '/api/collaborators/score/1' },
  { name: 'collaborators 空', method: 'GET', path: '/api/collaborators/score/99999' },

  { name: 'versions 详情', method: 'GET', path: '/api/versions/1' },
  { name: 'versions 不存在', method: 'GET', path: '/api/versions/99999' },

  { name: 'stats 全站', method: 'GET', path: '/api/stats' },
  { name: 'stats 按用户', method: 'GET', path: '/api/stats?user_id=1' },
  { name: 'feed', method: 'GET', path: '/api/feed' },
  { name: 'feed limit', method: 'GET', path: '/api/feed?limit=5' },
  { name: 'dashboard', method: 'GET', path: '/api/dashboard' },
  { name: 'fullscore', method: 'GET', path: '/api/scores/1/full-score' },
  { name: 'fullscore 不存在', method: 'GET', path: '/api/scores/99999/full-score' },

  { name: 'reviews 历史', method: 'GET', path: '/api/reviews/1' },
  { name: 'reviews 历史(空)', method: 'GET', path: '/api/reviews/99999' },
  { name: 'invitations 用户', method: 'GET', path: '/api/invitations/user/2' },
  { name: 'invitations 用户(空)', method: 'GET', path: '/api/invitations/user/99999' },
  { name: 'invitations 乐谱', method: 'GET', path: '/api/invitations/score/1' },
  { name: 'invitations 乐谱(空)', method: 'GET', path: '/api/invitations/score/99999' },
  { name: 'notifications 列表', method: 'GET', path: '/api/notifications/1' },
  { name: 'notifications 列表(空)', method: 'GET', path: '/api/notifications/99999' },
  { name: 'notifications 未读数', method: 'GET', path: '/api/notifications/1/unread-count' },

  { name: 'comments 按乐段', method: 'GET', path: '/api/comments/section/1' },
  { name: 'comments 按乐段(空)', method: 'GET', path: '/api/comments/section/99999' },
  { name: 'comments 全部批注', method: 'GET', path: '/api/comments/by-score' },

  { name: 'branches 列表', method: 'GET', path: '/api/branches/score/1' },
  { name: 'branches 列表(空)', method: 'GET', path: '/api/branches/score/99999' },
  { name: 'branches diff', method: 'GET', path: '/api/branches/3/diff' },
  { name: 'branches diff 不存在', method: 'GET', path: '/api/branches/99999/diff' },

  { name: 'ai-review 建议列表', method: 'GET', path: '/api/ai-review/suggestions/1' },
  { name: 'ai-review 建议列表(空)', method: 'GET', path: '/api/ai-review/suggestions/99999' },
  { name: 'ai-review 按状态筛', method: 'GET', path: '/api/ai-review/suggestions/1?status=pending' },
  { name: 'impact 汇总', method: 'GET', path: '/api/impact/summary/1' },
  { name: 'impact 汇总(空)', method: 'GET', path: '/api/impact/summary/99999' },
  { name: 'preferences 统计', method: 'GET', path: '/api/preferences/1/stats' },
  { name: 'preferences 全局', method: 'GET', path: '/api/preferences/ai-stats' },

  // 纯计算 / 只读的 POST，无副作用
  {
    name: 'impact 单段分析', method: 'POST', path: '/api/impact/analyze-section',
    body: { score_id: 1, section_id: 2, section_name: '第一乐章', old_content: '1=C 4/4 ♩=120\n| 1 2 3 4 |', new_content: '1=C 4/4 ♩=90\n| 1 2 3 4 5 |' },
  },
  {
    name: 'impact 单段分析 缺少内容', method: 'POST', path: '/api/impact/analyze-section',
    body: { score_id: 1 },
  },
  {
    name: 'preferences 检测驳回', method: 'POST', path: '/api/preferences/check-reject',
    body: { content: '这是一段测试内容', user_id: 1 },
  },
];

/* ── 请求 ── */
async function call(base, { method, path, body, token }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  return {
    status: res.status,
    contentType: res.headers.get('content-type'),
    text,
    json,
  };
}

/* ── 深度比对：返回差异路径列表 ── */
function diff(a, b, path = '$', out = []) {
  if (out.length >= 12) return out;

  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (a !== b) {
      // 区分 null / 缺失 / 类型不同，便于定位契约问题
      const desc = a === null ? 'null' : `${typeof a}(${JSON.stringify(a)?.slice(0, 40)})`;
      const got = b === null ? 'null' : `${typeof b}(${JSON.stringify(b)?.slice(0, 40)})`;
      out.push(`${path}: Node=${desc}  Go=${got}`);
    }
    return out;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    out.push(`${path}: 一方是数组一方不是（Node ${Array.isArray(a) ? 'array' : 'object'} / Go ${Array.isArray(b) ? 'array' : 'object'}）`);
    return out;
  }

  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      out.push(`${path}: 数组长度 Node=${a.length} Go=${b.length}`);
    }
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) diff(a[i], b[i], `${path}[${i}]`, out);
    return out;
  }

  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  const onlyA = keysA.filter((k) => !keysB.includes(k));
  const onlyB = keysB.filter((k) => !keysA.includes(k));
  if (onlyA.length) out.push(`${path}: Node 独有的键 [${onlyA.join(', ')}]`);
  if (onlyB.length) out.push(`${path}: Go 独有的键 [${onlyB.join(', ')}]`);

  for (const k of keysA.filter((k) => keysB.includes(k))) {
    diff(a[k], b[k], `${path}.${k}`, out);
  }
  return out;
}

/* ── 登录 + 跨服务 JWT 互认 ── */
async function authFlow() {
  console.log('\n── 鉴权流程 ──');

  // 用种子用户登录（张三 / 1234）
  const creds = { name: '张教授', password: '1234' };
  let nodeLogin, goLogin;
  try {
    [nodeLogin, goLogin] = await Promise.all([
      call(NODE_BASE, { method: 'POST', path: '/api/auth/login', body: creds }),
      call(GO_BASE, { method: 'POST', path: '/api/auth/login', body: creds }),
    ]);
  } catch (e) {
    console.log(`❌ 登录请求失败: ${e.message}`);
    return { ok: false };
  }

  if (nodeLogin.status !== goLogin.status) {
    console.log(`❌ 登录状态码不同: Node=${nodeLogin.status} Go=${goLogin.status}`);
    console.log(`   Node: ${nodeLogin.text.slice(0, 120)}`);
    console.log(`   Go  : ${goLogin.text.slice(0, 120)}`);
    return { ok: false };
  }
  if (nodeLogin.status !== 200) {
    console.log(`⚠ 登录未成功（${nodeLogin.status}），跳过鉴权相关比对: ${nodeLogin.text.slice(0, 100)}`);
    return { ok: false };
  }

  // user 对象应完全一致（token 因签发时间不同必然不同，单独比对结构）
  const uDiff = diff(nodeLogin.json?.user, goLogin.json?.user, '$.user');
  if (uDiff.length) {
    console.log('❌ 登录返回的 user 不一致:');
    uDiff.slice(0, 5).forEach((d) => console.log(`     ${d}`));
    return { ok: false };
  }
  console.log('✅ 登录 user 对象一致');

  const nodeToken = nodeLogin.json.token;
  const goToken = goLogin.json.token;
  console.log('   (token 已获取)');

  // ① Node 签的 token → Go 的 /auth/me（跨服务互认）
  const cross1 = await call(GO_BASE, { method: 'GET', path: '/api/auth/me', token: nodeToken });
  if (cross1.status === 200) {
    console.log('✅ Node 签发的 token 被 Go 接受（JWT 互认）');
  } else {
    console.log(`❌ Node token 打 Go 的 /auth/me 返回 ${cross1.status}: ${cross1.text.slice(0, 100)}`);
  }

  // ② Go 签的 token → Node 的 /auth/me
  const cross2 = await call(NODE_BASE, { method: 'GET', path: '/api/auth/me', token: goToken });
  if (cross2.status === 200) {
    console.log('✅ Go 签发的 token 被 Node 接受（反向互认）');
  } else {
    console.log(`❌ Go token 打 Node 的 /auth/me 返回 ${cross2.status}: ${cross2.text.slice(0, 100)}`);
  }

  // ③ 两个 /auth/me 的响应体应一致
  const meDiff = diff(cross2.json, cross1.json, '$.me');
  if (meDiff.length === 0) {
    console.log('✅ /auth/me 响应一致');
  } else {
    console.log('❌ /auth/me 响应不一致:');
    meDiff.slice(0, 5).forEach((d) => console.log(`     ${d}`));
  }

  // ④ JWT 载荷结构（exp - iat 应为 7 天）
  const payload = JSON.parse(Buffer.from(goToken.split('.')[1], 'base64url').toString());
  const ttl = payload.exp - payload.iat;
  console.log(ttl === 604800
    ? `✅ JWT 载荷正确：{id:${payload.id}, role:${payload.role}}，7 天有效`
    : `❌ JWT 有效期异常：${ttl} 秒（应为 604800）`);

  return { ok: true, nodeToken };
}

/* ── 主流程 ── */
let pass = 0, fail = 0;
const failures = [];

await authFlow();

for (const c of CASES) {
  let nodeRes, goRes;
  try {
    [nodeRes, goRes] = await Promise.all([call(NODE_BASE, c), call(GO_BASE, c)]);
  } catch (e) {
    fail++;
    failures.push(`【${c.name}】请求失败: ${e.message}`);
    continue;
  }

  const problems = [];

  if (nodeRes.status !== goRes.status) {
    problems.push(`状态码: Node=${nodeRes.status} Go=${goRes.status}`);
  }
  const ctN = (nodeRes.contentType || '').split(';')[0];
  const ctG = (goRes.contentType || '').split(';')[0];
  if (ctN !== ctG) {
    problems.push(`Content-Type: Node=${ctN} Go=${ctG}`);
  }

  if (nodeRes.json !== null && goRes.json !== null) {
    problems.push(...diff(nodeRes.json, goRes.json));
  } else if (nodeRes.text !== goRes.text) {
    problems.push(`非 JSON 响应体不同: Node=${nodeRes.text.slice(0, 80)} Go=${goRes.text.slice(0, 80)}`);
  }

  if (problems.length === 0) {
    pass++;
    console.log(`✅ ${c.name}`);
  } else {
    fail++;
    console.log(`❌ ${c.name}  (${c.method} ${c.path})`);
    problems.slice(0, 8).forEach((p) => console.log(`     ${p}`));
    if (problems.length > 8) console.log(`     …还有 ${problems.length - 8} 处`);
    failures.push(`【${c.name}】\n  ${problems.slice(0, 4).join('\n  ')}`);
  }
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`结果: ${pass} 通过 / ${fail} 失败（共 ${CASES.length} 项）`);
process.exit(fail === 0 ? 0 : 1);
