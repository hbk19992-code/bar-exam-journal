export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('home');
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState(todayISO());
  
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [logs, setLogs] = useState({});
  const [reviews, setReviews] = useState([]);
  const [books, setBooks] = useState([]);
  const [todos, setTodos] = useState({});
  const [tracks, setTracks] = useState({});
  const [materials, setMaterials] = useState(DEFAULT_MATERIALS);
  const [materialLog, setMaterialLog] = useState({});
  const [examScores, setExamScores] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [moods, setMoods] = useState({});

  // ===== 1. 모든 React Hook(useEffect, useMemo)은 return보다 무조건 위에 있어야 합니다 =====

  useEffect(() => {
    const t = setInterval(() => setToday(todayISO()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const docRef = doc(db, 'users', currentUser.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          const safeSettings = data.settings || DEFAULT_SETTINGS;
          safeSettings.examLabel = '16회 변호사시험 대비';
          
          setSettings(safeSettings);
          setLogs(data.logs || {});
          setReviews(data.reviews || []);
          setBooks(data.books || []);
          setTodos(data.todos || {});
          setTracks(data.tracks || {});
          setMaterials(data.materials || DEFAULT_MATERIALS);
          setMaterialLog(data.materialLog || {});
          setExamScores(data.examScores || []);
          setSchedules(data.schedules || []);
          setMoods(data.moods || {});
        } else {
          setSettings({ ...DEFAULT_SETTINGS });
        }
        setLoaded(true);
      } else {
        setUser(null);
        setLoaded(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (loaded && user) {
      const docRef = doc(db, 'users', user.uid);
      setDoc(docRef, { settings, logs, reviews, books, todos, tracks, materials, materialLog, examScores, schedules, moods }, { merge: true });
    }
  }, [settings, logs, reviews, books, todos, tracks, materials, materialLog, examScores, schedules, moods, loaded, user]);

  useEffect(() => {
    if (!loaded || !settings.autoGenMockReview || !user) return;
    setTodos(prev => {
      let next = { ...prev };
      let changed = false;
      (settings.mockExams || []).forEach(m => {
        const sentinelDate = m.end;
        const sentinelMark = `__mockreview__${m.id}`;
        const existing = next[sentinelDate] || [];
        if (existing.some(t => t.title === sentinelMark)) return;
        if (today < m.end) return; 
        
        MOCK_REVIEW_TEMPLATES.forEach(tmpl => {
          const targetDate = addDays(m.end, tmpl.offset);
          const list = next[targetDate] || [];
          if (!list.some(t => t.title === tmpl.title && t.fromMock === m.id)) {
            list.push({ id: uid(), title: tmpl.title, done: false, fromMock: m.id });
            next = { ...next, [targetDate]: list };
            changed = true;
          }
        });
        next = { ...next, [sentinelDate]: [...existing, { id: uid(), title: sentinelMark, done: true, hidden: true }] };
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [loaded, settings.mockExams, settings.autoGenMockReview, today, user]);

  // 에러의 주범이었던 dday 계산을 위로 끌어올렸습니다!
  const dday = useMemo(() => daysDiff(today, settings.examDate), [today, settings.examDate]);

  // ===== 2. 로그인/로그아웃 함수 (팝업 대신 리다이렉트 방식으로 변경) =====
  const login = () => signInWithRedirect(auth, provider);
  const logout = () => signOut(auth).then(() => window.location.reload());

  // ===== 3. 화면 렌더링 (빠른 종료 return들) =====
  if (!user) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: C.bg, textAlign: 'center', padding: 20 }}>
        <style>{FONT_IMPORT}</style>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, marginBottom: 10 }}>Bar Exam Journal</h1>
        <p style={{ color: C.muted, marginBottom: 40, fontFamily: "'Noto Sans KR', sans-serif" }}>16회 변호사시험 대비 전용 학습 기록장</p>
        <button onClick={login} style={{ padding: '16px 32px', background: C.ink, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontFamily: "'Noto Sans KR', sans-serif" }}>
          Google 계정으로 시작하기
        </button>
      </div>
    );
  }

  if (!loaded) return <div style={{ height: '100vh', background: C.bg }} />;

  const sharedProps = {
    today, settings, setSettings,
    logs, setLogs, reviews, setReviews, books, setBooks,
    todos, setTodos, tracks, setTracks,
    materials, setMaterials, materialLog, setMaterialLog,
    examScores, setExamScores, schedules, setSchedules, moods, setMoods,
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, paddingBottom: 84, fontFamily: "'Noto Sans KR', sans-serif" }}>
      <style>{FONT_IMPORT}</style>
      <style>{`* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; } body { margin: 0; } input, textarea, button, select { font-family: inherit; color: inherit; } input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; } input[type=number] { -moz-appearance: textfield; } .serif { font-family: 'Fraunces', 'Noto Serif KR', serif; } .kserif { font-family: 'Noto Serif KR', serif; } .mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; } .fadeIn { animation: fade .35s ease both; } @keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } } .lift:active { transform: scale(0.98); } .lift { transition: transform .15s ease; } .hide-scroll::-webkit-scrollbar { display: none; } .hide-scroll { scrollbar-width: none; }`}</style>

      <TopBar dday={dday} examLabel={settings.examLabel} examDate={settings.examDate} logout={logout} />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '0 18px' }}>
        {view === 'home' && <HomeView {...sharedProps} dday={dday} onGoTo={setView} />}
        {view === 'log' && <LogView {...sharedProps} />}
        {view === 'calendar' && <CalendarView {...sharedProps} onGoToLog={() => setView('log')} />}
        {view === 'review' && <ReviewView {...sharedProps} />}
        {view === 'exams' && <ExamsView {...sharedProps} />}
        {view === 'report' && <ReportView {...sharedProps} />}
        {view === 'settings' && <SettingsView {...sharedProps} logout={logout} />}
      </main>

      <BottomNav view={view} setView={setView} />
    </div>
  );
}
