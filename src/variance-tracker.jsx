import { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import {
  Plus, X, Check, Trash2, BookOpen, RotateCw, BarChart3,
  Settings as SettingsIcon, ChevronLeft, ChevronRight, ChevronDown,
  Home, Target, Clock, Download, RefreshCw, Minus, BookMarked,
  Calendar as CalendarIcon, Square, CheckSquare, Repeat,
  Layers, FileText, TrendingUp, Smile, Library, LogOut, Cloud, CloudOff,
} from 'lucide-react';

/* ============================================================ FIREBASE CONFIG ============================================================ */
/* 본인 Firebase 콘솔 → 프로젝트 설정 → 일반 → 내 앱에서 복사한 값으로 교체하세요 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const FIREBASE_OK = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let fbApp = null, fbAuth = null, fbDB = null, googleProvider = null;
if (FIREBASE_OK) {
  try {
    fbApp = initializeApp(firebaseConfig);
    fbAuth = getAuth(fbApp);
    fbDB = getFirestore(fbApp);
    googleProvider = new GoogleAuthProvider();
  } catch (e) {
    console.error('[Firebase init failed]', e);
  }
}

/* ============================================================ THEME & DATA ============================================================ */

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Noto+Serif+KR:wght@400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap');`;

const C = {
  bg: '#F4EEE1', paper: '#FBF7EC', ink: '#1A1915', muted: '#6B6558',
  line: '#CFC7B4', lineSoft: '#E5DFCE',
  accent: '#7A1E1E', accentSoft: '#A84040',
  good: '#3C5A3A', warn: '#B86A1E', book: '#5B4A33',
  trackTint: '#F0E8D2',
};

const SUBJECTS = {
  공법: { color: '#1E3A5F', short: '공', types: [
    { key: '선택형', label: '선택형' },
    { key: '사례형_1문', label: '사례형 1문' },
    { key: '사례형_2문', label: '사례형 2문' },
    { key: '기록형', label: '기록형' },
  ]},
  형사법: { color: '#7A2828', short: '형', types: [
    { key: '선택형', label: '선택형' },
    { key: '사례형_1문', label: '사례형 1문' },
    { key: '사례형_2문', label: '사례형 2문' },
    { key: '기록형', label: '기록형' },
  ]},
  민사법: { color: '#2D5A3D', short: '민', types: [
    { key: '선택형', label: '선택형' },
    { key: '사례형_1문', label: '사례형 1문' },
    { key: '사례형_2문', label: '사례형 2문' },
    { key: '사례형_3문', label: '사례형 3문' },
    { key: '기록형', label: '기록형' },
  ]},
  국제거래법: { color: '#8B6914', short: '국', types: [
    { key: '1문', label: '1문' },
    { key: '2문', label: '2문' },
  ]},
};

// Track types (5 daily slots)
const TRACK_TYPES = [
  { key: 'audio',    label: '청취/청원',  short: '청', color: '#5B4A33', placeholder: '예: 청취, 청원, 요사' },
  { key: 'case',     label: '사례',      short: '사', color: '#7A2828', placeholder: '예: 민 사례, 공 사례 핸드북' },
  { key: 'mcq',      label: '객관식 회차', short: '객', color: '#1E3A5F', placeholder: '예: 14회 공객, 13회 민객' },
  { key: 'memo',     label: '암기장/핸드북', short: '암', color: '#2D5A3D', placeholder: '예: 민 암기장 100p' },
  { key: 'aux',      label: '최판/보조자료', short: '보', color: '#8B6914', placeholder: '예: 캡슐, 로만, 찌라시' },
];

/* 본인 Google 이메일을 아래 배열에 추가하세요. 이 이메일로 로그인했을 때만 15회 변시 점수가 표시됩니다. */
const OWNER_EMAILS = [
  'hbk19992@gmail.com',
];

const PREV_SCORES = {
  공법: { 선택형: 52.5, 사례형_1문: 48.25, 사례형_2문: 37.45, 기록형: 40.42, total: 178.62, max: 400 },
  형사법: { 선택형: 62.5, 사례형_1문: 50.46, 사례형_2문: 31.99, 기록형: 28.28, total: 173.23, max: 400 },
  민사법: { 선택형: 87.5, 사례형_1문: 79.09, 사례형_2문: 37.36, 사례형_3문: 53.06, 기록형: 85.93, total: 342.94, max: 700 },
  국제거래법: { '1문': 43.59, '2문': 26.09, total: 69.68, max: 160 },
  grandTotal: 764.47, grandMax: 1660,
};

const CYCLE_DEFS = [
  { id: 1, label: '사이클 1', blocks: [
    { subject: '민사법', days: 8 },
    { subject: '형사법', days: 6 },
    { subject: '공법', days: 5 },
  ]},
  { id: 2, label: '사이클 2', blocks: [
    { subject: '민사법', days: 5 },
    { subject: '형사법', days: 3 },
    { subject: '공법', days: 2 },
  ]},
];

// Default named materials (from real data analysis)
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
  { id: 'mat-10', name: '공기록 찌라시', subject: '공법', color: '#1E3A5F', rounds: 0, target: 3 },
  { id: 'mat-11', name: '민기록 찌라시', subject: '민사법', color: '#2D5A3D', rounds: 0, target: 3 },
  { id: 'mat-12', name: '형기록 찌라시', subject: '형사법', color: '#7A2828', rounds: 0, target: 3 },
  { id: 'mat-13', name: '헌 핸드북', subject: '공법', color: '#1E3A5F', rounds: 0, target: 3 },
  { id: 'mat-14', name: '행 핸드북', subject: '공법', color: '#1E3A5F', rounds: 0, target: 3 },
  { id: 'mat-15', name: '민 최판', subject: '민사법', color: '#2D5A3D', rounds: 0, target: 2 },
  { id: 'mat-16', name: '형 최판', subject: '형사법', color: '#7A2828', rounds: 0, target: 2 },
  { id: 'mat-17', name: '헌 최판', subject: '공법', color: '#1E3A5F', rounds: 0, target: 2 },
  { id: 'mat-18', name: '행 최판', subject: '공법', color: '#1E3A5F', rounds: 0, target: 2 },
];

// Mock review templates: when a mock ends, these todos are auto-generated for the next 7 days
const MOCK_REVIEW_TEMPLATES = [
  { offset: 1, title: '휴식' },
  { offset: 2, title: '휴식' },
  { offset: 3, title: '공사례 리뷰 — 목차 / 쟁점 / 분량' },
  { offset: 3, title: '공기록 리뷰' },
  { offset: 4, title: '형사례 리뷰 — 최판 보완' },
  { offset: 4, title: '형기록 리뷰' },
  { offset: 5, title: '민기록 리뷰 — 청구원인 / 작성요령' },
  { offset: 5, title: '민사례 리뷰' },
  { offset: 6, title: '공객 오답 정리' },
  { offset: 6, title: '형객 오답 정리' },
  { offset: 7, title: '민객 오답 정리' },
  { offset: 7, title: '경제법 리뷰' },
];

const DEFAULT_SETTINGS = {
  examDate: '2027-01-07',
  examLabel: '제16회 변호사시험',
  weeklyTargets: { 공법: 600, 형사법: 600, 민사법: 900, 국제거래법: 300 },
  cycleDefs: CYCLE_DEFS,
  mockExams: [
    { id: 'mock-1', label: '모의고사 1차', start: '2026-06-22', end: '2026-06-26' },
    { id: 'mock-2', label: '모의고사 2차', start: '2026-08-03', end: '2026-08-07' },
    { id: 'mock-3', label: '모의고사 3차', start: '2026-10-16', end: '2026-10-20' },
  ],
  d30Mode: true, // D-30부터 사이클 대신 회차 회독 모드 권장 알림
  autoGenMockReview: true, // 모의고사 끝나면 리뷰 todo 자동 생성
};

/* ============================================================ UTILS ============================================================ */

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
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
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

/* Cycle: backward from each mock/exam */
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
            cycleId: cycle.id,
            cycleLabel: cycle.label,
            cycleIdx: origCycleIdx,
            blockIdx: origBlockIdx,
            subject: block.subject,
            dayInBlock,
            blockDays: block.days,
            dayInCycle,
            cycleDays: cLen,
            rotation: rotation + 1,
            isBlockLast: r === 0,
            isCycleLast: rem === 0,
            anchorLabel: targetAnchor.label,
            anchorDate: targetAnchor.start,
            daysToAnchor: distFromEnd + 1,
          };
        }
        r -= block.days;
      }
    }
    rem -= cLen;
  }
  return null;
}

/* ============================================================ FIRESTORE STORAGE ============================================================ */

const DEFAULT_STATE = {
  settings: DEFAULT_SETTINGS,
  logs: {}, reviews: [], books: [], todos: {},
  tracks: {},
  materials: DEFAULT_MATERIALS,
  materialLog: {},
  examScores: [],
  moods: {},
  schedules: [], // [{ id, title, color, start, end, note }]
};

async function loadStateFromFirestore(uid) {
  try {
    const ref = doc(fbDB, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ...DEFAULT_STATE };
    const d = snap.data() || {};
    return {
      settings: {
        ...DEFAULT_SETTINGS, ...(d.settings || {}),
        weeklyTargets: { ...DEFAULT_SETTINGS.weeklyTargets, ...((d.settings && d.settings.weeklyTargets) || {}) },
        cycleDefs: (d.settings && d.settings.cycleDefs) || CYCLE_DEFS,
        mockExams: (d.settings && d.settings.mockExams) || DEFAULT_SETTINGS.mockExams,
      },
      logs: d.logs || {},
      reviews: d.reviews || [],
      books: d.books || [],
      todos: d.todos || {},
      tracks: d.tracks || {},
      materials: (d.materials && d.materials.length) ? d.materials : DEFAULT_MATERIALS,
      materialLog: d.materialLog || {},
      examScores: d.examScores || [],
      moods: d.moods || {},
      schedules: d.schedules || [],
    };
  } catch (e) {
    console.error('[loadState]', e);
    return { ...DEFAULT_STATE };
  }
}

async function saveStateToFirestore(uid, partial) {
  try {
    await setDoc(doc(fbDB, 'users', uid), partial, { merge: true });
    return true;
  } catch (e) {
    console.error('[saveState]', e);
    return false;
  }
}

/* ============================================================ APP ============================================================ */

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState('home');
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
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState(todayISO());
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | saving | saved | error

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(fbAuth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
    const t = setInterval(() => setToday(todayISO()), 60000);
    return () => { unsub(); clearInterval(t); };
  }, []);

  // Load when user is set
  useEffect(() => {
    if (!user) { setLoaded(false); return; }
    setLoaded(false);
    const fallback = setTimeout(() => {
      console.warn('[sync] timeout fallback');
      setLoaded(true);
    }, 5000);
    loadStateFromFirestore(user.uid).then(s => {
      setSettings(s.settings); setLogs(s.logs); setReviews(s.reviews); setBooks(s.books);
      setTodos(s.todos); setTracks(s.tracks); setMaterials(s.materials);
      setMaterialLog(s.materialLog); setExamScores(s.examScores); setMoods(s.moods);
      setSchedules(s.schedules);
      clearTimeout(fallback);
      setLoaded(true);
    });
    return () => clearTimeout(fallback);
  }, [user]);

  // Save (debounced) — single doc per user
  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (!loaded || !user) return;
    setSyncStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const ok = await saveStateToFirestore(user.uid, {
        settings, logs, reviews, books, todos, tracks,
        materials, materialLog, examScores, moods, schedules,
        updatedAt: new Date().toISOString(),
      });
      setSyncStatus(ok ? 'saved' : 'error');
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [user, loaded, settings, logs, reviews, books, todos, tracks, materials, materialLog, examScores, moods, schedules]);

  // Auto-generate mock review todos
  useEffect(() => {
    if (!loaded || !settings.autoGenMockReview) return;
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
  }, [loaded, settings.mockExams, settings.autoGenMockReview, today]);

  const dday = useMemo(() => daysDiff(today, settings.examDate), [today, settings.examDate]);

  const globalStyles = (
    <>
      <style>{FONT_IMPORT}</style>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; }
        input, textarea, button, select { font-family: inherit; color: inherit; }
        input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        .serif { font-family: 'Fraunces', 'Noto Serif KR', serif; }
        .kserif { font-family: 'Noto Serif KR', serif; }
        .mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
        .fadeIn { animation: fade .35s ease both; }
        @keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .lift:active { transform: scale(0.98); }
        .lift { transition: transform .15s ease; }
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { scrollbar-width: none; }
      `}</style>
    </>
  );

  if (!FIREBASE_OK) {
    return (
      <div style={{ minHeight:'100vh', background:C.bg, display:'grid', placeItems:'center', padding:24, fontFamily:"'Noto Sans KR', sans-serif" }}>
        {globalStyles}
        <div style={{ maxWidth:420, background:C.paper, border:`1px solid ${C.accent}`, padding:'20px 22px' }}>
          <div className="kserif" style={{ fontSize:11, letterSpacing:'0.22em', color:C.accent, fontWeight:600, marginBottom:8 }}>SETUP REQUIRED</div>
          <div className="serif" style={{ fontSize:18, fontWeight:600, color:C.ink, marginBottom:10 }}>Firebase 환경변수가 설정되지 않았습니다</div>
          <div style={{ fontSize:12, color:C.muted, lineHeight:1.7 }}>
            Vercel → Settings → Environment Variables 에 아래 6개를 등록한 뒤 재배포하세요:
            <pre style={{ background:C.bg, padding:'10px 12px', marginTop:10, fontSize:10, fontFamily:"'JetBrains Mono', monospace", overflow:'auto' }}>{`VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID`}</pre>
            등록 후 반드시 Deployments → Redeploy 눌러주세요. 환경변수는 새 빌드에만 반영됩니다.
          </div>
        </div>
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div style={{ minHeight:'100vh', background:C.bg, display:'grid', placeItems:'center' }}>
        {globalStyles}
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {globalStyles}
        <LoginView />
      </>
    );
  }

  if (!loaded) {
    return (
      <div style={{ minHeight:'100vh', background:C.bg, display:'grid', placeItems:'center', color:C.muted, fontFamily:"'Noto Serif KR', serif" }}>
        {globalStyles}
        <div style={{ textAlign:'center' }}>
          <div className="kserif" style={{ fontSize:13, letterSpacing:'0.1em' }}>데이터 동기화 중…</div>
          <div className="mono" style={{ fontSize:10, marginTop:8, opacity:0.6 }}>{user.email}</div>
        </div>
      </div>
    );
  }

  const sharedProps = {
    today, settings, setSettings,
    logs, setLogs, reviews, setReviews, books, setBooks,
    todos, setTodos, tracks, setTracks,
    materials, setMaterials, materialLog, setMaterialLog,
    examScores, setExamScores, moods, setMoods,
    schedules, setSchedules,
  };

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.ink, paddingBottom:84, fontFamily:"'Noto Sans KR', sans-serif" }}>
      {globalStyles}

      <TopBar dday={dday} examLabel={settings.examLabel} examDate={settings.examDate} user={user} syncStatus={syncStatus} />

      <main style={{ maxWidth:720, margin:'0 auto', padding:'0 18px' }}>
        {view === 'home' && <HomeView {...sharedProps} dday={dday} user={user} onGoTo={setView} />}
        {view === 'log' && <LogView {...sharedProps} initialDate={today} />}
        {view === 'calendar' && <CalendarView {...sharedProps} onGoToLog={() => setView('log')} />}
        {view === 'review' && <ReviewView {...sharedProps} />}
        {view === 'exams' && <ExamsView {...sharedProps} />}
        {view === 'report' && <ReportView {...sharedProps} />}
        {view === 'settings' && (
          <SettingsView {...sharedProps}
            user={user}
            onLogout={async () => { await signOut(fbAuth); }}
            onReset={() => {
              if (confirm('모든 데이터를 지울까요? (설정 포함)\n클라우드의 본인 데이터도 함께 초기화됩니다.')) {
                setLogs({}); setReviews([]); setBooks([]); setTodos({});
                setTracks({}); setMaterials(DEFAULT_MATERIALS); setMaterialLog({});
                setExamScores([]); setMoods({}); setSchedules([]); setSettings(DEFAULT_SETTINGS);
              }
            }}
            onExport={() => {
              const data = JSON.stringify({
                settings, logs, reviews, books, todos,
                tracks, materials, materialLog, examScores, moods, schedules,
              }, null, 2);
              const blob = new Blob([data], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `변시기록_${today}.json`; a.click();
              URL.revokeObjectURL(url);
            }}
          />
        )}
      </main>

      <BottomNav view={view} setView={setView} />
    </div>
  );
}

/* ============================================================ LOGIN ============================================================ */

function LoginView() {
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);

  async function loginGoogle() {
    setError(''); setSigning(true);
    try {
      await signInWithPopup(fbAuth, googleProvider);
    } catch (e) {
      console.error(e);
      if (e.code === 'auth/unauthorized-domain') {
        setError('이 도메인은 Firebase에 등록되어 있지 않습니다. Firebase 콘솔 → Authentication → Settings → 승인된 도메인에 현재 주소를 추가해주세요.');
      } else if (e.code === 'auth/popup-blocked') {
        setError('팝업이 차단되었습니다. 브라우저 설정을 확인해주세요.');
      } else if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
        setError('');
      } else {
        setError(`로그인 실패: ${e.code || e.message}`);
      }
    } finally {
      setSigning(false);
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'grid', placeItems:'center', padding:'30px 24px', fontFamily:"'Noto Sans KR', sans-serif" }}>
      <div style={{ maxWidth:380, width:'100%', textAlign:'center' }}>
        <div className="kserif" style={{ fontSize:11, letterSpacing:'0.28em', color:C.muted, textTransform:'uppercase', marginBottom:14 }}>BAR EXAM JOURNAL</div>
        <h1 className="serif" style={{ fontSize:34, fontWeight:600, color:C.ink, margin:'0 0 10px', letterSpacing:'-0.01em' }}>변호사시험 학습 기록장</h1>
        <p style={{ fontSize:13, color:C.muted, lineHeight:1.7, margin:'0 0 36px' }}>
          시간 / 회독 / 사이클 / 모의고사를 한 곳에서.<br/>
          기록은 본인 Google 계정으로 클라우드에 저장됩니다.
        </p>

        <button onClick={loginGoogle} disabled={signing}
          style={{
            width:'100%', background:C.ink, color:'#fff', border:'none',
            padding:'14px 16px', cursor:'pointer', fontSize:14, fontWeight:600,
            display:'flex', alignItems:'center', justifyContent:'center', gap:10,
            opacity: signing ? 0.6 : 1,
          }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path fill="#fff" d="M21.35 11.1h-9.17v2.92h5.5c-.25 1.39-.99 2.56-2.11 3.34v2.78h3.41c2-1.84 3.16-4.55 3.16-7.79 0-.5-.05-.99-.13-1.45l-.66-.04z"/>
            <path fill="#fff" d="M12.18 21.97c2.85 0 5.24-.94 6.99-2.55l-3.41-2.65c-.95.64-2.16 1.02-3.58 1.02-2.75 0-5.08-1.86-5.91-4.36H2.74v2.74C4.49 19.5 8.05 21.97 12.18 21.97z"/>
            <path fill="#fff" d="M6.27 13.43c-.21-.64-.33-1.31-.33-2 0-.69.13-1.36.33-2v-2.74H2.74C1.99 8.18 1.5 9.78 1.5 11.43c0 1.65.49 3.25 1.24 4.74l3.53-2.74z"/>
            <path fill="#fff" d="M12.18 5.07c1.55 0 2.93.53 4.03 1.58l3.02-3.02C17.42 1.84 15.03 1 12.18 1 8.05 1 4.49 3.47 2.74 7.69l3.53 2.74c.83-2.5 3.16-4.36 5.91-4.36z"/>
          </svg>
          {signing ? '로그인 중…' : 'Google로 로그인'}
        </button>

        {error && (
          <div style={{ marginTop:18, padding:'12px 14px', background:'#fff', border:`1px solid ${C.accent}`, color:C.accent, fontSize:11, lineHeight:1.6, textAlign:'left' }}>
            {error}
          </div>
        )}

        <div style={{ marginTop:36, fontSize:10, color:C.muted, letterSpacing:'0.05em' }}>
          로그인하면 데이터가 본인 Google 계정과 연결되어<br/>모든 기기에서 동기화됩니다.
        </div>
      </div>
    </div>
  );
}

/* ============================================================ TOP BAR / NAV ============================================================ */

function TopBar({ dday, examLabel, examDate, user, syncStatus }) {
  const overdue = dday < 0;
  const displayName = user?.displayName || user?.email?.split('@')[0] || '사용자';
  return (
    <header style={{ borderBottom:`1px solid ${C.line}`, background:C.paper, padding:'14px 18px 12px' }}>
      <div style={{ maxWidth:720, margin:'0 auto', display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:12 }}>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div className="kserif" style={{ fontSize:10, letterSpacing:'0.22em', color:C.muted, textTransform:'uppercase' }}>BAR EXAM JOURNAL · {displayName}</div>
            {syncStatus === 'saving' && <Cloud size={11} color={C.muted} />}
            {syncStatus === 'saved' && <Cloud size={11} color={C.good} />}
            {syncStatus === 'error' && <CloudOff size={11} color={C.accent} />}
          </div>
          <div className="kserif" style={{ fontSize:16, fontWeight:600, marginTop:3, color:C.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{examLabel}</div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div className="serif" style={{ fontSize:32, fontWeight:600, lineHeight:1, color: overdue ? C.muted : C.accent }}>
            D{overdue ? '+' : '−'}{Math.abs(dday)}
          </div>
          <div className="mono" style={{ fontSize:10, color:C.muted, marginTop:3, letterSpacing:'0.05em' }}>{examDate.replaceAll('-','.')}</div>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ view, setView }) {
  const items = [
    { key:'home', icon:Home, label:'홈' },
    { key:'log', icon:BookOpen, label:'기록' },
    { key:'calendar', icon:CalendarIcon, label:'캘린더' },
    { key:'exams', icon:TrendingUp, label:'기출' },
    { key:'review', icon:RotateCw, label:'회독' },
    { key:'report', icon:BarChart3, label:'리포트' },
    { key:'settings', icon:SettingsIcon, label:'설정' },
  ];
  return (
    <nav style={{
      position:'fixed', left:0, right:0, bottom:0,
      background:C.paper, borderTop:`1px solid ${C.line}`,
      display:'grid', gridTemplateColumns:`repeat(${items.length}, 1fr)`,
      paddingBottom:'env(safe-area-inset-bottom)', zIndex:10,
    }}>
      {items.map(it => {
        const active = view === it.key;
        const Icon = it.icon;
        return (
          <button key={it.key} onClick={() => setView(it.key)}
            style={{
              background:'transparent', border:'none', padding:'10px 0 10px',
              color: active ? C.accent : C.muted,
              display:'flex', flexDirection:'column', alignItems:'center', gap:2,
              cursor:'pointer', position:'relative',
            }}>
            {active && <span style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:18, height:2, background:C.accent }} />}
            <Icon size={17} strokeWidth={active ? 2.2 : 1.6} />
            <span className="kserif" style={{ fontSize:9, letterSpacing:0, fontWeight: active ? 600 : 400 }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ============================================================ COMMON ============================================================ */

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'12px 12px 14px', display:'flex', flexDirection:'column', gap:6 }}>
      <Icon size={14} color={color || C.muted} strokeWidth={1.5} />
      <div className="serif" style={{ fontSize:20, fontWeight:600, color:C.ink, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:10, color:C.muted }}>{label}</div>
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:10 }}>
      <h2 className="kserif" style={{ margin:0, fontSize:11, letterSpacing:'0.24em', color:C.muted, textTransform:'uppercase', fontWeight:600 }}>{children}</h2>
      {action && (
        <button onClick={action.onClick} style={{ background:'none', border:'none', color:C.accent, fontSize:11, cursor:'pointer', letterSpacing:'0.05em' }}>
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
      padding: '16px 18px', position: 'relative', overflow:'hidden',
      border: `1px solid ${subColor}`,
    }}>
      <div style={{ position:'absolute', right: -20, top: -10, opacity:0.12, fontSize:120, fontWeight:700, fontFamily:"'Fraunces', serif", lineHeight:1 }}>
        {SUBJECTS[info.subject].short}
      </div>
      <div style={{ position:'relative' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
          <div className="kserif" style={{ fontSize:10, letterSpacing:'0.22em', opacity:0.85, fontWeight:500 }}>오늘의 사이클</div>
          {info.anchorLabel && (
            <div className="mono" style={{ fontSize:10, opacity:0.85, letterSpacing:'0.03em' }}>
              {info.anchorLabel} D-{info.daysToAnchor}
            </div>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'baseline', gap:10, marginTop:6 }}>
          <div className="serif" style={{ fontSize:26, fontWeight:600, letterSpacing:'-0.01em' }}>
            {info.subject}{isMinSubj && withMinor && <span style={{ fontSize:13, opacity:0.85, marginLeft:6 }}>+ 국제거래법</span>}
          </div>
        </div>
        <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8, fontSize:12, flexWrap:'wrap' }}>
          <span style={{ background:'rgba(255,255,255,0.18)', padding:'2px 7px', fontFamily:"'Noto Serif KR', serif", fontWeight:600, letterSpacing:'0.05em' }}>
            {info.cycleLabel}
          </span>
          <span className="mono" style={{ opacity:0.9 }}>블록 {info.dayInBlock}/{info.blockDays}일</span>
        </div>
        <div style={{ marginTop:10, height:3, background:'rgba(255,255,255,0.2)', position:'relative' }}>
          <div style={{ position:'absolute', left:0, top:0, bottom:0, width: `${(info.dayInBlock / info.blockDays) * 100}%`, background:'#fff' }} />
        </div>
      </div>
    </div>
  );
}

function PrevScoreCard({ user }) {
  const [open, setOpen] = useState(false);
  // 화이트리스트에 등록된 이메일이 아니면 카드 자체를 렌더링하지 않음
  if (!user?.email || !OWNER_EMAILS.includes(user.email)) return null;
  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, marginBottom:16 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width:'100%', background:'none', border:'none', padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
        <div style={{ textAlign:'left' }}>
          <div className="kserif" style={{ fontSize:11, letterSpacing:'0.22em', color:C.muted, fontWeight:600 }}>15회 변시 기준점</div>
          <div className="serif" style={{ fontSize:22, fontWeight:600, color:C.ink, marginTop:4 }}>
            {PREV_SCORES.grandTotal.toFixed(2)}
            <span style={{ fontSize:12, color:C.muted, marginLeft:6, fontWeight:400 }}>/ {PREV_SCORES.grandMax}</span>
          </div>
        </div>
        <ChevronDown size={18} color={C.muted} style={{ transform: open ? 'rotate(180deg)' : 'none', transition:'transform .2s' }} />
      </button>
      {open && (
        <div style={{ borderTop:`1px dashed ${C.lineSoft}`, padding:'14px 16px 18px', fontSize:12 }}>
          {Object.keys(SUBJECTS).map(sub => {
            const s = PREV_SCORES[sub];
            const pct = Math.round((s.total / s.max) * 100);
            return (
              <div key={sub} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
                  <span className="kserif" style={{ fontWeight:600, color:SUBJECTS[sub].color }}>{sub}</span>
                  <span className="mono" style={{ color:C.muted, fontSize:11 }}>{s.total.toFixed(2)} / {s.max} ({pct}%)</span>
                </div>
                <div style={{ height:3, background:C.lineSoft, position:'relative', marginBottom:6 }}>
                  <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${pct}%`, background:SUBJECTS[sub].color }} />
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:10, fontSize:10, color:C.muted }}>
                  {SUBJECTS[sub].types.map(t => {
                    const v = s[t.key]; if (v === undefined) return null;
                    return <span key={t.key} className="mono"><span style={{ color:C.muted }}>{t.label}</span> <span style={{ color:C.ink }}>{v.toFixed(2)}</span></span>;
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

/* ============================================================ HOME ============================================================ */

function HomeView({ today, dday, settings, logs, reviews, todos, tracks, examScores, moods, setMoods, user, onGoTo }) {
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
    <div className="fadeIn" style={{ paddingTop:20 }}>
      <section style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'28px 22px', marginBottom:14, position:'relative', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          <span style={{ width:18, height:1, background:C.accent }} />
          <span className="kserif" style={{ fontSize:10, letterSpacing:'0.25em', color:C.accent, fontWeight:600 }}>시험까지</span>
        </div>
        <div className="serif" style={{ fontSize:72, fontWeight:500, lineHeight:0.95, color:C.ink, letterSpacing:'-0.03em' }}>
          {Math.abs(dday)}<span style={{ fontSize:28, color:C.muted, marginLeft:6 }}>일</span>
        </div>
        <div className="kserif" style={{ marginTop:14, fontSize:13, color:C.muted, lineHeight:1.6 }}>
          {fmtKDate(settings.examDate)} · {settings.examLabel}<br />
          누적 <span style={{ color:C.ink, fontWeight:600 }}>{daysStudied}일</span> · 연속 <span style={{ color:C.accent, fontWeight:600 }}>{streak}일</span> · 이번 주 <span style={{ color:C.ink, fontWeight:600 }}>{fmtMin(weekTotalMin)}</span>
        </div>
        <div style={{ position:'absolute', right:18, top:22, display:'flex', flexDirection:'column', gap:4 }}>
          {[...Array(8)].map((_, i) => <span key={i} style={{ width:10, height:1, background: i < 3 ? C.accent : C.line }} />)}
        </div>
      </section>

      {inD7 && (
        <div style={{ background:C.accent, color:'#fff', padding:'12px 16px', marginBottom:14, fontSize:12, lineHeight:1.5 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
            <span className="kserif" style={{ fontWeight:600, fontSize:13 }}>벼락치기 모드 · D-{dday}</span>
            <span className="mono" style={{ fontSize:10, opacity:0.85 }}>D-7 진입</span>
          </div>
          <div style={{ marginTop:6, opacity:0.9 }}>핸드북·찌라시·빈출쟁점·요사 위주 · 새 자료 No</div>
        </div>
      )}
      {!inD7 && inD30 && (
        <div style={{ background:'#1A1915', color:'#fff', padding:'12px 16px', marginBottom:14, fontSize:12, lineHeight:1.5 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
            <span className="kserif" style={{ fontWeight:600, fontSize:13 }}>회독 압축 모드 · D-{dday}</span>
            <span className="mono" style={{ fontSize:10, opacity:0.7 }}>D-30 진입</span>
          </div>
          <div style={{ marginTop:6, opacity:0.85 }}>회차 회독 위주로 · 객관식 복수 회차/일</div>
        </div>
      )}

      {todayMock ? (
        <div style={{ marginBottom:18 }}>
          <div style={{ background: C.accent, color:'#fff', padding:'18px 20px', position:'relative', overflow:'hidden', border:`1px solid ${C.accent}` }}>
            <div style={{ position:'absolute', right:-10, top:-12, opacity:0.14, fontSize:120, fontWeight:700, fontFamily:"'Fraunces', serif", lineHeight:1 }}>!</div>
            <div style={{ position:'relative' }}>
              <div className="kserif" style={{ fontSize:10, letterSpacing:'0.22em', opacity:0.85, fontWeight:500 }}>오늘은 모의고사</div>
              <div className="serif" style={{ fontSize:26, fontWeight:600, letterSpacing:'-0.01em', marginTop:6 }}>{todayMock.label}</div>
              <div style={{ marginTop:8, fontSize:12 }}>
                <span className="mono" style={{ opacity:0.9 }}>
                  {todayMock.dayNum}/{todayMock.totalDays}일차 · {todayMock.start.slice(5)} ~ {todayMock.end.slice(5)}
                </span>
              </div>
              <div style={{ marginTop:10, height:3, background:'rgba(255,255,255,0.2)' }}>
                <div style={{ height:'100%', width:`${(todayMock.dayNum / todayMock.totalDays) * 100}%`, background:'#fff' }} />
              </div>
            </div>
          </div>
        </div>
      ) : cycleInfo ? (
        <div style={{ marginBottom:18 }}>
          <CycleCard info={cycleInfo} today={today} />
          {tomorrowInfo && tomorrowInfo.subject !== cycleInfo.subject && (
            <div style={{ background:C.paper, border:`1px solid ${C.line}`, borderTop:'none', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:12 }}>
              <span style={{ color:C.muted, letterSpacing:'0.05em' }}>내일부터 →</span>
              <span className="kserif" style={{ color: SUBJECTS[tomorrowInfo.subject].color, fontWeight:600 }}>
                {tomorrowInfo.subject}{tomorrowInfo.subject === '민사법' && ' + 국제거래법'}
                <span className="mono" style={{ color:C.muted, fontWeight:400, marginLeft:6, fontSize:10 }}>
                  {tomorrowInfo.cycleLabel} · {tomorrowInfo.blockDays}일
                </span>
              </span>
            </div>
          )}
          {upcomingMock && (
            <div style={{ background:C.paper, border:`1px solid ${C.line}`, borderTop:'none', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:12 }}>
              <span style={{ color:C.muted, letterSpacing:'0.05em' }}>다음 모의고사</span>
              <span className="kserif" style={{ color: C.accent, fontWeight:600 }}>
                {upcomingMock.label}
                <span className="mono" style={{ color:C.muted, fontWeight:400, marginLeft:6, fontSize:10 }}>
                  D-{daysDiff(today, upcomingMock.start)} · {upcomingMock.start.slice(5)}
                </span>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background:C.paper, border:`1px dashed ${C.line}`, padding:'18px', marginBottom:18, fontSize:12, color:C.muted, textAlign:'center', lineHeight:1.6 }}>
          {settings.mockExams && settings.mockExams.length > 0
            ? '사이클을 표시할 기준 모의고사가 없습니다.'
            : '모의고사 또는 본시험 일정을 등록해 주세요.'}
        </div>
      )}

      <SectionTitle action={{ label:'기록', onClick: () => onGoTo('log') }}>오늘 트랙 · {tracksDone}/5</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'10px 12px', marginBottom:18 }}>
        {TRACK_TYPES.map(tt => {
          const slot = todayTracks[tt.key] || {};
          return (
            <div key={tt.key} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:`1px dashed ${C.lineSoft}` }}>
              <span style={{
                width:22, height:22, background: slot.done ? tt.color : 'transparent',
                color: slot.done ? '#fff' : tt.color, border:`1px solid ${tt.color}`,
                display:'grid', placeItems:'center', fontSize:11, fontWeight:700,
                fontFamily:"'Noto Serif KR', serif", flexShrink:0,
              }}>{tt.short}</span>
              <span className="kserif" style={{ fontSize:11.5, color:C.muted, minWidth:74 }}>{tt.label}</span>
              <span className="kserif" style={{
                fontSize:12, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                color: slot.done ? C.ink : C.muted, fontWeight: slot.done ? 500 : 400,
                fontStyle: slot.text ? 'normal' : 'italic',
              }}>
                {slot.text || <span style={{ opacity:0.5 }}>—</span>}
              </span>
              {slot.done && <Check size={12} color={C.good} strokeWidth={2.5} />}
            </div>
          );
        })}
      </div>

      <SectionTitle>오늘 {fmtKDate(today).slice(5)}</SectionTitle>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8, marginBottom:22 }}>
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
          width:'100%', background:C.paper, border:`1px solid ${C.line}`,
          padding:'12px 14px', fontSize:13, outline:'none', marginBottom:22,
          fontFamily:"'Noto Serif KR', serif",
        }}
      />

      <SectionTitle action={{ label:'리포트', onClick: () => onGoTo('report') }}>이번 주 목표 · {weekPct}%</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'14px 16px', marginBottom:22 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:10 }}>
          <span className="mono" style={{ fontSize:11, color:C.muted }}>{weekStart.slice(5)} ~ {addDays(weekStart, 6).slice(5)}</span>
          <span className="serif" style={{ fontSize:15, fontWeight:600 }}>
            {fmtHour(weekTotalMin)}<span style={{ color:C.muted, fontSize:11, fontWeight:400 }}> / {fmtHour(weekTargetMin)}</span>
          </span>
        </div>
        {Object.keys(SUBJECTS).map(sub => {
          const cur = weekSubjectMin[sub] || 0;
          const tgt = settings.weeklyTargets[sub] || 0;
          const pct = tgt ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
          const over = tgt && cur > tgt;
          return (
            <div key={sub} style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                <span className="kserif" style={{ color:SUBJECTS[sub].color, fontWeight:600 }}>{sub}</span>
                <span className="mono" style={{ color:C.muted, fontSize:11 }}>
                  {fmtHour(cur)} / {fmtHour(tgt)} <span style={{ color: over ? C.good : pct >= 80 ? C.ink : C.muted, fontWeight:600 }}>{pct}%</span>
                </span>
              </div>
              <div style={{ height:4, background:C.lineSoft, position:'relative' }}>
                <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${pct}%`, background:SUBJECTS[sub].color, transition:'width .3s ease' }} />
              </div>
            </div>
          );
        })}
      </div>

      {recentScores.length > 0 && (
        <>
          <SectionTitle action={{ label:'기출', onClick: () => onGoTo('exams') }}>최근 객관식</SectionTitle>
          <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'10px 14px', marginBottom:22 }}>
            {recentScores.map(s => (
              <div key={s.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', fontSize:12, borderBottom:`1px dashed ${C.lineSoft}` }}>
                <span className="kserif" style={{ color: SUBJECTS[s.subject]?.color, fontWeight:600 }}>
                  {s.round}회 {s.subject.replace('법', '')}
                </span>
                <span className="mono" style={{ color: C.ink }}>
                  <span style={{ color: C.accent, fontWeight:600 }}>{s.wrong}</span>
                  <span style={{ color: C.muted }}> 틀림 · {s.date.slice(5)}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle>최근 7일</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'16px 10px 8px', marginBottom:22 }}>
        <div style={{ width:'100%', height:170 }}>
          <ResponsiveContainer>
            <BarChart data={weekData} barCategoryGap="25%">
              <XAxis dataKey="day" tick={{ fill:C.muted, fontSize:11, fontFamily:'JetBrains Mono' }} axisLine={{ stroke:C.line }} tickLine={false} />
              <YAxis tick={{ fill:C.muted, fontSize:10, fontFamily:'JetBrains Mono' }} axisLine={false} tickLine={false} width={28} unit="h" />
              <Tooltip cursor={{ fill:C.lineSoft }}
                contentStyle={{ background:C.paper, border:`1px solid ${C.line}`, borderRadius:0, fontSize:12 }}
                formatter={(v, name) => [`${v}h`, name]} labelFormatter={(l) => `${l}일`} />
              {Object.keys(SUBJECTS).map(sub => <Bar key={sub} dataKey={sub} stackId="a" fill={SUBJECTS[sub].color} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:10, paddingTop:10, borderTop:`1px dashed ${C.lineSoft}`, justifyContent:'center' }}>
          {Object.keys(SUBJECTS).map(sub => (
            <span key={sub} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:C.muted }}>
              <span style={{ width:8, height:8, background:SUBJECTS[sub].color, display:'inline-block' }} />{sub}
            </span>
          ))}
        </div>
      </div>

      {dueReviews.length > 0 && (
        <>
          <SectionTitle action={{ label:'전체', onClick: () => onGoTo('review') }}>오늘 회독</SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:22 }}>
            {dueReviews.slice(0, 4).map(r => (
              <button key={r.id} onClick={() => onGoTo('review')} className="lift"
                style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, cursor:'pointer', textAlign:'left' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0, flex:1 }}>
                  <span style={{ width:3, alignSelf:'stretch', background:SUBJECTS[r.subject]?.color || C.muted }} />
                  <div style={{ minWidth:0 }}>
                    <div className="kserif" style={{ fontSize:14, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.title}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{r.subject} · {r.roundNum}회독</div>
                  </div>
                </div>
                <span className="serif" style={{ fontSize:13, color:C.accent, fontWeight:600 }}>
                  {r.dueDate === today ? 'TODAY' : `${daysDiff(r.dueDate, today)}일 지남`}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <PrevScoreCard user={user} />
      <div style={{ height:20 }} />
    </div>
  );
}

/* ============================================================ CALENDAR ============================================================ */

function CalendarView({ today, logs, reviews, todos, setTodos, settings, tracks, moods, setMoods, schedules = [], setSchedules, onGoToLog }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(today + 'T00:00:00');
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);

  // 일정 추가 모드: null | 'start' | 'end' | 'form'
  const [addMode, setAddMode] = useState(null);
  const [pendingStart, setPendingStart] = useState(null);
  const [pendingEnd, setPendingEnd] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftColor, setDraftColor] = useState('#5B4A33');

  function startAddMode() {
    setAddMode('start');
    setPendingStart(null); setPendingEnd(null);
    setDraftTitle(''); setDraftColor('#5B4A33');
  }
  function cancelAddMode() {
    setAddMode(null);
    setPendingStart(null); setPendingEnd(null);
  }
  function commitSchedule() {
    if (!setSchedules || !pendingStart || !pendingEnd || !draftTitle.trim()) return;
    const [s, e] = pendingStart <= pendingEnd ? [pendingStart, pendingEnd] : [pendingEnd, pendingStart];
    setSchedules([...(schedules || []), {
      id: uid(), title: draftTitle.trim(), color: draftColor, start: s, end: e,
    }]);
    cancelAddMode();
  }
  function handleDayTap(d) {
    if (addMode === 'start') {
      setPendingStart(d); setPendingEnd(d); setAddMode('end');
    } else if (addMode === 'end') {
      setPendingEnd(d); setAddMode('form');
    } else {
      setSelected(d);
    }
  }
  function isInPending(d) {
    if (!pendingStart) return false;
    const end = pendingEnd || pendingStart;
    const [s, e] = pendingStart <= end ? [pendingStart, end] : [end, pendingStart];
    return d >= s && d <= e;
  }
  const palette = ['#5B4A33', '#1E3A5F', '#7A2828', '#2D5A3D', '#8B6914', '#7A1E1E'];

  // schedules: assign vertical lanes (0/1/2) so multiple overlapping schedules don't collide visually
  const scheduleLanes = useMemo(() => {
    const lanes = []; // each lane: list of { start, end }
    const out = {};   // id -> lane idx
    [...schedules].sort((a, b) => a.start.localeCompare(b.start)).forEach(s => {
      let placed = -1;
      for (let li = 0; li < lanes.length; li++) {
        if (lanes[li].every(x => x.end < s.start || x.start > s.end)) {
          lanes[li].push({ start: s.start, end: s.end });
          placed = li; break;
        }
      }
      if (placed === -1) { lanes.push([{ start: s.start, end: s.end }]); placed = lanes.length - 1; }
      out[s.id] = placed;
    });
    return out;
  }, [schedules]);

  function schedulesOnDay(d) {
    return schedules.filter(s => d >= s.start && d <= s.end);
  }

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
    <div className="fadeIn" style={{ paddingTop:20 }}>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', marginBottom:8 }}>
        <button onClick={prevMonth} style={{ background:'none', border:'none', padding:6, cursor:'pointer', color:C.ink }}><ChevronLeft size={18} /></button>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div className="serif" style={{ fontSize:18, fontWeight:600, letterSpacing:'-0.01em' }}>{monthName}</div>
          <button onClick={jumpToday}
            style={{ background:'transparent', border:`1px solid ${C.line}`, color:C.muted, padding:'3px 8px', fontSize:10, cursor:'pointer', letterSpacing:'0.1em', fontFamily:"'Noto Serif KR', serif" }}>
            오늘
          </button>
        </div>
        <button onClick={nextMonth} style={{ background:'none', border:'none', padding:6, cursor:'pointer', color:C.ink }}><ChevronRight size={18} /></button>
      </div>

      {/* 일정 추가 토글바 */}
      {addMode === null ? (
        <button onClick={startAddMode}
          style={{ width:'100%', background:C.paper, border:`1px dashed ${C.line}`, color:C.muted, padding:'8px', cursor:'pointer', fontSize:11, marginBottom:8, display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
          <Plus size={12} /> 일정 추가 (시작일·종료일 두 번 탭)
        </button>
      ) : addMode === 'form' ? (
        <div style={{ background:C.ink, color:'#fff', padding:'12px 14px', marginBottom:8 }}>
          <div className="kserif" style={{ fontSize:10, letterSpacing:'0.22em', opacity:0.7, marginBottom:8, fontWeight:600 }}>
            새 일정 · {(pendingStart <= pendingEnd ? pendingStart : pendingEnd).slice(5).replace('-','/')} ~ {(pendingStart <= pendingEnd ? pendingEnd : pendingStart).slice(5).replace('-','/')}
          </div>
          <input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} autoFocus
            placeholder="일정 제목 (예: 김영환 헌법 인강)"
            style={{ width:'100%', background:'rgba(255,255,255,0.1)', border:'none', borderBottom:'1px solid rgba(255,255,255,0.3)', color:'#fff', padding:'7px 4px', fontSize:13, marginBottom:10, outline:'none' }} />
          <div style={{ display:'flex', gap:5, marginBottom:10, alignItems:'center' }}>
            <span style={{ fontSize:10, opacity:0.7, marginRight:4 }}>색</span>
            {palette.map(c => (
              <button key={c} onClick={() => setDraftColor(c)}
                style={{ width:22, height:22, background:c, cursor:'pointer', border: draftColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)', padding:0 }} />
            ))}
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={cancelAddMode} style={{ flex:1, background:'rgba(255,255,255,0.1)', color:'#fff', border:'none', padding:'8px', cursor:'pointer', fontSize:12 }}>취소</button>
            <button onClick={commitSchedule} disabled={!draftTitle.trim()}
              style={{ flex:2, background: draftTitle.trim() ? '#fff' : 'rgba(255,255,255,0.3)', color: draftTitle.trim() ? C.ink : 'rgba(255,255,255,0.5)', border:'none', padding:'8px', cursor: draftTitle.trim() ? 'pointer' : 'default', fontSize:12, fontWeight:600 }}>저장</button>
          </div>
        </div>
      ) : (
        <div style={{ background:C.accent, color:'#fff', padding:'10px 14px', marginBottom:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div className="kserif" style={{ fontSize:12, fontWeight:600 }}>
            {addMode === 'start' ? '시작일을 탭하세요' : `종료일을 탭하세요 · 시작 ${pendingStart.slice(5).replace('-','/')}`}
          </div>
          <button onClick={cancelAddMode} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', padding:'4px 10px', fontSize:11, cursor:'pointer' }}>취소</button>
        </div>
      )}

      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'10px 8px', marginBottom:14 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', marginBottom:6 }}>
          {['일','월','화','수','목','금','토'].map((d, i) => (
            <div key={d} className="kserif" style={{
              textAlign:'center', fontSize:10, padding:'4px 0',
              color: i === 0 ? C.accent : i === 6 ? '#1E3A5F' : C.muted,
              letterSpacing:'0.1em', fontWeight:600,
            }}>{d}</div>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:2 }}>
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
            const inPending = addMode && isInPending(d);
            const isPendingStart = pendingStart === d;
            return (
              <button key={i} onClick={() => handleDayTap(d)}
                style={{
                  position:'relative', aspectRatio:'1 / 1.15',
                  background: inPending ? C.accent : (isSelected && !addMode) ? C.ink : (mock ? '#FBE4E4' : intensityBg[intLevel]),
                  border: isPendingStart ? `2px solid ${C.ink}` : isToday && !isSelected && !inPending ? `1.5px solid ${C.accent}` : `1px solid ${(isSelected && !addMode) ? C.ink : 'transparent'}`,
                  cursor:'pointer', padding:'3px 3px 2px',
                  display:'flex', flexDirection:'column', alignItems:'stretch',
                  opacity: inMonth ? 1 : 0.35,
                  color: (inPending || (isSelected && !addMode)) ? C.paper : C.ink, overflow:'hidden',
                }}>
                {mock && (<div style={{ position:'absolute', top:0, left:0, right:0, height:3, background: C.accent, opacity: isSelected ? 0.85 : 1 }} />)}
                {!mock && cycleColor && (<div style={{ position:'absolute', top:0, left:0, right:0, height:3, background: cycleColor, opacity: isSelected ? 0.85 : 1 }} />)}
                {schedulesOnDay(d).slice(0, 3).map(s => {
                  const lane = scheduleLanes[s.id] || 0;
                  const isStart = d === s.start;
                  const isEnd = d === s.end;
                  return (
                    <div key={s.id} style={{
                      position:'absolute', left: isStart ? 2 : -1, right: isEnd ? 2 : -1,
                      bottom: 14 + lane * 5, height: 3,
                      background: s.color || C.accent, opacity: isSelected ? 0.85 : 0.9,
                    }} />
                  );
                })}
                <div style={{
                  fontSize:11, fontWeight: isToday ? 700 : 500,
                  textAlign:'left', lineHeight:1, marginTop: (cycleColor || mock) ? 4 : 1,
                  fontFamily:"'JetBrains Mono', monospace",
                  color: isSelected ? C.paper : (mock ? C.accent : (dow === 0 ? C.accent : dow === 6 ? '#1E3A5F' : C.ink)),
                }}>{dt.getDate()}</div>
                {mock ? (
                  <div style={{ fontSize: 9, fontFamily:"'Noto Serif KR', serif", fontWeight:700, color: isSelected ? C.paper : C.accent, textAlign:'center', marginTop:2, lineHeight:1.1, letterSpacing:'-0.02em' }}>
                    {isMockFirst ? '모의' : '시험'}
                    <div style={{ fontSize: 8, marginTop:1, fontFamily:"'JetBrains Mono', monospace", fontWeight:500, opacity:0.85 }}>{mock.dayNum}일차</div>
                  </div>
                ) : cInfo && (
                  <div style={{ fontSize: 11, fontFamily:"'Noto Serif KR', serif", fontWeight:700, color: isSelected ? C.paper : cycleColor, textAlign:'center', marginTop:2, opacity: isSelected ? 0.95 : (isBlockFirst ? 1 : 0.78) }}>
                    {SUBJECTS[cInfo.subject].short}
                    <span style={{ fontSize: 8, marginLeft:1, fontFamily:"'JetBrains Mono', monospace", fontWeight:500, opacity:0.7 }}>{cInfo.dayInBlock}</span>
                  </div>
                )}
                <div style={{ flex:1 }} />
                <div style={{ display:'flex', flexDirection:'column', gap:1, alignItems:'center' }}>
                  {reviewsOnDay.length > 0 && (
                    <div style={{ display:'flex', gap:1.5, justifyContent:'center' }}>
                      {[...new Set(reviewsOnDay.map(r => r.subject))].slice(0, 4).map((sub, idx) => (
                        <span key={idx} style={{ width:3, height:3, borderRadius:'50%', background: SUBJECTS[sub]?.color || C.muted, opacity: isSelected ? 0.95 : 1 }} />
                      ))}
                    </div>
                  )}
                  {todoOpen > 0 && (
                    <span style={{ fontSize:8, fontWeight:700, color: isSelected ? C.paper : C.accent, fontFamily:"'JetBrains Mono', monospace", lineHeight:1 }}>✓{todoOpen}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display:'flex', flexWrap:'wrap', gap:12, justifyContent:'center', paddingTop:10, marginTop:6, borderTop:`1px dashed ${C.lineSoft}`, fontSize:10, color:C.muted }}>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:18, height:3, background:C.accent }} /><span>모의고사</span></span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ display:'flex', gap:1 }}>
              {Object.keys(SUBJECTS).slice(0, 3).map(sub => (<span key={sub} style={{ width:8, height:3, background:SUBJECTS[sub].color }} />))}
            </span>
            <span>사이클</span>
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ display:'flex', gap:1 }}>
              {intensityBg.slice(1).map((bg, i) => (<span key={i} style={{ width:7, height:7, background:bg, border:`1px solid ${C.lineSoft}` }} />))}
            </span>
            <span>공부량</span>
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:5, height:5, borderRadius:'50%', background:C.accent }} /><span>회독</span></span>
          <span style={{ display:'flex', alignItems:'center', gap:3 }}><span style={{ fontSize:9, color:C.accent, fontWeight:700, fontFamily:"'JetBrains Mono', monospace" }}>✓N</span><span>할일</span></span>
        </div>
      </div>

      <DayDetail
        date={selDate} minutes={selMinutes} log={selLog} todos={selTodos}
        dueReviews={selDueReviews}
        cycleInfo={selCycleInfo} mock={selMock} tracks={selTracks}
        schedules={schedulesOnDay(selDate)}
        mood={moods[selDate] || ''}
        setMood={(v) => setMoods(prev => {
          const next = { ...prev };
          if (v) next[selDate] = v; else delete next[selDate];
          return next;
        })}
        onAddTodo={addTodo} onToggleTodo={toggleTodo} onRemoveTodo={removeTodo}
        onGoToLog={onGoToLog} isToday={selDate === today}
      />

      <div style={{ height:20 }} />
    </div>
  );
}

function DayDetail({ date, minutes, log, todos, dueReviews, cycleInfo, mock, tracks, schedules = [], mood, setMood, onAddTodo, onToggleTodo, onRemoveTodo, onGoToLog, isToday }) {
  const [newTodo, setNewTodo] = useState('');
  const [moodLocal, setMoodLocal] = useState(mood);
  useEffect(() => { setMoodLocal(mood); }, [mood, date]);

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

  function submit() { onAddTodo(newTodo); setNewTodo(''); }

  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}` }}>
      <div style={{ padding:'14px 16px', borderBottom:`1px solid ${C.lineSoft}`, display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
        <div>
          <div className="kserif" style={{ fontSize:15, fontWeight:600 }}>{fmtKDate(date)}</div>
          {isToday && <span className="kserif" style={{ fontSize:10, color:C.accent, marginLeft:6, letterSpacing:'0.1em', fontWeight:600 }}>TODAY</span>}
        </div>
        <span className="serif mono" style={{ fontSize:14, fontWeight:600, color: minutes > 0 ? C.ink : C.muted }}>{fmtMin(minutes)}</span>
      </div>

      {mock && (
        <div style={{ padding:'14px 16px', borderBottom:`1px solid ${C.lineSoft}`, background: C.accent, color:'#fff', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:40, height:40, background:'rgba(255,255,255,0.2)', display:'grid', placeItems:'center', flexShrink:0 }}>
            <span className="serif" style={{ fontSize:18, fontWeight:700, lineHeight:1 }}>{mock.label.match(/\d/)?.[0] || '!'}</span>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="kserif" style={{ fontSize:14, fontWeight:600 }}>{mock.label}</div>
            <div className="mono" style={{ fontSize:10.5, opacity:0.9, marginTop:2 }}>{mock.dayNum}/{mock.totalDays}일차 · {mock.start.slice(5)} ~ {mock.end.slice(5)}</div>
          </div>
        </div>
      )}

      {cycleInfo && !mock && (
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.lineSoft}`, background: SUBJECTS[cycleInfo.subject].color, color:'#fff', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(255,255,255,0.2)', display:'grid', placeItems:'center', flexShrink:0 }}>
            <span className="serif" style={{ fontSize:18, fontWeight:700 }}>{SUBJECTS[cycleInfo.subject].short}</span>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="kserif" style={{ fontSize:14, fontWeight:600 }}>
              {cycleInfo.subject}{cycleInfo.subject === '민사법' && ' + 국제거래법'}
            </div>
            <div className="mono" style={{ fontSize:10.5, opacity:0.9, marginTop:2 }}>{cycleInfo.cycleLabel} · 블록 {cycleInfo.dayInBlock}/{cycleInfo.blockDays}일</div>
          </div>
          {cycleInfo.isBlockLast && (
            <div style={{ fontSize:10, padding:'3px 8px', background:'rgba(255,255,255,0.2)', fontFamily:"'Noto Serif KR', serif", fontWeight:600, letterSpacing:'0.05em' }}>블록 마지막날</div>
          )}
        </div>
      )}

      {schedules.length > 0 && (
        <div style={{ padding:'10px 16px', borderBottom:`1px solid ${C.lineSoft}` }}>
          <div className="kserif" style={{ fontSize:10, letterSpacing:'0.2em', color:C.muted, fontWeight:600, marginBottom:6 }}>일정</div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {schedules.map(s => {
              const dayIdx = daysDiff(s.start, date) + 1;
              const total = daysDiff(s.start, s.end) + 1;
              return (
                <div key={s.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ width:3, height:14, background: s.color || C.accent, flexShrink:0 }} />
                  <span style={{ fontSize:12, fontWeight:600, color:C.ink, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.title}</span>
                  <span className="mono" style={{ fontSize:10, color:C.muted, flexShrink:0 }}>{dayIdx}/{total}일</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasTrackData && (
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.lineSoft}` }}>
          <div className="kserif" style={{ fontSize:10, letterSpacing:'0.2em', color:C.muted, fontWeight:600, marginBottom:8, display:'flex', justifyContent:'space-between' }}>
            <span>오늘 트랙</span>
            <span className="mono" style={{ letterSpacing:0, fontSize:10 }}>{tracksDoneCount}/5</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {TRACK_TYPES.map(tt => {
              const slot = tracks[tt.key];
              if (!slot?.done && !slot?.text) return null;
              return (
                <div key={tt.key} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
                  <span style={{
                    width:18, height:18, background: slot.done ? tt.color : 'transparent',
                    color: slot.done ? '#fff' : tt.color, border:`1px solid ${tt.color}`,
                    display:'grid', placeItems:'center', fontSize:9, fontWeight:700,
                    fontFamily:"'Noto Serif KR', serif", flexShrink:0,
                  }}>{tt.short}</span>
                  <span className="kserif" style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: slot.done ? C.ink : C.muted }}>
                    {slot.text || tt.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(subjectMin).length > 0 && (
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.lineSoft}`, display:'flex', flexWrap:'wrap', gap:6 }}>
          {Object.entries(subjectMin).map(([sub, m]) => (
            <span key={sub} className="kserif" style={{
              fontSize:11, padding:'3px 8px',
              border:`1px solid ${SUBJECTS[sub].color}`,
              color: SUBJECTS[sub].color, fontWeight:600,
              display:'inline-flex', alignItems:'center', gap:5,
            }}>
              {sub}<span className="mono" style={{ fontWeight:400, opacity:0.85 }}>{fmtHour(m)}</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.lineSoft}` }}>
        <div className="kserif" style={{ fontSize:10, letterSpacing:'0.2em', color:C.muted, fontWeight:600, marginBottom:6 }}>한 줄</div>
        <input
          value={moodLocal}
          onChange={e => setMoodLocal(e.target.value)}
          onBlur={() => setMood(moodLocal.trim())}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
          placeholder="컨디션·느낀점 메모"
          style={{ width:'100%', background:C.bg, border:`1px solid ${C.lineSoft}`, padding:'7px 10px', fontSize:12, outline:'none', fontFamily:"'Noto Serif KR', serif" }}
        />
      </div>

      {dueReviews.length > 0 && (
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.lineSoft}` }}>
          <div className="kserif" style={{ fontSize:10, letterSpacing:'0.2em', color:C.muted, fontWeight:600, marginBottom:8 }}>회독</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {dueReviews.map((r, i) => (
              <div key={`due-${r.id}-${r.num}-${i}`} style={{
                display:'flex', alignItems:'center', gap:8,
                padding:'7px 10px', background:C.bg, border:`1px solid ${C.lineSoft}`,
                borderLeft:`3px solid ${SUBJECTS[r.subject]?.color || C.muted}`,
              }}>
                <span className="serif" style={{
                  fontSize:11, fontWeight:600, color:'#fff',
                  background:SUBJECTS[r.subject]?.color || C.muted,
                  padding:'2px 6px', minWidth:36, textAlign:'center',
                }}>{r.num}회독</span>
                <span className="kserif" style={{ flex:1, fontSize:13, fontWeight:500, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {r.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding:'12px 16px' }}>
        <div className="kserif" style={{ fontSize:10, letterSpacing:'0.2em', color:C.muted, fontWeight:600, marginBottom:8, display:'flex', justifyContent:'space-between' }}>
          <span>할 일</span>
          {todos.length > 0 && <span className="mono" style={{ letterSpacing:0, fontSize:10 }}>{doneTodos.length}/{todos.length}</span>}
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:10 }}>
          {openTodos.map(t => <TodoRow key={t.id} todo={t} onToggle={() => onToggleTodo(t.id)} onRemove={() => onRemoveTodo(t.id)} />)}
          {doneTodos.map(t => <TodoRow key={t.id} todo={t} onToggle={() => onToggleTodo(t.id)} onRemove={() => onRemoveTodo(t.id)} />)}
          {todos.length === 0 && <div style={{ fontSize:12, color:C.muted, padding:'8px 0' }}>등록된 할 일이 없습니다.</div>}
        </div>

        <div style={{ display:'flex', gap:6 }}>
          <input value={newTodo} onChange={e => setNewTodo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="할 일 추가"
            style={{ flex:1, border:`1px solid ${C.line}`, background:C.bg, padding:'8px 10px', fontSize:12, outline:'none' }} />
          <button onClick={submit} disabled={!newTodo.trim()} className="lift"
            style={{ background: newTodo.trim() ? C.accent : C.line, color:'#fff', border:'none', padding:'0 12px', fontSize:12, cursor: newTodo.trim() ? 'pointer' : 'default', display:'flex', alignItems:'center' }}>
            <Plus size={14} />
          </button>
        </div>

        {isToday && (
          <button onClick={onGoToLog}
            style={{ width:'100%', marginTop:10, background:'transparent', border:`1px solid ${C.line}`, color:C.ink, padding:'8px', fontSize:11, cursor:'pointer', fontFamily:"'Noto Serif KR', serif", letterSpacing:'0.05em' }}>
            오늘 공부 기록하러 가기 →
          </button>
        )}
      </div>
    </div>
  );
}

function TodoRow({ todo, onToggle, onRemove }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 4px', borderBottom:`1px dashed ${C.lineSoft}` }}>
      <button onClick={onToggle} style={{ background:'none', border:'none', padding:2, cursor:'pointer', color: todo.done ? C.good : C.muted, display:'flex' }}>
        {todo.done ? <CheckSquare size={16} strokeWidth={2} /> : <Square size={16} strokeWidth={1.5} />}
      </button>
      <span className="kserif" style={{
        flex:1, fontSize:13, minWidth:0,
        textDecoration: todo.done ? 'line-through' : 'none',
        color: todo.done ? C.muted : C.ink, wordBreak:'keep-all',
      }}>
        {todo.title}
        {todo.fromMock && <span style={{ fontSize:9, color:C.accent, marginLeft:6, fontFamily:"'JetBrains Mono', monospace" }}>모의리뷰</span>}
      </span>
      <button onClick={onRemove} style={{ background:'none', border:'none', padding:4, cursor:'pointer', color:C.muted, display:'flex' }}>
        <X size={12} />
      </button>
    </div>
  );
}

/* ============================================================ LOG (기록) ============================================================ */

function LogView({ today, settings, logs, setLogs, tracks, setTracks, examScores, setExamScores, initialDate }) {
  const [date, setDate] = useState(initialDate || today);

  return (
    <div className="fadeIn" style={{ padding:'18px 0 24px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, gap:8 }}>
        <button onClick={() => setDate(addDays(date, -1))} style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'7px 10px', cursor:'pointer' }}>
          <ChevronLeft size={14} />
        </button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ flex:1, background:C.paper, border:`1px solid ${C.line}`, padding:'8px 10px', fontSize:13, textAlign:'center', outline:'none' }} />
        <button onClick={() => setDate(addDays(date, 1))} style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'7px 10px', cursor:'pointer' }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {date !== today && (
        <button onClick={() => setDate(today)} style={{ background:'none', border:'none', color:C.accent, fontSize:11, cursor:'pointer', marginBottom:12 }}>오늘로 돌아가기 →</button>
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
    <div style={{ marginBottom:24 }}>
      <SectionTitle>오늘의 5트랙</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'4px 0' }}>
        {TRACK_TYPES.map((t, i) => {
          const v = dayTracks[t.key] || {};
          return (
            <div key={t.key} style={{
              display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
              borderBottom: i < TRACK_TYPES.length - 1 ? `1px dashed ${C.lineSoft}` : 'none',
            }}>
              <button onClick={() => toggle(t.key)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, flexShrink:0 }}>
                {v.done ? <CheckSquare size={18} color={t.color} /> : <Square size={18} color={C.muted} />}
              </button>
              <div style={{ width:28, fontFamily:"'Fraunces', serif", fontWeight:600, fontSize:16, color:t.color, textAlign:'center', flexShrink:0 }}>
                {t.short}
              </div>
              <input
                value={v.text || ''}
                onChange={e => setText(t.key, e.target.value)}
                placeholder={t.placeholder}
                style={{
                  flex:1, background:'transparent', border:'none', outline:'none',
                  fontSize:12, color:C.ink, padding:'2px 0',
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

function TimeSection({ date, logs, setLogs, settings }) {
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
    <div style={{ marginBottom:24 }}>
      <SectionTitle>학습 시간 (분)</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}` }}>
        {Object.keys(SUBJECTS).map((sub, si) => {
          const meta = SUBJECTS[sub];
          const sTot = subTotals[sub] || 0;
          return (
            <div key={sub} style={{ borderTop: si > 0 ? `1px solid ${C.lineSoft}` : 'none', padding:'10px 14px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
                <span className="kserif" style={{ fontSize:13, fontWeight:600, color:meta.color }}>{sub}</span>
                <span className="mono" style={{ fontSize:11, color:C.muted }}>{fmtMin(sTot)}</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:6 }}>
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
        <div style={{ textAlign:'right', marginTop:8, fontSize:12, color:C.muted }}>
          합계 <span className="mono" style={{ color:C.ink, fontWeight:600 }}>{fmtMin(grandTotal)}</span>
        </div>
      )}
    </div>
  );
}

function TypeEntry({ label, value, onChange, color }) {
  function bump(d) { onChange(Math.max(0, value + d)); }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:'4px 6px' }}>
      <span style={{ fontSize:10, color:C.muted, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</span>
      <button onClick={() => bump(-15)} style={{ background:'none', border:'none', cursor:'pointer', padding:'2px 4px', color:C.muted }}>
        <Minus size={11} />
      </button>
      <input type="number" inputMode="numeric" value={value || ''} onChange={e => onChange(parseInt(e.target.value) || 0)}
        style={{ width:36, textAlign:'center', background:'transparent', border:'none', outline:'none', fontSize:11, fontFamily:"'JetBrains Mono', monospace", color:value > 0 ? color : C.muted, fontWeight:600 }} />
      <button onClick={() => bump(15)} style={{ background:'none', border:'none', cursor:'pointer', padding:'2px 4px', color:C.muted }}>
        <Plus size={11} />
      </button>
    </div>
  );
}

const SCORE_TYPES = ['선택형'];

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
      id: uid(),
      date,
      round: parseInt(round),
      subject,
      type: '선택형',
      wrong: parseInt(wrong),
      total: total ? parseInt(total) : null,
      note: note.trim() || null,
    };
    setExamScores([...examScores, newScore]);
    setRound(''); setWrong(''); setTotal(''); setNote('');
  }
  function del(id) {
    setExamScores(examScores.filter(s => s.id !== id));
  }

  return (
    <div style={{ marginBottom:24 }}>
      <SectionTitle>객관식 회차 점수</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'12px 14px' }}>
        {todays.length > 0 && (
          <div style={{ marginBottom:10 }}>
            {todays.map(s => (
              <div key={s.id} style={{ display:'flex', alignItems:'baseline', gap:10, padding:'5px 0', borderBottom:`1px dashed ${C.lineSoft}`, fontSize:12 }}>
                <span style={{ color:SUBJECTS[s.subject].color, fontWeight:600, minWidth:40 }}>{SUBJECTS[s.subject].short}</span>
                <span className="mono" style={{ color:C.muted, minWidth:30 }}>{s.round}회</span>
                <span className="mono" style={{ color:C.ink, minWidth:40 }}>-{s.wrong}{s.total ? `/${s.total}` : ''}</span>
                <span style={{ flex:1, color:C.muted, fontSize:11 }}>{s.note || ''}</span>
                <button onClick={() => del(s.id)} style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
                  <X size={12} color={C.muted} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1.4fr 1fr 1fr auto', gap:5 }}>
          <select value={subject} onChange={e => setSubject(e.target.value)} style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:'6px', fontSize:11, outline:'none' }}>
            {Object.keys(SUBJECTS).filter(s => s !== '국제거래법').map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={round} onChange={e => setRound(e.target.value)} placeholder="회차" type="number" inputMode="numeric"
            style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:'6px', fontSize:11, outline:'none' }} />
          <input value={wrong} onChange={e => setWrong(e.target.value)} placeholder="틀림" type="number" inputMode="numeric"
            style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:'6px', fontSize:11, outline:'none' }} />
          <input value={total} onChange={e => setTotal(e.target.value)} placeholder="총" type="number" inputMode="numeric"
            style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:'6px', fontSize:11, outline:'none' }} />
          <button onClick={add} style={{ background:C.ink, color:'#fff', border:'none', padding:'6px 10px', cursor:'pointer', fontSize:11 }}>+</button>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="메모(선택)"
          style={{ width:'100%', marginTop:5, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:'6px 8px', fontSize:11, outline:'none' }} />
      </div>
    </div>
  );
}

/* ============================================================ EXAMS (기출 회차 점수) ============================================================ */

function ExamsView({ examScores }) {
  const [filterSubject, setFilterSubject] = useState('전체');

  // matrix: subject x round
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
    <div className="fadeIn" style={{ padding:'18px 0 24px' }}>
      <div style={{ marginBottom:6 }}>
        <h1 className="serif" style={{ margin:0, fontSize:22, fontWeight:600 }}>기출 회차</h1>
        <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>객관식 회차별 틀린 개수 추이</div>
      </div>

      {chartData.length === 0 ? (
        <div style={{ background:C.paper, border:`1px dashed ${C.line}`, padding:24, textAlign:'center', fontSize:12, color:C.muted, margin:'18px 0' }}>
          기록 탭에서 회차 점수를 입력해 보세요
        </div>
      ) : (
        <>
          {/* Trend chart */}
          <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'16px 12px 12px', margin:'14px 0 18px' }}>
            <div className="kserif" style={{ fontSize:10, color:C.muted, letterSpacing:'0.18em', marginBottom:10, paddingLeft:4, fontWeight:600 }}>틀린 개수 추이</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top:5, right:10, bottom:5, left:-10 }}>
                <CartesianGrid stroke={C.lineSoft} strokeDasharray="3 3" />
                <XAxis dataKey="round" tick={{ fontSize:10, fill:C.muted }} />
                <YAxis reversed tick={{ fontSize:10, fill:C.muted }} />
                <Tooltip contentStyle={{ background:C.paper, border:`1px solid ${C.line}`, fontSize:11 }} />
                {subjects.map(sub => (
                  <Line key={sub} type="monotone" dataKey={sub} stroke={SUBJECTS[sub].color} strokeWidth={2} dot={{ r:3 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:6, flexWrap:'wrap' }}>
              {subjects.map(sub => (
                <span key={sub} style={{ fontSize:10, color:C.muted, display:'inline-flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:10, height:2, background:SUBJECTS[sub].color, display:'inline-block' }} /> {sub}
                </span>
              ))}
            </div>
          </div>

          {/* Matrix */}
          <SectionTitle>회차 매트릭스</SectionTitle>
          <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'10px 0', overflowX:'auto', marginBottom:18 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr>
                  <th style={{ padding:'6px 10px', textAlign:'left', color:C.muted, fontWeight:500, borderBottom:`1px solid ${C.lineSoft}` }}>회차</th>
                  {subjects.map(sub => (
                    <th key={sub} style={{ padding:'6px 10px', textAlign:'center', color:SUBJECTS[sub].color, fontWeight:600, borderBottom:`1px solid ${C.lineSoft}` }}>{SUBJECTS[sub].short}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRounds.map(r => (
                  <tr key={r}>
                    <td className="mono" style={{ padding:'6px 10px', color:C.ink, borderBottom:`1px dashed ${C.lineSoft}` }}>{r}회</td>
                    {subjects.map(sub => {
                      const s = matrix[sub][r];
                      return (
                        <td key={sub} className="mono" style={{ padding:'6px 10px', textAlign:'center', color: s ? SUBJECTS[sub].color : C.muted, borderBottom:`1px dashed ${C.lineSoft}`, fontWeight: s ? 600 : 400 }}>
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

      {/* History list */}
      <SectionTitle>전체 기록</SectionTitle>
      <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
        {['전체', ...subjects].map(s => (
          <button key={s} onClick={() => setFilterSubject(s)}
            style={{
              background: filterSubject === s ? C.ink : C.paper,
              color: filterSubject === s ? '#fff' : C.muted,
              border: `1px solid ${filterSubject === s ? C.ink : C.line}`,
              padding:'4px 10px', fontSize:11, cursor:'pointer',
            }}>{s}</button>
        ))}
      </div>

      {sortedScores.length === 0 ? (
        <div style={{ fontSize:11, color:C.muted, textAlign:'center', padding:14 }}>기록이 없습니다</div>
      ) : (
        <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'4px 14px' }}>
          {sortedScores.map(s => (
            <div key={s.id} style={{ display:'flex', alignItems:'baseline', gap:8, padding:'8px 0', borderBottom:`1px dashed ${C.lineSoft}`, fontSize:12 }}>
              <span className="mono" style={{ color:C.muted, fontSize:10, minWidth:60 }}>{s.date.slice(5)}</span>
              <span style={{ color:SUBJECTS[s.subject].color, fontWeight:600, minWidth:50 }}>{s.subject}</span>
              <span className="mono" style={{ color:C.muted, minWidth:30 }}>{s.round}회</span>
              <span className="mono" style={{ color:C.ink, minWidth:30 }}>-{s.wrong}</span>
              {s.note && <span style={{ flex:1, fontSize:10, color:C.muted, fontStyle:'italic' }}>{s.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================ REVIEW (회독) ============================================================ */

function ReviewView({ today, reviews, setReviews, books, setBooks, materials, setMaterials, materialLog, setMaterialLog }) {
  const [tab, setTab] = useState('topics');

  const tabs = [
    { key:'topics', label:'주제', icon:RotateCw },
    { key:'books', label:'문제집', icon:BookOpen },
    { key:'materials', label:'자료', icon:Library },
  ];

  return (
    <div className="fadeIn" style={{ padding:'18px 0 24px' }}>
      <div style={{ marginBottom:14 }}>
        <h1 className="serif" style={{ margin:0, fontSize:22, fontWeight:600 }}>회독</h1>
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:14, borderBottom:`1px solid ${C.line}` }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                background:'none', border:'none', padding:'8px 12px', cursor:'pointer',
                color: active ? C.accent : C.muted,
                borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
                marginBottom:-1, display:'flex', alignItems:'center', gap:5,
                fontSize:12, fontWeight: active ? 600 : 400, fontFamily:"'Noto Serif KR', serif",
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
      <div style={{ fontSize:11, color:C.muted, marginBottom:14, lineHeight:1.6 }}>
        주제별 5–3–2 망각곡선 회독
      </div>
      <button onClick={() => setShowAdd(true)} style={{ width:'100%', background:C.ink, color:'#fff', border:'none', padding:'10px', cursor:'pointer', marginBottom:14, fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
        <Plus size={14} /> 주제 추가
      </button>

      {showAdd && <AddReviewForm onAdd={addReview} onCancel={() => setShowAdd(false)} />}

      {enriched.length === 0 ? (
        <div style={{ textAlign:'center', padding:30, color:C.muted, fontSize:12, background:C.paper, border:`1px dashed ${C.line}` }}>
          회독할 주제를 추가해 보세요
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
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
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:14 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="주제 (예: 채권자대위)"
        style={{ width:'100%', background:C.bg, border:`1px solid ${C.line}`, padding:'8px 10px', fontSize:12, marginBottom:8, outline:'none' }} />
      <div style={{ display:'flex', gap:6, marginBottom:8 }}>
        {Object.keys(SUBJECTS).map(s => (
          <button key={s} onClick={() => setSubject(s)}
            style={{
              flex:1, background: subject === s ? SUBJECTS[s].color : C.bg,
              color: subject === s ? '#fff' : C.muted,
              border: `1px solid ${subject === s ? SUBJECTS[s].color : C.lineSoft}`,
              padding:'6px 4px', fontSize:10, cursor:'pointer',
            }}>{SUBJECTS[s].short}</button>
        ))}
      </div>
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="메모 (선택)" rows={2}
        style={{ width:'100%', background:C.bg, border:`1px solid ${C.line}`, padding:'8px 10px', fontSize:12, marginBottom:10, outline:'none', resize:'vertical', fontFamily:"'Noto Serif KR', serif" }} />
      <div style={{ display:'flex', gap:6 }}>
        <button onClick={onCancel} style={{ flex:1, background:C.bg, border:`1px solid ${C.line}`, padding:'8px', cursor:'pointer', fontSize:12 }}>취소</button>
        <button onClick={() => title && onAdd({ title, subject, note })}
          style={{ flex:1, background:C.ink, color:'#fff', border:'none', padding:'8px', cursor:'pointer', fontSize:12 }}>추가</button>
      </div>
    </div>
  );
}

function ReviewCard({ review, onReviewed, onDelete }) {
  const isDue = review.daysUntilDue <= 0;
  const subColor = SUBJECTS[review.subject].color;
  return (
    <div style={{ background:C.paper, border:`1px solid ${isDue ? C.accent : C.line}`, padding:'12px 14px', display:'flex', alignItems:'center', gap:10 }}>
      <div style={{ width:3, alignSelf:'stretch', background:subColor }} />
      <div style={{ flex:1 }}>
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:8 }}>
          <div style={{ fontSize:13, fontWeight:600, color:C.ink }}>{review.title}</div>
          <div className="mono" style={{ fontSize:10, color: isDue ? C.accent : C.muted, fontWeight: isDue ? 600 : 400 }}>
            {isDue ? '오늘' : `D-${review.daysUntilDue}`}
          </div>
        </div>
        <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>
          <span style={{ color:subColor, fontWeight:600 }}>{review.subject}</span> · 회독 {review.cycleIndex + 1}회차
        </div>
        {review.note && <div style={{ fontSize:10, color:C.muted, marginTop:4, fontStyle:'italic' }}>{review.note}</div>}
      </div>
      <button onClick={onReviewed} style={{ background:C.ink, color:'#fff', border:'none', padding:'5px 8px', cursor:'pointer', fontSize:10 }}>
        <Check size={11} />
      </button>
      <button onClick={onDelete} style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
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
      <div style={{ fontSize:11, color:C.muted, marginBottom:14, lineHeight:1.6 }}>
        문제집 / 강의 누적 회독
      </div>
      <button onClick={() => setShowAdd(true)} style={{ width:'100%', background:C.ink, color:'#fff', border:'none', padding:'10px', cursor:'pointer', marginBottom:14, fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
        <Plus size={14} /> 문제집 추가
      </button>

      {showAdd && <AddBookForm onAdd={addBook} onCancel={() => setShowAdd(false)} />}

      {books.length === 0 ? (
        <div style={{ textAlign:'center', padding:30, color:C.muted, fontSize:12, background:C.paper, border:`1px dashed ${C.line}` }}>
          문제집을 추가해 보세요
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
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
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:14 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="제목"
        style={{ width:'100%', background:C.bg, border:`1px solid ${C.line}`, padding:'8px 10px', fontSize:12, marginBottom:8, outline:'none' }} />
      <div style={{ display:'flex', gap:6, marginBottom:8 }}>
        {Object.keys(SUBJECTS).map(s => (
          <button key={s} onClick={() => setSubject(s)}
            style={{
              flex:1, background: subject === s ? SUBJECTS[s].color : C.bg,
              color: subject === s ? '#fff' : C.muted,
              border: `1px solid ${subject === s ? SUBJECTS[s].color : C.lineSoft}`,
              padding:'6px 4px', fontSize:10, cursor:'pointer',
            }}>{SUBJECTS[s].short}</button>
        ))}
      </div>
      <div style={{ display:'flex', gap:6, marginBottom:10, alignItems:'center' }}>
        <span style={{ fontSize:11, color:C.muted }}>목표 회독:</span>
        <input type="number" value={target} onChange={e => setTarget(parseInt(e.target.value) || 1)} min={1}
          style={{ width:50, background:C.bg, border:`1px solid ${C.line}`, padding:'5px', fontSize:12, textAlign:'center', outline:'none' }} />
        <span style={{ fontSize:11, color:C.muted }}>회</span>
      </div>
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="메모 (선택)" rows={2}
        style={{ width:'100%', background:C.bg, border:`1px solid ${C.line}`, padding:'8px 10px', fontSize:12, marginBottom:10, outline:'none', resize:'vertical', fontFamily:"'Noto Serif KR', serif" }} />
      <div style={{ display:'flex', gap:6 }}>
        <button onClick={onCancel} style={{ flex:1, background:C.bg, border:`1px solid ${C.line}`, padding:'8px', cursor:'pointer', fontSize:12 }}>취소</button>
        <button onClick={() => title && onAdd({ title, subject, target, note })}
          style={{ flex:1, background:C.ink, color:'#fff', border:'none', padding:'8px', cursor:'pointer', fontSize:12 }}>추가</button>
      </div>
    </div>
  );
}

function BookCard({ book, onUp, onDown, onDelete }) {
  const subColor = SUBJECTS[book.subject].color;
  const pct = Math.min(100, (book.current / book.target) * 100);
  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'12px 14px', display:'flex', gap:10 }}>
      <div style={{ width:3, alignSelf:'stretch', background:subColor }} />
      <div style={{ flex:1 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
          <div style={{ fontSize:13, fontWeight:600 }}>{book.title}</div>
          <div className="mono" style={{ fontSize:11, color:C.ink }}>
            <span style={{ color: book.current >= book.target ? C.good : C.ink, fontWeight:600 }}>{book.current}</span>
            <span style={{ color:C.muted }}> / {book.target}</span>
          </div>
        </div>
        <div style={{ fontSize:10, color:subColor, fontWeight:600, marginTop:2 }}>{book.subject}</div>
        <div style={{ height:3, background:C.lineSoft, marginTop:8, position:'relative' }}>
          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${pct}%`, background: book.current >= book.target ? C.good : subColor }} />
        </div>
        {book.note && <div style={{ fontSize:10, color:C.muted, marginTop:6, fontStyle:'italic' }}>{book.note}</div>}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <button onClick={onUp} style={{ background:C.ink, color:'#fff', border:'none', padding:'4px 6px', cursor:'pointer' }}>
          <Plus size={11} />
        </button>
        <button onClick={onDown} style={{ background:C.bg, color:C.muted, border:`1px solid ${C.line}`, padding:'4px 6px', cursor:'pointer' }}>
          <Minus size={11} />
        </button>
        <button onClick={onDelete} style={{ background:'none', border:'none', cursor:'pointer', padding:'2px 0' }}>
          <X size={12} color={C.muted} />
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
    if (!confirm('이 자료를 삭제할까요?')) return;
    setMaterials(materials.filter(m => m.id !== id));
  }

  const filtered = filter === '전체' ? materials : materials.filter(m => m.subject === filter);

  return (
    <>
      <div style={{ fontSize:11, color:C.muted, marginBottom:14, lineHeight:1.6 }}>
        명명된 자료(청취 / 청원 / 캡슐 / 로만 / 암기장 / 찌라시 / 핸드북 / 최판 등) 누적 회독
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
        {['전체', ...Object.keys(SUBJECTS)].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{
              background: filter === s ? C.ink : C.paper,
              color: filter === s ? '#fff' : C.muted,
              border: `1px solid ${filter === s ? C.ink : C.line}`,
              padding:'4px 10px', fontSize:11, cursor:'pointer',
            }}>{s}</button>
        ))}
      </div>

      <button onClick={() => setShowAdd(true)} style={{ width:'100%', background:C.ink, color:'#fff', border:'none', padding:'10px', cursor:'pointer', marginBottom:14, fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
        <Plus size={14} /> 자료 추가
      </button>

      {showAdd && (
        <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:14 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="자료 이름"
            style={{ width:'100%', background:C.bg, border:`1px solid ${C.line}`, padding:'8px 10px', fontSize:12, marginBottom:8, outline:'none' }} />
          <div style={{ display:'flex', gap:6, marginBottom:8 }}>
            {Object.keys(SUBJECTS).map(s => (
              <button key={s} onClick={() => setNewSubject(s)}
                style={{
                  flex:1, background: newSubject === s ? SUBJECTS[s].color : C.bg,
                  color: newSubject === s ? '#fff' : C.muted,
                  border: `1px solid ${newSubject === s ? SUBJECTS[s].color : C.lineSoft}`,
                  padding:'6px 4px', fontSize:10, cursor:'pointer',
                }}>{SUBJECTS[s].short}</button>
            ))}
          </div>
          <div style={{ display:'flex', gap:6, marginBottom:10, alignItems:'center' }}>
            <span style={{ fontSize:11, color:C.muted }}>목표:</span>
            <input type="number" value={newTarget} onChange={e => setNewTarget(parseInt(e.target.value) || 1)} min={1}
              style={{ width:50, background:C.bg, border:`1px solid ${C.line}`, padding:'5px', fontSize:12, textAlign:'center', outline:'none' }} />
            <span style={{ fontSize:11, color:C.muted }}>회</span>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={() => setShowAdd(false)} style={{ flex:1, background:C.bg, border:`1px solid ${C.line}`, padding:'8px', cursor:'pointer', fontSize:12 }}>취소</button>
            <button onClick={addMaterial} style={{ flex:1, background:C.ink, color:'#fff', border:'none', padding:'8px', cursor:'pointer', fontSize:12 }}>추가</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:24, color:C.muted, fontSize:12, background:C.paper, border:`1px dashed ${C.line}` }}>
          자료가 없습니다
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {filtered.map(m => {
            const pct = Math.min(100, (m.rounds / m.target) * 100);
            const done = m.rounds >= m.target;
            return (
              <div key={m.id} style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'10px 12px', display:'flex', gap:10, alignItems:'center' }}>
                <div style={{ width:3, alignSelf:'stretch', background:m.color }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:6 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:C.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</div>
                    <div className="mono" style={{ fontSize:11, flexShrink:0 }}>
                      <span style={{ color: done ? C.good : C.ink, fontWeight:600 }}>{m.rounds}</span>
                      <span style={{ color:C.muted }}>/{m.target}</span>
                    </div>
                  </div>
                  <div style={{ height:2, background:C.lineSoft, marginTop:5, position:'relative' }}>
                    <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${pct}%`, background: done ? C.good : m.color }} />
                  </div>
                </div>
                <div style={{ display:'flex', gap:3 }}>
                  <button onClick={() => dec(m.id)} style={{ background:C.bg, color:C.muted, border:`1px solid ${C.line}`, padding:'4px 6px', cursor:'pointer' }}>
                    <Minus size={11} />
                  </button>
                  <button onClick={() => bump(m.id)} style={{ background:C.ink, color:'#fff', border:'none', padding:'4px 6px', cursor:'pointer' }}>
                    <Plus size={11} />
                  </button>
                  <button onClick={() => del(m.id)} style={{ background:'none', border:'none', cursor:'pointer', padding:'4px 0' }}>
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

/* ============================================================ REPORT (리포트) ============================================================ */

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

  // last 14 days (daily totals)
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

  // breakdown by type (since beginning) per subject
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

  // total study time
  const allMin = Object.values(logs).reduce((s, dl) => s + Object.values(dl).reduce((a,b) => a+b, 0), 0);
  const studyDays = Object.keys(logs).length;
  const avgPerDay = studyDays > 0 ? allMin / studyDays : 0;

  // mock score average per subject
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
    <div className="fadeIn" style={{ padding:'18px 0 24px' }}>
      <div style={{ marginBottom:16 }}>
        <h1 className="serif" style={{ margin:0, fontSize:22, fontWeight:600 }}>리포트</h1>
        <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>
          총 학습일 {studyDays}일 · 누적 {fmtHour(allMin)} · 일평균 {fmtHour(avgPerDay)}
        </div>
      </div>

      {/* Weekly progress */}
      <SectionTitle>주간 목표 (이번 주)</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'14px 14px', marginBottom:18 }}>
        {weeklyData.map(w => {
          const pct = w.target > 0 ? Math.min(100, (w.minutes / w.target) * 100) : 0;
          return (
            <div key={w.fullName} style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
                <span className="kserif" style={{ fontSize:12, fontWeight:600, color:w.color }}>{w.fullName}</span>
                <span className="mono" style={{ fontSize:10, color:C.muted }}>
                  {fmtHour(w.minutes)} / {fmtHour(w.target)}
                </span>
              </div>
              <div style={{ height:4, background:C.lineSoft, position:'relative' }}>
                <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${pct}%`, background: pct >= 100 ? C.good : w.color }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Daily 14-day trend */}
      <SectionTitle>최근 14일 학습 시간</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'14px 8px 10px', marginBottom:18 }}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={dailyData} margin={{ top:5, right:5, bottom:0, left:-20 }}>
            <CartesianGrid stroke={C.lineSoft} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize:9, fill:C.muted }} interval={1} />
            <YAxis tick={{ fontSize:9, fill:C.muted }} />
            <Tooltip contentStyle={{ background:C.paper, border:`1px solid ${C.line}`, fontSize:11 }} formatter={v => fmtMin(v)} />
            <Bar dataKey="minutes" fill={C.accent} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Mock score averages */}
      {Object.values(mockAvg).some(v => v) && (
        <>
          <SectionTitle>객관식 평균 (전체 기록 기준)</SectionTitle>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6, marginBottom:18 }}>
            {Object.entries(mockAvg).map(([sub, m]) => (
              <div key={sub} style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'10px 8px', textAlign:'center' }}>
                <div className="kserif" style={{ fontSize:11, fontWeight:600, color:SUBJECTS[sub].color }}>{sub}</div>
                {m ? (
                  <>
                    <div className="serif" style={{ fontSize:20, fontWeight:600, marginTop:3 }}>-{m.avg}</div>
                    <div className="mono" style={{ fontSize:9, color:C.muted, marginTop:1 }}>{m.count}회 평균</div>
                  </>
                ) : (
                  <div style={{ fontSize:10, color:C.muted, marginTop:6 }}>기록 없음</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Type breakdown per subject */}
      <SectionTitle>과목별 유형 분포 (누적)</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'8px 14px', marginBottom:18 }}>
        {Object.keys(SUBJECTS).map(sub => {
          const types = typeBreakdown[sub] || {};
          const total = Object.values(types).reduce((a,b) => a+b, 0);
          if (total === 0) return (
            <div key={sub} style={{ padding:'10px 0', borderBottom:`1px dashed ${C.lineSoft}` }}>
              <span className="kserif" style={{ fontSize:11, fontWeight:600, color:SUBJECTS[sub].color }}>{sub}</span>
              <span style={{ fontSize:10, color:C.muted, marginLeft:8 }}>기록 없음</span>
            </div>
          );
          return (
            <div key={sub} style={{ padding:'10px 0', borderBottom:`1px dashed ${C.lineSoft}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
                <span className="kserif" style={{ fontSize:11, fontWeight:600, color:SUBJECTS[sub].color }}>{sub}</span>
                <span className="mono" style={{ fontSize:10, color:C.muted }}>{fmtHour(total)}</span>
              </div>
              <div style={{ display:'flex', height:6, background:C.lineSoft, overflow:'hidden' }}>
                {SUBJECTS[sub].types.map((t, i) => {
                  const v = types[t.key] || 0;
                  const pct = (v / total) * 100;
                  if (pct === 0) return null;
                  const tColor = SUBJECTS[sub].color;
                  const opacity = 0.4 + (i / SUBJECTS[sub].types.length) * 0.6;
                  return <div key={t.key} style={{ width:`${pct}%`, background: tColor, opacity, transition:'all .3s' }} title={`${t.label} ${fmtMin(v)}`} />;
                })}
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:5, fontSize:9, color:C.muted }}>
                {SUBJECTS[sub].types.map(t => {
                  const v = types[t.key] || 0;
                  if (v === 0) return null;
                  return <span key={t.key}>{t.label} <span className="mono" style={{ color:C.ink }}>{fmtMin(v)}</span></span>;
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Materials progress summary */}
      {materials.length > 0 && (
        <>
          <SectionTitle>자료 회독 현황</SectionTitle>
          <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'8px 14px', marginBottom:18 }}>
            {Object.keys(SUBJECTS).map(sub => {
              const ms = materials.filter(m => m.subject === sub);
              if (ms.length === 0) return null;
              const totalRounds = ms.reduce((s,m) => s + m.rounds, 0);
              const totalTarget = ms.reduce((s,m) => s + m.target, 0);
              const completed = ms.filter(m => m.rounds >= m.target).length;
              return (
                <div key={sub} style={{ padding:'8px 0', borderBottom:`1px dashed ${C.lineSoft}`, display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                  <span className="kserif" style={{ fontSize:12, fontWeight:600, color:SUBJECTS[sub].color }}>{sub}</span>
                  <span className="mono" style={{ fontSize:10, color:C.muted }}>
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

/* ============================================================ SETTINGS ============================================================ */

function SettingsView({ settings, setSettings, schedules = [], setSchedules, user, onLogout, onReset, onExport }) {
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

  function addSchedule() {
    if (!setSchedules) return;
    setSchedules([...(schedules || []), {
      id: uid(), title: '새 일정', color: '#5B4A33',
      start: todayISO(), end: addDays(todayISO(), 7),
    }]);
  }
  function updSchedule(id, field, val) {
    if (!setSchedules) return;
    setSchedules((schedules || []).map(s => s.id === id ? { ...s, [field]: val } : s));
  }
  function delSchedule(id) {
    if (!setSchedules) return;
    setSchedules((schedules || []).filter(s => s.id !== id));
  }
  const palette = ['#5B4A33', '#1E3A5F', '#7A2828', '#2D5A3D', '#8B6914', '#7A1E1E'];

  return (
    <div className="fadeIn" style={{ padding:'18px 0 24px' }}>
      <div style={{ marginBottom:14 }}>
        <h1 className="serif" style={{ margin:0, fontSize:22, fontWeight:600 }}>설정</h1>
      </div>

      <SectionTitle>시험</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:18 }}>
        <label style={{ display:'block', fontSize:11, color:C.muted, marginBottom:4 }}>시험 이름</label>
        <input value={examLabel} onChange={e => setExamLabel(e.target.value)}
          style={{ width:'100%', background:C.bg, border:`1px solid ${C.line}`, padding:'8px 10px', fontSize:12, marginBottom:10, outline:'none' }} />
        <label style={{ display:'block', fontSize:11, color:C.muted, marginBottom:4 }}>시험 날짜</label>
        <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)}
          style={{ width:'100%', background:C.bg, border:`1px solid ${C.line}`, padding:'8px 10px', fontSize:12, outline:'none' }} />
      </div>

      <SectionTitle>모의고사 일정</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:18 }}>
        {mockExams.map(m => (
          <div key={m.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:`1px dashed ${C.lineSoft}` }}>
            <div style={{ display:'flex', gap:6, marginBottom:5 }}>
              <input value={m.label} onChange={e => updMock(m.id, 'label', e.target.value)}
                style={{ flex:1, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:'6px 8px', fontSize:11, outline:'none' }} />
              <button onClick={() => delMock(m.id)} style={{ background:'none', border:`1px solid ${C.lineSoft}`, padding:'6px 8px', cursor:'pointer', color:C.muted }}>
                <Trash2 size={12} />
              </button>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <input type="date" value={m.start} onChange={e => updMock(m.id, 'start', e.target.value)}
                style={{ flex:1, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:'5px 8px', fontSize:11, outline:'none' }} />
              <span style={{ alignSelf:'center', color:C.muted, fontSize:11 }}>~</span>
              <input type="date" value={m.end} onChange={e => updMock(m.id, 'end', e.target.value)}
                style={{ flex:1, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:'5px 8px', fontSize:11, outline:'none' }} />
            </div>
          </div>
        ))}
        <button onClick={addMock} style={{ width:'100%', background:C.bg, border:`1px dashed ${C.line}`, padding:'8px', cursor:'pointer', fontSize:11, color:C.muted }}>
          + 모의고사 추가
        </button>
      </div>

      <SectionTitle>장기 일정 (캘린더 막대)</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:18 }}>
        <div style={{ fontSize:11, color:C.muted, marginBottom:10, lineHeight:1.5 }}>
          인강 수강, 특정 자료 회독 같은 며칠~몇 주짜리 일정을 캘린더에 막대로 표시합니다.
        </div>
        {(schedules || []).map(s => (
          <div key={s.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:`1px dashed ${C.lineSoft}` }}>
            <div style={{ display:'flex', gap:6, marginBottom:6 }}>
              <input value={s.title} onChange={e => updSchedule(s.id, 'title', e.target.value)}
                style={{ flex:1, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:'6px 8px', fontSize:11, outline:'none' }} />
              <button onClick={() => delSchedule(s.id)} style={{ background:'none', border:`1px solid ${C.lineSoft}`, padding:'6px 8px', cursor:'pointer', color:C.muted }}>
                <Trash2 size={12} />
              </button>
            </div>
            <div style={{ display:'flex', gap:6, marginBottom:6 }}>
              <input type="date" value={s.start} onChange={e => updSchedule(s.id, 'start', e.target.value)}
                style={{ flex:1, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:'5px 8px', fontSize:11, outline:'none' }} />
              <span style={{ alignSelf:'center', color:C.muted, fontSize:11 }}>~</span>
              <input type="date" value={s.end} onChange={e => updSchedule(s.id, 'end', e.target.value)}
                style={{ flex:1, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:'5px 8px', fontSize:11, outline:'none' }} />
            </div>
            <div style={{ display:'flex', gap:5, alignItems:'center' }}>
              <span style={{ fontSize:10, color:C.muted, marginRight:4 }}>색</span>
              {palette.map(c => (
                <button key={c} onClick={() => updSchedule(s.id, 'color', c)}
                  style={{
                    width:18, height:18, background:c, cursor:'pointer',
                    border: s.color === c ? `2px solid ${C.ink}` : '1px solid transparent',
                    padding:0,
                  }} />
              ))}
            </div>
          </div>
        ))}
        <button onClick={addSchedule} style={{ width:'100%', background:C.bg, border:`1px dashed ${C.line}`, padding:'8px', cursor:'pointer', fontSize:11, color:C.muted }}>
          + 일정 추가
        </button>
      </div>

      <SectionTitle>사이클 (블록 일수)</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:18 }}>
        <div style={{ fontSize:11, color:C.muted, marginBottom:10, lineHeight:1.5 }}>
          순서: 민사법(+국제거래법) → 형사법 → 공법<br/>
          각 모의고사 / 본시험 직전부터 거꾸로 깔립니다.
        </div>
        {cycleDefs.map(c => (
          <div key={c.id} style={{ marginBottom:12 }}>
            <div className="kserif" style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>{c.label}</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6 }}>
              {c.blocks.map((b, i) => (
                <div key={i} style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:'6px 8px' }}>
                  <div style={{ fontSize:10, color:SUBJECTS[b.subject].color, fontWeight:600, marginBottom:3 }}>{b.subject}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <input type="number" value={b.days} onChange={e => updCycleBlock(c.id, i, e.target.value)} min={1}
                      style={{ width:'100%', background:'transparent', border:'none', fontSize:14, fontWeight:600, color:C.ink, outline:'none', fontFamily:"'JetBrains Mono', monospace" }} />
                    <span style={{ fontSize:10, color:C.muted }}>일</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>주간 학습 시간 목표 (분)</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:18 }}>
        {Object.keys(SUBJECTS).map(sub => (
          <div key={sub} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <span className="kserif" style={{ fontSize:12, fontWeight:600, color:SUBJECTS[sub].color }}>{sub}</span>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input type="number" value={targets[sub] || 0} onChange={e => setTargets({ ...targets, [sub]: parseInt(e.target.value) || 0 })}
                style={{ width:80, background:C.bg, border:`1px solid ${C.line}`, padding:'5px 8px', fontSize:12, textAlign:'right', outline:'none', fontFamily:"'JetBrains Mono', monospace" }} />
              <span style={{ fontSize:11, color:C.muted, minWidth:36 }}>{fmtHour(targets[sub] || 0)}</span>
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>자동화</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'4px 0', marginBottom:18 }}>
        <label style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer', borderBottom:`1px dashed ${C.lineSoft}` }}>
          <input type="checkbox" checked={d30Mode} onChange={e => setD30Mode(e.target.checked)} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontWeight:600 }}>D-30/D-7 모드 배너</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>시험 30/7일 전 압축/벼락치기 모드 알림</div>
          </div>
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer' }}>
          <input type="checkbox" checked={autoGen} onChange={e => setAutoGen(e.target.checked)} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontWeight:600 }}>모의고사 리뷰 자동 생성</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>모의고사 종료 후 1~7일 동안 리뷰 할 일 자동 추가</div>
          </div>
        </label>
      </div>

      <button onClick={save} style={{ width:'100%', background:C.ink, color:'#fff', border:'none', padding:'12px', cursor:'pointer', fontSize:13, marginBottom:14, fontWeight:600 }}>
        저장하기
      </button>

      <SectionTitle>데이터</SectionTitle>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:18 }}>
        <button onClick={onExport} style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'10px', cursor:'pointer', fontSize:11, display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
          <Download size={13} /> 내보내기
        </button>
        <button onClick={onReset} style={{ background:C.paper, border:`1px solid ${C.accent}`, color:C.accent, padding:'10px', cursor:'pointer', fontSize:11, display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
          <RefreshCw size={13} /> 전체 초기화
        </button>
      </div>

      {user && (
        <>
          <SectionTitle>계정</SectionTitle>
          <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:'12px 14px', marginBottom:18 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ fontSize:12, fontWeight:600, color:C.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.displayName || '(이름 없음)'}</div>
                <div className="mono" style={{ fontSize:10, color:C.muted, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.email}</div>
              </div>
              <button onClick={onLogout} style={{ background:C.bg, border:`1px solid ${C.line}`, color:C.muted, padding:'7px 12px', cursor:'pointer', fontSize:11, display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
                <LogOut size={12} /> 로그아웃
              </button>
            </div>
          </div>
        </>
      )}

      <div style={{ textAlign:'center', fontSize:10, color:C.muted, marginTop:30, fontStyle:'italic' }}>
        Bar Exam Journal · 16회 변시
      </div>
    </div>
  );
}
