/**
 * 写操作验证：在 Node 与 Go 两个后端上执行**同样的写请求**，比对响应与副作用。
 *
 * 与 contract-diff.mjs 的分工：
 *   - contract-diff 只跑只读/纯计算端点，可反复执行
 *   - 本脚本会真正改库，因此每次运行后都会**回滚自己创建的数据**
 *
 * 用法：node scripts/write-verify.mjs
 *   （两个后端都需在跑：Node 3001 / Go 3002，且已登录用户 张教授/1234）
 */

const NODE_BASE = 'http://localhost:3001';
const GO_BASE = 'http://localhost:3002';

async function call(base, { method, path, body, token }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status: res.status, text, json };
}

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? '  ' + detail : ''}`); }
}

console.log('── 登录取 token ──');
const creds = { name: '张教授', password: '1234' };
const [nodeLogin, goLogin] = await Promise.all([
  call(NODE_BASE, { method: 'POST', path: '/api/auth/login', body: creds }),
  call(GO_BASE, { method: 'POST', path: '/api/auth/login', body: creds }),
]);
if (nodeLogin.status !== 200 || goLogin.status !== 200) {
  console.log(`登录失败: Node=${nodeLogin.status} Go=${goLogin.status}`);
  console.log('  Node:', nodeLogin.text.slice(0, 120));
  console.log('  Go  :', goLogin.text.slice(0, 120));
  process.exit(1);
}
const nodeToken = nodeLogin.json.token;
const goToken = goLogin.json.token;
console.log(`✅ 双方登录成功`);

console.log('\n── 鉴权行为 ──');
// ⚠ 探测请求必须用**空 body**：Node 版的写端点没有鉴权，
// 若发送合法的 {name, composer} 会真的在数据库里建出一条脏数据。
// 空 body 在 Node 上会被参数校验拦下（400），在 Go 上会被鉴权拦下（401）。
const probeBody = {};
const noAuth = await call(NODE_BASE, { method: 'POST', path: '/api/scores', body: probeBody });
console.log(`   Node 无 token 创建乐谱 → ${noAuth.status}（Node 未鉴权，属既有缺陷）`);

const goNoAuth = await call(GO_BASE, { method: 'POST', path: '/api/scores', body: probeBody });
check('Go 无 token 创建乐谱应 401', goNoAuth.status === 401, `实际 ${goNoAuth.status}`);

const goBadToken = await call(GO_BASE, { method: 'POST', path: '/api/scores', body: probeBody, token: 'bad.token' });
check('Go 无效 token 应 401', goBadToken.status === 401, `实际 ${goBadToken.status}`);

const goAuthed = await call(GO_BASE, { method: 'POST', path: '/api/scores', body: {}, token: goToken });
check('Go 有效 token + 空参应 400（鉴权已通过，进到校验层）', goAuthed.status === 400, `实际 ${goAuthed.status}`);

console.log('\n── 写操作响应对比 ──');
const marker = '契约写入测试-' + Date.now();
const payload = { name: marker, composer: '测试作曲', description: '写入验证', is_public: false };

// Node 侧用无 token 调用（其端点未鉴权），Go 侧带 token
const nodeCreate = await call(NODE_BASE, { method: 'POST', path: '/api/scores', body: payload });
const goCreate = await call(GO_BASE, { method: 'POST', path: '/api/scores', body: payload, token: goToken });

check('创建乐谱状态码一致', nodeCreate.status === goCreate.status,
  `Node=${nodeCreate.status} Go=${goCreate.status}`);
check('创建乐谱响应结构一致',
  JSON.stringify(Object.keys(nodeCreate.json || {}).sort()) === JSON.stringify(Object.keys(goCreate.json || {}).sort()),
  `Node=${JSON.stringify(nodeCreate.json)} Go=${JSON.stringify(goCreate.json)}`);

const nodeId = nodeCreate.json?.id;
const goId = goCreate.json?.id;
console.log(`   新建 id: Node=${nodeId} Go=${goId}`);

// 读取刚创建的记录，比对完整行
if (nodeId && goId) {
  const [nodeGet, goGet] = await Promise.all([
    call(NODE_BASE, { method: 'GET', path: `/api/scores/${nodeId}` }),
    call(GO_BASE, { method: 'GET', path: `/api/scores/${goId}` }),
  ]);
  // id 必然不同，比对时剔除
  delete nodeGet.json?.id;
  delete goGet.json?.id;
  const same = JSON.stringify(nodeGet.json) === JSON.stringify(goGet.json);
  check('新建记录回读内容一致（忽略自增 id）', same,
    same ? '' : `\n     Node=${JSON.stringify(nodeGet.json)}\n     Go  =${JSON.stringify(goGet.json)}`);
}

console.log('\n── 清理测试数据 ──');
for (const [label, base, id, token] of [['Node', NODE_BASE, nodeId, nodeToken], ['Go', GO_BASE, goId, goToken]]) {
  if (!id) continue;
  const del = await call(base, { method: 'DELETE', path: `/api/scores/${id}`, token });
  console.log(`   ${label} 删除 id=${id} → ${del.status}`);
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
