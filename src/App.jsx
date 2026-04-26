import { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from 'recharts';
import {
  Plus, X, Check, Trash2, BookOpen, RotateCw, BarChart3,
  Settings as SettingsIcon, ChevronLeft, ChevronRight, ChevronDown,
  Home, Clock, Download, RefreshCw, Minus,
  Calendar as CalendarIcon, Square, CheckSquare,
  Layers, TrendingUp, Library,
} from 'lucide-react';

/* ============================================================ 1. FIREBASE CONFIG ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyDPCD4aL-aKkBjMSRJ9X2jG_EMeQfL_udQ",
  authDomain: "barexam-c7e31.firebaseapp.com",
  projectId: "barexam-c7e31",
  storageBucket: "barexam-c7e31.firebasestorage.app",
  messagingSenderId: "1067070517667",
  appId: "1:1067070517667:web:f076c529d404983d8b2a16",
  measurementId: "G-73C90VZK5Z"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ============================================================ 2. UTILS ============================================================ */
// 🚨 이 유틸리티 함수들이 지워지면 화면이 하얗게 뜹니다! 절대 지우지 마세요.
function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function daysDiff(fromISO, toISO) {
  return Math.round((new Date(toISO + 'T00:00:00') - new Date(fromISO + 'T00:00:00')) / 86400000);
}
function fmtKDate(iso) {
  const d = new Date(iso + 'T00:00:00'); const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} (${days[d.getDay()]})`;
}
function fmtMin(n) {
  if (!n) return '0분';
  const h = Math.floor(n / 60), m = n % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}
function fmtHour(n) { return `${Math.round((n / 60) * 10) / 10}h`; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function weekStartOf(iso) {
  const d = new Date(iso + 'T00:00:00'); const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function weekDays(startISO) { return [...Array(7)].map((_, i) => addDays(startISO, i)); }
function monthGrid(year, month0) {
  const first = new Date(year, month0, 1);
  const start = new Date(year, month0, 1 - first.getDay());
  return [...Array(42)].map((_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  });
}
function getMockExam(dateISO, settings) {
  if (!settings.mockExams) return null;
  for (const m of settings.mockExams) {
    if (dateISO >= m.start && dateISO <= m.end) return { ...m, dayNum: daysDiff(m.start, dateISO) + 1, totalDays: daysDiff(m.start, m.end) + 1 };
  }
  return null;
}
function nextMockExam(dateISO, settings) {
  if (!settings.mockExams) return null;
  const upcoming = settings.mockExams.filter(m => m.start > dateISO).sort((a, b) => a.start.localeCompare(b.start));
  return upcoming[0] || null;
}
function getCycleInfo(dateISO, settings) {
  const { cycleDefs, examDate, mockExams = [] } = settings;
  if (examDate && dateISO >= examDate) return null;
  const anchors = [...mockExams.map(m => ({ start: m.start, end: m.end, kind: 'mock', label: m.label })), ...(examDate ? [{ start: examDate, end: examDate, kind: 'exam', label: '본시험' }] : [])].sort((a, b) => a.start.localeCompare(b.start));
  if (anchors.length === 0) return null;
  for (const a of anchors) { if (a.kind === 'mock' && dateISO >= a.start && dateISO <= a.end) return null; }
  const targetAnchor = anchors.find(a => a.start > dateISO);
  if (!targetAnchor) return null;
  const prevAnchor = [...anchors].reverse().find(a => a.end < dateISO);
  const windowStart = prevAnchor ? addDays(prevAnchor.end, 1) : null;
  const windowEnd = addDays(targetAnchor.start, -1);
  if (dateISO > windowEnd) return null;
  const distFromEnd = daysDiff(dateISO, windowEnd);
  if (distFromEnd < 0) return null;
  const cycleDayLengths = [...cycleDefs].reverse().map(c => c.blocks.reduce((s, b) => s + b.days, 0));
  const fullRotation = cycleDayLengths.reduce((a, b) => a + b, 0);
  if (fullRotation === 0) return null;
  let rem = distFromEnd % fullRotation;
  for (let rci = 0; rci < cycleDefs.length; rci++) {
    const cycle = [...cycleDefs].reverse()[rci];
    if (rem < cycleDayLengths[rci]) {
      let r = rem;
      for (let block of [...cycle.blocks].reverse()) {
        if (r < block.days) {
          if (windowStart && dateISO < windowStart) return null;
          return { subject: block.subject, cycleLabel: cycle.label, dayInBlock: block.days - r, blockDays: block.days, isBlockLast: r === 0, anchorLabel: targetAnchor.label, daysToAnchor: distFromEnd + 1 };
        }
        r -= block.days;
      }
    }
    rem -= cycleDayLengths[rci];
  }
  return null;
}

/* ============================================================ 3. DATA & THEME ============================================================ */
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Noto+Serif+KR:wght@400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap');`;

const C = { bg: '#F4EEE1', paper: '#FBF7EC', ink: '#1A1915', muted: '#6B6558', line: '#CFC7B4', lineSoft: '#E5DFCE', accent: '#7A1E1E', accentSoft: '#A84040', good: '#3C5A3A' };

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

const MOCK_REVIEW_TEMPLATES = [
  { offset: 1, title: '휴식' }, { offset: 2, title: '휴식' },
  { offset: 3, title: '공사례 리뷰 — 목차 / 쟁점 / 분량' }, { offset: 3, title: '공기록 리뷰' },
  { offset: 4, title: '형사례 리뷰 — 최판 보완' }, { offset: 4, title: '형기록 리뷰' },
  { offset: 5, title: '민기록 리뷰 — 청구원인 / 작성요령' }, { offset: 5, title: '민사례 리뷰' },
  { offset: 6, title: '공객 오답 정리' }, { offset: 6, title: '형객 오답 정리' },
  { offset: 7, title: '민객 오답 정리' }, { offset: 7, title: '경제법 리뷰' },
];

const PREV_SCORES = { 공법: { 선택형: 52.5, 사례형_1문: 48.25, 사례형_2문: 37.45, 기록형: 40.42, total: 178.62, max: 400 }, 형사법: { 선택형: 62.5, 사례형_1문: 50.46, 사례형_2문: 31.99, 기록형: 28.28, total: 173.23, max: 400 }, 민사법: { 선택형: 87.5, 사례형_1문: 79.09, 사례형_2문: 37.36, 사례형_3문: 53.06, 기록형: 85.93, total: 342.94, max: 700 }, 국제거래법: { '1문': 43.59, '2문': 26.09, total: 69.68, max: 160 }, grandTotal: 764.47, grandMax: 1660 };

const DEFAULT_MATERIALS = [
  { id: 'mat-1', name: '청취', subject: '민사법', color: '#2D5A3D', rounds: 0, target: 5 }, { id: 'mat-2', name: '요사', subject: '민사법', color: '#2D5A3D', rounds: 0, target: 5 },
  { id: 'mat-3', name: '청원', subject: '공법', color: '#1E3A5F', rounds: 0, target: 3 }, { id: 'mat-4', name: '캡슐(형법)', subject: '형사법', color: '#7A2828', rounds: 0, target: 3 },
  { id: 'mat-6', name: '민 암기장', subject: '민사법', color: '#2D5A3D', rounds: 0, target: 5 },
];

const DEFAULT_SETTINGS = {
  examDate: '2027-01-07', examLabel: '제16회 변호사시험',
  weeklyTargets: { '공법': 600, '형사법': 600, '민사법': 900, '국제거래법': 300 },
  cycleDefs: [
    { id: 1, label: '사이클 1', blocks: [{ subject: '민사법', days: 8 }, { subject: '형사법', days: 6 }, { subject: '공법', days: 5 }] },
    { id: 2, label: '사이클 2', blocks: [{ subject: '민사법', days: 5 }, { subject: '형사법', days: 3 }, { subject: '공법', days: 2 }] },
  ],
  mockExams: [{ id: 'mock-1', label: '모의고사 1차', start: '2026-06-22', end: '2026-06-26' }],
  d30Mode: true, autoGenMockReview: true,
};

/* ============================================================ 4. APP MAIN ============================================================ */
export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
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
  const [moods, setMoods] = useState({});
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthChecked(true); });
  }, []);

  // 🚨 안전장치: 파이어베이스 연결 지연 시 5초 후 강제 로딩 해제
  useEffect(() => {
    if (user) {
      setLoaded(false);
      const fallbackTimer = setTimeout(() => { 
        console.warn("Firebase 연결 지연. 로컬 데이터로 임시 시작합니다."); 
        setLoaded(true); 
      }, 5000);
      
      const fetchData = async () => {
        try {
          const docRef = doc(db, "users", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const d = docSnap.data();
            setSettings(d.settings || DEFAULT_SETTINGS); setLogs(d.logs || {});
            setReviews(d.reviews || []); setBooks(d.books || []);
            setTodos(d.todos || {}); setTracks(d.tracks || {});
            setMaterials(d.materials || DEFAULT_MATERIALS); setMaterialLog(d.materialLog || {});
            setExamScores(d.examScores || []); setMoods(d.moods || {});
            setSchedules(d.schedules || []);
          } else {
            // 마이그레이션 로직
            const localSettings = window.localStorage.getItem('bar-settings');
            if (localSettings) {
              setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(localSettings) });
              setLogs(JSON.parse(window.localStorage.getItem('bar-logs')) || {});
              setReviews(JSON.parse(window.localStorage.getItem('bar-reviews')) || []);
              setBooks(JSON.parse(window.localStorage.getItem('bar-books')) || []);
              setTodos(JSON.parse(window.localStorage.getItem('bar-todos')) || {});
              setTracks(JSON.parse(window.localStorage.getItem('bar-tracks')) || {});
              setMaterials(JSON.parse(window.localStorage.getItem('bar-materials')) || DEFAULT_MATERIALS);
              setExamScores(JSON.parse(window.localStorage.getItem('bar-exam-scores')) || []);
              setMoods(JSON.parse(window.localStorage.getItem('bar-moods')) || {});
              setSchedules(JSON.parse(window.localStorage.getItem('bar-schedules')) || []);
            }
          }
        } catch (e) {
          console.error("데이터 동기화 실패:", e);
        } finally {
          clearTimeout(fallbackTimer);
          setLoaded(true);
        }
      };
      fetchData();
    }
  }, [user]);

  useEffect(() => {
    if (loaded && user) {
      const fullState = { settings, logs, reviews, books, todos, tracks, materials, materialLog, examScores, moods, schedules };
      setDoc(doc(db, "users", user.uid), fullState, { merge: true }).catch(e => console.error(e));
    }
  }, [settings, logs, reviews, books, todos, tracks, materials, materialLog, examScores, moods, schedules, loaded, user]);

  useEffect(() => {
    if (!loaded || !settings.autoGenMockReview) return;
    setTodos(prev => {
      let next = { ...prev }; let changed = false;
      (settings.mockExams || []).forEach(m => {
        const sentinelDate = m.end; const sentinelMark = `__mockreview__${m.id}`;
        const existing = next[sentinelDate] || [];
        if (existing.some(t => t.title === sentinelMark)) return;
        if (today < m.end) return;
        MOCK_REVIEW_TEMPLATES.forEach(tmpl => {
          const targetDate = addDays(m.end, tmpl.offset);
          const list = next[targetDate] || [];
          if (!list.some(t => t.title === tmpl.title && t.fromMock === m.id)) {
            list.push({ id: uid(), title: tmpl.title, done: false, fromMock: m.id });
            next = { ...next, [targetDate]: list }; changed = true;
          }
        });
        next = { ...next, [sentinelDate]: [...existing, { id: uid(), title: sentinelMark, done: true, hidden: true }] }; changed = true;
      });
      return changed ? next : prev;
    });
  }, [loaded, settings.mockExams, settings.autoGenMockReview, today]);

  if (!authChecked) return <div style={{ background: C.bg, minHeight: '100vh' }} />;
  if (!user) return <LoginView />;
  if (!loaded) return <div style={{ background: C.bg, minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: "'Noto Serif KR', serif" }}>데이터 동기화 중...</div>;

  const dday = useMemo(() => daysDiff(today, settings.examDate), [today, settings.examDate]);
  const sharedProps = { today, settings, setSettings, logs, setLogs, reviews, setReviews, books, setBooks, todos, setTodos, tracks, setTracks, materials, setMaterials, materialLog, setMaterialLog, examScores, setExamScores, moods, setMoods, schedules, setSchedules };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, paddingBottom: 84, fontFamily: "'Noto Sans KR', sans-serif" }}>
      <style>{FONT_IMPORT}</style>
      <style>{`* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; } body { margin: 0; } input, textarea, button, select { font-family: inherit; color: inherit; } input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; } input[type=number] { -moz-appearance: textfield; } .serif { font-family: 'Fraunces', 'Noto Serif KR', serif; } .kserif { font-family: 'Noto Serif KR', serif; } .mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; } .fadeIn { animation: fade .35s ease both; } @keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } } .lift:active { transform: scale(0.98); } .lift { transition: transform .15s ease; } .hide-scroll::-webkit-scrollbar { display: none; } .hide-scroll { scrollbar-width: none; }`}</style>
      
      <TopBar dday={dday} examLabel={settings.examLabel} examDate={settings.examDate} userName={user.displayName} />
      
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '0 18px' }}>
        {view === 'home' && <HomeView {...sharedProps} dday={dday} onGoTo={setView} />}
        {view === 'log' && <LogView {...sharedProps} initialDate={today} />}
        {view === 'calendar' && <CalendarView {...sharedProps} onGoToLog={() => setView('log')} />}
        {view === 'exams' && <ExamsView {...sharedProps} />}
        {view === 'review' && <ReviewView {...sharedProps} />}
        {view === 'report' && <ReportView {...sharedProps} />}
        {view === 'settings' && <SettingsView {...sharedProps} onLogout={() => signOut(auth)} />}
      </main>

      <BottomNav view={view} setView={setView} />
    </div>
  );
}

/* ============================================================ 5. UI COMPONENTS ============================================================ */
function SectionTitle({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
      <h2 className="kserif" style={{ margin: 0, fontSize: 11, letterSpacing: '0.24em', color: C.muted, textTransform: 'uppercase', fontWeight: 600 }}>{children}</h2>
      {action && <button onClick={action.onClick} style={{ background: 'none', border: 'none', color: C.accent, fontSize: 11, cursor: 'pointer', letterSpacing: '0.05em' }}>{action.label} ›</button>}
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Icon size={14} color={color || C.muted} strokeWidth={1.5} />
      <div className="serif" style={{ fontSize: 20, fontWeight: 600, color: C.ink, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
    </div>
  );
}

function LoginView() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'grid', placeItems: 'center', fontFamily: "'Noto Sans KR', sans-serif" }}>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '40px 30px', textAlign: 'center', width: '90%', maxWidth: 320 }}>
        <h1 className="serif" style={{ fontSize: 24, margin: '0 0 10px', color: C.ink }}>Bar Exam Journal</h1>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 30, lineHeight: 1.5 }}>클라우드 기반 학습 기록 서비스</p>
        <button onClick={() => signInWithPopup(auth, new GoogleAuthProvider())} style={{ width: '100%', background: C.ink, color: '#fff', border: 'none', padding: '14px', cursor: 'pointer', fontWeight: 600 }}>Google 계정으로 시작하기</button>
      </div>
    </div>
  );
}

function TopBar({ dday, examLabel, examDate, userName }) {
  const overdue = dday < 0;
  return (
    <header style={{ borderBottom: `1px solid ${C.line}`, background: C.paper, padding: '18px 18px 14px', marginBottom: 15 }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="kserif" style={{ fontSize: 11, letterSpacing: '0.22em', color: C.muted }}>BAR JOURNAL · {userName || '수험생'}</div>
          <div className="kserif" style={{ fontSize: 17, fontWeight: 600, marginTop: 4, color: C.ink }}>{examLabel}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="serif" style={{ fontSize: 36, fontWeight: 600, lineHeight: 1, color: overdue ? C.muted : C.accent }}>D{overdue ? '+' : '-'}{Math.abs(dday)}</div>
          <div className="mono" style={{ fontSize: 10, color: C.muted, marginTop: 4, letterSpacing: '0.05em' }}>{examDate.replaceAll('-', '.')}</div>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ view, setView }) {
  const items = [
    { key: 'home', icon: Home, label: '홈' }, { key: 'log', icon: BookOpen, label: '기록' }, { key: 'calendar', icon: CalendarIcon, label: '캘린더' },
    { key: 'exams', icon: TrendingUp, label: '기출' }, { key: 'review', icon: RotateCw, label: '회독' }, { key: 'report', icon: BarChart3, label: '리포트' }, { key: 'settings', icon: SettingsIcon, label: '설정' }
  ];
  return (
    <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: C.paper, borderTop: `1px solid ${C.line}`, display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, paddingBottom: 'env(safe-area-inset-bottom)', zIndex: 10 }}>
      {items.map(it => (
        <button key={it.key} onClick={() => setView(it.key)} style={{ background: 'transparent', border: 'none', padding: '10px 0', color: view === it.key ? C.accent : C.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer', position: 'relative' }}>
          {view === it.key && <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 18, height: 2, background: C.accent }} />}
          <it.icon size={17} strokeWidth={view === it.key ? 2.2 : 1.6} />
          <span className="kserif" style={{ fontSize: 9, fontWeight: view === it.key ? 600 : 400 }}>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

function CycleCard({ info }) {
  if (!info) return null;
  const subColor = SUBJECTS[info.subject].color;
  return (
    <div style={{ background: subColor, color: '#fff', padding: '16px 18px', position: 'relative', overflow: 'hidden', border: `1px solid ${subColor}` }}>
      <div style={{ position: 'absolute', right: -20, top: -10, opacity: 0.12, fontSize: 120, fontWeight: 700, fontFamily: "'Fraunces', serif", lineHeight: 1 }}>{SUBJECTS[info.subject].short}</div>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div className="kserif" style={{ fontSize: 10, letterSpacing: '0.22em', opacity: 0.85, fontWeight: 500 }}>오늘의 사이클</div>
          {info.anchorLabel && <div className="mono" style={{ fontSize: 10, opacity: 0.85, letterSpacing: '0.03em' }}>{info.anchorLabel} D-{info.daysToAnchor}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
          <div className="serif" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em' }}>{info.subject}{info.subject === '민사법' && <span style={{ fontSize: 13, opacity: 0.85, marginLeft: 6 }}>+ 국제거래법</span>}</div>
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flexWrap: 'wrap' }}>
          <span style={{ background: 'rgba(255,255,255,0.18)', padding: '2px 7px', fontFamily: "'Noto Serif KR', serif", fontWeight: 600, letterSpacing: '0.05em' }}>{info.cycleLabel}</span>
          <span className="mono" style={{ opacity: 0.9 }}>블록 {info.dayInBlock}/{info.blockDays}일</span>
        </div>
        <div style={{ marginTop: 10, height: 3, background: 'rgba(255,255,255,0.2)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(info.dayInBlock / info.blockDays) * 100}%`, background: '#fff' }} />
        </div>
      </div>
    </div>
  );
}

function PrevScoreCard() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, marginBottom: 16 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', background: 'none', border: 'none', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <div style={{ textAlign: 'left' }}>
          <div className="kserif" style={{ fontSize: 11, letterSpacing: '0.22em', color: C.muted, fontWeight: 600 }}>15회 변시 기준점</div>
          <div className="serif" style={{ fontSize: 22, fontWeight: 600, color: C.ink, marginTop: 4 }}>{PREV_SCORES.grandTotal.toFixed(2)}<span style={{ fontSize: 12, color: C.muted, marginLeft: 6, fontWeight: 400 }}>/ {PREV_SCORES.grandMax}</span></div>
        </div>
        <ChevronDown size={18} color={C.muted} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {open && (
        <div style={{ borderTop: `1px dashed ${C.lineSoft}`, padding: '14px 16px 18px', fontSize: 12 }}>
          {Object.keys(SUBJECTS).map(sub => {
            const s = PREV_SCORES[sub]; const pct = Math.round((s.total / s.max) * 100);
            return (
              <div key={sub} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span className="kserif" style={{ fontWeight: 600, color: SUBJECTS[sub].color }}>{sub}</span><span className="mono" style={{ color: C.muted, fontSize: 11 }}>{s.total.toFixed(2)} / {s.max} ({pct}%)</span>
                </div>
                <div style={{ height: 3, background: C.lineSoft, position: 'relative', marginBottom: 6 }}><div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: SUBJECTS[sub].color }} /></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 10, color: C.muted }}>
                  {SUBJECTS[sub].types.map(t => s[t.key] !== undefined && <span key={t.key} className="mono"><span style={{ color: C.muted }}>{t.label}</span> <span style={{ color: C.ink }}>{s[t.key].toFixed(2)}</span></span>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================ HOME ============================================================ */
function HomeView({ today, dday, settings, logs, reviews, todos, tracks, examScores, moods, setMoods, onGoTo }) {
  const todayLog = logs[today] || {}; const todayMinutes = Object.values(todayLog).reduce((s, v) => s + (v || 0), 0);
  const todayTodos = todos[today] || []; const todayTodosOpen = todayTodos.filter(t => !t.done && !t.hidden).length;
  const todayTracks = tracks[today] || {}; const tracksDone = TRACK_TYPES.filter(tt => todayTracks[tt.key]?.done).length;
  
  const cycleInfo = useMemo(() => getCycleInfo(today, settings), [today, settings]);
  const tomorrowInfo = useMemo(() => getCycleInfo(addDays(today, 1), settings), [today, settings]);
  const todayMock = useMemo(() => getMockExam(today, settings), [today, settings]);
  const upcomingMock = useMemo(() => nextMockExam(today, settings), [today, settings]);

  const weekStart = weekStartOf(today);
  const weekData = useMemo(() => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i); const lg = logs[d] || {}; const row = { date: d, day: new Date(d + 'T00:00:00').getDate() };
      Object.keys(SUBJECTS).forEach(sub => { let sum = 0; SUBJECTS[sub].types.forEach(t => sum += lg[`${sub}::${t.key}`] || 0); row[sub] = Math.round((sum / 60) * 10) / 10; });
      arr.push(row);
    }
    return arr;
  }, [logs, today]);

  const weekSubjectMin = useMemo(() => {
    const out = {}; Object.keys(SUBJECTS).forEach(sub => out[sub] = 0);
    weekDays(weekStart).forEach(d => { const lg = logs[d] || {}; Object.keys(SUBJECTS).forEach(sub => SUBJECTS[sub].types.forEach(t => out[sub] += lg[`${sub}::${t.key}`] || 0)); });
    return out;
  }, [logs, weekStart]);

  const weekTotalMin = Object.values(weekSubjectMin).reduce((a, b) => a + b, 0);
  const weekTargetMin = Object.values(settings.weeklyTargets).reduce((a, b) => a + b, 0);
  const weekPct = weekTargetMin ? Math.round((weekTotalMin / weekTargetMin) * 100) : 0;

  const dueReviews = useMemo(() => {
    const list = [];
    reviews.forEach(r => { const interval = r.intervals[Math.min(r.cycleIndex, r.intervals.length - 1)]; const dueDate = addDays(r.lastReviewed, interval); if (dueDate <= today) list.push({ ...r, dueDate, roundNum: r.cycleIndex + 1 }); });
    return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [reviews, today]);

  const daysStudied = Object.keys(logs).filter(d => Object.values(logs[d] || {}).some(v => (v || 0) > 0)).length;
  const streak = useMemo(() => { let count = 0; for (let i = 0; i < 365; i++) { const d = addDays(today, -i); const lg = logs[d] || {}; if (Object.values(lg).reduce((s, v) => s + (v || 0), 0) > 0) count++; else if (i > 0) break; } return count; }, [logs, today]);
  const recentScores = examScores.slice(-3).reverse();
  const inD30 = dday > 0 && dday <= 30; const inD7 = dday > 0 && dday <= 7;

  return (
    <div className="fadeIn" style={{ paddingTop: 20 }}>
      <section style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '28px 22px', marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><span style={{ width: 18, height: 1, background: C.accent }} /><span className="kserif" style={{ fontSize: 10, letterSpacing: '0.25em', color: C.accent, fontWeight: 600 }}>시험까지</span></div>
        <div className="serif" style={{ fontSize: 72, fontWeight: 500, lineHeight: 0.95, color: C.ink, letterSpacing: '-0.03em' }}>{Math.abs(dday)}<span style={{ fontSize: 28, color: C.muted, marginLeft: 6 }}>일</span></div>
        <div className="kserif" style={{ marginTop: 14, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{fmtKDate(settings.examDate)} · {settings.examLabel}<br />누적 <span style={{ color: C.ink, fontWeight: 600 }}>{daysStudied}일</span> · 연속 <span style={{ color: C.accent, fontWeight: 600 }}>{streak}일</span> · 이번 주 <span style={{ color: C.ink, fontWeight: 600 }}>{fmtMin(weekTotalMin)}</span></div>
        <div style={{ position: 'absolute', right: 18, top: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>{[...Array(8)].map((_, i) => <span key={i} style={{ width: 10, height: 1, background: i < 3 ? C.accent : C.line }} />)}</div>
      </section>

      {settings.d30Mode && inD7 && <div style={{ background: C.accent, color: '#fff', padding: '12px 16px', marginBottom: 14, fontSize: 12, lineHeight: 1.5 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span className="kserif" style={{ fontWeight: 600, fontSize: 13 }}>벼락치기 모드 · D-{dday}</span><span className="mono" style={{ fontSize: 10, opacity: 0.85 }}>D-7 진입</span></div><div style={{ marginTop: 6, opacity: 0.9 }}>핸드북·찌라시·빈출쟁점·요사 위주 · 새 자료 No</div></div>}
      {settings.d30Mode && !inD7 && inD30 && <div style={{ background: '#1A1915', color: '#fff', padding: '12px 16px', marginBottom: 14, fontSize: 12, lineHeight: 1.5 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span className="kserif" style={{ fontWeight: 600, fontSize: 13 }}>회독 압축 모드 · D-{dday}</span><span className="mono" style={{ fontSize: 10, opacity: 0.7 }}>D-30 진입</span></div><div style={{ marginTop: 6, opacity: 0.85 }}>회차 회독 위주로 · 객관식 복수 회차/일</div></div>}

      {todayMock ? (
        <div style={{ marginBottom: 18 }}>
          <div style={{ background: C.accent, color: '#fff', padding: '18px 20px', position: 'relative', overflow: 'hidden', border: `1px solid ${C.accent}` }}>
            <div style={{ position: 'absolute', right: -10, top: -12, opacity: 0.14, fontSize: 120, fontWeight: 700, fontFamily: "'Fraunces', serif", lineHeight: 1 }}>!</div>
            <div style={{ position: 'relative' }}>
              <div className="kserif" style={{ fontSize: 10, letterSpacing: '0.22em', opacity: 0.85, fontWeight: 500 }}>오늘은 모의고사</div>
              <div className="serif" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em', marginTop: 6 }}>{todayMock.label}</div>
              <div style={{ marginTop: 8, fontSize: 12 }}><span className="mono" style={{ opacity: 0.9 }}>{todayMock.dayNum}/{todayMock.totalDays}일차 · {todayMock.start.slice(5)} ~ {todayMock.end.slice(5)}</span></div>
              <div style={{ marginTop: 10, height: 3, background: 'rgba(255,255,255,0.2)' }}><div style={{ height: '100%', width: `${(todayMock.dayNum / todayMock.totalDays) * 100}%`, background: '#fff' }} /></div>
            </div>
          </div>
        </div>
      ) : cycleInfo ? (
        <div style={{ marginBottom: 18 }}>
          <CycleCard info={cycleInfo} />
          {tomorrowInfo && tomorrowInfo.subject !== cycleInfo.subject && (
            <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: 'none', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: C.muted, letterSpacing: '0.05em' }}>내일부터 →</span>
              <span className="kserif" style={{ color: SUBJECTS[tomorrowInfo.subject].color, fontWeight: 600 }}>{tomorrowInfo.subject}{tomorrowInfo.subject === '민사법' && ' + 국제거래법'}<span className="mono" style={{ color: C.muted, fontWeight: 400, marginLeft: 6, fontSize: 10 }}>{tomorrowInfo.cycleLabel} · {tomorrowInfo.blockDays}일</span></span>
            </div>
          )}
          {upcomingMock && (
            <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: 'none', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: C.muted, letterSpacing: '0.05em' }}>다음 모의고사</span>
              <span className="kserif" style={{ color: C.accent, fontWeight: 600 }}>{upcomingMock.label}<span className="mono" style={{ color: C.muted, fontWeight: 400, marginLeft: 6, fontSize: 10 }}>D-{daysDiff(today, upcomingMock.start)} · {upcomingMock.start.slice(5)}</span></span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: C.paper, border: `1px dashed ${C.line}`, padding: '18px', marginBottom: 18, fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 1.6 }}>{settings.mockExams && settings.mockExams.length > 0 ? '사이클을 표시할 기준 모의고사가 없습니다.' : '모의고사 또는 본시험 일정을 등록해 주세요.'}</div>
      )}

      <SectionTitle action={{ label: '기록', onClick: () => onGoTo('log') }}>오늘 트랙 · {tracksDone}/5</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '10px 12px', marginBottom: 18 }}>
        {TRACK_TYPES.map(tt => {
          const slot = todayTracks[tt.key] || {};
          return (
            <div key={tt.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px dashed ${C.lineSoft}` }}>
              <span style={{ width: 22, height: 22, background: slot.done ? tt.color : 'transparent', color: slot.done ? '#fff' : tt.color, border: `1px solid ${tt.color}`, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, fontFamily: "'Noto Serif KR', serif", flexShrink: 0 }}>{tt.short}</span>
              <span className="kserif" style={{ fontSize: 11.5, color: C.muted, minWidth: 74 }}>{tt.label}</span>
              <span className="kserif" style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: slot.done ? C.ink : C.muted, fontWeight: slot.done ? 500 : 400, fontStyle: slot.text ? 'normal' : 'italic' }}>{slot.text || <span style={{ opacity: 0.5 }}>—</span>}</span>
              {slot.done && <Check size={12} color={C.good} strokeWidth={2.5} />}
            </div>
          );
        })}
      </div>

      <SectionTitle>오늘 {fmtKDate(today).slice(5)}</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 22 }}>
        <Stat icon={Clock} label="공부 시간" value={fmtMin(todayMinutes)} />
        <Stat icon={Layers} label="트랙" value={`${tracksDone}/5`} />
        <Stat icon={RotateCw} label="회독" value={`${dueReviews.length}`} />
        <Stat icon={CheckSquare} label="할일" value={`${todayTodosOpen}`} />
      </div>

      <SectionTitle>오늘 한 줄</SectionTitle>
      <input value={moods[today] || ''} onChange={e => setMoods(prev => ({ ...prev, [today]: e.target.value }))} onBlur={() => { if (!moods[today]) { setMoods(prev => { const next = { ...prev }; delete next[today]; return next; }); } }} placeholder="컨디션, 느낀점, 한줄메모" style={{ width: '100%', background: C.paper, border: `1px solid ${C.line}`, padding: '12px 14px', fontSize: 13, outline: 'none', marginBottom: 22, fontFamily: "'Noto Serif KR', serif" }} />

      <SectionTitle action={{ label: '리포트', onClick: () => onGoTo('report') }}>이번 주 목표 · {weekPct}%</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '14px 16px', marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span className="mono" style={{ fontSize: 11, color: C.muted }}>{weekStart.slice(5)} ~ {addDays(weekStart, 6).slice(5)}</span>
          <span className="serif" style={{ fontSize: 15, fontWeight: 600 }}>{fmtHour(weekTotalMin)}<span style={{ color: C.muted, fontSize: 11, fontWeight: 400 }}> / {fmtHour(weekTargetMin)}</span></span>
        </div>
        {Object.keys(SUBJECTS).map(sub => {
          const cur = weekSubjectMin[sub] || 0; const tgt = settings.weeklyTargets[sub] || 0; const pct = tgt ? Math.min(100, Math.round((cur / tgt) * 100)) : 0; const over = tgt && cur > tgt;
          return (
            <div key={sub} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span className="kserif" style={{ color: SUBJECTS[sub].color, fontWeight: 600 }}>{sub}</span><span className="mono" style={{ color: C.muted, fontSize: 11 }}>{fmtHour(cur)} / {fmtHour(tgt)} <span style={{ color: over ? C.good : pct >= 80 ? C.ink : C.muted, fontWeight: 600 }}>{pct}%</span></span></div>
              <div style={{ height: 4, background: C.lineSoft, position: 'relative' }}><div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: SUBJECTS[sub].color, transition: 'width .3s ease' }} /></div>
            </div>
          );
        })}
      </div>

      {recentScores.length > 0 && (
        <>
          <SectionTitle action={{ label: '기출', onClick: () => onGoTo('exams') }}>최근 객관식</SectionTitle>
          <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '10px 14px', marginBottom: 22 }}>
            {recentScores.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, borderBottom: `1px dashed ${C.lineSoft}` }}>
                <span className="kserif" style={{ color: SUBJECTS[s.subject]?.color, fontWeight: 600 }}>{s.round}회 {s.subject.replace('법', '')}</span>
                <span className="mono" style={{ color: C.ink }}><span style={{ color: C.accent, fontWeight: 600 }}>{s.wrong}</span><span style={{ color: C.muted }}> 틀림 · {s.date.slice(5)}</span></span>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle>최근 7일</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '16px 10px 8px', marginBottom: 22 }}>
        <div style={{ width: '100%', height: 170 }}>
          <ResponsiveContainer>
            <BarChart data={weekData} barCategoryGap="25%">
              <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: C.line }} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={28} unit="h" />
              <Tooltip cursor={{ fill: C.lineSoft }} contentStyle={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 0, fontSize: 12 }} formatter={(v, name) => [`${v}h`, name]} labelFormatter={(l) => `${l}일`} />
              {Object.keys(SUBJECTS).map(sub => <Bar key={sub} dataKey={sub} stackId="a" fill={SUBJECTS[sub].color} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingTop: 10, borderTop: `1px dashed ${C.lineSoft}`, justifyContent: 'center' }}>
          {Object.keys(SUBJECTS).map(sub => <span key={sub} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted }}><span style={{ width: 8, height: 8, background: SUBJECTS[sub].color, display: 'inline-block' }} />{sub}</span>)}
        </div>
      </div>

      {dueReviews.length > 0 && (
        <>
          <SectionTitle action={{ label: '전체', onClick: () => onGoTo('review') }}>오늘 회독</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
            {dueReviews.slice(0, 4).map(r => (
              <button key={r.id} onClick={() => onGoTo('review')} className="lift" style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <span style={{ width: 3, alignSelf: 'stretch', background: SUBJECTS[r.subject]?.color || C.muted }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="kserif" style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{r.subject} · {r.roundNum}회독</div>
                  </div>
                </div>
                <span className="serif" style={{ fontSize: 13, color: C.accent, fontWeight: 600 }}>{r.dueDate === today ? 'TODAY' : `${daysDiff(r.dueDate, today)}일 지남`}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <PrevScoreCard />
      <div style={{ height: 20 }} />
    </div>
  );
}

/* ============================================================ CALENDAR ============================================================ */
function CalendarView({ today, logs, reviews, todos, setTodos, settings, tracks, moods, setMoods, schedules, setSchedules, onGoToLog }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(today + 'T00:00:00'); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selected, setSelected] = useState(today);
  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);

  const reviewsByDate = useMemo(() => {
    const map = {};
    reviews.forEach(r => { const interval = r.intervals[Math.min(r.cycleIndex, r.intervals.length - 1)]; const dueDate = addDays(r.lastReviewed, interval); if (!map[dueDate]) map[dueDate] = []; map[dueDate].push({ id: r.id, title: r.title, subject: r.subject, num: r.cycleIndex + 1 }); });
    return map;
  }, [reviews]);

  function dayMinutes(d) { return Object.values(logs[d] || {}).reduce((s, v) => s + (v || 0), 0); }
  function intensity(mins) { if (mins === 0) return 0; if (mins < 60) return 1; if (mins < 180) return 2; if (mins < 360) return 3; return 4; }
  const intensityBg = ['transparent', '#EDE5D2', '#DFD3B5', '#C9B98E', '#A88E55'];

  const monthName = `${cursor.y}.${String(cursor.m + 1).padStart(2, '0')}`;
  const selDate = selected;
  const selLog = logs[selDate] || {};
  const selMinutes = Object.values(selLog).reduce((s, v) => s + (v || 0), 0);
  const selTodos = (todos[selDate] || []).filter(t => !t.hidden);
  const selDueReviews = (reviewsByDate[selDate] || []);
  const selCycleInfo = useMemo(() => getCycleInfo(selDate, settings), [selDate, settings]);
  const selMock = useMemo(() => getMockExam(selDate, settings), [selDate, settings]);
  const selTracks = tracks[selDate] || {};

  function addTodo(title) { const t = title.trim(); if (!t) return; setTodos(prev => ({ ...prev, [selDate]: [...(prev[selDate] || []), { id: uid(), title: t, done: false }] })); }
  function toggleTodo(id) { setTodos(prev => ({ ...prev, [selDate]: (prev[selDate] || []).map(t => t.id === id ? { ...t, done: !t.done } : t) })); }
  function removeTodo(id) { setTodos(prev => { const next = (prev[selDate] || []).filter(t => t.id !== id); const out = { ...prev }; if (next.length === 0) delete out[selDate]; else out[selDate] = next; return out; }); }

  return (
    <div className="fadeIn" style={{ paddingTop: 20 }}>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', marginBottom: 12 }}>
        <button onClick={() => setCursor(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })} style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: C.ink }}><ChevronLeft size={18} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="serif" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{monthName}</div>
          <button onClick={() => { const d = new Date(today + 'T00:00:00'); setCursor({ y: d.getFullYear(), m: d.getMonth() }); setSelected(today); }} style={{ background: 'transparent', border: `1px solid ${C.line}`, color: C.muted, padding: '3px 8px', fontSize: 10, cursor: 'pointer', letterSpacing: '0.1em', fontFamily: "'Noto Serif KR', serif" }}>오늘</button>
        </div>
        <button onClick={() => setCursor(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })} style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: C.ink }}><ChevronRight size={18} /></button>
      </div>

      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '10px 8px', marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => <div key={d} className="kserif" style={{ textAlign: 'center', fontSize: 10, padding: '4px 0', color: i === 0 ? C.accent : i === 6 ? '#1E3A5F' : C.muted, letterSpacing: '0.1em', fontWeight: 600 }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((d, i) => {
            const dt = new Date(d + 'T00:00:00'); const inMonth = dt.getMonth() === cursor.m; const isToday = d === today; const isSelected = d === selected; const dow = dt.getDay();
            const mins = dayMinutes(d); const intLevel = intensity(mins); const reviewsOnDay = reviewsByDate[d] || [];
            const todosOnDay = (todos[d] || []).filter(t => !t.hidden); const todoOpen = todosOnDay.filter(t => !t.done).length;
            const cInfo = getCycleInfo(d, settings); const cycleColor = cInfo ? SUBJECTS[cInfo.subject].color : null; const isBlockFirst = cInfo?.dayInBlock === 1;
            const mock = getMockExam(d, settings); const isMockFirst = mock && d === mock.start;
            const schs = (schedules || []).filter(s => d >= s.start && d <= s.end);

            return (
              <button key={i} onClick={() => setSelected(d)} style={{ position: 'relative', aspectRatio: '1 / 1.15', background: isSelected ? C.ink : (mock ? '#FBE4E4' : intensityBg[intLevel]), border: isToday && !isSelected ? `1.5px solid ${C.accent}` : `1px solid ${isSelected ? C.ink : 'transparent'}`, cursor: 'pointer', padding: '3px 3px 2px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', opacity: inMonth ? 1 : 0.35, color: isSelected ? C.paper : C.ink, overflow: 'hidden' }}>
                {mock && (<div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: C.accent, opacity: isSelected ? 0.85 : 1 }} />)}
                {!mock && cycleColor && (<div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: cycleColor, opacity: isSelected ? 0.85 : 1 }} />)}
                <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 500, textAlign: 'left', lineHeight: 1, marginTop: (cycleColor || mock) ? 4 : 1, fontFamily: "'JetBrains Mono', monospace", color: isSelected ? C.paper : (mock ? C.accent : (dow === 0 ? C.accent : dow === 6 ? '#1E3A5F' : C.ink)) }}>{dt.getDate()}</div>
                {mock ? (
                  <div style={{ fontSize: 9, fontFamily: "'Noto Serif KR', serif", fontWeight: 700, color: isSelected ? C.paper : C.accent, textAlign: 'center', marginTop: 2, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{isMockFirst ? '모의' : '시험'}<div style={{ fontSize: 8, marginTop: 1, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, opacity: 0.85 }}>{mock.dayNum}일차</div></div>
                ) : cInfo && (
                  <div style={{ fontSize: 11, fontFamily: "'Noto Serif KR', serif", fontWeight: 700, color: isSelected ? C.paper : cycleColor, textAlign: 'center', marginTop: 2, opacity: isSelected ? 0.95 : (isBlockFirst ? 1 : 0.78) }}>{SUBJECTS[cInfo.subject].short}<span style={{ fontSize: 8, marginLeft: 1, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, opacity: 0.7 }}>{cInfo.dayInBlock}</span></div>
                )}
                {schs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 3, width: '100%', zIndex: 2 }}>
                    {schs.map(sch => { const isStart = sch.start === d; const isEnd = sch.end === d; return <div key={sch.id} style={{ height: 3, background: sch.color || '#4A90E2', marginLeft: isStart ? 1 : -5, marginRight: isEnd ? 1 : -5, borderRadius: `${isStart ? 2 : 0}px ${isEnd ? 2 : 0}px ${isEnd ? 2 : 0}px ${isStart ? 2 : 0}px`, opacity: isSelected ? 1 : 0.8 }} /> })}
                  </div>
                )}
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
                  {reviewsOnDay.length > 0 && <div style={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>{[...new Set(reviewsOnDay.map(r => r.subject))].slice(0, 4).map((sub, idx) => <span key={idx} style={{ width: 3, height: 3, borderRadius: '50%', background: SUBJECTS[sub]?.color || C.muted, opacity: isSelected ? 0.95 : 1 }} />)}</div>}
                  {todoOpen > 0 && <span style={{ fontSize: 8, fontWeight: 700, color: isSelected ? C.paper : C.accent, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>✓{todoOpen}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <DayDetail date={selDate} minutes={selMinutes} log={selLog} todos={selTodos} dueReviews={selDueReviews} cycleInfo={selCycleInfo} mock={selMock} tracks={selTracks} mood={moods[selDate] || ''} setMood={(v) => setMoods(prev => { const next = { ...prev }; if (v) next[selDate] = v; else delete next[selDate]; return next; })} onAddTodo={addTodo} onToggleTodo={toggleTodo} onRemoveTodo={removeTodo} onGoToLog={onGoToLog} isToday={selDate === today} schedules={schedules} setSchedules={setSchedules} />
      <div style={{ height: 20 }} />
    </div>
  );
}

function DayDetail({ date, minutes, log, todos, dueReviews, cycleInfo, mock, tracks, mood, setMood, onAddTodo, onToggleTodo, onRemoveTodo, onGoToLog, isToday, schedules, setSchedules }) {
  const [newTodo, setNewTodo] = useState('');
  const [moodLocal, setMoodLocal] = useState(mood);
  const [newSchTitle, setNewSchTitle] = useState('');
  const [newSchEnd, setNewSchEnd] = useState(date);
  
  useEffect(() => { setMoodLocal(mood); setNewSchEnd(date); }, [mood, date]);

  const subjectMin = useMemo(() => { const out = {}; Object.keys(SUBJECTS).forEach(sub => { let m = 0; SUBJECTS[sub].types.forEach(t => m += log[`${sub}::${t.key}`] || 0); if (m > 0) out[sub] = m; }); return out; }, [log]);
  const activeSchs = (schedules || []).filter(s => date >= s.start && date <= s.end);

  function submitSchedule() {
    if (!newSchTitle.trim() || !newSchEnd) return;
    const start = date <= newSchEnd ? date : newSchEnd; const end = date <= newSchEnd ? newSchEnd : date;
    setSchedules([...(schedules||[]), { id: uid(), title: newSchTitle.trim(), start, end, color: '#4A90E2' }]);
    setNewSchTitle('');
  }

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.lineSoft}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div><div className="kserif" style={{ fontSize: 15, fontWeight: 600 }}>{fmtKDate(date)}</div>{isToday && <span className="kserif" style={{ fontSize: 10, color: C.accent, marginLeft: 6, letterSpacing: '0.1em', fontWeight: 600 }}>TODAY</span>}</div>
        <span className="serif mono" style={{ fontSize: 14, fontWeight: 600, color: minutes > 0 ? C.ink : C.muted }}>{fmtMin(minutes)}</span>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.lineSoft}` }}>
        <div className="kserif" style={{ fontSize: 10, letterSpacing: '0.2em', color: C.muted, fontWeight: 600, marginBottom: 8 }}>장기 일정</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {activeSchs.map(sch => (
            <div key={sch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: `1px dashed ${C.lineSoft}` }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: sch.color }} />
              <span className="kserif" style={{ flex: 1, fontSize: 12 }}>{sch.title}</span>
              <span className="mono" style={{ fontSize: 10, color: C.muted }}>{sch.start.slice(5)} ~ {sch.end.slice(5)}</span>
              <button onClick={() => setSchedules((schedules||[]).filter(s => s.id !== sch.id))} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: C.muted }}><X size={12} /></button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={newSchTitle} onChange={e => setNewSchTitle(e.target.value)} placeholder="일정명 (예: 헌법 인강)" style={{ flex: 1, minWidth: 120, border: `1px solid ${C.line}`, background: C.bg, padding: '8px 10px', fontSize: 12, outline: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: C.muted }}>~</span>
            <input type="date" value={newSchEnd} onChange={e => setNewSchEnd(e.target.value)} style={{ width: 110, border: `1px solid ${C.line}`, background: C.bg, padding: '7px', fontSize: 11, outline: 'none' }} />
            <button onClick={submitSchedule} className="lift" style={{ background: newSchTitle.trim() ? '#4A90E2' : C.line, color: '#fff', border: 'none', padding: '0 12px', fontSize: 12, cursor: newSchTitle.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center' }}><Plus size={14} /></button>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.lineSoft}` }}>
        <div className="kserif" style={{ fontSize: 10, letterSpacing: '0.2em', color: C.muted, fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}><span>할 일</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {todos.filter(t => !t.done).map(t => <TodoRow key={t.id} todo={t} onToggle={() => onToggleTodo(t.id)} onRemove={() => onRemoveTodo(t.id)} />)}
          {todos.filter(t => t.done).map(t => <TodoRow key={t.id} todo={t} onToggle={() => onToggleTodo(t.id)} onRemove={() => onRemoveTodo(t.id)} />)}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newTodo} onChange={e => setNewTodo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onAddTodo(newTodo); setNewTodo(''); } }} placeholder="할 일 추가" style={{ flex: 1, border: `1px solid ${C.line}`, background: C.bg, padding: '8px 10px', fontSize: 12, outline: 'none' }} />
          <button onClick={() => { onAddTodo(newTodo); setNewTodo(''); }} className="lift" style={{ background: C.accent, color: '#fff', border: 'none', padding: '0 12px', fontSize: 12 }}><Plus size={14} /></button>
        </div>
      </div>
    </div>
  );
}

function TodoRow({ todo, onToggle, onRemove }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: `1px dashed ${C.lineSoft}` }}>
      <button onClick={onToggle} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: todo.done ? C.good : C.muted, display: 'flex' }}>{todo.done ? <CheckSquare size={16} strokeWidth={2} /> : <Square size={16} strokeWidth={1.5} />}</button>
      <span className="kserif" style={{ flex: 1, fontSize: 13, minWidth: 0, textDecoration: todo.done ? 'line-through' : 'none', color: todo.done ? C.muted : C.ink }}>{todo.title}</span>
      <button onClick={onRemove} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: C.muted, display: 'flex' }}><X size={12} /></button>
    </div>
  );
}

/* ============================================================ LOG ============================================================ */
function LogView({ today, settings, logs, setLogs, tracks, setTracks, examScores, setExamScores, initialDate }) {
  const [date, setDate] = useState(initialDate || today);
  return (
    <div className="fadeIn" style={{ padding: '18px 0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8 }}>
        <button onClick={() => setDate(addDays(date, -1))} style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '7px 10px', cursor: 'pointer' }}><ChevronLeft size={14} /></button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ flex: 1, background: C.paper, border: `1px solid ${C.line}`, padding: '8px 10px', fontSize: 13, textAlign: 'center', outline: 'none' }} />
        <button onClick={() => setDate(addDays(date, 1))} style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '7px 10px', cursor: 'pointer' }}><ChevronRight size={14} /></button>
      </div>
      <TracksSection date={date} tracks={tracks} setTracks={setTracks} />
      <TimeSection date={date} logs={logs} setLogs={setLogs} settings={settings} />
      <ScoresSection date={date} examScores={examScores} setExamScores={setExamScores} />
    </div>
  );
}

function TracksSection({ date, tracks, setTracks }) {
  const dayTracks = tracks[date] || {};
  return (
    <div style={{ marginBottom: 24 }}>
      <SectionTitle>오늘의 5트랙</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '4px 0' }}>
        {TRACK_TYPES.map((t, i) => {
          const v = dayTracks[t.key] || {};
          return (
            <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < TRACK_TYPES.length - 1 ? `1px dashed ${C.lineSoft}` : 'none' }}>
              <button onClick={() => setTracks({ ...tracks, [date]: { ...dayTracks, [t.key]: { ...v, done: !v.done } } })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>{v.done ? <CheckSquare size={18} color={t.color} /> : <Square size={18} color={C.muted} />}</button>
              <div style={{ width: 28, fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16, color: t.color, textAlign: 'center', flexShrink: 0 }}>{t.short}</div>
              <input value={v.text || ''} onChange={e => setTracks({ ...tracks, [date]: { ...dayTracks, [t.key]: { ...v, text: e.target.value } } })} placeholder={t.placeholder} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: C.ink, padding: '2px 0' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeSection({ date, logs, setLogs }) {
  const dl = logs[date] || {};
  function setMin(subj, type, val) {
    const key = `${subj}::${type}`; const next = { ...dl };
    if (val > 0) next[key] = val; else delete next[key];
    const all = { ...logs }; if (Object.keys(next).length === 0) delete all[date]; else all[date] = next;
    setLogs(all);
  }
  return (
    <div style={{ marginBottom: 24 }}>
      <SectionTitle>학습 시간 (분)</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        {Object.keys(SUBJECTS).map((sub, si) => (
          <div key={sub} style={{ borderTop: si > 0 ? `1px solid ${C.lineSoft}` : 'none', padding: '10px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}><span className="kserif" style={{ fontSize: 13, fontWeight: 600, color: SUBJECTS[sub].color }}>{sub}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {SUBJECTS[sub].types.map(t => <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '4px 6px' }}><span style={{ fontSize: 10, color: C.muted, flex: 1 }}>{t.label}</span><button onClick={() => setMin(sub, t.key, Math.max(0, (dl[`${sub}::${t.key}`] || 0) - 15))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: C.muted }}><Minus size={11} /></button><input type="number" value={dl[`${sub}::${t.key}`] || ''} onChange={e => setMin(sub, t.key, parseInt(e.target.value) || 0)} style={{ width: 36, textAlign: 'center', background: 'transparent', border: 'none', outline: 'none', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }} /><button onClick={() => setMin(sub, t.key, Math.max(0, (dl[`${sub}::${t.key}`] || 0) + 15))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: C.muted }}><Plus size={11} /></button></div>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoresSection({ date, examScores, setExamScores }) {
  const [round, setRound] = useState(''); const [subject, setSubject] = useState('공법'); const [wrong, setWrong] = useState(''); const [total, setTotal] = useState(''); const [note, setNote] = useState('');
  const todays = examScores.filter(s => s.date === date).sort((a,b) => (a.subject + a.round).localeCompare(b.subject + b.round));

  return (
    <div style={{ marginBottom: 24 }}>
      <SectionTitle>객관식 회차 점수</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '12px 14px' }}>
        {todays.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {todays.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0', borderBottom: `1px dashed ${C.lineSoft}`, fontSize: 12 }}>
                <span style={{ color: SUBJECTS[s.subject].color, fontWeight: 600, minWidth: 40 }}>{SUBJECTS[s.subject].short}</span><span className="mono" style={{ color: C.muted, minWidth: 30 }}>{s.round}회</span><span className="mono" style={{ color: C.ink, minWidth: 40 }}>-{s.wrong}{s.total ? `/${s.total}` : ''}</span><span style={{ flex: 1, color: C.muted, fontSize: 11 }}>{s.note || ''}</span>
                <button onClick={() => setExamScores(examScores.filter(x => x.id !== s.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={12} color={C.muted} /></button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={subject} onChange={e => setSubject(e.target.value)} style={{ flex: 1.2, background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '8px', fontSize: 12, outline: 'none' }}>
              {Object.keys(SUBJECTS).filter(s => s !== '국제거래법').map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input value={round} onChange={e => setRound(e.target.value)} placeholder="회차" type="number" inputMode="numeric" style={{ flex: 1, background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '8px', fontSize: 12, outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={wrong} onChange={e => setWrong(e.target.value)} placeholder="틀린 개수" type="number" inputMode="numeric" style={{ flex: 1, background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '8px', fontSize: 12, outline: 'none' }} />
            <input value={total} onChange={e => setTotal(e.target.value)} placeholder="총 문제" type="number" inputMode="numeric" style={{ flex: 1, background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '8px', fontSize: 12, outline: 'none' }} />
            <button onClick={() => { if (round && wrong !== '') { setExamScores([...examScores, { id: uid(), date, round: parseInt(round), subject, type: '선택형', wrong: parseInt(wrong), total: total ? parseInt(total) : null, note: note.trim() || null }]); setRound(''); setWrong(''); setTotal(''); setNote(''); } }} style={{ background: C.ink, color: '#fff', border: 'none', padding: '0 18px', cursor: 'pointer', fontSize: 16 }}>+</button>
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="메모(선택)" style={{ width: '100%', background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '8px', fontSize: 12, outline: 'none' }} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================ EXAMS ============================================================ */
function ExamsView({ examScores }) {
  const [filterSubject, setFilterSubject] = useState('전체');
  const matrix = useMemo(() => {
    const m = {}; Object.keys(SUBJECTS).filter(s => s !== '국제거래법').forEach(s => { m[s] = {}; });
    examScores.forEach(s => { if (m[s.subject]) { const cur = m[s.subject][s.round]; if (!cur || s.date > cur.date) m[s.subject][s.round] = s; } }); return m;
  }, [examScores]);
  const allRounds = useMemo(() => { const set = new Set(); examScores.forEach(s => set.add(s.round)); return [...set].sort((a,b) => a - b); }, [examScores]);
  const chartData = useMemo(() => {
    const data = []; allRounds.forEach(r => { const row = { round: `${r}회` }; Object.keys(matrix).forEach(sub => { const s = matrix[sub][r]; if (s) row[sub] = s.wrong; }); data.push(row); }); return data;
  }, [allRounds, matrix]);

  const subjects = Object.keys(SUBJECTS).filter(s => s !== '국제거래법');
  const sortedScores = [...(filterSubject === '전체' ? examScores : examScores.filter(s => s.subject === filterSubject))].sort((a,b) => b.date.localeCompare(a.date));

  return (
    <div className="fadeIn" style={{ padding: '18px 0 24px' }}>
      <h1 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 600, marginBottom: 14 }}>기출 회차</h1>
      {chartData.length === 0 ? <div style={{ background: C.paper, border: `1px dashed ${C.line}`, padding: 24, textAlign: 'center', fontSize: 12, color: C.muted, margin: '18px 0' }}>기록 탭에서 회차 점수를 입력해 보세요</div> : (
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '16px 12px 12px', margin: '14px 0 18px' }}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
              <CartesianGrid stroke={C.lineSoft} strokeDasharray="3 3" />
              <XAxis dataKey="round" tick={{ fontSize: 10, fill: C.muted }} />
              <YAxis reversed tick={{ fontSize: 10, fill: C.muted }} />
              <Tooltip contentStyle={{ background: C.paper, border: `1px solid ${C.line}`, fontSize: 11 }} />
              {subjects.map(sub => <Line key={sub} type="monotone" dataKey={sub} stroke={SUBJECTS[sub].color} strokeWidth={2} dot={{ r: 3 }} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <SectionTitle>전체 기록</SectionTitle>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {['전체', ...subjects].map(s => <button key={s} onClick={() => setFilterSubject(s)} style={{ background: filterSubject === s ? C.ink : C.paper, color: filterSubject === s ? '#fff' : C.muted, border: `1px solid ${filterSubject === s ? C.ink : C.line}`, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>{s}</button>)}
      </div>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '4px 14px' }}>
        {sortedScores.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 0', borderBottom: `1px dashed ${C.lineSoft}`, fontSize: 12 }}>
            <span className="mono" style={{ color: C.muted, fontSize: 10, minWidth: 60 }}>{s.date.slice(5)}</span><span style={{ color: SUBJECTS[s.subject].color, fontWeight: 600, minWidth: 50 }}>{s.subject}</span><span className="mono" style={{ color: C.muted, minWidth: 30 }}>{s.round}회</span><span className="mono" style={{ color: C.ink, minWidth: 30 }}>-{s.wrong}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================ REVIEW ============================================================ */
function ReviewView({ today, reviews, setReviews, books, setBooks, materials, setMaterials }) {
  const [tab, setTab] = useState('topics');
  return (
    <div className="fadeIn" style={{ padding: '18px 0 24px' }}>
      <h1 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 600, marginBottom: 14 }}>회독</h1>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: `1px solid ${C.line}` }}>
        {[{ key: 'topics', label: '주제', icon: RotateCw }, { key: 'books', label: '문제집', icon: BookOpen }, { key: 'materials', label: '자료', icon: Library }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ background: 'none', border: 'none', padding: '8px 12px', cursor: 'pointer', color: tab === t.key ? C.accent : C.muted, borderBottom: tab === t.key ? `2px solid ${C.accent}` : '2px solid transparent', marginBottom: -1, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: tab === t.key ? 600 : 400, fontFamily: "'Noto Serif KR', serif" }}><t.icon size={13} /> {t.label}</button>
        ))}
      </div>
      {tab === 'topics' && <TopicsReview today={today} reviews={reviews} setReviews={setReviews} />}
      {tab === 'books' && <BooksReview today={today} books={books} setBooks={setBooks} />}
      {tab === 'materials' && <MaterialsReview today={today} materials={materials} setMaterials={setMaterials} />}
    </div>
  );
}

function TopicsReview({ today, reviews, setReviews }) {
  const [showAdd, setShowAdd] = useState(false);
  const enriched = useMemo(() => reviews.map(r => { const next = addDays(r.lastReviewed, r.intervals[Math.min(r.cycleIndex, r.intervals.length - 1)]); return { ...r, nextDue: next, daysUntilDue: daysDiff(today, next) }; }).sort((a, b) => a.nextDue.localeCompare(b.nextDue)), [reviews, today]);
  const [title, setTitle] = useState(''); const [subject, setSubject] = useState('민사법');
  return (
    <>
      <button onClick={() => setShowAdd(true)} style={{ width: '100%', background: C.ink, color: '#fff', border: 'none', padding: '10px', cursor: 'pointer', marginBottom: 14, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus size={14} /> 주제 추가</button>
      {showAdd && (
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 14, marginBottom: 14 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="주제" style={{ width: '100%', background: C.bg, border: `1px solid ${C.line}`, padding: '8px', fontSize: 12, marginBottom: 8, outline: 'none' }} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>{Object.keys(SUBJECTS).map(s => <button key={s} onClick={() => setSubject(s)} style={{ flex: 1, background: subject === s ? SUBJECTS[s].color : C.bg, color: subject === s ? '#fff' : C.muted, border: `1px solid ${subject === s ? SUBJECTS[s].color : C.lineSoft}`, padding: '6px 4px', fontSize: 10 }}>{SUBJECTS[s].short}</button>)}</div>
          <div style={{ display: 'flex', gap: 6 }}><button onClick={() => setShowAdd(false)} style={{ flex: 1, background: C.bg, border: `1px solid ${C.line}`, padding: '8px', fontSize: 12 }}>취소</button><button onClick={() => { if(title) { setReviews([...reviews, { id: uid(), title, subject, created: today, lastReviewed: today, cycleIndex: 0, intervals: [5, 3, 2], note: '' }]); setShowAdd(false); setTitle(''); } }} style={{ flex: 1, background: C.ink, color: '#fff', border: 'none', padding: '8px', fontSize: 12 }}>추가</button></div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {enriched.map(r => (
          <div key={r.id} style={{ background: C.paper, border: `1px solid ${r.daysUntilDue <= 0 ? C.accent : C.line}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 3, alignSelf: 'stretch', background: SUBJECTS[r.subject].color }} />
            <div style={{ flex: 1 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</div><div className="mono" style={{ fontSize: 10, color: r.daysUntilDue <= 0 ? C.accent : C.muted }}>{r.daysUntilDue <= 0 ? '오늘' : `D-${r.daysUntilDue}`}</div></div><div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}><span style={{ color: SUBJECTS[r.subject].color, fontWeight: 600 }}>{r.subject}</span> · 회독 {r.cycleIndex + 1}회차</div></div>
            <button onClick={() => setReviews(reviews.map(x => x.id === r.id ? { ...x, lastReviewed: today, cycleIndex: Math.min(x.cycleIndex + 1, x.intervals.length - 1) } : x))} style={{ background: C.ink, color: '#fff', border: 'none', padding: '5px 8px' }}><Check size={11} /></button><button onClick={() => setReviews(reviews.filter(x => x.id !== r.id))} style={{ background: 'none', border: 'none', padding: 0 }}><X size={12} color={C.muted} /></button>
          </div>
        ))}
      </div>
    </>
  );
}

function BooksReview({ today, books, setBooks }) {
  const [showAdd, setShowAdd] = useState(false); const [title, setTitle] = useState(''); const [subject, setSubject] = useState('민사법'); const [target, setTarget] = useState(3);
  return (
    <>
      <button onClick={() => setShowAdd(true)} style={{ width: '100%', background: C.ink, color: '#fff', border: 'none', padding: '10px', cursor: 'pointer', marginBottom: 14, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus size={14} /> 문제집 추가</button>
      {showAdd && (
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 14, marginBottom: 14 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="제목" style={{ width: '100%', background: C.bg, border: `1px solid ${C.line}`, padding: '8px', fontSize: 12, marginBottom: 8, outline: 'none' }} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>{Object.keys(SUBJECTS).map(s => <button key={s} onClick={() => setSubject(s)} style={{ flex: 1, background: subject === s ? SUBJECTS[s].color : C.bg, color: subject === s ? '#fff' : C.muted, border: `1px solid ${subject === s ? SUBJECTS[s].color : C.lineSoft}`, padding: '6px 4px', fontSize: 10 }}>{SUBJECTS[s].short}</button>)}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}><span style={{ fontSize: 11, color: C.muted }}>목표 회독:</span><input type="number" value={target} onChange={e => setTarget(parseInt(e.target.value) || 1)} min={1} style={{ width: 50, background: C.bg, border: `1px solid ${C.line}`, padding: '5px', fontSize: 12, textAlign: 'center' }} /><span style={{ fontSize: 11, color: C.muted }}>회</span></div>
          <div style={{ display: 'flex', gap: 6 }}><button onClick={() => setShowAdd(false)} style={{ flex: 1, background: C.bg, border: `1px solid ${C.line}`, padding: '8px', fontSize: 12 }}>취소</button><button onClick={() => { if(title) { setBooks([...books, { id: uid(), title, subject, target, current: 0 }]); setShowAdd(false); setTitle(''); } }} style={{ flex: 1, background: C.ink, color: '#fff', border: 'none', padding: '8px', fontSize: 12 }}>추가</button></div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {books.map(b => {
          const pct = Math.min(100, (b.current / b.target) * 100);
          return (
            <div key={b.id} style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '12px 14px', display: 'flex', gap: 10 }}>
              <div style={{ width: 3, alignSelf: 'stretch', background: SUBJECTS[b.subject].color }} />
              <div style={{ flex: 1 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><div style={{ fontSize: 13, fontWeight: 600 }}>{b.title}</div><div className="mono" style={{ fontSize: 11 }}><span style={{ color: b.current >= b.target ? C.good : C.ink, fontWeight: 600 }}>{b.current}</span><span style={{ color: C.muted }}> / {b.target}</span></div></div><div style={{ fontSize: 10, color: SUBJECTS[b.subject].color, fontWeight: 600, marginTop: 2 }}>{b.subject}</div><div style={{ height: 3, background: C.lineSoft, marginTop: 8, position: 'relative' }}><div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: b.current >= b.target ? C.good : SUBJECTS[b.subject].color }} /></div></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><button onClick={() => setBooks(books.map(x => x.id === b.id ? { ...x, current: x.current + 1 } : x))} style={{ background: C.ink, color: '#fff', border: 'none', padding: '4px 6px' }}><Plus size={11} /></button><button onClick={() => setBooks(books.map(x => x.id === b.id && x.current > 0 ? { ...x, current: x.current - 1 } : x))} style={{ background: C.bg, color: C.muted, border: `1px solid ${C.line}`, padding: '4px 6px' }}><Minus size={11} /></button><button onClick={() => setBooks(books.filter(x => x.id !== b.id))} style={{ background: 'none', border: 'none', padding: '2px 0' }}><X size={12} color={C.muted} /></button></div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function MaterialsReview({ today, materials, setMaterials }) {
  const [showAdd, setShowAdd] = useState(false); const [name, setName] = useState(''); const [subject, setSubject] = useState('민사법'); const [target, setTarget] = useState(3);
  return (
    <>
      <button onClick={() => setShowAdd(true)} style={{ width: '100%', background: C.ink, color: '#fff', border: 'none', padding: '10px', cursor: 'pointer', marginBottom: 14, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus size={14} /> 자료 추가</button>
      {showAdd && (
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 14, marginBottom: 14 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="자료 이름" style={{ width: '100%', background: C.bg, border: `1px solid ${C.line}`, padding: '8px', fontSize: 12, marginBottom: 8, outline: 'none' }} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>{Object.keys(SUBJECTS).map(s => <button key={s} onClick={() => setSubject(s)} style={{ flex: 1, background: subject === s ? SUBJECTS[s].color : C.bg, color: subject === s ? '#fff' : C.muted, border: `1px solid ${subject === s ? SUBJECTS[s].color : C.lineSoft}`, padding: '6px 4px', fontSize: 10 }}>{SUBJECTS[s].short}</button>)}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}><span style={{ fontSize: 11, color: C.muted }}>목표:</span><input type="number" value={target} onChange={e => setTarget(parseInt(e.target.value) || 1)} min={1} style={{ width: 50, background: C.bg, border: `1px solid ${C.line}`, padding: '5px', fontSize: 12, textAlign: 'center' }} /><span style={{ fontSize: 11, color: C.muted }}>회</span></div>
          <div style={{ display: 'flex', gap: 6 }}><button onClick={() => setShowAdd(false)} style={{ flex: 1, background: C.bg, border: `1px solid ${C.line}`, padding: '8px', fontSize: 12 }}>취소</button><button onClick={() => { if(name) { setMaterials([...materials, { id: uid(), name, subject, color: SUBJECTS[subject].color, rounds: 0, target }]); setShowAdd(false); setName(''); } }} style={{ flex: 1, background: C.ink, color: '#fff', border: 'none', padding: '8px', fontSize: 12 }}>추가</button></div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {materials.map(m => {
          const pct = Math.min(100, (m.rounds / m.target) * 100); const done = m.rounds >= m.target;
          return (
            <div key={m.id} style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 3, alignSelf: 'stretch', background: m.color }} />
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}><div style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{m.name}</div><div className="mono" style={{ fontSize: 11 }}><span style={{ color: done ? C.good : C.ink, fontWeight: 600 }}>{m.rounds}</span><span style={{ color: C.muted }}>/{m.target}</span></div></div><div style={{ height: 2, background: C.lineSoft, marginTop: 5, position: 'relative' }}><div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: done ? C.good : m.color }} /></div></div>
              <div style={{ display: 'flex', gap: 3 }}><button onClick={() => setMaterials(materials.map(x => x.id === m.id && x.rounds > 0 ? { ...x, rounds: x.rounds - 1 } : x))} style={{ background: C.bg, color: C.muted, border: `1px solid ${C.line}`, padding: '4px 6px' }}><Minus size={11} /></button><button onClick={() => setMaterials(materials.map(x => x.id === m.id ? { ...x, rounds: x.rounds + 1 } : x))} style={{ background: C.ink, color: '#fff', border: 'none', padding: '4px 6px' }}><Plus size={11} /></button><button onClick={() => setMaterials(materials.filter(x => x.id !== m.id))} style={{ background: 'none', border: 'none', padding: '4px 0' }}><X size={11} color={C.muted} /></button></div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ============================================================ REPORT ============================================================ */
function ReportView({ today, settings, logs }) {
  const weekStart = weekStartOf(today);
  const wDates = weekDays(weekStart);
  const weeklyBySubject = {}; Object.keys(SUBJECTS).forEach(s => weeklyBySubject[s] = 0);
  wDates.forEach(d => { Object.entries(logs[d] || {}).forEach(([k, v]) => { const [sub] = k.split('::'); if (weeklyBySubject[sub] !== undefined) weeklyBySubject[sub] += v || 0; }); });
  const weeklyData = Object.entries(weeklyBySubject).map(([sub, m]) => ({ name: SUBJECTS[sub].short, fullName: sub, minutes: m, target: settings.weeklyTargets[sub] || 0, color: SUBJECTS[sub].color }));

  return (
    <div className="fadeIn" style={{ padding: '18px 0 24px' }}>
      <h1 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 600, marginBottom: 16 }}>리포트</h1>
      <SectionTitle>주간 목표 (이번 주)</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '14px', marginBottom: 18 }}>
        {weeklyData.map(w => {
          const pct = w.target > 0 ? Math.min(100, (w.minutes / w.target) * 100) : 0;
          return (
            <div key={w.fullName} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}><span className="kserif" style={{ fontSize: 12, fontWeight: 600, color: w.color }}>{w.fullName}</span><span className="mono" style={{ fontSize: 10, color: C.muted }}>{fmtHour(w.minutes)} / {fmtHour(w.target)}</span></div>
              <div style={{ height: 4, background: C.lineSoft, position: 'relative' }}><div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width:
