import React, { useState, useEffect, useMemo } from 'react';
import { auth, db, provider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
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
   THEME & DATA (하드코딩된 이름 제거, 표준 따옴표 사용)
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

  // Auto-generate mock review todos
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

  const login = () => signInWithPopup(auth, provider);
  const logout = () => signOut(auth).then(() => window.location.reload());

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

  const dday = useMemo(() => daysDiff(today, settings.examDate), [today, settings.examDate]);

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
          <SectionTitle action={{ label: '전체', onClick: () => onGoTo('review') }}>오늘 회독</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
            {dueReviews.slice(0, 4).map(r => (
              <button key={r.id} onClick={() => onGoTo('review')} className="lift"
                style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <span style={{ width: 3, alignSelf: 'stretch', background: SUBJECTS[r.subject]?.color || C.muted }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="kserif" style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{r.subject} · {r.roundNum}회독</div>
                  </div>
                </div>
                <span className="serif" style={{ fontSize: 13, color: C.accent, fontWeight: 600 }}>
                  {r.dueDate === today ? 'TODAY' : `${daysDiff(r.dueDate, today)}일 지남`}
                </span>
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

/* ============================================================
   CALENDAR
============================================================ */

function CalendarView({ today, logs, reviews, todos, setTodos, settings, tracks, schedules, setSchedules, moods, setMoods, onGoToLog }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(today + 'T00:00:00');
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);

  const reviewsByDate = useMemo(() => {
    const map = {};
    reviews.forEach(r => {
      const interval = r.intervals[Math.min(r.cycleIndex, r.intervals.length - 1)];
      const dueDate = addDays(r.lastReviewed, interval);
      if (!map[dueDate]) map[dueDate] = [];
      map[dueDate].push({ id: r.id, title: r.title, subject: r.subject, num: r.cycleIndex + 1 });
    });
    return map;
  }, [reviews]);

  function dayMinutes(d) {
    const lg = logs[d] || {};
    return Object.values(lg).reduce((s, v) => s + (v || 0), 0);
  }
  function intensity(mins) {
    if (mins === 0) return 0;
    if (mins < 60) return 1;
    if (mins < 180) return 2;
    if (mins < 360) return 3;
    return 4;
  }
  const intensityBg = ['transparent', '#EDE5D2', '#DFD3B5', '#C9B98E', '#A88E55'];

  function prevMonth() { setCursor(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }); }
  function nextMonth() { setCursor(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }); }
  function jumpToday() {
    const d = new Date(today + 'T00:00:00');
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(today);
  }

  const monthName = `${cursor.y}.${String(cursor.m + 1).padStart(2, '0')}`;
  const selDate = selected;
  const selLog = logs[selDate] || {};
  const selMinutes = Object.values(selLog).reduce((s, v) => s + (v || 0), 0);
  const selTodos = (todos[selDate] || []).filter(t => !t.hidden);
  const selDueReviews = (reviewsByDate[selDate] || []);
  const selCycleInfo = useMemo(() => getCycleInfo(selDate, settings), [selDate, settings]);
  const selMock = useMemo(() => getMockExam(selDate, settings), [selDate, settings]);
  const selTracks = tracks[selDate] || {};

  function addTodo(title) {
    const t = title.trim(); if (!t) return;
    setTodos(prev => ({ ...prev, [selDate]: [...(prev[selDate] || []), { id: uid(), title: t, done: false }] }));
  }
  function toggleTodo(id) {
    setTodos(prev => ({ ...prev, [selDate]: (prev[selDate] || []).map(t => t.id === id ? { ...t, done: !t.done } : t) }));
  }
  function removeTodo(id) {
    setTodos(prev => {
      const next = (prev[selDate] || []).filter(t => t.id !== id);
      const out = { ...prev };
      if (next.length === 0) delete out[selDate]; else out[selDate] = next;
      return out;
    });
  }

  return (
    <div className="fadeIn" style={{ paddingTop: 20 }}>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', marginBottom: 12 }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: C.ink }}><ChevronLeft size={18} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="serif" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{monthName}</div>
          <button onClick={jumpToday}
            style={{ background: 'transparent', border: `1px solid ${C.line}`, color: C.muted, padding: '3px 8px', fontSize: 10, cursor: 'pointer', letterSpacing: '0.1em', fontFamily: "'Noto Serif KR', serif" }}>
            오늘
          </button>
        </div>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: C.ink }}><ChevronRight size={18} /></button>
      </div>

      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '10px 8px', marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div key={d} className="kserif" style={{
              textAlign: 'center', fontSize: 10, padding: '4px 0',
              color: i === 0 ? C.accent : i === 6 ? '#1E3A5F' : C.muted,
              letterSpacing: '0.1em', fontWeight: 600,
            }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((d, i) => {
            const dt = new Date(d + 'T00:00:00');
            const inMonth = dt.getMonth() === cursor.m;
            const isToday = d === today;
            const isSelected = d === selected;
            const dow = dt.getDay();
            const mins = dayMinutes(d);
            const intLevel = intensity(mins);
            const reviewsOnDay = reviewsByDate[d] || [];
            const todosOnDay = (todos[d] || []).filter(t => !t.hidden);
            const todoOpen = todosOnDay.filter(t => !t.done).length;
            const cInfo = getCycleInfo(d, settings);
            const cycleColor = cInfo ? SUBJECTS[cInfo.subject].color : null;
            const isBlockFirst = cInfo?.dayInBlock === 1;
            const mock = getMockExam(d, settings);
            const isMockFirst = mock && d === mock.start;
            const schedulesOnDay = (schedules || []).filter(s => d >= s.start && d <= s.end);

            return (
              <button key={i} onClick={() => setSelected(d)}
                style={{
                  position: 'relative', aspectRatio: '1 / 1.15',
                  background: isSelected ? C.ink : (mock ? '#FBE4E4' : intensityBg[intLevel]),
                  border: isToday && !isSelected ? `1.5px solid ${C.accent}` : `1px solid ${isSelected ? C.ink : 'transparent'}`,
                  cursor: 'pointer', padding: '3px 3px 2px',
                  display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                  opacity: inMonth ? 1 : 0.35,
                  color: isSelected ? C.paper : C.ink, overflow: 'hidden',
                }}>
                {mock && (<div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: C.accent, opacity: isSelected ? 0.85 : 1 }} />)}
                {!mock && cycleColor && (<div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: cycleColor, opacity: isSelected ? 0.85 : 1 }} />)}
                
                <div style={{
                  fontSize: 11, fontWeight: isToday ? 700 : 500,
                  textAlign: 'left', lineHeight: 1, marginTop: (cycleColor || mock) ? 4 : 1,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: isSelected ? C.paper : (mock ? C.accent : (dow === 0 ? C.accent : dow === 6 ? '#1E3A5F' : C.ink)),
                }}>{dt.getDate()}</div>
                
                {schedulesOnDay.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, width: '100%', zIndex: 2 }}>
                    {schedulesOnDay.map(sch => {
                      const isStart = sch.start === d;
                      const isEnd = sch.end === d;
                      return (
                        <div key={sch.id} style={{
                          height: 4, background: sch.color || '#4A90E2',
                          marginLeft: isStart ? 2 : -5, marginRight: isEnd ? 2 : -5,
                          borderRadius: `${isStart ? 2 : 0}px ${isEnd ? 2 : 0}px ${isEnd ? 2 : 0}px ${isStart ? 2 : 0}px`,
                          opacity: isSelected ? 1 : 0.75
                        }} />
                      );
                    })}
                  </div>
                )}

                {mock ? (
                  <div style={{ fontSize: 9, fontFamily: "'Noto Serif KR', serif", fontWeight: 700, color: isSelected ? C.paper : C.accent, textAlign: 'center', marginTop: 2, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                    {isMockFirst ? '모의' : '시험'}
                    <div style={{ fontSize: 8, marginTop: 1, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, opacity: 0.85 }}>{mock.dayNum}일차</div>
                  </div>
                ) : cInfo && (
                  <div style={{ fontSize: 11, fontFamily: "'Noto Serif KR', serif", fontWeight: 700, color: isSelected ? C.paper : cycleColor, textAlign: 'center', marginTop: 2, opacity: isSelected ? 0.95 : (isBlockFirst ? 1 : 0.78) }}>
                    {SUBJECTS[cInfo.subject].short}
                    <span style={{ fontSize: 8, marginLeft: 1, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, opacity: 0.7 }}>{cInfo.dayInBlock}</span>
                  </div>
                )}
                
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
                  {reviewsOnDay.length > 0 && (
                    <div style={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
                      {[...new Set(reviewsOnDay.map(r => r.subject))].slice(0, 4).map((sub, idx) => (
                        <span key={idx} style={{ width: 3, height: 3, borderRadius: '50%', background: SUBJECTS[sub]?.color || C.muted, opacity: isSelected ? 0.95 : 1 }} />
                      ))}
                    </div>
                  )}
                  {todoOpen > 0 && (
                    <span style={{ fontSize: 8, fontWeight: 700, color: isSelected ? C.paper : C.accent, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>✓{todoOpen}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', paddingTop: 10, marginTop: 6, borderTop: `1px dashed ${C.lineSoft}`, fontSize: 10, color: C.muted }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 18, height: 3, background: C.accent }} /><span>모의고사</span></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'flex', gap: 1 }}>
              {Object.keys(SUBJECTS).slice(0, 3).map(sub => (<span key={sub} style={{ width: 8, height: 3, background: SUBJECTS[sub].color }} />))}
            </span>
            <span>사이클</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'flex', gap: 1 }}>
              {intensityBg.slice(1).map((bg, i) => (<span key={i} style={{ width: 7, height: 7, background: bg, border: `1px solid ${C.lineSoft}` }} />))}
            </span>
            <span>공부량</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: C.accent }} /><span>회독</span></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ fontSize: 9, color: C.accent, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>✓N</span><span>할일</span></span>
        </div>
      </div>

      <DayDetail
        date={selDate} minutes={selMinutes} log={selLog} todos={selTodos} dueReviews={selDueReviews}
        cycleInfo={selCycleInfo} mock={selMock} tracks={selTracks} schedules={schedules} setSchedules={setSchedules}
        mood={moods[selDate] || ''}
        setMood={(v) => setMoods(prev => {
          const next = { ...prev };
          if (v) next[selDate] = v; else delete next[selDate];
          return next;
        })}
        onAddTodo={addTodo} onToggleTodo={toggleTodo} onRemoveTodo={removeTodo}
        onGoToLog={onGoToLog} isToday={selDate === today}
      />

      <div style={{ height: 20 }} />
    </div>
  );
}

function DayDetail({ date, minutes, log, todos, dueReviews, cycleInfo, mock, tracks, schedules, setSchedules, mood, setMood, onAddTodo, onToggleTodo, onRemoveTodo, onGoToLog, isToday }) {
  const [newTodo, setNewTodo] = useState('');
  const [moodLocal, setMoodLocal] = useState(mood);
  const [newSchTitle, setNewSchTitle] = useState('');
  const [newSchEnd, setNewSchEnd] = useState(date);
  
  useEffect(() => { setMoodLocal(mood); }, [mood, date]);
  useEffect(() => { setNewSchEnd(date); }, [date]);

  const subjectMin = useMemo(() => {
    const out = {};
    Object.keys(SUBJECTS).forEach(sub => {
      let m = 0;
      SUBJECTS[sub].types.forEach(t => { m += log[`${sub}::${t.key}`] || 0; });
      if (m > 0) out[sub] = m;
    });
    return out;
  }, [log]);

  const openTodos = todos.filter(t => !t.done);
  const doneTodos = todos.filter(t => t.done);
  const tracksDoneCount = TRACK_TYPES.filter(tt => tracks[tt.key]?.done).length;
  const hasTrackData = TRACK_TYPES.some(tt => tracks[tt.key]?.done || tracks[tt.key]?.text);
  const activeSchedules = (schedules || []).filter(s => date >= s.start && date <= s.end);

  function submit() { onAddTodo(newTodo); setNewTodo(''); }
  
  function submitSchedule() {
    if (!newSchTitle.trim() || !newSchEnd) return;
    const start = date <= newSchEnd ? date : newSchEnd;
    const end = date <= newSchEnd ? newSchEnd : date;
    setSchedules([...schedules, { id: uid(), title: newSchTitle.trim(), start, end, color: '#4A90E2' }]);
    setNewSchTitle('');
  }
  function removeSchedule(id) { setSchedules(schedules.filter(s => s.id !== id)); }

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.lineSoft}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div className="kserif" style={{ fontSize: 15, fontWeight: 600 }}>{fmtKDate(date)}</div>
          {isToday && <span className="kserif" style={{ fontSize: 10, color: C.accent, marginLeft: 6, letterSpacing: '0.1em', fontWeight: 600 }}>TODAY</span>}
        </div>
        <span className="serif mono" style={{ fontSize: 14, fontWeight: 600, color: minutes > 0 ? C.ink : C.muted }}>{fmtMin(minutes)}</span>
      </div>

      {mock && (
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.lineSoft}`, background: C.accent, color: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <span className="serif" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{mock.label.match(/\d/)?.[0] || '!'}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="kserif" style={{ fontSize: 14, fontWeight: 600 }}>{mock.label}</div>
            <div className="mono" style={{ fontSize: 10.5, opacity: 0.9, marginTop: 2 }}>{mock.dayNum}/{mock.totalDays}일차 · {mock.start.slice(5)} ~ {mock.end.slice(5)}</div>
          </div>
        </div>
      )}

      {cycleInfo && !mock && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.lineSoft}`, background: SUBJECTS[cycleInfo.subject].color, color: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <span className="serif" style={{ fontSize: 18, fontWeight: 700 }}>{SUBJECTS[cycleInfo.subject].short}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="kserif" style={{ fontSize: 14, fontWeight: 600 }}>
              {cycleInfo.subject}{cycleInfo.subject === '민사법' && ' + 국제거래법'}
            </div>
            <div className="mono" style={{ fontSize: 10.5, opacity: 0.9, marginTop: 2 }}>{cycleInfo.cycleLabel} · 블록 {cycleInfo.dayInBlock}/{cycleInfo.blockDays}일</div>
          </div>
          {cycleInfo.isBlockLast && (
            <div style={{ fontSize: 10, padding: '3px 8px', background: 'rgba(255,255,255,0.2)', fontFamily: "'Noto Serif KR', serif", fontWeight: 600, letterSpacing: '0.05em' }}>블록 마지막날</div>
          )}
        </div>
      )}

      {hasTrackData && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.lineSoft}` }}>
          <div className="kserif" style={{ fontSize: 10, letterSpacing: '0.2em', color: C.muted, fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>오늘 트랙</span>
            <span className="mono" style={{ letterSpacing: 0, fontSize: 10 }}>{tracksDoneCount}/5</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TRACK_TYPES.map(tt => {
              const slot = tracks[tt.key];
              if (!slot?.done && !slot?.text) return null;
              return (
                <div key={tt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{
                    width: 18, height: 18, background: slot.done ? tt.color : 'transparent',
                    color: slot.done ? '#fff' : tt.color, border: `1px solid ${tt.color}`,
                    display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700,
                    fontFamily: "'Noto Serif KR', serif", flexShrink: 0,
                  }}>{tt.short}</span>
                  <span className="kserif" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: slot.done ? C.ink : C.muted }}>
                    {slot.text || tt.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(subjectMin).length > 0 && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.lineSoft}`, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(subjectMin).map(([sub, m]) => (
            <span key={sub} className="kserif" style={{
              fontSize: 11, padding: '3px 8px',
              border: `1px solid ${SUBJECTS[sub].color}`,
              color: SUBJECTS[sub].color, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              {sub}<span className="mono" style={{ fontWeight: 400, opacity: 0.85 }}>{fmtHour(m)}</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.lineSoft}` }}>
        <div className="kserif" style={{ fontSize: 10, letterSpacing: '0.2em', color: C.muted, fontWeight: 600, marginBottom: 6 }}>한 줄</div>
        <input
          value={moodLocal}
          onChange={e => setMoodLocal(e.target.value)}
          onBlur={() => setMood(moodLocal.trim())}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
          placeholder="컨디션·느낀점 메모"
          style={{ width: '100%', background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: "'Noto Serif KR', serif" }}
        />
      </div>

      {dueReviews.length > 0 && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.lineSoft}` }}>
          <div className="kserif" style={{ fontSize: 10, letterSpacing: '0.2em', color: C.muted, fontWeight: 600, marginBottom: 8 }}>회독</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dueReviews.map((r, i) => (
              <div key={`due-${r.id}-${r.num}-${i}`} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', background: C.bg, border: `1px solid ${C.lineSoft}`,
                borderLeft: `3px solid ${SUBJECTS[r.subject]?.color || C.muted}`,
              }}>
                <span className="serif" style={{
                  fontSize: 11, fontWeight: 600, color: '#fff',
                  background: SUBJECTS[r.subject]?.color || C.muted,
                  padding: '2px 6px', minWidth: 36, textAlign: 'center',
                }}>{r.num}회독</span>
                <span className="kserif" style={{ flex: 1, fontSize: 13, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.lineSoft}` }}>
        <div className="kserif" style={{ fontSize: 10, letterSpacing: '0.2em', color: C.muted, fontWeight: 600, marginBottom: 8 }}>장기 일정 (인강 등)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {activeSchedules.map(sch => (
            <div key={sch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: `1px dashed ${C.lineSoft}` }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: sch.color }} />
              <span className="kserif" style={{ flex: 1, fontSize: 12 }}>{sch.title}</span>
              <span className="mono" style={{ fontSize: 10, color: C.muted }}>{sch.start.slice(5)} ~ {sch.end.slice(5)}</span>
              <button onClick={() => removeSchedule(sch.id)} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: C.muted }}><X size={12} /></button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={newSchTitle} onChange={e => setNewSchTitle(e.target.value)} placeholder="일정명 (예: 헌법 인강)"
            style={{ flex: 1, minWidth: 120, border: `1px solid ${C.line}`, background: C.bg, padding: '8px 10px', fontSize: 12, outline: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: C.muted }}>~</span>
            <input type="date" value={newSchEnd} onChange={e => setNewSchEnd(e.target.value)}
              style={{ width: 110, border: `1px solid ${C.line}`, background: C.bg, padding: '7px', fontSize: 11, outline: 'none' }} />
            <button onClick={submitSchedule} className="lift" style={{ background: newSchTitle.trim() ? '#4A90E2' : C.line, color: '#fff', border: 'none', padding: '0 12px', fontSize: 12, cursor: newSchTitle.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', alignSelf: 'stretch' }}>
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 16px' }}>
        <div className="kserif" style={{ fontSize: 10, letterSpacing: '0.2em', color: C.muted, fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span>할 일</span>
          {todos.length > 0 && <span className="mono" style={{ letterSpacing: 0, fontSize: 10 }}>{doneTodos.length}/{todos.length}</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {openTodos.map(t => <TodoRow key={t.id} todo={t} onToggle={() => onToggleTodo(t.id)} onRemove={() => onRemoveTodo(t.id)} />)}
          {doneTodos.map(t => <TodoRow key={t.id} todo={t} onToggle={() => onToggleTodo(t.id)} onRemove={() => onRemoveTodo(t.id)} />)}
          {todos.length === 0 && <div style={{ fontSize: 12, color: C.muted, padding: '8px 0' }}>등록된 할 일이 없습니다.</div>}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newTodo} onChange={e => setNewTodo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="할 일 추가"
            style={{ flex: 1, border: `1px solid ${C.line}`, background: C.bg, padding: '8px 10px', fontSize: 12, outline: 'none' }} />
          <button onClick={submit} disabled={!newTodo.trim()} className="lift"
            style={{ background: newTodo.trim() ? C.accent : C.line, color: '#fff', border: 'none', padding: '0 12px', fontSize: 12, cursor: newTodo.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center' }}>
            <Plus size={14} />
          </button>
        </div>

        {isToday && (
          <button onClick={onGoToLog}
            style={{ width: '100%', marginTop: 10, background: 'transparent', border: `1px solid ${C.line}`, color: C.ink, padding: '8px', fontSize: 11, cursor: 'pointer', fontFamily: "'Noto Serif KR', serif", letterSpacing: '0.05em' }}>
            오늘 공부 기록하러 가기 →
          </button>
        )}
      </div>
    </div>
  );
}

function TodoRow({ todo, onToggle, onRemove }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: `1px dashed ${C.lineSoft}` }}>
      <button onClick={onToggle} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: todo.done ? C.good : C.muted, display: 'flex' }}>
        {todo.done ? <CheckSquare size={16} strokeWidth={2} /> : <Square size={16} strokeWidth={1.5} />}
      </button>
      <span className="kserif" style={{
        flex: 1, fontSize: 13, minWidth: 0,
        textDecoration: todo.done ? 'line-through' : 'none',
        color: todo.done ? C.muted : C.ink, wordBreak: 'keep-all',
      }}>
        {todo.title}
        {todo.fromMock && <span style={{ fontSize: 9, color: C.accent, marginLeft: 6, fontFamily: "'JetBrains Mono', monospace" }}>모의리뷰</span>}
      </span>
      <button onClick={onRemove} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: C.muted, display: 'flex' }}>
        <X size={12} />
      </button>
    </div>
  );
}

/* ============================================================
   LOG
============================================================ */

function LogView({ today, settings, logs, setLogs, tracks, setTracks, examScores, setExamScores, initialDate }) {
  const [date, setDate] = useState(initialDate || today);

  return (
    <div className="fadeIn" style={{ padding: '18px 0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8 }}>
        <button onClick={() => setDate(addDays(date, -1))} style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '7px 10px', cursor: 'pointer' }}>
          <ChevronLeft size={14} />
        </button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ flex: 1, background: C.paper, border: `1px solid ${C.line}`, padding: '8px 10px', fontSize: 13, textAlign: 'center', outline: 'none' }} />
        <button onClick={() => setDate(addDays(date, 1))} style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '7px 10px', cursor: 'pointer' }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {date !== today && (
        <button onClick={() => setDate(today)} style={{ background: 'none', border: 'none', color: C.accent, fontSize: 11, cursor: 'pointer', marginBottom: 12 }}>오늘로 돌아가기 →</button>
      )}

      <TracksSection date={date} tracks={tracks} setTracks={setTracks} />
      <TimeSection date={date} logs={logs} setLogs={setLogs} settings={settings} />
      <ScoresSection date={date} examScores={examScores} setExamScores={setExamScores} />
    </div>
  );
}

function TracksSection({ date, tracks, setTracks }) {
  const dayTracks = tracks[date] || {};

  function toggle(key) {
    const cur = dayTracks[key] || {};
    const updated = { ...dayTracks, [key]: { ...cur, done: !cur.done } };
    setTracks({ ...tracks, [date]: updated });
  }
  function setText(key, text) {
    const cur = dayTracks[key] || {};
    const updated = { ...dayTracks, [key]: { ...cur, text } };
    setTracks({ ...tracks, [date]: updated });
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <SectionTitle>오늘의 5트랙</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '4px 0' }}>
        {TRACK_TYPES.map((t, i) => {
          const v = dayTracks[t.key] || {};
          return (
            <div key={t.key} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderBottom: i < TRACK_TYPES.length - 1 ? `1px dashed ${C.lineSoft}` : 'none',
            }}>
              <button onClick={() => toggle(t.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                {v.done ? <CheckSquare size={18} color={t.color} /> : <Square size={18} color={C.muted} />}
              </button>
              <div style={{ width: 28, fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16, color: t.color, textAlign: 'center', flexShrink: 0 }}>
                {t.short}
              </div>
              <input
                value={v.text || ''}
                onChange={e => setText(t.key, e.target.value)}
                placeholder={t.placeholder}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 12, color: C.ink, padding: '2px 0',
                  textDecoration: v.done && !v.text ? 'none' : 'none',
                }}
              />
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
    const key = `${subj}::${type}`;
    const next = { ...dl };
    if (val > 0) next[key] = val;
    else delete next[key];
    const all = { ...logs };
    if (Object.keys(next).length === 0) delete all[date];
    else all[date] = next;
    setLogs(all);
  }

  const subTotals = {};
  Object.entries(dl).forEach(([k, v]) => {
    const [s] = k.split('::');
    subTotals[s] = (subTotals[s] || 0) + (v || 0);
  });
  const grandTotal = Object.values(dl).reduce((a, b) => a + b, 0);

  return (
    <div style={{ marginBottom: 24 }}>
      <SectionTitle>학습 시간 (분)</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        {Object.keys(SUBJECTS).map((sub, si) => {
          const meta = SUBJECTS[sub];
          const sTot = subTotals[sub] || 0;
          return (
            <div key={sub} style={{ borderTop: si > 0 ? `1px solid ${C.lineSoft}` : 'none', padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span className="kserif" style={{ fontSize: 13, fontWeight: 600, color: meta.color }}>{sub}</span>
                <span className="mono" style={{ fontSize: 11, color: C.muted }}>{fmtMin(sTot)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {meta.types.map(t => {
                  const key = `${sub}::${t.key}`;
                  return <TypeEntry key={key} label={t.label} value={dl[key] || 0} onChange={v => setMin(sub, t.key, v)} color={meta.color} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
      {grandTotal > 0 && (
        <div style={{ textAlign: 'right', marginTop: 8, fontSize: 12, color: C.muted }}>
          합계 <span className="mono" style={{ color: C.ink, fontWeight: 600 }}>{fmtMin(grandTotal)}</span>
        </div>
      )}
    </div>
  );
}

function TypeEntry({ label, value, onChange, color }) {
  function bump(d) { onChange(Math.max(0, value + d)); }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '4px 6px' }}>
      <span style={{ fontSize: 10, color: C.muted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <button onClick={() => bump(-15)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: C.muted }}>
        <Minus size={11} />
      </button>
      <input type="number" inputMode="numeric" value={value || ''} onChange={e => onChange(parseInt(e.target.value) || 0)}
        style={{ width: 36, textAlign: 'center', background: 'transparent', border: 'none', outline: 'none', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: value > 0 ? color : C.muted, fontWeight: 600 }} />
      <button onClick={() => bump(15)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: C.muted }}>
        <Plus size={11} />
      </button>
    </div>
  );
}

function ScoresSection({ date, examScores, setExamScores }) {
  const [round, setRound] = useState('');
  const [subject, setSubject] = useState('공법');
  const [wrong, setWrong] = useState('');
  const [total, setTotal] = useState('');
  const [note, setNote] = useState('');

  const todays = examScores.filter(s => s.date === date).sort((a,b) => (a.subject + a.round).localeCompare(b.subject + b.round));

  function add() {
    if (!round || wrong === '') return;
    const newScore = {
      id: uid(), date, round: parseInt(round), subject, type: '선택형',
      wrong: parseInt(wrong), total: total ? parseInt(total) : null, note: note.trim() || null,
    };
    setExamScores([...examScores, newScore]);
    setRound(''); setWrong(''); setTotal(''); setNote('');
  }
  
  function del(id) { setExamScores(examScores.filter(s => s.id !== id)); }

  return (
    <div style={{ marginBottom: 24 }}>
      <SectionTitle>객관식 회차 점수</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '12px 14px' }}>
        {todays.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {todays.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0', borderBottom: `1px dashed ${C.lineSoft}`, fontSize: 12 }}>
                <span style={{ color: SUBJECTS[s.subject].color, fontWeight: 600, minWidth: 40 }}>{SUBJECTS[s.subject].short}</span>
                <span className="mono" style={{ color: C.muted, minWidth: 30 }}>{s.round}회</span>
                <span className="mono" style={{ color: C.ink, minWidth: 40 }}>-{s.wrong}{s.total ? `/${s.total}` : ''}</span>
                <span style={{ flex: 1, color: C.muted, fontSize: 11 }}>{s.note || ''}</span>
                <button onClick={() => del(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <X size={12} color={C.muted} />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={subject} onChange={e => setSubject(e.target.value)} style={{ flex: 1.2, background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '8px', fontSize: 12, outline: 'none' }}>
              {Object.keys(SUBJECTS).filter(s => s !== '국제거래법').map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input value={round} onChange={e => setRound(e.target.value)} placeholder="회차" type="number" inputMode="numeric"
              style={{ flex: 1, background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '8px', fontSize: 12, outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={wrong} onChange={e => setWrong(e.target.value)} placeholder="틀린 개수" type="number" inputMode="numeric"
              style={{ flex: 1, background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '8px', fontSize: 12, outline: 'none' }} />
            <input value={total} onChange={e => setTotal(e.target.value)} placeholder="총 문제" type="number" inputMode="numeric"
              style={{ flex: 1, background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '8px', fontSize: 12, outline: 'none' }} />
            <button onClick={add} style={{ background: C.ink, color: '#fff', border: 'none', padding: '0 18px', cursor: 'pointer', fontSize: 16 }}>+</button>
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="메모(선택)"
            style={{ width: '100%', background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '8px', fontSize: 12, outline: 'none' }} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   EXAMS
============================================================ */

function ExamsView({ examScores }) {
  const [filterSubject, setFilterSubject] = useState('전체');

  const matrix = useMemo(() => {
    const m = {};
    Object.keys(SUBJECTS).filter(s => s !== '국제거래법').forEach(s => { m[s] = {}; });
    examScores.forEach(s => {
      if (m[s.subject]) {
        const cur = m[s.subject][s.round];
        if (!cur || s.date > cur.date) m[s.subject][s.round] = s;
      }
    });
    return m;
  }, [examScores]);

  const allRounds = useMemo(() => {
    const set = new Set();
    examScores.forEach(s => set.add(s.round));
    return [...set].sort((a,b) => a - b);
  }, [examScores]);

  const chartData = useMemo(() => {
    const data = [];
    allRounds.forEach(r => {
      const row = { round: `${r}회` };
      Object.keys(matrix).forEach(sub => {
        const s = matrix[sub][r];
        if (s) row[sub] = s.wrong;
      });
      data.push(row);
    });
    return data;
  }, [allRounds, matrix]);

  const subjects = Object.keys(SUBJECTS).filter(s => s !== '국제거래법');
  const filteredScores = filterSubject === '전체' ? examScores : examScores.filter(s => s.subject === filterSubject);
  const sortedScores = [...filteredScores].sort((a,b) => b.date.localeCompare(a.date));

  return (
    <div className="fadeIn" style={{ padding: '18px 0 24px' }}>
      <div style={{ marginBottom: 6 }}>
        <h1 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>기출 회차</h1>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>객관식 회차별 틀린 개수 추이</div>
      </div>

      {chartData.length === 0 ? (
        <div style={{ background: C.paper, border: `1px dashed ${C.line}`, padding: 24, textAlign: 'center', fontSize: 12, color: C.muted, margin: '18px 0' }}>
          기록 탭에서 회차 점수를 입력해 보세요
        </div>
      ) : (
        <>
          <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '16px 12px 12px', margin: '14px 0 18px' }}>
            <div className="kserif" style={{ fontSize: 10, color: C.muted, letterSpacing: '0.18em', marginBottom: 10, paddingLeft: 4, fontWeight: 600 }}>틀린 개수 추이</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                <CartesianGrid stroke={C.lineSoft} strokeDasharray="3 3" />
                <XAxis dataKey="round" tick={{ fontSize: 10, fill: C.muted }} />
                <YAxis reversed tick={{ fontSize: 10, fill: C.muted }} />
                <Tooltip contentStyle={{ background: C.paper, border: `1px solid ${C.line}`, fontSize: 11 }} />
                {subjects.map(sub => (
                  <Line key={sub} type="monotone" dataKey={sub} stroke={SUBJECTS[sub].color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }}>
              {subjects.map(sub => (
                <span key={sub} style={{ fontSize: 10, color: C.muted, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 2, background: SUBJECTS[sub].color, display: 'inline-block' }} /> {sub}
                </span>
              ))}
            </div>
          </div>

          <SectionTitle>회차 매트릭스</SectionTitle>
          <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '10px 0', overflowX: 'auto', marginBottom: 18 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: C.muted, fontWeight: 500, borderBottom: `1px solid ${C.lineSoft}` }}>회차</th>
                  {subjects.map(sub => (
                    <th key={sub} style={{ padding: '6px 10px', textAlign: 'center', color: SUBJECTS[sub].color, fontWeight: 600, borderBottom: `1px solid ${C.lineSoft}` }}>{SUBJECTS[sub].short}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRounds.map(r => (
                  <tr key={r}>
                    <td className="mono" style={{ padding: '6px 10px', color: C.ink, borderBottom: `1px dashed ${C.lineSoft}` }}>{r}회</td>
                    {subjects.map(sub => {
                      const s = matrix[sub][r];
                      return (
                        <td key={sub} className="mono" style={{ padding: '6px 10px', textAlign: 'center', color: s ? SUBJECTS[sub].color : C.muted, borderBottom: `1px dashed ${C.lineSoft}`, fontWeight: s ? 600 : 400 }}>
                          {s ? `-${s.wrong}` : '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SectionTitle>전체 기록</SectionTitle>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {['전체', ...subjects].map(s => (
          <button key={s} onClick={() => setFilterSubject(s)}
            style={{
              background: filterSubject === s ? C.ink : C.paper,
              color: filterSubject === s ? '#fff' : C.muted,
              border: `1px solid ${filterSubject === s ? C.ink : C.line}`,
              padding: '4px 10px', fontSize: 11, cursor: 'pointer',
            }}>{s}</button>
        ))}
      </div>

      {sortedScores.length === 0 ? (
        <div style={{ fontSize: 11, color: C.muted, textAlign: 'center', padding: 14 }}>기록이 없습니다</div>
      ) : (
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '4px 14px' }}>
          {sortedScores.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 0', borderBottom: `1px dashed ${C.lineSoft}`, fontSize: 12 }}>
              <span className="mono" style={{ color: C.muted, fontSize: 10, minWidth: 60 }}>{s.date.slice(5)}</span>
              <span style={{ color: SUBJECTS[s.subject].color, fontWeight: 600, minWidth: 50 }}>{s.subject}</span>
              <span className="mono" style={{ color: C.muted, minWidth: 30 }}>{s.round}회</span>
              <span className="mono" style={{ color: C.ink, minWidth: 30 }}>-{s.wrong}</span>
              {s.note && <span style={{ flex: 1, fontSize: 10, color: C.muted, fontStyle: 'italic' }}>{s.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   REVIEW
============================================================ */

function ReviewView({ today, reviews, setReviews, books, setBooks, materials, setMaterials, materialLog, setMaterialLog }) {
  const [tab, setTab] = useState('topics');

  const tabs = [
    { key: 'topics', label: '주제', icon: RotateCw },
    { key: 'books', label: '문제집', icon: BookOpen },
    { key: 'materials', label: '자료', icon: Library },
  ];

  return (
    <div className="fadeIn" style={{ padding: '18px 0 24px' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>회독</h1>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: `1px solid ${C.line}` }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                background: 'none', border: 'none', padding: '8px 12px', cursor: 'pointer',
                color: active ? C.accent : C.muted,
                borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
                marginBottom: -1, display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontWeight: active ? 600 : 400, fontFamily: "'Noto Serif KR', serif",
              }}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'topics' && <TopicsReview today={today} reviews={reviews} setReviews={setReviews} />}
      {tab === 'books' && <BooksReview today={today} books={books} setBooks={setBooks} />}
      {tab === 'materials' && <MaterialsReview today={today} materials={materials} setMaterials={setMaterials} materialLog={materialLog} setMaterialLog={setMaterialLog} />}
    </div>
  );
}

function TopicsReview({ today, reviews, setReviews }) {
  const [showAdd, setShowAdd] = useState(false);

  const enriched = useMemo(() => {
    return reviews.map(r => {
      const interval = r.intervals[Math.min(r.cycleIndex, r.intervals.length - 1)];
      const next = addDays(r.lastReviewed, interval);
      const days = daysDiff(today, next);
      return { ...r, nextDue: next, daysUntilDue: days };
    }).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  }, [reviews, today]);

  function addReview(data) {
    const r = {
      id: uid(), title: data.title, subject: data.subject,
      created: today, lastReviewed: today, cycleIndex: 0,
      intervals: [5, 3, 2], note: data.note || '',
    };
    setReviews([...reviews, r]);
    setShowAdd(false);
  }

  function markReviewed(id) {
    setReviews(reviews.map(r => r.id === id ? {
      ...r, lastReviewed: today,
      cycleIndex: Math.min(r.cycleIndex + 1, r.intervals.length - 1),
    } : r));
  }
  function delReview(id) { setReviews(reviews.filter(r => r.id !== id)); }

  return (
    <>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, lineHeight: 1.6 }}>
        주제별 5–3–2 망각곡선 회독
      </div>
      <button onClick={() => setShowAdd(true)} style={{ width: '100%', background: C.ink, color: '#fff', border: 'none', padding: '10px', cursor: 'pointer', marginBottom: 14, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Plus size={14} /> 주제 추가
      </button>

      {showAdd && <AddReviewForm onAdd={addReview} onCancel={() => setShowAdd(false)} />}

      {enriched.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 12, background: C.paper, border: `1px dashed ${C.line}` }}>
          회독할 주제를 추가해 보세요
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {enriched.map(r => <ReviewCard key={r.id} review={r} onReviewed={() => markReviewed(r.id)} onDelete={() => delReview(r.id)} />)}
        </div>
      )}
    </>
  );
}

function AddReviewForm({ onAdd, onCancel }) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('민사법');
  const [note, setNote] = useState('');

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 14, marginBottom: 14 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="주제 (예: 채권자대위)"
        style={{ width: '100%', background: C.bg, border: `1px solid ${C.line}`, padding: '8px 10px', fontSize: 12, marginBottom: 8, outline: 'none' }} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {Object.keys(SUBJECTS).map(s => (
          <button key={s} onClick={() => setSubject(s)}
            style={{
              flex: 1, background: subject === s ? SUBJECTS[s].color : C.bg,
              color: subject === s ? '#fff' : C.muted,
              border: `1px solid ${subject === s ? SUBJECTS[s].color : C.lineSoft}`,
              padding: '6px 4px', fontSize: 10, cursor: 'pointer',
            }}>{SUBJECTS[s].short}</button>
        ))}
      </div>
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="메모 (선택)" rows={2}
        style={{ width: '100%', background: C.bg, border: `1px solid ${C.line}`, padding: '8px 10px', fontSize: 12, marginBottom: 10, outline: 'none', resize: 'vertical', fontFamily: "'Noto Serif KR', serif" }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onCancel} style={{ flex: 1, background: C.bg, border: `1px solid ${C.line}`, padding: '8px', cursor: 'pointer', fontSize: 12 }}>취소</button>
        <button onClick={() => title && onAdd({ title, subject, note })}
          style={{ flex: 1, background: C.ink, color: '#fff', border: 'none', padding: '8px', cursor: 'pointer', fontSize: 12 }}>추가</button>
      </div>
    </div>
  );
}

function ReviewCard({ review, onReviewed, onDelete }) {
  const isDue = review.daysUntilDue <= 0;
  const subColor = SUBJECTS[review.subject].color;
  return (
    <div style={{ background: C.paper, border: `1px solid ${isDue ? C.accent : C.line}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 3, alignSelf: 'stretch', background: subColor }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{review.title}</div>
          <div className="mono" style={{ fontSize: 10, color: isDue ? C.accent : C.muted, fontWeight: isDue ? 600 : 400 }}>
            {isDue ? '오늘' : `D-${review.daysUntilDue}`}
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
          <span style={{ color: subColor, fontWeight: 600 }}>{review.subject}</span> · 회독 {review.cycleIndex + 1}회차
        </div>
        {review.note && <div style={{ fontSize: 10, color: C.muted, marginTop: 4, fontStyle: 'italic' }}>{review.note}</div>}
      </div>
      <button onClick={onReviewed} style={{ background: C.ink, color: '#fff', border: 'none', padding: '5px 8px', cursor: 'pointer', fontSize: 10 }}>
        <Check size={11} />
      </button>
      <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <X size={12} color={C.muted} />
      </button>
    </div>
  );
}

function BooksReview({ today, books, setBooks }) {
  const [showAdd, setShowAdd] = useState(false);

  function addBook(data) {
    const b = {
      id: uid(), title: data.title, subject: data.subject,
      target: data.target, current: 0, log: [], note: data.note || '',
    };
    setBooks([...books, b]);
    setShowAdd(false);
  }
  function bumpRound(id) {
    setBooks(books.map(b => b.id === id ? { ...b, current: b.current + 1, log: [...b.log, today] } : b));
  }
  function decRound(id) {
    setBooks(books.map(b => {
      if (b.id !== id) return b;
      if (b.current <= 0) return b;
      return { ...b, current: b.current - 1, log: b.log.slice(0, -1) };
    }));
  }
  function delBook(id) { setBooks(books.filter(b => b.id !== id)); }

  return (
    <>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, lineHeight: 1.6 }}>
        문제집 / 강의 누적 회독
      </div>
      <button onClick={() => setShowAdd(true)} style={{ width: '100%', background: C.ink, color: '#fff', border: 'none', padding: '10px', cursor: 'pointer', marginBottom: 14, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Plus size={14} /> 문제집 추가
      </button>

      {showAdd && <AddBookForm onAdd={addBook} onCancel={() => setShowAdd(false)} />}

      {books.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 12, background: C.paper, border: `1px dashed ${C.line}` }}>
          문제집을 추가해 보세요
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {books.map(b => <BookCard key={b.id} book={b} onUp={() => bumpRound(b.id)} onDown={() => decRound(b.id)} onDelete={() => delBook(b.id)} />)}
        </div>
      )}
    </>
  );
}

function AddBookForm({ onAdd, onCancel }) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('민사법');
  const [target, setTarget] = useState(3);
  const [note, setNote] = useState('');

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 14, marginBottom: 14 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="제목"
        style={{ width: '100%', background: C.bg, border: `1px solid ${C.line}`, padding: '8px 10px', fontSize: 12, marginBottom: 8, outline: 'none' }} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {Object.keys(SUBJECTS).map(s => (
          <button key={s} onClick={() => setSubject(s)}
            style={{
              flex: 1, background: subject === s ? SUBJECTS[s].color : C.bg,
              color: subject === s ? '#fff' : C.muted,
              border: `1px solid ${subject === s ? SUBJECTS[s].color : C.lineSoft}`,
              padding: '6px 4px', fontSize: 10, cursor: 'pointer',
            }}>{SUBJECTS[s].short}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: C.muted }}>목표 회독:</span>
        <input type="number" value={target} onChange={e => setTarget(parseInt(e.target.value) || 1)} min={1}
          style={{ width: 50, background: C.bg, border: `1px solid ${C.line}`, padding: '5px', fontSize: 12, textAlign: 'center', outline: 'none' }} />
        <span style={{ fontSize: 11, color: C.muted }}>회</span>
      </div>
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="메모 (선택)" rows={2}
        style={{ width: '100%', background: C.bg, border: `1px solid ${C.line}`, padding: '8px 10px', fontSize: 12, marginBottom: 10, outline: 'none', resize: 'vertical', fontFamily: "'Noto Serif KR', serif" }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onCancel} style={{ flex: 1, background: C.bg, border: `1px solid ${C.line}`, padding: '8px', cursor: 'pointer', fontSize: 12 }}>취소</button>
        <button onClick={() => title && onAdd({ title, subject, target, note })}
          style={{ flex: 1, background: C.ink, color: '#fff', border: 'none', padding: '8px', cursor: 'pointer', fontSize: 12 }}>추가</button>
      </div>
    </div>
  );
}

function BookCard({ book, onUp, onDown, onDelete }) {
  const subColor = SUBJECTS[book.subject].color;
  const pct = Math.min(100, (book.current / book.target) * 100);
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '12px 14px', display: 'flex', gap: 10 }}>
      <div style={{ width: 3, alignSelf: 'stretch', background: subColor }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{book.title}</div>
          <div className="mono" style={{ fontSize: 11, color: C.ink }}>
            <span style={{ color: book.current >= book.target ? C.good : C.ink, fontWeight: 600 }}>{book.current}</span>
            <span style={{ color: C.muted }}> / {book.target}</span>
          </div>
        </div>
        <div style={{ fontSize: 10, color: subColor, fontWeight: 600, marginTop: 2 }}>{book.subject}</div>
        <div style={{ height: 3, background: C.lineSoft, marginTop: 8, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: book.current >= book.target ? C.good : subColor }} />
        </div>
        {book.note && <div style={{ fontSize: 10, color: C.muted, marginTop: 6, fontStyle: 'italic' }}>{book.note}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button onClick={onUp} style={{ background: C.ink, color: '#fff', border: 'none', padding: '4px 6px', cursor: 'pointer' }}>
          <Plus size={11} />
        </button>
        <button onClick={onDown} style={{ background: C.bg, color: C.muted, border: `1px solid ${C.line}`, padding: '4px 6px', cursor: 'pointer' }}>
          <Minus size={11} />
        </button>
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
          <X size={12} color: C.muted />
        </button>
      </div>
    </div>
  );
}

function MaterialsReview({ today, materials, setMaterials, materialLog, setMaterialLog }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSubject, setNewSubject] = useState('민사법');
  const [newTarget, setNewTarget] = useState(3);
  const [filter, setFilter] = useState('전체');

  function addMaterial() {
    if (!newName.trim()) return;
    const m = {
      id: uid(),
      name: newName.trim(),
      subject: newSubject,
      color: SUBJECTS[newSubject].color,
      rounds: 0, target: newTarget,
    };
    setMaterials([...materials, m]);
    setNewName(''); setShowAdd(false);
  }
  function bump(id) {
    setMaterials(materials.map(m => m.id === id ? { ...m, rounds: m.rounds + 1, lastDate: today } : m));
    const list = materialLog[today] || [];
    const mat = materials.find(m => m.id === id);
    setMaterialLog({ ...materialLog, [today]: [...list, { id: uid(), materialId: id, name: mat?.name || '', date: today }] });
  }
  function dec(id) {
    setMaterials(materials.map(m => m.id === id ? { ...m, rounds: Math.max(0, m.rounds - 1) } : m));
  }
  function del(id) {
    if (!window.confirm('이 자료를 삭제할까요?')) return;
    setMaterials(materials.filter(m => m.id !== id));
  }

  const filtered = filter === '전체' ? materials : materials.filter(m => m.subject === filter);

  return (
    <>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, lineHeight: 1.6 }}>
        명명된 자료(청취 / 청원 / 캡슐 / 로만 / 암기장 / 찌라시 / 핸드북 / 최판 등) 누적 회독
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {['전체', ...Object.keys(SUBJECTS)].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{
              background: filter === s ? C.ink : C.paper,
              color: filter === s ? '#fff' : C.muted,
              border: `1px solid ${filter === s ? C.ink : C.line}`,
              padding: '4px 10px', fontSize: 11, cursor: 'pointer',
            }}>{s}</button>
        ))}
      </div>

      <button onClick={() => setShowAdd(true)} style={{ width: '100%', background: C.ink, color: '#fff', border: 'none', padding: '10px', cursor: 'pointer', marginBottom: 14, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Plus size={14} /> 자료 추가
      </button>

      {showAdd && (
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 14, marginBottom: 14 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="자료 이름"
            style={{ width: '100%', background: C.bg, border: `1px solid ${C.line}`, padding: '8px 10px', fontSize: 12, marginBottom: 8, outline: 'none' }} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {Object.keys(SUBJECTS).map(s => (
              <button key={s} onClick={() => setNewSubject(s)}
                style={{
                  flex: 1, background: newSubject === s ? SUBJECTS[s].color : C.bg,
                  color: newSubject === s ? '#fff' : C.muted,
                  border: `1px solid ${newSubject === s ? SUBJECTS[s].color : C.lineSoft}`,
                  padding: '6px 4px', fontSize: 10, cursor: 'pointer',
                }}>{SUBJECTS[s].short}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: C.muted }}>목표:</span>
            <input type="number" value={newTarget} onChange={e => setNewTarget(parseInt(e.target.value) || 1)} min={1}
              style={{ width: 50, background: C.bg, border: `1px solid ${C.line}`, padding: '5px', fontSize: 12, textAlign: 'center', outline: 'none' }} />
            <span style={{ fontSize: 11, color: C.muted }}>회</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setShowAdd(false)} style={{ flex: 1, background: C.bg, border: `1px solid ${C.line}`, padding: '8px', cursor: 'pointer', fontSize: 12 }}>취소</button>
            <button onClick={addMaterial} style={{ flex: 1, background: C.ink, color: '#fff', border: 'none', padding: '8px', cursor: 'pointer', fontSize: 12 }}>추가</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: C.muted, fontSize: 12, background: C.paper, border: `1px dashed ${C.line}` }}>
          자료가 없습니다
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(m => {
            const pct = Math.min(100, (m.rounds / m.target) * 100);
            const done = m.rounds >= m.target;
            return (
              <div key={m.id} style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 3, alignSelf: 'stretch', background: m.color }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                    <div className="mono" style={{ fontSize: 11, flexShrink: 0 }}>
                      <span style={{ color: done ? C.good : C.ink, fontWeight: 600 }}>{m.rounds}</span>
                      <span style={{ color: C.muted }}>/{m.target}</span>
                    </div>
                  </div>
                  <div style={{ height: 2, background: C.lineSoft, marginTop: 5, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: done ? C.good : m.color }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                  <button onClick={() => dec(m.id)} style={{ background: C.bg, color: C.muted, border: `1px solid ${C.line}`, padding: '4px 6px', cursor: 'pointer' }}>
                    <Minus size={11} />
                  </button>
                  <button onClick={() => bump(m.id)} style={{ background: C.ink, color: '#fff', border: 'none', padding: '4px 6px', cursor: 'pointer' }}>
                    <Plus size={11} />
                  </button>
                  <button onClick={() => del(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
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

/* ============================================================
   REPORT
============================================================ */

function ReportView({ today, settings, logs, examScores, materials }) {
  const weekStart = weekStartOf(today);
  const wDates = weekDays(weekStart);

  const weeklyBySubject = {};
  Object.keys(SUBJECTS).forEach(s => { weeklyBySubject[s] = 0; });
  wDates.forEach(d => {
    const dl = logs[d] || {};
    Object.entries(dl).forEach(([k, v]) => {
      const [sub] = k.split('::');
      if (weeklyBySubject[sub] !== undefined) weeklyBySubject[sub] += v || 0;
    });
  });

  const weeklyData = Object.entries(weeklyBySubject).map(([sub, m]) => ({
    name: SUBJECTS[sub].short,
    fullName: sub,
    minutes: m,
    target: settings.weeklyTargets[sub] || 0,
    color: SUBJECTS[sub].color,
  }));

  const dailyData = useMemo(() => {
    const arr = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(today, -i);
      const dl = logs[d] || {};
      const total = Object.values(dl).reduce((s, t) => s + (t || 0), 0);
      arr.push({ date: d.slice(5).replace('-', '/'), minutes: total, hours: Math.round(total/60*10)/10 });
    }
    return arr;
  }, [today, logs]);

  const typeBreakdown = useMemo(() => {
    const out = {};
    Object.keys(SUBJECTS).forEach(s => { out[s] = {}; });
    Object.values(logs).forEach(dl => {
      Object.entries(dl).forEach(([k, v]) => {
        const [sub, type] = k.split('::');
        if (out[sub]) out[sub][type] = (out[sub][type] || 0) + (v || 0);
      });
    });
    return out;
  }, [logs]);

  const allMin = Object.values(logs).reduce((s, dl) => s + Object.values(dl).reduce((a,b) => a+b, 0), 0);
  const studyDays = Object.keys(logs).length;
  const avgPerDay = studyDays > 0 ? allMin / studyDays : 0;

  const mockAvg = useMemo(() => {
    const out = {};
    Object.keys(SUBJECTS).filter(s => s !== '국제거래법').forEach(s => {
      const subScores = examScores.filter(es => es.subject === s);
      if (subScores.length === 0) { out[s] = null; return; }
      const avg = subScores.reduce((a,b) => a + b.wrong, 0) / subScores.length;
      out[s] = { avg: Math.round(avg * 10) / 10, count: subScores.length };
    });
    return out;
  }, [examScores]);

  return (
    <div className="fadeIn" style={{ padding: '18px 0 24px' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>리포트</h1>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
          총 학습일 {studyDays}일 · 누적 {fmtHour(allMin)} · 일평균 {fmtHour(avgPerDay)}
        </div>
      </div>

      <SectionTitle>주간 목표 (이번 주)</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '14px 14px', marginBottom: 18 }}>
        {weeklyData.map(w => {
          const pct = w.target > 0 ? Math.min(100, (w.minutes / w.target) * 100) : 0;
          return (
            <div key={w.fullName} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span className="kserif" style={{ fontSize: 12, fontWeight: 600, color: w.color }}>{w.fullName}</span>
                <span className="mono" style={{ fontSize: 10, color: C.muted }}>
                  {fmtHour(w.minutes)} / {fmtHour(w.target)}
                </span>
              </div>
              <div style={{ height: 4, background: C.lineSoft, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: pct >= 100 ? C.good : w.color }} />
              </div>
            </div>
          );
        })}
      </div>

      <SectionTitle>최근 14일 학습 시간</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '14px 8px 10px', marginBottom: 18 }}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={dailyData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={C.lineSoft} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: C.muted }} interval={1} />
            <YAxis tick={{ fontSize: 9, fill: C.muted }} />
            <Tooltip contentStyle={{ background: C.paper, border: `1px solid ${C.line}`, fontSize: 11 }} formatter={v => fmtMin(v)} />
            <Bar dataKey="minutes" fill={C.accent} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {Object.values(mockAvg).some(v => v) && (
        <>
          <SectionTitle>객관식 평균 (전체 기록 기준)</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 18 }}>
            {Object.entries(mockAvg).map(([sub, m]) => (
              <div key={sub} style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '10px 8px', textAlign: 'center' }}>
                <div className="kserif" style={{ fontSize: 11, fontWeight: 600, color: SUBJECTS[sub].color }}>{sub}</div>
                {m ? (
                  <>
                    <div className="serif" style={{ fontSize: 20, fontWeight: 600, marginTop: 3 }}>-{m.avg}</div>
                    <div className="mono" style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{m.count}회 평균</div>
                  </>
                ) : (
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>기록 없음</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle>과목별 유형 분포 (누적)</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '8px 14px', marginBottom: 18 }}>
        {Object.keys(SUBJECTS).map(sub => {
          const types = typeBreakdown[sub] || {};
          const total = Object.values(types).reduce((a,b) => a+b, 0);
          if (total === 0) return (
            <div key={sub} style={{ padding: '10px 0', borderBottom: `1px dashed ${C.lineSoft}` }}>
              <span className="kserif" style={{ fontSize: 11, fontWeight: 600, color: SUBJECTS[sub].color }}>{sub}</span>
              <span style={{ fontSize: 10, color: C.muted, marginLeft: 8 }}>기록 없음</span>
            </div>
          );
          return (
            <div key={sub} style={{ padding: '10px 0', borderBottom: `1px dashed ${C.lineSoft}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span className="kserif" style={{ fontSize: 11, fontWeight: 600, color: SUBJECTS[sub].color }}>{sub}</span>
                <span className="mono" style={{ fontSize: 10, color: C.muted }}>{fmtHour(total)}</span>
              </div>
              <div style={{ display: 'flex', height: 6, background: C.lineSoft, overflow: 'hidden' }}>
                {SUBJECTS[sub].types.map((t, i) => {
                  const v = types[t.key] || 0;
                  const pct = (v / total) * 100;
                  if (pct === 0) return null;
                  const tColor = SUBJECTS[sub].color;
                  const opacity = 0.4 + (i / SUBJECTS[sub].types.length) * 0.6;
                  return <div key={t.key} style={{ width: `${pct}%`, background: tColor, opacity, transition: 'all .3s' }} title={`${t.label} ${fmtMin(v)}`} />;
                })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 5, fontSize: 9, color: C.muted }}>
                {SUBJECTS[sub].types.map(t => {
                  const v = types[t.key] || 0;
                  if (v === 0) return null;
                  return <span key={t.key}>{t.label} <span className="mono" style={{ color: C.ink }}>{fmtMin(v)}</span></span>;
                })}
              </div>
            </div>
          );
        })}
      </div>

      {materials.length > 0 && (
        <>
          <SectionTitle>자료 회독 현황</SectionTitle>
          <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '8px 14px', marginBottom: 18 }}>
            {Object.keys(SUBJECTS).map(sub => {
              const ms = materials.filter(m => m.subject === sub);
              if (ms.length === 0) return null;
              const totalRounds = ms.reduce((s,m) => s + m.rounds, 0);
              const totalTarget = ms.reduce((s,m) => s + m.target, 0);
              const completed = ms.filter(m => m.rounds >= m.target).length;
              return (
                <div key={sub} style={{ padding: '8px 0', borderBottom: `1px dashed ${C.lineSoft}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="kserif" style={{ fontSize: 12, fontWeight: 600, color: SUBJECTS[sub].color }}>{sub}</span>
                  <span className="mono" style={{ fontSize: 10, color: C.muted }}>
                    완료 {completed}/{ms.length} · 누적 {totalRounds}/{totalTarget}회
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   SETTINGS
============================================================ */

function SettingsView({ settings, setSettings, logout }) {
  const [examDate, setExamDate] = useState(settings.examDate);
  const [examLabel, setExamLabel] = useState(settings.examLabel);
  const [targets, setTargets] = useState(settings.weeklyTargets);
  const [cycleDefs, setCycleDefs] = useState(settings.cycleDefs);
  const [mockExams, setMockExams] = useState(settings.mockExams || []);
  const [d30Mode, setD30Mode] = useState(settings.d30Mode);
  const [autoGen, setAutoGen] = useState(settings.autoGenMockReview);

  function save() {
    setSettings({
      ...settings,
      examDate, examLabel,
      weeklyTargets: targets,
      cycleDefs,
      mockExams,
      d30Mode,
      autoGenMockReview: autoGen,
    });
    alert('저장되었습니다');
  }

  function updCycleBlock(cycleId, blockIdx, days) {
    setCycleDefs(cycleDefs.map(c => c.id === cycleId ? {
      ...c, blocks: c.blocks.map((b, i) => i === blockIdx ? { ...b, days: parseInt(days) || 1 } : b),
    } : c));
  }

  function addMock() {
    setMockExams([...mockExams, { id: uid(), label: `모의고사 ${mockExams.length + 1}`, start: examDate, end: examDate }]);
  }
  function updMock(id, field, val) {
    setMockExams(mockExams.map(m => m.id === id ? { ...m, [field]: val } : m));
  }
  function delMock(id) {
    setMockExams(mockExams.filter(m => m.id !== id));
  }

  return (
    <div className="fadeIn" style={{ padding: '18px 0 24px' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>설정</h1>
      </div>

      <SectionTitle>시험</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 14, marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 11, color: C.muted, marginBottom: 4 }}>시험 이름</label>
        <input value={examLabel} onChange={e => setExamLabel(e.target.value)} disabled
          style={{ width: '100%', background: C.bg, border: `1px solid ${C.line}`, padding: '8px 10px', fontSize: 12, marginBottom: 10, outline: 'none', color: C.muted }} />
        <label style={{ display: 'block', fontSize: 11, color: C.muted, marginBottom: 4 }}>시험 날짜</label>
        <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)}
          style={{ width: '100%', background: C.bg, border: `1px solid ${C.line}`, padding: '8px 10px', fontSize: 12, outline: 'none' }} />
      </div>

      <SectionTitle>모의고사 일정</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 14, marginBottom: 18 }}>
        {mockExams.map(m => (
          <div key={m.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px dashed ${C.lineSoft}` }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
              <input value={m.label} onChange={e => updMock(m.id, 'label', e.target.value)}
                style={{ flex: 1, background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '6px 8px', fontSize: 11, outline: 'none' }} />
              <button onClick={() => delMock(m.id)} style={{ background: 'none', border: `1px solid ${C.lineSoft}`, padding: '6px 8px', cursor: 'pointer', color: C.muted }}>
                <Trash2 size={12} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" value={m.start} onChange={e => updMock(m.id, 'start', e.target.value)}
                style={{ flex: 1, background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '5px 8px', fontSize: 11, outline: 'none' }} />
              <span style={{ alignSelf: 'center', color: C.muted, fontSize: 11 }}>~</span>
              <input type="date" value={m.end} onChange={e => updMock(m.id, 'end', e.target.value)}
                style={{ flex: 1, background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '5px 8px', fontSize: 11, outline: 'none' }} />
            </div>
          </div>
        ))}
        <button onClick={addMock} style={{ width: '100%', background: C.bg, border: `1px dashed ${C.line}`, padding: '8px', cursor: 'pointer', fontSize: 11, color: C.muted }}>
          + 모의고사 추가
        </button>
      </div>

      <SectionTitle>사이클 (블록 일수)</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 14, marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
          순서: 민사법(+국제거래법) → 형사법 → 공법<br/>
          각 모의고사 / 본시험 직전부터 거꾸로 깔립니다.
        </div>
        {cycleDefs.map(c => (
          <div key={c.id} style={{ marginBottom: 12 }}>
            <div className="kserif" style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{c.label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {c.blocks.map((b, i) => (
                <div key={i} style={{ background: C.bg, border: `1px solid ${C.lineSoft}`, padding: '6px 8px' }}>
                  <div style={{ fontSize: 10, color: SUBJECTS[b.subject].color, fontWeight: 600, marginBottom: 3 }}>{b.subject}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="number" value={b.days} onChange={e => updCycleBlock(c.id, i, e.target.value)} min={1}
                      style={{ width: '100%', background: 'transparent', border: 'none', fontSize: 14, fontWeight: 600, color: C.ink, outline: 'none', fontFamily: "'JetBrains Mono', monospace" }} />
                    <span style={{ fontSize: 10, color: C.muted }}>일</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>주간 학습 시간 목표 (분)</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 14, marginBottom: 18 }}>
        {Object.keys(SUBJECTS).map(sub => (
          <div key={sub} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="kserif" style={{ fontSize: 12, fontWeight: 600, color: SUBJECTS[sub].color }}>{sub}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" value={targets[sub] || 0} onChange={e => setTargets({ ...targets, [sub]: parseInt(e.target.value) || 0 })}
                style={{ width: 80, background: C.bg, border: `1px solid ${C.line}`, padding: '5px 8px', fontSize: 12, textAlign: 'right', outline: 'none', fontFamily: "'JetBrains Mono', monospace" }} />
              <span style={{ fontSize: 11, color: C.muted, minWidth: 36 }}>{fmtHour(targets[sub] || 0)}</span>
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>자동화</SectionTitle>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: '4px 0', marginBottom: 18 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: `1px dashed ${C.lineSoft}` }}>
          <input type="checkbox" checked={d30Mode} onChange={e => setD30Mode(e.target.checked)} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>D-30/D-7 모드 배너</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>시험 30/7일 전 압축/벼락치기 모드 알림</div>
          </div>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoGen} onChange={e => setAutoGen(e.target.checked)} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>모의고사 리뷰 자동 생성</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>모의고사 종료 후 1~7일 동안 리뷰 할 일 자동 추가</div>
          </div>
        </label>
      </div>

      <button onClick={save} style={{ width: '100%', background: C.ink, color: '#fff', border: 'none', padding: '12px', cursor: 'pointer', fontSize: 13, marginBottom: 14, fontWeight: 600 }}>
        저장하기
      </button>

      <div style={{ textAlign: 'center', fontSize: 10, color: C.muted, marginTop: 30, fontStyle: 'italic' }}>
        Bar Exam Journal · 16회 변호사시험 대비
      </div>
    </div>
  );
}
