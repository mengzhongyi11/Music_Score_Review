/**
 * MusicXML → 简谱记法 转换脚本
 * 将 乐谱/ 目录下的 MusicXML 文件转为项目使用的简谱格式
 *
 * 使用: npx tsx scripts/convert-musicxml.ts
 */
import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// 调号映射表（同 VexFlowWrapper.ts）
// ============================================================

const KEY_SCALES: Record<string, string[]> = {
  'C':  ['c', 'd', 'e', 'f', 'g', 'a', 'b'],
  'G':  ['g', 'a', 'b', 'c', 'd', 'e', 'f#'],
  'D':  ['d', 'e', 'f#', 'g', 'a', 'b', 'c#'],
  'A':  ['a', 'b', 'c#', 'd', 'e', 'f#', 'g#'],
  'E':  ['e', 'f#', 'g#', 'a', 'b', 'c#', 'd#'],
  'B':  ['b', 'c#', 'd#', 'e', 'f#', 'g#', 'a#'],
  'F':  ['f', 'g', 'a', 'bb', 'c', 'd', 'e'],
  'Bb': ['bb', 'c', 'd', 'eb', 'f', 'g', 'a'],
  'Eb': ['eb', 'f', 'g', 'ab', 'bb', 'c', 'd'],
  'Ab': ['ab', 'bb', 'c', 'db', 'eb', 'f', 'g'],
  'Db': ['db', 'eb', 'f', 'gb', 'ab', 'bb', 'c'],
  'F#': ['f#', 'g#', 'a#', 'b', 'c#', 'd#', 'e#'],
  'C#': ['c#', 'd#', 'e#', 'f#', 'g#', 'a#', 'b#'],
  'Gb': ['gb', 'ab', 'bb', 'cb', 'db', 'eb', 'f'],
  'Cb': ['cb', 'db', 'eb', 'fb', 'gb', 'ab', 'bb'],
};

const NATURAL_INDEX: Record<string, number> = {
  'c': 0, 'd': 1, 'e': 2, 'f': 3, 'g': 4, 'a': 5, 'b': 6,
};

const FIFTHS_TO_KEY: Record<number, string> = {
  0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#',
  '-1': 'F', '-2': 'Bb', '-3': 'Eb', '-4': 'Ab', '-5': 'Db', '-6': 'Gb', '-7': 'Cb',
};

// ============================================================
// MusicXML 解析器
// ============================================================

interface MusicXmlNote {
  step: string;
  alter?: number;
  octave: number;
  duration: number;  // in divisions
  type: string;      // quarter, half, whole, eighth, 16th, 32nd
  dot?: boolean;
  isRest: boolean;
  divisions: number; // divisions per quarter note
}

interface MusicXmlMeasure {
  number: number;
  notes: MusicXmlNote[];
}

interface MusicXmlData {
  title: string;
  keyFifths: number;
  beats: number;
  beatType: number;
  tempo: string | null;
  measures: MusicXmlMeasure[];
}

/** 简易 MusicXML 解析（tag-based，兼容简单的单声部文件） */
function parseMusicXML(xml: string): MusicXmlData {
  const result: MusicXmlData = {
    title: '',
    keyFifths: 0,
    beats: 4,
    beatType: 4,
    tempo: null,
    measures: [],
  };

  // 标题
  const titleMatch = xml.match(/<work-title>([^<]+)<\/work-title>/);
  if (titleMatch) result.title = titleMatch[1].trim();

  // 拍号
  const beatsMatch = xml.match(/<beats>(\d+)<\/beats>/);
  if (beatsMatch) result.beats = parseInt(beatsMatch[1]);
  const btMatch = xml.match(/<beat-type>(\d+)<\/beat-type>/);
  if (btMatch) result.beatType = parseInt(btMatch[1]);

  // 调号 (fifths)
  const keyMatch = xml.match(/<fifths>(-?\d+)<\/fifths>/);
  if (keyMatch) result.keyFifths = parseInt(keyMatch[1]);

  // 速度
  const tempoMatch = xml.match(/<words[^>]*>([^<]+)<\/words>/);
  if (tempoMatch) result.tempo = tempoMatch[1].trim();

  // 解析每个小节
  const measRegex = /<measure[^>]*>([\s\S]*?)<\/measure>/g;
  let measMatch: RegExpExecArray | null;
  while ((measMatch = measRegex.exec(xml)) !== null) {
    const measContent = measMatch[1];
    const numMatch = measMatch[0].match(/number="(\d+)"/);
    const measNum = numMatch ? parseInt(numMatch[1]) : result.measures.length + 1;

    // 获取 divisions（可能在第一个小节的 attributes 中）
    let divisions = 4; // default
    const divMatch = measContent.match(/<divisions>(\d+)<\/divisions>/);
    if (divMatch) divisions = parseInt(divMatch[1]);

    // 辅助: 解析单个 <note> 元素
    function parseNoteElement(content: string, notesArr: MusicXmlNote[], divs: number) {
      const isRest = content.includes('<rest');
      const durMatch = content.match(/<duration>(\d+)<\/duration>/);
      const typeMatch = content.match(/<type>(\w+)<\/type>/);
      const hasDot = content.includes('<dot');

      if (isRest) {
        notesArr.push({
          step: '', octave: 0,
          duration: durMatch ? parseInt(durMatch[1]) : 4,
          type: typeMatch ? typeMatch[1] : 'quarter',
          isRest: true, divisions: divs,
        });
        return;
      }

      const stepMatch = content.match(/<step>([A-G])<\/step>/);
      const alterMatch = content.match(/<alter>(-?\d+)<\/alter>/);
      const octMatch = content.match(/<octave>(\d+)<\/octave>/);

      if (stepMatch && octMatch) {
        notesArr.push({
          step: stepMatch[1],
          alter: alterMatch ? parseInt(alterMatch[1]) : undefined,
          octave: parseInt(octMatch[1]),
          duration: durMatch ? parseInt(durMatch[1]) : 4,
          type: typeMatch ? typeMatch[1] : 'quarter',
          dot: hasDot || undefined,
          isRest: false, divisions: divs,
        });
      }
    }

    // 解析音符
    const notes: MusicXmlNote[] = [];

    // 匹配 <note>...</note>
    const noteRegex = /<note>([\s\S]*?)<\/note>/g;
    let noteMatch: RegExpExecArray | null;
    while ((noteMatch = noteRegex.exec(measContent)) !== null) {
      const noteContent = noteMatch[1];
      parseNoteElement(noteContent, notes, divisions);
    }

    // 匹配独立的 <rest>...</rest>（非标准但存在于此数据集）
    const restRegex = /<rest>\s*<duration>(\d+)<\/duration>\s*<type>(\w+)<\/type>\s*(<dot\/>)?\s*<\/rest>/g;
    let restMatch: RegExpExecArray | null;
    while ((restMatch = restRegex.exec(measContent)) !== null) {
      notes.push({
        step: '', octave: 0,
        duration: parseInt(restMatch[1]),
        type: restMatch[2],
        dot: !!restMatch[3],
        isRest: true,
        divisions,
      });
    }

    // 按文档顺序排序（通过原始 XML 中的位置）
    notes.sort((a, b) => {
      const aPos = measContent.indexOf(a.isRest ? '<rest>' : '<note>');
      const bPos = measContent.indexOf(b.isRest ? '<rest>' : '<note>');
      return aPos - bPos;
    });

    result.measures.push({ number: measNum, notes });
  }

  return result;
}

// ============================================================
// MusicXML 音符 → 简谱符号 转换
// ============================================================

function pitchToJianpu(
  step: string,
  alter: number | undefined,
  octave: number,
  key: string,
): { degree: string; octaveDots: number; accidental?: string } {
  const scale = KEY_SCALES[key] || KEY_SCALES['C'];
  const accSign = alter === 1 ? '#' : alter === -1 ? 'b' : '';
  const pitchName = step.toLowerCase() + accSign;

  // 遍历 7 个音级找匹配
  for (let deg = 0; deg < 7; deg++) {
    const scaleNote = scale[deg];
    const baseScaleNote = scaleNote.length === 1 ? scaleNote : scaleNote[0];

    // 计算该音级的期望八度 (octaveDots=0)
    let expectedOctave = 4;
    for (let i = 1; i <= deg; i++) {
      const p = scale[i - 1].length === 1 ? scale[i - 1] : scale[i - 1][0];
      const c = scale[i].length === 1 ? scale[i] : scale[i][0];
      if ((NATURAL_INDEX[c] ?? 0) <= (NATURAL_INDEX[p] ?? 0)) expectedOctave++;
    }

    if (scaleNote === pitchName) {
      // 完全匹配（含调内变音）
      return { degree: String(deg + 1), octaveDots: octave - expectedOctave };
    }

    if (baseScaleNote === step.toLowerCase() && scaleNote !== pitchName) {
      // 同音名但变音不同 → 用临时变音号
      return {
        degree: String(deg + 1),
        octaveDots: octave - expectedOctave,
        accidental: accSign || undefined,
      };
    }
  }

  // 未找到匹配：返回 degree 1
  return { degree: '1', octaveDots: octave - 4 };
}

const TYPE_TO_DURATION: Record<string, number> = {
  'whole': 1,
  'half': 2,
  'quarter': 4,
  'eighth': 8,
  '16th': 16,
  '32nd': 32,
  '64th': 64,
};

function noteToJianpuStr(note: MusicXmlNote, key: string): string {
  if (note.isRest) {
    const dur = TYPE_TO_DURATION[note.type] || 4;
    // 休止符：0=四分, 0-=二分, 0---=全 (与解析器约定一致)
    if (dur <= 1) return '0---';     // 全休止
    if (dur <= 2) return '0-';       // 二分休止
    if (dur <= 4) return '0';        // 四分休止
    return '0';                       // 八分休止及以下
  }

  const { degree, octaveDots, accidental } = pitchToJianpu(
    note.step,
    note.alter,
    note.octave,
    key,
  );

  let result = '';

  // 变音号前缀
  if (accidental === '#') result += '#';
  if (accidental === 'b') result += 'b';

  // 高音点
  if (octaveDots > 0) result += '˙'.repeat(octaveDots);
  // 低音点
  if (octaveDots < 0) result += '.'.repeat(Math.abs(octaveDots));

  // 简谱数字
  result += degree;

  // 时值线 — 与简谱解析器约定一致：
  //   无连字符 = 四分音符
  //   1个连字符 = 二分音符
  //   3个连字符 = 全音符
  //   下划线 = 减时线：_=八分 __=十六分 ___=三十二分
  const dur = TYPE_TO_DURATION[note.type] || 4;
  if (dur <= 1) result += '---';          // 全音符
  else if (dur <= 2) result += '-';       // 二分音符
  else if (dur <= 4) { /* 四分：无标记 */ }
  else if (dur <= 8) result += '_';       // 八分音符
  else if (dur <= 16) result += '__';     // 十六分音符
  else if (dur <= 32) result += '___';    // 三十二分音符
  else result += '___';                    // 更短

  // 附点
  if (note.dot) result += '•';

  return result;
}

// ============================================================
// 主转换流程
// ============================================================

interface ConvertedScore {
  title: string;
  composer: string;
  description: string;
  key: string;
  timeSignature: string;
  tempo: string | null;
  jianpuContent: string;
  measures: number;
}

function convertMusicXML(filePath: string): ConvertedScore {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = parseMusicXML(raw);

  // 文件名推断标题和作曲家
  const fname = path.basename(filePath, '.xml');
  let title = data.title || fname;
  let composer = '';
  let description = '';

  if (fname.includes('巴赫')) { composer = '巴赫 (J.S. Bach)'; description = '巴赫《平均律钢琴曲集》第一卷第一首，BWV 846。'; }
  else if (fname.includes('欢乐颂')) { composer = '贝多芬 (Beethoven)'; description = '贝多芬第九交响曲第四乐章「欢乐颂」主题，创作于1822-1824年。'; title = '欢乐颂'; }
  else if (fname.includes('月光')) { composer = '贝多芬 (Beethoven)'; description = '贝多芬升c小调第十四钢琴奏鸣曲 Op.27 No.2「月光」第一乐章。'; title = '月光奏鸣曲 · 第一乐章'; }
  else if (fname.includes('卡农')) { composer = '帕赫贝尔 (Pachelbel)'; description = '约翰·帕赫贝尔《D大调卡农与吉格》中的卡农部分，约创作于1680年。'; title = '卡农'; }

  const key = FIFTHS_TO_KEY[data.keyFifths] || 'C';
  const timeSignature = `${data.beats}/${data.beatType}`;

  // 构建简谱内容
  const lines: string[] = [];
  const header = `1=${key} ${timeSignature}${data.tempo ? ' ' + data.tempo : ''}`;
  lines.push(header);

  // 每行最多 4 小节（便于显示）
  const measuresPerLine = 4;
  for (let i = 0; i < data.measures.length; i += measuresPerLine) {
    const chunk = data.measures.slice(i, i + measuresPerLine);
    const measureStrs = chunk.map(meas => {
      const noteStrs = meas.notes
        .filter(n => n.duration > 0) // 过滤 duration=0 的 grace notes
        .map(n => noteToJianpuStr(n, key));
      return noteStrs.join(' ');
    });
    lines.push('| ' + measureStrs.join(' | ') + ' |');
  }

  return {
    title,
    composer,
    description,
    key: `1=${key}`,
    timeSignature,
    tempo: data.tempo,
    jianpuContent: lines.join('\n'),
    measures: data.measures.length,
  };
}

// ============================================================
// 运行
// ============================================================

const SCORES_DIR = path.resolve(__dirname, '..', '乐谱');
const files = fs.readdirSync(SCORES_DIR).filter(f => f.endsWith('.xml'));

console.log('═'.repeat(70));
console.log('MusicXML → 简谱 转换结果');
console.log('═'.repeat(70));

const scores: ConvertedScore[] = [];

for (const file of files) {
  const filePath = path.join(SCORES_DIR, file);
  console.log(`\n📄 ${file}`);
  const score = convertMusicXML(filePath);
  scores.push(score);

  console.log(`   标题: ${score.title}`);
  console.log(`   作曲: ${score.composer}`);
  console.log(`   调号: ${score.key}  拍号: ${score.timeSignature}  速度: ${score.tempo || '(无)'}`);
  console.log(`   小节数: ${score.measures}`);
  console.log(`   内容:`);
  console.log(score.jianpuContent.split('\n').map(l => '     ' + l).join('\n'));
}

// 输出 SQL（可直接替换 seed.sql 中对应的部分）
console.log('\n\n' + '═'.repeat(70));
console.log('SQL INSERT 语句 (新增乐谱和乐段)');
console.log('═'.repeat(70) + '\n');

// 从现有 seed.sql 中的最大 ID 开始
const BASE_SCORE_ID = 4;
const BASE_SECTION_ID = 17;
const BASE_USER_ID = 1;

for (let i = 0; i < scores.length; i++) {
  const s = scores[i];
  const scoreId = BASE_SCORE_ID + i;
  const sectionId = BASE_SECTION_ID + i;

  console.log(`-- ${s.title} — ${s.composer}`);
  console.log(`INSERT INTO scores (id, name, composer, description, owner_id) VALUES`);
  console.log(`(${scoreId}, '${s.title}', '${s.composer.replace(/'/g, "''")}', '${s.description.replace(/'/g, "''")}', ${BASE_USER_ID});`);

  const tagIds = (() => {
    if (s.composer.includes('巴赫')) return '1'; // 古典
    if (s.composer.includes('贝多芬') && s.title.includes('月光')) return '1, 3'; // 古典, 浪漫
    if (s.composer.includes('贝多芬')) return '1, 2'; // 古典, 交响曲
    if (s.composer.includes('帕赫贝尔')) return '1'; // 古典
    return '1';
  })();

  for (const tid of tagIds.split(', ')) {
    console.log(`INSERT INTO score_tags (score_id, tag_id) VALUES (${scoreId}, ${tid});`);
  }

  const escapedContent = s.jianpuContent.replace(/'/g, "''").replace(/\n/g, '\\n');
  console.log(`INSERT INTO sections (id, score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order) VALUES`);
  console.log(`(${sectionId}, ${scoreId}, NULL, '${s.title}', '/movement', 'section', '${escapedContent}', '${s.tempo || ''}', '${s.key.replace('1=', '')}', '${s.timeSignature}', 1);`);

  console.log();
}
