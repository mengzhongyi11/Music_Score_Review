-- ==========================================
-- 评论模块 SQL 语句
-- ==========================================

-- 查询乐段的所有评论（按时间降序）
-- SELECT * FROM comments WHERE section_id = ? ORDER BY created_at DESC;

-- 新增评论
-- INSERT INTO comments (section_id, author, content, status, measure_ref)
-- VALUES (?, ?, ?, 'open', ?);

-- 更新评论状态
-- UPDATE comments SET status = ? WHERE id = ?;

-- 删除评论
-- DELETE FROM comments WHERE id = ?;
