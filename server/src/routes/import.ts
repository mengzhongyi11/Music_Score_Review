/**
 * MusicXML 导入路由
 * 上传 .xml 文件内容，解析为简谱并创建乐谱
 */
import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// ============================================================
// MusicXML → 简谱 解析（精简版，复用 convert-musicxml.ts 逻辑）
// ============================================================

const KEY_SCALES: Record<string, string[]> = {
  'C':['c','d','e','f','g','a','b'],'G':['g','a','b','c','d','e','f#'],
  'D':['d','e','f#','g','a','b','c#'],'A':['a','b','c#','d','e','f#','g#'],
  'E':['e','f#','g#','a','b','c#','d#'],'B':['b','c#','d#','e','f#','g#','a#'],
  'F':['f','g','a','bb','c','d','e'],'Bb':['bb','c','d','eb','f','g','a'],
  'Eb':['eb','f','g','ab','bb','c','d'],'Ab':['ab','bb','c','db','eb','f','g'],
  'Db':['db','eb','f','gb','ab','bb','c'],
};
const NI: Record<string,number> = {'c':0,'d':1,'e':2,'f':3,'g':4,'a':5,'b':6};
const FIFTHS_TO_KEY: Record<number, string> = {0:'C',1:'G',2:'D',3:'A',4:'E',5:'B',6:'F#',7:'C#','-1':'F','-2':'Bb','-3':'Eb','-4':'Ab','-5':'Db','-6':'Gb','-7':'Cb'};

function parseMusicXML(xml: string) {
  const title = xml.match(/<work-title>([^<]+)<\/work-title>/)?.[1] || '导入乐谱';
  const composer = xml.match(/<creator type="composer">([^<]+)<\/creator>/)?.[1] || '';
  const fifths = parseInt(xml.match(/<fifths>(-?\d+)<\/fifths>/)?.[1] || '0');
  const beats = parseInt(xml.match(/<beats>(\d+)<\/beats>/)?.[1] || '4');
  const beatT = parseInt(xml.match(/<beat-type>(\d+)<\/beat-type>/)?.[1] || '4');
  const tempo = xml.match(/<words[^>]*>([^<]+)<\/words>/)?.[1] || '';

  const measures: string[] = [];
  const measRe = /<measure[^>]*>([\s\S]*?)<\/measure>/g;
  let m: RegExpExecArray | null;
  while ((m = measRe.exec(xml)) !== null) {
    const mc = m[1];
    const notes: string[] = [];
    const noteRe = /<note>([\s\S]*?)<\/note>/g;
    let n: RegExpExecArray | null;
    while ((n = noteRe.exec(mc)) !== null) {
      const nc = n[1];
      const isRest = nc.includes('<rest');
      const st = nc.match(/<step>([A-G])<\/step>/)?.[1];
      const al = nc.match(/<alter>(-?\d+)<\/alter>/)?.[1];
      const oc = nc.match(/<octave>(\d+)<\/octave>/)?.[1];
      const tp = nc.match(/<type>(\w+)<\/type>/)?.[1];
      const hasDot = nc.includes('<dot');

      if (isRest) { notes.push('0'); continue; }
      if (!st || !oc) continue;

      const key = FIFTHS_TO_KEY[fifths] || 'C';
      const { txt } = noteToJianpu(st, al ? parseInt(al) : undefined, parseInt(oc), tp || 'quarter', hasDot, key);
      notes.push(txt);
    }
    measures.push(notes.join(' '));
  }

  return { title, composer, key: `1=${FIFTHS_TO_KEY[fifths] || 'C'}`, timeSignature: `${beats}/${beatT}`, tempo, measures };
}

const TYPE_TO_DUR: Record<string, number> = {'whole':1,'half':2,'quarter':4,'eighth':8,'16th':16,'32nd':32};

function noteToJianpu(step: string, alter: number|undefined, octave: number, type: string, hasDot: boolean, key: string): { txt: string } {
  const s = KEY_SCALES[key] || KEY_SCALES['C'];
  const acc = alter === 1 ? '#' : alter === -1 ? 'b' : '';
  const pn = step.toLowerCase() + acc;

  for (let d = 0; d < 7; d++) {
    const sn = s[d];
    const bsn = sn.length === 1 ? sn : sn[0];
    let eo = 4;
    for (let i = 1; i <= d; i++) {
      const p = s[i-1].length === 1 ? s[i-1] : s[i-1][0];
      const c = s[i].length === 1 ? s[i] : s[i][0];
      if ((NI[c]??0) <= (NI[p]??0)) eo++;
    }
    if (sn === pn) {
      const dots = octave - eo;
      let r = '';
      if (dots > 0) r += '˙'.repeat(dots);
      if (dots < 0) r += '.'.repeat(Math.abs(dots));
      r += String(d + 1);
      const dur = TYPE_TO_DUR[type] || 4;
      if (dur <= 1) r += '---';
      else if (dur <= 2) r += '-';
      else if (dur >= 32) r += '___';
      else if (dur >= 16) r += '__';
      else if (dur >= 8) r += '_';
      if (hasDot) r += '•';
      return { txt: r };
    }
    if (bsn === step.toLowerCase() && sn !== pn) {
      let r = acc || '';
      const dots = octave - eo;
      if (dots > 0) r += '˙'.repeat(dots);
      if (dots < 0) r += '.'.repeat(Math.abs(dots));
      r += String(d + 1);
      const dur = TYPE_TO_DUR[type] || 4;
      if (dur <= 1) r += '---';
      else if (dur <= 2) r += '-';
      else if (dur >= 32) r += '___';
      else if (dur >= 16) r += '__';
      else if (dur >= 8) r += '_';
      if (hasDot) r += '•';
      return { txt: r };
    }
  }
  return { txt: '1' };
}

// ============================================================
// POST /api/import — 导入 MusicXML
// body: { xml: string, score_id?: number }
// ============================================================

router.post('/', async (req: Request, res: Response) => {
  try {
    const { xml, scoreId } = req.body;
    if (!xml) return res.status(400).json({ message: '请提供 MusicXML 内容' });

    const data = parseMusicXML(xml);
    if (data.measures.length === 0) return res.status(400).json({ message: '未解析到有效小节' });

    // 提取文字标注（direction/words）
    const textNotes: string[] = [];
    const wordRe = /<direction[^>]*>[\s\S]*?<words[^>]*>([^<]+)<\/words>[\s\S]*?<\/direction>/g;
    let wm: RegExpExecArray | null;
    while ((wm = wordRe.exec(xml)) !== null) {
      const txt = wm[1].trim();
      if (txt && !/^\d+$/.test(txt) && !txt.startsWith('♩')) textNotes.push(txt);
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [maxScore] = await connection.query('SELECT MAX(id) as mx FROM scores');
      const nextScoreId = ((maxScore as any[])[0]?.mx || 0) + 1;
      const [maxSec] = await connection.query('SELECT MAX(id) as mx FROM sections');
      let nextSecId = ((maxSec as any[])[0]?.mx || 0) + 1;
      const [maxBr] = await connection.query('SELECT MAX(id) as mx FROM branches');
      const nextBrId = ((maxBr as any[])[0]?.mx || 0) + 1;

      const keyName = data.key.replace('1=', '');
      const rawKey = FIFTHS_TO_KEY[Object.entries(FIFTHS_TO_KEY).find(([_,v]) => v === keyName)?.[0] as any] || keyName;

      if (scoreId) {
        // 导入到分支
        await connection.query(
          'INSERT INTO branches (id, score_id, name, status, created_by) VALUES (?, ?, ?, ?, ?)',
          [nextBrId, scoreId, `导入-${data.title}`, 'active', 1]
        );
        // 每小节作为 override
        for (let i = 0; i < data.measures.length; i++) {
          const secId = nextSecId++;
          const content = `${data.key} ${data.timeSignature}\n| ${data.measures[i]} |`;
          await connection.query(
            `INSERT INTO branch_overrides (branch_id, section_id, name, content, tempo, key_signature, time_signature)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [nextBrId, secId, `第${i+1}小节`, content, data.tempo || '', rawKey, data.timeSignature]
          );
        }
        await connection.commit();
        res.json({ message: `已导入到分支「导入-${data.title}」(${data.measures.length}个小节)`, branchId: nextBrId, scoreId, title: data.title });
      } else {
        // 空库：直接创建乐谱，按小节分割
        const isPublic = 0;
        await connection.query(
          'INSERT INTO scores (id, name, composer, description, owner_id, is_public) VALUES (?, ?, ?, ?, ?, ?)',
          [nextScoreId, data.title, data.composer, `从 MusicXML 导入 · ${data.measures.length} 个小节`, 1, isPublic]
        );
        // 文件夹：乐章
        const folderId = nextSecId++;
        await connection.query(
          "INSERT INTO sections (id, score_id, parent_id, name, path, type, sort_order) VALUES (?, ?, NULL, '乐章', '/movements', 'folder', 1)",
          [folderId, nextScoreId]
        );
        // 文字标注文件夹
        if (textNotes.length > 0) {
          const textFolderId = nextSecId++;
          await connection.query(
            "INSERT INTO sections (id, score_id, parent_id, name, path, type, sort_order) VALUES (?, ?, NULL, '演奏说明', '/notes', 'folder', 2)",
            [textFolderId, nextScoreId]
          );
          const textSecId = nextSecId++;
          await connection.query(
            "INSERT INTO sections (id, score_id, parent_id, name, path, type, content, sort_order) VALUES (?, ?, ?, '标注', '/notes/markings', 'section', ?, 1)",
            [textSecId, nextScoreId, textFolderId, textNotes.join('\n')]
          );
        }
        // 每小节一个乐段
        for (let i = 0; i < data.measures.length; i++) {
          const secId = nextSecId++;
          const content = `${data.key} ${data.timeSignature}\n| ${data.measures[i]} |`;
          await connection.query(
            `INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order)
             VALUES (?, ?, ?, ?, ?, 'section', ?, ?, ?, ?, ?)`,
            [secId, nextScoreId, folderId, `第${i+1}小节`, `/measures/${i+1}`, content, data.tempo || '', rawKey, data.timeSignature, i+1]
          );
        }
        await connection.query('INSERT INTO score_tags (score_id, tag_id) VALUES (?, 1)', [nextScoreId]);
        await connection.commit();
        res.json({ message: `已导入乐谱「${data.title}」(${data.measures.length}个小节)`, scoreId: nextScoreId, title: data.title });
      }
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('导入失败:', err);
    res.status(500).json({ message: '导入失败', error: String(err) });
  }
});

export default router;
