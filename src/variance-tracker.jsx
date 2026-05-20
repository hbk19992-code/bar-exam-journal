  }
  function dec(id) {
    setMaterials(materials.map(m => m.id === id ? { ...m, rounds: Math.max(0, m.rounds - 1) } : m));
  }
  function del(id) {
    if (!confirm(`이 자료를 삭제할까요?`)) return;
    setMaterials(materials.filter(m => m.id !== id));
  }

  const filtered = filter === `전체` ? materials : materials.filter(m => m.subject === filter);

  return (
    <>
      <div style={{ fontSize:11, color:C.muted, marginBottom:14, lineHeight:1.6 }}>
        명명된 자료(청취 / 청원 / 캡슐 / 로만 / 암기장 / 찌라시 / 핸드북 / 최판 등) 누적 회독
      </div>

      <div style={{ display:`flex`, gap:6, marginBottom:10, flexWrap:`wrap` }}>
        {[`전체`, ...Object.keys(SUBJECTS)].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{
              background: filter === s ? C.ink : C.paper,
              color: filter === s ? `#fff` : C.muted,
              border: `1px solid ${filter === s ? C.ink : C.line}`,
              padding:`4px 10px`, fontSize:11, cursor:`pointer`,
            }}>{s}</button>
        ))}
      </div>

      <button onClick={() => setShowAdd(true)} style={{ width:`100%`, background:C.ink, color:`#fff`, border:`none`, padding:`10px`, cursor:`pointer`, marginBottom:14, fontSize:12, display:`flex`, alignItems:`center`, justifyContent:`center`, gap:6 }}>
        <Plus size={14} /> 자료 추가
      </button>

      {showAdd && (
        <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:14 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={`자료 이름`}
            style={{ width:`100%`, background:C.bg, border:`1px solid ${C.line}`, padding:`8px 10px`, fontSize:12, marginBottom:8, outline:`none` }} />
          <div style={{ display:`flex`, gap:6, marginBottom:8 }}>
            {Object.keys(SUBJECTS).map(s => (
              <button key={s} onClick={() => setNewSubject(s)}
                style={{
                  flex:1, background: newSubject === s ? SUBJECTS[s].color : C.bg,
                  color: newSubject === s ? `#fff` : C.muted,
                  border: `1px solid ${newSubject === s ? SUBJECTS[s].color : C.lineSoft}`,
                  padding:`6px 4px`, fontSize:10, cursor:`pointer`,
                }}>{SUBJECTS[s].short}</button>
            ))}
          </div>
          <div style={{ display:`flex`, gap:6, marginBottom:10, alignItems:`center` }}>
            <span style={{ fontSize:11, color:C.muted }}>목표:</span>
            <input type={`number`} value={newTarget} onChange={e => setNewTarget(parseInt(e.target.value) || 1)} min={1}
              style={{ width:50, background:C.bg, border:`1px solid ${C.line}`, padding:`5px`, fontSize:12, textAlign:`center`, outline:`none` }} />
            <span style={{ fontSize:11, color:C.muted }}>회</span>
          </div>
          <div style={{ display:`flex`, gap:6 }}>
            <button onClick={() => setShowAdd(false)} style={{ flex:1, background:C.bg, border:`1px solid ${C.line}`, padding:`8px`, cursor:`pointer`, fontSize:12 }}>취소</button>
            <button onClick={addMaterial} style={{ flex:1, background:C.ink, color:`#fff`, border:`none`, padding:`8px`, cursor:`pointer`, fontSize:12 }}>추가</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign:`center`, padding:24, color:C.muted, fontSize:12, background:C.paper, border:`1px dashed ${C.line}` }}>
          자료가 없습니다
        </div>
      ) : (
        <div style={{ display:`flex`, flexDirection:`column`, gap:6 }}>
          {filtered.map(m => {
            const pct = Math.min(100, (m.rounds / m.target) * 100);
            const done = m.rounds >= m.target;
            return (
              <div key={m.id} style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`10px 12px`, display:`flex`, gap:10, alignItems:`center` }}>
                <div style={{ width:3, alignSelf:`stretch`, background:m.color }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`baseline`, gap:6 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:C.ink, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{m.name}</div>
                    <div className={`mono`} style={{ fontSize:11, flexShrink:0 }}>
                      <span style={{ color: done ? C.good : C.ink, fontWeight:600 }}>{m.rounds}</span>
                      <span style={{ color:C.muted }}>/{m.target}</span>
                    </div>
                  </div>
                  <div style={{ height:2, background:C.lineSoft, marginTop:5, position:`relative` }}>
                    <div style={{ position:`absolute`, left:0, top:0, bottom:0, width:`${pct}%`, background: done ? C.good : m.color }} />
                  </div>
                </div>
                <div style={{ display:`flex`, gap:3 }}>
                  <button onClick={() => dec(m.id)} style={{ background:C.bg, color:C.muted, border:`1px solid ${C.line}`, padding:`4px 6px`, cursor:`pointer` }}>
                    <Minus size={11} />
                  </button>
                  <button onClick={() => bump(m.id)} style={{ background:C.ink, color:`#fff`, border:`none`, padding:`4px 6px`, cursor:`pointer` }}>
                    <Plus size={11} />
                  </button>
                  <button onClick={() => del(m.id)} style={{ background:`none`, border:`none`, cursor:`pointer`, padding:`4px 0` }}>
                    <X size={11} color={C.muted} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
/* ============================================================ COURSES (인강 진도율) ============================================================ */

function CoursesReview({ today, courses, setCourses, logs, setLogs, settings }) {
  const [showAdd, setShowAdd] = useState(false); const [filter, setFilter] = useState(`전체`);
  function autoLogTime(subject, studyType, minutes) {
    if (minutes <= 0) return; const key = `${subject}::${studyType}`; const dl = logs[today] || {};
    setLogs({ ...logs, [today]: { ...dl, [key]: (dl[key] || 0) + minutes } });
  }
  function addCourse(data) {
    // lectures 배열 내 객체에 reviewed: false 기본값 추가
    const lectures = data.lectures.map(l => ({ ...l, reviewed: false }));
    const c = { id: uid(), name: data.name, subject: data.subject, studyType: data.studyType, lectures, createdAt: today, lastUpdated: today };
    setCourses([...courses, c]); 
    const completedMin = lectures.filter(l => l.completed).reduce((s, l) => s + l.durationMin, 0); 
    autoLogTime(c.subject, c.studyType, completedMin); 
    setShowAdd(false);
  }
  function updateCourse(id, newLectures) {
    const prev = courses.find(c => c.id === id); if (!prev) return;
    const prevSet = new Set(prev.lectures.filter(l => l.completed).map(l => l.num));
    const prevByNum = new Map(prev.lectures.map(l => [l.num, l]));
    
    const mergedLectures = newLectures.map(l => ({
      ...(prevByNum.get(l.num) || {}),
      ...l,
      reviewed: l.reviewed !== undefined ? l.reviewed : !!prevByNum.get(l.num)?.reviewed,
      reviewDurationMin: l.reviewDurationMin !== undefined ? l.reviewDurationMin : prevByNum.get(l.num)?.reviewDurationMin,
    }));
    
    const addedMin = mergedLectures.filter(l => l.completed && !prevSet.has(l.num)).reduce((s, l) => s + l.durationMin, 0);
    
    setCourses(courses.map(c => c.id === id ? { ...c, lectures: mergedLectures, lastUpdated: today } : c)); 
    autoLogTime(prev.subject, prev.studyType, addedMin);
  }
  function updateCourseMeta(id, patch) { setCourses(courses.map(c => c.id === id ? { ...c, ...patch, lastUpdated: today } : c)); }
  function delCourse(id) { if (!confirm(`이 강의를 삭제할까요? 이미 합산된 학습시간은 그대로 유지됩니다.`)) return; setCourses(courses.filter(c => c.id !== id)); }
  
  // 개별 강의 복습 토글 기능
  function toggleReview(id, lecNum) {
    setCourses(courses.map(c => {
      if (c.id !== id) return c;
      const nextLecs = c.lectures.map(l => l.num === lecNum ? { ...l, reviewed: !l.reviewed } : l);
      return { ...c, lectures: nextLecs };
    }));
  }
  
  const filtered = filter === `전체` ? courses : courses.filter(c => c.subject === filter);

  return (
    <>
      <div style={{ fontSize:11, color:C.muted, marginBottom:14, lineHeight:1.6 }}>사이트의 강의 진도표를 복사해서 붙여넣으면 자동으로 파싱해요. <b>완강 강의의 분량은 그 날짜 학습시간에 자동 합산</b>됩니다.</div>
      <div style={{ display:`flex`, gap:6, marginBottom:10, flexWrap:`wrap` }}>
        {[`전체`, ...Object.keys(SUBJECTS)].map(s => (<button key={s} onClick={() => setFilter(s)} style={{ background: filter === s ? C.ink : C.paper, color: filter === s ? `#fff` : C.muted, border: `1px solid ${filter === s ? C.ink : C.line}`, padding:`4px 10px`, fontSize:11, cursor:`pointer` }}>{s}</button>))}
      </div>
      <button onClick={() => setShowAdd(true)} style={{ width:`100%`, background:C.ink, color:`#fff`, border:`none`, padding:`10px`, cursor:`pointer`, marginBottom:14, fontSize:12, display:`flex`, alignItems:`center`, justifyContent:`center`, gap:6 }}><Plus size={14} /> 강의 추가</button>
      {showAdd && <AddCourseForm onAdd={addCourse} onCancel={() => setShowAdd(false)} />}
      {filtered.length === 0 ? (
        <div style={{ textAlign:`center`, padding:30, color:C.muted, fontSize:12, background:C.paper, border:`1px dashed ${C.line}` }}>{courses.length === 0 ? `강의를 추가해 보세요` : `이 과목에 등록된 강의가 없습니다.`}</div>
      ) : (
        <div style={{ display:`flex`, flexDirection:`column`, gap:10 }}>
          {filtered.map(c => (<CourseCard key={c.id} course={c} today={today} settings={settings} onUpdate={(lecs) => updateCourse(c.id, lecs)} onUpdateMeta={(patch) => updateCourseMeta(c.id, patch)} onDelete={() => delCourse(c.id)} onToggleReview={(lecNum) => toggleReview(c.id, lecNum)} />))}
        </div>
      )}
    </>
  );
}

function AddCourseForm({ onAdd, onCancel }) {
  const [name, setName] = useState(``);
  const [subject, setSubject] = useState(`민사법`);
  const [studyType, setStudyType] = useState(`사례형_1문`);
  const [text, setText] = useState(``);

  const types = SUBJECTS[subject]?.types || [];
  useEffect(() => {
    const valid = types.map(t => t.key);
    if (!valid.includes(studyType)) setStudyType(valid[0] || `선택형`);
  }, [subject]);

  const parsed = useMemo(() => parseCourseText(text), [text]);
  const completedCount = parsed.filter(l => l.completed).length;
  const totalMin = parsed.reduce((s, l) => s + l.durationMin, 0);
  const completedMin = parsed.filter(l => l.completed).reduce((s, l) => s + l.durationMin, 0);
  const canSubmit = name.trim() && parsed.length > 0;

  function submit() {
    if (!canSubmit) return;
    onAdd({ name: name.trim(), subject, studyType, lectures: parsed });
  }

  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:14 }}>
      <input value={name} onChange={e => setName(e.target.value)}
        placeholder={`강의 이름 (예: 정연석 선사기 민법)`}
        style={{ width:`100%`, background:C.bg, border:`1px solid ${C.line}`, padding:`8px 10px`, fontSize:12, marginBottom:8, outline:`none` }} />

      <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>과목</div>
      <div style={{ display:`flex`, gap:6, marginBottom:8 }}>
        {Object.keys(SUBJECTS).map(s => (
          <button key={s} onClick={() => setSubject(s)}
            style={{
              flex:1, background: subject === s ? SUBJECTS[s].color : C.bg,
              color: subject === s ? `#fff` : C.muted,
              border: `1px solid ${subject === s ? SUBJECTS[s].color : C.lineSoft}`,
              padding:`6px 4px`, fontSize:10, cursor:`pointer`,
            }}>{SUBJECTS[s].short}</button>
        ))}
      </div>

      <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>학습유형 (완강 시 이 유형에 분량 합산)</div>
      <div style={{ display:`flex`, gap:5, marginBottom:10, flexWrap:`wrap` }}>
        {types.map(t => (
          <button key={t.key} onClick={() => setStudyType(t.key)}
            style={{
              background: studyType === t.key ? SUBJECTS[subject].color : C.bg,
              color: studyType === t.key ? `#fff` : C.muted,
              border: `1px solid ${studyType === t.key ? SUBJECTS[subject].color : C.lineSoft}`,
              padding:`5px 9px`, fontSize:10, cursor:`pointer`,
            }}>{t.label}</button>
        ))}
      </div>

      <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>진도표 텍스트 붙여넣기</div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={7}
        placeholder={`사이트의 강의 목록을 통째로 복사해서 붙여넣으세요.\n\n예:\n1강\t[OT] 강의 소개\t29분\t100%\t완강\n2강\t채권자대위권 ①\t55분\t50%`}
        style={{ width:`100%`, background:C.bg, border:`1px solid ${C.line}`, padding:`8px 10px`, fontSize:11, marginBottom:10, outline:`none`, resize:`vertical`, fontFamily:`JetBrains Mono, monospace`, lineHeight:1.5 }} />

      {parsed.length > 0 && (
        <div style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`8px 10px`, marginBottom:10 }}>
          <div style={{ display:`flex`, justifyContent:`space-between`, marginBottom:6, fontSize:11 }}>
            <span style={{ color:C.muted }}>파싱 결과 미리보기</span>
            <span className={`mono`} style={{ color:C.ink, fontWeight:600 }}>{parsed.length}강 인식</span>
          </div>
          <div style={{ display:`flex`, gap:12, fontSize:10, marginBottom:6, flexWrap:`wrap` }}>
            <span className={`kserif`}>완강 <span className={`mono`} style={{ color:C.good, fontWeight:600 }}>{completedCount}/{parsed.length}</span></span>
            <span className={`kserif`}>총분량 <span className={`mono`} style={{ color:C.ink }}>{fmtMin(totalMin)}</span></span>
            <span className={`kserif`}>합산될 학습시간 <span className={`mono`} style={{ color:SUBJECTS[subject].color, fontWeight:600 }}>+{fmtMin(completedMin)}</span></span>
          </div>
          <div style={{ maxHeight:120, overflowY:`auto`, fontSize:10 }}>
            {parsed.map(l => (
              <div key={l.num} style={{ display:`flex`, gap:6, padding:`2px 0`, borderBottom:`1px dashed ${C.lineSoft}` }}>
                <span className={`mono`} style={{ color:C.muted, minWidth:24 }}>{l.num}강</span>
                <span style={{ flex:1, color:C.ink, minWidth:0, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{l.title}</span>
                <span className={`mono`} style={{ color:C.muted }}>{l.durationMin}분</span>
                <span className={`mono`} style={{ color: l.completed ? C.good : C.muted, fontWeight: l.completed ? 600 : 400, minWidth:38, textAlign:`right` }}>
                  {l.completed ? `완강` : `${l.progress}%`}
