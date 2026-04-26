import React, { useState, useEffect, useMemo } from 'react';
import { auth, db, provider } from './firebase';
import { signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid
} from 'recharts';
import {
  Plus, X, Check, Trash2, BookOpen, RotateCw, BarChart3,
  Settings as SettingsIcon, ChevronLeft, ChevronRight, ChevronDown,
  Home, TrendingUp, Clock, Layers, CheckSquare, Square, Calendar as CalendarIcon, Library, Minus
} from 'lucide-react';

/* ============================================================
   THEME & DATA
============================================================ */

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Noto+Serif+KR:wght@400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap');`;

const C = {
  bg: '#F4EEE1', paper: '#FBF7EC', ink: '#1A1915', muted: '#6B6558',
  line: '#CFC7B4', lineSoft: '#E5DFCE',
  accent: '#7A1E1E', accentSoft: '#A84040',
  good: '#3C5A3A', warn: '#B86A1E', book: '#5B4A33',
  trackTint: '#F0E8D2',
};

const SUBJECTS = {
  '공법': { color: '#1E3A5F', short: '공', types: [
    { key: '선택형', label: '선택형' }, { key: '사례형_1문', label: '사례형 1문' }, { key: '사례형_2문', label: '사례형 2문' }, { key: '기록형', label: '기록형' }
  ]},
  '형사법': { color: '#7A2828', short: '형', types: [
    { key: '선택형', label: '선택형' }, { key: '사례형_1문', label: '사례형 1문' }, { key: '사례형_2문', label: '사례형 2문' }, { key: '기록형', label: '기록형' }
  ]},
  '민사법': { color: '#2D5A3D', short: '민', types: [
    { key: '선택형', label: '선택형' }, { key: '사례형_1문', label: '사례형 1문' }, { key: '사례형_2문', label: '사례형 2문' }, { key: '사례형_3문', label: '사례형 3문' }, { key: '기록형', label: '기록형' }
  ]},
  '국제거래법': { color: '#8B6914', short: '국', types: [
    { key: '1문', label: '1문' }, { key: '2문', label: '2문' }
  ]},
};

const TRACK_TYPES = [
  { key: 'audio', label: '청취/청원', short: '청', color: '#5B4A33', placeholder: '예: 청취, 청원, 요사' },
  { key: 'case', label: '사례', short: '사', color: '#7A2828', placeholder: '예: 민 사례, 공 사례 핸드북' },
  { key: 'mcq', label: '객관식 회차', short: '객', color: '#1E3A5F', placeholder: '예: 14회 공객, 13회 민객' },
  { key: 'memo', label: '암기장/핸드북', short: '암', color: '#2D5A3D', placeholder: '예: 민 암기장 100p' },
  { key: 'aux', label: '최판/보조자료', short: '보', color: '#8B6914', placeholder: '예: 캡슐, 로만, 찌라시' },
];

const PREV_SCORES = {
  '공법': { '선택형': 52.5, '사례형_1문': 48.25, '사례형_2문': 37.45, '기록형': 40.42, total: 178.62, max: 400 },
  '형사법': { '선택형': 62.5, '사례형_1문': 50.46, '사례형_2문': 31.99, '기록형': 28.28, total: 173.23, max: 400 },
  '민사법': { '선택형': 87.5, '사례형_1문': 79.09, '사례형_2문': 37.36, '사례형_3문': 53.06, '기록형': 85.93, total: 342.94, max: 700 },
  '국제거래법': { '1문': 43.59, '2문': 26.09, total: 69.68, max: 160 },
  grandTotal: 764.47, grandMax: 1660,
};

const CYCLE_DEFS = [
  { id: 1, label: '사이클 1', blocks: [{ subject: '민사법', days: 8 }, { subject: '형사법', days: 6 }, { subject: '공법', days: 5 }] },
  { id: 2, label: '사이클 2', blocks: [{ subject: '민사법', days: 5 }, { subject: '형사법', days: 3 }, { subject: '공법', days: 2 }] },
];

const DEFAULT_MATERIALS = [
  { id: 'mat-1', name: '청취', subject: '민사법', color: '#2D5A3D', rounds: 0, target: 5 },
  { id: 'mat-2', name: '요사', subject: '민사법', color: '#2D5A3D', rounds: 0, target: 5 },
  { id: 'mat-3', name: '청원', subject: '공법', color: '#1E3A5F', rounds: 0, target: 3 },
  { id: 'mat-4', name: '캡슐(형법)', subject: '형사법', color: '#7A2828', rounds: 0, target: 3 },
  { id: 'mat-5', name: '로만(형소)', subject: '형사법', color: '#7A2828', rounds: 0, target: 3 },
  { id: 'mat-6', name: '민 암기장', subject: '민사법', color: '#2D5A3D', rounds: 0, target: 5 },
  { id: 'mat-7', name: '민소 암기장', subject: '민사법', color: '#2D5A3D', rounds: 0, target: 4 },
  { id: 'mat-8', name: '형소 암기장', subject: '형사법', color: '#7A2828', rounds: 0, target: 4 },
  { id: 'mat-9', name: '상 암기장', subject: '민사법', color: '#2D5A3D', rounds: 0, target: 3 },
];

const MOCK_REVIEW_TEMPLATES = [
  { offset: 1, title: '휴식' }, { offset: 2, title: '휴식' },
  { offset: 3, title: '공사례 리뷰 — 목차 / 쟁점 / 분량' }, { offset: 3, title: '공기록 리뷰' },
  { offset: 4, title: '형사례 리뷰 — 최판 보완' }, { offset: 4, title: '형기록 리뷰' },
  { offset: 5, title: '민기록 리뷰 — 청구원인 / 작성요령' }, { offset: 5, title: '민사례 리뷰' },
  { offset: 6, title: '공객 오답 정리' }, { offset: 6, title: '형객 오답 정리' },
  { offset: 7, title: '민객 오답 정리' }, { offset: 7, title: '경제법 리뷰' },
];

const DEFAULT_SETTINGS = {
  examDate: '2027-01-07',
  examLabel: '16회 변호사시험 대비',
  weeklyTargets: { '공법': 600, '형사법': 600, '민사법': 900, '국제거래법': 300 },
  cycleDefs: CYCLE_DEFS,
  mockExams: [],
  d30Mode: true,
  autoGenMockReview: true,
};

/* ============================================================
   UTILS
============================================================ */

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
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}
function fmtHour(n) { return `${Math.round((n / 60) * 10) / 10}h`; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function weekStartOf(iso) {
  const d = new Date(iso + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function weekDays(startISO) { return [...Array(7)].map((_, i) => addDays(startISO, i)); }

function monthGrid(year, month0) {
  const first = new Date(year, month0, 1);
  const startDow = first.getDay();
  const start = new Date(year, month0, 1 - startDow);
  return [...Array(42)].map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  });
}

function getMockExam(dateISO, settings) {
  if (!settings.mockExams) return null;
  for (const m of settings.mockExams) {
    if (dateISO >= m.start && dateISO <= m.end) {
      const dayNum = daysDiff(m.start, dateISO) + 1;
      const totalDays = daysDiff(m.start, m.end) + 1;
      return { ...m, dayNum, totalDays };
    }
  }
  return null;
}

function nextMockExam(dateISO, settings) {
  if (!settings.mockExams) return null;
  const upcoming = settings.mockExams
    .filter(m => m.start > dateISO)
    .sort((a, b) => a.start.localeCompare(b.start));
  return upcoming[0] || null;
}

function getCycleInfo(dateISO, settings) {
  const { cycleDefs, examDate, mockExams = [] } = settings;
  if (examDate && dateISO >= examDate) return null;

  const anchors = [
    ...mockExams.map(m => ({ start: m.start, end: m.end, kind: 'mock', label: m.label })),
    ...(examDate ? [{ start: examDate, end: examDate, kind: 'exam', label: '본시험' }] : []),
  ].sort((a, b) => a.start.localeCompare(b.start));

  if (anchors.length === 0) return null;
  for (const a of anchors) {
    if (a.kind === 'mock' && dateISO >= a.start && dateISO <= a.end) return null;
  }

  const targetAnchor = anchors.find(a => a.start > dateISO);
  if (!targetAnchor) return null;

  const prevAnchor = [...anchors].reverse().find(a => a.end < dateISO);
  const windowStart = prevAnchor ? addDays(prevAnchor.end, 1) : null;
  const windowEnd = addDays(targetAnchor.start, -1);
  if (dateISO > windowEnd) return null;

  const distFromEnd = daysDiff(dateISO, windowEnd);
  if (distFromEnd < 0) return null;

  const reversedCycles = [...cycleDefs].reverse();
  const cycleDayLengths = reversedCycles.map(c => c.blocks.reduce((s, b) => s + b.days, 0));
  const fullRotation = cycleDayLengths.reduce((a, b) => a + b, 0);
  if (fullRotation === 0) return null;

  const posFromEnd = distFromEnd;
  const rotation = Math.floor(posFromEnd / fullRotation);
  let rem = posFromEnd % fullRotation;

  for (let rci = 0; rci < reversedCycles.length; rci++) {
    const cycle = reversedCycles[rci];
    const cLen = cycleDayLengths[rci];
    if (rem < cLen) {
      const reversedBlocks = [...cycle.blocks].reverse();
      let r = rem;
      for (let rbi = 0; rbi < reversedBlocks.length; rbi++) {
        const block = reversedBlocks[rbi];
        if (r < block.days) {
          const dayInBlock = block.days - r;
          const origCycleIdx = cycleDefs.length - 1 - rci;
          const origBlockIdx = cycle.blocks.length - 1 - rbi;
          const dayInCycle = cLen - rem;
          if (windowStart && dateISO < windowStart) return null;
          return {
            cycleId: cycle.id, cycleLabel: cycle.label, cycleIdx: origCycleIdx, blockIdx: origBlockIdx,
            subject: block.subject, dayInBlock, blockDays: block.days, dayInCycle, cycleDays: cLen,
            rotation: rotation + 1, isBlockLast: r === 0, isCycleLast: rem === 0,
            anchorLabel: targetAnchor.label, anchorDate: targetAnchor.start, daysToAnchor: distFromEnd + 1,
          };
        }
        r -= block.days;
      }
    }
    rem -= cLen;
  }
  return null;
}

/* ============================================================
   APP ROOT
============================================================ */

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

  // 1. 모든 React Hook(useEffect, useMemo)은 return보다 위에 있어야 합니다.
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

  // Hook 순서 규칙을 위해 상단으로 올린 dday 계산
  const dday = useMemo(() => daysDiff(today, settings.examDate), [today, settings.examDate]);

  // 2. 로그인/로그아웃 함수 (모바일/보안 에러 방지를 위해 signInWithRedirect 사용)
  const login = () => signInWithRedirect(auth, provider);
  const logout = () => signOut(auth).then(() => window.location.reload());

  // 3. 조건부 렌더링 (빠른 종료 return)
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

/* ============================================================
   TOP BAR / NAV
============================================================ */

function TopBar({ dday, examLabel, examDate, logout }) {
  const overdue = dday < 0;
  return (
    <header style={{ borderBottom: `1px solid ${C.line}`, background: C.paper, padding: '18px 18px 14px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="kserif" style={{ fontSize: 10, letterSpacing: '0.22em', color: C.muted, fontWeight: 600 }}>BAR EXAM JOURNAL</div>
          <div className="kserif" style={{ fontSize: 17, fontWeight: 600, marginTop: 4, color: C.ink }}>{examLabel}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="serif" style={{ fontSize: 36, fontWeight: 600, lineHeight: 1, color: overdue ? C.muted : C.accent }}>
            D{overdue ? '+' : '−'}{Math.abs(dday)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div className="mono" style={{ fontSize: 10, color: C.muted, letterSpacing: '0.05em' }}>{examDate.replaceAll('-', '.')}</div>
            <button onClick={logout} style={{ fontSize: 10, background: 'none', border: `1px solid ${C.line}`, padding: '2px 6px', cursor: 'pointer', color: C.muted }}>로그아웃</button>
          </div>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ view, setView }) {
  const items = [
    { key: 'home', icon: Home, label: '홈' },
    { key: 'log', icon: BookOpen, label: '기록' },
    { key: 'calendar', icon: CalendarIcon, label: '캘린더' },
    { key: 'exams', icon: TrendingUp, label: '기출' },
    { key: 'review', icon: RotateCw, label: '회독' },
    { key: 'report', icon: BarChart3, label: '리포트' },
    { key: 'settings', icon: SettingsIcon, label: '설정' },
  ];
  return (
    <nav style={{
      position: 'fixed', left: 0, right: 0, bottom: 0,
      background: C.paper, borderTop: `1px solid ${C.line}`,
      display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      paddingBottom: 'env(safe-area-inset-bottom)', zIndex: 10,
    }}>
      {items.map(it => {
        const active = view === it.key;
        const Icon = it.icon;
        return (
          <button key={it.key} onClick={() => setView(it.key)}
            style={{
              background: 'transparent', border: 'none', padding: '10px 0 10px',
              color: active ? C.accent : C.muted,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              cursor: 'pointer', position: 'relative',
            }}>
            {active && <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 18, height: 2, background: C.accent }} />}
            <Icon size={17} strokeWidth={active ? 2.2 : 1.6} />
            <span className="kserif" style={{ fontSize: 9, letterSpacing: 0, fontWeight: active ? 600 : 400 }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ============================================================
   COMMON
============================================================ */

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Icon size={14} color={color || C.muted} strokeWidth={1.5} />
      <div className="serif" style={{ fontSize: 20, fontWeight: 600, color: C.ink, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
      <h2 className="kserif" style={{ margin: 0, fontSize: 11, letterSpacing: '0.24em', color: C.muted, textTransform: 'uppercase', fontWeight: 600 }}>{children}</h2>
      {action && (
        <button onClick={action.onClick} style={{ background: 'none', border: 'none', color: C.accent, fontSize: 11, cursor: 'pointer', letterSpacing: '0.05em' }}>
          {action.label} ›
        </button>
      )}
    </div>
  );
}

function CycleCard({ info, today, withMinor = true }) {
  if (!info) return null;
  const subColor = SUBJECTS[info.subject].color;
  const isMinSubj = info.subject === '민사법';
  return (
    <div style={{
      background: subColor, color: '#fff',
      padding: '16px 18px', position: 'relative', overflow: 'hidden',
      border: `1px solid ${subColor}`,
    }}>
      <div style={{ position: 'absolute', right: -20, top: -10, opacity: 0.12, fontSize: 120, fontWeight: 700, fontFamily: "'Fraunces', serif", lineHeight: 1 }}>
        {SUBJECTS[info.subject].short}
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div className="kserif" style={{ fontSize: 10, letterSpacing: '0.22em', opacity: 0.85, fontWeight: 500 }}>오늘의 사이클</div>
          {info.anchorLabel && (
            <div className="mono" style={{ fontSize: 10, opacity: 0.85, letterSpacing: '0.03em' }}>
              {info.anchorLabel} D-{info.daysToAnchor}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
          <div className="serif" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em' }}>
            {info.subject}{isMinSubj && withMinor && <span style={{ fontSize: 13, opacity: 0.85, marginLeft: 6 }}>+ 국제거래법</span>}
          </div>
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flexWrap: 'wrap' }}>
          <span style={{ background: 'rgba(255,255,255,0.18)', padding: '2px 7px', fontFamily: "'Noto Serif KR', serif", fontWeight: 600, letterSpacing: '0.05em' }}>
            {info.cycleLabel}
          </span>
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
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'none', border: 'none', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <div style={{ textAlign: 'left' }}>
          <div className="kserif" style={{ fontSize: 11, letterSpacing: '0.22em', color: C.muted, fontWeight: 600 }}>15회 변시 기준점</div>
          <div className="serif" style={{ fontSize: 22, fontWeight: 600, color: C.ink, marginTop: 4 }}>
            {PREV_SCORES.grandTotal.toFixed(2)}
            <span style={{ fontSize: 12, color: C.muted, marginLeft: 6, fontWeight: 400 }}>/ {PREV_SCORES.grandMax}</span>
          </div>
        </div>
        <ChevronDown size={18} color={C.muted} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {open && (
        <div style={{ borderTop: `1px dashed ${C.lineSoft}`, padding: '14px 16px 18px', fontSize: 12 }}>
          {Object.keys(SUBJECTS).map(sub => {
            const s = PREV_SCORES[sub];
            const pct = Math.round((s.total / s.max) * 100);
            return (
              <div key={sub} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span className="kserif" style={{ fontWeight: 600, color: SUBJECTS[sub].color }}>{sub}</span>
                  <span className="mono" style={{ color: C.muted, fontSize: 11 }}>{s.total.toFixed(2)} / {s.max} ({pct}%)</span>
                </div>
                <div style={{ height: 3, background: C.lineSoft, position: 'relative', marginBottom: 6 }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: SUBJECTS[sub].color }} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 10, color: C.muted }}>
                  {SUBJECTS[sub].types.map(t => {
                    const v = s[t.key]; if (v === undefined) return null;
                    return <span key={t.key} className="mono"><span style={{ color: C.muted }}>{t.label}</span> <span style={{ color: C.ink }}>{v.toFixed(2)}</span></span>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   HOME
============================================================ */

function HomeView({ today, dday, settings, logs, reviews, todos, tracks, examScores, moods, setMoods, onGoTo }) {
  const todayLog = logs[today] || {};
  const todayMinutes = Object.values(todayLog).reduce((s, v) => s + (v || 0), 0);
  const todayTodos = todos[today] || [];
  const todayTodosOpen = todayTodos.filter(t => !t.done && !t.hidden).length;
  const todayTracks = tracks[today] || {};
  const tracksDone = TRACK_TYPES.filter(tt => todayTracks[tt.key]?.done).length;
  const cycleInfo = useMemo(() => getCycleInfo(today, settings), [today, settings]);
  const tomorrowInfo = useMemo(() => getCycleInfo(addDays(today, 1), settings), [today, settings]);
  const todayMock = useMemo(() => getMockExam(today, settings), [today, settings]);
  const upcomingMock = useMemo(() => nextMockExam(today, settings), [today, settings]);

  const weekStart = weekStartOf(today);
  const weekData = useMemo(() => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      const lg = logs[d] || {};
      const row = { date: d, day: new Date(d + 'T00:00:00').getDate() };
      Object.keys(SUBJECTS).forEach(sub => {
        let sum = 0;
        SUBJECTS[sub].types.forEach(t => { sum += lg[`${sub}::${t.key}`] || 0; });
        row[sub] = Math.round((sum / 60) * 10) / 10;
      });
      arr.push(row);
    }
    return arr;
  }, [logs, today]);

  const weekSubjectMin = useMemo(() => {
    const out = {};
    Object.keys(SUBJECTS).forEach(sub => { out[sub] = 0; });
    weekDays(weekStart).forEach(d => {
      const lg = logs[d] || {};
      Object.keys(SUBJECTS).forEach(sub => {
        SUBJECTS[sub].types.forEach(t => { out[sub] += lg[`${sub}::${t.key}`] || 0; });
      });
    });
    return out;
  }, [logs, weekStart]);

  const weekTotalMin = Object.values(weekSubjectMin).reduce((a, b) => a + b, 0);
  const weekTargetMin = Object.values(settings.weeklyTargets).reduce((a, b) => a + b, 0);
  const weekPct = weekTargetMin ? Math.round((weekTotalMin / weekTargetMin) * 100) : 0;

  const dueReviews = useMemo(() => {
    const list = [];
    reviews.forEach(r => {
      const interval = r.intervals[Math.min(r.cycleIndex, r.intervals.length - 1)];
      const dueDate = addDays(r.lastReviewed, interval);
      if (dueDate <= today) list.push({ ...r, dueDate, roundNum: r.cycleIndex + 1 });
    });
    return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [reviews, today]);

  const daysStudied = Object.keys(logs).filter(d => Object.values(logs[d] || {}).some(v => (v || 0) > 0)).length;

  const streak = useMemo(() => {
    let count = 0;
    for (let i = 0; i < 365; i++) {
      const d = addDays(today, -i);
      const lg = logs[d] || {};
      const mins = Object.values(lg).reduce((s, v) => s + (v || 0), 0);
      if (mins > 0) count++;
      else if (i > 0) break;
    }
    return count;
  }, [logs, today]);

  const recentScores = examScores.slice(-3).reverse();
  const inD30 = dday > 0 && dday <= 30;
  const inD7 = dday > 0 && dday <= 7;

  return (
    <div className="fadeIn" style={{ paddingTop: 20 }}>
      <section style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '28px 22px', marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ width: 18, height: 1, background: C.accent }} />
          <span className="kserif" style={{ fontSize: 10, letterSpacing: '0.25em', color: C.accent, fontWeight: 600 }}>시험까지</span>
        </div>
        <div className="serif" style={{ fontSize: 72, fontWeight: 500, lineHeight: 0.95, color: C.ink, letterSpacing: '-0.03em' }}>
          {Math.abs(dday)}<span style={{ fontSize: 28, color: C.muted, marginLeft: 6 }}>일</span>
        </div>
        <div className="kserif" style={{ marginTop: 14, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
          {fmtKDate(settings.examDate)} · {settings.examLabel}<br />
          누적 <span style={{ color: C.ink, fontWeight: 600 }}>{daysStudied}일</span> · 연속 <span style={{ color: C.accent, fontWeight: 600 }}>{streak}일</span> · 이번 주 <span style={{ color: C.ink, fontWeight: 600 }}>{fmtMin(weekTotalMin)}</span>
        </div>
        <div style={{ position: 'absolute', right: 18, top: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[...Array(8)].map((_, i) => <span key={i} style={{ width: 10, height: 1, background: i < 3 ? C.accent : C.line }} />)}
        </div>
      </section>

      {inD7 && (
        <div style={{ background: C.accent, color: '#fff', padding: '12px 16px', marginBottom: 14, fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="kserif" style={{ fontWeight: 600, fontSize: 13 }}>벼락치기 모드 · D-{dday}</span>
            <span className="mono" style={{ fontSize: 10, opacity: 0.85 }}>D-7 진입</span>
          </div>
          <div style={{ marginTop: 6, opacity: 0.9 }}>핸드북·찌라시·빈출쟁점·요사 위주 · 새 자료 No</div>
        </div>
      )}
      {!inD7 && inD30 && (
        <div style={{ background: '#1A1915', color: '#fff', padding: '12px 16px', marginBottom: 14, fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="kserif" style={{ fontWeight: 600, fontSize: 13 }}>회독 압축 모드 · D-{dday}</span>
            <span className="mono" style={{ fontSize: 10, opacity: 0.7 }}>D-30 진입</span>
          </div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>회차 회독 위주로 · 객관식 복수 회차/일</div>
        </div>
      )}

      {todayMock ? (
        <div style={{ marginBottom: 18 }}>
          <div style={{ background: C.accent, color: '#fff', padding: '18px 20px', position: 'relative', overflow: 'hidden', border: `1px solid ${C.accent}` }}>
            <div style={{ position: 'absolute', right: -10, top: -12, opacity: 0.14, fontSize: 120, fontWeight: 700, fontFamily: "'Fraunces', serif", lineHeight: 1 }}>!</div>
            <div style={{ position: 'relative' }}>
              <div className="kserif" style={{ fontSize: 10, letterSpacing: '0.22em', opacity: 0.85, fontWeight: 500 }}>오늘은 모의고사</div>
              <div className="serif" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em', marginTop: 6 }}>{todayMock.label}</div>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <span className="mono" style={{ opacity: 0.9 }}>
                  {todayMock.dayNum}/{todayMock.totalDays}일차 · {todayMock.start.slice(5)} ~ {todayMock.end.slice(5)}
                </span>
              </div>
              <div style={{ marginTop: 10, height: 3, background: 'rgba(255,255,255,0.2)' }}>
                <div style={{ height: '100%', width: `${(todayMock.dayNum / todayMock.totalDays) * 100}%`, background: '#fff' }} />
              </div>
            </div>
          </div>
        </div>
      ) : cycleInfo ? (
        <div style={{ marginBottom: 18 }}>
          <CycleCard info={cycleInfo} today={today} />
          {tomorrowInfo && tomorrowInfo.subject !== cycleInfo.subject && (
            <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: 'none', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: C.muted, letterSpacing: '0.05em' }}>내일부터 →</span>
              <span className="kserif" style={{ color: SUBJECTS[tomorrowInfo.subject].color, fontWeight: 600 }}>
                {tomorrowInfo.subject}{tomorrowInfo.subject === '민사법' && ' + 국제거래법'}
                <span className="mono" style={{ color: C.muted, fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
                  {tomorrowInfo.cycleLabel} · {tomorrowInfo.blockDays}일
                </span>
              </span>
            </div>
          )}
          {upcomingMock && (
            <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: 'none', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: C.muted, letterSpacing: '0.05em' }}>다음 모의고사</span>
              <span className="kserif" style={{ color: C.accent, fontWeight: 600 }}>
                {upcomingMock.label}
                <span className="mono" style={{ color: C.muted, fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
                  D-{daysDiff(today, upcomingMock.start)} · {upcomingMock.start.slice(5)}
                </span>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: C.paper, border: `1px dashed ${C.line}`, padding: '18px', marginBottom: 18, fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 1.6 }}>
          {settings.mockExams && settings.mockExams.length > 0
            ? '사이클을 표시할 기준 모의고사가 없습니다.'
            : '모의고사 또는 본시험 일정을 등록해 주세요.'}
        </div>
      )}

      <SectionTitle action={{ label: '기록', onClick: () => onGoTo('log') }}>오늘 트랙 · {tracksDone}/5</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '10px 12px', marginBottom: 18 }}>
        {TRACK_TYPES.map(tt => {
          const slot = todayTracks[tt.key] || {};
          return (
            <div key={tt.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px dashed ${C.lineSoft}` }}>
              <span style={{
                width: 22, height: 22, background: slot.done ? tt.color : 'transparent',
                color: slot.done ? '#fff' : tt.color, border: `1px solid ${tt.color}`,
                display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
                fontFamily: "'Noto Serif KR', serif", flexShrink: 0,
              }}>{tt.short}</span>
              <span className="kserif" style={{ fontSize: 11.5, color: C.muted, minWidth: 74 }}>{tt.label}</span>
              <span className="kserif" style={{
                fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: slot.done ? C.ink : C.muted, fontWeight: slot.done ? 500 : 400,
                fontStyle: slot.text ? 'normal' : 'italic',
              }}>
                {slot.text || <span style={{ opacity: 0.5 }}>—</span>}
              </span>
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
      <input
        value={moods[today] || ''}
        onChange={e => setMoods(prev => ({ ...prev, [today]: e.target.value }))}
        onBlur={() => {
          if (!moods[today]) {
            setMoods(prev => { const next = { ...prev }; delete next[today]; return next; });
          }
        }}
        placeholder="컨디션, 느낀점, 한줄메모 (예: 공동저당 어렵다, 노잼)"
        style={{
          width: '100%', background: C.paper, border: `1px solid ${C.line}`,
          padding: '12px 14px', fontSize: 13, outline: 'none', marginBottom: 22,
          fontFamily: "'Noto Serif KR', serif",
        }}
      />

      <SectionTitle action={{ label: '리포트', onClick: () => onGoTo('report') }}>이번 주 목표 · {weekPct}%</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '14px 16px', marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span className="mono" style={{ fontSize: 11, color: C.muted }}>{weekStart.slice(5)} ~ {addDays(weekStart, 6).slice(5)}</span>
          <span className="serif" style={{ fontSize: 15, fontWeight: 600 }}>
            {fmtHour(weekTotalMin)}<span style={{ color: C.muted, fontSize: 11, fontWeight: 400 }}> / {fmtHour(weekTargetMin)}</span>
          </span>
        </div>
        {Object.keys(SUBJECTS).map(sub => {
          const cur = weekSubjectMin[sub] || 0;
          const tgt = settings.weeklyTargets[sub] || 0;
          const pct = tgt ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
          const over = tgt && cur > tgt;
          return (
            <div key={sub} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span className="kserif" style={{ color: SUBJECTS[sub].color, fontWeight: 600 }}>{sub}</span>
                <span className="mono" style={{ color: C.muted, fontSize: 11 }}>
                  {fmtHour(cur)} / {fmtHour(tgt)} <span style={{ color: over ? C.good : pct >= 80 ? C.ink : C.muted, fontWeight: 600 }}>{pct}%</span>
                </span>
              </div>
              <div style={{ height: 4, background: C.lineSoft, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: SUBJECTS[sub].color, transition: 'width .3s ease' }} />
              </div>
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
                <span className="kserif" style={{ color: SUBJECTS[s.subject]?.color, fontWeight: 600 }}>
                  {s.round}회 {s.subject.replace('법', '')}
                </span>
                <span className="mono" style={{ color: C.ink }}>
                  <span style={{ color: C.accent, fontWeight: 600 }}>{s.wrong}</span>
                  <span style={{ color: C.muted }}> 틀림 · {s.date.slice(5)}</span>
                </span>
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
              <Tooltip cursor={{ fill: C.lineSoft }}
                contentStyle={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 0, fontSize: 12 }}
                formatter={(v, name) => [`${v}h`, name]} labelFormatter={(l) => `${l}일`} />
              {Object.keys(SUBJECTS).map(sub => <Bar key={sub} dataKey={sub} stackId="a" fill={SUBJECTS[sub].color} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingTop: 10, borderTop: `1px dashed ${C.lineSoft}`, justifyContent: 'center' }}>
          {Object.keys(SUBJECTS).map(sub => (
            <span key={sub} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted }}>
              <span style={{ width: 8, height: 8, background: SUBJECTS[sub].color, display: 'inline-block' }} />{sub}
            </span>
          ))}
        </div>
      </div>

      {dueReviews.length > 0 && (
        <>
          <SectionTitle action={{ label: '전체', onClick
