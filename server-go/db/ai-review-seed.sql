-- ============================================
-- AI 审阅系统 — 测试种子数据
-- 用于开发和演示各层过滤功能
-- ============================================

-- review_suggestions: 10 条测试案例
INSERT INTO review_suggestions (score_id, branch_id, section_id, layer, suggestion_type, priority, title, content, reason, status) VALUES

-- 1. 规则层拦截：无意义内容
(1, 1, 101, 'rule', 'auto_reject', 'P2', '无意义的测试内容',
 '111', '内容仅为数字重复，无音乐相关含义。规则层自动拦截。', 'rejected'),

-- 2. 规则层拦截：非专业词语
(1, 1, 102, 'rule', 'auto_reject', 'P2', '非音乐术语',
 '今天天气真好', '内容不包含任何音乐相关关键词（如节奏、音符、和弦等），规则层自动拦截。', 'rejected'),

-- 3. RAG 层匹配：与历史接受建议相似
(2, 2, 201, 'rag', 'auto_accept', 'P1', '第5小节力度标记修正',
 '第5小节力度从 f 改为 mf，与前后力度变化更协调', '与历史已接受的建议相似度 92%（历史ID=15），RAG 层自动通过。', 'accepted'),

-- 4. RAG 层匹配：与历史驳回建议相似
(2, 3, 202, 'rag', 'auto_reject', 'P2', '无根据的速度建议',
 '建议将第一乐章速度改为 140', '该用户此前 3 次关于速度大幅调整的建议均被驳回，RAG 层自动拦截。', 'rejected'),

-- 5. AI 层 P0 紧急：节拍错误
(1, 1, 103, 'ai', 'discuss', 'P0', '⚠ 第三小节节拍数异常',
 '第三小节共有 5 拍，但拍号为 4/4，超出 1 拍。',
 'AI 分析：第3小节各音符时值总和为 5 拍（4个四分音符+1个四分音符），与拍号 4/4 不符。建议：删除多余音符或将其中一个四分改为八分。', 'pending'),

-- 6. AI 层 P0 紧急：和声冲突
(1, 4, 104, 'ai', 'discuss', 'P0', '⚠ 和弦与调性冲突',
 '第8小节使用了 #4 音，但当前调性为 C 大调，无升号。',
 'AI 分析：#4（F#）在 C 大调中为变化音，与前后和声进行 I-IV-V 不兼容。建议：确认是否为临时转调，或改为 F 自然音。', 'pending'),

-- 7. AI 层 P1 建议：表情记号调整
(3, 5, 301, 'ai', 'discuss', 'P1', '第12小节建议加入渐强标记',
 '第11-13小节的旋律走向为上行模进，建议在第12小节加入 cresc. 标记。',
 'AI 分析：旋律从 G4 上行至 C5，且和声由 I 级转向 V 级，适合加入渐强以增强表现力。', 'pending'),

-- 8. AI 层 P1 建议：速度标记微调
(3, 6, 302, 'ai', 'discuss', 'P1', '第二乐章速度建议',
 '建议将第二乐章速度标记从 ♩=120 改为 ♩=108',
 'AI 分析：第二乐章为抒情风格，♩=120 偏快。参考同类作品第二乐章常见速度为 ♩=96-112。建议值 ♩=108 更合适。', 'pending'),

-- 9. AI 层 P2 可忽略：格式微调
(4, 7, 401, 'ai', 'info', 'P2', '第2小节排版建议',
 '第2小节的连音线弧线略高，建议微调。',
 'AI 分析：视觉排版优化，不影响音乐内容。优先级最低，可忽略。', 'dismissed'),

-- 10. AI 层 P2 可忽略：注释文字调整
(4, 7, 402, 'ai', 'info', 'P2', '演奏注释措辞建议',
 '将"此处渐慢"改为"rit."更符合惯例',
 'AI 分析：纯文本措辞调整，不影响记谱内容。', 'pending');

-- user_preferences: 3 条偏好数据
INSERT INTO user_preferences (user_id, preference_key, preference_value, weight) VALUES
(1, 'suggestion_type_weights',
 '{"auto_accept_weight": 0.7, "auto_reject_weight": 0.3, "discuss_threshold": 0.5}', 1.00),
(1, 'rejected_patterns',
 '["速度调整超过20BPM", "任意修改调号", "删除力度标记", "无依据的反复记号修改"]', 1.00),
(1, 'accepted_categories',
 '["力度细节调整", "发音法修正", "连音线位置调整", "临时变音号修正"]', 1.00);

-- merge_conflicts: 3 条冲突案例
INSERT INTO merge_conflicts (branch_id, score_id, section_id, conflict_type, main_content, branch_content, conflict_detail, merge_suggestion, status) VALUES

(8, 1, 105, 'note_content',
 '1=C 4/4| 3 3 4 5 | 5 4 3 2 |',
 '1=C 4/4| 3 3 5 5 | 5 4 3 2 |',
 '第1小节第3个音：主库为 4（fa），分支改为 5（sol）。和声分析：原为 IV 级音，改为 V 级音会改变和声色彩。',
 '建议接受分支的修改：5（sol）与后续旋律 5 4 3 2 形成更自然的五声音阶走向。',
 'pending'),

(8, 1, 105, 'tempo',
 '♩=120', '♩=108',
 '主库速度为 ♩=120（快板），分支改为 ♩=108（小快板），偏差 12 BPM。',
 '建议接受主库的 ♩=120，因该乐章标记为 Allegro，♩=120 更符合标准速度范围。',
 'pending'),

(9, 2, 203, 'key_signature',
 '1=C', '1=G',
 '主库为 C 大调，分支改为 G 大调（升 F）。',
 '调号变更属重大修改，需人工确认。如果全曲转调则可接受，如果仅局部则建议拒绝。',
 'pending');

-- ============================================
-- AI 合并冲突检测 — 测试分支数据
-- 分支 + branch_overrides，可通过 GET /api/merge/conflicts/:id 实时检测
-- ============================================

-- 分支 3：王同学-音符修正（score_id=1，修改第一乐章音符）
INSERT INTO branches (id, score_id, name, status, created_by) VALUES (3, 1, '王同学-音符修正', 'active', 2);

-- 覆盖 section 2（第一乐章）— 修改几处音符
INSERT INTO branch_overrides (branch_id, section_id, name, content, tempo, key_signature, time_signature) VALUES
(3, 2, '第一乐章（修正版）',
'1=C 4/4
| 3-~ 3 4 | 2-~ ~2 2 | 1- 3- | 5- 5 6 | 4- 4~ ~5 | 3-~ ~3 3 | 2- 2- | 1--- |',
NULL, '1=C', '4/4');

-- 覆盖 section 3（第二乐章速度冲突）
INSERT INTO branch_overrides (branch_id, section_id, name, content, tempo, key_signature, time_signature) VALUES
(3, 3, '第二乐章（速度调整）',
'1=C 3/8
| 5 1̅ 3 | 5 1̅ 3 | 4 4 4 | 3 3 3 | 2 2 2 | 1 1 1 | 5 5 5 | 4 4 4 | 3 3 3 | 6 6 6 | 5 5 5 | 4 4 4 |',
'♩=96', '1=C', '3/8');

-- 分支 4：李同学-调性实验（score_id=2，G大调第一乐章改为 D 大调）
INSERT INTO branches (id, score_id, name, status, created_by) VALUES (4, 2, '李同学-调性实验', 'active', 3);

-- 覆盖 section 9（G大调第一乐章 → D大调）
INSERT INTO branch_overrides (branch_id, section_id, name, content, tempo, key_signature, time_signature) VALUES
(4, 9, '第一乐章（D大调实验）',
'1=D 4/4
| 5- 1̅ 3 | 1̅ 3 5- | 4 4 4 4 | 3~ ~3 3 3 | 2- 2 2 | 1 1 5- | 5 1̅ 3 5 | 4- 4- |',
NULL, '1=D', '4/4');

-- 覆盖 section 10（第二乐章速度调整）
INSERT INTO branch_overrides (branch_id, section_id, name, content, tempo, key_signature, time_signature) VALUES
(4, 10, '第二乐章（速度调整）',
'1=C 3/4
| 3 5 5 | 6 5 3 | 2 3 4 | 5 6 7 | 1̅ 2̅ 3̅ | 4̅ 5̅ 6̅ | 3 4 5 | 6 7 1̅ | 2̅ 3̅ 4̅ | 5 6 7 | 1̅ 2̅ 3̅ | 4̅ 3̅ 2̅ |',
'♩=132', '1=C', '3/4');
