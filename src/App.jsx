import React, { useState, useEffect, useMemo } from 'react';
import { auth, db, provider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { Plus, X, Check, Trash2, BookOpen, RotateCw, BarChart3, Settings as SettingsIcon, ChevronLeft, ChevronRight, Home, TrendingUp, Clock, Layers, CheckSquare, Square, Calendar as CalendarIcon, Library } from 'lucide-react';

/* --- 테마 및 상수 설정 (표준 따옴표 적용) --- */
const C = {
  bg: '#F4EEE1', paper: '#FBF7EC', ink: '#1A1915', muted: '#6B6558',
  line: '#CFC7B4', lineSoft: '#E5DFCE', accent: '#7A1E1E', good: '#3C5A3A'
};

const SUBJECTS = {
  '공법': { color: '#1E3A5F', short: '공', types: [{ key: '선택형', label: '선택형' }, { key: '사례형_1문', label: '사례형 1문' }, { key: '사례형_2문', label: '사례형 2문' }, { key: '기록형', label: '기록형' }] },
  '형사법': { color: '#7A2828', short: '형', types: [{ key: '선택형', label: '선택형' }, { key: '사례형_1문', label: '사례형 1문' }, { key: '사례형_2문', label: '사례형 2문' }, { key: '기록형', label: '기록형' }] },
  '민사법': { color: '#2D5A3D', short: '민', types: [{ key: '선택형', label: '선택형' }, { key: '사례형_1문', label: '사례형 1문' }, { key: '사례형_2문', label: '사례형 2문' }, { key: '사례형_3문', label: '사례형 3문' }, { key: '기록형', label: '기록형' }] },
  '국제거래법': { color: '#8B6914', short: '국', types: [{ key: '1문', label: '1문' }, { key: '2문', label: '2문' }] }
};

const TRACK_TYPES = [
  { key: 'audio', label: '청취/청원', short: '청', color: '#5B4A33', placeholder: '예: 청취, 청원, 요사' },
  { key: 'case', label: '사례', short: '사', color: '#7A2828', placeholder: '예: 민 사례, 공 사례 핸드북' },
  { key: 'mcq', label: '객관식 회차', short: '객', color: '#1E3A5F', placeholder: '예: 14회 공객, 13회 민객' },
  { key: 'memo', label: '암기장/핸드북', short: '암', color: '#2D5A3D', placeholder: '예: 민 암기장 100p' },
  { key: 'aux', label: '최판/보조자료', short: '보', color: '#8B6914', placeholder: '예: 캡슐, 로만, 찌라시' }
];

const DEFAULT_SETTINGS = {
  examDate: '2027-01-07',
  examLabel: '제16회 변호사시험',
  weeklyTargets: { '공법': 600, '형사법': 600, '민사법': 900, '국제거래법': 300 },
  mockExams: []
};

/* --- 유틸리티 함수 --- */
const uid = () => Math.random().toString(36).substring(2, 11);
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('home');
  const [loaded, setLoaded] = useState(false);
  
  // 데이터 상태
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [logs, setLogs] = useState({});
  const [examScores, setExamScores] = useState([]);
  const [todos, setTodos] = useState({});
  const [tracks, setTracks] = useState({});
  const [schedules, setSchedules] = useState([]); // 신규: 장기 일정
  const [moods, setMoods] = useState({});

  // 1. 구글 로그인 감지 및 데이터 로드
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const docRef = doc(db, 'users', currentUser.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings(data.settings || DEFAULT_SETTINGS);
          setLogs(data.logs || {});
          setExamScores(data.examScores || []);
          setSchedules(data.schedules || []);
          setTodos(data.todos || {});
          setTracks(data.tracks || {});
          setMoods(data.moods || {});
        } else {
          // 신규 유저 초기값 세팅
          setSettings({ ...DEFAULT_SETTINGS, examLabel: `${currentUser.displayName}의 변시기록` });
        }
        setLoaded(true);
      } else {
        setUser(null);
        setLoaded(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. 데이터 자동 저장 (Firebase Firestore)
  useEffect(() => {
    if (loaded && user) {
      const docRef = doc(db, 'users', user.uid);
      setDoc(docRef, { settings, logs, examScores, schedules, todos, tracks, moods }, { merge: true });
    }
  }, [settings, logs, examScores, schedules, todos, tracks, moods, loaded, user]);

  const login = () => signInWithPopup(auth, provider);
  const logout = () => signOut(auth).then(() => window.location.reload());

  if (!user) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: C.bg, textAlign: 'center', padding: 20 }}>
        <h1 style={{ fontFamily: 'serif', fontSize: 32, marginBottom: 10 }}>Bar Exam Journal</h1>
        <p style={{ color: C.muted, marginBottom: 40 }}>임현준 님과 동료 수험생들을 위한 전용 학습 기록장</p>
        <button onClick={login} style={{ padding: '16px 32px', background: C.ink, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
          Google 계정으로 시작하기
        </button>
      </div>
    );
  }

  const sharedProps = { settings, setSettings, logs, setLogs, examScores, setExamScores, schedules, setSchedules, todos, setTodos, tracks, setTracks, moods, setMoods, today: todayISO() };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, paddingBottom: 84 }}>
      <TopBar settings={settings} logout={logout} />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '20px 18px' }}>
        {view === 'home' && <HomeView {...sharedProps} onGoTo={setView} />}
        {view === 'log' && <LogView {...sharedProps} />}
        {view === 'calendar' && <CalendarView {...sharedProps} />}
      </main>
      <BottomNav view={view} setView={setView} />
    </div>
  );
}

/* --- 주요 컴포넌트 (모바일 최적화 폼 반영) --- */

function TopBar({ settings, logout }) {
  return (
    <header style={{ background: C.paper, borderBottom: `1px solid ${C.line}`, padding: '18px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em' }}>JOURNAL</div>
          <div style={{ fontWeight: 700 }}>{settings.examLabel}</div>
        </div>
        <button onClick={logout} style={{ fontSize: 11, background: 'none', border: `1px solid ${C.line}`, padding: '4px 8px', cursor: 'pointer' }}>로그아웃</button>
      </div>
    </header>
  );
}

function LogView({ today, logs, setLogs, examScores, setExamScores }) {
  const [date, setDate] = useState(today);
  const [round, setRound] = useState('');
  const [subject, setSubject] = useState('공법');
  const [wrong, setWrong] = useState('');

  const addScore = () => {
    if (!round || !wrong) return;
    setExamScores([...examScores, { id: uid(), date, round, subject, wrong: parseInt(wrong) }]);
    setRound(''); setWrong('');
  };

  return (
    <div className="fadeIn">
      <h2 style={{ fontSize: 18, marginBottom: 15 }}>학습 기록</h2>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: 12, marginBottom: 20, border: `1px solid ${C.line}` }} />
      
      {/* 모바일 최적화된 기출 입력 폼 */}
      <div style={{ background: C.paper, padding: 16, border: `1px solid ${C.line}`, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>객관식 회차 입력</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={subject} onChange={e => setSubject(e.target.value)} style={{ flex: 1.2, padding: 10, border: `1px solid ${C.lineSoft}` }}>
              {Object.keys(SUBJECTS).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input value={round} onChange={e => setRound(e.target.value)} placeholder="회차" type="number" style={{ flex: 1, padding: 10, border: `1px solid ${C.lineSoft}` }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={wrong} onChange={e => setWrong(e.target.value)} placeholder="틀린 개수" type="number" style={{ flex: 1, padding: 10, border: `1px solid ${C.lineSoft}` }} />
            <button onClick={addScore} style={{ padding: '0 20px', background: C.ink, color: '#fff', border: 'none' }}>+</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarView({ schedules, setSchedules, today }) {
  // 캘린더 날짜 렌더링 시 schedules를 체크하여 선으로 연결하는 로직
  // (생략된 세부 렌더링 코드는 앞선 답변의 CalendarView 로직을 그대로 사용하시면 됩니다)
  return <div>캘린더 및 연속 일정 로직 포함 구역</div>;
}

function BottomNav({ view, setView }) {
  const navs = [{ key: 'home', icon: Home, label: '홈' }, { key: 'log', icon: BookOpen, label: '기록' }, { key: 'calendar', icon: CalendarIcon, label: '캘린더' }];
  return (
    <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.paper, borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-around', padding: '10px 0' }}>
      {navs.map(n => (
        <button key={n.key} onClick={() => setView(n.key)} style={{ background: 'none', border: 'none', color: view === n.key ? C.accent : C.muted }}>
          <n.icon size={20} />
          <div style={{ fontSize: 10 }}>{n.label}</div>
        </button>
      ))}
    </nav>
  );
}

function HomeView() { return <div>홈 대시보드 구역</div>; }
