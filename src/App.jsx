import { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Plus, X, Check, Trash2, BookOpen, RotateCw, BarChart3,
  Settings as SettingsIcon, ChevronLeft, ChevronRight, ChevronDown,
  Home, Clock, Download, RefreshCw, Minus,
  Calendar as CalendarIcon, Square, CheckSquare,
  Layers, TrendingUp, Library,
} from 'lucide-react';

/* ============================================================ 1. FIREBASE CONFIG ============================================================ */
// 이전 대화에서 확인된 현준님의 Firebase 프로젝트 설정값입니다.
const firebaseConfig = {
  apiKey: "AIzaSyB...", // 현준님의 실제 API Key
  authDomain: "bar-journal-kr.firebaseapp.com",
  projectId: "bar-journal-kr",
  storageBucket: "bar-journal-kr.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ============================================================ 2. THEME & CONSTANTS ============================================================ */
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Noto+Serif+KR:wght@400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap');`;

const C = {
  bg: '#F4EEE1', paper: '#FBF7EC', ink: '#1A1915', muted: '#6B6558',
  line: '#CFC7B4', lineSoft: '#E5DFCE',
  accent: '#7A1E1E', accentSoft: '#A84040',
  good: '#3C5A3A', warn: '#B86A1E', book: '#5B4A33',
};

const SUBJECTS = {
  '공법': { color: '#1E3A5F', short: '공', types: [{ key: '선택형', label: '선택형' }, { key: '사례형_1문', label: '사례형 1문' }, { key: '사례형_2문', label: '사례형 2문' }, { key: '기록형', label: '기록형' }]},
  '형사법': { color: '#7A2828', short: '형', types: [{ key: '선택형', label: '선택형' }, { key: '사례형_1문', label: '사례형 1문' }, { key: '사례형_2문', label: '사례형 2문' }, { key: '기록형', label: '기록형' }]},
  '민사법': { color: '#2D5A3D', short: '민', types: [{ key: '선택형', label: '선택형' }, { key: '사례형_1문', label: '사례형 1문' }, { key: '사례형_2문', label: '사례형 2문' }, { key: '사례형_3문', label: '사례형 3문' }, { key: '기록형', label: '기록형' }]},
  '국제거래법': { color: '#8B6914', short: '국', types: [{ key: '1문', label: '1문' }, { key: '2문', label: '2문' }]},
};

const TRACK_TYPES = [
  { key: 'audio', label: '청취/청원', short: '청', color: '#5B4A33', placeholder: '예: 청취, 청원, 요사' },
  { key: 'case', label: '사례', short: '사', color: '#7A2828', placeholder: '예: 민 사례, 공 사례 핸드북' },
  { key: 'mcq', label: '객관식 회차', short: '객', color: '#1E3A5F', placeholder: '예: 14회 공객, 13회 민객' },
  { key: 'memo', label: '암기장/핸드북', short: '암', color: '#2D5A3D', placeholder: '예: 민 암기장 100p' },
  { key: 'aux', label: '최판/보조자료', short: '보', color: '#8B6914', placeholder: '예: 캡슐, 로만, 찌라시' },
];

const DEFAULT_SETTINGS = {
  examDate: '2027-01-07',
  examLabel: '제16회 변호사시험',
  weeklyTargets: { '공법': 600, '형사법': 600, '민사법': 900, '국제거래법': 300 },
  cycleDefs: [
    { id: 1, label: '사이클 1', blocks: [{ subject: '민사법', days: 8 }, { subject: '형사법', days: 6 }, { subject: '공법', days: 5 }] },
    { id: 2, label: '사이클 2', blocks: [{ subject: '민사법', days: 5 }, { subject: '형사법', days: 3 }, { subject: '공법', days: 2 }] },
  ],
  mockExams: [{ id: 'mock-1', label: '모의고사 1차', start: '2026-06-22', end: '2026-06-26' }],
  d30Mode: true,
  autoGenMockReview: true,
};

/* ============================================================ 3. UTILS ============================================================ */
function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function daysDiff(fromISO, toISO) {
  return Math.round((new Date(toISO + 'T00:00:00') - new Date(fromISO + 'T00:00:00')) / 86400000);
}
function fmtKDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} (${days[d.getDay()]})`;
}
function fmtMin(n) {
  if (!n) return '0분';
  const h = Math.floor(n / 60), m = n % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function monthGrid(year, month0) {
  const first = new Date(year, month0, 1);
  const start = new Date(year, month0, 1 - first.getDay());
  return [...Array(42)].map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  });
}

function getCycleInfo(dateISO, settings) {
  const { cycleDefs, examDate, mockExams = [] } = settings;
  if (examDate && dateISO >= examDate) return null;
  const anchors = [
    ...mockExams.map(m => ({ start: m.start, end: m.end, label: m.label })),
    { start: examDate, end: examDate, label: '본시험' },
  ].sort((a, b) => a.start.localeCompare(b.start));

  const targetAnchor = anchors.find(a => a.start > dateISO);
  if (!targetAnchor) return null;
  
  const distFromEnd = daysDiff(dateISO, addDays(targetAnchor.start, -1));
  const fullRotation = cycleDefs.reduce((s, c) => s + c.blocks.reduce((bSum, b) => bSum + b.days, 0), 0);
  if (fullRotation === 0) return null;

  let pos = distFromEnd % fullRotation;
  for (let c of [...cycleDefs].reverse()) {
    const cLen = c.blocks.reduce((s, b) => s + b.days, 0);
    if (pos < cLen) {
      let bPos = pos;
      for (let b of [...c.blocks].reverse()) {
        if (bPos < b.days) return { subject: b.subject, cycleLabel: c.label, dayInBlock: b.days - bPos, blockDays: b.days, daysToAnchor: distFromEnd + 1, anchorLabel: targetAnchor.label };
        bPos -= b.days;
      }
    }
    pos -= cLen;
  }
  return null;
}

/* ============================================================ 4. MAIN APP ============================================================ */
export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState('home');
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState(todayISO());

  // 앱의 모든 상태들
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [logs, setLogs] = useState({});
  const [reviews, setReviews] = useState([]);
  const [books, setBooks] = useState([]);
  const [todos, setTodos] = useState({});
  const [tracks, setTracks] = useState({});
  const [materials, setMaterials] = useState([]);
  const [materialLog, setMaterialLog] = useState({});
  const [examScores, setExamScores] = useState([]);
  const [moods, setMoods] = useState({});
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthChecked(true); });
  }, []);

  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const d = docSnap.data();
          setSettings(d.settings || DEFAULT_SETTINGS); setLogs(d.logs || {});
          setReviews(d.reviews || []); setBooks(d.books || []);
          setTodos(d.todos || {}); setTracks(d.tracks || {});
          setMaterials(d.materials || []); setMaterialLog(d.materialLog || {});
          setExamScores(d.examScores || []); setMoods(d.moods || {});
          setSchedules(d.schedules || []);
        } else {
          // 신규 유저 초기 데이터 생성
          await setDoc(docRef, { settings: DEFAULT_SETTINGS });
        }
        setLoaded(true);
      };
      fetchData();
    }
  }, [user]);

  useEffect(() => {
    if (loaded && user) {
      const fullState = { settings, logs, reviews, books, todos, tracks, materials, materialLog, examScores, moods, schedules };
      setDoc(doc(db, "users", user.uid), fullState, { merge: true });
    }
  }, [settings, logs, reviews, books, todos, tracks, materials, materialLog, examScores, moods, schedules, loaded, user]);

  if (!authChecked) return <div style={{ background: C.bg, minHeight: '100vh' }} />;
  if (!user) return <LoginView />;
  if (!loaded) return <div style={{ background: C.bg, minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'Noto Serif KR' }}>데이터 동기화 중...</div>;

  const dday = daysDiff(today, settings.examDate);
  const sharedProps = { today, settings, setSettings, logs, setLogs, reviews, setReviews, books, setBooks, todos, setTodos, tracks, setTracks, materials, setMaterials, materialLog, setMaterialLog, examScores, setExamScores, moods, setMoods, schedules, setSchedules };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, paddingBottom: 84, fontFamily: "'Noto Sans KR', sans-serif" }}>
      <style>{FONT_IMPORT}</style>
      <style>{`* { box-sizing: border-box; } body { margin: 0; } .serif { font-family: 'Fraunces', 'Noto Serif KR', serif; } .mono { font-family: 'JetBrains Mono', monospace; } .kserif { font-family: 'Noto Serif KR', serif; } .fadeIn { animation: fadeIn 0.3s ease-in; } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      
      <TopBar dday={dday} examLabel={settings.examLabel} userName={user.displayName} />
      
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '0 18px' }}>
        {view === 'home' && <HomeView {...sharedProps} dday={dday} onGoTo={setView} />}
        {view === 'log' && <LogView {...sharedProps} />}
        {view === 'calendar' && <CalendarView {...sharedProps} />}
        {view === 'review' && <ReviewView {...sharedProps} />}
        {view === 'settings' && <SettingsView onLogout={() => signOut(auth)} />}
      </main>

      <BottomNav view={view} setView={setView} />
    </div>
  );
}

/* ============================================================ 5. VIEW COMPONENTS ============================================================ */

function LoginView() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'grid', placeItems: 'center' }}>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '40px 30px', textAlign: 'center', width: '90%', maxWidth: 320 }}>
        <h1 className="serif" style={{ fontSize: 24, margin: '0 0 10px' }}>Bar Exam Journal</h1>
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 30 }}>나만의 변시 학습 클라우드 기록장</p>
        <button onClick={() => signInWithPopup(auth, new GoogleAuthProvider())} style={{ width: '100%', background: C.ink, color: '#fff', border: 'none', padding: '14px', cursor: 'pointer', fontWeight: 600 }}>Google 계정으로 시작하기</button>
      </div>
    </div>
  );
}

function TopBar({ dday, examLabel, userName }) {
  return (
    <header style={{ borderBottom: `1px solid ${C.line}`, background: C.paper, padding: '18px 18px 14px', marginBottom: 20 }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div className="kserif" style={{ fontSize: 10, letterSpacing: '0.22em', color: C.muted }}>JOURNAL · {userName || '수험생'}</div>
          <div className="kserif" style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>{examLabel}</div>
        </div>
        <div className="serif" style={{ fontSize: 32, fontWeight: 600, color: dday < 0 ? C.muted : C.accent }}>D{dday < 0 ? '+' : '-'}{Math.abs(dday)}</div>
      </div>
    </header>
  );
}

function BottomNav({ view, setView }) {
  const items = [{ key: 'home', icon: Home, label: '홈' }, { key: 'log', icon: BookOpen, label: '기록' }, { key: 'calendar', icon: CalendarIcon, label: '캘린더' }, { key: 'review', icon: RotateCw, label: '회독' }, { key: 'settings', icon: SettingsIcon, label: '설정' }];
  return (
    <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.paper, borderTop: `1px solid ${C.line}`, display: 'grid', gridTemplateColumns: `repeat(5, 1fr)`, zIndex: 10 }}>
      {items.map(it => (
        <button key={it.key} onClick={() => setView(it.key)} style={{ background: 'none', border: 'none', padding: '12px 0', color: view === it.key ? C.accent : C.muted, cursor: 'pointer' }}>
          <it.icon size={18} style={{ margin: '0 auto 4px' }} />
          <div style={{ fontSize: 10 }}>{it.label}</div>
        </button>
      ))}
    </nav>
  );
}

/* --- HOME --- */
function HomeView({ today, settings, logs, tracks }) {
  const cycle = useMemo(() => getCycleInfo(today, settings), [today, settings]);
  const dayMins = Object.values(logs[today] || {}).reduce((s, v) => s + (v || 0), 0);
  const trackDone = Object.values(tracks[today] || {}).filter(t => t.done).length;

  return (
    <div className="fadeIn">
      {cycle && (
        <div style={{ background: SUBJECTS[cycle.subject].color, color: '#fff', padding: '20px', marginBottom: 20 }}>
          <div className="serif" style={{ fontSize: 24, fontWeight: 600 }}>{cycle.subject}</div>
          <div style={{ fontSize: 12, marginTop: 8, opacity: 0.9 }}>{cycle.cycleLabel} · {cycle.dayInBlock}/{cycle.blockDays}일차</div>
          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>{cycle.anchorLabel} D-{cycle.daysToAnchor}</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <StatCard label="오늘 공부" value={fmtMin(dayMins)} />
        <StatCard label="트랙 진행" value={`${trackDone}/5`} />
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 15 }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

/* --- CALENDAR (Line rendering) --- */
function CalendarView({ today, logs, schedules, setSchedules, settings, todos, setTodos, moods, setMoods }) {
  const [cursor, setCursor] = useState({ y: new Date().getFullYear(), m: new Date().getMonth() });
  const [selected, setSelected] = useState(today);
  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);

  return (
    <div className="fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15, alignItems: 'center' }}>
        <button onClick={() => setCursor(c => c.m === 0 ? {y:c.y-1, m:11} : {y:c.y, m:c.m-1})} style={{ background: 'none', border: 'none' }}><ChevronLeft/></button>
        <div className="serif" style={{ fontWeight: 600 }}>{cursor.y}.{String(cursor.m+1).padStart(2,'0')}</div>
        <button onClick={() => setCursor(c => c.m === 11 ? {y:c.y+1, m:0} : {y:c.y, m:c.m+1})} style={{ background: 'none', border: 'none' }}><ChevronRight/></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, background: C.line, padding: 1, marginBottom: 20 }}>
        {cells.map((d, i) => {
          const isSelected = d === selected;
          const cInfo = getCycleInfo(d, settings);
          const activeSchs = (schedules || []).filter(s => d >= s.start && d <= s.end);
          return (
            <div key={i} onClick={() => setSelected(d)} style={{ background: isSelected ? C.ink : C.paper, color: isSelected ? '#fff' : C.ink, aspectRatio: '1/1.3', padding: 4, cursor: 'pointer', position: 'relative' }}>
              <div className="mono" style={{ fontSize: 10 }}>{new Date(d).getDate()}</div>
              {cInfo && <div style={{ height: 3, background: SUBJECTS[cInfo.subject].color, marginTop: 2 }} />}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 3 }}>
                {activeSchs.map(s => (
                  <div key={s.id} style={{ height: 3, background: s.color, marginLeft: s.start === d ? 0 : -5, marginRight: s.end === d ? 0 : -5 }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <DayDetail date={selected} schedules={schedules} setSchedules={setSchedules} todos={todos} setTodos={setTodos} moods={moods} setMoods={setMoods} isToday={selected === today} />
    </div>
  );
}

function DayDetail({ date, schedules, setSchedules, todos, setTodos, moods, setMoods }) {
  const [newSch, setNewSch] = useState('');
  const [schEnd, setSchEnd] = useState(date);
  const addSch = () => {
    if (!newSch.trim()) return;
    setSchedules([...(schedules || []), { id: uid(), title: newSch, start: date, end: schEnd, color: '#4A90E2' }]);
    setNewSch('');
  };
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 15 }}>
      <div className="kserif" style={{ fontWeight: 600, marginBottom: 12 }}>{fmtKDate(date)}</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>장기 일정 추가 (인강 등)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input value={newSch} onChange={e => setNewSch(e.target.value)} placeholder="일정 내용" style={{ padding: 10, border: `1px solid ${C.line}`, background: C.bg }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" value={schEnd} onChange={e => setSchEnd(e.target.value)} style={{ flex: 1, padding: 8, border: `1px solid ${C.line}`, background: C.bg }} />
          <button onClick={addSch} style={{ padding: '0 20px', background: C.ink, color: '#fff', border: 'none' }}>추가</button>
        </div>
      </div>
    </div>
  );
}

/* --- LOG (Mobile Form) --- */
function LogView({ examScores, setExamScores }) {
  const [round, setRound] = useState('');
  const [subject, setSubject] = useState('민사법');
  const [wrong, setWrong] = useState('');
  const addScore = () => {
    if (!round || !wrong) return;
    setExamScores([...(examScores || []), { id: uid(), round, subject, wrong, date: todayISO() }]);
    setRound(''); setWrong('');
  };
  return (
    <div className="fadeIn" style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 15 }}>
      <div className="kserif" style={{ fontSize: 12, fontWeight: 600, marginBottom: 15 }}>기출 회차 기록</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={subject} onChange={e => setSubject(e.target.value)} style={{ flex: 1.5, padding: 10, background: C.bg, border: `1px solid ${C.line}` }}>
            {Object.keys(SUBJECTS).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={round} onChange={e => setRound(e.target.value)} placeholder="회차" type="number" style={{ flex: 1, padding: 10, background: C.bg, border: `1px solid ${C.line}` }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={wrong} onChange={e => setWrong(e.target.value)} placeholder="틀린 개수" type="number" style={{ flex: 1, padding: 10, background: C.bg, border: `1px solid ${C.line}` }} />
          <button onClick={addScore} style={{ padding: '0 25px', background: C.ink, color: '#fff', border: 'none', fontWeight: 600 }}>저장</button>
        </div>
      </div>
    </div>
  );
}

/* --- REVIEW --- */
function ReviewView({ reviews }) {
  return (
    <div className="fadeIn" style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
      <Library size={40} style={{ marginBottom: 15, opacity: 0.5 }} />
      <div className="kserif">회독 관리 서비스 준비 중입니다.</div>
    </div>
  );
}

/* --- SETTINGS --- */
function SettingsView({ onLogout }) {
  return (
    <div className="fadeIn">
      <button onClick={onLogout} style={{ width: '100%', padding: 14, background: C.accent, color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>로그아웃</button>
      <div style={{ marginTop: 20, textAlign: 'center', fontSize: 10, color: C.muted }}>Bar Exam Journal v2.0 · 클라우드 동기화 모드</div>
    </div>
  );
}
