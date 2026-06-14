-- 乐谱审阅管理系统 - 数据库建表脚本
-- 使用 MySQL 8+ 版本

CREATE DATABASE IF NOT EXISTS score_review
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE score_review;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL COMMENT '用户名',
  password VARCHAR(200) DEFAULT '' COMMENT '密码',
  nickname VARCHAR(50) DEFAULT '' COMMENT '昵称',
  phone VARCHAR(20) DEFAULT '' COMMENT '手机号',
  phone_verified BOOLEAN DEFAULT FALSE COMMENT '手机已验证',
  avatar VARCHAR(10) COMMENT '头像表情',
  role ENUM('admin', 'reviewer', 'contributor') DEFAULT 'contributor' COMMENT '角色',
  title VARCHAR(100) COMMENT '职称/身份',
  bio TEXT COMMENT '个人简介',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 乐谱表
CREATE TABLE IF NOT EXISTS scores (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL COMMENT '乐谱名称',
  composer VARCHAR(100) NOT NULL COMMENT '作曲者',
  description TEXT COMMENT '描述',
  owner_id INT COMMENT '创建者/库主',
  is_public BOOLEAN DEFAULT FALSE COMMENT '是否公开',
  review_status ENUM('pending','working','approved','rejected') DEFAULT 'pending' COMMENT '审阅状态',
  reviewed_by INT COMMENT '审阅人',
  review_comment TEXT COMMENT '审阅意见',
  reviewed_at TIMESTAMP NULL COMMENT '审阅时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 乐谱协作者表
CREATE TABLE IF NOT EXISTS score_collaborators (
  id INT PRIMARY KEY AUTO_INCREMENT,
  score_id INT NOT NULL COMMENT '乐谱 ID',
  user_id INT NOT NULL COMMENT '协作者 ID',
  role ENUM('reviewer', 'contributor') NOT NULL DEFAULT 'contributor' COMMENT '角色',
  invited_by INT COMMENT '邀请人',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (score_id) REFERENCES scores(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uk_score_user (score_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 邀请/申请记录表
CREATE TABLE IF NOT EXISTS invitations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  score_id INT NOT NULL COMMENT '乐谱 ID',
  user_id INT NOT NULL COMMENT '目标用户',
  invited_by INT COMMENT '邀请人（申请时为空）',
  type ENUM('invite','apply') DEFAULT 'invite' COMMENT 'invite=邀请 apply=申请',
  status ENUM('pending','accepted','rejected') DEFAULT 'pending' COMMENT '待处理/已同意/已拒绝',
  message TEXT COMMENT '附言',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (score_id) REFERENCES scores(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 审阅记录表
CREATE TABLE IF NOT EXISTS reviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  score_id INT NOT NULL COMMENT '乐谱 ID',
  reviewer_id INT NOT NULL COMMENT '审阅人',
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '审阅结果',
  comment TEXT COMMENT '审阅意见',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (score_id) REFERENCES scores(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 乐段表（自引用树形结构）
CREATE TABLE IF NOT EXISTS sections (
  id INT PRIMARY KEY AUTO_INCREMENT,
  score_id INT NOT NULL COMMENT '所属乐谱',
  parent_id INT DEFAULT NULL COMMENT '父段落 ID',
  name VARCHAR(200) NOT NULL COMMENT '乐段名称',
  path VARCHAR(500) NOT NULL COMMENT '路径',
  type ENUM('folder', 'section') DEFAULT 'folder' COMMENT '类型',
  content TEXT COMMENT '乐谱内容',
  tempo VARCHAR(50) COMMENT '速度标记',
  key_signature VARCHAR(20) COMMENT '调号',
  time_signature VARCHAR(20) COMMENT '拍号',
  sort_order INT DEFAULT 0 COMMENT '排序',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (score_id) REFERENCES scores(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 乐段版本表（修改历史）
CREATE TABLE IF NOT EXISTS section_versions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  section_id INT NOT NULL COMMENT '乐段 ID',
  name VARCHAR(200) NOT NULL COMMENT '历史名称',
  content TEXT COMMENT '历史内容',
  tempo VARCHAR(50) COMMENT '历史速度',
  key_signature VARCHAR(20) COMMENT '历史调号',
  time_signature VARCHAR(20) COMMENT '历史拍号',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '版本时间',
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 标签表
CREATE TABLE IF NOT EXISTS tags (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE COMMENT '标签名',
  color VARCHAR(20) DEFAULT '#6366f1' COMMENT '标签颜色'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 乐谱标签关联表
CREATE TABLE IF NOT EXISTS score_tags (
  score_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (score_id, tag_id),
  FOREIGN KEY (score_id) REFERENCES scores(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 分支表
CREATE TABLE IF NOT EXISTS branches (
  id INT PRIMARY KEY AUTO_INCREMENT,
  score_id INT NOT NULL COMMENT '所属乐谱',
  name VARCHAR(100) NOT NULL COMMENT '分支名',
  status ENUM('active', 'merged', 'closed') DEFAULT 'active' COMMENT '状态',
  created_by INT COMMENT '创建者',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (score_id) REFERENCES scores(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 分支修改记录（分支上对乐段的改动）
CREATE TABLE IF NOT EXISTS branch_overrides (
  id INT PRIMARY KEY AUTO_INCREMENT,
  branch_id INT NOT NULL COMMENT '分支 ID',
  section_id INT NOT NULL COMMENT '乐段 ID',
  name VARCHAR(200) COMMENT '修改后的名称',
  content TEXT COMMENT '修改后的内容',
  tempo VARCHAR(50) COMMENT '修改后的速度',
  key_signature VARCHAR(20) COMMENT '修改后的调号',
  time_signature VARCHAR(20) COMMENT '修改后的拍号',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  section_id INT NOT NULL COMMENT '所属乐段',
  user_id INT NOT NULL COMMENT '评论者 ID',
  author VARCHAR(50) NOT NULL COMMENT '评论者名称（冗余）',
  content TEXT NOT NULL COMMENT '评论内容',
  status ENUM('open', 'resolved') DEFAULT 'open' COMMENT '状态',
  measure_ref VARCHAR(50) COMMENT '引用小节',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '接收通知的用户',
  type ENUM('merge','review','member_join','invite','invite_rejected') NOT NULL COMMENT '通知类型',
  score_id INT COMMENT '相关乐谱',
  actor_id INT COMMENT '触发动作的用户',
  message TEXT NOT NULL COMMENT '通知文字',
  is_read BOOLEAN DEFAULT FALSE COMMENT '是否已读',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (score_id) REFERENCES scores(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI 审阅建议表
CREATE TABLE IF NOT EXISTS review_suggestions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  score_id INT NOT NULL COMMENT '关联乐谱',
  branch_id INT DEFAULT NULL COMMENT '关联分支',
  section_id INT DEFAULT NULL COMMENT '关联乐段',
  layer ENUM('rule','rag','ai') NOT NULL COMMENT '过滤层级',
  suggestion_type ENUM('auto_accept','auto_reject','discuss','info') NOT NULL DEFAULT 'discuss' COMMENT '建议类型',
  priority ENUM('P0','P1','P2') DEFAULT 'P2' COMMENT '优先级',
  title VARCHAR(200) NOT NULL COMMENT '建议标题',
  content TEXT COMMENT '建议详细内容',
  reason TEXT COMMENT 'AI 判断理由',
  rag_context TEXT COMMENT 'RAG 检索到的参考上下文',
  status ENUM('pending','accepted','rejected','dismissed') DEFAULT 'pending' COMMENT '处理状态',
  created_by INT COMMENT 'AI 用户 ID',
  reviewed_by INT DEFAULT NULL COMMENT '处理人',
  reviewed_at TIMESTAMP NULL COMMENT '处理时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (score_id) REFERENCES scores(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户偏好学习表
CREATE TABLE IF NOT EXISTS user_preferences (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户 ID',
  preference_key VARCHAR(100) NOT NULL COMMENT '偏好键',
  preference_value JSON NOT NULL COMMENT '偏好值（JSON）',
  weight DECIMAL(5,2) DEFAULT 1.00 COMMENT '权重',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_user_key (user_id, preference_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 合并冲突记录表
CREATE TABLE IF NOT EXISTS merge_conflicts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  branch_id INT NOT NULL COMMENT '分支 ID',
  score_id INT NOT NULL COMMENT '乐谱 ID',
  section_id INT NOT NULL COMMENT '冲突乐段',
  conflict_type ENUM('note_content','tempo','key_signature','time_signature','metadata') NOT NULL COMMENT '冲突类型',
  main_content TEXT COMMENT '主分支内容',
  branch_content TEXT COMMENT '分支内容',
  conflict_detail TEXT COMMENT '冲突详细描述（AI 生成）',
  merge_suggestion TEXT COMMENT 'AI 合并建议',
  status ENUM('pending','resolved','accepted','overridden') DEFAULT 'pending' COMMENT '状态',
  resolved_by INT DEFAULT NULL COMMENT '解决人',
  resolved_at TIMESTAMP NULL COMMENT '解决时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (score_id) REFERENCES scores(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
