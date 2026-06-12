-- 乐谱审阅管理系统 - 初始数据
USE score_review;

-- 插入用户（不同身份角色）
INSERT INTO users (id, name, avatar, role, title, bio) VALUES
(1, '张教授', '', 'reviewer', '音乐学院教授 · 审阅人', '中央音乐学院教授，从事音乐理论研究 20 年，擅长古典乐谱分析与审阅。'),
(2, '李同学', '', 'contributor', '作曲系研究生 · 贡献者', '作曲系在读研究生，主修交响乐创作，业余参与乐谱数字化项目。'),
(3, '王老师', '', 'reviewer', '乐团指挥 · 审阅人', '国家交响乐团常任指挥，擅长从演奏角度审阅乐谱的可行性。'),
(4, '陈同学', '', 'contributor', '音乐系本科生 · 贡献者', '音乐系大三学生，主修钢琴表演，正在学习乐谱分析。'),
(5, '管理员', '', 'admin', '系统管理员', '系统管理员，负责平台维护与用户管理。');

-- 插入乐谱
INSERT INTO scores (id, name, composer, description, owner_id) VALUES
(1, '第五交响曲', '贝多芬', 'c小调第五交响曲 Op.67，创作于1804-1808年，是古典音乐中最著名的作品之一。', 1),
(2, 'G大调弦乐小夜曲', '莫扎特', 'G大调弦乐小夜曲 K.525，创作于1787年，莫扎特最受欢迎的作品之一。', 1),
(3, '降E大调夜曲', '肖邦', '降E大调夜曲 Op.9 No.2，创作于1830-1831年，肖邦最著名的夜曲作品。', 3);

-- 插入乐段
-- 贝多芬 第五交响曲
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(1, 1, NULL,   '乐章',       '/movements',    'folder', NULL, NULL, NULL, NULL, 1),
(2, 1, 1,      '第一乐章',    '/movements/1',  'section', '1=C 4/4\n| 3-~ 3 3 | 2-~ ~2 2 | 1- 0 5 | 5- 5~ ~5 | 4- 4~ ~4 | 3-~ ~3 0 | 2- 2- | 1---', 'Allegro con brio', 'c', '4/4', 1),
(3, 1, 1,      '第二乐章',    '/movements/2',  'section', '1=C 3/8\n| 5 1̅ 3 | 5 1̅ 3 | 4 4 4 | 3 3 3 | 2 2 2 | 1 1 1 | 5 5 5 | 4 4 4 | 3 3 3 | 6 6 6 | 5 5 5 | 4 4 4 |', 'Andante con moto', 'Ab', '3/8', 2),
(4, 1, 1,      '第三乐章',    '/movements/3',  'section', '1=C 3/4\n| 3 6 1̅ | 3 6 1̅ | 4 7 2̅ | 4 7 2̅ | 5 1̅ 3̅ | 5 1̅ 3̅ | 3 4 5 | 6 7 1̅ | 2̅ 3̅ 4̅ | 5̅ 6̅ 7̅ |', 'Scherzo: Allegro', 'c', '3/4', 3),
(5, 1, 1,      '第四乐章',    '/movements/4',  'section', '1=C 4/4\n| 1̅ 3 5 - | 1̅ 3 5 - | 2̅ 4 6 - | 2̅ 4 6 - | 3̅ 5 7 - | 3̅ 5 7 - | 1̅ 2̅ 3̅ 4̅ | 5̅ 6̅ 7̅ 1̅̅ | 2̅ 3̅ 4̅ 5̅ | 6̅ 7̅ 1̅̅ 2̅̅ |', 'Allegro', 'C', '4/4', 4),
(6, 1, NULL,   '配器说明',    '/instrumentation', 'section', '木管：2支长笛、2支双簧管、2支单簧管、2支大管\n铜管：2支圆号、2支小号、3支长号\n打击乐：定音鼓\n弦乐：第一小提琴、第二小提琴、中提琴、大提琴、低音提琴', NULL, NULL, NULL, 2),
(7, 1, NULL,   '演奏注释',    '/notes',         'section', '全曲约30-35分钟。第一乐章是奏鸣曲式，以著名的「命运动机」开始。', NULL, NULL, NULL, 3);

-- 莫扎特 G大调弦乐小夜曲
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(8, 2, NULL,   '乐章',       '/movements',    'folder', NULL, NULL, NULL, NULL, 1),
(9, 2, 8,      '第一乐章',    '/movements/1',  'section', '1=G 4/4\n| 5- 1̅ 3 | 1̅ 3 5- | 4 4 4 4 | 3~ ~3 3 3 | 2- 2 2 | 1 1 5- | 5 1̅ 3 5 | 4- 4- |', 'Allegro', 'G', '4/4', 1),
(10, 2, 8,     '第二乐章',    '/movements/2',  'section', '1=C 3/4\n| 3 5 5 | 6 5 3 | 2 3 4 | 5 6 7 | 1̅ 2̅ 3̅ | 4̅ 5̅ 6̅ | 3 4 5 | 6 7 1̅ | 2̅ 3̅ 4̅ | 5 6 7 | 1̅ 2̅ 3̅ | 4̅ 3̅ 2̅ |', 'Romanza: Andante', 'C', '3/4', 2),
(11, 2, 8,     '第三乐章',    '/movements/3',  'section', '1=G 3/4\n| 5 4 3 | 2 1 7 | 1 2 3 | 4 5 6 | 7 1̅ 2̅ | 3̅ 2̅ 1̅ | 5 4 3 | 2 1 7 | 1 2 3 | 4 3 2 | 1 7 6 | 5 - - |', 'Menuetto: Allegretto', 'G', '3/4', 3),
(12, 2, 8,     '第四乐章',    '/movements/4',  'section', '1=G 2/2\n| 5 1̅ 3 5 | 1̅ 3 5 1̅̈ | 2̅ 4 6 2̅ | 2̅ 4 6 2̅ | 5 1̅ 3 5 | 1̅ 3 5 1̅ | 4 2 5 3 | 6 4 7 5 | 1̅ 6 2̅ 7 | 5 4 3 2 | 1 - - - |', 'Rondo: Allegro', 'G', '2/2', 4);

-- 肖邦 降E大调夜曲
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(13, 3, NULL,  '夜曲',       '/nocturne',     'folder', NULL, NULL, NULL, NULL, 1),
(14, 3, 13,    '主题 A',     '/nocturne/a',   'section', '1=bE 12/8\n| 5 3 2 3 5 3 2 3 | 6 4 3 4 6 4 3 4 | 7 5 4 5 7 5 4 5 | 1̅ 6 5 6 1̅ 6 5 6 | 5 3 2 3 5 3 2 3 | 4 2 1 2 4 2 1 2 | 3 1 7 1 3 1 7 1 | 2 7 6 7 2 7 6 7 |', 'Andante', 'bE', '12/8', 1),
(15, 3, 13,    '主题 B',     '/nocturne/b',   'section', '1=bE 12/8\n| 1̅ 7 6 7 1̅ 5 3 1̅ | 7 6 5 6 7 3 2 1̅ | 6 5 4 5 6 2 7 6 | 5 4 3 4 5 1̅ 7 6 | 1̅ 7 6 7 1̅ 5 3 1̅ | 7 6 5 6 7 3 2 1̅ | 6 5 4 5 6 2 7 6 | 5 4 3 4 5 - - - |', 'Più mosso', 'bE', '12/8', 2),
(16, 3, 13,    '主题 A 再现', '/nocturne/a-recap', 'section', '1=bE 12/8\n| 5 3 2 3 5 3 2 3 | 6 4 3 4 6 4 3 4 | 7 5 4 5 7 5 4 5 | 1̅ 6 5 6 1̅ 6 5 6 | 5 3 2 3 5 3 2 3 | 4 2 1 2 4 2 1 2 | 3 1 7 1 3 1 7 1 | 2 7 6 7 2 7 6 7 | 1 - - - - - - - |', 'Andante', 'bE', '12/8', 3);

-- 插入评论（关联用户）
INSERT INTO comments (id, section_id, user_id, author, content, status, measure_ref) VALUES
(1, 2, 1, '张教授', '第一乐章的命运动机力度应该更强一些，建议标注 f。', 'open', '第1-4小节'),
(2, 2, 2, '李同学', '同意张教授，这里是全曲的核心动机，确实需要突出。', 'open', '第1-4小节'),
(3, 5, 3, '王老师', '第四乐章进入太快了，需要注意速度转换的自然衔接。', 'resolved', '第1-8小节'),
(4, 9, 1, '张教授', '第一乐章的主题对比可以更鲜明一些。', 'open', '第1-8小节'),
(5, 14, 2, '李同学', '右手旋律的装饰音可以更自由一些，rubato 幅度稍大。', 'open', '第2-4小节'),
(6, 15, 3, '王老师', '主题 B 的力度对比可以更明显，mf 到 p 的跨度大一些。', 'resolved', '第1-4小节');

-- 插入版本历史（模拟修改记录）
INSERT INTO section_versions (section_id, name, content, tempo, key_signature, time_signature, created_at) VALUES
(2, '第一乐章', '1=C 4/4\n| 3- 3 3 | 2- 2 2 | 1 1 1- |', 'Allegro', 'c', '4/4', '2026-06-07 10:00:00'),
(2, '第一乐章', '1=C 4/4\n| 3- 3 3 | 2- 2 2- | 1- 1- |', 'Allegro con brio', 'c', '4/4', '2026-06-08 14:30:00'),
(9, '第一乐章', '1=G 4/4\n| 5 1̅ 3 5 | 5 1̅ 3 5 | 4 4 4 3 |', 'Allegro', 'G', '4/4', '2026-06-06 09:15:00'),
(9, '第一乐章', '1=G 4/4\n| 5 1̅ 3 5 | 5 1̅ 3 5 | 4 4 4 4 | 2 2 2 2 |', 'Allegro', 'G', '4/4', '2026-06-08 11:00:00');

-- 插入分支
INSERT INTO branches (id, score_id, name, status, created_by) VALUES
(1, 1, '张教授-力度修改', 'active', 1),
(2, 1, '李同学-节奏实验', 'active', 2);

-- 分支上的修改（override main 的内容）
INSERT INTO branch_overrides (branch_id, section_id, name, content, tempo, key_signature, time_signature) VALUES
(1, 2, '第一乐章（力度增强版）', '1=C 4/4\n| 3 3 3 -ff | 2 2 2 -ff | 1 - - -ff |', 'Allegro con brio (ff)', 'c', '2/4'),
(1, 4, '第三乐章（力度调整）', '1=C 3/4\n| 3 6 1̅ -f | 3 6 1̅ -f |', 'Scherzo: Allegro (f)', 'c', '3/4'),
(2, 2, '第一乐章（节奏变化）', '1=C 4/4\n| 3 3 3 - | 2 - 2 - | 1 - - - | 5̅ - 5̅ - |', 'Allegro con brio (syncopated)', 'c', '4/4');

-- 插入协作者
INSERT INTO score_collaborators (score_id, user_id, role, invited_by) VALUES
(1, 2, 'contributor', 1),
(1, 3, 'reviewer', 1),
(1, 4, 'contributor', 1),
(2, 2, 'contributor', 1),
(2, 4, 'reviewer', 1),
(3, 2, 'contributor', 3);

-- 插入标签
INSERT INTO tags (id, name, color) VALUES
(1, '古典', '#3b82f6'),
(2, '交响曲', '#2563eb'),
(3, '浪漫', '#1d4ed8'),
(4, '夜曲', '#60a5fa'),
(5, '小夜曲', '#93c5fd'),
(6, '奏鸣曲', '#3b82f6');

-- 乐谱打标签
INSERT INTO score_tags (score_id, tag_id) VALUES
(1, 1), (1, 2),
(2, 1), (2, 5),
(3, 3), (3, 4);

-- ═══════════════════════════════════
-- 新增：从 乐谱/ 文件夹 MusicXML 导入
-- ═══════════════════════════════════

-- 卡农 — 帕赫贝尔 (Pachelbel)
INSERT INTO scores (id, name, composer, description, owner_id) VALUES
(4, '卡农', '帕赫贝尔 (Pachelbel)', '约翰·帕赫贝尔《D大调卡农与吉格》中的卡农部分，约创作于1680年。', 1);
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(17, 4, NULL, '卡农', '/movement', 'section', '1=D 4/4 Andante\n| 1 .5 .6 .3 | .4 .1 .4 .5 | 1 .5 .6 .3 | .4 .1 .4 .5 |\n| .6 .3 .4 .1 | .5 .6 .3 .4 | .1 .4 .5 1 | .5 .6 .3 .4 |', 'Andante', 'D', '4/4', 1);
INSERT INTO score_tags (score_id, tag_id) VALUES (4, 1);

-- C大调前奏曲 BWV 846 — 巴赫 (J.S. Bach)
INSERT INTO scores (id, name, composer, description, owner_id) VALUES
(5, 'C大调前奏曲', '巴赫 (J.S. Bach)', '巴赫《平均律钢琴曲集》第一卷第一首，BWV 846。', 1);
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(18, 5, NULL, 'C大调前奏曲', '/movement', 'section', '1=C 4/4\n| 1 2 3 4 | 5 6 7 ˙1 |', '', 'C', '4/4', 1);
INSERT INTO score_tags (score_id, tag_id) VALUES (5, 1);

-- 月光奏鸣曲 第一乐章 — 贝多芬 (Beethoven)
INSERT INTO scores (id, name, composer, description, owner_id) VALUES
(6, '月光奏鸣曲 · 第一乐章', '贝多芬 (Beethoven)', '贝多芬升c小调第十四钢琴奏鸣曲 Op.27 No.2「月光」第一乐章。', 1);
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(19, 6, NULL, '月光奏鸣曲 · 第一乐章', '/movement', 'section', '1=E 2/2 Adagio sostenuto\n| .6 1 3 6 | .5 1 3- | #.4 .6 2 #4 | .3 .6 1- |\n| .6 1 3 6 | .5 1 3- | #.4 .6 2 #4 | .3 .6 1- |', 'Adagio sostenuto', 'E', '2/2', 1);
INSERT INTO score_tags (score_id, tag_id) VALUES (6, 1), (6, 3);

-- 欢乐颂 — 贝多芬 (Beethoven)
INSERT INTO scores (id, name, composer, description, owner_id) VALUES
(7, '欢乐颂', '贝多芬 (Beethoven)', '贝多芬第九交响曲第四乐章「欢乐颂」主题，创作于1822-1824年。', 1);
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(20, 7, NULL, '欢乐颂', '/movement', 'section', '1=D 4/4 Allegro\n| 1 2 3 4 | 5 5 4 3 | 2 1 2 3 | 4 4 3 2 |\n| 1 2 3 1 | 2 3 4 5 | 3 1 2 3 | 1- 0- |', 'Allegro', 'D', '4/4', 1);
INSERT INTO score_tags (score_id, tag_id) VALUES (7, 1), (7, 2);

-- ═══════════════════════════════════
-- 新增：示例谱子 — 按小节分乐段
-- ═══════════════════════════════════

INSERT INTO scores (id, name, composer, description, owner_id) VALUES
(8, '音符时值练习曲', '示例作曲家', '音符时值练习曲 — 10个小节，从全音符到三十二分音符的完整时值练习。', 1);
INSERT INTO score_tags (score_id, tag_id) VALUES (8, 1);

INSERT INTO sections (id, score_id, parent_id, name, path, type, content, sort_order) VALUES
(21, 8, NULL, '时值练习', '/exercises', 'folder', NULL, 1);

INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(22, 8, 21, '第1小节·全音符', '/exercises/1', 'section', '1=C 4/4\n| 1--- |', '', 'C', '4/4', 1);
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(23, 8, 21, '第2小节·二分音符', '/exercises/2', 'section', '1=C 4/4\n| 2- 3- |', '', 'C', '4/4', 2);
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(24, 8, 21, '第3小节·四分音符', '/exercises/3', 'section', '1=C 4/4\n| 1 2 3 4 |', '', 'C', '4/4', 3);
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(25, 8, 21, '第4小节·八分音符', '/exercises/4', 'section', '1=C 4/4\n| 1_ 2_ 3_ 4_ 5_ 6_ 7_ ˙1_ |', '', 'C', '4/4', 4);
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(26, 8, 21, '第5小节·十六分音符', '/exercises/5', 'section', '1=C 4/4\n| ˙1__ ˙2__ ˙3__ ˙4__ ˙5__ ˙4__ ˙3__ ˙2__ ˙1__ 7__ 6__ 5__ 4__ 3__ 2__ 1__ |', '', 'C', '4/4', 5);
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(27, 8, 21, '第6小节·三十二分音符', '/exercises/6', 'section', '1=C 4/4\n| 1___ 2___ 3___ 4___ 5___ 6___ 7___ ˙1___ ˙2___ ˙3___ ˙4___ ˙5___ ˙6___ ˙5___ ˙4___ ˙3___ |', '', 'C', '4/4', 6);
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(28, 8, 21, '第7小节·附点音符', '/exercises/7', 'section', '1=C 4/4\n| 1-• 2 |', '', 'C', '4/4', 7);
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(29, 8, 21, '第8小节·混合时值', '/exercises/8', 'section', '1=C 4/4\n| 1 2_ 3_ 4__ 5__ 6__ 7__ ˙1 |', '', 'C', '4/4', 8);
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(30, 8, 21, '第9小节·休止符', '/exercises/9', 'section', '1=C 4/4\n| 0 ˙1 0 ˙2_ ˙3_ 0 |', '', 'C', '4/4', 9);
INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES
(31, 8, 21, '第10小节', '/exercises/10', 'section', '1=C 4/4\n| 1- 1- |', '', 'C', '4/4', 10);
