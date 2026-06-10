-- ==========================================
-- 乐段模块 SQL 语句（核心：树形结构）
-- ==========================================

-- 查询乐谱的顶级乐段（根节点）
-- SELECT * FROM sections WHERE score_id = ? AND parent_id IS NULL ORDER BY sort_order;

-- 查询某个乐段的子乐段
-- SELECT * FROM sections WHERE parent_id = ? ORDER BY sort_order;

-- 递归查询完整树形结构（MySQL 8+）
-- WITH RECURSIVE section_tree AS (
--   SELECT * FROM sections WHERE score_id = ? AND parent_id IS NULL
--   UNION ALL
--   SELECT s.* FROM sections s
--   JOIN section_tree st ON s.parent_id = st.id
-- )
-- SELECT * FROM section_tree;

-- 查询单个乐段
-- SELECT * FROM sections WHERE id = ?;

-- 新增乐段
-- INSERT INTO sections (score_id, parent_id, name, path, type, content, sort_order)
-- VALUES (?, ?, ?, ?, ?, ?, ?);

-- 更新乐段
-- UPDATE sections SET name = ?, content = ?, tempo = ?, key_signature = ?, time_signature = ?
-- WHERE id = ?;

-- 删除乐段（级联删除子乐段）
-- DELETE FROM sections WHERE id = ?;
