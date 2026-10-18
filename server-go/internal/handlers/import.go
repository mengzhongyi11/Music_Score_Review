package handlers

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"score-review/server-go/internal/database"
	"score-review/server-go/internal/httpx"
)

/* ── MusicXML 解析（复刻 import.ts 的正则方案） ── */

var keyScales = map[string][]string{
	"C":  {"c", "d", "e", "f", "g", "a", "b"},
	"G":  {"g", "a", "b", "c", "d", "e", "f#"},
	"D":  {"d", "e", "f#", "g", "a", "b", "c#"},
	"A":  {"a", "b", "c#", "d", "e", "f#", "g#"},
	"E":  {"e", "f#", "g#", "a", "b", "c#", "d#"},
	"B":  {"b", "c#", "d#", "e", "f#", "g#", "a#"},
	"F":  {"f", "g", "a", "bb", "c", "d", "e"},
	"Bb": {"bb", "c", "d", "eb", "f", "g", "a"},
	"Eb": {"eb", "f", "g", "ab", "bb", "c", "d"},
	"Ab": {"ab", "bb", "c", "db", "eb", "f", "g"},
	"Db": {"db", "eb", "f", "gb", "ab", "bb", "c"},
}

var noteIndex = map[string]int{"c": 0, "d": 1, "e": 2, "f": 3, "g": 4, "a": 5, "b": 6}

// fifthsToKey 的键是字符串（JS 对象键都会被转成字符串），负数调号也在其中。
var fifthsToKey = map[string]string{
	"0": "C", "1": "G", "2": "D", "3": "A", "4": "E", "5": "B", "6": "F#", "7": "C#",
	"-1": "F", "-2": "Bb", "-3": "Eb", "-4": "Ab", "-5": "Db", "-6": "Gb", "-7": "Cb",
}

var typeToDur = map[string]int{
	"whole": 1, "half": 2, "quarter": 4, "eighth": 8, "16th": 16, "32nd": 32,
}

var (
	reWorkTitle = regexp.MustCompile(`<work-title>([^<]+)</work-title>`)
	reComposer  = regexp.MustCompile(`<creator type="composer">([^<]+)</creator>`)
	reFifths    = regexp.MustCompile(`<fifths>(-?\d+)</fifths>`)
	reBeats     = regexp.MustCompile(`<beats>(\d+)</beats>`)
	reBeatType  = regexp.MustCompile(`<beat-type>(\d+)</beat-type>`)
	reWords     = regexp.MustCompile(`<words[^>]*>([^<]+)</words>`)

	// 注意 (?s)：Go 的 `.` 默认不匹配换行，而 JS 用了 [\s\S]
	reMeasure = regexp.MustCompile(`(?s)<measure[^>]*>(.*?)</measure>`)
	reNote    = regexp.MustCompile(`(?s)<note>(.*?)</note>`)

	reStep     = regexp.MustCompile(`<step>([A-G])</step>`)
	reAlter    = regexp.MustCompile(`<alter>(-?\d+)</alter>`)
	reOctave   = regexp.MustCompile(`<octave>(\d+)</octave>`)
	reNoteType = regexp.MustCompile(`<type>(\w+)</type>`)

	reDirectionWords = regexp.MustCompile(`(?s)<direction[^>]*>.*?<words[^>]*>([^<]+)</words>.*?</direction>`)
	reAllDigits      = regexp.MustCompile(`^\d+$`)
)

type parsedMusicXML struct {
	Title         string
	Composer      string
	Key           string
	TimeSignature string
	Tempo         string
	Measures      []string
}

// parseMusicXML 与 TS 版 parseMusicXML 行为一致。
func parseMusicXML(xml string) parsedMusicXML {
	title := firstGroup(reWorkTitle, xml, "导入乐谱")
	composer := firstGroup(reComposer, xml, "")

	fifths := 0
	if m := reFifths.FindStringSubmatch(xml); m != nil {
		fifths, _ = strconv.Atoi(m[1])
	}
	beats := 4
	if m := reBeats.FindStringSubmatch(xml); m != nil {
		beats, _ = strconv.Atoi(m[1])
	}
	beatType := 4
	if m := reBeatType.FindStringSubmatch(xml); m != nil {
		beatType, _ = strconv.Atoi(m[1])
	}
	tempo := firstGroup(reWords, xml, "")

	key := fifthsToKey[strconv.Itoa(fifths)]
	if key == "" {
		key = "C"
	}

	measures := make([]string, 0)
	for _, mm := range reMeasure.FindAllStringSubmatch(xml, -1) {
		measureContent := mm[1]
		notes := make([]string, 0)

		for _, nn := range reNote.FindAllStringSubmatch(measureContent, -1) {
			noteContent := nn[1]

			if strings.Contains(noteContent, "<rest") {
				notes = append(notes, "0")
				continue
			}

			step := firstGroup(reStep, noteContent, "")
			octaveStr := firstGroup(reOctave, noteContent, "")
			if step == "" || octaveStr == "" {
				continue
			}
			octave, _ := strconv.Atoi(octaveStr)

			var alter *int
			if m := reAlter.FindStringSubmatch(noteContent); m != nil {
				v, _ := strconv.Atoi(m[1])
				alter = &v
			}

			noteType := firstGroup(reNoteType, noteContent, "quarter")
			hasDot := strings.Contains(noteContent, "<dot")

			notes = append(notes, noteToJianpu(step, alter, octave, noteType, hasDot, key))
		}

		measures = append(measures, strings.Join(notes, " "))
	}

	return parsedMusicXML{
		Title: title, Composer: composer,
		Key: "1=" + fifthsToKey[strconv.Itoa(fifths)],
		TimeSignature: strconv.Itoa(beats) + "/" + strconv.Itoa(beatType),
		Tempo: tempo, Measures: measures,
	}
}

// noteToJianpu 把 MusicXML 音符转成简谱记法，逐行对照 TS 版。
func noteToJianpu(step string, alter *int, octave int, noteType string, hasDot bool, key string) string {
	scale, ok := keyScales[key]
	if !ok {
		scale = keyScales["C"]
	}

	acc := ""
	if alter != nil {
		if *alter == 1 {
			acc = "#"
		} else if *alter == -1 {
			acc = "b"
		}
	}
	lowerStep := strings.ToLower(step)
	pn := lowerStep + acc

	for d := 0; d < 7; d++ {
		sn := scale[d]
		bsn := sn
		if len(sn) > 1 {
			bsn = sn[:1]
		}

		// 计算该音级在调内的"有效八度"
		eo := 4
		for i := 1; i <= d; i++ {
			p := scale[i-1]
			if len(p) > 1 {
				p = p[:1]
			}
			cur := scale[i]
			if len(cur) > 1 {
				cur = cur[:1]
			}
			if noteIndex[cur] <= noteIndex[p] {
				eo++
			}
		}

		if sn == pn {
			return buildJianpuToken("", octave-eo, d+1, noteType, hasDot)
		}
		if bsn == lowerStep && sn != pn {
			return buildJianpuToken(acc, octave-eo, d+1, noteType, hasDot)
		}
	}

	return "1"
}

func buildJianpuToken(prefix string, dots int, degree int, noteType string, hasDot bool) string {
	var b strings.Builder
	b.WriteString(prefix)
	if dots > 0 {
		b.WriteString(strings.Repeat("˙", dots))
	} else if dots < 0 {
		b.WriteString(strings.Repeat(".", -dots))
	}
	b.WriteString(strconv.Itoa(degree))

	dur := typeToDur[noteType]
	if dur == 0 {
		dur = 4
	}
	switch {
	case dur <= 1:
		b.WriteString("---")
	case dur <= 2:
		b.WriteString("-")
	case dur >= 32:
		b.WriteString("___")
	case dur >= 16:
		b.WriteString("__")
	case dur >= 8:
		b.WriteString("_")
	}
	if hasDot {
		b.WriteString("•")
	}
	return b.String()
}

func firstGroup(re *regexp.Regexp, s, fallback string) string {
	if m := re.FindStringSubmatch(s); m != nil {
		return m[1]
	}
	return fallback
}

/* ── 导入端点 ── */

type importResponse struct {
	Message  string `json:"message"`
	ScoreID  *int64 `json:"scoreId,omitempty"`
	BranchID *int64 `json:"branchId,omitempty"`
	Title    string `json:"title"`
}

// ImportMusicXML POST /api/import
//
// 缺陷修复：Node 版用 `SELECT MAX(id)+1` 手工计算主键（并发下会撞号）。
// 这里改为依赖 MySQL 自增主键 + LastInsertId，父节点 id 直接用上一步的返回值。
//
// ⚠ 仍保留 Node 的既有行为：导入到已有乐谱时，branch_overrides.section_id
// 用的是「sections 当前最大 id + 1」这种**并不存在的虚拟 id**，
// 而该列有外键约束，因此这条分支在 Node 版同样会失败。此处不改语义，
// 待产品确认正确做法（应映射到该乐谱真实存在的乐段）。
func (h *Handler) ImportMusicXML(c *gin.Context) {
	var body struct {
		XML     *string `json:"xml"`
		ScoreID *int    `json:"scoreId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.XML == nil || *body.XML == "" {
		httpx.Fail(c, http.StatusBadRequest, "请提供 MusicXML 内容")
		return
	}

	data := parseMusicXML(*body.XML)
	if len(data.Measures) == 0 {
		httpx.Fail(c, http.StatusBadRequest, "未解析到有效小节")
		return
	}

	// 提取文字标注（direction/words）
	textNotes := make([]string, 0)
	for _, m := range reDirectionWords.FindAllStringSubmatch(*body.XML, -1) {
		txt := strings.TrimSpace(m[1])
		if txt != "" && !reAllDigits.MatchString(txt) && !strings.HasPrefix(txt, "♩") {
			textNotes = append(textNotes, txt)
		}
	}

	keyName := strings.TrimPrefix(data.Key, "1=")
	rawKey := keyName // Node 在此处绕了一圈又回到 keyName，结果等价

	ctx := c.Request.Context()
	var resp importResponse

	err := database.WithTx(ctx, h.App.DB, func(tx *sqlx.Tx) error {
		if body.ScoreID != nil {
			// 导入到已有乐谱 → 建分支 + 逐小节写 override
			res, err := tx.ExecContext(ctx,
				"INSERT INTO branches (score_id, name, status, created_by) VALUES (?, ?, ?, ?)",
				*body.ScoreID, "导入-"+data.Title, "active", 1)
			if err != nil {
				return err
			}
			branchID, _ := res.LastInsertId()

			// 复刻 Node：section_id 取「当前 sections 最大 id + 1」起自增（虚拟 id）
			var maxSecID *int
			if err := tx.GetContext(ctx, &maxSecID, "SELECT MAX(id) as mx FROM sections"); err != nil {
				return err
			}
			nextSecID := 1
			if maxSecID != nil {
				nextSecID = *maxSecID + 1
			}

			for i, measure := range data.Measures {
				content := data.Key + " " + data.TimeSignature + "\n| " + measure + " |"
				if _, err := tx.ExecContext(ctx,
					`INSERT INTO branch_overrides (branch_id, section_id, name, content, tempo, key_signature, time_signature)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`,
					branchID, nextSecID+i, "第"+strconv.Itoa(i+1)+"小节", content,
					data.Tempo, rawKey, data.TimeSignature); err != nil {
					return err
				}
			}

			id := branchID
			resp = importResponse{
				Message: "已导入到分支「导入-" + data.Title + "」(" + strconv.Itoa(len(data.Measures)) + "个小节)",
				BranchID: &id, ScoreID: int64Ptr(int64(*body.ScoreID)), Title: data.Title,
			}
			return nil
		}

		// 新乐谱 → 建 score + 乐章文件夹 +（可选）演奏说明 + 每小节一个乐段
		res, err := tx.ExecContext(ctx,
			"INSERT INTO scores (name, composer, description, owner_id, is_public) VALUES (?, ?, ?, ?, ?)",
			data.Title, data.Composer,
			"从 MusicXML 导入 · "+strconv.Itoa(len(data.Measures))+" 个小节", 1, 0)
		if err != nil {
			return err
		}
		scoreID, _ := res.LastInsertId()

		// 乐章文件夹
		res, err = tx.ExecContext(ctx,
			"INSERT INTO sections (score_id, parent_id, name, path, type, sort_order) VALUES (?, NULL, '乐章', '/movements', 'folder', 1)",
			scoreID)
		if err != nil {
			return err
		}
		folderID, _ := res.LastInsertId()

		// 文字标注文件夹
		if len(textNotes) > 0 {
			res, err = tx.ExecContext(ctx,
				"INSERT INTO sections (score_id, parent_id, name, path, type, sort_order) VALUES (?, NULL, '演奏说明', '/notes', 'folder', 2)",
				scoreID)
			if err != nil {
				return err
			}
			textFolderID, _ := res.LastInsertId()

			if _, err := tx.ExecContext(ctx,
				"INSERT INTO sections (score_id, parent_id, name, path, type, content, sort_order) VALUES (?, ?, '标注', '/notes/markings', 'section', ?, 1)",
				scoreID, textFolderID, strings.Join(textNotes, "\n")); err != nil {
				return err
			}
		}

		// 每小节一个乐段
		for i, measure := range data.Measures {
			content := data.Key + " " + data.TimeSignature + "\n| " + measure + " |"
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO sections (score_id, parent_id, name, path, type, content, tempo, key_signature, time_signature, sort_order)
				 VALUES (?, ?, ?, ?, 'section', ?, ?, ?, ?, ?)`,
				scoreID, folderID, "第"+strconv.Itoa(i+1)+"小节", "/measures/"+strconv.Itoa(i+1),
				content, data.Tempo, rawKey, data.TimeSignature, i+1); err != nil {
				return err
			}
		}

		if _, err := tx.ExecContext(ctx,
			"INSERT INTO score_tags (score_id, tag_id) VALUES (?, 1)", scoreID); err != nil {
			return err
		}

		resp = importResponse{
			Message: "已导入乐谱「" + data.Title + "」(" + strconv.Itoa(len(data.Measures)) + "个小节)",
			ScoreID: &scoreID, Title: data.Title,
		}
		return nil
	})

	if err != nil {
		// ⚠ 该端点的 500 文案与错误体是特例：同时带 message 和 error
		c.PureJSON(http.StatusInternalServerError, gin.H{
			"message": "导入失败",
			"error":   err.Error(),
		})
		return
	}

	httpx.OK(c, resp)
}

func int64Ptr(v int64) *int64 { return &v }
