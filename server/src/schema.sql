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
