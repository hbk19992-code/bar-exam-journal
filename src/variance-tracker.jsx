import { useState, useEffect, useMemo, useRef } from "react";
import {
  signInWithPopup, signOut, onAuthStateChanged,
} from "firebase/auth";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import {
  auth as fbAuth,
  db as fbDB,
  provider as googleProvider,
  firebaseReady,
  firebaseEnvReady,
  missingFirebaseEnvKeys,
  firebaseInitError,
} from "./firebase.js";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import {
  Plus, X, Check, Trash2, BookOpen, RotateCw, BarChart3,
  Settings as SettingsIcon, ChevronLeft, ChevronRight, ChevronDown,
  Home, Target, Clock, Download, RefreshCw, Minus, BookMarked,
  Calendar as CalendarIcon, Square, CheckSquare, Repeat,
  Layers, FileText, TrendingUp, Smile, Library, LogOut, Cloud, CloudOff, Sheet,
  Copy, MessageCircle, MoreHorizontal,
} from "lucide-react";

/* ============================================================ THEME & DATA ============================================================ */

const FONT_IMPORT = `@import url(https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Noto+Serif+KR:wght@400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap);`;

const C = {
  bg: `#F4EEE1`, paper: `#FBF7EC`, ink: `#1A1915`, muted: `#6B6558`,
  line: `#CFC7B4`, lineSoft: `#E5DFCE`,
  accent: `#7A1E1E`, accentSoft: `#A84040`,
  good: `#3C5A3A`, warn: `#B86A1E`, book: `#5B4A33`,
  trackTint: `#F0E8D2`,
};

const APP_SCHEMA_VERSION = 1;
const FIREBASE_ENV_LABELS = {
  apiKey: `VITE_FIREBASE_API_KEY`,
  authDomain: `VITE_FIREBASE_AUTH_DOMAIN`,
  projectId: `VITE_FIREBASE_PROJECT_ID`,
  storageBucket: `VITE_FIREBASE_STORAGE_BUCKET`,
  messagingSenderId: `VITE_FIREBASE_MESSAGING_SENDER_ID`,
  appId: `VITE_FIREBASE_APP_ID`,
};

const SUBJECTS = {
  공법: { color: `#1E3A5F`, short: `공`, types: [
    { key: `선택형`, label: `선택형` },
    { key: `사례형_1문`, label: `사례형 1문` },
    { key: `사례형_2문`, label: `사례형 2문` },
    { key: `기록형`, label: `기록형` },
  ]},
  형사법: { color: `#7A2828`, short: `형`, types: [
    { key: `선택형`, label: `선택형` },
    { key: `사례형_1문`, label: `사례형 1문` },
    { key: `사례형_2문`, label: `사례형 2문` },
    { key: `기록형`, label: `기록형` },
  ]},
  민사법: { color: `#2D5A3D`, short: `민`, types: [
    { key: `선택형`, label: `선택형` },
    { key: `사례형_1문`, label: `사례형 1문` },
    { key: `사례형_2문`, label: `사례형 2문` },
    { key: `사례형_3문`, label: `사례형 3문` },
    { key: `기록형`, label: `기록형` },
  ]},
  선택법: { color: `#8B6914`, short: `선`, types: [
    { key: `sel1`, label: `1문` },
    { key: `sel2`, label: `2문` },
  ]},
};

const COURSE_WATCH_TYPE = `강의수강`;
const COURSE_REVIEW_TYPE = `강의복습`;
const COURSE_LOG_TYPES = [
  { key: COURSE_WATCH_TYPE, label: `강의수강` },
  { key: COURSE_REVIEW_TYPE, label: `강의복습` },
];
const COURSE_COMPLETE_THRESHOLDS = [95, 98, 100];
const DEFAULT_COURSE_COMPLETE_THRESHOLD = 100;
const COURSE_TAGS = [
  { key: `hard`, label: `어려움` },
  { key: `case`, label: `판례` },
  { key: `memory`, label: `암기` },
  { key: `again`, label: `재복습` },
];

const PARKING_BUCKETS = [
  { key: `drop`, label: `안 할 것`, color: C.accent },
  { key: `later`, label: `후순위`, color: C.warn },
  { key: `after`, label: `시험 후`, color: C.muted },
];

const CONDITION_KEYWORDS = {
  good: [`좋`, `괜찮`, `상쾌`, `개운`, `맑`, `집중`, `회복`, `잘함`, `잘 됨`, `안정`],
  bad: [`피곤`, `불안`, `아프`, `졸`, `힘들`, `무기력`, `나쁨`, `우울`, `망`, `저조`, `두통`],
};

function getStudyTypes(subject) {
  const seen = new Set();
  return [...(SUBJECTS[subject]?.types || []), ...COURSE_LOG_TYPES].filter(t => {
    if (seen.has(t.key)) return false;
    seen.add(t.key);
    return true;
  });
}

function getStudyTypeLabel(subject, type) {
  return getStudyTypes(subject).find(t => t.key === type)?.label || type;
}

function normalizeCourseThreshold(value) {
  const n = parseInt(value, 10);
  return COURSE_COMPLETE_THRESHOLDS.includes(n) ? n : DEFAULT_COURSE_COMPLETE_THRESHOLD;
}

function applyCourseCompletionThreshold(lectures, threshold = DEFAULT_COURSE_COMPLETE_THRESHOLD) {
  const completeAt = normalizeCourseThreshold(threshold);
  return lectures.map(l => ({
    ...l,
    completed: !!l.completed || (Number(l.progress) || 0) >= completeAt,
  }));
}

// Track types (5 daily slots)
const TRACK_TYPES = [
  { key: `audio`,    label: `청취/청원`,  short: `청`, color: `#5B4A33`, placeholder: `예: 청취, 청원, 요사` },
  { key: `case`,     label: `사례`,      short: `사`, color: `#7A2828`, placeholder: `예: 민 사례, 공 사례 핸드북` },
  { key: `mcq`,      label: `객관식 회차`, short: `객`, color: `#1E3A5F`, placeholder: `예: 14회 공객, 13회 민객` },
  { key: `memo`,     label: `암기장/핸드북`, short: `암`, color: `#2D5A3D`, placeholder: `예: 민 암기장 100p` },
  { key: `aux`,      label: `최판/보조자료`, short: `보`, color: `#8B6914`, placeholder: `예: 캡슐, 로만, 찌라시` },
];

/* 일정(장기 계획) 전용 팔레트 — 과목 색(남색/빨강/녹색/금색)과 겹치지 않는 보조 톤 */
const SCHEDULE_PALETTE = [
  `#E08A6E`, //
  `#4A9DA0`, //
  `#9985B5`, //
  `#C9A24A`, //
  `#7E9B6C`, //
  `#6E8AAB`, //
];

const CYCLE_DEFS = [
  { id: 1, label: `사이클 1`, blocks: [
    { subject: `민사법`, days: 8 },
    { subject: `형사법`, days: 6 },
    { subject: `공법`, days: 5 },
  ]},
  { id: 2, label: `사이클 2`, blocks: [
    { subject: `민사법`, days: 5 },
    { subject: `형사법`, days: 3 },
    { subject: `공법`, days: 2 },
  ]},
];

// Default named materials (from real data analysis)
const DEFAULT_MATERIALS = [
  { id: `mat-1`, name: `청취`, subject: `민사법`, color: `#2D5A3D`, rounds: 0, target: 5 },
  { id: `mat-2`, name: `요사`, subject: `민사법`, color: `#2D5A3D`, rounds: 0, target: 5 },
  { id: `mat-3`, name: `청원`, subject: `공법`, color: `#1E3A5F`, rounds: 0, target: 3 },
  { id: `mat-4`, name: `캡슐(형법)`, subject: `형사법`, color: `#7A2828`, rounds: 0, target: 3 },
  { id: `mat-5`, name: `로만(형소)`, subject: `형사법`, color: `#7A2828`, rounds: 0, target: 3 },
  { id: `mat-6`, name: `민 암기장`, subject: `민사법`, color: `#2D5A3D`, rounds: 0, target: 5 },
  { id: `mat-7`, name: `민소 암기장`, subject: `민사법`, color: `#2D5A3D`, rounds: 0, target: 4 },
  { id: `mat-8`, name: `형소 암기장`, subject: `형사법`, color: `#7A2828`, rounds: 0, target: 4 },
  { id: `mat-9`, name: `상 암기장`, subject: `민사법`, color: `#2D5A3D`, rounds: 0, target: 3 },
  { id: `mat-10`, name: `공기록 찌라시`, subject: `공법`, color: `#1E3A5F`, rounds: 0, target: 3 },
  { id: `mat-11`, name: `민기록 찌라시`, subject: `민사법`, color: `#2D5A3D`, rounds: 0, target: 3 },
  { id: `mat-12`, name: `형기록 찌라시`, subject: `형사법`, color: `#7A2828`, rounds: 0, target: 3 },
  { id: `mat-13`, name: `헌 핸드북`, subject: `공법`, color: `#1E3A5F`, rounds: 0, target: 3 },
  { id: `mat-14`, name: `행 핸드북`, subject: `공법`, color: `#1E3A5F`, rounds: 0, target: 3 },
  { id: `mat-15`, name: `민 최판`, subject: `민사법`, color: `#2D5A3D`, rounds: 0, target: 2 },
  { id: `mat-16`, name: `형 최판`, subject: `형사법`, color: `#7A2828`, rounds: 0, target: 2 },
  { id: `mat-17`, name: `헌 최판`, subject: `공법`, color: `#1E3A5F`, rounds: 0, target: 2 },
  { id: `mat-18`, name: `행 최판`, subject: `공법`, color: `#1E3A5F`, rounds: 0, target: 2 },
];

// Mock review templates: when a mock ends, these todos are auto-generated for the next 7 days
const MOCK_REVIEW_TEMPLATES = [
  { offset: 1, title: `휴식` },
  { offset: 2, title: `휴식` },
  { offset: 3, title: `공사례 리뷰 — 목차 / 쟁점 / 분량` },
  { offset: 3, title: `공기록 리뷰` },
  { offset: 4, title: `형사례 리뷰 — 최판 보완` },
  { offset: 4, title: `형기록 리뷰` },
  { offset: 5, title: `민기록 리뷰 — 청구원인 / 작성요령` },
  { offset: 5, title: `민사례 리뷰` },
  { offset: 6, title: `공객 오답 정리` },
  { offset: 6, title: `형객 오답 정리` },
  { offset: 7, title: `민객 오답 정리` },
  { offset: 7, title: `경제법 리뷰` },
];

/* 체크리스트 — 시험 직전·답안 작성 직후 점검용 항목 모음 (Seokw 합격수기 기반 시드) */
const DEFAULT_CHECKLISTS = [
  // ============ Public ============
  {
    id: `cl-pub-mcq`, name: `공법 선택형`, subject: `공법`, color: `#1E3A5F`,
    items: [
      { id: `cl-pm-1`, text: `최판 비중 절대적 — 최근 3개년 최판 키워드 일독`, stars: 3 },
      { id: `cl-pm-2`, text: `헌객 OX 발췌 회독 (기본권 / 통치구조 우선)`, stars: 3 },
      { id: `cl-pm-3`, text: `행객 — 변시 기출 + 최판 우선, 모의 후순위`, stars: 2 },
      { id: `cl-pm-4`, text: `위헌 판례 키워드 별도 정리 → 시험 전날 일독`, stars: 3 },
      { id: `cl-pm-5`, text: `행정법 빈출 쟁점 (부관 / 사전통지 / 문서주의 / 경원자) 정리`, stars: 2 },
      { id: `cl-pm-6`, text: `헌법총론 / 통치구조 — 학설 견해 정리 (반복 출제)`, stars: 2 },
    ],
  },
  {
    id: `cl-pub-case`, name: `공법 사례형`, subject: `공법`, color: `#1E3A5F`,
    items: [
      { id: `cl-pc-1`, text: `최판 + 사례집(핸드북) 중심으로 대비`, stars: 3 },
      { id: `cl-pc-2`, text: `반복 출제 쟁점 (권한쟁의 / 위원회 / 특별부담금) 답안 구조 숙지`, stars: 3 },
      { id: `cl-pc-3`, text: `행정법 빈출 쟁점 답안 틀 — 부관 / 거부처분 / 절차 / 경원자`, stars: 3 },
      { id: `cl-pc-4`, text: `암기장 — 정선균 행정법(★★★)으로 방어 가능`, stars: 2 },
      { id: `cl-pc-5`, text: `목차 / 쟁점 / 분량 — 모의 후 점검`, stars: 2 },
      { id: `cl-pc-6`, text: `헌법은 최판 중심 + 최근 기출·모의 사례 중심`, stars: 2 },
    ],
  },
  {
    id: `cl-pub-rec`, name: `공법 기록형`, subject: `공법`, color: `#1E3A5F`,
    items: [
      { id: `cl-pr-1`, text: `취소소송 외 다른 유형 (무효확인·국가배상·가처분) 검토`, stars: 3 },
      { id: `cl-pr-2`, text: `취소소송 피고는 행정청, 국가배상은 국가·지자체`, stars: 3 },
      { id: `cl-pr-3`, text: `청구취지 — 처분 특정 (일자·번호 누락 주의)`, stars: 3 },
      { id: `cl-pr-4`, text: `집행정지/가처분 출제 가능성 대비`, stars: 2 },
      { id: `cl-pr-5`, text: `헌법소원·위헌법률심판 청구서 기본 형식`, stars: 2 },
      { id: `cl-pr-6`, text: `법리 이해 + 숨어있는 쟁점 발굴 (변시는 모의와 결이 다름)`, stars: 3 },
      { id: `cl-pr-7`, text: `사례 공부 병행 + 감 유지용 주기적 연습`, stars: 2 },
    ],
  },

  // ============ Criminal ============
  {
    id: `cl-cri-mcq`, name: `형사법 선택형`, subject: `형사법`, color: `#7A2828`,
    items: [
      { id: `cl-cm-1`, text: `유니온 변시 기출 — 형총 / 형소 반복 출제 경향 강함`, stars: 3 },
      { id: `cl-cm-2`, text: `반반 형법 — 객관식 + 사례 동시 대비 (★★★ 책 자체를 OX화)`, stars: 3 },
      { id: `cl-cm-3`, text: `최판 강의 ★★★ 표시 판례 꼼꼼히 (5문제 이상 출제)`, stars: 3 },
      { id: `cl-cm-4`, text: `형총 학설별 견해 점차 중요해지는 추세 — 유니온 해설 학설 부분 정독`, stars: 2 },
      { id: `cl-cm-5`, text: `형소 — 홍형철 / 반반형소 양자택일, 어떤 책이든 OX화`, stars: 2 },
      { id: `cl-cm-6`, text: `시험 당일 아침: 형소 최판 일독`, stars: 3 },
    ],
  },
  {
    id: `cl-cri-case`, name: `형사법 사례형`, subject: `형사법`, color: `#7A2828`,
    items: [
      { id: `cl-cc-1`, text: `검실과 달리 죄 안 되는 부분도 검토 必`, stars: 3 },
      { id: `cl-cc-2`, text: `거의 모든 문항에 형총 쟁점 숨어있음 — 반드시 검토`, stars: 3 },
      { id: `cl-cc-3`, text: `반반 암기장 — 사례 출제 가능 쟁점 거의 수록`, stars: 2 },
      { id: `cl-cc-4`, text: `작변사기 — 반복 출제 쟁점의 답안 구조 확실히 익히기`, stars: 3 },
      { id: `cl-cc-5`, text: `명확한 답이 없을 수 있음 → 누수 없이 방어하는 것이 최우선 (55~60점 확보)`, stars: 3 },
      { id: `cl-cc-6`, text: `형소 사례 — 최판(특히 전문증거) 위주로 대비`, stars: 3 },
      { id: `cl-cc-7`, text: `올해 모의 출제된 증거 파트 최판은 변시 재출제 가능성 높음`, stars: 2 },
    ],
  },
  {
    id: `cl-cri-rec`, name: `형사법 기록형`, subject: `형사법`, color: `#7A2828`,
    items: [
      { id: `cl-cr-1`, text: `면소·공소기각·전단무죄 우선 빠르게 기재`, stars: 3 },
      { id: `cl-cr-2`, text: `공범 아닌 공동피고인 — 피고인 지위 진술은 증거능력 X`, stars: 3 },
      { id: `cl-cr-3`, text: `위수증 나오면 파생증거는 무조건 기재 (인과관계 희석·단절 X)`, stars: 3 },
      { id: `cl-cr-4`, text: `증명력 판단 — 일관성/상식·경험칙/객관적 증거/추측 4개 이상`, stars: 2 },
      { id: `cl-cr-5`, text: `공소제기일 확인 (공소제기 후 고소 → 제327조 2호 공소기각)`, stars: 2 },
      { id: `cl-cr-6`, text: `범행일은 공소시효 쟁점 아니어도 기재`, stars: 1 },
      { id: `cl-cr-7`, text: `피고인 제출 증거는 무조건 유리한 정상에 활용`, stars: 2 },
      { id: `cl-cr-8`, text: `공동정범↔단독정범, 직접↔간접 — 공소장 변경 없이 직권 인정`, stars: 2 },
      { id: `cl-cr-9`, text: `축소사실 — 자백 및 보강증거 기재`, stars: 2 },
      { id: `cl-cr-10`, text: `제314조 필요성 — 상당한 수단을 다해도 출석 불가 기재`, stars: 1 },
      { id: `cl-cr-11`, text: `증거능력 없는 증거 검토하면서 피고인 증거부동의 사실 서술`, stars: 2 },
      { id: `cl-cr-12`, text: `위수증 누락 여부 재확인 (사후영장·관련성·참여권·압수목록)`, stars: 3 },
      { id: `cl-cr-13`, text: `사실인정·증거 부분 중점 오답노트 (감 유지용 격주 연습)`, stars: 2 },
    ],
  },

  // ============ Civil ============
  {
    id: `cl-civ-mcq`, name: `민사법 선택형`, subject: `민사법`, color: `#2D5A3D`,
    items: [
      { id: `cl-vm-1`, text: `암기장만으론 부족 — OX 병행 必 (고득점 시)`, stars: 3 },
      { id: `cl-vm-2`, text: `민법 — 윤동환 암기장 + OX 병행 (선택형 25~30개 가능)`, stars: 3 },
      { id: `cl-vm-3`, text: `민소 — 암기장으로 사례 가능, 객관식 15개+ 위해 OX 필수`, stars: 3 },
      { id: `cl-vm-4`, text: `상법 — 등한시 금지, 저학년 때 충실히 → 고득점 전략 과목`, stars: 2 },
      { id: `cl-vm-5`, text: `최판 최소 3회독, 10일 내 전범위 정리`, stars: 3 },
      { id: `cl-vm-6`, text: `김남훈 강사 최판 — 추록 제공 시기 빠름 (윤동환·공태용 후순위 제공)`, stars: 2 },
      { id: `cl-vm-7`, text: `가족법 — 학교 특강 활용 (출제 교수 ↔ 특강 교수 겹칠 가능성)`, stars: 2 },
      { id: `cl-vm-8`, text: `어수보 — 최소한으로, 다른 영역 우선`, stars: 1 },
    ],
  },
  {
    id: `cl-civ-case`, name: `민사법 사례형`, subject: `민사법`, color: `#2D5A3D`,
    items: [
      { id: `cl-vc-1`, text: `다수당사자·채권양도·채무인수 — 사례집 점검 必`, stars: 3 },
      { id: `cl-vc-2`, text: `물권·채권 사례 — 모의 성적 좋아도 미루지 말 것`, stars: 3 },
      { id: `cl-vc-3`, text: `민총 사례 — 송영곤 사례집 등 1회독 이상`, stars: 2 },
      { id: `cl-vc-4`, text: `민소 — 병합·상소·재심 꼼꼼히 (15회 병합 비중 컸음)`, stars: 3 },
      { id: `cl-vc-5`, text: `상법 — 조문 + 출제 빈도 높은 쟁점 중심 (기본서 달달 X)`, stars: 2 },
      { id: `cl-vc-6`, text: `상법 사례 — 공태용 암기장 + 장원석 작변사기 조합`, stars: 2 },
      { id: `cl-vc-7`, text: `보험·어음 — 최소 방어만, 다른 곳 우선`, stars: 1 },
      { id: `cl-vc-8`, text: `한 번 더 보면 잊지 않음 — 막판까지 휘발 방지`, stars: 3 },
    ],
  },
  {
    id: `cl-civ-rec`, name: `민사법 기록형`, subject: `민사법`, color: `#2D5A3D`,
    items: [
      { id: `cl-vr-1`, text: `청구원인 근거 조문 누락 주의 (제214조 등)`, stars: 3 },
      { id: `cl-vr-2`, text: `등기 경료 사실 누락 주의`, stars: 3 },
      { id: `cl-vr-3`, text: `상속의 경우 피상속인 소유권 취득 및 사망 사실 기재`, stars: 2 },
      { id: `cl-vr-4`, text: `양수금 청구 — 채권양도 통지 사실 누락 주의`, stars: 2 },
      { id: `cl-vr-5`, text: `청구취지 등기 청구 시 목적 부동산 및 등기번호 누락 주의`, stars: 3 },
      { id: `cl-vr-6`, text: `대위청구 + 피보전채권 병합 시 피보전채권 청구를 먼저`, stars: 2 },
      { id: `cl-vr-7`, text: `확인의 소 — 확인의 이익, 장래이행 — 미리 청구할 필요 누락 주의`, stars: 2 },
      { id: `cl-vr-8`, text: `당사자 법인인 경우 법/주/대 기재`, stars: 1 },
      { id: `cl-vr-9`, text: `갱신/해지/대여금 — 표시한 날짜·도달일 모두 기재`, stars: 2 },
      { id: `cl-vr-10`, text: `권리취득 원인사실 누락 주의 (ex. 매매를 원인으로…)`, stars: 3 },
      { id: `cl-vr-11`, text: `결론 누락 주의`, stars: 3 },
      { id: `cl-vr-12`, text: `채무자 여럿인 경우 연대 관계 등 유의`, stars: 2 },
      { id: `cl-vr-13`, text: `동시이행·소멸시효 등 항변 의식적으로 검토`, stars: 3 },
      { id: `cl-vr-14`, text: `재항변으로 상계 주장 시 상계 요건사실 검토`, stars: 1 },
      { id: `cl-vr-15`, text: `근저당권 말소는 동시이행관계 X (cf. 전세권 설정등기 말소)`, stars: 2 },
      { id: `cl-vr-16`, text: `사해행위 — 신탁자–제3자 법률행위 대상, 원상회복은 제3자 → 수탁자`, stars: 2 },
      { id: `cl-vr-17`, text: `예상 항변 배척 — 주장 자체의 요건사실 서술 必`, stars: 2 },
      { id: `cl-vr-18`, text: `소장 부본 송달로 취소/해지 의사표시`, stars: 2 },
      { id: `cl-vr-19`, text: `상임법·주임법 — 인도 등으로 대항력 갖추었음 서술 누락 주의`, stars: 2 },
      { id: `cl-vr-20`, text: `돈의 성격 특정 (지연손해금 / 이자 / 전부금 등)`, stars: 2 },
      { id: `cl-vr-21`, text: `메모는 노트북에 직접 (시간 절약 = 누수 방어 = 점프의 핵심)`, stars: 3 },
      { id: `cl-vr-22`, text: `반복 출제 쟁점 청구원인은 문장째로 외우기`, stars: 3 },
    ],
  },

  // ============ Pre-exam ============
  {
    id: `cl-prelaunch`, name: `시험 직전 (D-3 ~ 당일)`, subject: `공법`, color: `#7A1E1E`,
    items: [
      { id: `cl-pl-1`, text: `D-3 ~ D-1: 헌법 최판 3회독`, stars: 3 },
      { id: `cl-pl-2`, text: `D-1 저녁: 위헌 판례 키워드 정리`, stars: 3 },
      { id: `cl-pl-3`, text: `공법 당일 아침 30분: 위헌 판례 재확인`, stars: 3 },
      { id: `cl-pl-4`, text: `형사 당일 아침: 형소 최판 일독`, stars: 3 },
      { id: `cl-pl-5`, text: `민사 전날: 민기록 체크리스트 일독`, stars: 3 },
      { id: `cl-pl-6`, text: `점심: 다음 교시 핵심 1~2개만, 새 자료 금지`, stars: 2 },
    ],
  },
];

/* 객관식 3요소(기출/최판/법리) × 7과목 — 최민하 합격수기 기반 권장 별점 (1~5)
   subject는 헌법/행정법/형법/형소법/민법/민소법/상법으로 세분화 */
const MCQ_AREAS = [
  { id: `con`, name: `헌법`, group: `공법`, color: `#1E3A5F`, weights: { 기출: 2, 최판: 5, 법리: 2 } },
  { id: `adm`, name: `행정법`, group: `공법`, color: `#1E3A5F`, weights: { 기출: 3, 최판: 4, 법리: 4 } },
  { id: `cri`, name: `형법`, group: `형사법`, color: `#7A2828`, weights: { 기출: 4, 최판: 3, 법리: 3 } },
  { id: `crp`, name: `형소법`, group: `형사법`, color: `#7A2828`, weights: { 기출: 3, 최판: 5, 법리: 3 } },
  { id: `civ`, name: `민법`, group: `민사법`, color: `#2D5A3D`, weights: { 기출: 5, 최판: 3, 법리: 5 } },
  { id: `cvp`, name: `민소법`, group: `민사법`, color: `#2D5A3D`, weights: { 기출: 5, 최판: 4, 법리: 5 } },
  { id: `com`, name: `상법`, group: `민사법`, color: `#2D5A3D`, weights: { 기출: 5, 최판: 2, 법리: 2 } },
];
const MCQ_PILLARS = [`기출`, `최판`, `법리`];

/* 루틴 트래커 기본 시드 — 최민하 합격수기 기반 (시간 고정 루틴) */
const DEFAULT_ROUTINES = [
  { id: `rt-1`, name: `6:30 기상`, icon: `🌅`, order: 1 },
  { id: `rt-2`, name: `7시 이전 정독실`, icon: `📖`, order: 2 },
  { id: `rt-3`, name: `정시 점심 (11:20)`, icon: `🍱`, order: 3 },
  { id: `rt-4`, name: `정시 저녁 (17:20)`, icon: `🍚`, order: 4 },
  { id: `rt-5`, name: `23:30 이전 취침`, icon: `🌙`, order: 5 },
  { id: `rt-6`, name: `스트레칭`, icon: `🧘`, order: 6 },
];

const DEFAULT_SETTINGS = {
  examDate: `2027-01-07`,
  examLabel: `제16회 변호사시험`,
  weeklyTargets: { 공법: 600, 형사법: 600, 민사법: 900, 선택법: 300 },
  cycleDefs: CYCLE_DEFS,
  mockExams: [
    { id: `mock-1`, label: `모의고사 1차`, start: `2026-06-22`, end: `2026-06-26` },
    { id: `mock-2`, label: `모의고사 2차`, start: `2026-08-03`, end: `2026-08-07` },
    { id: `mock-3`, label: `모의고사 3차`, start: `2026-10-16`, end: `2026-10-20` },
  ],
  d30Mode: true,
  autoGenMockReview: true,
  cycleEnabled: true, // 사이클(블록) 기능 사용 여부
};

/* ============================================================ UTILS ============================================================ */

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/* 새벽 5시를 학습일 경계로 사용 — 새벽 4:59에 측정 정지하면 어제 날짜로 저장 */
const STUDY_DAY_PIVOT_HOUR = 5;
function studyDayISOFromTimestamp(ts) {
  const d = new Date(ts);
  if (d.getHours() < STUDY_DAY_PIVOT_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
/* 해당 학습일의 다음 5시(=경계)의 timestamp */
function nextStudyDayBoundary(ts) {
  const d = new Date(ts);
  if (d.getHours() < STUDY_DAY_PIVOT_HOUR) {
    // 5am of same date
    d.setHours(STUDY_DAY_PIVOT_HOUR, 0, 0, 0);
  } else {
    // 5am of next day
    d.setDate(d.getDate() + 1);
    d.setHours(STUDY_DAY_PIVOT_HOUR, 0, 0, 0);
  }
  return d.getTime();
}
function addDays(iso, n) {
  const d = new Date(iso + `T00:00:00`);
  d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function daysDiff(fromISO, toISO) {
  return Math.round((new Date(toISO + `T00:00:00`) - new Date(fromISO + `T00:00:00`)) / 86400000);
}
function fmtKDate(iso) {
  const d = new Date(iso + `T00:00:00`);
  const days = [`일`, `월`, `화`, `수`, `목`, `금`, `토`];
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2, `0`)}.${String(d.getDate()).padStart(2, `0`)} (${days[d.getDay()]})`;
}
function fmtShortDate(iso) {
  if (!iso) return `-`;
  const [, m, d] = iso.split(`-`);
  return `${Number(m)}/${Number(d)}`;
}
function fmtMin(n) {
  if (!n) return `0분`;
  const h = Math.floor(n / 60), m = n % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}
function fmtHour(n) { return `${Math.round((n / 60) * 10) / 10}h`; }
function fmtSavedAt(iso) {
  if (!iso) return ``;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ``;
  return d.toLocaleTimeString(`ko-KR`, { hour:`2-digit`, minute:`2-digit` });
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function getTrackMeta(trackKey) {
  return TRACK_TYPES.find(t => t.key === trackKey) || TRACK_TYPES[0];
}

function normalizeTrackInboxText(text) {
  return String(text || ``).replace(/\s+/g, ` `).trim();
}

function appendTrackText(prev, date, trackKey, text) {
  const nextLine = normalizeTrackInboxText(text);
  if (!nextLine) return prev;
  const dayTracks = prev[date] || {};
  const cur = dayTracks[trackKey] || {};
  const existing = (cur.text || ``).trim();
  const lines = existing.split(/\n/).map(line => line.trim()).filter(Boolean);
  if (lines.includes(nextLine)) return prev;
  const nextText = existing ? `${existing}\n${nextLine}` : nextLine;
  return {
    ...prev,
    [date]: {
      ...dayTracks,
      [trackKey]: { ...cur, text: nextText },
    },
  };
}

function buildTrackInboxItem({ date = todayISO(), trackKey = `memo`, text, source = `직접`, sourceId = ``, subject = `` }) {
  const meta = getTrackMeta(trackKey);
  const body = normalizeTrackInboxText(text);
  if (!body) return null;
  return {
    id: uid(),
    date,
    trackKey: meta.key,
    text: body,
    source,
    sourceId: sourceId || `${source}:${date}:${meta.key}:${body}`,
    subject,
    createdAt: new Date().toISOString(),
  };
}

function enqueueTrackInbox(prev, item) {
  if (!item?.text) return prev;
  const body = normalizeTrackInboxText(item.text);
  const duplicate = (prev || []).some(x => {
    if (!x || x.status === `accepted` || x.status === `dismissed`) return false;
    if (item.sourceId && x.sourceId === item.sourceId) return true;
    return x.date === item.date && x.trackKey === item.trackKey && normalizeTrackInboxText(x.text) === body;
  });
  if (duplicate) return prev;
  return [{ ...item, text: body }, ...(prev || [])].slice(0, 200);
}

function courseTagToTrackKey(tagKey) {
  if (tagKey === `case`) return `case`;
  if (tagKey === `memory` || tagKey === `hard`) return `memo`;
  if (tagKey === `again`) return `aux`;
  return `memo`;
}

function buildCourseTrackInboxItem(course, lecture, tagKey, date = todayISO()) {
  const tagLabel = COURSE_TAGS.find(t => t.key === tagKey)?.label || tagKey;
  return buildTrackInboxItem({
    date,
    trackKey: courseTagToTrackKey(tagKey),
    text: `[${course.subject}] ${course.name} ${lecture.num}강 · ${lecture.title} · ${tagLabel}`,
    source: `강의 태그`,
    sourceId: `course-track:${course.id}:${lecture.num}:${tagKey}`,
    subject: course.subject,
  });
}

/* ICS (Apple/Google Calendar) export */
function buildICS({ examDate, examLabel, mockExams = [], schedules = [] }) {
  const BS = String.fromCharCode(92);
  const NL = String.fromCharCode(10);
  const CRLF = String.fromCharCode(13) + String.fromCharCode(10);
  const pad2 = n => (n < 10 ? `0` : ``) + n;
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${pad2(d.getUTCMonth()+1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
  const dOnly = iso => iso.split(`-`).join(``);
  const esc = s => {
    let o = String(s == null ? `` : s);
    o = o.split(BS).join(BS + BS);
    o = o.split(NL).join(BS + `n`);
    o = o.split(`,`).join(BS + `,`);
    o = o.split(`;`).join(BS + `;`);
    return o;
  };
  const ev = [];
  if (examDate) ev.push({ uid: `exam-` + examDate, s: dOnly(examDate), e: dOnly(addDays(examDate, 5)), t: examLabel || `변호사시험` });
  mockExams.forEach(m => ev.push({ uid: `mock-` + m.id, s: dOnly(m.start), e: dOnly(addDays(m.end, 1)), t: m.label }));
  schedules.forEach(x => ev.push({ uid: `sched-` + x.id, s: dOnly(x.start), e: dOnly(addDays(x.end, 1)), t: x.title || `일정` }));
  const out = [`BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//Bar Exam Journal//KR`, `CALSCALE:GREGORIAN`, `X-WR-CALNAME:변호사시험 일정`, `X-WR-TIMEZONE:Asia/Seoul`];
  ev.forEach(x => {
    out.push(`BEGIN:VEVENT`, `UID:` + x.uid + `@bar-journal`, `DTSTAMP:` + stamp, `DTSTART;VALUE=DATE:` + x.s, `DTEND;VALUE=DATE:` + x.e, `SUMMARY:` + esc(x.t), `TRANSP:TRANSPARENT`, `END:VEVENT`);
  });
  out.push(`END:VCALENDAR`);
  return out.join(CRLF);
}

function downloadICS(content, filename = '변시일정.ics') {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement(`a`);
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

/* SheetJS(XLSX) 동적 로드 */
let _xlsxPromise = null;
function loadXLSX() {
  if (typeof window !== `undefined` && window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsxPromise) return _xlsxPromise;
  _xlsxPromise = import(`xlsx`).then(mod => mod.default || mod);
  return _xlsxPromise;
}

async function exportXLSX(state, filename) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const {
    settings = {}, logs = {}, tracks = {}, todos = {}, examScores = [], rankScores = [],
    materials = [], reviews = [], books = [], schedules = [], moods = {}, trackInbox = [],
    checklists = [], courses = [], weeklyPlans = {}, routines = [], routineLog = {}, parkingItems = [],
  } = state;

  // [1] Summary
  const totalMin = Object.values(logs).reduce((s, dl) => s + Object.values(dl).reduce((a,b)=>a+(b||0),0), 0);
  const studyDays = Object.keys(logs).length;
  const summary = [
    [`Bar Exam Journal — 데이터 내보내기`],
    [`생성일`, new Date().toISOString().slice(0,19).replace(`T`,` `)],
    [],
    [`시험 정보`],
    [`시험명`, settings.examLabel || ``],
    [`시험일`, settings.examDate || ``],
    [`D-day`, settings.examDate ? daysDiff(todayISO(), settings.examDate) : ``],
    [],
    [`누적 학습`],
    [`총 학습 시간(분)`, totalMin],
    [`총 학습 시간(시간)`, Math.round(totalMin/60*10)/10],
    [`학습 일수`, studyDays],
    [`일평균(분)`, studyDays > 0 ? Math.round(totalMin/studyDays) : 0],
    [],
    [`주간 목표 (분)`],
    ...Object.entries(settings.weeklyTargets || {}).map(([k,v]) => [k, v]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), `요약`);

  // [2] Daily study time matrix
  const allKeys = new Set();
  Object.values(logs).forEach(dl => Object.keys(dl).forEach(k => allKeys.add(k)));
  const sortedKeys = [...allKeys].sort();
  const dateRows = Object.keys(logs).sort();
  const logHeader = [`날짜`, `요일`, ...sortedKeys, `합계(분)`, `한줄메모`];
  const logRows = [logHeader];
  const dows = [`일`,`월`,`화`,`수`,`목`,`금`,`토`];
  dateRows.forEach(d => {
    const dl = logs[d] || {};
    const dt = new Date(d + `T00:00:00`);
    const sum = Object.values(dl).reduce((a,b) => a+(b||0), 0);
    const row = [d, dows[dt.getDay()]];
    sortedKeys.forEach(k => row.push(dl[k] || 0));
    row.push(sum);
    row.push(moods[d] || ``);
    logRows.push(row);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(logRows), `학습시간`);

  // [3] 5-track journal
  const trackRows = [[`날짜`, `요일`, ...TRACK_TYPES.map(t => t.label), `한줄메모`]];
  Object.keys(tracks).sort().forEach(d => {
    const dt = new Date(d + `T00:00:00`);
    const t = tracks[d] || {};
    const row = [d, dows[dt.getDay()]];
    TRACK_TYPES.forEach(tt => {
      const v = t[tt.key] || {};
      let cell = ``;
      if (v.done) cell=`✓`;
      if (v.text) cell = (cell ? cell + ` ` : ``) + v.text;
      row.push(cell);
    });
    row.push(moods[d] || ``);
    trackRows.push(row);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trackRows), `5트랙`);

  // [3-1] 5-track inbox
  const inboxRows = [[`날짜`, `트랙`, `내용`, `출처`, `과목`, `생성시각`, `상태`]];
  trackInbox.forEach(item => {
    const meta = getTrackMeta(item.trackKey);
    inboxRows.push([
      item.date || ``,
      meta ? `${meta.short} ${meta.label}` : item.trackKey || ``,
      item.text || ``,
      item.source || ``,
      item.subject || ``,
      item.createdAt || ``,
      item.status || `대기`,
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inboxRows), `5트랙인박스`);

  // [4] MCQ round scores
  const scoreRows = [[`날짜`, `회차`, `과목`, `유형`, `틀림`, `총문항`, `메모`]];
  [...examScores].sort((a,b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject)).forEach(s => {
    scoreRows.push([s.date, s.round, s.subject, s.type || `선택형`, s.wrong, s.total || ``, s.note || ``]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(scoreRows), `회차점수`);

  // [5] Essay/case rank scores
  const rankRows = [[`날짜`, `묶음`, `회차`, `과목`, `유형`, `점수`, `등수`, `인원`, `상위비율(%)`, `평균`, `평균대비`, `메모`]];
  [...rankScores].sort((a,b) => (a.seriesTitle || ``).localeCompare(b.seriesTitle || ``) || (a.round || 0) - (b.round || 0)).forEach(s => {
    rankRows.push([
      s.date || ``,
      s.seriesTitle || ``,
      s.round || ``,
      s.subject || ``,
      s.type || ``,
      s.score ?? ``,
      s.rank ?? ``,
      s.totalStudents ?? ``,
      s.topPercent ?? ``,
      s.averageScore ?? ``,
      s.scoreMinusAverage ?? ``,
      s.note || ``,
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rankRows), `사례등수`);

  // [6] Materials
  const matRows = [[`자료명`, `과목`, `현재 회독`, `목표 회독`, `진행률(%)`]];
  materials.forEach(m => {
    const pct = m.target > 0 ? Math.round((m.rounds / m.target) * 100) : 0;
    matRows.push([m.name, m.subject, m.rounds, m.target, pct]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matRows), `자료회독`);

  // [7] Topics
  const reviewRows = [[`주제`, `과목`, `생성일`, `마지막 회독`, `회독차`, `메모`]];
  reviews.forEach(r => {
    reviewRows.push([r.title, r.subject, r.created, r.lastReviewed, r.cycleIndex + 1, r.note || ``]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reviewRows), `주제회독`);

  // [8] Books
  const bookRows = [[`제목`, `과목`, `현재`, `목표`, `진행률(%)`, `메모`]];
  books.forEach(b => {
    const pct = b.target > 0 ? Math.round((b.current / b.target) * 100) : 0;
    bookRows.push([b.title, b.subject, b.current, b.target, pct, b.note || ``]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bookRows), `문제집`);

  // [9] Schedules
  const schedRows = [[`종류`, `제목`, `시작일`, `종료일`, `기간(일)`, `색상`]];
  if (settings.examDate) {
    schedRows.push([`본시험`, settings.examLabel || ``, settings.examDate, settings.examDate, 1, ``]);
  }
  (settings.mockExams || []).forEach(m => {
    schedRows.push([`모의고사`, m.label, m.start, m.end, daysDiff(m.start, m.end) + 1, ``]);
  });
  schedules.forEach(s => {
    schedRows.push([`일정`, s.title, s.start, s.end, daysDiff(s.start, s.end) + 1, s.color || ``]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(schedRows), `일정`);

  // [10] Todos
  const todoRows = [[`날짜`, `제목`, `완료`, `비고`]];
  Object.keys(todos).sort().forEach(d => {
    (todos[d] || []).filter(t => !t.hidden).forEach(t => {
      todoRows.push([d, t.title, t.done ? `✓` : ``, t.fromMock ? `모의고사 자동생성` : ``]);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(todoRows), `할일`);

  // [10-1] Parking lot
  const parkingRows = [[`구분`, `제목`, `메모`, `생성일`, `수정일`]];
  parkingItems.forEach(item => {
    const bucket = PARKING_BUCKETS.find(b => b.key === item.bucket);
    parkingRows.push([
      bucket?.label || item.bucket || ``,
      item.title || ``,
      item.note || ``,
      item.createdAt || ``,
      item.updatedAt || ``,
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(parkingRows), `버릴목록`);

  // [11] Checklists
  const clRows = [[`카테고리`, `과목`, `마지막 회독일`, `★`, `항목`]];
  checklists.forEach(c => {
    if (c.items.length === 0) {
      clRows.push([c.name, c.subject, c.lastReviewed || `미회독`, ``, `(빈 카테고리)`]);
    } else {
      c.items.forEach(it => {
        clRows.push([c.name, c.subject, c.lastReviewed || `미회독`, `★`.repeat(it.stars || 1), it.text]);
      });
    }
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clRows), `체크리스트`);

  // [12] Course summary
  const courseSummaryRows = [[`강의명`, `과목`, `완강기준(%)`, `총강`, `완강`, `완강률(%)`, `복습완료`, `복습률(%)`, `총분량(분)`, `완강분량(분)`, `시작일`, `수강목표일`, `복습목표일`, `생성일`, `마지막 갱신`]];
  courses.forEach(c => {
    const lectures = c.lectures || [];
    const total = lectures.length;
    const completed = lectures.filter(l => l.completed).length;
    const reviewed = lectures.filter(l => l.reviewed).length;
    const totalMin = lectures.reduce((sum, l) => sum + (l.durationMin || 0), 0);
    const completedMin = lectures.filter(l => l.completed).reduce((sum, l) => sum + (l.durationMin || 0), 0);
    courseSummaryRows.push([
      c.name || ``,
      c.subject || ``,
      c.completeThreshold || ``,
      total,
      completed,
      total ? Math.round((completed / total) * 100) : 0,
      reviewed,
      total ? Math.round((reviewed / total) * 100) : 0,
      totalMin,
      completedMin,
      c.startDate || ``,
      c.targetEndDate || ``,
      c.targetReviewDate || ``,
      c.createdAt || ``,
      c.lastUpdated || ``,
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(courseSummaryRows), `강의요약`);

  // [13] Course lectures
  const courseLectureRows = [[`강의명`, `과목`, `강`, `제목`, `분량(분)`, `진도(%)`, `완강`, `복습완료`, `마지막복습`, `다음복습`, `복습시간(분)`, `태그`, `메모`]];
  courses.forEach(c => {
    [...(c.lectures || [])].sort((a, b) => (a.num || 0) - (b.num || 0)).forEach(l => {
      courseLectureRows.push([
        c.name || ``,
        c.subject || ``,
        l.num || ``,
        l.title || ``,
        l.durationMin || 0,
        l.progress || 0,
        l.completed ? `✓` : ``,
        l.reviewed ? `✓` : ``,
        l.lastReviewed || ``,
        l.nextReviewDate || ``,
        l.reviewDurationMin || ``,
        getLectureTagLabels(l).join(`, `),
        l.note || ``,
      ]);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(courseLectureRows), `강의목록`);

  // [14] Weekly plans
  const weeklyRows = [[`주 시작`, `주 종료`, `구분`, `날짜`, `요일/과목`, `계획`]];
  Object.keys(weeklyPlans).sort().forEach(weekStart => {
    const plan = weeklyPlans[weekStart] || {};
    const dayPlans = getWeeklyDayPlans(plan);
    weekDays(weekStart).forEach((date, idx) => {
      if ((dayPlans[date] || ``).trim()) {
        weeklyRows.push([weekStart, addDays(weekStart, 6), `요일`, date, WEEKDAY_LABELS[idx], dayPlans[date]]);
      }
    });
    Object.keys(SUBJECTS).forEach(sub => {
      if ((plan[sub] || ``).trim()) {
        weeklyRows.push([weekStart, addDays(weekStart, 6), `과목`, ``, sub, plan[sub]]);
      }
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(weeklyRows), `주간계획`);

  // [15] Routines
  const routineRows = [[`날짜`, `루틴`, `아이콘`, `완료`, `순서`]];
  const sortedRoutines = [...routines].sort((a, b) => (a.order || 0) - (b.order || 0));
  const routineNameMap = new Map(sortedRoutines.map(r => [r.id, r]));
  Object.keys(routineLog).sort().forEach(date => {
    const day = routineLog[date] || {};
    Object.entries(day).forEach(([routineId, done]) => {
      const routine = routineNameMap.get(routineId) || {};
      routineRows.push([date, routine.name || routineId, routine.icon || ``, done ? `✓` : ``, routine.order || ``]);
    });
  });
  if (routineRows.length === 1) {
    sortedRoutines.forEach(r => routineRows.push([``, r.name, r.icon || ``, ``, r.order || ``]));
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(routineRows), `루틴`);

  // Column width auto-adjust
  wb.SheetNames.forEach(name => {
    const ws = wb.Sheets[name];
    const range = XLSX.utils.decode_range(ws[`!ref`] || `A1`);
    const cols = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      let max = 8;
      for (let R = range.s.r; R <= range.e.r; R++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && cell.v != null) {
          const len = String(cell.v).length;
          if (len > max) max = Math.min(40, len + 2);
        }
      }
      cols.push({ wch: max });
    }
    ws[`!cols`] = cols;
  });

  XLSX.writeFile(wb, filename);
}
/* ============================================================ 인강 진도표 파서 ============================================================ */
function parseCourseText(text) {
  const lectures = [];

  // 1. 타사 양식 매칭 (제 N 강 [제목] [수강분]분 / [전체분]분)
  // 줄바꿈이나 '최근재생' 텍스트가 섞여 들어오는 것을 대비해 전체 텍스트 단위로 정규식 매칭
  const altPattern = /제\s*(\d+)\s*강([\s\S]*?)(\d+)\s*분\s*\/\s*(\d+)\s*분/g;
  let match;
  let altMatched = false;

  while ((match = altPattern.exec(text)) !== null) {
    altMatched = true;
    const num = parseInt(match[1], 10);
    
    // 제목에서 불필요한 줄바꿈과 '최근재생' 등의 텍스트 제거 후 깔끔하게 정리
    let rawTitle = match[2]
      .replace(/최근재생/g, '')
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const watchedMin = parseInt(match[3], 10);
    const totalMin = parseInt(match[4], 10);

    // 수강 시간과 전체 시간을 바탕으로 진도율(%) 계산
    const progress = totalMin > 0 ? Math.floor((watchedMin / totalMin) * 100) : 0;
    // 수강 시간이 전체 시간과 같거나 크면 완강 처리
    const completed = totalMin > 0 && watchedMin >= totalMin;

    if (!lectures.find(l => l.num === num)) {
      lectures.push({
        num,
        title: rawTitle,
        durationMin: totalMin, // 완강 시 자동 합산될 기준 시간이므로 전체 분량을 저장
        progress,
        completed,
      });
    }
  }

  // 타사 양식으로 성공적으로 매칭되었다면 바로 정렬해서 반환
  if (altMatched) {
    return lectures.sort((a, b) => a.num - b.num);
  }

  // 2. 기존 양식 매칭 (N강 제목 N분 N% [완강])
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ` `).trim();
    if (!line) continue;
    if (/^\(\d+분/.test(line)) continue; // (28분/88분) 같은 보조 줄 스킵

    // 패턴 1: N강 제목 N분 N% [완강]
    let m = line.match(/(\d+)\s*강\s+(.+?)\s+(\d+)\s*분\s+(\d+)\s*%\s*(완강)?/);
    if (m) {
      const num = parseInt(m[1]);
      if (!lectures.find(l => l.num === num)) {
        lectures.push({
          num,
          title: m[2].trim(),
          durationMin: parseInt(m[3]),
          progress: parseInt(m[4]),
          completed: !!m[5] || parseInt(m[4]) >= 100,
        });
      }
      continue;
    }

    // 패턴 2: N강 제목만 (진도 정보 없음 — 미수강)
    m = line.match(/^(\d+)\s*강\s+(.+)$/);
    if (m) {
      const num = parseInt(m[1]);
      if (!lectures.find(l => l.num === num)) {
        lectures.push({
          num, title: m[2].trim(),
          durationMin: 0, progress: 0, completed: false,
        });
      }
    }
  }
  
  return lectures.sort((a, b) => a.num - b.num);
}

function compactLectureNums(nums = []) {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const chunks = [];
  let start = null;
  let prev = null;
  sorted.forEach(n => {
    if (start == null) {
      start = n;
      prev = n;
      return;
    }
    if (n === prev + 1) {
      prev = n;
      return;
    }
    chunks.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = n;
    prev = n;
  });
  if (start != null) chunks.push(start === prev ? `${start}` : `${start}-${prev}`);
  return chunks.join(`, `);
}

function parseLectureRangeText(text, lectures = []) {
  const allNums = new Set((lectures || []).map(l => l.num));
  const raw = String(text || ``).trim();
  if (!raw) return [];
  if (/^(전체|all)$/i.test(raw)) return [...allNums].sort((a, b) => a - b);

  const nums = new Set();
  raw.split(/[,\s]+/).forEach(part => {
    const token = part.trim();
    if (!token) return;
    const range = token.match(/^(\d+)\s*(?:-|~|–|—)\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      for (let n = start; n <= end; n++) {
        if (allNums.has(n)) nums.add(n);
      }
      return;
    }
    const single = Number(token.replace(/[^\d]/g, ``));
    if (single && allNums.has(single)) nums.add(single);
  });
  return [...nums].sort((a, b) => a - b);
}

function nextLectureTagPatch(lecture, tagKey, today) {
  const current = lecture?.tags || [];
  const adding = !current.includes(tagKey);
  const nextTags = adding ? [...current, tagKey] : current.filter(t => t !== tagKey);
  const patch = { tags: nextTags };
  if (tagKey === `hard`) {
    patch.hardReviewCount = adding ? 0 : 0;
    patch.nextReviewDate = adding ? addDays(today, 1) : (nextTags.includes(`again`) ? today : null);
  }
  if (tagKey === `again`) {
    patch.nextReviewDate = adding ? today : (nextTags.includes(`hard`) ? (lecture?.nextReviewDate || addDays(today, 1)) : null);
  }
  return patch;
}
/* ============================================================ 카카오톡 복사용 일간계획 텍스트 빌더 ============================================================ */
function buildDailyPlanText({ date, log, tracks, todos, mood }) {
  const lines = [];
  lines.push(`📅 ${fmtKDate(date)}`);
  lines.push(``);

  // 학습시간 요약
  const subTotals = {};
  Object.entries(log || {}).forEach(([k, v]) => {
    const [s] = k.split(`::`);
    subTotals[s] = (subTotals[s] || 0) + (v || 0);
  });
  const grandTotal = Object.values(subTotals).reduce((a, b) => a + b, 0);
  if (grandTotal > 0) {
    lines.push(`⏱ 학습시간`);
    Object.keys(SUBJECTS).forEach(sub => {
      if (subTotals[sub]) lines.push(`• ${sub} ${fmtMin(subTotals[sub])}`);
    });
    lines.push(`• 합계 ${fmtMin(grandTotal)}`);
    lines.push(``);
  }

  // 5트랙 — 체크된 것만 내보냄
  const t = tracks || {};
  const checkedTracks = TRACK_TYPES.filter(tt => t[tt.key]?.done);
  if (checkedTracks.length > 0) {
    lines.push(`📚 5트랙`);
    checkedTracks.forEach(tt => {
      const slot = t[tt.key] || {};
      const txt = slot.text || `—`;
      lines.push(`✓ [${tt.short}] ${txt}`);
    });
    lines.push(``);
  }

  // 할 일
  const visible = (todos || []).filter(x => !x.hidden);
  if (visible.length > 0) {
    const done = visible.filter(x => x.done).length;
    lines.push(`✅ 할 일 (${done}/${visible.length})`);
    visible.forEach(x => lines.push(`${x.done ? `✓` : `□`} ${x.title}`));
    lines.push(``);
  }

  // 한줄 메모
  if (mood && mood.trim()) {
    lines.push(`📝 한 줄`);
    lines.push(mood.trim());
  }

  return lines.join(`\n`).trim();
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // fallback
    const ta = document.createElement(`textarea`);
    ta.value = text;
    ta.style.position = `fixed`;
    ta.style.opacity = `0`;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand(`copy`);
    document.body.removeChild(ta);
    return true;
  } catch (e) {
    console.error(`[clipboard]`, e);
    return false;
  }
}

function weekStartOf(iso) {
  const d = new Date(iso + `T00:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const WEEKDAY_LABELS = [`월`, `화`, `수`, `목`, `금`, `토`, `일`];
const WEEKDAY_ALIASES = {
  월: 0, 월요일: 0, monday: 0, mon: 0,
  화: 1, 화요일: 1, tuesday: 1, tue: 1,
  수: 2, 수요일: 2, wednesday: 2, wed: 2,
  목: 3, 목요일: 3, thursday: 3, thu: 3,
  금: 4, 금요일: 4, friday: 4, fri: 4,
  토: 5, 토요일: 5, saturday: 5, sat: 5,
  일: 6, 일요일: 6, sunday: 6, sun: 6,
};

function weekDays(startISO) { return [...Array(7)].map((_, i) => addDays(startISO, i)); }

function getWeeklyDayPlans(plan = {}) {
  return plan?._days && typeof plan._days === `object` && !Array.isArray(plan._days) ? plan._days : {};
}

function cleanWeeklyPlan(plan = {}) {
  const next = {};
  Object.keys(SUBJECTS).forEach(sub => {
    const v = (plan[sub] || ``).trim();
    if (v) next[sub] = v;
  });
  const days = {};
  Object.entries(getWeeklyDayPlans(plan)).forEach(([date, value]) => {
    const v = (value || ``).trim();
    if (v) days[date] = v;
  });
  if (Object.keys(days).length > 0) next._days = days;
  return next;
}

function parseWeeklyDayText(text, weekStart) {
  const days = {};
  let activeDate = null;
  const dayPattern = /^(월(?:요일)?|화(?:요일)?|수(?:요일)?|목(?:요일)?|금(?:요일)?|토(?:요일)?|일(?:요일)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)(?:\s*[·.,:/|+-]\s*|\s+)(.*)$/i;

  String(text || ``).split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.replace(/^\s*[-*•□✓]\s*/, ``).trim();
    if (!line) return;

    const match = line.match(dayPattern);
    if (match) {
      const key = match[1].toLowerCase();
      const offset = WEEKDAY_ALIASES[key] ?? WEEKDAY_ALIASES[key.slice(0, 1)];
      if (offset == null) return;
      activeDate = addDays(weekStart, offset);
      const body = (match[2] || ``).trim();
      if (body) days[activeDate] = days[activeDate] ? `${days[activeDate]}\n${body}` : body;
      return;
    }

    if (activeDate) {
      days[activeDate] = days[activeDate] ? `${days[activeDate]}\n${line}` : line;
    }
  });

  return days;
}

function buildWeeklyPlanQueueItems(text = ``, date = todayISO()) {
  return String(text || ``)
    .split(/\r?\n/)
    .flatMap(line => line.split(/\s+\/\s+/))
    .map(line => line.replace(/^\s*[-*•□✓]\s*/, ``).trim())
    .filter(Boolean)
    .map((title, idx) => ({
      id: `weekly-plan-${date}-${idx}`,
      title,
      date,
    }));
}

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

/* 본시험 주간 (변호사시험 5일) — 시험 시작일 ~ +4일까지 본시험 주간으로 처리 */
const EXAM_WEEK_DAYS = 5;
function getExamWeek(dateISO, settings) {
  if (!settings.examDate) return null;
  const start = settings.examDate;
  const end = addDays(settings.examDate, EXAM_WEEK_DAYS - 1);
  if (dateISO < start || dateISO > end) return null;
  const dayNum = daysDiff(start, dateISO) + 1;
  return {
    start, end,
    label: settings.examLabel || `변호사시험`,
    dayNum, totalDays: EXAM_WEEK_DAYS,
  };
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
  if (settings.cycleEnabled === false) return null; // 사이클 기능 꺼짐
  const { cycleDefs, examDate, mockExams = [] } = settings;
  //
  if (examDate) {
    const examEnd = addDays(examDate, EXAM_WEEK_DAYS - 1);
    if (dateISO >= examDate && dateISO <= examEnd) return null;
    if (dateISO > examEnd) return null;
  }

  const anchors = [
    ...mockExams.map(m => ({ start: m.start, end: m.end, kind: `mock`, label: m.label })),
    ...(examDate ? [{ start: examDate, end: examDate, kind: `exam`, label: `본시험` }] : []),
  ].sort((a, b) => a.start.localeCompare(b.start));

  if (anchors.length === 0) return null;
  for (const a of anchors) {
    if (a.kind === `mock` && dateISO >= a.start && dateISO <= a.end) return null;
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
  schemaVersion: APP_SCHEMA_VERSION,
  settings: DEFAULT_SETTINGS,
  logs: {}, reviews: [], books: [], todos: {},
  tracks: {},
  materials: DEFAULT_MATERIALS,
  materialLog: {},
  examScores: [],
  rankScores: [],
  moods: {},
  trackInbox: [],
  parkingItems: [],
  schedules: [], // [{ id, title, color, start, end, note }]
  checklists: DEFAULT_CHECKLISTS, // [{ id, name, subject, color, items: [{ id, text, stars }], lastReviewed }]
  mcqProgress: {}, //
  routines: DEFAULT_ROUTINES, // [{ id, name, icon, order }]
  routineLog: {},  // routineLog: { YYYY-MM-DD: { routineId: true } }
  weeklyPlans: {}, // { weekStartISO: { 공법: "...", _days: { dateISO: "..." } } }
  courses: [], // [{ id, name, subject, studyType, completeThreshold, lectures: [{num, title, durationMin, progress, completed, reviewed, tags, note}], createdAt, lastUpdated }]
};

function asPlainObject(value, fallback = {}) {
  return value && typeof value === `object` && !Array.isArray(value) ? value : fallback;
}

function asArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function normalizeSettings(value = {}) {
  const raw = asPlainObject(value);
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    weeklyTargets: { ...DEFAULT_SETTINGS.weeklyTargets, ...asPlainObject(raw.weeklyTargets) },
    cycleDefs: asArray(raw.cycleDefs, CYCLE_DEFS),
    mockExams: asArray(raw.mockExams, DEFAULT_SETTINGS.mockExams),
  };
}

const PERSISTED_STATE_KEYS = [
  `settings`, `logs`, `reviews`, `books`, `todos`, `tracks`,
  `materials`, `materialLog`, `examScores`, `rankScores`, `moods`, `trackInbox`, `parkingItems`, `schedules`, `checklists`,
  `mcqProgress`, `routines`, `routineLog`, `weeklyPlans`, `courses`,
];
const LOCAL_DRAFT_PREFIX = `bar-exam-journal-local-draft`;
const FEATURE_INTRO_PREFIX = `bar-exam-journal-feature-intro-hidden-until`;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function localDraftKey(uidValue) {
  return `${LOCAL_DRAFT_PREFIX}:${uidValue}`;
}

function featureIntroKey(uidValue) {
  return `${FEATURE_INTRO_PREFIX}:${uidValue || `anon`}`;
}

function isFeatureIntroHidden(uidValue) {
  try {
    return Number(localStorage.getItem(featureIntroKey(uidValue)) || 0) > Date.now();
  } catch {
    return false;
  }
}

function hideFeatureIntroForSevenDays(uidValue) {
  try {
    localStorage.setItem(featureIntroKey(uidValue), String(Date.now() + SEVEN_DAYS_MS));
  } catch {}
}

function buildPersistedSnapshot(state) {
  const out = {};
  PERSISTED_STATE_KEYS.forEach(key => { out[key] = state[key]; });
  return stripUndefined(out);
}

function sameStoredValue(a, b) {
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    return false;
  }
}

function hasStateDiff(a, b) {
  if (!a || !b) return true;
  return PERSISTED_STATE_KEYS.some(key => !sameStoredValue(a[key], b[key]));
}

function readLocalDraft(uidValue) {
  try {
    const raw = localStorage.getItem(localDraftKey(uidValue));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === `object` ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalDraft(uidValue, state, updatedAt = new Date().toISOString()) {
  try {
    const payload = {
      schemaVersion: APP_SCHEMA_VERSION,
      updatedAt,
      ...buildPersistedSnapshot(state),
    };
    localStorage.setItem(localDraftKey(uidValue), JSON.stringify(payload));
  } catch {}
}

function shouldRestoreLocalDraft(draft, remoteUpdatedAt, remoteState) {
  if (!draft?.updatedAt) return false;
  const draftState = normalizeStoredState(draft);
  if (!hasStateDiff(draftState, remoteState)) return false;
  if (!remoteUpdatedAt) return true;
  return draft.updatedAt > remoteUpdatedAt;
}

function markDirtyDiff(dirtySet, localState, baselineState) {
  PERSISTED_STATE_KEYS.forEach(key => {
    if (!sameStoredValue(localState[key], baselineState[key])) dirtySet.add(key);
  });
}

function blankUserState() {
  return {
    settings: normalizeSettings(),
    logs: {}, reviews: [], books: [], todos: {}, tracks: {},
    materials: DEFAULT_MATERIALS, materialLog: {},
    examScores: [], rankScores: [], moods: {}, trackInbox: [], parkingItems: [], schedules: [],
    checklists: DEFAULT_CHECKLISTS, mcqProgress: {},
    routines: DEFAULT_ROUTINES, routineLog: {}, weeklyPlans: {}, courses: [],
  };
}

function normalizeStoredState(data = {}) {
  const d = asPlainObject(data);
  return {
    settings: normalizeSettings(d.settings),
    logs: asPlainObject(d.logs),
    reviews: asArray(d.reviews),
    books: asArray(d.books),
    todos: asPlainObject(d.todos),
    tracks: asPlainObject(d.tracks),
    materials: asArray(d.materials, DEFAULT_MATERIALS),
    materialLog: asPlainObject(d.materialLog),
    examScores: asArray(d.examScores),
    rankScores: asArray(d.rankScores),
    moods: asPlainObject(d.moods),
    trackInbox: asArray(d.trackInbox),
    parkingItems: asArray(d.parkingItems),
    schedules: asArray(d.schedules),
    checklists: asArray(d.checklists, DEFAULT_CHECKLISTS),
    mcqProgress: asPlainObject(d.mcqProgress),
    routines: asArray(d.routines, DEFAULT_ROUTINES),
    routineLog: asPlainObject(d.routineLog),
    weeklyPlans: asPlainObject(d.weeklyPlans),
    courses: asArray(d.courses),
  };
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === `object`) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    );
  }
  return value;
}

async function saveStateToFirestore(uid, partial) {
  if (!fbDB) return false;
  try {
    await setDoc(doc(fbDB, `users`, uid), stripUndefined(partial), { merge: true });
    return true;
  } catch (e) {
    console.error(`[saveState]`, e);
    return false;
  }
}

/* ============================================================ APP ============================================================ */

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState(`home`);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [logs, setLogs] = useState({});
  const [reviews, setReviews] = useState([]);
  const [books, setBooks] = useState([]);
  const [todos, setTodos] = useState({});
  const [tracks, setTracks] = useState({});
  const [materials, setMaterials] = useState(DEFAULT_MATERIALS);
  const [materialLog, setMaterialLog] = useState({});
  const [examScores, setExamScores] = useState([]);
  const [rankScores, setRankScores] = useState([]);
  const [moods, setMoods] = useState({});
  const [trackInbox, setTrackInbox] = useState([]);
  const [parkingItems, setParkingItems] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [checklists, setChecklists] = useState(DEFAULT_CHECKLISTS);
  const [mcqProgress, setMcqProgress] = useState({});
  const [routines, setRoutines] = useState(DEFAULT_ROUTINES);
  const [routineLog, setRoutineLog] = useState({});
  const [weeklyPlans, setWeeklyPlans] = useState({});
  const [courses, setCourses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState(todayISO());
  const [syncStatus, setSyncStatus] = useState(`idle`); // idle | saving | saved | error
  const [syncRetryTick, setSyncRetryTick] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [showFeatureIntro, setShowFeatureIntro] = useState(false);
  const userId = user?.uid || ``;
  // ↓ [추가] 모바일 하단 탭 고정 및 줌 방지를 위한 뷰포트 강제 세팅
  useEffect(() => {
    let meta = document.querySelector(`meta[name="viewport"]`);
    if (!meta) {
      meta = document.createElement(`meta`);
      meta.name = `viewport`;
      document.head.appendChild(meta);
    }
    meta.content = `width=device-width, initial-scale=1.0, viewport-fit=cover`;
  }, []);

  // Auth listener
  useEffect(() => {
    const t = setInterval(() => setToday(todayISO()), 60000);
    if (!firebaseReady || !fbAuth) {
      setAuthChecked(true);
      return () => clearInterval(t);
    }

    const unsub = onAuthStateChanged(fbAuth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return () => { unsub(); clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!loaded || !userId) {
      setShowFeatureIntro(false);
      return;
    }
    setShowFeatureIntro(!isFeatureIntroHidden(userId));
  }, [loaded, userId]);
const globalStyles = (
    <>
      <style>{FONT_IMPORT}</style>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        /* ↓ 변경: html, body 마진/패딩 제거 및 모바일 바운스 방지 추가 */
        html, body { margin: 0; padding: 0; overscroll-behavior-y: none; }
        input, textarea, button, select { font-family: inherit; color: inherit; }
        input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        .serif { font-family: Fraunces, Noto Serif KR, serif; }
        .kserif { font-family: Noto Serif KR, serif; }
        .mono { font-family: JetBrains Mono, monospace; font-variant-numeric: tabular-nums; }
        .fadeIn { animation: fade .35s ease both; }
        @keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .lift:active { transform: scale(0.98); }
        .lift { transition: transform .15s ease; }
        .tap { transition: background .15s ease, color .15s ease, border-color .15s ease, transform .12s ease; }
        .tap:active { transform: translateY(1px); }
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { scrollbar-width: none; }
        .desktop-only { display: none; }
        @media (max-width: 420px) {
          .home-core-grid { gap: 6px !important; }
          .home-core-grid button { padding-left: 8px !important; padding-right: 8px !important; }
        }
        @media (min-width: 980px) {
          .desktop-only { display: inline-flex; }
          .app-shell { padding-bottom: 28px !important; }
          .app-main { max-width: 1120px !important; padding: 0 32px 32px 112px !important; }
          .app-main > .fadeIn:not(.home-shell) { max-width: 900px; margin-left: auto; margin-right: auto; }
          .topbar-inner { max-width: 1120px !important; padding-left: 94px; }
          .bottom-nav {
            top: 92px !important;
            bottom: auto !important;
            left: 24px !important;
            right: auto !important;
            width: 68px !important;
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 4px !important;
            padding: 8px !important;
            border: 1px solid ${C.line} !important;
            box-shadow: 0 10px 30px rgba(26,25,21,0.08);
          }
          .bottom-nav button {
            min-height: 58px !important;
            padding: 8px 4px !important;
          }
          .home-shell {
            display: grid;
            grid-template-columns: minmax(0, 1.16fr) minmax(320px, 0.84fr);
            gap: 18px;
            align-items: start;
          }
          .home-secondary {
            position: sticky;
            top: 86px;
          }
          .weak-board-grid {
            display: grid;
            grid-template-columns: 220px minmax(0, 1fr);
            gap: 12px;
            align-items: start;
          }
        }
      `}</style>
    </>
  );
  /* 마지막으로 서버에서 받은 기준 상태와 비교해 바뀐 최상위 필드만 저장한다. */
  const lastSavedRef = useRef({});
  const localStateRef = useRef({});
  const dirtyKeysRef = useRef(new Set());
  const loadedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const lastSavedAtRef = useRef(null);

  const currentState = {
    settings, logs, reviews, books, todos, tracks,
    materials, materialLog, examScores, rankScores, moods, trackInbox, parkingItems, schedules, checklists,
    mcqProgress, routines, routineLog, weeklyPlans, courses,
  };
  localStateRef.current = currentState;
  loadedRef.current = loaded;
  lastSavedAtRef.current = lastSavedAt;

  if (loaded && user && Object.keys(lastSavedRef.current).length > 0) {
    PERSISTED_STATE_KEYS.forEach(key => {
      if (currentState[key] !== lastSavedRef.current[key]) {
        dirtyKeysRef.current.add(key);
      }
    });
  }

  function applyAppState(nextState) {
    setSettings(nextState.settings);
    setLogs(nextState.logs); setReviews(nextState.reviews); setBooks(nextState.books);
    setTodos(nextState.todos); setTracks(nextState.tracks);
    setMaterials(nextState.materials); setMaterialLog(nextState.materialLog);
    setExamScores(nextState.examScores); setRankScores(nextState.rankScores);
    setMoods(nextState.moods); setTrackInbox(nextState.trackInbox); setParkingItems(nextState.parkingItems);
    setSchedules(nextState.schedules); setChecklists(nextState.checklists);
    setMcqProgress(nextState.mcqProgress); setRoutines(nextState.routines);
    setRoutineLog(nextState.routineLog); setWeeklyPlans(nextState.weeklyPlans);
    setCourses(nextState.courses);
  }

  // === 데이터 로드 (onSnapshot 실시간 동기화) ===
  useEffect(() => {
    if (!firebaseReady || !fbDB || !user) { setLoaded(false); return; }
    setLoaded(false);
    dirtyKeysRef.current.clear();
    lastSavedRef.current = {};
    setLastSavedAt(null);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    const ref = doc(fbDB, `users`, user.uid);

    const unsub = onSnapshot(ref,
      (snap) => {
        // 로컬 대기 스냅샷은 건너뛰고, 서버 확정 스냅샷은 기준 상태로 반영한다.
        if (snap.metadata.hasPendingWrites) return;
        if (snap.metadata.fromCache && loadedRef.current) {
          setSyncStatus(dirtyKeysRef.current.size > 0 ? `saving` : `saved`);
          return;
        }

        // 신규 사용자: 문서가 아직 없음 → 기본값으로 초기화
        if (!snap.exists()) {
          const draft = readLocalDraft(user.uid);
          if (draft) {
            const draftState = normalizeStoredState(draft);
            const blank = blankUserState();
            lastSavedRef.current = blank;
            dirtyKeysRef.current.clear();
            markDirtyDiff(dirtyKeysRef.current, draftState, blank);
            applyAppState(draftState);
            setLoaded(true);
            setLastSavedAt(null);
            setSyncStatus(`saving`);
            return;
          }
          const blank = blankUserState();
          lastSavedRef.current = blank;
          dirtyKeysRef.current.clear();
          applyAppState(blank);
          setLoaded(true);
          setLastSavedAt(null);
          setSyncStatus(`saved`);
          return;
        }

        const rawData = snap.data() || {};
        const newState = normalizeStoredState(rawData);
        const remoteUpdatedAt = rawData.updatedAt || null;
        const dirtyKeys = dirtyKeysRef.current;
        const hasLocalChanges = dirtyKeys.size > 0;

        if (!hasLocalChanges) {
          const draft = readLocalDraft(user.uid);
          if (shouldRestoreLocalDraft(draft, remoteUpdatedAt, newState)) {
            const draftState = normalizeStoredState(draft);
            lastSavedRef.current = newState;
            dirtyKeys.clear();
            markDirtyDiff(dirtyKeys, draftState, newState);
            applyAppState(draftState);
            setLoaded(true);
            setLastSavedAt(remoteUpdatedAt);
            setSyncStatus(`saving`);
            return;
          }
        }

        const stateForScreen = { ...newState };
        const stateForBaseline = { ...newState };

        if (hasLocalChanges) {
          dirtyKeys.forEach(key => {
            stateForScreen[key] = localStateRef.current[key];
            stateForBaseline[key] = lastSavedRef.current[key] ?? newState[key];
          });
        }

        lastSavedRef.current = stateForBaseline;
        applyAppState(stateForScreen);

        setLoaded(true);
        setLastSavedAt(remoteUpdatedAt);
        setSyncStatus(hasLocalChanges ? `saving` : `saved`);
      },
      (err) => {
        // alert 쓰지 말 것 — 모바일에서 무한 반복 가능
        console.error(`[snapshot error - 저장 차단됨]`, err);
        if (!loadedRef.current) {
          const draft = readLocalDraft(user.uid);
          if (draft) {
            const draftState = normalizeStoredState(draft);
            const blank = blankUserState();
            lastSavedRef.current = blank;
            dirtyKeysRef.current.clear();
            markDirtyDiff(dirtyKeysRef.current, draftState, blank);
            applyAppState(draftState);
            setLoaded(true);
            setLastSavedAt(draft.updatedAt || null);
          }
        }
        setSyncStatus(`error`);
      }
    );

    return () => unsub();
  }, [user]);

  // === 자동 저장 (debounced) — 변경된 필드만 patch로 ===
  useEffect(() => {
    if (!firebaseReady || !fbDB || !loaded || !user) return;

    setSyncStatus(`saving`);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      const stateAtSave = localStateRef.current;

      // 기준점과 비교해 바뀐 필드만 골라냄
      const patch = {};
      const changedKeys = [];
      PERSISTED_STATE_KEYS.forEach(key => {
        if (stateAtSave[key] !== lastSavedRef.current[key]) {
          patch[key] = stateAtSave[key];
          changedKeys.push(key);
          dirtyKeysRef.current.add(key);
        }
      });

      if (changedKeys.length === 0) {
        setSyncStatus(dirtyKeysRef.current.size > 0 ? `saving` : `saved`);
        return;
      }

      patch.schemaVersion = APP_SCHEMA_VERSION;
      patch.updatedAt = new Date().toISOString();

      const ok = await saveStateToFirestore(user.uid, patch);
      if (ok) {
        const nextBaseline = { ...lastSavedRef.current };
        changedKeys.forEach(key => {
          if (localStateRef.current[key] === stateAtSave[key]) {
            nextBaseline[key] = stateAtSave[key];
            dirtyKeysRef.current.delete(key);
          }
        });
        lastSavedRef.current = nextBaseline;
        setLastSavedAt(patch.updatedAt);
        writeLocalDraft(user.uid, localStateRef.current, patch.updatedAt);
        setSyncStatus(dirtyKeysRef.current.size > 0 ? `saving` : `saved`);
      } else {
        setSyncStatus(`error`);
        setTimeout(() => setSyncRetryTick(t => t + 1), 5000);
      }
    }, 2500);

    // 언마운트/로그아웃 시 대기 중인 저장 취소
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [user, loaded, syncRetryTick, settings, logs, reviews, books, todos, tracks, materials, materialLog, examScores, rankScores, moods, trackInbox, parkingItems, schedules, checklists, mcqProgress, routines, routineLog, weeklyPlans, courses]);

  useEffect(() => {
    if (!loaded || !user) return;
    writeLocalDraft(user.uid, localStateRef.current);
  }, [user, loaded, settings, logs, reviews, books, todos, tracks, materials, materialLog, examScores, rankScores, moods, trackInbox, parkingItems, schedules, checklists, mcqProgress, routines, routineLog, weeklyPlans, courses]);
  // 모의고사 리뷰 자동 생성 방어
  useEffect(() => {
    if (!loaded || !settings.autoGenMockReview) return;
    const validMockIds = new Set((settings.mockExams || []).map(m => m.id));
    setTodos(prev => {
      let next = {};
      
      const liveSentinels = new Set((settings.mockExams || []).map(m => `__mockreview__${m.id}`));
      Object.keys(prev).forEach(date => {
        const filtered = (prev[date] || []).filter(t => {
          if (t.fromMock && !validMockIds.has(t.fromMock)) return false;
          if (typeof t.title === `string` && t.title.startsWith(`__mockreview__`) && !liveSentinels.has(t.title)) return false;
          return true;
        });
        if (filtered.length > 0) next[date] = filtered;
      });

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
            next = { ...next, [targetDate]: [...list, { id: uid(), title: tmpl.title, done: false, fromMock: m.id }] };
          }
        });
        next = { ...next, [sentinelDate]: [...(next[sentinelDate] || []), { id: uid(), title: sentinelMark, done: true, hidden: true }] };
      });

      // [핵심] 변경된 내용이 없으면 기존 객체를 그대로 리턴해서 불필요한 저장을 막음
      if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
      return next;
    });
  }, [loaded, settings.mockExams, settings.autoGenMockReview, today]);

  // 체크리스트(D-3, D-1) 자동 생성 방어
  useEffect(() => {
    if (!loaded || !settings.examDate || !checklists?.length) return;
    setTodos(prev => {
      const currentSentinelMark = `__checklist_premium__${settings.examDate}`;
      let next = {};
      
      Object.keys(prev).forEach(date => {
        const filtered = (prev[date] || []).filter(t => {
          if (t.fromChecklist) return false;
          if (typeof t.title === `string` && t.title.startsWith(`__checklist_premium__`)) return false;
          return true;
        });
        if (filtered.length > 0) next[date] = filtered;
      });
      
      [3, 1, 0].forEach(offset => {
        const targetDate = addDays(settings.examDate, -offset);
        const list = next[targetDate] || [];
        const title = offset === 0
          ? `체크리스트 일독 (시험 당일 아침)`
          : offset === 1
          ? `체크리스트 전체 회독 (D-1)`
          : `체크리스트 회독 + 우선순위 ★★★만 별도 정리 (D-3)`;
        next = { ...next, [targetDate]: [...list, { id: uid(), title, done: false, fromChecklist: true }] };
      });
      
      const sentinelList = next[settings.examDate] || [];
      next = { ...next, [settings.examDate]: [...sentinelList, { id: uid(), title: currentSentinelMark, done: true, hidden: true }] };
      
      // [핵심] 위와 동일하게 변경사항 없을 시 기존 래퍼런스 유지
      if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
      return next;
    });
  }, [loaded, settings.examDate]);

  const dday = useMemo(() => daysDiff(today, settings.examDate), [today, settings.examDate]);

  function applyImportedData(imported) {
    const data = asPlainObject(imported, null);
    if (!data) {
      alert(`JSON 파일 형식이 올바르지 않습니다.`);
      return;
    }
    if (!confirm(`JSON 백업을 현재 데이터 위에 복원할까요? 클라우드 데이터도 다음 자동 저장 때 갱신됩니다.`)) return;

    setSettings(normalizeSettings(data.settings));
    setLogs(asPlainObject(data.logs));
    setReviews(asArray(data.reviews));
    setBooks(asArray(data.books));
    setTodos(asPlainObject(data.todos));
    setTracks(asPlainObject(data.tracks));
    setMaterials(asArray(data.materials, DEFAULT_MATERIALS));
    setMaterialLog(asPlainObject(data.materialLog));
    setExamScores(asArray(data.examScores));
    setRankScores(asArray(data.rankScores));
    setMoods(asPlainObject(data.moods));
    setTrackInbox(asArray(data.trackInbox));
    setParkingItems(asArray(data.parkingItems));
    setSchedules(asArray(data.schedules));
    setChecklists(asArray(data.checklists, DEFAULT_CHECKLISTS));
    setMcqProgress(asPlainObject(data.mcqProgress));
    setRoutines(asArray(data.routines, DEFAULT_ROUTINES));
    setRoutineLog(asPlainObject(data.routineLog));
    setWeeklyPlans(asPlainObject(data.weeklyPlans));
    setCourses(asArray(data.courses));
    setSyncStatus(`saving`);
  }

  if (!firebaseReady) {
    const missingKeys = missingFirebaseEnvKeys.map(key => FIREBASE_ENV_LABELS[key] || key);
    const setupMessage = firebaseEnvReady
      ? `Firebase 초기화에 실패했습니다. Firebase 콘솔 설정과 승인된 도메인을 확인해주세요.`
      : `Vercel → Settings → Environment Variables 에 아래 값을 등록한 뒤 재배포하세요:`;

    return (
      <div style={{ minHeight:`100vh`, background:C.bg, display:`grid`, placeItems:`center`, padding:24, fontFamily:`Noto Sans KR, sans-serif` }}>
        {globalStyles}
        <div style={{ maxWidth:420, background:C.paper, border:`1px solid ${C.accent}`, padding:`20px 22px` }}>
          <div className={`kserif`} style={{ fontSize:11, letterSpacing:`0.22em`, color:C.accent, fontWeight:600, marginBottom:8 }}>SETUP REQUIRED</div>
          <div className={`serif`} style={{ fontSize:18, fontWeight:600, color:C.ink, marginBottom:10 }}>{firebaseEnvReady ? `Firebase 초기화에 실패했습니다` : `Firebase 환경변수가 설정되지 않았습니다`}</div>
          <div style={{ fontSize:12, color:C.muted, lineHeight:1.7 }}>
            {setupMessage}
            <pre style={{ background:C.bg, padding:`10px 12px`, marginTop:10, fontSize:10, fontFamily:`JetBrains Mono, monospace`, overflow:`auto` }}>{missingKeys.length ? missingKeys.join(`\n`) : `VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID`}</pre>
            {firebaseInitError && (
              <div className={`mono`} style={{ marginTop:8, fontSize:10, color:C.accent }}>
                {firebaseInitError.message || String(firebaseInitError)}
              </div>
            )}
            등록 후 반드시 Deployments → Redeploy 눌러주세요. 환경변수는 새 빌드에만 반영됩니다.
          </div>
        </div>
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div style={{ minHeight:`100vh`, background:C.bg, display:`grid`, placeItems:`center` }}>
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
      <div style={{ minHeight:`100vh`, background:C.bg, display:`grid`, placeItems:`center`, color:C.muted, fontFamily:`Noto Serif KR, serif` }}>
        {globalStyles}
        <div style={{ textAlign:`center` }}>
          <div className={`kserif`} style={{ fontSize:13, letterSpacing:`0.1em` }}>데이터 동기화 중…</div>
          <div className={`mono`} style={{ fontSize:10, marginTop:8, opacity:0.6 }}>{user.email}</div>
        </div>
      </div>
    );
  }

  const sharedProps = {
    today, settings, setSettings,
    logs, setLogs, reviews, setReviews, books, setBooks,
    todos, setTodos, tracks, setTracks,
    materials, setMaterials, materialLog, setMaterialLog,
    examScores, setExamScores, rankScores, setRankScores, moods, setMoods,
    trackInbox, setTrackInbox, parkingItems, setParkingItems,
    schedules, setSchedules,
    checklists, setChecklists,
    mcqProgress, setMcqProgress,
    routines, setRoutines,
    routineLog, setRoutineLog,
    weeklyPlans, setWeeklyPlans,
    courses, setCourses,
  };

  function snoozeFeatureIntro() {
    hideFeatureIntroForSevenDays(userId);
    setShowFeatureIntro(false);
  }

  return (
    <div className={`app-shell`} style={{ minHeight:`100vh`, background:C.bg, color:C.ink, paddingBottom:84, fontFamily:`Noto Sans KR, sans-serif` }}>
      {globalStyles}

      <TopBar
        dday={dday}
        examLabel={settings.examLabel}
        examDate={settings.examDate}
        user={user}
        syncStatus={syncStatus}
        lastSavedAt={lastSavedAt}
        onRetrySync={() => {
          setSyncStatus(`saving`);
          setSyncRetryTick(t => t + 1);
        }}
      />

      <main className={`app-main`} style={{ maxWidth:720, margin:`0 auto`, padding:`0 18px` }}>
        {view === `home` && <HomeView {...sharedProps} dday={dday} user={user} onGoTo={setView} />}
        {view === `log` && <LogView {...sharedProps} initialDate={today} />}
        {view === `calendar` && <CalendarView {...sharedProps} onGoToLog={() => setView(`log`)} />}
        {view === `courses` && <CoursesReview {...sharedProps} />}
        {view === `review` && <ReviewView {...sharedProps} />}
        {view === `more` && <MoreView onGoTo={setView} />}
        {view === `parking` && <ParkingLotView {...sharedProps} />}
        {view === `exams` && <ExamsView {...sharedProps} />}
        {view === `check` && <ChecklistView {...sharedProps} />}
        {view === `report` && <ReportView {...sharedProps} />}
        {view === `settings` && (
          <SettingsView {...sharedProps}
            user={user}
            onLogout={async () => { await signOut(fbAuth); }}
            onReset={() => {
              if (confirm(`모든 데이터를 지울까요? (설정 포함) — 클라우드의 본인 데이터도 함께 초기화됩니다.`)) {
                setLogs({}); setReviews([]); setBooks([]); setTodos({});
                setTracks({}); setMaterials(DEFAULT_MATERIALS); setMaterialLog({});
                setExamScores([]); setRankScores([]); setMoods({}); setTrackInbox([]); setParkingItems([]); setSchedules([]); setChecklists(DEFAULT_CHECKLISTS); setSettings(DEFAULT_SETTINGS);
                setMcqProgress({}); setRoutines(DEFAULT_ROUTINES); setRoutineLog({});
                setWeeklyPlans({}); setCourses([]);
              }
            }}
            onExport={() => {
              const data = JSON.stringify({
                schemaVersion: APP_SCHEMA_VERSION,
                exportedAt: new Date().toISOString(),
                settings, logs, reviews, books, todos,
                tracks, materials, materialLog, examScores, rankScores, moods, trackInbox, parkingItems, schedules, checklists,
                mcqProgress, routines, routineLog, weeklyPlans, courses,
              }, null, 2);
              const blob = new Blob([data], { type: `application/json` });
              const url = URL.createObjectURL(blob);
              const a = document.createElement(`a`);
              a.href = url; a.download=`변시기록_${today}.json`; a.click();
              URL.revokeObjectURL(url);
            }}
            onImport={applyImportedData}
            onExportXLSX={async () => {
              try {
                await exportXLSX({
                  settings, logs, tracks, todos, examScores, rankScores,
                  materials, reviews, books, schedules, moods, trackInbox, parkingItems, checklists,
                  courses, weeklyPlans, routines, routineLog,
                }, `변시기록_${today.replaceAll( `-`, ``)}.xlsx`);
              } catch (e) {
                console.error(e);
                alert(`엑셀 내보내기 실패: ` + (e.message || e));
              }
            }}
          />
        )}
      </main>

      <BottomNav view={view} setView={setView} />
      {showFeatureIntro && (
        <FeatureIntroModal
          onClose={() => setShowFeatureIntro(false)}
          onSnooze={snoozeFeatureIntro}
        />
      )}
    </div>
  );
}

function FeatureIntroModal({ onClose, onSnooze }) {
  const features = [
    { title:`오늘 처리 홈`, body:`수강, 강의 복습, 회독, 기록, 밀린 일을 첫 화면에서 바로 확인합니다.` },
    { title:`강의 중심 기록`, body:`강의 목록과 진도, 어려움·판례·암기 태그를 핵심 흐름으로 관리합니다.` },
    { title:`청사객암보 인박스`, body:`강의 태그, 주간계획, 메모를 5트랙 후보로 모아 기록 탭에서 정리합니다.` },
    { title:`복습 큐`, body:`강의 복습과 주제 회독을 오늘 할 일로 모아 놓고 바로 완료 처리합니다.` },
    { title:`저장 상태`, body:`상단에서 저장 중, 저장됨, 저장 실패를 확인하고 필요할 때 재시도합니다.` },
  ];

  return (
    <div role="dialog" aria-modal="true" aria-label="기능 안내"
      style={{
        position:`fixed`,
        inset:0,
        zIndex:10000,
        background:`rgba(26,25,21,0.54)`,
        display:`grid`,
        placeItems:`center`,
        padding:`20px 16px`,
      }}>
      <section className={`fadeIn`}
        style={{
          width:`min(100%, 430px)`,
          background:C.paper,
          border:`1px solid ${C.line}`,
          boxShadow:`0 18px 48px rgba(26,25,21,0.24)`,
          padding:`18px`,
          color:C.ink,
        }}>
        <div style={{ display:`flex`, justifyContent:`space-between`, gap:12, alignItems:`flex-start`, marginBottom:12 }}>
          <div>
            <div className={`kserif`} style={{ fontSize:10, letterSpacing:`0.22em`, color:C.accent, fontWeight:700 }}>제작자</div>
            <h2 className={`serif`} style={{ margin:`3px 0 0`, fontSize:34, lineHeight:1, fontWeight:600 }}>owb</h2>
          </div>
          <button onClick={onClose} aria-label="닫기" className={`tap`}
            style={{
              width:34,
              height:34,
              border:`1px solid ${C.line}`,
              background:C.bg,
              display:`grid`,
              placeItems:`center`,
              cursor:`pointer`,
              flexShrink:0,
            }}>
            <X size={16} />
          </button>
        </div>

        <p style={{ margin:`0 0 14px`, color:C.muted, fontSize:12, lineHeight:1.7 }}>
          변시 기록장은 강의와 복습을 놓치지 않도록 오늘 할 일을 앞으로 꺼내는 방식으로 정리했습니다.
        </p>

        <div style={{ display:`grid`, gap:8, marginBottom:16 }}>
          {features.map((feature, idx) => (
            <div key={feature.title}
              style={{
                border:`1px solid ${C.lineSoft}`,
                background:idx === 0 ? C.bg : `rgba(244,238,225,0.46)`,
                padding:`10px 11px`,
                display:`grid`,
                gridTemplateColumns:`28px 1fr`,
                gap:9,
                alignItems:`start`,
              }}>
              <div className={`mono`}
                style={{
                  height:26,
                  border:`1px solid ${idx === 0 ? C.accent : C.line}`,
                  color:idx === 0 ? C.accent : C.muted,
                  display:`grid`,
                  placeItems:`center`,
                  fontSize:10,
                  fontWeight:700,
                  background:C.paper,
                }}>
                {idx + 1}
              </div>
              <div style={{ minWidth:0 }}>
                <div className={`kserif`} style={{ fontSize:13, fontWeight:700, color:C.ink }}>{feature.title}</div>
                <div style={{ fontSize:11, color:C.muted, lineHeight:1.55, marginTop:3 }}>{feature.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display:`grid`, gridTemplateColumns:`1fr auto`, gap:8 }}>
          <button onClick={onSnooze} className={`tap`}
            style={{
              border:`1px solid ${C.line}`,
              background:C.bg,
              color:C.muted,
              padding:`12px 10px`,
              fontSize:12,
              fontWeight:600,
              cursor:`pointer`,
            }}>
            7일간 보지 않기
          </button>
          <button onClick={onClose} className={`tap`}
            style={{
              border:`1px solid ${C.ink}`,
              background:C.ink,
              color:`#fff`,
              padding:`12px 16px`,
              fontSize:12,
              fontWeight:700,
              cursor:`pointer`,
            }}>
            확인
          </button>
        </div>
      </section>
    </div>
  );
}

/* ============================================================ LOGIN ============================================================ */

function LoginView() {
  const [error, setError] = useState(``);
  const [signing, setSigning] = useState(false);

  async function loginGoogle() {
    setError(``); setSigning(true);
    if (!firebaseReady || !fbAuth || !googleProvider) {
      setError(`Firebase 설정이 완료되지 않았습니다. Vercel 환경변수와 승인된 도메인을 확인해주세요.`);
      setSigning(false);
      return;
    }
    try {
      await signInWithPopup(fbAuth, googleProvider);
    } catch (e) {
      console.error(e);
      if (e.code === `auth/unauthorized-domain`) {
        setError(`이 도메인은 Firebase에 등록되어 있지 않습니다. Firebase 콘솔 → Authentication → Settings → 승인된 도메인에 현재 주소를 추가해주세요.`);
      } else if (e.code === `auth/popup-blocked`) {
        setError(`팝업이 차단되었습니다. 브라우저 설정을 확인해주세요.`);
      } else if (e.code === `auth/popup-closed-by-user` || e.code === `auth/cancelled-popup-request`) {
        setError(``);
      } else {
        setError(`로그인 실패: ${e.code || e.message}`);
      }
    } finally {
      setSigning(false);
    }
  }

  return (
    <div style={{ minHeight:`100vh`, background:C.bg, display:`grid`, placeItems:`center`, padding:`30px 24px`, fontFamily:`Noto Sans KR, sans-serif` }}>
      <div style={{ maxWidth:380, width:`100%`, textAlign:`center` }}>
        <div className={`kserif`} style={{ fontSize:11, letterSpacing:`0.28em`, color:C.muted, textTransform:`uppercase`, marginBottom:14 }}>BAR EXAM JOURNAL</div>
        <h1 className={`serif`} style={{ fontSize:34, fontWeight:600, color:C.ink, margin:`0 0 10px`, letterSpacing:`-0.01em` }}>변호사시험 학습 기록장</h1>
        <p style={{ fontSize:13, color:C.muted, lineHeight:1.7, margin:`0 0 36px` }}>
          시간 / 회독 / 사이클 / 모의고사를 한 곳에서.<br/>
          기록은 본인 Google 계정으로 클라우드에 저장됩니다.
        </p>

        <button onClick={loginGoogle} disabled={signing}
          style={{
            width:`100%`, background:C.ink, color:`#fff`, border:`none`,
            padding:`14px 16px`, cursor:`pointer`, fontSize:14, fontWeight:600,
            display:`flex`, alignItems:`center`, justifyContent:`center`, gap:10,
            opacity: signing ? 0.6 : 1,
          }}>
          <svg width={`18`} height={`18`} viewBox={`0 0 24 24`} fill={`none`}>
            <path fill={`#fff`} d={`M21.35 11.1h-9.17v2.92h5.5c-.25 1.39-.99 2.56-2.11 3.34v2.78h3.41c2-1.84 3.16-4.55 3.16-7.79 0-.5-.05-.99-.13-1.45l-.66-.04z`}/>
            <path fill={`#fff`} d={`M12.18 21.97c2.85 0 5.24-.94 6.99-2.55l-3.41-2.65c-.95.64-2.16 1.02-3.58 1.02-2.75 0-5.08-1.86-5.91-4.36H2.74v2.74C4.49 19.5 8.05 21.97 12.18 21.97z`}/>
            <path fill={`#fff`} d={`M6.27 13.43c-.21-.64-.33-1.31-.33-2 0-.69.13-1.36.33-2v-2.74H2.74C1.99 8.18 1.5 9.78 1.5 11.43c0 1.65.49 3.25 1.24 4.74l3.53-2.74z`}/>
            <path fill={`#fff`} d={`M12.18 5.07c1.55 0 2.93.53 4.03 1.58l3.02-3.02C17.42 1.84 15.03 1 12.18 1 8.05 1 4.49 3.47 2.74 7.69l3.53 2.74c.83-2.5 3.16-4.36 5.91-4.36z`}/>
          </svg>
          {signing ? `로그인 중…` : `Google로 로그인`}
        </button>

        {error && (
          <div style={{ marginTop:18, padding:`12px 14px`, background:`#fff`, border:`1px solid ${C.accent}`, color:C.accent, fontSize:11, lineHeight:1.6, textAlign:`left` }}>
            {error}
          </div>
        )}

        <div style={{ marginTop:36, fontSize:10, color:C.muted, letterSpacing:`0.05em` }}>
          로그인하면 데이터가 본인 Google 계정과 연결되어<br/>모든 기기에서 동기화됩니다.
        </div>
      </div>
    </div>
  );
}

/* ============================================================ TOP BAR / NAV ============================================================ */

function TopBar({ dday, examLabel, examDate, user, syncStatus, lastSavedAt, onRetrySync }) {
  const overdue = dday < 0;
  const displayName = user?.displayName || user?.email?.split(`@`)[0] || `사용자`;
  const savedAtText = fmtSavedAt(lastSavedAt);
  const syncMeta = {
    saving: { label: `저장 중`, color: C.muted, Icon: Cloud },
    saved: { label: savedAtText ? `저장됨 ${savedAtText}` : `저장됨`, color: C.good, Icon: Cloud },
    error: { label: `저장 실패`, color: C.accent, Icon: CloudOff },
  }[syncStatus];
  const SyncIcon = syncMeta?.Icon;
  return (
    <header style={{ position:`sticky`, top:0, zIndex:9998, borderBottom:`1px solid ${C.line}`, background:`rgba(251,247,236,0.96)`, backdropFilter:`blur(10px)`, padding:`12px 18px 11px` }}>
      <div className={`topbar-inner`} style={{ maxWidth:720, margin:`0 auto`, display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:12 }}>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ display:`flex`, alignItems:`center`, gap:6, minWidth:0, flexWrap:`wrap` }}>
            <div className={`kserif`} style={{ fontSize:10, letterSpacing:`0.18em`, color:C.muted, textTransform:`uppercase`, minWidth:0, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>BAR EXAM JOURNAL · {displayName}</div>
            {syncMeta && (
              <span style={{
                border:`1px solid ${syncMeta.color}`,
                background: syncStatus === `saved` ? `rgba(60,90,58,0.08)` : syncStatus === `error` ? `rgba(122,30,30,0.08)` : C.bg,
                color:syncMeta.color,
                padding:`2px 5px`,
                display:`inline-flex`,
                alignItems:`center`,
                gap:3,
                fontSize:9,
                lineHeight:1,
                flexShrink:0,
              }}>
                <SyncIcon size={10} /> {syncMeta.label}
              </span>
            )}
            {syncStatus === `error` && (
              <button onClick={onRetrySync}
                style={{ background:C.accent, color:`#fff`, border:`none`, padding:`3px 6px`, fontSize:9, lineHeight:1, cursor:`pointer`, flexShrink:0 }}>
                재시도
              </button>
            )}
          </div>
          <div className={`kserif`} style={{ fontSize:15, fontWeight:600, marginTop:4, color:C.ink, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{examLabel}</div>
        </div>
        <div style={{ textAlign:`right`, flexShrink:0 }}>
          <div className={`serif`} style={{ fontSize:30, fontWeight:600, lineHeight:1, color: overdue ? C.muted : C.accent }}>
            D{overdue ? `+` : `−`}{Math.abs(dday)}
          </div>
          <div className={`mono`} style={{ fontSize:10, color:C.muted, marginTop:3, letterSpacing:`0.05em` }}>{examDate.replaceAll(`-`,`.`)}</div>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ view, setView }) {
  const moreViews = [`exams`, `check`, `report`, `parking`, `settings`];
  const items = [
    { key:`home`, icon:Home, label:`홈` },
    { key:`log`, icon:BookOpen, label:`기록` },
    { key:`calendar`, icon:CalendarIcon, label:`캘린더` },
    { key:`courses`, icon:FileText, label:`강의` },
    { key:`review`, icon:RotateCw, label:`회독` },
    { key:`more`, icon:MoreHorizontal, label:`더보기` },
  ];
  return (
    <nav className={`bottom-nav`} style={{
      position: `fixed`, left: 0, right: 0, bottom: 0,
      background: C.paper, borderTop: `1px solid ${C.line}`,
      display: `grid`, gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      // ↓ 변경: 최하단 여백 및 iOS/모바일 렌더링 버그 고정 옵션
      padding:`5px 4px max(env(safe-area-inset-bottom, 0px), 8px)`,
      zIndex: 9999,
      WebkitTransform: `translateZ(0)`, 
    }}>
      {items.map(it => {
        const active = view === it.key || (it.key === `more` && moreViews.includes(view));
        const Icon = it.icon;
        return (
          <button key={it.key} onClick={() => setView(it.key)} className={`tap`}
            style={{
              background: active ? C.bg : `transparent`, border:`1px solid ${active ? C.lineSoft : `transparent`}`, padding:`7px 0 6px`,
              color: active ? C.accent : C.muted,
              display:`flex`, flexDirection:`column`, alignItems:`center`, gap:2,
              cursor:`pointer`, position:`relative`, minHeight:48,
            }}>
            <Icon size={17} strokeWidth={active ? 2.2 : 1.6} />
            <span className={`kserif`} style={{ fontSize:9, letterSpacing:0, fontWeight: active ? 600 : 400 }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function MoreView({ onGoTo }) {
  const items = [
    { key:`exams`, icon:TrendingUp, label:`기출`, desc:`선택형·사례형 점수` },
    { key:`check`, icon:CheckSquare, label:`체크`, desc:`시험 전 확인 목록` },
    { key:`report`, icon:BarChart3, label:`리포트`, desc:`시간·진도 통계` },
    { key:`parking`, icon:Layers, label:`버릴 목록`, desc:`안 할 것·후순위 수납` },
    { key:`settings`, icon:SettingsIcon, label:`설정`, desc:`동기화·백업·시험일` },
  ];

  return (
    <div className={`fadeIn`} style={{ padding:`20px 0 24px` }}>
      <div style={{ marginBottom:16 }}>
        <h1 className={`serif`} style={{ margin:0, fontSize:30, fontWeight:600, color:C.ink }}>더보기</h1>
      </div>
      <div style={{ display:`grid`, gridTemplateColumns:`repeat(2, minmax(0, 1fr))`, gap:10 }}>
        {items.map(it => {
          const Icon = it.icon;
          return (
            <button key={it.key} onClick={() => onGoTo(it.key)}
              style={{
                background:C.paper,
                border:`1px solid ${C.line}`,
                padding:`15px 14px`,
                textAlign:`left`,
                cursor:`pointer`,
                minHeight:92,
                display:`flex`,
                flexDirection:`column`,
                justifyContent:`space-between`,
                gap:12,
              }}>
              <Icon size={18} color={C.accent} />
              <div>
                <div className={`kserif`} style={{ fontSize:14, fontWeight:600, color:C.ink }}>{it.label}</div>
                <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>{it.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ParkingLotView({ parkingItems = [], setParkingItems, today }) {
  const [title, setTitle] = useState(``);
  const [bucket, setBucket] = useState(`drop`);
  const [note, setNote] = useState(``);

  function addItem() {
    const text = title.trim();
    if (!text || !setParkingItems) return;
    setParkingItems([
      {
        id: uid(),
        title: text,
        bucket,
        note: note.trim(),
        createdAt: today || todayISO(),
        updatedAt: today || todayISO(),
      },
      ...(parkingItems || []),
    ]);
    setTitle(``);
    setNote(``);
  }

  function updateItem(id, patch) {
    if (!setParkingItems) return;
    setParkingItems((parkingItems || []).map(item => item.id === id ? {
      ...item,
      ...patch,
      updatedAt: today || todayISO(),
    } : item));
  }

  function deleteItem(id) {
    if (!setParkingItems) return;
    setParkingItems((parkingItems || []).filter(item => item.id !== id));
  }

  const total = (parkingItems || []).length;

  return (
    <div className={`fadeIn`} style={{ padding:`18px 0 24px` }}>
      <div style={{ marginBottom:16 }}>
        <h1 className={`serif`} style={{ margin:0, fontSize:22, fontWeight:600 }}>버릴 목록</h1>
        <div style={{ fontSize:11, color:C.muted, marginTop:3, lineHeight:1.5 }}>
          지금 안 할 것을 밖으로 빼두면 오늘 계획이 훨씬 조용해집니다.
        </div>
      </div>

      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:14 }}>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder={`버릴 것, 미룰 것, 시험 후로 보낼 것`}
          style={{ width:`100%`, background:C.bg, border:`1px solid ${C.line}`, padding:`8px 10px`, fontSize:12, marginBottom:8, outline:`none` }} />
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          placeholder={`이유나 다시 볼 조건`}
          style={{ width:`100%`, background:C.bg, border:`1px solid ${C.line}`, padding:`8px 10px`, fontSize:11, marginBottom:8, outline:`none`, resize:`vertical`, fontFamily:`Noto Serif KR, serif` }} />
        <div style={{ display:`flex`, gap:6 }}>
          {PARKING_BUCKETS.map(b => (
            <button key={b.key} onClick={() => setBucket(b.key)} className={`tap`}
              style={{
                flex:1,
                background:bucket === b.key ? b.color : C.bg,
                color:bucket === b.key ? `#fff` : C.muted,
                border:`1px solid ${bucket === b.key ? b.color : C.lineSoft}`,
                padding:`7px 4px`,
                fontSize:10,
                cursor:`pointer`,
              }}>
              {b.label}
            </button>
          ))}
          <button onClick={addItem} disabled={!title.trim()} className={`tap`}
            style={{ background:title.trim() ? C.ink : C.line, color:`#fff`, border:`none`, padding:`7px 10px`, fontSize:11, fontWeight:700, cursor:title.trim() ? `pointer` : `default`, flexShrink:0 }}>
            추가
          </button>
        </div>
      </div>

      <div style={{ display:`grid`, gridTemplateColumns:`repeat(3, minmax(0, 1fr))`, gap:6, marginBottom:12 }}>
        {PARKING_BUCKETS.map(b => {
          const count = (parkingItems || []).filter(item => (item.bucket || `drop`) === b.key).length;
          return <CourseMiniStat key={b.key} label={b.label} value={count} tone={count > 0 ? b.color : C.muted} />;
        })}
      </div>

      {total === 0 ? (
        <div style={{ textAlign:`center`, padding:28, color:C.muted, fontSize:12, background:C.paper, border:`1px dashed ${C.line}` }}>
          아직 수납한 항목이 없습니다.
        </div>
      ) : (
        <div style={{ display:`flex`, flexDirection:`column`, gap:12 }}>
          {PARKING_BUCKETS.map(b => {
            const items = (parkingItems || []).filter(item => (item.bucket || `drop`) === b.key);
            if (items.length === 0) return null;
            return (
              <section key={b.key}>
                <SectionTitle>{b.label}</SectionTitle>
                <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`4px 12px` }}>
                  {items.map((item, idx) => (
                    <div key={item.id} style={{ display:`grid`, gridTemplateColumns:`1fr 92px auto`, gap:6, alignItems:`center`, padding:`9px 0`, borderBottom:idx < items.length - 1 ? `1px dashed ${C.lineSoft}` : `none` }}>
                      <div style={{ minWidth:0 }}>
                        <input value={item.title || ``} onChange={e => updateItem(item.id, { title:e.target.value })}
                          style={{ width:`100%`, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`6px 8px`, outline:`none`, fontSize:11, color:C.ink }} />
                        <input value={item.note || ``} onChange={e => updateItem(item.id, { note:e.target.value })}
                          placeholder={`메모`}
                          style={{ width:`100%`, background:`transparent`, border:`none`, borderBottom:`1px solid ${C.lineSoft}`, padding:`5px 2px 3px`, outline:`none`, fontSize:10, color:C.muted, marginTop:3 }} />
                      </div>
                      <select value={item.bucket || `drop`} onChange={e => updateItem(item.id, { bucket:e.target.value })}
                        style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`7px 4px`, fontSize:10, outline:`none`, color:b.color }}>
                        {PARKING_BUCKETS.map(next => <option key={next.key} value={next.key}>{next.label}</option>)}
                      </select>
                      <button onClick={() => deleteItem(item.id)} className={`tap`} title={`삭제`}
                        style={{ background:C.bg, color:C.muted, border:`1px solid ${C.lineSoft}`, width:32, height:32, display:`grid`, placeItems:`center`, cursor:`pointer` }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================ COMMON ============================================================ */

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`12px 12px 14px`, display:`flex`, flexDirection:`column`, gap:6 }}>
      <Icon size={14} color={color || C.muted} strokeWidth={1.5} />
      <div className={`serif`} style={{ fontSize:20, fontWeight:600, color:C.ink, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:10, color:C.muted }}>{label}</div>
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display:`flex`, alignItems:`baseline`, justifyContent:`space-between`, marginBottom:10 }}>
      <h2 className={`kserif`} style={{ margin:0, fontSize:11, letterSpacing:`0.24em`, color:C.muted, textTransform:`uppercase`, fontWeight:600 }}>{children}</h2>
      {action && (
        <button onClick={action.onClick} style={{ background:`none`, border:`none`, color:C.accent, fontSize:11, cursor:`pointer`, letterSpacing:`0.05em` }}>
          {action.label} ›
        </button>
      )}
    </div>
  );
}

function CycleCard({ info, today, withMinor = true }) {
  if (!info) return null;
  const subColor = SUBJECTS[info.subject].color;
  const isMinSubj = info.subject === `민사법`;
  return (
    <div style={{
      background: subColor, color: `#fff`,
      padding: `16px 18px`, position: `relative`, overflow:`hidden`,
      border: `1px solid ${subColor}`,
    }}>
      <div style={{ position:`absolute`, right: -20, top: -10, opacity:0.12, fontSize:120, fontWeight:700, fontFamily:`Fraunces, serif`, lineHeight:1 }}>
        {SUBJECTS[info.subject].short}
      </div>
      <div style={{ position:`relative` }}>
        <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`flex-start`, gap:8 }}>
          <div className={`kserif`} style={{ fontSize:10, letterSpacing:`0.22em`, opacity:0.85, fontWeight:500 }}>오늘의 사이클</div>
          {info.anchorLabel && (
            <div className={`mono`} style={{ fontSize:10, opacity:0.85, letterSpacing:`0.03em` }}>
              {info.anchorLabel} D-{info.daysToAnchor}
            </div>
          )}
        </div>
        <div style={{ display:`flex`, alignItems:`baseline`, gap:10, marginTop:6 }}>
          <div className={`serif`} style={{ fontSize:26, fontWeight:600, letterSpacing:`-0.01em` }}>
            {info.subject}{isMinSubj && withMinor && <span style={{ fontSize:13, opacity:0.85, marginLeft:6 }}>+ 선택법</span>}
          </div>
        </div>
        <div style={{ marginTop:8, display:`flex`, alignItems:`center`, gap:8, fontSize:12, flexWrap:`wrap` }}>
          <span style={{ background:`rgba(255,255,255,0.18)`, padding:`2px 7px`, fontFamily:`Noto Serif KR, serif`, fontWeight:600, letterSpacing:`0.05em` }}>
            {info.cycleLabel}
          </span>
          <span className={`mono`} style={{ opacity:0.9 }}>블록 {info.dayInBlock}/{info.blockDays}일</span>
        </div>
        <div style={{ marginTop:10, height:3, background:`rgba(255,255,255,0.2)`, position:`relative` }}>
          <div style={{ position:`absolute`, left:0, top:0, bottom:0, width: `${(info.dayInBlock / info.blockDays) * 100}%`, background:`#fff` }} />
        </div>
      </div>
    </div>
  );
}

function PrevScoreCard({ scores }) {
  const [open, setOpen] = useState(false);
  if (!scores) return null;
  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, marginBottom:16 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width:`100%`, background:`none`, border:`none`, padding:`14px 16px`, display:`flex`, justifyContent:`space-between`, alignItems:`center`, cursor:`pointer` }}>
        <div style={{ textAlign:`left` }}>
          <div className={`kserif`} style={{ fontSize:11, letterSpacing:`0.22em`, color:C.muted, fontWeight:600 }}>15회 변시 기준점</div>
          <div className={`serif`} style={{ fontSize:22, fontWeight:600, color:C.ink, marginTop:4 }}>
            {scores.grandTotal.toFixed(2)}
            <span style={{ fontSize:12, color:C.muted, marginLeft:6, fontWeight:400 }}>/ {scores.grandMax}</span>
          </div>
        </div>
        <ChevronDown size={18} color={C.muted} style={{ transform: open ? `rotate(180deg)` : `none`, transition:`transform .2s` }} />
      </button>
      {open && (
        <div style={{ borderTop:`1px dashed ${C.lineSoft}`, padding:`14px 16px 18px`, fontSize:12 }}>
          {Object.keys(SUBJECTS).map(sub => {
            const s = scores[sub];
            if (!s) return null;
            const pct = Math.round((s.total / s.max) * 100);
            return (
              <div key={sub} style={{ marginBottom:12 }}>
                <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`baseline`, marginBottom:4 }}>
                  <span className={`kserif`} style={{ fontWeight:600, color:SUBJECTS[sub].color }}>{sub}</span>
                  <span className={`mono`} style={{ color:C.muted, fontSize:11 }}>{s.total.toFixed(2)} / {s.max} ({pct}%)</span>
                </div>
                <div style={{ height:3, background:C.lineSoft, position:`relative`, marginBottom:6 }}>
                  <div style={{ position:`absolute`, left:0, top:0, bottom:0, width:`${pct}%`, background:SUBJECTS[sub].color }} />
                </div>
                <div style={{ display:`flex`, flexWrap:`wrap`, gap:10, fontSize:10, color:C.muted }}>
                  {getStudyTypes(sub).map(t => {
                    const v = s[t.key]; if (v === undefined) return null;
                    return <span key={t.key} className={`mono`}><span style={{ color:C.muted }}>{t.label}</span> <span style={{ color:C.ink }}>{v.toFixed(2)}</span></span>;
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

/* ============================================================ WEEKLY PLAN (주간계획 · 과목별 메모) ============================================================ */

function WeeklyPlanCard({ today, weeklyPlans, setWeeklyPlans, defaultOpen = true }) {
  const weekStart = weekStartOf(today);
  const plan = weeklyPlans[weekStart] || {};
  const [open, setOpen] = useState(defaultOpen);
  const [drafts, setDrafts] = useState(() => cleanWeeklyPlan(plan));
  const [parseOpen, setParseOpen] = useState(false);
  const [parseText, setParseText] = useState(``);

  // 주가 바뀌면 draft도 갱신
  useEffect(() => { setDrafts(cleanWeeklyPlan(weeklyPlans[weekStart] || {})); }, [weekStart, weeklyPlans]);

  const dates = useMemo(() => weekDays(weekStart), [weekStart]);
  const dayPlans = getWeeklyDayPlans(drafts);
  const parsedDays = useMemo(() => parseWeeklyDayText(parseText, weekStart), [parseText, weekStart]);
  const parsedCount = Object.keys(parsedDays).length;

  function savePlan(nextPlan) {
    const cleaned = cleanWeeklyPlan(nextPlan);
    const next = { ...weeklyPlans };
    if (Object.keys(cleaned).length === 0) delete next[weekStart];
    else next[weekStart] = cleaned;
    setWeeklyPlans(next);
    setDrafts(cleaned);
  }

  function commit(sub, val) {
    savePlan({ ...drafts, [sub]: val || `` });
  }

  function commitDay(date, val) {
    savePlan({
      ...drafts,
      _days: { ...getWeeklyDayPlans(drafts), [date]: val || `` },
    });
  }

  function applyParsedDays(mode = `append`) {
    if (parsedCount === 0) {
      alert(`읽을 수 있는 요일 계획이 없습니다. 예: 월 민법 사례 2문`);
      return;
    }

    const baseDays = mode === `replace` ? {} : getWeeklyDayPlans(drafts);
    const nextDays = { ...baseDays };
    Object.entries(parsedDays).forEach(([date, value]) => {
      const v = (value || ``).trim();
      if (!v) return;
      nextDays[date] = mode === `append` && nextDays[date]
        ? `${nextDays[date]}\n${v}`
        : v;
    });
    savePlan({ ...drafts, _days: nextDays });
    setParseText(``);
    setParseOpen(false);
  }

  const filledCount = Object.keys(SUBJECTS).filter(s => (drafts[s] || ``).trim()).length;
  const dayFilledCount = dates.filter(d => (dayPlans[d] || ``).trim()).length;

  return (
    <>
      <SectionTitle action={{ label: open ? `접기` : `펼치기`, onClick: () => setOpen(o => !o) }}>
        주간 계획 · {weekStart.slice(5)} ~ {addDays(weekStart, 6).slice(5)} (요일 {dayFilledCount}/7 · 과목 {filledCount}/4)
      </SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, marginBottom:22 }}>
        {open ? (
          <div style={{ padding:`10px 12px` }}>
            <div style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, marginBottom:12 }}>
              <button onClick={() => setParseOpen(v => !v)}
                style={{ width:`100%`, background:`transparent`, border:`none`, padding:`9px 10px`, cursor:`pointer`, display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:8, color:C.ink }}>
                <span className={`kserif`} style={{ fontSize:11, fontWeight:700, letterSpacing:`0.08em` }}>요일 계획 붙여넣기</span>
                <ChevronDown size={14} style={{ transform: parseOpen ? `rotate(180deg)` : `none`, transition:`transform .18s ease` }} />
              </button>
              {parseOpen && (
                <div style={{ padding:`0 10px 10px` }}>
                  <textarea value={parseText} onChange={e => setParseText(e.target.value)} rows={6}
                    placeholder={`요일별 계획을 줄마다 붙여넣으세요.\n\n예:\n월 민법 사례 2문 / 민소 암기장 30p\n화: 형소 강의 3강\n수 - 공법 기록형 목차\n금 모의고사 복습`}
                    style={{ width:`100%`, background:C.paper, border:`1px solid ${C.lineSoft}`, padding:`8px 9px`, fontSize:11, outline:`none`, resize:`vertical`, fontFamily:`Noto Serif KR, serif`, lineHeight:1.55, marginBottom:8 }} />
                  {parsedCount > 0 && (
                    <div style={{ border:`1px solid ${C.lineSoft}`, background:C.paper, padding:`7px 8px`, marginBottom:8 }}>
                      <div className={`mono`} style={{ fontSize:10, color:C.muted, marginBottom:5 }}>{parsedCount}일 인식</div>
                      {dates.filter(d => parsedDays[d]).map(d => {
                        const idx = dates.indexOf(d);
                        return (
                          <div key={d} style={{ display:`flex`, gap:7, fontSize:10.5, padding:`2px 0`, borderTop:`1px dashed ${C.lineSoft}` }}>
                            <span className={`kserif`} style={{ color:C.ink, fontWeight:700, minWidth:34 }}>{WEEKDAY_LABELS[idx]} {fmtShortDate(d)}</span>
                            <span style={{ color:C.muted, whiteSpace:`pre-wrap` }}>{parsedDays[d]}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`center`, gap:8, flexWrap:`wrap` }}>
                    <div style={{ fontSize:10, color:C.muted }}>같은 요일에 여러 줄이 있으면 줄바꿈으로 합쳐집니다.</div>
                    <div style={{ display:`flex`, gap:6 }}>
                      <button onClick={() => applyParsedDays(`replace`)} disabled={parsedCount === 0}
                        style={{ background:parsedCount ? C.paper : C.lineSoft, color:parsedCount ? C.accent : C.muted, border:`1px solid ${C.line}`, padding:`6px 9px`, fontSize:10.5, cursor:parsedCount ? `pointer` : `default` }}>
                        요일계획 덮어쓰기
                      </button>
                      <button onClick={() => applyParsedDays(`append`)} disabled={parsedCount === 0}
                        style={{ background:parsedCount ? C.ink : C.lineSoft, color:parsedCount ? `#fff` : C.muted, border:`none`, padding:`6px 10px`, fontSize:10.5, fontWeight:700, cursor:parsedCount ? `pointer` : `default`, display:`inline-flex`, alignItems:`center`, gap:5 }}>
                        <Plus size={12} /> 추가
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom:12 }}>
              <div className={`kserif`} style={{ fontSize:11, fontWeight:700, color:C.ink, marginBottom:7 }}>요일별 계획</div>
              <div style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`4px 10px` }}>
                {dates.map((d, i) => {
                  const active = d === today;
                  return (
                  <div key={d} style={{ display:`grid`, gridTemplateColumns:`72px 1fr`, gap:10, alignItems:`start`, padding:`7px 0`, borderTop:i === 0 ? `none` : `1px dashed ${C.lineSoft}` }}>
                    <div style={{ display:`flex`, gap:6, alignItems:`baseline`, paddingTop:5 }}>
                      <span className={`kserif`} style={{ fontSize:11, color:active ? C.ink : C.muted, fontWeight:700 }}>{WEEKDAY_LABELS[i]}</span>
                      <span className={`mono`} style={{ fontSize:10, color:C.muted }}>{fmtShortDate(d)}</span>
                    </div>
                    <textarea
                      value={dayPlans[d] || ``}
                      onChange={e => setDrafts(prev => ({ ...prev, _days: { ...getWeeklyDayPlans(prev), [d]: e.target.value } }))}
                      onBlur={() => commitDay(d, getWeeklyDayPlans(drafts)[d])}
                      placeholder={`계획`}
                      rows={(dayPlans[d] || ``).includes(`\n`) ? 2 : 1}
                      style={{
                        width:`100%`, background:C.paper, border:`1px solid ${active ? C.line : C.lineSoft}`,
                        padding:`6px 7px`, fontSize:11, outline:`none`, resize:`vertical`,
                        fontFamily:`Noto Serif KR, serif`, lineHeight:1.45, minHeight:31,
                      }} />
                  </div>
                  );
                })}
              </div>
            </div>

            <div className={`kserif`} style={{ fontSize:11, fontWeight:700, color:C.ink, marginBottom:3 }}>과목별 메모</div>
            {Object.keys(SUBJECTS).map((sub, i) => (
              <div key={sub} style={{
                paddingTop: i === 0 ? 0 : 8, paddingBottom: 8,
                borderBottom: i < Object.keys(SUBJECTS).length - 1 ? `1px dashed ${C.lineSoft}` : `none`,
              }}>
                <div style={{ display:`flex`, alignItems:`center`, gap:6, marginBottom:4 }}>
                  <span style={{ width:3, height:12, background: SUBJECTS[sub].color }} />
                  <span className={`kserif`} style={{ fontSize:11, fontWeight:600, color: SUBJECTS[sub].color }}>{sub}</span>
                </div>
                <textarea
                  value={drafts[sub] || ``}
                  onChange={e => setDrafts({ ...drafts, [sub]: e.target.value })}
                  onBlur={() => commit(sub, drafts[sub])}
                  placeholder={`예: 청취 1회독 / 14회 객관식 / 사례집 50p`}
                  rows={2}
                  style={{
                    width:`100%`, background:C.bg, border:`1px solid ${C.lineSoft}`,
                    padding:`6px 8px`, fontSize:12, outline:`none`, resize:`vertical`,
                    fontFamily:`Noto Serif KR, serif`, lineHeight:1.5,
                  }} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding:`10px 14px`, fontSize:11, color:C.muted, lineHeight:1.6 }}>
            {filledCount === 0 && dayFilledCount === 0
              ? `이번 주 과목별 목표를 메모해 두면 흐름을 잡기 좋아요.`
              : (
                <>
                  {dates.filter(d => (dayPlans[d] || ``).trim()).map(d => {
                    const i = dates.indexOf(d);
                    return (
                      <div key={d} style={{ display:`flex`, gap:6, marginBottom:3 }}>
                        <span className={`kserif`} style={{ color:C.ink, fontWeight:600, minWidth:42, fontSize:11 }}>{WEEKDAY_LABELS[i]}</span>
                        <span style={{ color:C.ink, fontSize:11, flex:1, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{dayPlans[d]}</span>
                      </div>
                    );
                  })}
                  {Object.keys(SUBJECTS).filter(s => (drafts[s] || ``).trim()).map(s =>
                    <div key={s} style={{ display:`flex`, gap:6, marginBottom:3 }}>
                      <span className={`kserif`} style={{ color: SUBJECTS[s].color, fontWeight:600, minWidth:42, fontSize:11 }}>{s}</span>
                      <span style={{ color:C.ink, fontSize:11, flex:1, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{drafts[s]}</span>
                    </div>
                  )}
                </>
              )}
          </div>
        )}
      </div>
    </>
  );
}

/* ============================================================ HOME ============================================================ */

function HomeAction({ icon: Icon, label, value, sub, onClick, color = C.accent }) {
  return (
    <button onClick={onClick} className={`lift tap`}
      style={{
        background:C.paper,
        border:`1px solid ${C.line}`,
        padding:`12px 10px`,
        cursor:`pointer`,
        textAlign:`left`,
        minHeight:94,
        display:`flex`,
        flexDirection:`column`,
        justifyContent:`space-between`,
        gap:8,
      }}>
      <Icon size={16} color={color} />
      <div>
        <div className={`kserif`} style={{ fontSize:11, fontWeight:600, color:C.muted }}>{label}</div>
        <div className={`serif`} style={{ fontSize:19, fontWeight:600, color:C.ink, lineHeight:1.15, marginTop:3 }}>{value}</div>
        {sub && <div style={{ fontSize:9, color:C.muted, marginTop:4, whiteSpace:`nowrap`, overflow:`hidden`, textOverflow:`ellipsis` }}>{sub}</div>}
      </div>
    </button>
  );
}

function HomeWorkHeader({ dday, todayMinutes, tracksDone, inboxCount = 0, courseQueueSummary, dueReviews, todosOpen, planCount = 0, overdueTotal, onGoTo }) {
  const totalWork = courseQueueSummary.watch + courseQueueSummary.review + dueReviews.length + todosOpen + planCount;
  const tiles = [
    { label:`수강`, value:courseQueueSummary.watch, sub:`강의`, color:C.book, view:`courses` },
    { label:`복습`, value:courseQueueSummary.review, sub:`강의`, color:C.accent, view:`courses` },
    { label:`회독`, value:dueReviews.length, sub:`주제`, color:C.good, view:`review` },
    { label:`기록`, value:fmtMin(todayMinutes), sub:`계획 ${planCount} · 후보 ${inboxCount} · 트랙 ${tracksDone}/5`, color:C.ink, view:`log` },
    { label:`밀림`, value:overdueTotal, sub:`우선`, color:overdueTotal > 0 ? C.accent : C.muted, view: overdueTotal > 0 ? `review` : `calendar` },
  ];

  return (
    <section style={{ background:C.ink, color:`#fff`, border:`1px solid ${C.ink}`, padding:`16px 16px 14px`, marginBottom:12 }}>
      <div style={{ display:`flex`, alignItems:`flex-start`, justifyContent:`space-between`, gap:12, marginBottom:12 }}>
        <div style={{ minWidth:0 }}>
          <div className={`kserif`} style={{ fontSize:11, letterSpacing:`0.16em`, color:`rgba(255,255,255,0.7)`, fontWeight:600 }}>오늘 해야 할 것</div>
          <div className={`serif`} style={{ fontSize:28, fontWeight:600, marginTop:4, lineHeight:1 }}>
            {totalWork > 0 ? `${totalWork}개 처리` : `정리됨`}
          </div>
        </div>
        <div style={{ textAlign:`right`, flexShrink:0 }}>
          <div className={`mono`} style={{ fontSize:11, color:`rgba(255,255,255,0.68)` }}>시험까지</div>
          <div className={`serif`} style={{ fontSize:26, lineHeight:1, color:`#fff`, fontWeight:600 }}>
            D{dday < 0 ? `+` : `−`}{Math.abs(dday)}
          </div>
        </div>
      </div>

      <div style={{ display:`grid`, gridTemplateColumns:`repeat(5, minmax(0, 1fr))`, gap:5 }}>
        {tiles.map(tile => (
          <button key={tile.label} onClick={() => onGoTo(tile.view)} className={`tap`}
            style={{ background:`rgba(255,255,255,0.08)`, color:`#fff`, border:`1px solid rgba(255,255,255,0.12)`, minHeight:62, padding:`8px 4px`, cursor:`pointer`, textAlign:`center` }}>
            <div className={`kserif`} style={{ fontSize:10, color:`rgba(255,255,255,0.68)`, fontWeight:600 }}>{tile.label}</div>
            <div className={`mono`} style={{ fontSize: typeof tile.value === `number` ? 18 : 13, fontWeight:700, marginTop:5, color: tile.color === C.muted ? `rgba(255,255,255,0.55)` : `#fff`, whiteSpace:`nowrap`, overflow:`hidden`, textOverflow:`ellipsis` }}>
              {tile.value}
            </div>
            <div style={{ fontSize:9, color:`rgba(255,255,255,0.55)`, marginTop:3, whiteSpace:`nowrap`, overflow:`hidden`, textOverflow:`ellipsis` }}>{tile.sub}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function HomeCoursePaceStrip({ summary, onGoTo }) {
  const [open, setOpen] = useState(false);
  const active = summary?.active || [];
  if (active.length === 0) return null;

  const top = active[0];
  const statusMeta = {
    delayed: { label:`지연`, color:C.accent },
    caution: { label:`주의`, color:C.warn },
    onTrack: { label:`정상`, color:C.good },
    done: { label:`완강`, color:C.good },
  };
  const tone = summary.delayed > 0 ? C.accent : summary.caution > 0 ? C.warn : C.good;
  const headline = summary.delayed > 0
    ? `지연 ${summary.delayed}개`
    : summary.caution > 0
    ? `주의 ${summary.caution}개`
    : `정상`;
  const topEstimate = top.projectedEndDate
    ? `현재 속도면 ${fmtShortDate(top.projectedEndDate)} 완강`
    : `오늘 1강 시작 필요`;
  const topLag = top.plannedBehind > 0
    ? ` · 계획보다 ${top.plannedBehind}강 밀림`
    : top.lagDays > 0
    ? ` · 예상 ${top.lagDays}일 지연`
    : ``;

  return (
    <section style={{ background:C.paper, border:`1px solid ${C.line}`, marginBottom:10 }}>
      <button onClick={() => setOpen(o => !o)} className={`tap`}
        style={{
          width:`100%`,
          background:`transparent`,
          border:`none`,
          padding:`10px 12px`,
          display:`flex`,
          alignItems:`center`,
          gap:10,
          cursor:`pointer`,
          textAlign:`left`,
        }}>
        <div style={{ width:3, alignSelf:`stretch`, background:tone, minHeight:34 }} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:`flex`, alignItems:`center`, gap:6, marginBottom:3 }}>
            <span className={`kserif`} style={{ fontSize:12, fontWeight:700, color:C.ink }}>강의 페이스</span>
            <span className={`mono`} style={{ fontSize:9, color:tone, border:`1px solid ${tone}`, padding:`1px 5px`, lineHeight:1.3 }}>
              {headline}
            </span>
          </div>
          <div style={{ fontSize:10, color:C.muted, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>
            <span style={{ color:C.ink, fontWeight:600 }}>{top.course.name}</span> · {topEstimate}{topLag}
          </div>
        </div>
        <ChevronDown size={14} color={C.muted} style={{ transform: open ? `rotate(180deg)` : `none`, transition:`transform .2s`, flexShrink:0 }} />
      </button>

      {open && (
        <div style={{ borderTop:`1px dashed ${C.lineSoft}`, padding:`2px 12px 11px 25px` }}>
          {active.slice(0, 5).map(item => {
            const meta = statusMeta[item.status] || statusMeta.onTrack;
            const pct = item.total ? Math.round((item.completed / item.total) * 100) : 0;
            const estimate = item.projectedEndDate ? fmtShortDate(item.projectedEndDate) : `계산 전`;
            return (
              <div key={item.course.id} style={{ padding:`8px 0`, borderBottom:`1px dashed ${C.lineSoft}` }}>
                <div style={{ display:`flex`, alignItems:`baseline`, justifyContent:`space-between`, gap:8 }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <span className={`kserif`} style={{ fontSize:11, fontWeight:700, color:C.ink, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap`, display:`block` }}>
                      {item.course.name}
                    </span>
                    <span style={{ fontSize:9, color:C.muted }}>
                      목표 {fmtShortDate(item.targetEndDate)} · 예상 {estimate} · 하루 {item.requiredDailyCeil}강 필요
                    </span>
                  </div>
                  <span className={`mono`} style={{ fontSize:10, color:meta.color, fontWeight:700, flexShrink:0 }}>
                    {meta.label}
                  </span>
                </div>
                <div style={{ height:3, background:C.lineSoft, marginTop:6, position:`relative` }}>
                  <div style={{ position:`absolute`, left:0, top:0, bottom:0, width:`${pct}%`, background:meta.color }} />
                </div>
              </div>
            );
          })}
          <button onClick={() => onGoTo(`courses`)} className={`tap`}
            style={{ width:`100%`, marginTop:8, background:C.bg, border:`1px solid ${C.lineSoft}`, color:C.ink, padding:`7px 8px`, fontSize:10, cursor:`pointer` }}>
            강의에서 목표일 조정
          </button>
        </div>
      )}
    </section>
  );
}

function buildReviewDebtSummary({ courseQueueItems = [], dueReviews = [], today = todayISO() }) {
  const courseReviews = courseQueueItems.filter(item => item.type === `review`);
  const courseOverdue = courseReviews.filter(item => item.lecture.nextReviewDate && item.lecture.nextReviewDate < today).length;
  const topicOverdue = dueReviews.filter(r => r.dueDate && r.dueDate < today).length;
  const hardDue = courseReviews.filter(item => lectureHasTag(item.lecture, `hard`)).length;
  const repeatDue = courseReviews.filter(item => lectureHasTag(item.lecture, `again`)).length;
  const totalDue = courseReviews.length + dueReviews.length;
  const totalOverdue = courseOverdue + topicOverdue;
  const score = totalDue + totalOverdue * 1.7 + hardDue * 0.8 + repeatDue * 0.4;
  const pct = Math.min(100, Math.round(score * 6));
  const level = totalOverdue >= 8 || score >= 18 ? `danger` : totalOverdue >= 3 || score >= 10 ? `warning` : totalDue > 0 ? `active` : `clear`;
  const tone = level === `danger` ? C.accent : level === `warning` ? C.warn : level === `active` ? C.book : C.good;
  const label = level === `danger` ? `위험` : level === `warning` ? `주의` : level === `active` ? `처리` : `정리`;
  const headline = totalDue === 0
    ? `복습 부채 없음`
    : totalOverdue > 0
    ? `밀린 복습 ${totalOverdue}개`
    : `오늘 복습 ${totalDue}개`;
  const recommendation = totalDue === 0
    ? `오늘은 신규 수강이나 기록 정리에 힘을 실어도 됩니다.`
    : courseReviews.length >= dueReviews.length
    ? `강의복습 ${courseReviews.length}개를 먼저 줄이면 부채가 빨리 내려갑니다.`
    : `주제회독 ${dueReviews.length}개를 먼저 닫으면 흐름이 안정됩니다.`;

  return {
    courseDue: courseReviews.length,
    topicDue: dueReviews.length,
    courseOverdue,
    topicOverdue,
    hardDue,
    repeatDue,
    totalDue,
    totalOverdue,
    pct,
    level,
    tone,
    label,
    headline,
    recommendation,
  };
}

function HomeReviewDebtPanel({ summary, onGoTo }) {
  if (!summary || summary.totalDue === 0) return null;
  const stats = [
    { label:`강의`, value:summary.courseDue, color:C.accent, view:`courses` },
    { label:`주제`, value:summary.topicDue, color:C.good, view:`review` },
    { label:`밀림`, value:summary.totalOverdue, color:summary.totalOverdue > 0 ? C.accent : C.muted, view:summary.totalOverdue > 0 ? `review` : `courses` },
    { label:`어려움`, value:summary.hardDue, color:summary.hardDue > 0 ? C.warn : C.muted, view:`courses` },
  ];

  return (
    <section style={{ background:C.paper, border:`1px solid ${C.line}`, marginBottom:10, padding:`12px 13px` }}>
      <div style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:12, marginBottom:9 }}>
        <div style={{ minWidth:0 }}>
          <div style={{ display:`flex`, alignItems:`center`, gap:6, marginBottom:3 }}>
            <span className={`kserif`} style={{ fontSize:12, fontWeight:700, color:C.ink }}>복습 부채</span>
            <span className={`mono`} style={{ color:summary.tone, border:`1px solid ${summary.tone}`, padding:`1px 5px`, fontSize:9, fontWeight:700 }}>{summary.label}</span>
          </div>
          <div style={{ fontSize:10, color:C.muted, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{summary.recommendation}</div>
        </div>
        <button onClick={() => onGoTo(summary.courseDue >= summary.topicDue ? `courses` : `review`)} className={`tap`}
          style={{ background:summary.tone, color:`#fff`, border:`none`, padding:`7px 9px`, fontSize:10, cursor:`pointer`, flexShrink:0 }}>
          처리
        </button>
      </div>

      <div style={{ display:`flex`, alignItems:`center`, gap:10, marginBottom:9 }}>
        <div className={`serif`} style={{ fontSize:26, lineHeight:1, color:C.ink, fontWeight:600, minWidth:74 }}>{summary.headline}</div>
        <div style={{ flex:1, height:6, background:C.lineSoft, position:`relative`, overflow:`hidden` }}>
          <div style={{ position:`absolute`, left:0, top:0, bottom:0, width:`${summary.pct}%`, background:summary.tone }} />
        </div>
      </div>

      <div style={{ display:`grid`, gridTemplateColumns:`repeat(4, minmax(0, 1fr))`, gap:5 }}>
        {stats.map(stat => (
          <button key={stat.label} onClick={() => onGoTo(stat.view)} className={`tap`}
            style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`7px 4px`, textAlign:`center`, cursor:`pointer`, minHeight:48 }}>
            <div className={`mono`} style={{ color:stat.color, fontSize:15, fontWeight:700, lineHeight:1 }}>{stat.value}</div>
            <div className={`kserif`} style={{ color:C.muted, fontSize:9, marginTop:4 }}>{stat.label}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function HomeMinimumMode({ courseItems, reviews, planItems = [], todosOpen, staleChecklists, onGoTo, onCourseDone, onReviewDone }) {
  const picks = [];
  const pushPick = (pick) => {
    if (picks.length < 3 && pick) picks.push(pick);
  };

  const courseReview = courseItems.find(item => item.type === `review`);
  const courseWatch = courseItems.find(item => item.type === `watch`);
  pushPick(courseReview && {
    key:`course-review-${courseReview.course.id}-${courseReview.lecture.num}`,
    label:`강의복습`,
    title:`${courseReview.lecture.num}강 · ${courseReview.lecture.title}`,
    meta:courseReview.course.name,
    tone:C.accent,
    actionLabel:`완료`,
    onAction:() => onCourseDone(courseReview),
  });
  pushPick(reviews[0] && {
    key:`review-${reviews[0].id}`,
    label:`회독`,
    title:reviews[0].title,
    meta:`${reviews[0].subject} · ${reviews[0].roundNum || (reviews[0].cycleIndex || 0) + 1}회차`,
    tone:SUBJECTS[reviews[0].subject]?.color || C.good,
    actionLabel:`완료`,
    onAction:() => onReviewDone(reviews[0].id),
  });
  pushPick(planItems[0] && {
    key:`plan-${planItems[0].id}`,
    label:`계획`,
    title:planItems[0].title,
    meta:`주간계획에서 가져옴`,
    tone:C.ink,
    actionLabel:`기록`,
    onAction:() => onGoTo(`log`),
  });
  pushPick(courseWatch && {
    key:`course-watch-${courseWatch.course.id}-${courseWatch.lecture.num}`,
    label:`수강`,
    title:`${courseWatch.lecture.num}강 · ${courseWatch.lecture.title}`,
    meta:courseWatch.course.name,
    tone:SUBJECTS[courseWatch.course.subject]?.color || C.book,
    actionLabel:`완강`,
    onAction:() => onCourseDone(courseWatch),
  });
  pushPick(todosOpen > 0 && {
    key:`todo-minimum`,
    label:`일정`,
    title:`오늘 일정 ${todosOpen}개 확인`,
    meta:`캘린더에서 정리`,
    tone:C.warn,
    actionLabel:`이동`,
    onAction:() => onGoTo(`calendar`),
  });
  pushPick(staleChecklists[0] && {
    key:`check-minimum`,
    label:`점검`,
    title:staleChecklists[0].name,
    meta:`체크리스트 확인`,
    tone:staleChecklists[0].color || C.accent,
    actionLabel:`이동`,
    onAction:() => onGoTo(`check`),
  });

  if (picks.length === 0) return null;

  return (
    <section style={{ background:C.paper, border:`1px solid ${C.line}`, marginBottom:10 }}>
      <div style={{ padding:`11px 13px 9px`, borderBottom:`1px dashed ${C.lineSoft}`, display:`flex`, alignItems:`baseline`, justifyContent:`space-between`, gap:10 }}>
        <div>
          <div className={`kserif`} style={{ fontSize:12, fontWeight:700, color:C.ink }}>최소치 모드</div>
          <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>오늘은 이것만 해도 흐름 유지</div>
        </div>
        <span className={`mono`} style={{ fontSize:10, color:C.accent, fontWeight:700 }}>{picks.length}개</span>
      </div>
      <div style={{ display:`flex`, flexDirection:`column` }}>
        {picks.map((pick, idx) => (
          <div key={pick.key} style={{ display:`flex`, alignItems:`center`, gap:9, padding:`9px 12px`, borderBottom:idx < picks.length - 1 ? `1px dashed ${C.lineSoft}` : `none` }}>
            <span className={`kserif`} style={{ minWidth:42, color:pick.tone, fontSize:10, fontWeight:700 }}>{pick.label}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ color:C.ink, fontSize:11, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{pick.title}</div>
              <div style={{ color:C.muted, fontSize:9, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap`, marginTop:2 }}>{pick.meta}</div>
            </div>
            <button onClick={pick.onAction} className={`tap`}
              style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, color:C.ink, padding:`5px 8px`, minWidth:42, fontSize:9, cursor:`pointer`, flexShrink:0 }}>
              {pick.actionLabel}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function HomeRoutineShelf({ today, routines = [], routineLog = {}, setRoutineLog }) {
  const [open, setOpen] = useState(false);
  if (!routines.length) return null;

  const todayRoutines = routineLog[today] || {};
  const doneCount = routines.filter(r => todayRoutines[r.id]).length;
  const allDone = doneCount === routines.length;

  function toggleRoutine(id) {
    if (!setRoutineLog) return;
    setRoutineLog(prev => {
      const cur = prev[today] || {};
      const nextDay = { ...cur };
      if (nextDay[id]) delete nextDay[id]; else nextDay[id] = true;
      const next = { ...prev };
      if (Object.keys(nextDay).length === 0) delete next[today];
      else next[today] = nextDay;
      return next;
    });
  }

  return (
    <section style={{ background:C.paper, border:`1px solid ${C.line}`, marginBottom:10 }}>
      <button onClick={() => setOpen(o => !o)} className={`tap`}
        style={{ width:`100%`, background:`transparent`, border:`none`, padding:`10px 12px`, display:`flex`, alignItems:`center`, gap:10, cursor:`pointer`, textAlign:`left` }}>
        <div style={{ width:3, alignSelf:`stretch`, background:allDone ? C.good : C.line, minHeight:32 }} />
        <div style={{ flex:1, minWidth:0 }}>
          <div className={`kserif`} style={{ fontSize:12, fontWeight:700, color:C.ink }}>오늘 루틴</div>
          <div className={`mono`} style={{ fontSize:10, color:allDone ? C.good : C.muted, marginTop:2 }}>{doneCount}/{routines.length} 완료</div>
        </div>
        <ChevronDown size={14} color={C.muted} style={{ transform: open ? `rotate(180deg)` : `none`, transition:`transform .2s`, flexShrink:0 }} />
      </button>

      {open && (
        <div style={{ borderTop:`1px dashed ${C.lineSoft}`, padding:`9px 10px 10px`, display:`grid`, gridTemplateColumns:`repeat(${Math.min(routines.length, 6)}, minmax(0, 1fr))`, gap:6 }}>
          {routines.map(r => {
            const done = !!todayRoutines[r.id];
            return (
              <button key={r.id} onClick={() => toggleRoutine(r.id)} className={`tap`}
                style={{
                  background: done ? C.good : C.bg,
                  color: done ? `#fff` : C.muted,
                  border:`1px solid ${done ? C.good : C.lineSoft}`,
                  padding:`8px 4px`,
                  cursor:`pointer`,
                  minHeight:56,
                  display:`flex`,
                  flexDirection:`column`,
                  alignItems:`center`,
                  justifyContent:`center`,
                  gap:3,
                }}>
                <span style={{ fontSize:16, lineHeight:1 }}>{r.icon || `✓`}</span>
                <span className={`kserif`} style={{ fontSize:9, fontWeight:done ? 700 : 500, lineHeight:1.2, textAlign:`center`, overflow:`hidden`, textOverflow:`ellipsis`, maxWidth:`100%` }}>{r.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function HomeChecklistShelf({ staleChecklists = [], today, onGoTo }) {
  if (staleChecklists.length === 0) return null;
  const first = staleChecklists[0];
  const since = first.lastReviewed ? daysDiff(first.lastReviewed, today) : null;

  return (
    <button onClick={() => onGoTo(`check`)} className={`tap`}
      style={{
        width:`100%`,
        background:C.paper,
        border:`1px solid ${C.line}`,
        borderLeft:`3px solid ${first.color || C.accent}`,
        padding:`10px 12px`,
        marginBottom:18,
        display:`flex`,
        alignItems:`center`,
        justifyContent:`space-between`,
        gap:10,
        cursor:`pointer`,
        textAlign:`left`,
      }}>
      <div style={{ minWidth:0 }}>
        <div className={`kserif`} style={{ fontSize:12, fontWeight:700, color:C.ink }}>체크리스트 점검</div>
        <div style={{ fontSize:10, color:C.muted, marginTop:2, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>
          {first.name}{staleChecklists.length > 1 ? ` 외 ${staleChecklists.length - 1}개` : ``}
        </div>
      </div>
      <span className={`mono`} style={{ fontSize:10, color:C.accent, fontWeight:700, flexShrink:0 }}>
        {since === null ? `미회독` : `${since}일 전`}
      </span>
    </button>
  );
}

function HomeTodayPanel({ today, courseItems, reviews, planItems = [], todosOpen, setTrackInbox, onGoTo, onCourseDone, onReviewDone }) {
  const visibleCourses = courseItems.slice(0, 4);
  const visibleReviews = reviews.slice(0, 3);
  const visiblePlans = planItems.slice(0, 4);
  const empty = visibleCourses.length === 0 && visibleReviews.length === 0 && visiblePlans.length === 0 && todosOpen === 0;
  const hiddenCourseCount = Math.max(0, courseItems.length - visibleCourses.length);
  const hiddenPlanCount = Math.max(0, planItems.length - visiblePlans.length);
  const hiddenCount = hiddenCourseCount + hiddenPlanCount + Math.max(0, reviews.length - visibleReviews.length);

  function sendPlanToTrackInbox(item, trackKey) {
    if (!setTrackInbox || !item?.title) return;
    const inboxItem = buildTrackInboxItem({
      date: today,
      trackKey,
      text: item.title,
      source: `주간계획`,
      sourceId: `weekly-plan:${today}:${trackKey}:${item.id}`,
    });
    setTrackInbox(prev => enqueueTrackInbox(prev, inboxItem));
  }

  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`13px 14px`, marginBottom:18 }}>
      <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`center`, gap:8, marginBottom:10 }}>
        <div>
          <div className={`kserif`} style={{ fontSize:12, fontWeight:600, color:C.ink }}>오늘 처리</div>
          <div className={`mono`} style={{ fontSize:9, color:C.muted, marginTop:3 }}>
            계획 {planItems.length} · 강의 {courseItems.length} · 회독 {reviews.length} · 일정 {todosOpen}
          </div>
        </div>
        <div style={{ display:`flex`, gap:5, flexShrink:0 }}>
          <button onClick={() => onGoTo(`log`)} className={`tap`} style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, color:C.ink, fontSize:10, cursor:`pointer`, padding:`5px 7px` }}>
            계획
          </button>
          <button onClick={() => onGoTo(`courses`)} className={`tap`} style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, color:C.ink, fontSize:10, cursor:`pointer`, padding:`5px 7px` }}>
            강의
          </button>
          <button onClick={() => onGoTo(`review`)} className={`tap`} style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, color:C.ink, fontSize:10, cursor:`pointer`, padding:`5px 7px` }}>
            회독
          </button>
        </div>
      </div>

      {empty ? (
        <div style={{ fontSize:11, color:C.muted, padding:`8px 0` }}>오늘 바로 처리할 항목이 없습니다.</div>
      ) : (
        <div style={{ display:`flex`, flexDirection:`column`, gap:7 }}>
          {visiblePlans.map(item => (
            <div key={item.id} style={{ display:`flex`, alignItems:`center`, gap:7, borderBottom:`1px dashed ${C.lineSoft}`, paddingBottom:7, minHeight:42 }}>
              <span className={`kserif`} style={{ color:C.ink, fontSize:10, fontWeight:700, minWidth:28 }}>계획</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:C.ink, fontSize:11, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{item.title}</div>
                <div style={{ color:C.muted, fontSize:9 }}>주간계획 · {fmtShortDate(today)}</div>
              </div>
              <div style={{ display:`flex`, gap:3, flexShrink:0 }}>
                {TRACK_TYPES.map(track => (
                  <button key={track.key} title={`${track.label} 인박스에 담기`} onClick={() => sendPlanToTrackInbox(item, track.key)} className={`tap`}
                    style={{ background:C.bg, color:track.color, border:`1px solid ${C.lineSoft}`, width:26, height:26, display:`grid`, placeItems:`center`, fontSize:10, fontWeight:700, cursor:`pointer`, fontFamily:`Noto Serif KR, serif` }}>
                    {track.short}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {visibleCourses.map(item => {
            const subColor = SUBJECTS[item.course.subject]?.color || C.muted;
            const tags = getLectureTagLabels(item.lecture);
            return (
              <div key={`${item.type}-${item.course.id}-${item.lecture.num}`} style={{ display:`flex`, alignItems:`center`, gap:7, borderBottom:`1px dashed ${C.lineSoft}`, paddingBottom:7, minHeight:44 }}>
                <span className={`kserif`} style={{ color:item.type === `watch` ? subColor : C.accent, fontSize:10, fontWeight:600, minWidth:28 }}>{item.type === `watch` ? `수강` : `복습`}</span>
                <span className={`mono`} style={{ color:C.muted, fontSize:10, minWidth:30 }}>{item.lecture.num}강</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ color:C.ink, fontSize:11, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{item.lecture.title}</div>
                  <div style={{ color:C.muted, fontSize:9, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>
                    {item.course.name}{tags.length > 0 ? ` · ${tags.slice(0, 2).join(` · `)}` : ``}
                  </div>
                </div>
                <button onClick={() => onCourseDone(item)} className={`tap`}
                  style={{ background:item.type === `watch` ? C.bg : C.ink, color:item.type === `watch` ? C.ink : `#fff`, border:`1px solid ${item.type === `watch` ? C.line : C.ink}`, padding:`5px 8px`, minWidth:42, fontSize:9, cursor:`pointer`, flexShrink:0 }}>
                  {item.type === `watch` ? `완강` : `완료`}
                </button>
              </div>
            );
          })}

          {visibleReviews.map(r => (
            <div key={r.id} style={{ display:`flex`, alignItems:`center`, gap:7, borderBottom:`1px dashed ${C.lineSoft}`, paddingBottom:7, minHeight:44 }}>
              <span className={`kserif`} style={{ color:C.accent, fontSize:10, fontWeight:600, minWidth:28 }}>회독</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:C.ink, fontSize:11, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{r.title}</div>
                <div style={{ color:C.muted, fontSize:9 }}>{r.dueDate === today ? `오늘 마감` : `${r.dueDate.slice(5)} 마감`}</div>
              </div>
              <button onClick={() => onReviewDone(r.id)} className={`tap`}
                style={{ background:C.bg, color:C.ink, border:`1px solid ${C.line}`, padding:`5px 8px`, minWidth:42, fontSize:9, cursor:`pointer`, flexShrink:0 }}>
                완료
              </button>
            </div>
          ))}

          {hiddenCount > 0 && (
            <button onClick={() => onGoTo(hiddenPlanCount > 0 ? `log` : hiddenCourseCount > 0 ? `courses` : `review`)} className={`tap`}
              style={{ background:C.ink, border:`none`, color:`#fff`, padding:`7px 8px`, fontSize:10, cursor:`pointer`, textAlign:`center` }}>
              남은 항목 {hiddenCount}개 더 보기
            </button>
          )}

          {todosOpen > 0 && (
            <button onClick={() => onGoTo(`calendar`)} className={`tap`}
              style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, color:C.ink, padding:`7px 8px`, fontSize:10, cursor:`pointer`, textAlign:`left` }}>
              오늘 일정 {todosOpen}개 남음
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function HomeView({ today, dday, settings, logs, setLogs, reviews, setReviews, todos, tracks, setTracks, examScores, moods, setMoods, trackInbox = [], setTrackInbox, checklists = [], routines = [], routineLog = {}, setRoutineLog, weeklyPlans = {}, setWeeklyPlans, courses = [], setCourses, user, onGoTo }) {
  const todayLog = logs[today] || {};
  const todayMinutes = Object.values(todayLog).reduce((s, v) => s + (v || 0), 0);
  const todayTodos = todos[today] || [];
  const todayTodosOpen = todayTodos.filter(t => !t.done && !t.hidden).length;
  const overdueTodosOpen = Object.entries(todos || {}).reduce((sum, [date, list]) => {
    if (date >= today) return sum;
    return sum + (list || []).filter(t => !t.done && !t.hidden).length;
  }, 0);
  const todayTracks = tracks[today] || {};
  const tracksDone = TRACK_TYPES.filter(tt => todayTracks[tt.key]?.done).length;
  const todayInboxCount = useMemo(() => (trackInbox || []).filter(item => item && (!item.status || item.status === `pending`) && item.date === today).length, [trackInbox, today]);
  const cycleInfo = useMemo(() => getCycleInfo(today, settings), [today, settings]);
  const tomorrowInfo = useMemo(() => getCycleInfo(addDays(today, 1), settings), [today, settings]);
  const todayMock = useMemo(() => getMockExam(today, settings), [today, settings]);
  const upcomingMock = useMemo(() => nextMockExam(today, settings), [today, settings]);

  const weekStart = weekStartOf(today);
  const todayWeeklyPlanItems = useMemo(() => {
    const plan = weeklyPlans[weekStart] || {};
    const dayText = getWeeklyDayPlans(plan)[today] || ``;
    return buildWeeklyPlanQueueItems(dayText, today);
  }, [weeklyPlans, weekStart, today]);
  const weekSubjectMin = useMemo(() => {
    const out = {};
    Object.keys(SUBJECTS).forEach(sub => { out[sub] = 0; });
    weekDays(weekStart).forEach(d => {
      const lg = logs[d] || {};
      Object.keys(SUBJECTS).forEach(sub => {
        getStudyTypes(sub).forEach(t => { out[sub] += lg[`${sub}::${t.key}`] || 0; });
      });
    });
    return out;
  }, [logs, weekStart]);

  const weekTotalMin = Object.values(weekSubjectMin).reduce((a, b) => a + b, 0);

  const dueReviews = useMemo(() => {
    const list = [];
    reviews.forEach(r => {
      const interval = r.intervals[Math.min(r.cycleIndex, r.intervals.length - 1)];
      const dueDate = addDays(r.lastReviewed, interval);
      if (dueDate <= today) list.push({ ...r, dueDate, roundNum: r.cycleIndex + 1 });
    });
    return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [reviews, today]);

  const courseQueueSummary = useMemo(() => {
    return buildCourseQueueItems(courses, today, settings).reduce((acc, item) => {
      if (item.type === `watch`) acc.watch += 1;
      if (item.type === `review`) acc.review += 1;
      return acc;
    }, { watch: 0, review: 0 });
  }, [courses, today, settings]);

  const courseQueueItems = useMemo(() => buildCourseQueueItems(courses, today, settings), [courses, today, settings]);
  const courseReviewSourceKeys = useMemo(() => new Set(courseQueueItems.filter(item => item.type === `review`).map(item => courseLectureReviewKey(item.course.id, item.lecture.num))), [courseQueueItems]);
  const homeDueReviews = useMemo(() => dueReviews.filter(r => !(r.sourceType === `courseLecture` && courseReviewSourceKeys.has(r.sourceKey))), [dueReviews, courseReviewSourceKeys]);
  const coursePaceSummary = useMemo(() => buildCoursePaceSummary(courses, today, settings), [courses, today, settings]);
  const reviewDebtSummary = useMemo(() => buildReviewDebtSummary({ courseQueueItems, dueReviews: homeDueReviews, today }), [courseQueueItems, homeDueReviews, today]);
  const overdueCourseReviews = courseQueueItems.filter(item => item.type === `review` && item.lecture.nextReviewDate && item.lecture.nextReviewDate < today).length;
  const overdueTopicReviews = homeDueReviews.filter(r => r.dueDate < today).length;
  const overdueTotal = overdueTodosOpen + overdueCourseReviews + overdueTopicReviews;

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

  const inD30 = dday > 0 && dday <= 30;
  const inD7 = dday > 0 && dday <= 7;
  const staleChecklists = useMemo(() => checklists.filter(c => {
    if (!c.lastReviewed) return c.items.length > 0;
    return daysDiff(c.lastReviewed, today) >= 14;
  }), [checklists, today]);

  function logCourseTime(subject, studyType, minutes) {
    if (!setLogs || minutes <= 0) return;
    const key = `${subject}::${studyType}`;
    setLogs(prev => {
      const dl = prev[today] || {};
      return { ...prev, [today]: { ...dl, [key]: (dl[key] || 0) + minutes } };
    });
  }

  function completeHomeCourseItem(item) {
    if (!setCourses) return;
    const { course, lecture, type } = item;
    if (type === `watch`) {
      const shouldLog = !lecture.completed;
      setCourses(prev => prev.map(c => c.id === course.id ? {
        ...c,
        lectures: c.lectures.map(l => l.num === lecture.num ? { ...l, progress: 100, completed: true } : l),
        lastUpdated: today,
      } : c));
      if (shouldLog) logCourseTime(course.subject, COURSE_WATCH_TYPE, lecture.durationMin || 0);
      return;
    }

    const sourceKey = courseLectureReviewKey(course.id, lecture.num);
    setCourses(prev => prev.map(c => c.id === course.id ? {
      ...c,
      lectures: c.lectures.map(l => l.num === lecture.num ? completeCourseLectureReview(l, today) : l),
      lastUpdated: today,
    } : c));
    if (setReviews) {
      setReviews(prev => prev.map(r => r.sourceKey === sourceKey ? advanceReviewCycle(r, today) : r));
    }
  }

  function completeHomeReview(id) {
    if (!setReviews) return;
    setReviews(prev => prev.map(r => r.id === id ? advanceReviewCycle(r, today) : r));
  }

  return (
    <div className={`fadeIn home-shell`} style={{ paddingTop:20 }}>
      <div className={`home-primary`}>
      <HomeWorkHeader
        dday={dday}
        todayMinutes={todayMinutes}
        tracksDone={tracksDone}
        inboxCount={todayInboxCount}
        courseQueueSummary={courseQueueSummary}
        dueReviews={homeDueReviews}
        todosOpen={todayTodosOpen}
        planCount={todayWeeklyPlanItems.length}
        overdueTotal={overdueTotal}
        onGoTo={onGoTo}
      />

      <HomeReviewDebtPanel
        summary={reviewDebtSummary}
        onGoTo={onGoTo}
      />

      <HomeMinimumMode
        courseItems={courseQueueItems}
        reviews={homeDueReviews}
        planItems={todayWeeklyPlanItems}
        todosOpen={todayTodosOpen}
        staleChecklists={staleChecklists}
        onGoTo={onGoTo}
        onCourseDone={completeHomeCourseItem}
        onReviewDone={completeHomeReview}
      />

      <HomeTodayPanel
        today={today}
        courseItems={courseQueueItems}
        reviews={homeDueReviews}
        planItems={todayWeeklyPlanItems}
        todosOpen={todayTodosOpen}
        setTrackInbox={setTrackInbox}
        onGoTo={onGoTo}
        onCourseDone={completeHomeCourseItem}
        onReviewDone={completeHomeReview}
      />

      <section style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`28px 22px`, marginBottom:14, position:`relative`, overflow:`hidden` }}>
        <div style={{ display:`flex`, alignItems:`center`, gap:8, marginBottom:6 }}>
          <span style={{ width:18, height:1, background:C.accent }} />
          <span className={`kserif`} style={{ fontSize:10, letterSpacing:`0.25em`, color:C.accent, fontWeight:600 }}>시험까지</span>
        </div>
        <div className={`serif`} style={{ fontSize:72, fontWeight:500, lineHeight:0.95, color:C.ink, letterSpacing:`-0.03em` }}>
          {Math.abs(dday)}<span style={{ fontSize:28, color:C.muted, marginLeft:6 }}>일</span>
        </div>
        <div className={`kserif`} style={{ marginTop:14, fontSize:13, color:C.muted, lineHeight:1.6 }}>
          {fmtKDate(settings.examDate)} · {settings.examLabel}<br />
          누적 <span style={{ color:C.ink, fontWeight:600 }}>{daysStudied}일</span> · 연속 <span style={{ color:C.accent, fontWeight:600 }}>{streak}일</span> · 이번 주 <span style={{ color:C.ink, fontWeight:600 }}>{fmtMin(weekTotalMin)}</span>
        </div>
        <div style={{ position:`absolute`, right:18, top:22, display:`flex`, flexDirection:`column`, gap:4 }}>
          {[...Array(8)].map((_, i) => <span key={i} style={{ width:10, height:1, background: i < 3 ? C.accent : C.line }} />)}
        </div>
      </section>

      {inD7 && (
        <div style={{ background:C.accent, color:`#fff`, padding:`12px 16px`, marginBottom:14, fontSize:12, lineHeight:1.5 }}>
          <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`baseline` }}>
            <span className={`kserif`} style={{ fontWeight:600, fontSize:13 }}>벼락치기 모드 · D-{dday}</span>
            <span className={`mono`} style={{ fontSize:10, opacity:0.85 }}>D-7 진입</span>
          </div>
          <div style={{ marginTop:6, opacity:0.9 }}>핸드북·찌라시·빈출쟁점·요사 위주 · 새 자료 No</div>
        </div>
      )}
      {!inD7 && inD30 && (
        <div style={{ background:`#1A1915`, color:`#fff`, padding:`12px 16px`, marginBottom:14, fontSize:12, lineHeight:1.5 }}>
          <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`baseline` }}>
            <span className={`kserif`} style={{ fontWeight:600, fontSize:13 }}>회독 압축 모드 · D-{dday}</span>
            <span className={`mono`} style={{ fontSize:10, opacity:0.7 }}>D-30 진입</span>
          </div>
          <div style={{ marginTop:6, opacity:0.85 }}>회차 회독 위주로 · 객관식 복수 회차/일</div>
        </div>
      )}
      </div>

      <div className={`home-secondary`}>
      <HomeCoursePaceStrip
        summary={coursePaceSummary}
        onGoTo={onGoTo}
      />

      {todayMock ? (
        <div style={{ marginBottom:18 }}>
          <div style={{ background: C.accent, color:`#fff`, padding:`18px 20px`, position:`relative`, overflow:`hidden`, border:`1px solid ${C.accent}` }}>
            <div style={{ position:`absolute`, right:-10, top:-12, opacity:0.14, fontSize:120, fontWeight:700, fontFamily:`Fraunces, serif`, lineHeight:1 }}>!</div>
            <div style={{ position:`relative` }}>
              <div className={`kserif`} style={{ fontSize:10, letterSpacing:`0.22em`, opacity:0.85, fontWeight:500 }}>오늘은 모의고사</div>
              <div className={`serif`} style={{ fontSize:26, fontWeight:600, letterSpacing:`-0.01em`, marginTop:6 }}>{todayMock.label}</div>
              <div style={{ marginTop:8, fontSize:12 }}>
                <span className={`mono`} style={{ opacity:0.9 }}>
                  {todayMock.dayNum}/{todayMock.totalDays}일차 · {todayMock.start.slice(5)} ~ {todayMock.end.slice(5)}
                </span>
              </div>
              <div style={{ marginTop:10, height:3, background:`rgba(255,255,255,0.2)` }}>
                <div style={{ height:`100%`, width:`${(todayMock.dayNum / todayMock.totalDays) * 100}%`, background:`#fff` }} />
              </div>
            </div>
          </div>
        </div>
      ) : cycleInfo ? (
        <div style={{ marginBottom:18 }}>
          <CycleCard info={cycleInfo} today={today} />
          {tomorrowInfo && tomorrowInfo.subject !== cycleInfo.subject && (
            <div style={{ background:C.paper, border:`1px solid ${C.line}`, borderTop:`none`, padding:`10px 16px`, display:`flex`, alignItems:`center`, justifyContent:`space-between`, fontSize:12 }}>
              <span style={{ color:C.muted, letterSpacing:`0.05em` }}>내일부터 →</span>
              <span className={`kserif`} style={{ color: SUBJECTS[tomorrowInfo.subject].color, fontWeight:600 }}>
                {tomorrowInfo.subject}{tomorrowInfo.subject === `민사법` && ` + 선택법`}
                <span className={`mono`} style={{ color:C.muted, fontWeight:400, marginLeft:6, fontSize:10 }}>
                  {tomorrowInfo.cycleLabel} · {tomorrowInfo.blockDays}일
                </span>
              </span>
            </div>
          )}
          {upcomingMock && (
            <div style={{ background:C.paper, border:`1px solid ${C.line}`, borderTop:`none`, padding:`10px 16px`, display:`flex`, alignItems:`center`, justifyContent:`space-between`, fontSize:12 }}>
              <span style={{ color:C.muted, letterSpacing:`0.05em` }}>다음 모의고사</span>
              <span className={`kserif`} style={{ color: C.accent, fontWeight:600 }}>
                {upcomingMock.label}
                <span className={`mono`} style={{ color:C.muted, fontWeight:400, marginLeft:6, fontSize:10 }}>
                  D-{daysDiff(today, upcomingMock.start)} · {upcomingMock.start.slice(5)}
                </span>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background:C.paper, border:`1px dashed ${C.line}`, padding:`18px`, marginBottom:18, fontSize:12, color:C.muted, textAlign:`center`, lineHeight:1.6 }}>
          {settings.mockExams && settings.mockExams.length > 0
            ? `사이클을 표시할 기준 모의고사가 없습니다.`
            : `모의고사 또는 본시험 일정을 등록해 주세요.`}
        </div>
      )}

      <HomeRoutineShelf
        today={today}
        routines={routines}
        routineLog={routineLog}
        setRoutineLog={setRoutineLog}
      />
      <HomeChecklistShelf
        staleChecklists={staleChecklists}
        today={today}
        onGoTo={onGoTo}
      />
      </div>
      <div style={{ height:20 }} />
    </div>
  );
}

/* ============================================================ CALENDAR ============================================================ */

function CalendarView({ today, logs, reviews, todos, setTodos, settings, tracks, moods, setMoods, schedules = [], setSchedules, routines = [], routineLog = {}, onGoToLog }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(today + `T00:00:00`);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);

  /* 셀별로 매 렌더마다 getCycleInfo / getMockExam / dayMinutes를 호출하면
     비싼 사이클 계산이 42번씩 돌아 캘린더가 끊깁니다. cursor/settings/logs 변경 시에만 한 번 계산. */
  const cellMeta = useMemo(() => {
    const meta = {};
    cells.forEach(d => {
      meta[d] = {
        cycle: getCycleInfo(d, settings),
        mock: getMockExam(d, settings),
        examWeek: getExamWeek(d, settings),
      };
    });
    return meta;
  }, [cells, settings]);

  const dayMinutesMap = useMemo(() => {
    const out = {};
    cells.forEach(d => {
      const lg = logs[d] || {};
      out[d] = Object.values(lg).reduce((s, v) => s + (v || 0), 0);
    });
    return out;
  }, [cells, logs]);

  //
  const [addMode, setAddMode] = useState(null);
  const [pendingStart, setPendingStart] = useState(null);
  const [pendingEnd, setPendingEnd] = useState(null);
  const [draftTitle, setDraftTitle] = useState(``);
  const [draftColor, setDraftColor] = useState(SCHEDULE_PALETTE[0]);

  function startAddMode() {
    setAddMode(`start`);
    setPendingStart(null); setPendingEnd(null);
    setDraftTitle(``); setDraftColor(SCHEDULE_PALETTE[0]);
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
    if (addMode === `start`) {
      setPendingStart(d); setPendingEnd(d); setAddMode(`end`);
    } else if (addMode === `end`) {
      setPendingEnd(d); setAddMode(`form`);
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
  const palette = SCHEDULE_PALETTE;

  // schedules: assign vertical lanes (0/1/2) so multiple overlapping schedules do not collide visually
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
  const intensityBg = [`transparent`, `#EDE5D2`, `#DFD3B5`, `#C9B98E`, `#A88E55`];

  function prevMonth() { setCursor(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }); }
  function nextMonth() { setCursor(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }); }
  function jumpToday() {
    const d = new Date(today + `T00:00:00`);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(today);
  }

  const monthName = cursor.y + `.` + String(cursor.m + 1).padStart(2, `0`);
  const selDate = selected;
  const selLog = logs[selDate] || {};
  const selMinutes = Object.values(selLog).reduce((s, v) => s + (v || 0), 0);
  const selTodos = (todos[selDate] || []).filter(t => !t.hidden);
  const selDueReviews = (reviewsByDate[selDate] || []);
  const selCycleInfo = useMemo(() => getCycleInfo(selDate, settings), [selDate, settings]);
  const selMock = useMemo(() => getMockExam(selDate, settings), [selDate, settings]);
  const selExamWeek = useMemo(() => getExamWeek(selDate, settings), [selDate, settings]);
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
    <div className={`fadeIn`} style={{ paddingTop:20 }}>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, display:`flex`, alignItems:`center`, justifyContent:`space-between`, padding:`10px 14px`, marginBottom:8 }}>
        <button onClick={prevMonth} style={{ background:`none`, border:`none`, padding:6, cursor:`pointer`, color:C.ink }}><ChevronLeft size={18} /></button>
        <div style={{ display:`flex`, alignItems:`center`, gap:10 }}>
          <div className={`serif`} style={{ fontSize:18, fontWeight:600, letterSpacing:`-0.01em` }}>{monthName}</div>
          <button onClick={jumpToday}
            style={{ background:`transparent`, border:`1px solid ${C.line}`, color:C.muted, padding:`3px 8px`, fontSize:10, cursor:`pointer`, letterSpacing:`0.1em`, fontFamily:`Noto Serif KR, serif` }}>
            오늘
          </button>
        </div>
        <button onClick={nextMonth} style={{ background:`none`, border:`none`, padding:6, cursor:`pointer`, color:C.ink }}><ChevronRight size={18} /></button>
      </div>

      {/* 일정 추가 토글바 */}
      {addMode === null ? (
        <button onClick={startAddMode}
          style={{ width:`100%`, background:C.paper, border:`1px dashed ${C.line}`, color:C.muted, padding:`8px`, cursor:`pointer`, fontSize:11, marginBottom:8, display:`flex`, alignItems:`center`, justifyContent:`center`, gap:5 }}>
          <Plus size={12} /> 일정 추가 (시작일·종료일 두 번 탭)
        </button>
      ) : addMode === `form` ? (
        <div style={{ background:C.ink, color:`#fff`, padding:`12px 14px`, marginBottom:8 }}>
          <div className={`kserif`} style={{ fontSize:10, letterSpacing:`0.22em`, opacity:0.7, marginBottom:8, fontWeight:600 }}>
            새 일정 · {(pendingStart <= pendingEnd ? pendingStart : pendingEnd).slice(5).replace(`-`,`/`)} ~ {(pendingStart <= pendingEnd ? pendingEnd : pendingStart).slice(5).replace(`-`,`/`)}
          </div>
          <input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} autoFocus
            placeholder={`일정 제목 (예: 김영환 헌법 인강)`}
            style={{ width:`100%`, background:`rgba(255,255,255,0.1)`, border:`none`, borderBottom:`1px solid rgba(255,255,255,0.3)`, color:`#fff`, padding:`7px 4px`, fontSize:13, marginBottom:10, outline:`none` }} />
          <div style={{ display:`flex`, gap:5, marginBottom:10, alignItems:`center` }}>
            <span style={{ fontSize:10, opacity:0.7, marginRight:4 }}>색</span>
            {palette.map(c => (
              <button key={c} onClick={() => setDraftColor(c)}
                style={{ width:22, height:22, background:c, cursor:`pointer`, border: draftColor === c ? `2px solid #fff` : `1px solid rgba(255,255,255,0.3)`, padding:0 }} />
            ))}
          </div>
          <div style={{ display:`flex`, gap:6 }}>
            <button onClick={cancelAddMode} style={{ flex:1, background:`rgba(255,255,255,0.1)`, color:`#fff`, border:`none`, padding:`8px`, cursor:`pointer`, fontSize:12 }}>취소</button>
            <button onClick={commitSchedule} disabled={!draftTitle.trim()}
              style={{ flex:2, background: draftTitle.trim() ? `#fff` : `rgba(255,255,255,0.3)`, color: draftTitle.trim() ? C.ink : `rgba(255,255,255,0.5)`, border:`none`, padding:`8px`, cursor: draftTitle.trim() ? `pointer` : `default`, fontSize:12, fontWeight:600 }}>저장</button>
          </div>
        </div>
      ) : (
        <div style={{ background:C.accent, color:`#fff`, padding:`10px 14px`, marginBottom:8, display:`flex`, alignItems:`center`, justifyContent:`space-between` }}>
          <div className={`kserif`} style={{ fontSize:12, fontWeight:600 }}>
            {addMode === `start` ? `시작일을 탭하세요` : `종료일을 탭하세요 · 시작 ${pendingStart.slice(5).replace( `-`, `/`)}`}
          </div>
          <button onClick={cancelAddMode} style={{ background:`rgba(255,255,255,0.2)`, border:`none`, color:`#fff`, padding:`4px 10px`, fontSize:11, cursor:`pointer` }}>취소</button>
        </div>
      )}

      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`10px 8px`, marginBottom:14 }}>
        <div style={{ display:`grid`, gridTemplateColumns:`repeat(7, 1fr)`, marginBottom:6 }}>
          {[`일`,`월`,`화`,`수`,`목`,`금`,`토`].map((d, i) => (
            <div key={d} className={`kserif`} style={{
              textAlign:`center`, fontSize:10, padding:`4px 0`,
              color: i === 0 ? C.accent : i === 6 ? `#1E3A5F` : C.muted,
              letterSpacing:`0.1em`, fontWeight:600,
            }}>{d}</div>
          ))}
        </div>
        <div style={{ display:`grid`, gridTemplateColumns:`repeat(7, 1fr)`, gap:2 }}>
          {cells.map((d, i) => {
            const dt = new Date(d + `T00:00:00`);
            const inMonth = dt.getMonth() === cursor.m;
            const isToday = d === today;
            const isSelected = d === selected;
            const dow = dt.getDay();
            const mins = dayMinutesMap[d] || 0;
            const intLevel = intensity(mins);
            const reviewsOnDay = reviewsByDate[d] || [];
            const todosOnDay = (todos[d] || []).filter(t => !t.hidden);
            const todoOpen = todosOnDay.filter(t => !t.done).length;
            const cInfo = cellMeta[d]?.cycle;
            const cycleColor = cInfo ? SUBJECTS[cInfo.subject].color : null;
            const isBlockFirst = cInfo?.dayInBlock === 1;
            const mock = cellMeta[d]?.mock;
            const isMockFirst = mock && d === mock.start;
            const examWeek = cellMeta[d]?.examWeek;
            const isExamFirst = examWeek && d === examWeek.start;
            const inPending = addMode && isInPending(d);
            const isPendingStart = pendingStart === d;
            //
            const examWeekBg = examWeek ? `#F4C8C8` : null;
            return (
              <button key={i} onClick={() => handleDayTap(d)}
                style={{
                  position:`relative`, aspectRatio:`1 / 1.15`,
                  background: inPending ? C.accent : (isSelected && !addMode) ? C.ink : (examWeekBg || (mock ? `#FBE4E4` : intensityBg[intLevel])),
                  border: isPendingStart ? `2px solid ${C.ink}` : isToday && !isSelected && !inPending ? `1.5px solid ${C.accent}` : (isSelected && !addMode) ? `1px solid ${C.ink}` : examWeek ? `1px solid ${C.accent}` : `1px solid transparent`,
                  cursor:`pointer`, padding:`3px 3px 2px`,
                  display:`flex`, flexDirection:`column`, alignItems:`stretch`,
                  opacity: inMonth ? 1 : 0.35,
                  color: (inPending || (isSelected && !addMode)) ? C.paper : C.ink,
                }}>
                {examWeek && (<div style={{ position:`absolute`, top:0, left:0, right:0, height:3, background: C.accent, opacity: isSelected ? 0.85 : 1 }} />)}
                {!examWeek && mock && (<div style={{ position:`absolute`, top:0, left:0, right:0, height:3, background: C.accent, opacity: isSelected ? 0.85 : 1 }} />)}
                {!examWeek && !mock && cycleColor && (<div style={{ position:`absolute`, top:0, left:0, right:0, height:3, background: cycleColor, opacity: isSelected ? 0.85 : 1 }} />)}
                {(() => {
                  const sched = schedulesOnDay(d).slice(0, 3);
                  return sched.map(s => {
                    const lane = scheduleLanes[s.id] || 0;
                    const isStart = d === s.start;
                    const isEnd = d === s.end;
                    return (
                      <div key={s.id} style={{
                        position:`absolute`,
                        left: isStart ? 3 : -3,
                        right: isEnd ? 3 : -3,
                        bottom: 2 + lane * 8,
                        height: 7,
                        background: s.color || C.accent,
                        opacity: isSelected ? 0.85 : 1,
                        borderTopLeftRadius: isStart ? 999 : 0,
                        borderBottomLeftRadius: isStart ? 999 : 0,
                        borderTopRightRadius: isEnd ? 999 : 0,
                        borderBottomRightRadius: isEnd ? 999 : 0,
                        boxShadow: `0 0 0 0.5px rgba(0,0,0,0.18), 0 1px 1.5px rgba(0,0,0,0.12)`,
                        zIndex: 2,
                      }} />
                    );
                  });
                })()}
                <div style={{
                  fontSize:11, fontWeight: isToday ? 700 : 500,
                  textAlign:`left`, lineHeight:1, marginTop: (cycleColor || mock || examWeek) ? 4 : 1,
                  fontFamily:`JetBrains Mono, monospace`,
                  color: isSelected ? C.paper : (examWeek || mock ? C.accent : (dow === 0 ? C.accent : dow === 6 ? `#1E3A5F` : C.ink)),
                }}>{dt.getDate()}</div>
                {examWeek ? (
                  <div style={{ fontSize: 9, fontFamily:`Noto Serif KR, serif`, fontWeight:700, color: isSelected ? C.paper : C.accent, textAlign:`center`, marginTop:2, lineHeight:1.1, letterSpacing:`-0.02em` }}>
                    {isExamFirst ? `본시험` : `시험중`}
                    <div style={{ fontSize: 8, marginTop:1, fontFamily:`JetBrains Mono, monospace`, fontWeight:500, opacity:0.85 }}>{examWeek.dayNum}일차</div>
                  </div>
                ) : mock ? (
                  <div style={{ fontSize: 9, fontFamily:`Noto Serif KR, serif`, fontWeight:700, color: isSelected ? C.paper : C.accent, textAlign:`center`, marginTop:2, lineHeight:1.1, letterSpacing:`-0.02em` }}>
                    {isMockFirst ? `모의` : `시험`}
                    <div style={{ fontSize: 8, marginTop:1, fontFamily:`JetBrains Mono, monospace`, fontWeight:500, opacity:0.85 }}>{mock.dayNum}일차</div>
                  </div>
                ) : cInfo && (
                  <div style={{ fontSize: 11, fontFamily:`Noto Serif KR, serif`, fontWeight:700, color: isSelected ? C.paper : cycleColor, textAlign:`center`, marginTop:2, opacity: isSelected ? 0.95 : (isBlockFirst ? 1 : 0.78) }}>
                    {SUBJECTS[cInfo.subject].short}
                    <span style={{ fontSize: 8, marginLeft:1, fontFamily:`JetBrains Mono, monospace`, fontWeight:500, opacity:0.7 }}>{cInfo.dayInBlock}</span>
                  </div>
                )}
                <div style={{ flex:1 }} />
                <div style={{ display:`flex`, flexDirection:`column`, gap:1, alignItems:`center`, marginBottom: Math.min(3, schedulesOnDay(d).length) * 8 + (schedulesOnDay(d).length > 0 ? 1 : 0) }}>
                  {reviewsOnDay.length > 0 && (
                    <div style={{ display:`flex`, gap:1.5, justifyContent:`center` }}>
                      {[...new Set(reviewsOnDay.map(r => r.subject))].slice(0, 4).map((sub, idx) => (
                        <span key={idx} style={{ width:3, height:3, borderRadius:`50%`, background: SUBJECTS[sub]?.color || C.muted, opacity: isSelected ? 0.95 : 1 }} />
                      ))}
                    </div>
                  )}
                  {(() => {
                    const dayLog = routineLog[d] || {};
                    const allDone = routines.length > 0 && routines.every(r => dayLog[r.id]);
                    if (!allDone) return null;
                    return <span style={{ fontSize:9, lineHeight:1, filter: isSelected ? `none` : `none` }}>⭐</span>;
                  })()}
                  {todoOpen > 0 && (
                    <span style={{ fontSize:8, fontWeight:700, color: isSelected ? C.paper : C.accent, fontFamily:`JetBrains Mono, monospace`, lineHeight:1 }}>✓{todoOpen}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display:`flex`, flexWrap:`wrap`, gap:12, justifyContent:`center`, paddingTop:10, marginTop:6, borderTop:`1px dashed ${C.lineSoft}`, fontSize:10, color:C.muted }}>
          <span style={{ display:`flex`, alignItems:`center`, gap:4 }}><span style={{ width:18, height:3, background:C.accent }} /><span>모의고사</span></span>
          <span style={{ display:`flex`, alignItems:`center`, gap:4 }}>
            <span style={{ display:`flex`, gap:1 }}>
              {Object.keys(SUBJECTS).slice(0, 3).map(sub => (<span key={sub} style={{ width:8, height:3, background:SUBJECTS[sub].color }} />))}
            </span>
            <span>사이클</span>
          </span>
          <span style={{ display:`flex`, alignItems:`center`, gap:4 }}>
            <span style={{ width:22, height:5, background:SCHEDULE_PALETTE[0], borderRadius:999 }} />
            <span>일정</span>
          </span>
          <span style={{ display:`flex`, alignItems:`center`, gap:4 }}>
            <span style={{ display:`flex`, gap:1 }}>
              {intensityBg.slice(1).map((bg, i) => (<span key={i} style={{ width:7, height:7, background:bg, border:`1px solid ${C.lineSoft}` }} />))}
            </span>
            <span>공부량</span>
          </span>
          <span style={{ display:`flex`, alignItems:`center`, gap:4 }}><span style={{ width:5, height:5, borderRadius:`50%`, background:C.accent }} /><span>회독</span></span>
          <span style={{ display:`flex`, alignItems:`center`, gap:3 }}><span style={{ fontSize:9, color:C.accent, fontWeight:700, fontFamily:`JetBrains Mono, monospace` }}>✓N</span><span>할일</span></span>
        </div>
      </div>

      <DayDetail
        date={selDate} minutes={selMinutes} log={selLog} todos={selTodos}
        dueReviews={selDueReviews}
        cycleInfo={selCycleInfo} mock={selMock} examWeek={selExamWeek} tracks={selTracks}
        schedules={schedulesOnDay(selDate)}
        mood={moods[selDate] || ``}
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

function DayDetail({ date, minutes, log, todos, dueReviews, cycleInfo, mock, examWeek, tracks, schedules = [], mood, setMood, onAddTodo, onToggleTodo, onRemoveTodo, onGoToLog, isToday }) {
  const [newTodo, setNewTodo] = useState(``);
  const [moodLocal, setMoodLocal] = useState(mood);
  useEffect(() => { setMoodLocal(mood); }, [mood, date]);

  const subjectMin = useMemo(() => {
    const out = {};
    Object.keys(SUBJECTS).forEach(sub => {
      let m = 0;
      getStudyTypes(sub).forEach(t => { m += log[`${sub}::${t.key}`] || 0; });
      if (m > 0) out[sub] = m;
    });
    return out;
  }, [log]);

  const openTodos = todos.filter(t => !t.done);
  const doneTodos = todos.filter(t => t.done);
  const tracksDoneCount = TRACK_TYPES.filter(tt => tracks[tt.key]?.done).length;
  const hasTrackData = TRACK_TYPES.some(tt => tracks[tt.key]?.done || tracks[tt.key]?.text);

  function submit() { onAddTodo(newTodo); setNewTodo(``); }

  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}` }}>
      <div style={{ padding:`14px 16px`, borderBottom:`1px solid ${C.lineSoft}`, display:`flex`, alignItems:`baseline`, justifyContent:`space-between` }}>
        <div>
          <div className={`kserif`} style={{ fontSize:15, fontWeight:600 }}>{fmtKDate(date)}</div>
          {isToday && <span className={`kserif`} style={{ fontSize:10, color:C.accent, marginLeft:6, letterSpacing:`0.1em`, fontWeight:600 }}>TODAY</span>}
        </div>
        <span className={`serif mono`} style={{ fontSize:14, fontWeight:600, color: minutes > 0 ? C.ink : C.muted }}>{fmtMin(minutes)}</span>
      </div>

      {examWeek && (
        <div style={{ padding:`14px 16px`, borderBottom:`1px solid ${C.lineSoft}`, background: C.accent, color:`#fff`, display:`flex`, alignItems:`center`, gap:12 }}>
          <div style={{ width:40, height:40, background:`rgba(255,255,255,0.2)`, display:`grid`, placeItems:`center`, flexShrink:0 }}>
            <span className={`serif`} style={{ fontSize:18, fontWeight:700, lineHeight:1 }}>!</span>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className={`kserif`} style={{ fontSize:14, fontWeight:600 }}>{examWeek.label}</div>
            <div className={`mono`} style={{ fontSize:10.5, opacity:0.9, marginTop:2 }}>{examWeek.dayNum}/{examWeek.totalDays}일차 · {examWeek.start.slice(5)} ~ {examWeek.end.slice(5)}</div>
          </div>
        </div>
      )}

      {mock && !examWeek && (
        <div style={{ padding:`14px 16px`, borderBottom:`1px solid ${C.lineSoft}`, background: C.accent, color:`#fff`, display:`flex`, alignItems:`center`, gap:12 }}>
          <div style={{ width:40, height:40, background:`rgba(255,255,255,0.2)`, display:`grid`, placeItems:`center`, flexShrink:0 }}>
            <span className={`serif`} style={{ fontSize:18, fontWeight:700, lineHeight:1 }}>{mock.label.match(/\d/)?.[0] || `!`}</span>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className={`kserif`} style={{ fontSize:14, fontWeight:600 }}>{mock.label}</div>
            <div className={`mono`} style={{ fontSize:10.5, opacity:0.9, marginTop:2 }}>{mock.dayNum}/{mock.totalDays}일차 · {mock.start.slice(5)} ~ {mock.end.slice(5)}</div>
          </div>
        </div>
      )}

      {cycleInfo && !mock && (
        <div style={{ padding:`12px 16px`, borderBottom:`1px solid ${C.lineSoft}`, background: SUBJECTS[cycleInfo.subject].color, color:`#fff`, display:`flex`, alignItems:`center`, gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:`50%`, background:`rgba(255,255,255,0.2)`, display:`grid`, placeItems:`center`, flexShrink:0 }}>
            <span className={`serif`} style={{ fontSize:18, fontWeight:700 }}>{SUBJECTS[cycleInfo.subject].short}</span>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className={`kserif`} style={{ fontSize:14, fontWeight:600 }}>
              {cycleInfo.subject}{cycleInfo.subject === `민사법` && ` + 선택법`}
            </div>
            <div className={`mono`} style={{ fontSize:10.5, opacity:0.9, marginTop:2 }}>{cycleInfo.cycleLabel} · 블록 {cycleInfo.dayInBlock}/{cycleInfo.blockDays}일</div>
          </div>
          {cycleInfo.isBlockLast && (
            <div style={{ fontSize:10, padding:`3px 8px`, background:`rgba(255,255,255,0.2)`, fontFamily:`Noto Serif KR, serif`, fontWeight:600, letterSpacing:`0.05em` }}>블록 마지막날</div>
          )}
        </div>
      )}

      {schedules.length > 0 && (
        <div style={{ padding:`10px 16px`, borderBottom:`1px solid ${C.lineSoft}` }}>
          <div className={`kserif`} style={{ fontSize:10, letterSpacing:`0.2em`, color:C.muted, fontWeight:600, marginBottom:6 }}>일정</div>
          <div style={{ display:`flex`, flexDirection:`column`, gap:4 }}>
            {schedules.map(s => {
              const dayIdx = daysDiff(s.start, date) + 1;
              const total = daysDiff(s.start, s.end) + 1;
              return (
                <div key={s.id} style={{ display:`flex`, alignItems:`center`, gap:8 }}>
                  <span style={{ width:3, height:14, background: s.color || C.accent, flexShrink:0 }} />
                  <span style={{ fontSize:12, fontWeight:600, color:C.ink, flex:1, minWidth:0, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{s.title}</span>
                  <span className={`mono`} style={{ fontSize:10, color:C.muted, flexShrink:0 }}>{dayIdx}/{total}일</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasTrackData && (
        <div style={{ padding:`12px 16px`, borderBottom:`1px solid ${C.lineSoft}` }}>
          <div className={`kserif`} style={{ fontSize:10, letterSpacing:`0.2em`, color:C.muted, fontWeight:600, marginBottom:8, display:`flex`, justifyContent:`space-between` }}>
            <span>오늘 트랙</span>
            <span className={`mono`} style={{ letterSpacing:0, fontSize:10 }}>{tracksDoneCount}/5</span>
          </div>
          <div style={{ display:`flex`, flexDirection:`column`, gap:4 }}>
            {TRACK_TYPES.map(tt => {
              const slot = tracks[tt.key];
              if (!slot?.done && !slot?.text) return null;
              return (
                <div key={tt.key} style={{ display:`flex`, alignItems:`center`, gap:6, fontSize:12 }}>
                  <span style={{
                    width:18, height:18, background: slot.done ? tt.color : `transparent`,
                    color: slot.done ? `#fff` : tt.color, border:`1px solid ${tt.color}`,
                    display:`grid`, placeItems:`center`, fontSize:9, fontWeight:700,
                    fontFamily:`Noto Serif KR, serif`, flexShrink:0,
                  }}>{tt.short}</span>
                  <span className={`kserif`} style={{ flex:1, minWidth:0, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap`, color: slot.done ? C.ink : C.muted }}>
                    {slot.text || tt.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(subjectMin).length > 0 && (
        <div style={{ padding:`12px 16px`, borderBottom:`1px solid ${C.lineSoft}`, display:`flex`, flexWrap:`wrap`, gap:6 }}>
          {Object.entries(subjectMin).map(([sub, m]) => (
            <span key={sub} className={`kserif`} style={{
              fontSize:11, padding:`3px 8px`,
              border:`1px solid ${SUBJECTS[sub].color}`,
              color: SUBJECTS[sub].color, fontWeight:600,
              display:`inline-flex`, alignItems:`center`, gap:5,
            }}>
              {sub}<span className={`mono`} style={{ fontWeight:400, opacity:0.85 }}>{fmtHour(m)}</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ padding:`12px 16px`, borderBottom:`1px solid ${C.lineSoft}` }}>
        <div className={`kserif`} style={{ fontSize:10, letterSpacing:`0.2em`, color:C.muted, fontWeight:600, marginBottom:6 }}>한 줄</div>
        <input
          value={moodLocal}
          onChange={e => setMoodLocal(e.target.value)}
          onBlur={() => setMood(moodLocal.trim())}
          onKeyDown={e => { if (e.key === `Enter`) e.target.blur(); }}
          placeholder={`컨디션·느낀점 메모`}
          style={{ width:`100%`, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`7px 10px`, fontSize:12, outline:`none`, fontFamily:`Noto Serif KR, serif` }}
        />
      </div>

      {dueReviews.length > 0 && (
        <div style={{ padding:`12px 16px`, borderBottom:`1px solid ${C.lineSoft}` }}>
          <div className={`kserif`} style={{ fontSize:10, letterSpacing:`0.2em`, color:C.muted, fontWeight:600, marginBottom:8 }}>회독</div>
          <div style={{ display:`flex`, flexDirection:`column`, gap:6 }}>
            {dueReviews.map((r, i) => (
              <div key={`due-${r.id}-${r.num}-${i}`} style={{
                display:`flex`, alignItems:`center`, gap:8,
                padding:`7px 10px`, background:C.bg, border:`1px solid ${C.lineSoft}`,
                borderLeft:`3px solid ${SUBJECTS[r.subject]?.color || C.muted}`,
              }}>
                <span className={`serif`} style={{
                  fontSize:11, fontWeight:600, color:`#fff`,
                  background:SUBJECTS[r.subject]?.color || C.muted,
                  padding:`2px 6px`, minWidth:36, textAlign:`center`,
                }}>{r.num}회독</span>
                <span className={`kserif`} style={{ flex:1, fontSize:13, fontWeight:500, minWidth:0, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>
                  {r.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding:`12px 16px` }}>
        <div className={`kserif`} style={{ fontSize:10, letterSpacing:`0.2em`, color:C.muted, fontWeight:600, marginBottom:8, display:`flex`, justifyContent:`space-between` }}>
          <span>할 일</span>
          {todos.length > 0 && <span className={`mono`} style={{ letterSpacing:0, fontSize:10 }}>{doneTodos.length}/{todos.length}</span>}
        </div>

        <div style={{ display:`flex`, flexDirection:`column`, gap:4, marginBottom:10 }}>
          {openTodos.map(t => <TodoRow key={t.id} todo={t} onToggle={() => onToggleTodo(t.id)} onRemove={() => onRemoveTodo(t.id)} />)}
          {doneTodos.map(t => <TodoRow key={t.id} todo={t} onToggle={() => onToggleTodo(t.id)} onRemove={() => onRemoveTodo(t.id)} />)}
          {todos.length === 0 && <div style={{ fontSize:12, color:C.muted, padding:`8px 0` }}>등록된 할 일이 없습니다.</div>}
        </div>

        <div style={{ display:`flex`, gap:6 }}>
          <input value={newTodo} onChange={e => setNewTodo(e.target.value)} onKeyDown={e => { if (e.key === `Enter`) submit(); }}
            placeholder={`할 일 추가`}
            style={{ flex:1, border:`1px solid ${C.line}`, background:C.bg, padding:`8px 10px`, fontSize:12, outline:`none` }} />
          <button onClick={submit} disabled={!newTodo.trim()} className={`lift`}
            style={{ background: newTodo.trim() ? C.accent : C.line, color:`#fff`, border:`none`, padding:`0 12px`, fontSize:12, cursor: newTodo.trim() ? `pointer` : `default`, display:`flex`, alignItems:`center` }}>
            <Plus size={14} />
          </button>
        </div>

        {isToday && (
          <button onClick={onGoToLog}
            style={{ width:`100%`, marginTop:10, background:`transparent`, border:`1px solid ${C.line}`, color:C.ink, padding:`8px`, fontSize:11, cursor:`pointer`, fontFamily:`Noto Serif KR, serif`, letterSpacing:`0.05em` }}>
            오늘 공부 기록하러 가기 →
          </button>
        )}

        {isToday && (
          <button
            onClick={async () => {
              const text = buildDailyPlanText({ date, log, tracks, todos, mood });
              const ok = await copyToClipboard(text);
              alert(ok ? `${fmtKDate(date).slice(5)} 계획이 복사되었어요.` : `복사 실패`);
            }}
            style={{
              width:`100%`, marginTop:8, background:`#FEE500`, color:`#3C1E1E`,
              border:`none`, padding:`9px`, fontSize:11, cursor:`pointer`, fontWeight:600,
              display:`flex`, alignItems:`center`, justifyContent:`center`, gap:6,
              fontFamily:`Noto Serif KR, serif`,
            }}>
            <Copy size={12} /> 이 날 카톡으로 복사
          </button>
        )}
      </div>
    </div>
  );
}

function TodoRow({ todo, onToggle, onRemove }) {
  return (
    <div style={{ display:`flex`, alignItems:`center`, gap:8, padding:`6px 4px`, borderBottom:`1px dashed ${C.lineSoft}` }}>
      <button onClick={onToggle} style={{ background:`none`, border:`none`, padding:2, cursor:`pointer`, color: todo.done ? C.good : C.muted, display:`flex` }}>
        {todo.done ? <CheckSquare size={16} strokeWidth={2} /> : <Square size={16} strokeWidth={1.5} />}
      </button>
      <span className={`kserif`} style={{
        flex:1, fontSize:13, minWidth:0,
        textDecoration: todo.done ? `line-through` : `none`,
        color: todo.done ? C.muted : C.ink, wordBreak:`keep-all`,
      }}>
        {todo.title}
        {todo.fromMock && <span style={{ fontSize:9, color:C.accent, marginLeft:6, fontFamily:`JetBrains Mono, monospace` }}>모의리뷰</span>}
      </span>
      <button onClick={onRemove} style={{ background:`none`, border:`none`, padding:4, cursor:`pointer`, color:C.muted, display:`flex` }}>
        <X size={12} />
      </button>
    </div>
  );
}

/* ============================================================ LOG (기록) ============================================================ */

function LogView({ today, settings, logs, setLogs, tracks, setTracks, examScores, setExamScores, rankScores = [], setRankScores, weeklyPlans = {}, setWeeklyPlans, todos = {}, moods = {}, setMoods, trackInbox = [], setTrackInbox, initialDate }) {
  const [date, setDate] = useState(initialDate || today);

  function setDailyMood(value) {
    if (!setMoods) return;
    setMoods(prev => {
      const next = { ...prev };
      const v = (value || ``).trim();
      if (v) next[date] = v;
      else delete next[date];
      return next;
    });
  }

  function sendMoodToInbox(trackKey) {
    const text = moods[date] || ``;
    if (!text.trim() || !setTrackInbox) return;
    const inboxItem = buildTrackInboxItem({
      date,
      trackKey,
      text,
      source: `하루 메모`,
      sourceId: `daily-memo:${date}:${trackKey}:${normalizeTrackInboxText(text)}`,
    });
    setTrackInbox(prev => enqueueTrackInbox(prev, inboxItem));
  }

  return (
    <div className={`fadeIn`} style={{ padding:`18px 0 24px` }}>
      <div style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between`, marginBottom:14, gap:8 }}>
        <button onClick={() => setDate(addDays(date, -1))} style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`7px 10px`, cursor:`pointer` }}>
          <ChevronLeft size={14} />
        </button>
        <input type={`date`} value={date} onChange={e => setDate(e.target.value)}
          style={{ flex:1, background:C.paper, border:`1px solid ${C.line}`, padding:`8px 10px`, fontSize:13, textAlign:`center`, outline:`none` }} />
        <button onClick={() => setDate(addDays(date, 1))} style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`7px 10px`, cursor:`pointer` }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {date !== today && (
        <button onClick={() => setDate(today)} style={{ background:`none`, border:`none`, color:C.accent, fontSize:11, cursor:`pointer`, marginBottom:12 }}>오늘로 돌아가기 →</button>
      )}

      <WeeklyPlanCard today={date} weeklyPlans={weeklyPlans} setWeeklyPlans={setWeeklyPlans} defaultOpen={false} />

      <TimerSection today={today} logs={logs} setLogs={setLogs} />

      <TrackInboxSection
        date={date}
        trackInbox={trackInbox}
        setTrackInbox={setTrackInbox}
        tracks={tracks}
        setTracks={setTracks}
      />

      <TracksSection date={date} tracks={tracks} setTracks={setTracks} />

      <TimeSection date={date} logs={logs} setLogs={setLogs} settings={settings} />

      <DailyMemoSection
        date={date}
        log={logs[date] || {}}
        tracks={tracks[date] || {}}
        todos={todos[date] || []}
        mood={moods[date] || ``}
        onMoodChange={setDailyMood}
        onSendToInbox={sendMoodToInbox}
      />

      <ScoresSection date={date} examScores={examScores} setExamScores={setExamScores} />

      <RankPasteSection date={date} rankScores={rankScores} setRankScores={setRankScores} />
    </div>
  );
}

function DailyMemoSection({ date, log, tracks, todos, mood, onMoodChange, onSendToInbox }) {
  return (
    <div style={{ marginBottom:24 }}>
      <SectionTitle>하루 메모</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`12px 14px` }}>
        <input
          value={mood}
          onChange={e => onMoodChange(e.target.value)}
          onBlur={e => onMoodChange(e.target.value)}
          placeholder={`컨디션, 느낀점, 한 줄 메모`}
          style={{
            width:`100%`,
            background:C.bg,
            border:`1px solid ${C.lineSoft}`,
            padding:`9px 10px`,
            fontSize:12,
            outline:`none`,
            fontFamily:`Noto Serif KR, serif`,
            marginBottom:8,
          }}
        />
        {(mood || ``).trim() && onSendToInbox && (
          <div style={{ display:`flex`, alignItems:`center`, gap:5, marginBottom:8, flexWrap:`wrap` }}>
            <span className={`kserif`} style={{ fontSize:10, color:C.muted, marginRight:2 }}>인박스</span>
            {TRACK_TYPES.map(track => (
              <button key={track.key} title={`${track.label} 인박스에 담기`} onClick={() => onSendToInbox(track.key)} className={`tap`}
                style={{ background:C.bg, color:track.color, border:`1px solid ${C.lineSoft}`, width:25, height:25, display:`grid`, placeItems:`center`, fontSize:10, fontWeight:700, cursor:`pointer`, fontFamily:`Noto Serif KR, serif` }}>
                {track.short}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={async () => {
            const text = buildDailyPlanText({ date, log, tracks, todos, mood });
            const ok = await copyToClipboard(text);
            alert(ok ? `${fmtKDate(date).slice(5)} 계획이 클립보드에 복사되었어요.` : `복사에 실패했습니다.`);
          }}
          style={{
            width:`100%`,
            background:`#FEE500`,
            color:`#3C1E1E`,
            border:`none`,
            padding:`9px`,
            fontSize:11,
            cursor:`pointer`,
            fontWeight:700,
            display:`flex`,
            alignItems:`center`,
            justifyContent:`center`,
            gap:6,
            fontFamily:`Noto Serif KR, serif`,
          }}>
          <MessageCircle size={13} /> 카톡용 계획 복사
        </button>
      </div>
    </div>
  );
}

function TrackInboxSection({ date, trackInbox = [], setTrackInbox, tracks, setTracks }) {
  const isPending = item => item && (!item.status || item.status === `pending`);
  const pendingItems = (trackInbox || []).filter(item => isPending(item) && item.date === date);
  const otherPendingCount = (trackInbox || []).filter(item => isPending(item) && item.date !== date).length;

  function updateItem(id, patch) {
    if (!setTrackInbox) return;
    setTrackInbox(prev => (prev || []).map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function markItem(id, status) {
    if (!setTrackInbox) return;
    const stampKey = status === `accepted` ? `acceptedAt` : `dismissedAt`;
    setTrackInbox(prev => (prev || []).map(item => item.id === id ? { ...item, status, [stampKey]: new Date().toISOString() } : item));
  }

  function acceptItem(item) {
    if (!setTracks || !item?.text?.trim()) return;
    setTracks(prev => appendTrackText(prev, date, item.trackKey, item.text));
    markItem(item.id, `accepted`);
  }

  function acceptAll() {
    if (!setTracks || pendingItems.length === 0) return;
    setTracks(prev => pendingItems.reduce((acc, item) => appendTrackText(acc, date, item.trackKey, item.text), prev));
    const ids = new Set(pendingItems.map(item => item.id));
    setTrackInbox(prev => (prev || []).map(item => ids.has(item.id) ? { ...item, status:`accepted`, acceptedAt:new Date().toISOString() } : item));
  }

  if (pendingItems.length === 0 && otherPendingCount === 0) return null;

  return (
    <div style={{ marginBottom:24 }}>
      <SectionTitle>청사객암보 인박스</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`12px 14px` }}>
        <div style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:8, marginBottom:pendingItems.length ? 10 : 0 }}>
          <div>
            <div className={`kserif`} style={{ fontSize:12, fontWeight:700, color:C.ink }}>정리 후보 {pendingItems.length}</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>
              강의 태그, 주간계획, 메모에서 들어온 항목을 5트랙에 받아 씁니다.
            </div>
          </div>
          {pendingItems.length > 1 && (
            <button onClick={acceptAll} className={`tap`} style={{ background:C.ink, color:`#fff`, border:`none`, padding:`7px 9px`, fontSize:10, cursor:`pointer`, flexShrink:0 }}>
              모두 받기
            </button>
          )}
        </div>

        {pendingItems.length === 0 ? (
          <div style={{ color:C.muted, fontSize:11, paddingTop:8 }}>
            이 날짜 후보는 없습니다{otherPendingCount > 0 ? ` · 다른 날짜 ${otherPendingCount}개 대기` : ``}.
          </div>
        ) : (
          <div style={{ display:`flex`, flexDirection:`column`, gap:7 }}>
            {pendingItems.map(item => {
              const meta = getTrackMeta(item.trackKey);
              return (
                <div key={item.id} style={{ display:`grid`, gridTemplateColumns:`64px 1fr auto auto`, gap:6, alignItems:`center`, borderTop:`1px dashed ${C.lineSoft}`, paddingTop:7 }}>
                  <select value={item.trackKey} onChange={e => updateItem(item.id, { trackKey:e.target.value })}
                    style={{ background:C.bg, color:meta.color, border:`1px solid ${C.lineSoft}`, padding:`6px 4px`, fontSize:10, outline:`none`, fontWeight:700 }}>
                    {TRACK_TYPES.map(track => <option key={track.key} value={track.key}>{track.short} {track.label}</option>)}
                  </select>
                  <div style={{ minWidth:0 }}>
                    <input value={item.text || ``} onChange={e => updateItem(item.id, { text:e.target.value })}
                      style={{ width:`100%`, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`7px 8px`, outline:`none`, fontSize:11, color:C.ink }}
                    />
                    <div style={{ fontSize:9, color:C.muted, marginTop:3, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>
                      {item.source || `후보`}{item.subject ? ` · ${item.subject}` : ``}
                    </div>
                  </div>
                  <button onClick={() => acceptItem(item)} title={`5트랙에 받기`} className={`tap`}
                    style={{ background:meta.color, color:`#fff`, border:`none`, width:32, height:32, cursor:`pointer`, display:`grid`, placeItems:`center` }}>
                    <Check size={14} />
                  </button>
                  <button onClick={() => markItem(item.id, `dismissed`)} title={`버리기`} className={`tap`}
                    style={{ background:C.bg, color:C.muted, border:`1px solid ${C.lineSoft}`, width:32, height:32, cursor:`pointer`, display:`grid`, placeItems:`center` }}>
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TimerSection({ today, logs, setLogs }) {
  //
  const [running, setRunning] = useState(() => {
    try { const v = localStorage.getItem(`bar-timer`); if (v) { const p = JSON.parse(v); return p.running || false; } } catch {}
    return false;
  });
  const [startedAt, setStartedAt] = useState(() => {
    try { const v = localStorage.getItem(`bar-timer`); if (v) return JSON.parse(v).startedAt || null; } catch {}
    return null;
  });
  const [subject, setSubject] = useState(() => {
    try { const v = localStorage.getItem(`bar-timer`); if (v) return JSON.parse(v).subject || `민사법`; } catch {}
    return `민사법`;
  });
  const [type, setType] = useState(() => {
    try { const v = localStorage.getItem(`bar-timer`); if (v) return JSON.parse(v).type || `선택형`; } catch {}
    return `선택형`;
  });
  const [tick, setTick] = useState(0);

  //
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  //
  useEffect(() => {
    try { localStorage.setItem(`bar-timer`, JSON.stringify({ running, startedAt, subject, type })); } catch {}
  }, [running, startedAt, subject, type]);

  const elapsedSec = startedAt && running ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const elapsedMin = Math.floor(elapsedSec / 60);
  const hh = Math.floor(elapsedSec / 3600);
  const mm = Math.floor((elapsedSec % 3600) / 60);
  const ss = elapsedSec % 60;
  const timeStr=`${String(hh).padStart(2, `0`)}:${String(mm).padStart(2, `0`)}:${String(ss).padStart(2, `0`)}`;

  const subjectColor = SUBJECTS[subject]?.color || C.ink;

  //
  useEffect(() => {
    const validTypes = getStudyTypes(subject).map(t => t.key);
    if (!validTypes.includes(type)) {
      setType(validTypes[0] || `선택형`);
    }
  }, [subject]);

  function start() {
    setStartedAt(Date.now());
    setRunning(true);
  }
  function stop(saveIt = true) {
    if (saveIt && startedAt) {
      const key = `${subject}::${type}`;
      const now = Date.now();
      const totalMin = Math.max(1, Math.round((now - startedAt) / 60000));

      //
      const startStudyDay = studyDayISOFromTimestamp(startedAt);
      const endStudyDay = studyDayISOFromTimestamp(now);

      let nextLogs;
      if (startStudyDay === endStudyDay) {
        //
        const dl = logs[startStudyDay] || {};
        nextLogs = { ...logs, [startStudyDay]: { ...dl, [key]: (dl[key] || 0) + totalMin } };
      } else {
        //
        const boundary = nextStudyDayBoundary(startedAt);
        const startMin = Math.max(0, Math.round((boundary - startedAt) / 60000));
        const endMin = Math.max(0, totalMin - startMin);
        nextLogs = { ...logs };
        if (startMin > 0) {
          const dl = nextLogs[startStudyDay] || {};
          nextLogs[startStudyDay] = { ...dl, [key]: (dl[key] || 0) + startMin };
        }
        if (endMin > 0) {
          const dl = nextLogs[endStudyDay] || {};
          nextLogs[endStudyDay] = { ...dl, [key]: (dl[key] || 0) + endMin };
        }
      }
      setLogs(nextLogs);
    }
    setRunning(false);
    setStartedAt(null);
    setTick(0);
  }
  function pauseOrResume() {
    if (running) {
      //
      stop(true);
    } else {
      start();
    }
  }
  function discard() {
    if (!running) return;
    if (!confirm(`현재 ${elapsedMin}분 측정 중인데, 저장하지 않고 버리시겠어요?`)) return;
    setRunning(false); setStartedAt(null); setTick(0);
  }

  const types = getStudyTypes(subject);

  return (
    <div style={{ marginBottom:24 }}>
      <SectionTitle>타이머</SectionTitle>
      <div style={{
        background: running ? subjectColor : C.paper,
        color: running ? `#fff` : C.ink,
        border: `1px solid ${running ? subjectColor : C.line}`,
        padding:`14px 14px 16px`,
        transition:`background .3s, color .3s`,
      }}>
        <div style={{ display:`flex`, alignItems:`baseline`, justifyContent:`space-between`, marginBottom:10 }}>
          <div className={`kserif`} style={{ fontSize:10, letterSpacing:`0.22em`, opacity: running ? 0.85 : 0.6, fontWeight:600 }}>
            {running ? `측정 중` : `대기`}
          </div>
          {running && elapsedMin > 0 && (
            <div className={`mono`} style={{ fontSize:10, opacity:0.85 }}>≈ {fmtMin(elapsedMin)}</div>
          )}
        </div>

        <div className={`serif mono`} style={{
          fontSize:42, fontWeight:600, letterSpacing:`-0.02em`, lineHeight:1,
          textAlign:`center`, marginBottom:14, fontFamily:`JetBrains Mono, monospace`,
          opacity: running ? 1 : 0.85,
        }}>{timeStr}</div>

        {/* 과목·유형 선택 */}
        <div style={{ display:`grid`, gridTemplateColumns:`1fr 1fr`, gap:6, marginBottom:10 }}>
          <select value={subject} onChange={e => setSubject(e.target.value)} disabled={running}
            style={{
              background: running ? `rgba(255,255,255,0.15)` : C.bg,
              color: running ? `#fff` : C.ink,
              border: `1px solid ${running ? `rgba(255,255,255,0.3)` : C.lineSoft}`,
              padding:`7px 8px`, fontSize:12, outline:`none`,
              opacity: running ? 0.7 : 1,
            }}>
            {Object.keys(SUBJECTS).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={type} onChange={e => setType(e.target.value)} disabled={running}
            style={{
              background: running ? `rgba(255,255,255,0.15)` : C.bg,
              color: running ? `#fff` : C.ink,
              border: `1px solid ${running ? `rgba(255,255,255,0.3)` : C.lineSoft}`,
              padding:`7px 8px`, fontSize:12, outline:`none`,
              opacity: running ? 0.7 : 1,
            }}>
            {types.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>

        {/* 버튼 */}
        {!running ? (
          <button onClick={start}
            style={{
              width:`100%`, background: C.ink, color:`#fff`, border:`none`,
              padding:`12px`, cursor:`pointer`, fontSize:13, fontWeight:600,
              display:`flex`, alignItems:`center`, justifyContent:`center`, gap:6,
            }}>
            ▶ 시작
          </button>
        ) : (
          <div style={{ display:`flex`, gap:6 }}>
            <button onClick={discard}
              style={{
                flex:1, background:`rgba(255,255,255,0.15)`, color:`#fff`,
                border:`1px solid rgba(255,255,255,0.3)`, padding:`10px`, cursor:`pointer`, fontSize:12,
              }}>
              버리기
            </button>
            <button onClick={() => stop(true)}
              style={{
                flex:2, background:`#fff`, color: subjectColor,
                border:`none`, padding:`10px`, cursor:`pointer`, fontSize:13, fontWeight:600,
              }}>
              ■ 정지 · 저장 ({elapsedMin}분)
            </button>
          </div>
        )}
      </div>
      <div style={{ fontSize:10, color:C.muted, marginTop:6, lineHeight:1.5 }}>
        측정값은 학습일(새벽 5시 기준)의 선택한 과목·유형에 합산됩니다. 5시 이전엔 어제, 그 이후는 오늘로 저장돼요. 앱을 닫아도 측정은 유지됩니다.
      </div>
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
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`4px 0` }}>
        {TRACK_TYPES.map((t, i) => {
          const v = dayTracks[t.key] || {};
          return (
            <div key={t.key} style={{
              display:`flex`, alignItems:`center`, gap:10, padding:`10px 14px`,
              borderBottom: i < TRACK_TYPES.length - 1 ? `1px dashed ${C.lineSoft}` : `none`,
            }}>
              <button onClick={() => toggle(t.key)} style={{ background:`none`, border:`none`, cursor:`pointer`, padding:0, flexShrink:0 }}>
                {v.done ? <CheckSquare size={18} color={t.color} /> : <Square size={18} color={C.muted} />}
              </button>
              <div style={{ width:28, fontFamily:`Fraunces, serif`, fontWeight:600, fontSize:16, color:t.color, textAlign:`center`, flexShrink:0 }}>
                {t.short}
              </div>
              <input
                value={v.text || ``}
                onChange={e => setText(t.key, e.target.value)}
                placeholder={t.placeholder}
                style={{
                  flex:1, background:`transparent`, border:`none`, outline:`none`,
                  fontSize:12, color:C.ink, padding:`2px 0`,
                  textDecoration: v.done && !v.text ? `none` : `none`,
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
    const [s] = k.split(`::`);
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
            <div key={sub} style={{ borderTop: si > 0 ? `1px solid ${C.lineSoft}` : `none`, padding:`10px 14px` }}>
              <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`baseline`, marginBottom:6 }}>
                <span className={`kserif`} style={{ fontSize:13, fontWeight:600, color:meta.color }}>{sub}</span>
                <span className={`mono`} style={{ fontSize:11, color:C.muted }}>{fmtMin(sTot)}</span>
              </div>
              <div style={{ display:`grid`, gridTemplateColumns:`repeat(2, 1fr)`, gap:6 }}>
                {getStudyTypes(sub).map(t => {
                  const key = `${sub}::${t.key}`;
                  return <TypeEntry key={key} label={t.label} value={dl[key] || 0} onChange={v => setMin(sub, t.key, v)} color={meta.color} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
      {grandTotal > 0 && (
        <div style={{ textAlign:`right`, marginTop:8, fontSize:12, color:C.muted }}>
          합계 <span className={`mono`} style={{ color:C.ink, fontWeight:600 }}>{fmtMin(grandTotal)}</span>
        </div>
      )}
    </div>
  );
}

function TypeEntry({ label, value, onChange, color }) {
  function bump(d) { onChange(Math.max(0, value + d)); }
  return (
    <div style={{ display:`flex`, alignItems:`center`, gap:4, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`4px 6px` }}>
      <span style={{ fontSize:10, color:C.muted, flex:1, minWidth:0, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{label}</span>
      <button onClick={() => bump(-15)} style={{ background:`none`, border:`none`, cursor:`pointer`, padding:`2px 4px`, color:C.muted }}>
        <Minus size={11} />
      </button>
      <input type={`number`} inputMode={`numeric`} value={value || ``} onChange={e => onChange(parseInt(e.target.value) || 0)}
        style={{ width:36, textAlign:`center`, background:`transparent`, border:`none`, outline:`none`, fontSize:11, fontFamily:`JetBrains Mono, monospace`, color:value > 0 ? color : C.muted, fontWeight:600 }} />
      <button onClick={() => bump(15)} style={{ background:`none`, border:`none`, cursor:`pointer`, padding:`2px 4px`, color:C.muted }}>
        <Plus size={11} />
      </button>
    </div>
  );
}

/* 객관식 과목별 고정 총 문항 수 */
const MCQ_TOTAL = { 공법: 40, 형사법: 40, 민사법: 70 };

function ScoresSection({ date, examScores, setExamScores }) {
  const [round, setRound] = useState(``);
  const [subject, setSubject] = useState(`공법`);
  const [wrong, setWrong] = useState(``);
  const [note, setNote] = useState(``);

  const todays = examScores.filter(s => s.date === date).sort((a,b) => (a.subject + a.round).localeCompare(b.subject + b.round));
  const total = MCQ_TOTAL[subject];
  const wrongNum = parseInt(wrong);
  const correctPreview = (!isNaN(wrongNum) && wrongNum >= 0 && wrongNum <= total) ? total - wrongNum : null;

  function add() {
    if (!round || wrong === ``) return;
    const w = parseInt(wrong);
    if (isNaN(w) || w < 0 || w > total) {
      alert(`틀린 개수는 0~${total} 사이여야 합니다.`);
      return;
    }
    const newScore = {
      id: uid(),
      date,
      round: parseInt(round),
      subject,
      type: `선택형`,
      wrong: w,
      total,
      note: note.trim() || null,
    };
    setExamScores([...examScores, newScore]);
    setRound(``); setWrong(``); setNote(``);
  }
  function del(id) {
    setExamScores(examScores.filter(s => s.id !== id));
  }

  return (
    <div style={{ marginBottom:24 }}>
      <SectionTitle>객관식 회차 점수</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`12px 14px` }}>
        {todays.length > 0 && (
          <div style={{ marginBottom:12 }}>
            {todays.map(s => {
              const correct = s.total ? s.total - s.wrong : null;
              return (
                <div key={s.id} style={{ display:`flex`, alignItems:`center`, gap:8, padding:`6px 0`, borderBottom:`1px dashed ${C.lineSoft}`, fontSize:12 }}>
                  <span style={{ color:SUBJECTS[s.subject].color, fontWeight:600, minWidth:30 }}>{SUBJECTS[s.subject].short}</span>
                  <span className={`mono`} style={{ color:C.muted, minWidth:34 }}>{s.round}회</span>
                  <span className={`mono`} style={{ color:C.good, fontWeight:600, minWidth:48 }}>+{correct ?? `-`}</span>
                  <span className={`mono`} style={{ color:C.accent, minWidth:36 }}>-{s.wrong}</span>
                  <span style={{ flex:1, color:C.muted, fontSize:10, minWidth:0, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{s.note || ``}</span>
                  <button onClick={() => del(s.id)} style={{ background:`none`, border:`none`, cursor:`pointer`, padding:0, flexShrink:0 }}>
                    <X size={12} color={C.muted} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 1행: 과목 선택 */}
        <div style={{ display:`flex`, gap:5, marginBottom:6 }}>
          {Object.keys(MCQ_TOTAL).map(s => (
            <button key={s} onClick={() => setSubject(s)}
              style={{
                flex:1, background: subject === s ? SUBJECTS[s].color : C.bg,
                color: subject === s ? `#fff` : C.muted,
                border: `1px solid ${subject === s ? SUBJECTS[s].color : C.lineSoft}`,
                padding:`7px 4px`, fontSize:11, cursor:`pointer`, fontWeight: subject === s ? 600 : 400,
              }}>
              {s} <span style={{ opacity:0.7, fontSize:10 }}>({MCQ_TOTAL[s]})</span>
            </button>
          ))}
        </div>

        {/* 2행: 회차 / 틀림 입력 */}
        <div style={{ display:`flex`, gap:5, marginBottom:6, alignItems:`stretch` }}>
          <div style={{ flex:1, display:`flex`, alignItems:`center`, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`0 8px` }}>
            <input value={round} onChange={e => setRound(e.target.value)} placeholder={`회차`}
              type={`number`} inputMode={`numeric`}
              style={{ flex:1, background:`transparent`, border:`none`, outline:`none`, padding:`8px 0`, fontSize:12, fontFamily:`JetBrains Mono, monospace` }} />
            <span style={{ fontSize:10, color:C.muted }}>회</span>
          </div>
          <div style={{ flex:1.4, display:`flex`, alignItems:`center`, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`0 8px` }}>
            <input value={wrong} onChange={e => setWrong(e.target.value)}
              placeholder={`틀린 개수`} type={`number`} inputMode={`numeric`} min={0} max={total}
              style={{ flex:1, background:`transparent`, border:`none`, outline:`none`, padding:`8px 0`, fontSize:12, fontFamily:`JetBrains Mono, monospace`, color:C.accent, fontWeight:600 }} />
            <span style={{ fontSize:10, color:C.muted }}>/{total}</span>
          </div>
          <button onClick={add}
            style={{ background:C.ink, color:`#fff`, border:`none`, padding:`0 16px`, cursor:`pointer`, fontSize:12, display:`flex`, alignItems:`center` }}>
            <Plus size={14} />
          </button>
        </div>

        {/* 미리보기: 맞은 개수 */}
        {correctPreview !== null && (
          <div style={{ fontSize:11, color:C.muted, marginBottom:6, textAlign:`right` }}>
            맞은 개수 <span className={`mono`} style={{ color:C.good, fontWeight:600, fontSize:13 }}>{correctPreview}</span>
            <span className={`mono`} style={{ color:C.muted, fontSize:10 }}> / {total} ({Math.round((correctPreview/total)*100)}%)</span>
          </div>
        )}

        {/* 3행: 메모 */}
        <input value={note} onChange={e => setNote(e.target.value)} placeholder={`메모 (선택)`}
          style={{ width:`100%`, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`7px 10px`, fontSize:11, outline:`none` }} />
      </div>
    </div>
  );
}

/* 사례형/기록형 등수표 텍스트 붙여넣기 */
const RANK_SCORE_TYPES = [`사례형`, `기록형`, `선택형`, `기타`];

function cleanRankCell(value) {
  return String(value ?? ``)
    .replace(/`/g, ``)
    .replace(/\*\*/g, ``)
    .replace(/"/g, ``)
    .trim();
}

function rankNumber(value) {
  const raw = cleanRankCell(value).replace(/,/g, ``);
  const match = raw.match(/[+-]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function rankRound(value) {
  const raw = cleanRankCell(value);
  const match = raw.match(/^\s*(\d{1,3})\s*(?:회(?:차)?)?\s*$/) || raw.match(/^\s*(\d{1,3})\s*회(?:차)?(?:\s|$)/);
  return match ? Number(match[1] || match[2]) : null;
}

function roundRankMetric(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return null;
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

function rankHeaderField(value) {
  const h = cleanRankCell(value).toLowerCase().replace(/[\s_()/%-]/g, ``);
  if (!h) return null;
  if (h === `round` || h === `회차`) return `round`;
  if (h === `score` || h === `내점수` || h === `점수`) return `score`;
  if (h === `rank` || h === `등수`) return `rank`;
  if (h.includes(`totalstudents`) || h === `total` || h.includes(`인원`)) return `totalStudents`;
  if (h.includes(`toppercent`) || h.includes(`상위비율`) || h.includes(`백분위`)) return `topPercent`;
  if (h.includes(`scoreminusaverage`) || h.includes(`평균대비`) || h.includes(`평균차`)) return `scoreMinusAverage`;
  if (h.includes(`averagescore`) || h === `average` || h === `평균`) return `averageScore`;
  if (h === `source` || h === `memo` || h === `메모`) return `note`;
  return null;
}

function splitRankLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (/^\|?\s*:?-{2,}/.test(trimmed)) return [];
  if (trimmed.includes(`|`)) {
    return trimmed.split(`|`).map(cleanRankCell).filter(Boolean);
  }
  if (trimmed.includes(`\t`)) {
    return trimmed.split(`\t`).map(cleanRankCell).filter(Boolean);
  }
  if (trimmed.includes(`,`)) {
    return trimmed.split(`,`).map(cleanRankCell).filter(Boolean);
  }
  const naturalWithAverage = trimmed.match(/^\s*(\d{1,3})\s*회(?:차)?[^\d+-]+([+-]?\d+(?:\.\d+)?)\s*점?[^\d+-]+(\d{1,3})\s*등\s*(?:\/\s*)?(\d{1,4})?\s*명?[\s\S]*?(?:평균|avg|average)\s*[:：]?\s*([+-]?\d+(?:\.\d+)?)/i);
  if (naturalWithAverage) return naturalWithAverage.slice(1);
  const naturalWithTotal = trimmed.match(/^\s*(\d{1,3})\s*회(?:차)?[^\d+-]+([+-]?\d+(?:\.\d+)?)\s*점?[^\d+-]+(\d{1,3})\s*등\s*(?:\/\s*)?(\d{1,4})\s*명?/);
  if (naturalWithTotal) return naturalWithTotal.slice(1);
  const compact = trimmed.match(/(\d{1,3})\s*회[^\d+-]+([+-]?\d+(?:\.\d+)?)\s*점?[^\d+-]+(\d{1,3})\s*등[^\d+-]+(\d{1,3})\s*명?[^\d+-]+([+-]?\d+(?:\.\d+)?)%?[^\d+-]+([+-]?\d+(?:\.\d+)?)[^\d+-]+([+-]?\d+(?:\.\d+)?)/);
  if (compact) return compact.slice(1);
  const numericRow = trimmed.match(/^\s*\d{1,3}\s*(?:회(?:차)?)?(?:\s|$)/);
  const numbers = trimmed.match(/[+-]?\d+(?:\.\d+)?/g);
  if (numericRow && numbers?.length >= 3) return numbers.slice(0, Math.min(numbers.length, 7));
  return trimmed.split(/\s{2,}/).map(cleanRankCell).filter(Boolean);
}

function parseRankCells(cells, headerMap) {
  const get = key => {
    const idx = headerMap ? headerMap[key] : null;
    return idx == null ? null : cells[idx];
  };
  const round = headerMap ? rankRound(get(`round`)) : rankRound(cells[0]);
  const score = headerMap ? rankNumber(get(`score`)) : rankNumber(cells[1]);
  const rank = headerMap ? rankNumber(get(`rank`)) : rankNumber(cells[2]);
  const totalStudents = headerMap ? rankNumber(get(`totalStudents`)) : rankNumber(cells[3]);
  let topRaw = headerMap ? rankNumber(get(`topPercent`)) : null;
  let averageScore = headerMap ? rankNumber(get(`averageScore`)) : null;
  let diffRaw = headerMap ? rankNumber(get(`scoreMinusAverage`)) : null;
  const note = headerMap ? cleanRankCell(get(`note`) || ``) : ``;

  if (!headerMap) {
    if (cells.length >= 7) {
      topRaw = rankNumber(cells[4]);
      averageScore = rankNumber(cells[5]);
      diffRaw = rankNumber(cells[6]);
    } else if (cells.length === 6) {
      topRaw = rankNumber(cells[4]);
      averageScore = rankNumber(cells[5]);
    } else if (cells.length === 5) {
      averageScore = rankNumber(cells[4]);
    }
  }

  if (!round || score == null || rank == null) return null;
  const topPercent = topRaw != null ? roundRankMetric(topRaw) : (
    totalStudents ? roundRankMetric((rank / totalStudents) * 100) : null
  );
  const scoreMinusAverage = diffRaw != null ? roundRankMetric(diffRaw) : (
    averageScore != null ? roundRankMetric(score - averageScore) : null
  );

  return {
    round,
    score,
    rank,
    totalStudents: totalStudents || null,
    topPercent,
    averageScore,
    scoreMinusAverage,
    note: note || null,
  };
}

function parseRankPasteText(text) {
  const rows = [];
  let headerMap = null;
  const seen = new Set();

  text.split(/\r?\n/).forEach(line => {
    const cells = splitRankLine(line);
    if (cells.length < 3) return;

    const fields = cells.map(rankHeaderField);
    if (fields.includes(`round`) && fields.includes(`rank`)) {
      headerMap = {};
      fields.forEach((field, idx) => {
        if (field && headerMap[field] == null) headerMap[field] = idx;
      });
      return;
    }

    const parsed = parseRankCells(cells, headerMap);
    if (!parsed) return;
    const key = `${parsed.round}:${parsed.score}:${parsed.rank}:${parsed.totalStudents || ``}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(parsed);
  });

  return rows.sort((a, b) => a.round - b.round);
}

function rankScoreKey(score) {
  return [
    score.seriesTitle || ``,
    score.subject || ``,
    score.type || ``,
    score.round || ``,
  ].join(`::`);
}

function upsertRankScores(prev = [], incoming = []) {
  const map = new Map();
  prev.forEach(item => map.set(rankScoreKey(item), item));
  incoming.forEach(item => {
    const key = rankScoreKey(item);
    const old = map.get(key);
    map.set(key, { ...old, ...item, id: old?.id || item.id });
  });
  return [...map.values()].sort((a, b) => {
    const series = (a.seriesTitle || ``).localeCompare(b.seriesTitle || ``);
    if (series !== 0) return series;
    return (a.round || 0) - (b.round || 0);
  });
}

function fmtSignedNumber(value) {
  if (value == null || Number.isNaN(value)) return `-`;
  return `${value > 0 ? `+` : ``}${value}`;
}

function rankLine(row) {
  if (!row) return `-`;
  return `${row.round}회 ${row.rank}등${row.totalStudents ? `/${row.totalStudents}명` : ``}`;
}

function emptyRankDraft() {
  return { round:``, score:``, rank:``, totalStudents:``, averageScore:``, note:`` };
}

function rankDraftFromRow(row = {}) {
  return {
    round: row.round ?? ``,
    score: row.score ?? ``,
    rank: row.rank ?? ``,
    totalStudents: row.totalStudents ?? ``,
    averageScore: row.averageScore ?? ``,
    note: row.note ?? ``,
  };
}

function parseManualRankDraft(draft = {}) {
  const round = rankRound(draft.round);
  const score = rankNumber(draft.score);
  const rank = rankNumber(draft.rank);
  const totalStudents = rankNumber(draft.totalStudents);
  const averageScore = rankNumber(draft.averageScore);
  const note = cleanRankCell(draft.note || ``);

  if (!round || score == null || rank == null) return null;

  return {
    round,
    score,
    rank,
    totalStudents: totalStudents || null,
    averageScore: averageScore == null ? null : averageScore,
    topPercent: totalStudents ? roundRankMetric((rank / totalStudents) * 100) : null,
    scoreMinusAverage: averageScore == null ? null : roundRankMetric(score - averageScore),
    note: note || null,
  };
}

function buildRankSummary(rows = []) {
  if (!rows.length) return null;
  const validScores = rows.filter(row => row.score != null);
  const avgScore = validScores.length
    ? roundRankMetric(validScores.reduce((sum, row) => sum + row.score, 0) / validScores.length)
    : null;
  const avgDiffRows = rows.filter(row => row.scoreMinusAverage != null);
  const avgDiff = avgDiffRows.length
    ? roundRankMetric(avgDiffRows.reduce((sum, row) => sum + row.scoreMinusAverage, 0) / avgDiffRows.length)
    : null;
  const pctRows = rows.filter(row => row.topPercent != null);
  const avgTop = pctRows.length
    ? roundRankMetric(pctRows.reduce((sum, row) => sum + row.topPercent, 0) / pctRows.length)
    : null;
  const bestRows = [...pctRows].sort((a, b) => a.topPercent - b.topPercent || (a.rank || 0) - (b.rank || 0)).slice(0, 3);
  const weakestRows = [...pctRows].sort((a, b) => b.topPercent - a.topPercent || (b.rank || 0) - (a.rank || 0)).slice(0, 3);

  const text = [
    `요약`,
    `전체 평균 점수: ${avgScore ?? `-`}점`,
    `전체 평균대비: ${fmtSignedNumber(avgDiff)}점`,
    `평균 상위 비율: ${avgTop ?? `-`}%`,
    `가장 좋았던 회차: ${bestRows.length ? bestRows.map(rankLine).join(`, `) : `-`}`,
    `가장 밀린 회차: ${weakestRows.length ? weakestRows.map(rankLine).join(`, `) : `-`}`,
  ].join(`\n`);

  return { avgScore, avgDiff, avgTop, bestRows, weakestRows, text };
}

function RankPasteSection({ date, rankScores = [], setRankScores }) {
  const [seriesTitle, setSeriesTitle] = useState(`1순환 민법 사례`);
  const [subject, setSubject] = useState(`민사법`);
  const [type, setType] = useState(`사례형`);
  const [text, setText] = useState(``);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState(() => emptyRankDraft());
  const [editingRankId, setEditingRankId] = useState(null);

  const parsed = useMemo(() => parseRankPasteText(text), [text]);
  const activeSeries = seriesTitle.trim() || `등수표`;
  const manualPreview = useMemo(() => parseManualRankDraft(manualDraft), [manualDraft]);
  const savedRows = useMemo(() => (
    [...rankScores]
      .filter(s => (s.seriesTitle || `등수표`) === activeSeries && s.subject === subject && s.type === type)
      .sort((a, b) => (a.round || 0) - (b.round || 0))
  ), [rankScores, activeSeries, subject, type]);

  const savedSummary = useMemo(() => {
    return buildRankSummary(savedRows);
  }, [savedRows]);

  function importRows() {
    if (!setRankScores) return;
    if (parsed.length === 0) {
      alert(`읽을 수 있는 등수표가 없습니다. 회차/점수/등수/인원 형식으로 붙여넣어 주세요.`);
      return;
    }
    const now = new Date().toISOString();
    const incoming = parsed.map(row => ({
      id: uid(),
      date,
      seriesTitle: activeSeries,
      subject,
      type,
      ...row,
      importedAt: now,
    }));
    setRankScores(upsertRankScores(rankScores, incoming));
    setText(``);
    alert(`${incoming.length}개 회차를 저장했어요. 같은 묶음·과목·유형·회차는 자동으로 덮어썼습니다.`);
  }

  function del(id) {
    if (!setRankScores) return;
    setRankScores(rankScores.filter(s => s.id !== id));
  }

  function updateManualDraft(field, value) {
    setManualDraft(prev => ({ ...prev, [field]: value }));
  }

  function resetManualDraft() {
    setManualDraft(emptyRankDraft());
    setEditingRankId(null);
  }

  function startEdit(row) {
    setManualOpen(true);
    setEditingRankId(row.id);
    setManualDraft(rankDraftFromRow(row));
  }

  function saveManualRow() {
    if (!setRankScores) return;
    const parsedDraft = parseManualRankDraft(manualDraft);
    if (!parsedDraft) {
      alert(`회차, 점수, 등수는 꼭 입력해 주세요.`);
      return;
    }

    const old = editingRankId ? rankScores.find(s => s.id === editingRankId) : null;
    const next = {
      id: editingRankId || uid(),
      date: old?.date || date,
      seriesTitle: activeSeries,
      subject,
      type,
      ...parsedDraft,
      importedAt: new Date().toISOString(),
    };

    const baseRows = editingRankId ? rankScores.filter(s => s.id !== editingRankId) : rankScores;
    setRankScores(upsertRankScores(baseRows, [next]));
    resetManualDraft();
    setManualOpen(false);
  }

  return (
    <div style={{ marginBottom:24 }}>
      <SectionTitle>사례형 등수표</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`12px 14px` }}>
        <div style={{ display:`grid`, gridTemplateColumns:`1.5fr 1fr 1fr`, gap:6, marginBottom:8 }}>
          <input value={seriesTitle} onChange={e => setSeriesTitle(e.target.value)} placeholder={`묶음 이름`}
            style={{ minWidth:0, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`8px 9px`, fontSize:11, outline:`none` }} />
          <select value={subject} onChange={e => setSubject(e.target.value)}
            style={{ minWidth:0, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`8px 9px`, fontSize:11, outline:`none` }}>
            {Object.keys(SUBJECTS).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={type} onChange={e => setType(e.target.value)}
            style={{ minWidth:0, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`8px 9px`, fontSize:11, outline:`none` }}>
            {RANK_SCORE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <textarea value={text} onChange={e => setText(e.target.value)} rows={7}
          placeholder={`등수표를 그대로 붙여넣으세요. 상위비율과 평균대비는 자동 계산됩니다.\n\n예:\n1회 12점 79등/102명 평균 19.2\n2회 21점 20등/95명 평균 15.9\n\n또는:\n회차,점수,등수,인원,평균`}
          style={{ width:`100%`, resize:`vertical`, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`9px 10px`, fontSize:11, outline:`none`, lineHeight:1.55, fontFamily:`JetBrains Mono, monospace`, marginBottom:8 }} />

        <div style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:8, marginBottom: parsed.length ? 10 : 0 }}>
          <div style={{ fontSize:10.5, color:C.muted }}>
            {text.trim() ? (
              parsed.length ? `${parsed.length}개 회차 인식됨` : `아직 인식된 행이 없습니다`
            ) : `상위비율=등수÷인원, 평균대비=내 점수-평균으로 자동 계산`}
          </div>
          <div style={{ display:`flex`, gap:6 }}>
            {text && (
              <button onClick={() => setText(``)}
                style={{ background:C.bg, color:C.muted, border:`1px solid ${C.lineSoft}`, padding:`7px 10px`, fontSize:11, cursor:`pointer` }}>
                비우기
              </button>
            )}
            <button onClick={importRows} disabled={parsed.length === 0}
              style={{ background: parsed.length ? C.ink : C.lineSoft, color: parsed.length ? `#fff` : C.muted, border:`none`, padding:`7px 12px`, fontSize:11, cursor: parsed.length ? `pointer` : `default`, fontWeight:700, display:`inline-flex`, alignItems:`center`, gap:5 }}>
              <Plus size={13} /> 저장
            </button>
          </div>
        </div>

        <div style={{ border:`1px solid ${C.lineSoft}`, background:C.bg, marginBottom:12 }}>
          <button onClick={() => setManualOpen(v => !v)}
            style={{ width:`100%`, background:`transparent`, border:`none`, padding:`9px 10px`, display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:8, cursor:`pointer`, color:C.ink }}>
            <span className={`kserif`} style={{ fontSize:11, fontWeight:700, letterSpacing:`0.08em` }}>
              {editingRankId ? `수동 수정` : `수동 추가`}
            </span>
            <ChevronDown size={14} style={{ transform: manualOpen ? `rotate(180deg)` : `none`, transition:`transform .18s ease` }} />
          </button>
          {manualOpen && (
            <div style={{ padding:`0 10px 10px` }}>
              <div style={{ display:`grid`, gridTemplateColumns:`repeat(auto-fit, minmax(88px, 1fr))`, gap:6, marginBottom:8 }}>
                {[
                  [`round`, `회차`, `1회`],
                  [`score`, `점수`, `18.5`],
                  [`rank`, `등수`, `56`],
                  [`totalStudents`, `인원`, `99`],
                  [`averageScore`, `평균`, `19.6`],
                ].map(([field, label, placeholder]) => (
                  <label key={field} style={{ display:`block`, minWidth:0 }}>
                    <span className={`kserif`} style={{ display:`block`, fontSize:9, color:C.muted, marginBottom:3, fontWeight:700 }}>{label}</span>
                    <input value={manualDraft[field]} onChange={e => updateManualDraft(field, e.target.value)} placeholder={placeholder}
                      style={{ width:`100%`, minWidth:0, background:C.paper, border:`1px solid ${C.lineSoft}`, padding:`7px 8px`, fontSize:11, outline:`none` }} />
                  </label>
                ))}
              </div>
              <input value={manualDraft.note} onChange={e => updateManualDraft(`note`, e.target.value)} placeholder={`메모`}
                style={{ width:`100%`, minWidth:0, background:C.paper, border:`1px solid ${C.lineSoft}`, padding:`7px 8px`, fontSize:11, outline:`none`, marginBottom:8 }} />
              <div style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:8, flexWrap:`wrap` }}>
                <div className={`mono`} style={{ fontSize:10, color:C.muted }}>
                  {manualPreview
                    ? `상위 ${manualPreview.topPercent ?? `-`}% · 평균대비 ${fmtSignedNumber(manualPreview.scoreMinusAverage)}`
                    : `회차·점수·등수를 입력하면 저장됩니다`}
                </div>
                <div style={{ display:`flex`, gap:6 }}>
                  <button onClick={resetManualDraft}
                    style={{ background:C.paper, color:C.muted, border:`1px solid ${C.line}`, padding:`6px 9px`, fontSize:10.5, cursor:`pointer` }}>
                    초기화
                  </button>
                  <button onClick={saveManualRow}
                    style={{ background:C.ink, color:`#fff`, border:`none`, padding:`6px 10px`, fontSize:10.5, cursor:`pointer`, fontWeight:700, display:`inline-flex`, alignItems:`center`, gap:5 }}>
                    <Plus size={12} /> {editingRankId ? `수정 저장` : `추가`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {parsed.length > 0 && (
          <div style={{ border:`1px solid ${C.lineSoft}`, background:`rgba(255,255,255,0.28)`, marginBottom:12, overflowX:`auto` }}>
            <table style={{ width:`100%`, borderCollapse:`collapse`, fontSize:10.5, whiteSpace:`nowrap` }}>
              <thead>
                <tr>
                  {[`회차`, `점수`, `등수`, `인원`, `상위`, `평균`, `차이`].map(h => (
                    <th key={h} style={{ padding:`6px 8px`, color:C.muted, borderBottom:`1px solid ${C.lineSoft}`, fontWeight:600, textAlign:`right` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 12).map(row => (
                  <tr key={`${row.round}-${row.score}-${row.rank}`}>
                    <td style={{ padding:`6px 8px`, textAlign:`right` }}>{row.round}회</td>
                    <td className={`mono`} style={{ padding:`6px 8px`, textAlign:`right`, fontWeight:600 }}>{row.score}</td>
                    <td className={`mono`} style={{ padding:`6px 8px`, textAlign:`right` }}>{row.rank}</td>
                    <td className={`mono`} style={{ padding:`6px 8px`, textAlign:`right`, color:C.muted }}>{row.totalStudents || `-`}</td>
                    <td className={`mono`} style={{ padding:`6px 8px`, textAlign:`right`, color:C.accent }}>{row.topPercent ?? `-`}%</td>
                    <td className={`mono`} style={{ padding:`6px 8px`, textAlign:`right`, color:C.muted }}>{row.averageScore ?? `-`}</td>
                    <td className={`mono`} style={{ padding:`6px 8px`, textAlign:`right`, color:(row.scoreMinusAverage || 0) >= 0 ? C.good : C.accent }}>{fmtSignedNumber(row.scoreMinusAverage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {savedRows.length > 0 && (
          <div>
            <div style={{ display:`flex`, gap:8, flexWrap:`wrap`, margin:`4px 0 8px` }}>
              <RankStat label={`저장`} value={`${savedRows.length}회`} />
              <RankStat label={`평균 상위`} value={`${savedSummary?.avgTop ?? `-`}%`} />
              <RankStat label={`평균대비`} value={fmtSignedNumber(savedSummary?.avgDiff)} tone={(savedSummary?.avgDiff || 0) >= 0 ? C.good : C.accent} />
            </div>
            <div style={{ fontSize:10, color:C.muted, marginBottom:8 }}>
              최고 {savedSummary?.bestRows?.[0] ? `${savedSummary.bestRows[0].round}회 ${savedSummary.bestRows[0].rank}등` : `-`} · 보강 {savedSummary?.weakestRows?.[0] ? `${savedSummary.weakestRows[0].round}회 ${savedSummary.weakestRows[0].rank}등` : `-`}
            </div>
            <RankSummaryBox summary={savedSummary} />
            <div style={{ borderTop:`1px dashed ${C.lineSoft}` }}>
              {savedRows.map(row => (
                <div key={row.id} style={{ display:`grid`, gridTemplateColumns:`44px 1fr auto auto`, alignItems:`center`, gap:8, padding:`8px 0`, borderBottom:`1px dashed ${C.lineSoft}`, fontSize:11 }}>
                  <div className={`mono`} style={{ color:C.muted }}>{row.round}회</div>
                  <div style={{ minWidth:0 }}>
                    <span className={`mono`} style={{ color:C.ink, fontWeight:700 }}>{row.score}점</span>
                    <span className={`mono`} style={{ color:C.accent, marginLeft:8 }}>{row.rank}등</span>
                    {row.totalStudents && <span className={`mono`} style={{ color:C.muted, marginLeft:4 }}>/ {row.totalStudents}명</span>}
                    <span className={`mono`} style={{ color:C.muted, marginLeft:8 }}>{row.topPercent ?? `-`}%</span>
                    {row.averageScore != null && <span className={`mono`} style={{ color:C.muted, marginLeft:8 }}>평 {row.averageScore}</span>}
                    {row.note && <span style={{ color:C.muted, marginLeft:8, fontSize:10 }}>{row.note}</span>}
                  </div>
                  <button onClick={() => startEdit(row)} style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, cursor:`pointer`, padding:`4px 7px`, color:C.muted, fontSize:10 }}>
                    수정
                  </button>
                  <button onClick={() => del(row.id)} style={{ background:`none`, border:`none`, cursor:`pointer`, padding:2, color:C.muted }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RankStat({ label, value, tone = C.ink }) {
  return (
    <div style={{ flex:`1 1 92px`, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`7px 8px`, minWidth:92 }}>
      <div className={`kserif`} style={{ fontSize:9, color:C.muted, letterSpacing:`0.12em`, fontWeight:700 }}>{label}</div>
      <div className={`mono`} style={{ fontSize:14, color:tone, fontWeight:700, marginTop:2 }}>{value}</div>
    </div>
  );
}

function RankSummaryBox({ summary }) {
  if (!summary?.text) return null;
  return (
    <div style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`10px 10px`, marginBottom:12 }}>
      <div style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:8, marginBottom:7 }}>
        <div className={`kserif`} style={{ fontSize:10, color:C.muted, letterSpacing:`0.16em`, fontWeight:700 }}>요약문</div>
        <button
          onClick={async () => {
            const ok = await copyToClipboard(summary.text);
            alert(ok ? `요약이 복사되었어요.` : `복사에 실패했습니다.`);
          }}
          style={{ background:C.paper, color:C.muted, border:`1px solid ${C.line}`, padding:`5px 8px`, fontSize:10, cursor:`pointer`, display:`inline-flex`, alignItems:`center`, gap:4 }}>
          <Copy size={11} /> 복사
        </button>
      </div>
      <textarea
        readOnly
        value={summary.text}
        rows={6}
        style={{
          width:`100%`,
          resize:`vertical`,
          background:C.paper,
          border:`1px solid ${C.lineSoft}`,
          padding:`9px 10px`,
          outline:`none`,
          fontSize:11,
          lineHeight:1.65,
          color:C.ink,
          fontFamily:`Noto Serif KR, serif`,
        }}
      />
    </div>
  );
}

/* ============================================================ EXAMS (기출 회차 점수) ============================================================ */

function ExamsView({ examScores, rankScores = [], setRankScores }) {
  const [filterSubject, setFilterSubject] = useState(`전체`);

  // matrix: subject x round
  const matrix = useMemo(() => {
    const m = {};
    Object.keys(SUBJECTS).filter(s => s !== `선택법`).forEach(s => { m[s] = {}; });
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

  const [chartMode, setChartMode] = useState(`correct`); // `correct` | `wrong`

  const chartData = useMemo(() => {
    const data = [];
    allRounds.forEach(r => {
      const row = { round: `${r}회` };
      Object.keys(matrix).forEach(sub => {
        const s = matrix[sub][r];
        if (s) {
          const totalQ = s.total || MCQ_TOTAL[sub] || 0;
          row[sub] = chartMode === `correct` ? (totalQ - s.wrong) : s.wrong;
        }
      });
      data.push(row);
    });
    return data;
  }, [allRounds, matrix, chartMode]);

  const subjects = Object.keys(SUBJECTS).filter(s => s !== `선택법`);
  const filteredScores = filterSubject === `전체` ? examScores : examScores.filter(s => s.subject === filterSubject);
  const sortedScores = [...filteredScores].sort((a,b) => b.date.localeCompare(a.date));

  return (
    <div className={`fadeIn`} style={{ padding:`18px 0 24px` }}>
      <div style={{ marginBottom:6 }}>
        <h1 className={`serif`} style={{ margin:0, fontSize:22, fontWeight:600 }}>기출 회차</h1>
        <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>객관식 점수와 사례형 등수 추이</div>
      </div>

      {chartData.length === 0 ? (
        <div style={{ background:C.paper, border:`1px dashed ${C.line}`, padding:24, textAlign:`center`, fontSize:12, color:C.muted, margin:`18px 0` }}>
          기록 탭에서 객관식 회차 점수를 입력해 보세요
        </div>
      ) : (
        <>
          {/* Trend chart */}
          <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`14px 12px 12px`, margin:`14px 0 18px` }}>
            <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`center`, marginBottom:10, paddingLeft:4 }}>
              <span className={`kserif`} style={{ fontSize:10, color:C.muted, letterSpacing:`0.18em`, fontWeight:600 }}>
                {chartMode === `correct` ? `맞은 개수 추이` : `틀린 개수 추이`}
              </span>
              <div style={{ display:`flex`, gap:0, border:`1px solid ${C.line}` }}>
                <button onClick={() => setChartMode(`correct`)}
                  style={{ background: chartMode === `correct` ? C.good : `transparent`, color: chartMode === `correct` ? `#fff` : C.muted, border:`none`, padding:`4px 10px`, fontSize:10, cursor:`pointer`, fontWeight:600 }}>
                  맞음
                </button>
                <button onClick={() => setChartMode(`wrong`)}
                  style={{ background: chartMode === `wrong` ? C.accent : `transparent`, color: chartMode === `wrong` ? `#fff` : C.muted, border:`none`, padding:`4px 10px`, fontSize:10, cursor:`pointer`, fontWeight:600 }}>
                  틀림
                </button>
              </div>
            </div>
            <ResponsiveContainer width={`100%`} height={200}>
              <LineChart data={chartData} margin={{ top:5, right:10, bottom:5, left:-10 }}>
                <CartesianGrid stroke={C.lineSoft} strokeDasharray={`3 3`} />
                <XAxis dataKey={`round`} tick={{ fontSize:10, fill:C.muted }} />
                <YAxis reversed={chartMode === `wrong`} tick={{ fontSize:10, fill:C.muted }} />
                <Tooltip contentStyle={{ background:C.paper, border:`1px solid ${C.line}`, fontSize:11 }} />
                {subjects.map(sub => (
                  <Line key={sub} type={`monotone`} dataKey={sub} stroke={SUBJECTS[sub].color} strokeWidth={2} dot={{ r:3 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display:`flex`, gap:12, justifyContent:`center`, marginTop:6, flexWrap:`wrap` }}>
              {subjects.map(sub => (
                <span key={sub} style={{ fontSize:10, color:C.muted, display:`inline-flex`, alignItems:`center`, gap:4 }}>
                  <span style={{ width:10, height:2, background:SUBJECTS[sub].color, display:`inline-block` }} /> {sub}<span className={`mono`} style={{ opacity:0.6, marginLeft:2 }}>({MCQ_TOTAL[sub]})</span>
                </span>
              ))}
            </div>
          </div>

          {/* Matrix */}
          <SectionTitle>회차 매트릭스</SectionTitle>
          <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`10px 0`, overflowX:`auto`, marginBottom:18 }}>
            <table style={{ width:`100%`, borderCollapse:`collapse`, fontSize:11 }}>
              <thead>
                <tr>
                  <th style={{ padding:`6px 10px`, textAlign:`left`, color:C.muted, fontWeight:500, borderBottom:`1px solid ${C.lineSoft}` }}>회차</th>
                  {subjects.map(sub => (
                    <th key={sub} style={{ padding:`6px 10px`, textAlign:`center`, color:SUBJECTS[sub].color, fontWeight:600, borderBottom:`1px solid ${C.lineSoft}` }}>
                      {SUBJECTS[sub].short}<span style={{ fontSize:9, opacity:0.6, marginLeft:2 }}>/{MCQ_TOTAL[sub]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRounds.map(r => (
                  <tr key={r}>
                    <td className={`mono`} style={{ padding:`6px 10px`, color:C.ink, borderBottom:`1px dashed ${C.lineSoft}` }}>{r}회</td>
                    {subjects.map(sub => {
                      const s = matrix[sub][r];
                      const totalQ = MCQ_TOTAL[sub];
                      const correct = s ? (s.total || totalQ) - s.wrong : null;
                      return (
                        <td key={sub} className={`mono`} style={{ padding:`6px 10px`, textAlign:`center`, borderBottom:`1px dashed ${C.lineSoft}`, fontWeight: s ? 600 : 400 }}>
                          {s ? (
                            <span>
                              <span style={{ color: SUBJECTS[sub].color }}>{correct}</span>
                              <span style={{ color: C.muted, fontSize:9, fontWeight:400 }}>·-{s.wrong}</span>
                            </span>
                          ) : <span style={{ color: C.muted }}>·</span>}
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

      <RankScoreOverview rankScores={rankScores} setRankScores={setRankScores} />

      {/* History list */}
      <SectionTitle>전체 기록</SectionTitle>
      <div style={{ display:`flex`, gap:6, marginBottom:10, flexWrap:`wrap` }}>
        {[`전체`, ...subjects].map(s => (
          <button key={s} onClick={() => setFilterSubject(s)}
            style={{
              background: filterSubject === s ? C.ink : C.paper,
              color: filterSubject === s ? `#fff` : C.muted,
              border: `1px solid ${filterSubject === s ? C.ink : C.line}`,
              padding:`4px 10px`, fontSize:11, cursor:`pointer`,
            }}>{s}</button>
        ))}
      </div>

      {sortedScores.length === 0 ? (
        <div style={{ fontSize:11, color:C.muted, textAlign:`center`, padding:14 }}>기록이 없습니다</div>
      ) : (
        <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`4px 14px` }}>
          {sortedScores.map(s => {
            const totalQ = s.total || MCQ_TOTAL[s.subject];
            const correct = totalQ - s.wrong;
            return (
              <div key={s.id} style={{ display:`flex`, alignItems:`center`, gap:8, padding:`8px 0`, borderBottom:`1px dashed ${C.lineSoft}`, fontSize:12 }}>
                <span className={`mono`} style={{ color:C.muted, fontSize:10, minWidth:48 }}>{s.date.slice(5)}</span>
                <span style={{ color:SUBJECTS[s.subject].color, fontWeight:600, minWidth:42 }}>{s.subject}</span>
                <span className={`mono`} style={{ color:C.muted, minWidth:30 }}>{s.round}회</span>
                <span className={`mono`} style={{ color:C.good, fontWeight:600, minWidth:34 }}>+{correct}</span>
                <span className={`mono`} style={{ color:C.accent, minWidth:30 }}>-{s.wrong}</span>
                {s.note && <span style={{ flex:1, fontSize:10, color:C.muted, fontStyle:`italic`, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap`, minWidth:0 }}>{s.note}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RankScoreOverview({ rankScores = [], setRankScores }) {
  const [openGroups, setOpenGroups] = useState({});
  const [editor, setEditor] = useState({
    open:false,
    id:null,
    seriesTitle:``,
    subject:`민사법`,
    type:`사례형`,
    draft: emptyRankDraft(),
  });
  const editorPreview = useMemo(() => parseManualRankDraft(editor.draft), [editor.draft]);
  const latestRows = useMemo(() => {
    const map = new Map();
    rankScores.forEach(row => {
      const key = rankScoreKey(row);
      const old = map.get(key);
      if (!old || (row.importedAt || row.date || ``) > (old.importedAt || old.date || ``)) map.set(key, row);
    });
    return [...map.values()].sort((a, b) => {
      const series = (a.seriesTitle || ``).localeCompare(b.seriesTitle || ``);
      if (series !== 0) return series;
      return (a.round || 0) - (b.round || 0);
    });
  }, [rankScores]);

  const grouped = useMemo(() => {
    const out = {};
    latestRows.forEach(row => {
      const key = `${row.seriesTitle || `등수표`} · ${row.subject || ``} ${row.type || ``}`.trim();
      if (!out[key]) out[key] = [];
      out[key].push(row);
    });
    return out;
  }, [latestRows]);

  if (latestRows.length === 0) return null;

  const groupedEntries = Object.entries(grouped);
  const openedCount = groupedEntries.filter(([title]) => openGroups[title]).length;

  function setEditorDraft(field, value) {
    setEditor(prev => ({ ...prev, draft: { ...prev.draft, [field]: value } }));
  }

  function openRankEditor(row, mode = `edit`) {
    setEditor({
      open:true,
      id: mode === `edit` ? row.id : null,
      seriesTitle: row.seriesTitle || `등수표`,
      subject: row.subject || `민사법`,
      type: row.type || `사례형`,
      draft: mode === `edit` ? rankDraftFromRow(row) : emptyRankDraft(),
    });
  }

  function closeRankEditor() {
    setEditor(prev => ({ ...prev, open:false, id:null, draft: emptyRankDraft() }));
  }

  function saveRankEditor() {
    if (!setRankScores) return;
    const parsedDraft = parseManualRankDraft(editor.draft);
    if (!parsedDraft) {
      alert(`회차, 점수, 등수는 꼭 입력해 주세요.`);
      return;
    }

    const old = editor.id ? rankScores.find(row => row.id === editor.id) : null;
    const next = {
      id: editor.id || uid(),
      date: old?.date || todayISO(),
      seriesTitle: editor.seriesTitle.trim() || `등수표`,
      subject: editor.subject,
      type: editor.type,
      ...parsedDraft,
      importedAt: new Date().toISOString(),
    };
    const baseRows = editor.id ? rankScores.filter(row => row.id !== editor.id) : rankScores;
    setRankScores(upsertRankScores(baseRows, [next]));
    closeRankEditor();
  }

  return (
    <>
      <SectionTitle>사례형 등수 추적</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`10px 12px`, marginBottom:18 }}>
        <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`center`, gap:8, marginBottom:8 }}>
          <div style={{ fontSize:11, color:C.muted }}>
            {groupedEntries.length}묶음 · {latestRows.length}회차
          </div>
          <div style={{ display:`flex`, gap:6, flexWrap:`wrap`, justifyContent:`flex-end` }}>
            {setRankScores && (
              <button onClick={() => openRankEditor(latestRows[0], `add`)}
                style={{ background:C.ink, color:`#fff`, border:`none`, padding:`5px 8px`, fontSize:10.5, cursor:`pointer`, display:`inline-flex`, alignItems:`center`, gap:4, fontWeight:700 }}>
                <Plus size={12} /> 새 기록
              </button>
            )}
            <button onClick={() => {
              const nextOpen = openedCount < groupedEntries.length;
              const next = {};
              groupedEntries.forEach(([title]) => { next[title] = nextOpen; });
              setOpenGroups(next);
            }}
              style={{ background:C.bg, color:C.muted, border:`1px solid ${C.lineSoft}`, padding:`5px 8px`, fontSize:10.5, cursor:`pointer`, display:`inline-flex`, alignItems:`center`, gap:4 }}>
              <ChevronDown size={12} style={{ transform: openedCount ? `rotate(180deg)` : `none` }} />
              {openedCount < groupedEntries.length ? `전체 펼치기` : `전체 접기`}
            </button>
          </div>
        </div>

        {editor.open && (
          <div style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`10px`, marginBottom:10 }}>
            <div style={{ display:`grid`, gridTemplateColumns:`1.5fr 1fr 1fr`, gap:6, marginBottom:8 }}>
              <input value={editor.seriesTitle} onChange={e => setEditor(prev => ({ ...prev, seriesTitle:e.target.value }))} placeholder={`묶음 이름`}
                style={{ minWidth:0, background:C.paper, border:`1px solid ${C.lineSoft}`, padding:`7px 8px`, fontSize:11, outline:`none` }} />
              <select value={editor.subject} onChange={e => setEditor(prev => ({ ...prev, subject:e.target.value }))}
                style={{ minWidth:0, background:C.paper, border:`1px solid ${C.lineSoft}`, padding:`7px 8px`, fontSize:11, outline:`none` }}>
                {Object.keys(SUBJECTS).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={editor.type} onChange={e => setEditor(prev => ({ ...prev, type:e.target.value }))}
                style={{ minWidth:0, background:C.paper, border:`1px solid ${C.lineSoft}`, padding:`7px 8px`, fontSize:11, outline:`none` }}>
                {RANK_SCORE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div style={{ display:`grid`, gridTemplateColumns:`repeat(auto-fit, minmax(82px, 1fr))`, gap:6, marginBottom:8 }}>
              {[
                [`round`, `회차`, `1회`],
                [`score`, `점수`, `18.5`],
                [`rank`, `등수`, `56`],
                [`totalStudents`, `인원`, `99`],
                [`averageScore`, `평균`, `19.6`],
              ].map(([field, label, placeholder]) => (
                <label key={field} style={{ display:`block`, minWidth:0 }}>
                  <span className={`kserif`} style={{ display:`block`, fontSize:9, color:C.muted, marginBottom:3, fontWeight:700 }}>{label}</span>
                  <input value={editor.draft[field]} onChange={e => setEditorDraft(field, e.target.value)} placeholder={placeholder}
                    style={{ width:`100%`, minWidth:0, background:C.paper, border:`1px solid ${C.lineSoft}`, padding:`7px 8px`, fontSize:11, outline:`none` }} />
                </label>
              ))}
            </div>
            <input value={editor.draft.note} onChange={e => setEditorDraft(`note`, e.target.value)} placeholder={`메모`}
              style={{ width:`100%`, minWidth:0, background:C.paper, border:`1px solid ${C.lineSoft}`, padding:`7px 8px`, fontSize:11, outline:`none`, marginBottom:8 }} />
            <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`center`, gap:8, flexWrap:`wrap` }}>
              <div className={`mono`} style={{ fontSize:10, color:C.muted }}>
                {editorPreview ? `상위 ${editorPreview.topPercent ?? `-`}% · 평균대비 ${fmtSignedNumber(editorPreview.scoreMinusAverage)}` : `회차·점수·등수를 입력하세요`}
              </div>
              <div style={{ display:`flex`, gap:6 }}>
                <button onClick={closeRankEditor}
                  style={{ background:C.paper, color:C.muted, border:`1px solid ${C.line}`, padding:`6px 9px`, fontSize:10.5, cursor:`pointer` }}>
                  닫기
                </button>
                <button onClick={saveRankEditor}
                  style={{ background:C.ink, color:`#fff`, border:`none`, padding:`6px 10px`, fontSize:10.5, cursor:`pointer`, fontWeight:700 }}>
                  {editor.id ? `수정 저장` : `추가`}
                </button>
              </div>
            </div>
          </div>
        )}

        {groupedEntries.map(([title, rows], gi) => {
          const summary = buildRankSummary(rows);
          const weakest = summary?.weakestRows?.[0] || null;
          const best = summary?.bestRows?.[0] || null;
          const isOpen = !!openGroups[title];
          const chartRows = rows.map(row => ({
            ...row,
            roundLabel: `${row.round}회`,
          }));
          const hasChart = chartRows.some(row => row.topPercent != null);

          return (
            <div key={title} style={{ borderTop: gi > 0 ? `1px dashed ${C.lineSoft}` : `none`, paddingTop: gi > 0 ? 10 : 0, marginTop: gi > 0 ? 10 : 0 }}>
              <button onClick={() => setOpenGroups(prev => ({ ...prev, [title]: !isOpen }))}
                style={{ width:`100%`, background:`transparent`, border:`none`, padding:`0 0 8px`, cursor:`pointer`, display:`grid`, gridTemplateColumns:`1fr auto`, alignItems:`center`, gap:8, color:C.ink, textAlign:`left` }}>
                <div style={{ minWidth:0 }}>
                  <div className={`kserif`} style={{ fontSize:12, fontWeight:700, color:C.ink, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{title}</div>
                  <div className={`mono`} style={{ fontSize:10, color:C.muted, marginTop:3 }}>
                    {rows.length}회 · 평균 상위 {summary?.avgTop ?? `-`}% · 평균대비 {fmtSignedNumber(summary?.avgDiff)}
                  </div>
                </div>
                <ChevronDown size={15} style={{ color:C.muted, transform: isOpen ? `rotate(180deg)` : `none`, transition:`transform .18s ease` }} />
              </button>

              <div style={{ display:`grid`, gridTemplateColumns:`repeat(3, 1fr)`, gap:6, marginBottom:isOpen ? 10 : 0 }}>
                <RankStat label={`평균 상위`} value={`${summary?.avgTop ?? `-`}%`} />
                <RankStat label={`최고 회차`} value={best ? `${best.round}회` : `-`} tone={C.good} />
                <RankStat label={`보강 회차`} value={weakest ? `${weakest.round}회` : `-`} tone={C.accent} />
              </div>

              {isOpen && (
                <div>
                  {setRankScores && (
                    <div style={{ display:`flex`, justifyContent:`flex-end`, marginBottom:8 }}>
                      <button onClick={() => openRankEditor(rows[0], `add`)}
                        style={{ background:C.bg, color:C.muted, border:`1px solid ${C.lineSoft}`, padding:`5px 8px`, fontSize:10.5, cursor:`pointer`, display:`inline-flex`, alignItems:`center`, gap:4 }}>
                        <Plus size={12} /> 이 묶음 추가
                      </button>
                    </div>
                  )}
                  <div style={{ border:`1px solid ${C.lineSoft}`, background:C.bg, padding:`8px 8px 4px`, marginBottom:8 }}>
                    {hasChart ? (
                      <ResponsiveContainer width={`100%`} height={180}>
                        <LineChart data={chartRows} margin={{ top:8, right:16, bottom:0, left:-8 }}>
                          <CartesianGrid stroke={C.lineSoft} strokeDasharray={`3 3`} vertical={false} />
                          <XAxis dataKey={`roundLabel`} tick={{ fontSize:10, fill:C.muted }} interval={0} />
                          <YAxis domain={[0, 100]} reversed ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize:10, fill:C.muted }} />
                          <Tooltip
                            contentStyle={{ background:C.paper, border:`1px solid ${C.line}`, fontSize:11 }}
                            labelStyle={{ color:C.ink }}
                            formatter={(value) => [`${value}%`, `상위비율`]}
                          />
                          <Line type={`monotone`} dataKey={`topPercent`} name={`상위비율`} stroke={C.accent} strokeWidth={2.5} dot={{ r:4, strokeWidth:2, fill:C.paper }} activeDot={{ r:5 }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height:72, display:`flex`, alignItems:`center`, justifyContent:`center`, fontSize:11, color:C.muted }}>
                        상위비율 데이터 없음
                      </div>
                    )}
                    <div style={{ display:`flex`, gap:10, justifyContent:`center`, flexWrap:`wrap`, fontSize:10, color:C.muted, margin:`2px 0 4px` }}>
                      {best && <span>최고 {best.round}회 {best.rank}등</span>}
                      {weakest && <span>보강 {weakest.round}회 {weakest.rank}등</span>}
                    </div>
                  </div>

                  <div style={{ overflowX:`auto`, maxHeight:220, border:`1px solid ${C.lineSoft}` }}>
                    <table style={{ width:`100%`, borderCollapse:`collapse`, fontSize:10.5, whiteSpace:`nowrap`, background:C.paper }}>
                      <thead>
                        <tr>
                          {[`회차`, `점수`, `등수`, `인원`, `상위`, `평균대비`, ...(setRankScores ? [`관리`] : [])].map(h => (
                            <th key={h} style={{ position:`sticky`, top:0, background:C.paper, padding:`6px`, borderBottom:`1px solid ${C.lineSoft}`, textAlign:h === `회차` ? `left` : `right`, color:C.muted, fontWeight:600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(row => (
                          <tr key={row.id}>
                            <td style={{ padding:`5px 6px`, borderBottom:`1px dashed ${C.lineSoft}`, color:C.muted }}>{row.round}회</td>
                            <td className={`mono`} style={{ padding:`5px 6px`, borderBottom:`1px dashed ${C.lineSoft}`, fontWeight:700, textAlign:`right` }}>{row.score}점</td>
                            <td className={`mono`} style={{ padding:`5px 6px`, borderBottom:`1px dashed ${C.lineSoft}`, color:C.accent, textAlign:`right` }}>{row.rank}등</td>
                            <td className={`mono`} style={{ padding:`5px 6px`, borderBottom:`1px dashed ${C.lineSoft}`, color:C.muted, textAlign:`right` }}>{row.totalStudents ? `${row.totalStudents}명` : `-`}</td>
                            <td className={`mono`} style={{ padding:`5px 6px`, borderBottom:`1px dashed ${C.lineSoft}`, textAlign:`right`, color:C.muted }}>{row.topPercent ?? `-`}%</td>
                            <td className={`mono`} style={{ padding:`5px 6px`, borderBottom:`1px dashed ${C.lineSoft}`, textAlign:`right`, color:(row.scoreMinusAverage || 0) >= 0 ? C.good : C.accent }}>{fmtSignedNumber(row.scoreMinusAverage)}</td>
                            {setRankScores && (
                              <td style={{ padding:`4px 6px`, borderBottom:`1px dashed ${C.lineSoft}`, textAlign:`right` }}>
                                <button onClick={() => openRankEditor(row, `edit`)}
                                  style={{ background:C.bg, color:C.muted, border:`1px solid ${C.lineSoft}`, padding:`3px 7px`, fontSize:10, cursor:`pointer` }}>
                                  수정
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ============================================================ REVIEW (회독) ============================================================ */

function ReviewView({ today, reviews, setReviews, books, setBooks, materials, setMaterials, materialLog, setMaterialLog, mcqProgress, setMcqProgress }) {
  const [tab, setTab] = useState(`weak`);

  const tabs = [
    { key:`weak`, label:`약점`, icon:Target },
    { key:`matrix`, label:`매트릭스`, icon:Layers },
    { key:`topics`, label:`주제`, icon:RotateCw },
    { key:`books`, label:`문제집`, icon:BookOpen },
    { key:`materials`, label:`자료`, icon:Library },
  ];

  return (
    <div className={`fadeIn`} style={{ padding:`18px 0 24px` }}>
      <div style={{ marginBottom:14 }}>
        <h1 className={`serif`} style={{ margin:0, fontSize:22, fontWeight:600 }}>회독</h1>
      </div>

      <div style={{ display:`flex`, gap:6, marginBottom:14, borderBottom:`1px solid ${C.line}`, overflowX:`auto` }} className={`hide-scroll`}>
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                background:`none`, border:`none`, padding:`8px 12px`, cursor:`pointer`,
                color: active ? C.accent : C.muted,
                borderBottom: active ? `2px solid ${C.accent}` : `2px solid transparent`,
                marginBottom:-1, display:`flex`, alignItems:`center`, gap:5,
                fontSize:12, fontWeight: active ? 600 : 400, fontFamily:`Noto Serif KR, serif`,
                whiteSpace:`nowrap`,
              }}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === `weak` && <WeakTopicBoard today={today} reviews={reviews} setReviews={setReviews} />}
      {tab === `matrix` && <McqMatrix today={today} mcqProgress={mcqProgress} setMcqProgress={setMcqProgress} />}
      {tab === `topics` && <TopicsReview today={today} reviews={reviews} setReviews={setReviews} />}
      {tab === `books` && <BooksReview today={today} books={books} setBooks={setBooks} />}
      {tab === `materials` && <MaterialsReview today={today} materials={materials} setMaterials={setMaterials} materialLog={materialLog} setMaterialLog={setMaterialLog} />}
    </div>
  );
}

function getReviewLectureTags(review) {
  if (review.sourceType !== `courseLecture`) return [];
  const tagLine = (review.note || ``).split(`\n`).find(line => line.startsWith(`태그:`));
  if (!tagLine) return [];
  return tagLine.replace(/^태그:\s*/, ``).split(`,`).map(t => t.trim()).filter(Boolean);
}

function getReviewDueInfo(review, today) {
  const intervals = review.intervals || [5, 3, 2];
  const idx = Math.min(review.cycleIndex || 0, intervals.length - 1);
  const base = review.lastReviewed || review.created || today;
  const dueDate = addDays(base, intervals[idx] || 0);
  return {
    dueDate,
    daysUntilDue: daysDiff(today, dueDate),
    roundNum: (review.cycleIndex || 0) + 1,
  };
}

function WeakTopicBoard({ today, reviews, setReviews }) {
  const taggedReviews = useMemo(() => {
    return reviews
      .filter(r => r.sourceType === `courseLecture`)
      .map(r => ({ ...r, ...getReviewDueInfo(r, today), lectureTags: getReviewLectureTags(r) }))
      .filter(r => r.lectureTags.length > 0)
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue || a.title.localeCompare(b.title));
  }, [reviews, today]);

  const groups = COURSE_TAGS.map(tag => {
    const items = taggedReviews.filter(r => r.lectureTags.includes(tag.label));
    return {
      ...tag,
      items,
      due: items.filter(r => r.daysUntilDue <= 0).length,
    };
  });
  const firstActive = groups.find(g => g.items.length > 0)?.key || COURSE_TAGS[0].key;
  const [activeTag, setActiveTag] = useState(firstActive);
  useEffect(() => {
    if (!groups.find(g => g.key === activeTag)?.items.length && firstActive !== activeTag) {
      setActiveTag(firstActive);
    }
  }, [activeTag, firstActive, groups]);

  const selected = groups.find(g => g.key === activeTag) || groups[0];
  const totalDue = taggedReviews.filter(r => r.daysUntilDue <= 0).length;

  function markReviewed(id) {
    setReviews(reviews.map(r => r.id === id ? advanceReviewCycle(r, today) : r));
  }

  function deleteReview(id) {
    setReviews(reviews.filter(r => r.id !== id));
  }

  if (taggedReviews.length === 0) {
    return (
      <div style={{ background:C.paper, border:`1px dashed ${C.line}`, padding:`28px 18px`, textAlign:`center`, color:C.muted, fontSize:12, lineHeight:1.7 }}>
        강의에서 어려움, 판례, 암기, 재복습 태그를 누르면<br />
        이곳에 약점 주제 보드가 자동으로 만들어집니다.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:`grid`, gridTemplateColumns:`repeat(3, minmax(0, 1fr))`, gap:6, marginBottom:12 }}>
        <CourseMiniStat label={`태그 주제`} value={taggedReviews.length} tone={C.ink} />
        <CourseMiniStat label={`오늘 복습`} value={totalDue} tone={totalDue > 0 ? C.accent : C.good} />
        <CourseMiniStat label={`태그`} value={groups.filter(g => g.items.length > 0).length} tone={C.book} />
      </div>

      <div className={`weak-board-grid`}>
        <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:10, marginBottom:12 }}>
          <div className={`kserif`} style={{ fontSize:12, fontWeight:700, color:C.ink, marginBottom:8 }}>태그별 보드</div>
          <div style={{ display:`flex`, flexDirection:`column`, gap:6 }}>
            {groups.map(group => {
              const active = activeTag === group.key;
              return (
                <button key={group.key} onClick={() => setActiveTag(group.key)} className={`tap`}
                  style={{
                    background:active ? C.ink : C.bg,
                    color:active ? `#fff` : C.ink,
                    border:`1px solid ${active ? C.ink : C.lineSoft}`,
                    padding:`8px 9px`,
                    display:`flex`,
                    alignItems:`center`,
                    justifyContent:`space-between`,
                    gap:8,
                    cursor:`pointer`,
                    textAlign:`left`,
                  }}>
                  <span className={`kserif`} style={{ fontSize:11, fontWeight:700 }}>{group.label}</span>
                  <span className={`mono`} style={{ fontSize:10, color:active ? `rgba(255,255,255,0.78)` : group.due > 0 ? C.accent : C.muted }}>
                    {group.due > 0 ? `${group.due}/${group.items.length}` : group.items.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`12px 13px`, marginBottom:12 }}>
          <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`baseline`, gap:8, marginBottom:10 }}>
            <div>
              <div className={`kserif`} style={{ fontSize:13, fontWeight:700, color:C.ink }}>{selected.label}</div>
              <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>강의 태그에서 자동 수집</div>
            </div>
            <span className={`mono`} style={{ fontSize:10, color:selected.due > 0 ? C.accent : C.muted, fontWeight:700 }}>
              오늘 {selected.due}
            </span>
          </div>

          {selected.items.length === 0 ? (
            <div style={{ fontSize:11, color:C.muted, padding:`12px 0` }}>이 태그의 강의 주제가 없습니다.</div>
          ) : (
            <div style={{ display:`flex`, flexDirection:`column`, gap:8 }}>
              {selected.items.map(item => {
                const isDue = item.daysUntilDue <= 0;
                return (
                  <div key={item.id} style={{ border:`1px solid ${isDue ? C.accent : C.lineSoft}`, background:C.bg, padding:`9px 10px`, display:`flex`, alignItems:`center`, gap:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, color:C.ink, fontWeight:600, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{item.title.replace(/^\[강의\]\s*/, ``)}</div>
                      <div style={{ display:`flex`, gap:5, flexWrap:`wrap`, marginTop:5 }}>
                        <span className={`mono`} style={{ fontSize:9, color:SUBJECTS[item.subject]?.color || C.muted }}>{item.subject}</span>
                        <span className={`mono`} style={{ fontSize:9, color:isDue ? C.accent : C.muted }}>{isDue ? `오늘` : `D-${item.daysUntilDue}`}</span>
                        {item.lectureTags.slice(0, 3).map(tag => (
                          <span key={tag} style={{ fontSize:9, color:C.muted, border:`1px solid ${C.lineSoft}`, background:C.paper, padding:`1px 4px` }}>{tag}</span>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => markReviewed(item.id)} className={`tap`}
                      style={{ background:isDue ? C.ink : C.paper, color:isDue ? `#fff` : C.ink, border:`1px solid ${isDue ? C.ink : C.line}`, padding:`5px 8px`, fontSize:9, cursor:`pointer`, flexShrink:0 }}>
                      완료
                    </button>
                    <button onClick={() => deleteReview(item.id)} className={`tap`}
                      style={{ background:C.paper, border:`1px solid ${C.lineSoft}`, width:28, height:28, display:`grid`, placeItems:`center`, cursor:`pointer`, flexShrink:0 }}>
                      <X size={11} color={C.muted} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* 객관식 3요소 × 7과목 매트릭스 — 최민하 합격수기 기반 권장 별점 */
function McqMatrix({ today, mcqProgress, setMcqProgress }) {
  const STAR_COLOR = `#D4A437`;
  const [selected, setSelected] = useState(null); // { areaId, pillar }

  function k(areaId, pillar) { return `${areaId}__${pillar}`; }
  function getCell(areaId, pillar) {
    return mcqProgress[k(areaId, pillar)] || { rounds: 0, target: 0, lastDate: null };
  }
  function setCell(areaId, pillar, patch) {
    const key = k(areaId, pillar);
    const cur = getCell(areaId, pillar);
    const updated = { ...cur, ...patch };
    if (updated.rounds === 0 && updated.target === 0 && !updated.lastDate) {
      const next = { ...mcqProgress };
      delete next[key];
      setMcqProgress(next);
    } else {
      setMcqProgress({ ...mcqProgress, [key]: updated });
    }
  }
  function bump(areaId, pillar, delta) {
    const cur = getCell(areaId, pillar);
    const newRounds = Math.max(0, cur.rounds + delta);
    setCell(areaId, pillar, {
      rounds: newRounds,
      lastDate: delta > 0 ? today : cur.lastDate,
    });
  }

  //
  function priority(area, pillar) {
    const w = area.weights[pillar];
    const c = getCell(area.id, pillar);
    if (w >= 4 && c.rounds === 0) return `urgent`;   //
    if (w >= 5 && c.rounds < 2) return `urgent`;
    if (w >= 4 && c.rounds < 2) return `attention`;
    return `ok`;
  }

  const sel = selected ? { area: MCQ_AREAS.find(a => a.id === selected.areaId), pillar: selected.pillar, cell: getCell(selected.areaId, selected.pillar) } : null;

  return (
    <>
      <div style={{ fontSize:11, color:C.muted, marginBottom:14, lineHeight:1.6 }}>
        7과목 × 3요소(기출/최판/법리) — 별점은 합격수기 권장 비중. 빨간 경고는 본인이 미흡한 칸.
      </div>

      {/* 매트릭스 표 */}
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`8px`, marginBottom:18, overflowX:`auto` }}>
        <table style={{ width:`100%`, borderCollapse:`collapse`, fontSize:11, minWidth:320 }}>
          <thead>
            <tr>
              <th style={{ padding:`6px 4px`, textAlign:`left`, color:C.muted, fontWeight:500, fontSize:10 }}>과목</th>
              {MCQ_PILLARS.map(p => (
                <th key={p} style={{ padding:`6px 4px`, textAlign:`center`, color:C.muted, fontWeight:600, fontSize:10 }}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MCQ_AREAS.map(area => (
              <tr key={area.id}>
                <td style={{ padding:`8px 6px`, borderTop:`1px dashed ${C.lineSoft}`, color:area.color, fontWeight:600, fontSize:12, fontFamily:`Noto Serif KR, serif` }}>
                  {area.name}
                </td>
                {MCQ_PILLARS.map(pillar => {
                  const w = area.weights[pillar];
                  const c = getCell(area.id, pillar);
                  const pri = priority(area, pillar);
                  const isSel = selected && selected.areaId === area.id && selected.pillar === pillar;
                  return (
                    <td key={pillar} onClick={() => setSelected({ areaId: area.id, pillar })}
                      style={{
                        padding:`6px 4px`, borderTop:`1px dashed ${C.lineSoft}`, textAlign:`center`,
                        background: isSel ? area.color : (pri === `urgent` ? `#FBE4E4` : pri === `attention` ? `#F4EAD0` : `transparent`),
                        cursor:`pointer`,
                      }}>
                      <div style={{ fontSize:10, color: isSel ? `#fff` : STAR_COLOR, fontWeight:700, letterSpacing:`-0.06em` }}>
                        {`★`.repeat(w)}<span style={{ color: isSel ? `rgba(255,255,255,0.4)` : `#E8DFC4` }}>{`★`.repeat(5 - w)}</span>
                      </div>
                      <div className={`mono`} style={{ fontSize:11, color: isSel ? `#fff` : (c.rounds > 0 ? area.color : C.muted), fontWeight:600, marginTop:3 }}>
                        {c.rounds}{c.target > 0 ? `/${c.target}` : ``}회
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 선택된 셀 상세 */}
      {sel ? (
        <div style={{ background:C.paper, border:`1px solid ${C.line}`, marginBottom:14 }}>
          <div style={{ background: sel.area.color, color:`#fff`, padding:`12px 14px`, display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:10 }}>
            <div>
              <div className={`serif`} style={{ fontSize:16, fontWeight:600 }}>{sel.area.name} · {sel.pillar}</div>
              <div style={{ fontSize:10, opacity:0.85, marginTop:3, fontFamily:`JetBrains Mono, monospace` }}>
                권장 비중 <span style={{ color:`#FFD466`, fontWeight:700 }}>{`★`.repeat(sel.area.weights[sel.pillar])}</span>
                {` · 마지막 회독 ${sel.cell.lastDate || `미회독`}`}
              </div>
            </div>
            <button onClick={() => setSelected(null)}
              style={{ background:`rgba(255,255,255,0.2)`, border:`none`, color:`#fff`, padding:`4px 8px`, cursor:`pointer`, fontSize:11 }}>
              <X size={12} />
            </button>
          </div>
          <div style={{ padding:`14px 16px` }}>
            <div style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between`, marginBottom:12 }}>
              <span style={{ fontSize:11, color:C.muted }}>현재 회독</span>
              <div style={{ display:`flex`, alignItems:`center`, gap:6 }}>
                <button onClick={() => bump(sel.area.id, sel.pillar, -1)}
                  style={{ background:C.bg, border:`1px solid ${C.line}`, width:32, height:32, cursor:`pointer`, display:`grid`, placeItems:`center`, color:C.muted }}>
                  <Minus size={13} />
                </button>
                <div className={`mono`} style={{ minWidth:48, textAlign:`center`, fontSize:20, fontWeight:700, color:sel.area.color }}>
                  {sel.cell.rounds}
                </div>
                <button onClick={() => bump(sel.area.id, sel.pillar, 1)}
                  style={{ background:sel.area.color, border:`none`, color:`#fff`, width:32, height:32, cursor:`pointer`, display:`grid`, placeItems:`center` }}>
                  <Plus size={13} />
                </button>
              </div>
            </div>
            <div style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between` }}>
              <span style={{ fontSize:11, color:C.muted }}>목표 회독 (선택)</span>
              <input type={`number`} value={sel.cell.target || ``} min={0}
                onChange={e => setCell(sel.area.id, sel.pillar, { target: parseInt(e.target.value) || 0 })}
                placeholder={`0`}
                style={{ width:60, background:C.bg, border:`1px solid ${C.line}`, padding:`5px 8px`, fontSize:13, textAlign:`center`, outline:`none`, fontFamily:`JetBrains Mono, monospace` }} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize:11, color:C.muted, textAlign:`center`, padding:`14px`, background:C.paper, border:`1px dashed ${C.line}`, marginBottom:14 }}>
          매트릭스의 칸을 탭해서 회독 수를 입력하세요.
        </div>
      )}

      {/* 빨간 경고 요약 */}
      {(() => {
        const urgent = [];
        MCQ_AREAS.forEach(area => {
          MCQ_PILLARS.forEach(pillar => {
            if (priority(area, pillar) === `urgent`) {
              urgent.push({ area, pillar, w: area.weights[pillar], c: getCell(area.id, pillar) });
            }
          });
        });
        if (urgent.length === 0) return null;
        return (
          <>
            <SectionTitle>점검 필요 ({urgent.length})</SectionTitle>
            <div style={{ display:`flex`, flexDirection:`column`, gap:6, marginBottom:14 }}>
              {urgent.slice(0, 8).map(u => (
                <button key={`${u.area.id}-${u.pillar}`} onClick={() => setSelected({ areaId: u.area.id, pillar: u.pillar })}
                  style={{ background:`#FBE4E4`, border:`1px solid ${C.accent}`, borderLeft:`3px solid ${u.area.color}`, padding:`8px 10px`, display:`flex`, justifyContent:`space-between`, alignItems:`center`, cursor:`pointer`, textAlign:`left` }}>
                  <span className={`kserif`} style={{ fontSize:12, fontWeight:600, color:C.ink }}>
                    {u.area.name} <span style={{ color:C.muted, fontWeight:400 }}>· {u.pillar}</span>
                    <span style={{ color:STAR_COLOR, marginLeft:6, letterSpacing:`-0.06em`, fontSize:10 }}>{`★`.repeat(u.w)}</span>
                  </span>
                  <span className={`mono`} style={{ fontSize:11, color:C.accent, fontWeight:600 }}>
                    {u.c.rounds === 0 ? `미시작` : `${u.c.rounds}회뿐`}
                  </span>
                </button>
              ))}
            </div>
          </>
        );
      })()}
    </>
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
      intervals: [5, 3, 2], note: data.note || ``,
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
      <button onClick={() => setShowAdd(true)} style={{ width:`100%`, background:C.ink, color:`#fff`, border:`none`, padding:`10px`, cursor:`pointer`, marginBottom:14, fontSize:12, display:`flex`, alignItems:`center`, justifyContent:`center`, gap:6 }}>
        <Plus size={14} /> 주제 추가
      </button>

      {showAdd && <AddReviewForm onAdd={addReview} onCancel={() => setShowAdd(false)} />}

      {enriched.length === 0 ? (
        <div style={{ textAlign:`center`, padding:30, color:C.muted, fontSize:12, background:C.paper, border:`1px dashed ${C.line}` }}>
          회독할 주제를 추가해 보세요
        </div>
      ) : (
        <div style={{ display:`flex`, flexDirection:`column`, gap:8 }}>
          {enriched.map(r => <ReviewCard key={r.id} review={r} onReviewed={() => markReviewed(r.id)} onDelete={() => delReview(r.id)} />)}
        </div>
      )}
    </>
  );
}

function AddReviewForm({ onAdd, onCancel }) {
  const [title, setTitle] = useState(``);
  const [subject, setSubject] = useState(`민사법`);
  const [note, setNote] = useState(``);

  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:14 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`주제 (예: 채권자대위)`}
        style={{ width:`100%`, background:C.bg, border:`1px solid ${C.line}`, padding:`8px 10px`, fontSize:12, marginBottom:8, outline:`none` }} />
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
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={`메모 (선택)`} rows={2}
        style={{ width:`100%`, background:C.bg, border:`1px solid ${C.line}`, padding:`8px 10px`, fontSize:12, marginBottom:10, outline:`none`, resize:`vertical`, fontFamily:`Noto Serif KR, serif` }} />
      <div style={{ display:`flex`, gap:6 }}>
        <button onClick={onCancel} style={{ flex:1, background:C.bg, border:`1px solid ${C.line}`, padding:`8px`, cursor:`pointer`, fontSize:12 }}>취소</button>
        <button onClick={() => title && onAdd({ title, subject, note })}
          style={{ flex:1, background:C.ink, color:`#fff`, border:`none`, padding:`8px`, cursor:`pointer`, fontSize:12 }}>추가</button>
      </div>
    </div>
  );
}

function ReviewCard({ review, onReviewed, onDelete }) {
  const isDue = review.daysUntilDue <= 0;
  const subColor = SUBJECTS[review.subject].color;
  const noteLines = (review.note || ``).split(`\n`);
  const lectureTags = getReviewLectureTags(review);
  const displayNote = noteLines
    .filter(line => !(review.sourceType === `courseLecture` && line.startsWith(`태그:`)))
    .join(`\n`)
    .trim();

  return (
    <div style={{ background:C.paper, border:`1px solid ${isDue ? C.accent : C.line}`, padding:`12px 14px`, display:`flex`, alignItems:`center`, gap:10 }}>
      <div style={{ width:3, alignSelf:`stretch`, background:subColor }} />
      <div style={{ flex:1 }}>
        <div style={{ display:`flex`, alignItems:`baseline`, justifyContent:`space-between`, gap:8 }}>
          <div style={{ fontSize:13, fontWeight:600, color:C.ink }}>{review.title}</div>
          <div className={`mono`} style={{ fontSize:10, color: isDue ? C.accent : C.muted, fontWeight: isDue ? 600 : 400 }}>
            {isDue ? `오늘` : `D-${review.daysUntilDue}`}
          </div>
        </div>
        <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>
          <span style={{ color:subColor, fontWeight:600 }}>{review.subject}</span> · 회독 {review.cycleIndex + 1}회차
          {review.sourceType === `courseLecture` && (
            <span style={{ color:C.accent, fontWeight:600 }}> · 강의 메모</span>
          )}
        </div>
        {review.sourceType === `courseLecture` && (
          <div style={{ display:`flex`, alignItems:`center`, gap:4, flexWrap:`wrap`, marginTop:6 }}>
            {review.lectureNum && (
              <span className={`mono`} style={{ fontSize:9, color:C.accent, border:`1px solid ${C.accent}`, padding:`2px 5px` }}>
                {review.lectureNum}강
              </span>
            )}
            {lectureTags.map(tag => (
              <span key={tag} style={{ fontSize:9, color:C.muted, border:`1px solid ${C.line}`, padding:`2px 5px`, background:C.bg }}>
                {tag}
              </span>
            ))}
          </div>
        )}
        {displayNote && <div style={{ fontSize:10, color:C.muted, marginTop:4, fontStyle:`italic`, whiteSpace:`pre-wrap` }}>{displayNote}</div>}
      </div>
      <button onClick={onReviewed} className={`tap`} style={{ background:C.ink, color:`#fff`, border:`none`, width:32, height:32, cursor:`pointer`, fontSize:10, display:`grid`, placeItems:`center`, flexShrink:0 }}>
        <Check size={11} />
      </button>
      <button onClick={onDelete} className={`tap`} style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, cursor:`pointer`, width:30, height:30, display:`grid`, placeItems:`center`, flexShrink:0 }}>
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
      target: data.target, current: 0, log: [], note: data.note || ``,
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
      <button onClick={() => setShowAdd(true)} style={{ width:`100%`, background:C.ink, color:`#fff`, border:`none`, padding:`10px`, cursor:`pointer`, marginBottom:14, fontSize:12, display:`flex`, alignItems:`center`, justifyContent:`center`, gap:6 }}>
        <Plus size={14} /> 문제집 추가
      </button>

      {showAdd && <AddBookForm onAdd={addBook} onCancel={() => setShowAdd(false)} />}

      {books.length === 0 ? (
        <div style={{ textAlign:`center`, padding:30, color:C.muted, fontSize:12, background:C.paper, border:`1px dashed ${C.line}` }}>
          문제집을 추가해 보세요
        </div>
      ) : (
        <div style={{ display:`flex`, flexDirection:`column`, gap:8 }}>
          {books.map(b => <BookCard key={b.id} book={b} onUp={() => bumpRound(b.id)} onDown={() => decRound(b.id)} onDelete={() => delBook(b.id)} />)}
        </div>
      )}
    </>
  );
}

function AddBookForm({ onAdd, onCancel }) {
  const [title, setTitle] = useState(``);
  const [subject, setSubject] = useState(`민사법`);
  const [target, setTarget] = useState(3);
  const [note, setNote] = useState(``);

  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:14 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`제목`}
        style={{ width:`100%`, background:C.bg, border:`1px solid ${C.line}`, padding:`8px 10px`, fontSize:12, marginBottom:8, outline:`none` }} />
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
      <div style={{ display:`flex`, gap:6, marginBottom:10, alignItems:`center` }}>
        <span style={{ fontSize:11, color:C.muted }}>목표 회독:</span>
        <input type={`number`} value={target} onChange={e => setTarget(parseInt(e.target.value) || 1)} min={1}
          style={{ width:50, background:C.bg, border:`1px solid ${C.line}`, padding:`5px`, fontSize:12, textAlign:`center`, outline:`none` }} />
        <span style={{ fontSize:11, color:C.muted }}>회</span>
      </div>
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={`메모 (선택)`} rows={2}
        style={{ width:`100%`, background:C.bg, border:`1px solid ${C.line}`, padding:`8px 10px`, fontSize:12, marginBottom:10, outline:`none`, resize:`vertical`, fontFamily:`Noto Serif KR, serif` }} />
      <div style={{ display:`flex`, gap:6 }}>
        <button onClick={onCancel} style={{ flex:1, background:C.bg, border:`1px solid ${C.line}`, padding:`8px`, cursor:`pointer`, fontSize:12 }}>취소</button>
        <button onClick={() => title && onAdd({ title, subject, target, note })}
          style={{ flex:1, background:C.ink, color:`#fff`, border:`none`, padding:`8px`, cursor:`pointer`, fontSize:12 }}>추가</button>
      </div>
    </div>
  );
}

function BookCard({ book, onUp, onDown, onDelete }) {
  const subColor = SUBJECTS[book.subject].color;
  const pct = Math.min(100, (book.current / book.target) * 100);
  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`12px 14px`, display:`flex`, gap:10 }}>
      <div style={{ width:3, alignSelf:`stretch`, background:subColor }} />
      <div style={{ flex:1 }}>
        <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`baseline` }}>
          <div style={{ fontSize:13, fontWeight:600 }}>{book.title}</div>
          <div className={`mono`} style={{ fontSize:11, color:C.ink }}>
            <span style={{ color: book.current >= book.target ? C.good : C.ink, fontWeight:600 }}>{book.current}</span>
            <span style={{ color:C.muted }}> / {book.target}</span>
          </div>
        </div>
        <div style={{ fontSize:10, color:subColor, fontWeight:600, marginTop:2 }}>{book.subject}</div>
        <div style={{ height:3, background:C.lineSoft, marginTop:8, position:`relative` }}>
          <div style={{ position:`absolute`, left:0, top:0, bottom:0, width:`${pct}%`, background: book.current >= book.target ? C.good : subColor }} />
        </div>
        {book.note && <div style={{ fontSize:10, color:C.muted, marginTop:6, fontStyle:`italic` }}>{book.note}</div>}
      </div>
      <div style={{ display:`flex`, flexDirection:`column`, gap:4 }}>
        <button onClick={onUp} style={{ background:C.ink, color:`#fff`, border:`none`, padding:`4px 6px`, cursor:`pointer` }}>
          <Plus size={11} />
        </button>
        <button onClick={onDown} style={{ background:C.bg, color:C.muted, border:`1px solid ${C.line}`, padding:`4px 6px`, cursor:`pointer` }}>
          <Minus size={11} />
        </button>
        <button onClick={onDelete} style={{ background:`none`, border:`none`, cursor:`pointer`, padding:`2px 0` }}>
          <X size={12} color={C.muted} />
        </button>
      </div>
    </div>
  );
}

function MaterialsReview({ today, materials, setMaterials, materialLog, setMaterialLog }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState(``);
  const [newSubject, setNewSubject] = useState(`민사법`);
  const [newTarget, setNewTarget] = useState(3);
  const [filter, setFilter] = useState(`전체`);

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
    setNewName(``); setShowAdd(false);
  }
  function bump(id) {
    setMaterials(materials.map(m => m.id === id ? { ...m, rounds: m.rounds + 1, lastDate: today } : m));
    const list = materialLog[today] || [];
    const mat = materials.find(m => m.id === id);
    setMaterialLog({ ...materialLog, [today]: [...list, { id: uid(), materialId: id, name: mat?.name || ``, date: today }] });
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

function lectureHasTag(lecture, tag) {
  return (lecture.tags || []).includes(tag);
}

function getLectureTagLabels(lecture) {
  return (lecture.tags || []).map(key => COURSE_TAGS.find(t => t.key === key)?.label).filter(Boolean);
}

function getLectureReviewIntervals(lecture) {
  if (lectureHasTag(lecture, `hard`)) return [1, 3, 5];
  if (lectureHasTag(lecture, `again`)) return [1, 2, 3];
  return [5, 3, 2];
}

function completeCourseLectureReview(lecture, today) {
  const tags = lecture.tags || [];
  const isHard = tags.includes(`hard`);
  const nextHardRound = isHard ? (lecture.hardReviewCount || 0) + 1 : 0;
  const hardDelays = [1, 3, 5];
  const nextDelay = hardDelays[Math.min(nextHardRound, hardDelays.length - 1)];
  return stripUndefined({
    ...lecture,
    reviewed: true,
    lastReviewed: today,
    tags: tags.filter(t => t !== `again`),
    nextReviewDate: isHard ? addDays(today, nextDelay) : null,
    hardReviewCount: isHard ? nextHardRound : 0,
  });
}

function advanceReviewCycle(review, today) {
  return {
    ...review,
    lastReviewed: today,
    cycleIndex: Math.min((review.cycleIndex || 0) + 1, (review.intervals || [5, 3, 2]).length - 1),
  };
}

function getCoursePace(course, today, settings) {
  const lectures = course.lectures || [];
  const total = lectures.length;
  const completed = lectures.filter(l => l.completed).length;
  const remaining = Math.max(0, total - completed);
  const startDate = course.startDate || course.createdAt || today;
  const targetEndDate = course.targetEndDate || settings?.examDate || addDays(today, 30);
  const elapsedDays = Math.max(1, daysDiff(startDate, today) + 1);
  const daysUntilTarget = Math.max(1, daysDiff(today, targetEndDate));
  const planDays = Math.max(1, daysDiff(startDate, targetEndDate) + 1);
  const elapsedInPlan = Math.max(0, Math.min(planDays, daysDiff(startDate, today) + 1));
  const plannedCompleted = total ? Math.min(total, Math.ceil((total * elapsedInPlan) / planDays)) : 0;
  const plannedBehind = Math.max(0, plannedCompleted - completed);
  const actualDaily = completed > 0 ? completed / elapsedDays : 0;
  const requiredDaily = remaining > 0 ? remaining / daysUntilTarget : 0;
  const requiredDailyCeil = remaining > 0 ? Math.max(1, Math.ceil(requiredDaily)) : 0;
  const projectedDays = remaining === 0 ? 0 : actualDaily > 0 ? Math.ceil(remaining / actualDaily) : null;
  const projectedEndDate = remaining === 0 ? today : projectedDays !== null ? addDays(today, projectedDays) : null;
  const projectedLagDays = projectedEndDate ? Math.max(0, daysDiff(targetEndDate, projectedEndDate)) : null;
  const targetPassedDays = Math.max(0, daysDiff(targetEndDate, today));
  const lagDays = projectedLagDays ?? targetPassedDays;

  let status = `onTrack`;
  if (remaining === 0) status = `done`;
  else if (targetPassedDays > 0 || (projectedLagDays ?? 0) >= 4 || plannedBehind >= 3) status = `delayed`;
  else if ((projectedLagDays ?? 0) > 0 || plannedBehind > 0 || actualDaily === 0) status = `caution`;

  return {
    course,
    total,
    completed,
    remaining,
    startDate,
    targetEndDate,
    elapsedDays,
    daysUntilTarget,
    plannedCompleted,
    plannedBehind,
    actualDaily,
    requiredDaily,
    requiredDailyCeil,
    projectedEndDate,
    projectedLagDays,
    lagDays,
    status,
  };
}

function buildCoursePaceSummary(courses, today, settings) {
  const rank = { delayed: 0, caution: 1, onTrack: 2, done: 3 };
  const items = courses
    .map(course => getCoursePace(course, today, settings))
    .filter(item => item.total > 0)
    .sort((a, b) => (
      rank[a.status] - rank[b.status]
      || (b.lagDays || 0) - (a.lagDays || 0)
      || b.plannedBehind - a.plannedBehind
      || a.targetEndDate.localeCompare(b.targetEndDate)
    ));
  return {
    items,
    active: items.filter(item => item.status !== `done`),
    delayed: items.filter(item => item.status === `delayed`).length,
    caution: items.filter(item => item.status === `caution`).length,
    done: items.filter(item => item.status === `done`).length,
  };
}

function buildCourseDailyQueue(course, today, settings) {
  const lectures = [...(course.lectures || [])].sort((a, b) => a.num - b.num);
  const targetEndDate = course.targetEndDate || settings?.examDate || addDays(today, 30);
  const targetReviewDate = course.targetReviewDate || targetEndDate;
  const daysUntilTarget = Math.max(1, daysDiff(today, targetEndDate));
  const daysUntilReviewTarget = Math.max(1, daysDiff(today, targetReviewDate));

  const watchCandidates = lectures.filter(l => !l.completed);
  const reviewCandidates = lectures
    .filter(l => {
      if (!l.completed) return false;
      const hasScheduledReview = !!l.nextReviewDate;
      const isDueScheduledReview = hasScheduledReview && l.nextReviewDate <= today;
      if (lectureHasTag(l, `again`)) return true;
      if (isDueScheduledReview) return true;
      return !l.reviewed && !hasScheduledReview;
    })
    .sort((a, b) => (a.nextReviewDate || today).localeCompare(b.nextReviewDate || today) || a.num - b.num);
  const watchCount = watchCandidates.length ? Math.max(1, Math.ceil(watchCandidates.length / daysUntilTarget)) : 0;
  const reviewCount = reviewCandidates.length ? Math.max(1, Math.ceil(reviewCandidates.length / daysUntilReviewTarget)) : 0;

  return {
    watch: watchCandidates.slice(0, watchCount),
    review: reviewCandidates.slice(0, reviewCount),
    watchCount,
    reviewCount,
  };
}

function buildCourseQueueItems(courses, today, settings) {
  return courses.flatMap(course => {
    const queue = buildCourseDailyQueue(course, today, settings);
    return [
      ...queue.watch.map(lecture => ({ type:`watch`, course, lecture })),
      ...queue.review.map(lecture => ({ type:`review`, course, lecture })),
    ];
  });
}

function courseLectureReviewKey(courseId, lectureNum) {
  return `course:${courseId}:lecture:${lectureNum}`;
}

function buildLectureReviewPayload(course, lecture) {
  const tags = getLectureTagLabels(lecture);
  const lines = [];
  if (tags.length > 0) lines.push(`태그: ${tags.join(`, `)}`);
  if ((lecture.note || ``).trim()) lines.push((lecture.note || ``).trim());
  return {
    title: `[강의] ${course.name} ${lecture.num}강 · ${lecture.title}`,
    note: lines.join(`\n`),
    hasContent: tags.length > 0 || !!(lecture.note || ``).trim(),
    sourceKey: courseLectureReviewKey(course.id, lecture.num),
    intervals: getLectureReviewIntervals(lecture),
  };
}

function CourseHubPanel({ courses, today, settings, onCompleteLecture, onReviewLecture }) {
  if (!courses.length) return null;
  const queueItems = buildCourseQueueItems(courses, today, settings);
  const watchItems = queueItems.filter(item => item.type === `watch`);
  const reviewItems = queueItems.filter(item => item.type === `review`);
  const pace = buildCoursePaceSummary(courses, today, settings);
  const taggedLectures = courses.reduce((sum, course) => sum + (course.lectures || []).filter(l => (l.tags || []).length > 0 || (l.note || ``).trim()).length, 0);
  const hardLectures = courses.reduce((sum, course) => sum + (course.lectures || []).filter(l => lectureHasTag(l, `hard`) || lectureHasTag(l, `again`)).length, 0);
  const riskCourse = pace.active.find(item => item.status === `delayed` || item.status === `caution`);
  const topItem = reviewItems[0] || watchItems[0] || null;
  const tone = pace.delayed > 0 ? C.accent : pace.caution > 0 ? C.warn : reviewItems.length > 0 ? C.accent : C.good;
  const statusLabel = pace.delayed > 0 ? `지연 ${pace.delayed}` : pace.caution > 0 ? `주의 ${pace.caution}` : `정상`;

  return (
    <section style={{ background:C.ink, color:`#fff`, border:`1px solid ${C.ink}`, padding:`14px`, marginBottom:12 }}>
      <div style={{ display:`flex`, alignItems:`flex-start`, justifyContent:`space-between`, gap:10, marginBottom:10 }}>
        <div style={{ minWidth:0 }}>
          <div className={`kserif`} style={{ fontSize:12, letterSpacing:`0.14em`, color:`rgba(255,255,255,0.72)`, fontWeight:700 }}>강의 허브</div>
          <div className={`serif`} style={{ fontSize:24, fontWeight:600, lineHeight:1.1, marginTop:4 }}>
            수강 {watchItems.length} · 복습 {reviewItems.length}
          </div>
        </div>
        <span className={`mono`} style={{ color:`#fff`, border:`1px solid rgba(255,255,255,0.25)`, padding:`3px 7px`, fontSize:10, flexShrink:0 }}>
          {statusLabel}
        </span>
      </div>

      <div style={{ display:`grid`, gridTemplateColumns:`repeat(4, minmax(0, 1fr))`, gap:5, marginBottom:10 }}>
        {[
          { label:`오늘 수강`, value:watchItems.length },
          { label:`오늘 복습`, value:reviewItems.length },
          { label:`위험`, value:pace.delayed + pace.caution },
          { label:`태그`, value:taggedLectures },
        ].map(stat => (
          <div key={stat.label} style={{ background:`rgba(255,255,255,0.08)`, border:`1px solid rgba(255,255,255,0.12)`, padding:`7px 5px`, minHeight:48, textAlign:`center` }}>
            <div className={`mono`} style={{ fontSize:16, fontWeight:700, lineHeight:1 }}>{stat.value}</div>
            <div className={`kserif`} style={{ fontSize:9, color:`rgba(255,255,255,0.62)`, marginTop:4 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {(topItem || riskCourse || hardLectures > 0) && (
        <div style={{ display:`flex`, flexDirection:`column`, gap:6 }}>
          {topItem && (
            <div style={{ background:`rgba(255,255,255,0.08)`, border:`1px solid rgba(255,255,255,0.12)`, padding:`9px 10px`, display:`flex`, alignItems:`center`, gap:8 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div className={`kserif`} style={{ color:`rgba(255,255,255,0.7)`, fontSize:10, fontWeight:700 }}>{topItem.type === `review` ? `오늘 우선 복습` : `오늘 우선 수강`}</div>
                <div style={{ fontSize:11, color:`#fff`, marginTop:3, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>
                  {topItem.course.name} · {topItem.lecture.num}강 {topItem.lecture.title}
                </div>
              </div>
              <button onClick={() => topItem.type === `review` ? onReviewLecture(topItem.course.id, topItem.lecture.num) : onCompleteLecture(topItem.course.id, topItem.lecture.num)} className={`tap`}
                style={{ background:`#fff`, color:C.ink, border:`none`, padding:`7px 9px`, fontSize:10, fontWeight:700, cursor:`pointer`, flexShrink:0 }}>
                {topItem.type === `review` ? `복습완료` : `완강`}
              </button>
            </div>
          )}

          {riskCourse && (
            <div style={{ background:`rgba(255,255,255,0.06)`, border:`1px solid rgba(255,255,255,0.12)`, padding:`9px 10px`, borderLeft:`3px solid ${tone}` }}>
              <div style={{ display:`flex`, alignItems:`baseline`, justifyContent:`space-between`, gap:8 }}>
                <div style={{ minWidth:0 }}>
                  <div className={`kserif`} style={{ color:`rgba(255,255,255,0.72)`, fontSize:10, fontWeight:700 }}>페이스 경고</div>
                  <div style={{ fontSize:11, color:`#fff`, marginTop:3, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{riskCourse.course.name}</div>
                </div>
                <div className={`mono`} style={{ fontSize:10, color:`#fff`, flexShrink:0 }}>
                  {riskCourse.plannedBehind > 0 ? `${riskCourse.plannedBehind}강 밀림` : riskCourse.projectedEndDate ? `${fmtShortDate(riskCourse.projectedEndDate)} 예상` : `시작 필요`}
                </div>
              </div>
              <div style={{ height:3, background:`rgba(255,255,255,0.18)`, marginTop:7, position:`relative` }}>
                <div style={{ position:`absolute`, left:0, top:0, bottom:0, width:`${riskCourse.total ? Math.round((riskCourse.completed / riskCourse.total) * 100) : 0}%`, background:tone }} />
              </div>
            </div>
          )}

          {hardLectures > 0 && (
            <div style={{ color:`rgba(255,255,255,0.7)`, fontSize:10, lineHeight:1.5 }}>
              어려움·재복습 태그 {hardLectures}개가 복습 큐와 인박스 후보로 이어집니다.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CoursesReview({ today, courses, setCourses, logs, setLogs, settings, reviews = [], setReviews, setTrackInbox }) {
  const [showAdd, setShowAdd] = useState(false); const [filter, setFilter] = useState(`전체`);
  function autoLogTime(subject, studyType, minutes) {
    if (minutes <= 0) return; const key = `${subject}::${studyType}`;
    setLogs(prev => {
      const dl = prev[today] || {};
      return { ...prev, [today]: { ...dl, [key]: (dl[key] || 0) + minutes } };
    });
  }
  function addCourse(data) {
    const completeThreshold = normalizeCourseThreshold(data.completeThreshold);
    const lectures = applyCourseCompletionThreshold(data.lectures, completeThreshold).map(l => ({ ...l, reviewed: false, tags: l.tags || [] }));
    const c = { id: uid(), name: data.name, subject: data.subject, studyType: COURSE_WATCH_TYPE, completeThreshold, lectures, createdAt: today, lastUpdated: today };
    setCourses([...courses, c]);
    const completedMin = lectures.filter(l => l.completed).reduce((s, l) => s + l.durationMin, 0); 
    autoLogTime(c.subject, COURSE_WATCH_TYPE, completedMin);
    setShowAdd(false);
  }
  function updateCourse(id, newLectures) {
    const prev = courses.find(c => c.id === id); if (!prev) return;
    const prevSet = new Set(prev.lectures.filter(l => l.completed).map(l => l.num));
    const prevByNum = new Map(prev.lectures.map(l => [l.num, l]));
    
    const mergedLectures = newLectures.map(l => {
      const prevLecture = prevByNum.get(l.num) || {};
      return stripUndefined({
        ...prevLecture,
        ...l,
        reviewed: l.reviewed !== undefined ? l.reviewed : !!prevLecture.reviewed,
        reviewDurationMin: l.reviewDurationMin !== undefined ? l.reviewDurationMin : prevLecture.reviewDurationMin,
      });
    });
    
    const addedMin = mergedLectures.filter(l => l.completed && !prevSet.has(l.num)).reduce((s, l) => s + l.durationMin, 0);
    
    setCourses(courses.map(c => c.id === id ? { ...c, lectures: mergedLectures, lastUpdated: today } : c)); 
    autoLogTime(prev.subject, COURSE_WATCH_TYPE, addedMin);
  }
  function updateCourseMeta(id, patch) { setCourses(courses.map(c => c.id === id ? { ...c, ...patch, lastUpdated: today } : c)); }
  function delCourse(id) {
    if (!confirm(`이 강의를 삭제할까요? 이미 합산된 학습시간은 그대로 유지됩니다.`)) return;
    setCourses(courses.filter(c => c.id !== id));
    if (setReviews) setReviews(reviews.filter(r => !(r.sourceType === `courseLecture` && r.courseId === id)));
  }
  function syncLectureReviewTopic(course, lecture) {
    if (!setReviews) return;
    const payload = buildLectureReviewPayload(course, lecture);
    setReviews(prev => {
      const existing = prev.find(r => r.sourceKey === payload.sourceKey);

      if (!payload.hasContent) {
        return existing ? prev.filter(r => r.id !== existing.id) : prev;
      }

      if (existing) {
        return prev.map(r => r.id === existing.id ? {
          ...r,
          title: payload.title,
          subject: course.subject,
          note: payload.note,
          intervals: payload.intervals,
          sourceType: `courseLecture`,
          courseId: course.id,
          lectureNum: lecture.num,
          updatedFromLectureAt: today,
        } : r);
      }

      return [...prev, {
        id: uid(),
        title: payload.title,
        subject: course.subject,
        created: today,
        lastReviewed: today,
        cycleIndex: 0,
        intervals: payload.intervals,
        note: payload.note,
        sourceType: `courseLecture`,
        sourceKey: payload.sourceKey,
        courseId: course.id,
        lectureNum: lecture.num,
        updatedFromLectureAt: today,
      }];
    });
  }
  function addTrackInboxItem(item) {
    if (!setTrackInbox || !item) return;
    setTrackInbox(prev => enqueueTrackInbox(prev, item));
  }
  function logReviewTime(id, minutes) {
    const course = courses.find(c => c.id === id); if (!course) return;
    autoLogTime(course.subject, COURSE_REVIEW_TYPE, minutes);
  }
  function completeQueuedLecture(id, lecNum) {
    const course = courses.find(c => c.id === id); if (!course) return;
    updateCourse(id, course.lectures.map(l => l.num === lecNum ? { ...l, progress: 100, completed: true } : l));
  }
  function reviewQueuedLecture(id, lecNum) {
    const course = courses.find(c => c.id === id); if (!course) return;
    const lecture = course.lectures.find(l => l.num === lecNum);
    updateCourse(id, course.lectures.map(l => l.num === lecNum ? completeCourseLectureReview(l, today) : l));
    if (setReviews && lecture) {
      const sourceKey = courseLectureReviewKey(course.id, lecture.num);
      setReviews(prev => prev.map(r => r.sourceKey === sourceKey ? advanceReviewCycle(r, today) : r));
    }
  }

  function advanceCourseReviewTopics(id, lecNums = []) {
    if (!setReviews || lecNums.length === 0) return;
    const numSet = new Set(lecNums);
    setReviews(prev => prev.map(r => (
      r.sourceType === `courseLecture` && r.courseId === id && numSet.has(r.lectureNum)
        ? advanceReviewCycle(r, today)
        : r
    )));
  }
  
  // 개별 강의 복습 토글 기능
  function toggleReview(id, lecNum) {
    const course = courses.find(c => c.id === id); if (!course) return;
    const lecture = course.lectures.find(l => l.num === lecNum);
    const nextReviewed = lecture ? !lecture.reviewed : false;
    updateCourse(id, course.lectures.map(l => {
      if (l.num !== lecNum) return l;
      if (nextReviewed) return completeCourseLectureReview(l, today);
      return { ...l, reviewed: false };
    }));
    if (nextReviewed && setReviews) {
      const sourceKey = courseLectureReviewKey(course.id, lecNum);
      setReviews(prev => prev.map(r => r.sourceKey === sourceKey ? advanceReviewCycle(r, today) : r));
    }
  }
  
  const filtered = filter === `전체` ? courses : courses.filter(c => c.subject === filter);
  const stats = filtered.reduce((acc, c) => {
    const lectures = c.lectures || [];
    acc.total += lectures.length;
    acc.completed += lectures.filter(l => l.completed).length;
    acc.reviewed += lectures.filter(l => l.reviewed).length;
    acc.tagged += lectures.filter(l => (l.tags || []).length > 0 || (l.note || ``).trim()).length;
    return acc;
  }, { total: 0, completed: 0, reviewed: 0, tagged: 0 });
  const watchPct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
  const reviewPct = stats.total ? Math.round((stats.reviewed / stats.total) * 100) : 0;

  return (
    <div className={`fadeIn`} style={{ padding:`18px 0 24px` }}>
      <div style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:12, marginBottom:14 }}>
        <div>
          <h1 className={`serif`} style={{ margin:0, fontSize:22, fontWeight:600 }}>강의</h1>
          <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>오늘 기준 · {fmtKDate(today)}</div>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ background:C.ink, color:`#fff`, border:`none`, padding:`8px 11px`, cursor:`pointer`, fontSize:11, display:`flex`, alignItems:`center`, justifyContent:`center`, gap:5, flexShrink:0 }}>
          <Plus size={13} /> 추가
        </button>
      </div>

      <div style={{ display:`grid`, gridTemplateColumns:`repeat(4, 1fr)`, gap:6, marginBottom:12 }}>
        <CourseMiniStat label={`강의`} value={filtered.length} />
        <CourseMiniStat label={`수강`} value={`${stats.completed}/${stats.total}`} tone={watchPct === 100 ? C.good : C.ink} />
        <CourseMiniStat label={`복습`} value={`${stats.reviewed}/${stats.total}`} tone={reviewPct === 100 ? C.good : C.ink} />
        <CourseMiniStat label={`메모`} value={stats.tagged} tone={stats.tagged > 0 ? C.accent : C.muted} />
      </div>

      <div style={{ display:`flex`, gap:6, marginBottom:12, overflowX:`auto`, paddingBottom:2 }} className={`hide-scroll`}>
        {[`전체`, ...Object.keys(SUBJECTS)].map(s => (<button key={s} onClick={() => setFilter(s)} style={{ background: filter === s ? C.ink : C.paper, color: filter === s ? `#fff` : C.muted, border: `1px solid ${filter === s ? C.ink : C.line}`, padding:`5px 10px`, fontSize:11, cursor:`pointer`, whiteSpace:`nowrap` }}>{s}</button>))}
      </div>

      <CourseHubPanel
        courses={filtered}
        today={today}
        settings={settings}
        onCompleteLecture={completeQueuedLecture}
        onReviewLecture={reviewQueuedLecture}
      />

      <CourseQueuePanel courses={filtered} today={today} settings={settings} onCompleteLecture={completeQueuedLecture} onReviewLecture={reviewQueuedLecture} />
      {showAdd && <AddCourseForm onAdd={addCourse} onCancel={() => setShowAdd(false)} />}
      {filtered.length === 0 ? (
        <div style={{ textAlign:`center`, padding:30, color:C.muted, fontSize:12, background:C.paper, border:`1px dashed ${C.line}` }}>{courses.length === 0 ? `강의를 추가해 보세요` : `이 과목에 등록된 강의가 없습니다.`}</div>
      ) : (
        <div style={{ display:`flex`, flexDirection:`column`, gap:10 }}>
          {filtered.map(c => (<CourseCard key={c.id} course={c} today={today} settings={settings} onUpdate={(lecs) => updateCourse(c.id, lecs)} onUpdateMeta={(patch) => updateCourseMeta(c.id, patch)} onDelete={() => delCourse(c.id)} onLogReviewTime={(minutes) => logReviewTime(c.id, minutes)} onLectureMetaChange={(lecture) => syncLectureReviewTopic(c, lecture)} onAddTrackInbox={(item) => addTrackInboxItem(item)} onToggleReview={(lecNum) => toggleReview(c.id, lecNum)} onBulkReviewAdvance={(lecNums) => advanceCourseReviewTopics(c.id, lecNums)} />))}
        </div>
      )}
    </div>
  );
}

function CourseMiniStat({ label, value, tone = C.ink }) {
  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`8px 9px` }}>
      <div className={`mono`} style={{ color:tone, fontSize:14, fontWeight:700, lineHeight:1.1, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{value}</div>
      <div style={{ color:C.muted, fontSize:10, marginTop:4 }}>{label}</div>
    </div>
  );
}

function CourseQueuePanel({ courses, today, settings, onCompleteLecture, onReviewLecture }) {
  const queued = courses.map(course => ({ course, queue: buildCourseDailyQueue(course, today, settings) }))
    .filter(({ queue }) => queue.watch.length > 0 || queue.review.length > 0);
  const totalWatch = queued.reduce((s, x) => s + x.queue.watch.length, 0);
  const totalReview = queued.reduce((s, x) => s + x.queue.review.length, 0);

  if (queued.length === 0) return null;

  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`13px 14px`, marginBottom:14 }}>
      <div style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:8, marginBottom:9 }}>
        <div className={`kserif`} style={{ fontSize:12, fontWeight:600, color:C.ink }}>오늘의 강의 큐</div>
        <div style={{ display:`flex`, gap:5, flexShrink:0 }}>
          <span className={`mono`} style={{ fontSize:10, color:C.ink, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`3px 6px` }}>수강 {totalWatch}</span>
          <span className={`mono`} style={{ fontSize:10, color:C.accent, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`3px 6px` }}>복습 {totalReview}</span>
        </div>
      </div>
      <div style={{ display:`flex`, flexDirection:`column`, gap:8 }}>
        {queued.map(({ course, queue }) => {
          const subColor = SUBJECTS[course.subject]?.color || C.muted;
          return (
            <div key={course.id} style={{ borderTop:`1px dashed ${C.lineSoft}`, borderLeft:`3px solid ${subColor}`, padding:`8px 0 0 9px` }}>
              <div style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:8, marginBottom:5 }}>
                <div style={{ minWidth:0 }}>
                  <span className={`kserif`} style={{ color:subColor, fontSize:11, fontWeight:600 }}>{course.subject}</span>
                  <span style={{ color:C.ink, fontSize:11, marginLeft:6, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{course.name}</span>
                </div>
                <span className={`mono`} style={{ color:C.muted, fontSize:9, flexShrink:0 }}>{getStudyTypeLabel(course.subject, course.studyType || COURSE_WATCH_TYPE)}</span>
              </div>
              {queue.watch.length > 0 && (
                <CourseQueueLine label={`수강`} color={subColor} lectures={queue.watch} actionLabel={`완강`} onAction={(lecNum) => onCompleteLecture(course.id, lecNum)} />
              )}
              {queue.review.length > 0 && (
                <CourseQueueLine label={`복습`} color={C.accent} lectures={queue.review} compact actionLabel={`복습완료`} onAction={(lecNum) => onReviewLecture(course.id, lecNum)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CourseQueueLine({ label, color, lectures, actionLabel, onAction, compact = false }) {
  return (
    <div style={{ display:`flex`, flexDirection:`column`, gap:3, marginTop:4 }}>
      {lectures.map(l => (
        <div key={`${label}-${l.num}`} onClick={compact ? () => onAction(l.num) : undefined}
          style={{ display:`flex`, alignItems:`center`, gap:6, fontSize:10, cursor: compact ? `pointer` : `default`, minHeight:34, padding: compact ? `3px 0` : `2px 0` }}>
          <span className={`kserif`} style={{ color, fontWeight:600, minWidth:28 }}>{label}</span>
          <span className={`mono`} style={{ color:C.muted, minWidth:30 }}>{l.num}강</span>
          <span style={{ flex:1, color:C.ink, minWidth:0, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{l.title}</span>
          {getLectureTagLabels(l).slice(0, 2).map(tag => (
            <span key={tag} style={{ color:C.accent, border:`1px solid ${C.lineSoft}`, padding:`1px 4px`, fontSize:8, flexShrink:0 }}>
              {tag}
            </span>
          ))}
          {compact ? (
            <button title={actionLabel} aria-label={actionLabel} onClick={(e) => { e.stopPropagation(); onAction(l.num); }} className={`tap`}
              style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, color, width:30, height:30, cursor:`pointer`, flexShrink:0, display:`grid`, placeItems:`center` }}>
              <CheckSquare size={15} />
            </button>
          ) : (
            <button onClick={() => onAction(l.num)} className={`tap`} style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, color:C.ink, padding:`5px 8px`, cursor:`pointer`, fontSize:9, flexShrink:0 }}>
              {actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function AddCourseForm({ onAdd, onCancel }) {
  const [name, setName] = useState(``);
  const [subject, setSubject] = useState(`민사법`);
  const [completeThreshold, setCompleteThreshold] = useState(DEFAULT_COURSE_COMPLETE_THRESHOLD);
  const [text, setText] = useState(``);
  const [excludedNums, setExcludedNums] = useState([]);

  useEffect(() => {
    setExcludedNums([]);
  }, [text]);

  const parsedRaw = useMemo(() => applyCourseCompletionThreshold(parseCourseText(text), completeThreshold), [text, completeThreshold]);
  const excludedSet = useMemo(() => new Set(excludedNums), [excludedNums]);
  const parsed = useMemo(() => parsedRaw.filter(l => !excludedSet.has(l.num)), [parsedRaw, excludedSet]);
  const excludedCount = parsedRaw.length - parsed.length;
  const completedCount = parsed.filter(l => l.completed).length;
  const totalMin = parsed.reduce((s, l) => s + l.durationMin, 0);
  const completedMin = parsed.filter(l => l.completed).reduce((s, l) => s + l.durationMin, 0);
  const canSubmit = name.trim() && parsed.length > 0;

  function submit() {
    if (!canSubmit) return;
    onAdd({ name: name.trim(), subject, completeThreshold, lectures: parsed });
  }

  function excludeParsedLecture(num) {
    setExcludedNums(prev => prev.includes(num) ? prev : [...prev, num]);
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

      <div style={{ display:`grid`, gridTemplateColumns:`1fr 1fr`, gap:8, marginBottom:10 }}>
        <div>
          <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>학습시간 분류</div>
          <div className={`mono`} style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`6px 8px`, color:SUBJECTS[subject].color, fontSize:10, fontWeight:600 }}>
            {COURSE_WATCH_TYPE}
          </div>
        </div>
        <div>
          <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>완강 인정 기준</div>
          <div style={{ display:`flex`, gap:4 }}>
            {COURSE_COMPLETE_THRESHOLDS.map(t => (
              <button key={t} onClick={() => setCompleteThreshold(t)}
                style={{
                  flex:1, background: completeThreshold === t ? SUBJECTS[subject].color : C.bg,
                  color: completeThreshold === t ? `#fff` : C.muted,
                  border:`1px solid ${completeThreshold === t ? SUBJECTS[subject].color : C.lineSoft}`,
                  padding:`6px 4px`, fontSize:10, cursor:`pointer`,
                }}>{t}%</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>진도표 텍스트 붙여넣기</div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={7}
        placeholder={`사이트의 강의 목록을 통째로 복사해서 붙여넣으세요.\n\n예:\n1강\t[OT] 강의 소개\t29분\t100%\t완강\n2강\t채권자대위권 ①\t55분\t50%`}
        style={{ width:`100%`, background:C.bg, border:`1px solid ${C.line}`, padding:`8px 10px`, fontSize:11, marginBottom:10, outline:`none`, resize:`vertical`, fontFamily:`JetBrains Mono, monospace`, lineHeight:1.5 }} />

      {parsedRaw.length > 0 && (
        <div style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`8px 10px`, marginBottom:10 }}>
          <div style={{ display:`flex`, justifyContent:`space-between`, marginBottom:6, fontSize:11 }}>
            <span style={{ color:C.muted }}>파싱 결과 미리보기</span>
            <span className={`mono`} style={{ color:C.ink, fontWeight:600 }}>{parsed.length}강 선택</span>
          </div>
          <div style={{ display:`flex`, gap:12, fontSize:10, marginBottom:6, flexWrap:`wrap` }}>
            <span className={`kserif`}>완강 <span className={`mono`} style={{ color:C.good, fontWeight:600 }}>{completedCount}/{parsed.length}</span></span>
            <span className={`kserif`}>총분량 <span className={`mono`} style={{ color:C.ink }}>{fmtMin(totalMin)}</span></span>
            <span className={`kserif`}>합산될 학습시간 <span className={`mono`} style={{ color:SUBJECTS[subject].color, fontWeight:600 }}>+{fmtMin(completedMin)}</span></span>
            {excludedCount > 0 && (
              <button onClick={() => setExcludedNums([])}
                style={{ background:C.paper, color:C.accent, border:`1px solid ${C.line}`, padding:`2px 6px`, fontSize:9.5, cursor:`pointer` }}>
                제외 {excludedCount}개 복구
              </button>
            )}
          </div>
          <div style={{ maxHeight:120, overflowY:`auto`, fontSize:10 }}>
            {parsedRaw.map(l => {
              const excluded = excludedSet.has(l.num);
              return (
              <div key={l.num} style={{ display:`flex`, gap:6, padding:`2px 0`, borderBottom:`1px dashed ${C.lineSoft}`, opacity: excluded ? 0.45 : 1 }}>
                <span className={`mono`} style={{ color:C.muted, minWidth:24 }}>{l.num}강</span>
                <span style={{ flex:1, color: excluded ? C.muted : C.ink, minWidth:0, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap`, textDecoration: excluded ? `line-through` : `none` }}>{l.title}</span>
                <span className={`mono`} style={{ color:C.muted }}>{l.durationMin}분</span>
                <span className={`mono`} style={{ color: l.completed ? C.good : C.muted, fontWeight: l.completed ? 600 : 400, minWidth:38, textAlign:`right` }}>
                  {l.completed ? `완강` : `${l.progress}%`}
                </span>
                <button onClick={() => excluded ? setExcludedNums(prev => prev.filter(n => n !== l.num)) : excludeParsedLecture(l.num)}
                  style={{ background:C.paper, color:excluded ? C.good : C.accent, border:`1px solid ${C.lineSoft}`, padding:`1px 5px`, fontSize:9, cursor:`pointer`, flexShrink:0 }}>
                  {excluded ? `복구` : `제외`}
                </button>
              </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display:`flex`, gap:6 }}>
        <button onClick={onCancel} style={{ flex:1, background:C.bg, border:`1px solid ${C.line}`, padding:`8px`, cursor:`pointer`, fontSize:12 }}>취소</button>
        <button onClick={submit} disabled={!canSubmit}
          style={{ flex:2, background: canSubmit ? C.ink : C.line, color:`#fff`, border:`none`, padding:`8px`, cursor: canSubmit ? `pointer` : `default`, fontSize:12, fontWeight:600 }}>
          {completedMin > 0 ? `저장 · +${fmtMin(completedMin)} 합산` : `저장`}
        </button>
      </div>
    </div>
  );
}

function CourseCard({ course, today, settings, onUpdate, onUpdateMeta, onDelete, onLogReviewTime, onLectureMetaChange, onAddTrackInbox, onToggleReview, onBulkReviewAdvance }) {
  const [open, setOpen] = useState(false); 
  const [updateMode, setUpdateMode] = useState(false); 
  const [manageOpen, setManageOpen] = useState(false);
  const [text, setText] = useState(``);
  const [memoOpenNum, setMemoOpenNum] = useState(null);
  const [updateExcludedNums, setUpdateExcludedNums] = useState([]);
  const [bulkRange, setBulkRange] = useState(``);
  const [bulkTag, setBulkTag] = useState(COURSE_TAGS[0]?.key || `hard`);
  
  // --- 👇 추가 및 개선된 타이머 로직 ---
  const [activeTimerLec, setActiveTimerLec] = useState(null);
  const [timerStartAt, setTimerStartAt] = useState(null);
  const [tick, setTick] = useState(0); // 실시간 초시계 상태

  // 초시계 타이머 구동
  useEffect(() => {
    if (!timerStartAt) return;
    const interval = setInterval(() => {
      setTick(Math.floor((Date.now() - timerStartAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [timerStartAt]);

  // 타이머 정지 및 시간 저장
  function stopReviewTimer(e, lecNum) {
    e.stopPropagation(); // 이벤트 씹힘 방지
    if (!timerStartAt) return;
    
    // 테스트 삼아 일찍 꺼도 최소 1분은 저장되도록 보장
    const elapsedMin = Math.max(1, Math.round((Date.now() - timerStartAt) / 60000));
    
    const updatedLectures = course.lectures.map(l => {
      if (l.num === lecNum) {
        const prevReviewMin = l.reviewDurationMin || 0;
        return { ...completeCourseLectureReview(l, today), reviewDurationMin: prevReviewMin + elapsedMin };
      }
      return l;
    });
    
    onUpdate(updatedLectures);
    onLogReviewTime && onLogReviewTime(elapsedMin);
    setActiveTimerLec(null);
    setTimerStartAt(null);
    setTick(0);
  }
  // --- 👆 타이머 로직 끝 ---

  const total = course.lectures.length;
  const completed = course.lectures.filter(l => l.completed).length; 
  const reviewed = course.lectures.filter(l => l.reviewed).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const reviewPct = total > 0 ? Math.round((reviewed / total) * 100) : 0;
  
  const subColor = SUBJECTS[course.subject]?.color || C.muted; 
  const typeLabel = getStudyTypeLabel(course.subject, course.studyType || COURSE_WATCH_TYPE);
  const completeThreshold = normalizeCourseThreshold(course.completeThreshold);
  const pace = getCoursePace(course, today, settings);
  const targetEndDate = pace.targetEndDate;
  const targetReviewDate = course.targetReviewDate || targetEndDate; 
  const daysUntilTarget = pace.daysUntilTarget;
  const daysUntilReviewTarget = Math.max(1, daysDiff(today, targetReviewDate));
  const startDate = pace.startDate;
  const remainingLectures = pace.remaining;
  const requiredPace = pace.requiredDailyCeil;
  const actualPace = pace.actualDaily;
  const isPaceGood = pace.status === `done` || pace.status === `onTrack`;
  const isPaceWarning = pace.status === `caution`;
  
  const remainingReviews = total - reviewed;
  const requiredReviewPace = Math.ceil(remainingReviews / daysUntilReviewTarget);
  const actualReviewPace = reviewed / pace.elapsedDays;
  const isReviewGood = actualReviewPace >= requiredReviewPace;
  const isReviewWarning = actualReviewPace >= (requiredReviewPace * 0.7) && !isReviewGood;
  
  useEffect(() => {
    setUpdateExcludedNums([]);
  }, [text]);

  const parsedUpdateRaw = useMemo(() => applyCourseCompletionThreshold(parseCourseText(text), completeThreshold), [text, completeThreshold]);
  const updateExcludedSet = useMemo(() => new Set(updateExcludedNums), [updateExcludedNums]);
  const parsedUpdate = useMemo(() => parsedUpdateRaw.filter(l => !updateExcludedSet.has(l.num)), [parsedUpdateRaw, updateExcludedSet]);
  const existingByNum = useMemo(() => new Map(course.lectures.map(l => [l.num, l])), [course.lectures]);
  const parsedNumSet = useMemo(() => new Set(parsedUpdate.map(l => l.num)), [parsedUpdate]);
  const addedLectureCount = parsedUpdate.filter(l => !existingByNum.has(l.num)).length;
  const removedLectureCount = course.lectures.filter(l => !parsedNumSet.has(l.num)).length;
  const excludedUpdateCount = parsedUpdateRaw.length - parsedUpdate.length;
  const newlyCompletedCount = parsedUpdate.filter(l => l.completed && !existingByNum.get(l.num)?.completed).length;
  const newlyCompletedMin = parsedUpdate
    .filter(l => l.completed && !existingByNum.get(l.num)?.completed)
    .reduce((s, l) => s + l.durationMin, 0);
  const canUpdateList = parsedUpdate.length > 0;
  const bulkNums = useMemo(() => parseLectureRangeText(bulkRange, course.lectures), [bulkRange, course.lectures]);
  const bulkNumSet = useMemo(() => new Set(bulkNums), [bulkNums]);
  const bulkSummary = bulkNums.length ? `${bulkNums.length}강 선택` : `범위를 입력하세요`;

  function cancelUpdateList() {
    setUpdateMode(false);
    setText(``);
  }

  function submitUpdateList() {
    if (!canUpdateList) return;
    onUpdate(parsedUpdate);
    cancelUpdateList();
  }

  function excludeUpdateLecture(num) {
    setUpdateExcludedNums(prev => prev.includes(num) ? prev : [...prev, num]);
  }

  function deleteLecture(lecNum) {
    const lecture = course.lectures.find(l => l.num === lecNum);
    if (!lecture) return;
    if (!confirm(`${lecNum}강을 삭제할까요? 이미 합산된 학습시간은 그대로 유지됩니다.`)) return;
    if (activeTimerLec === lecNum) {
      setActiveTimerLec(null);
      setTimerStartAt(null);
      setTick(0);
    }
    onUpdate(course.lectures.filter(l => l.num !== lecNum));
    if (onLectureMetaChange) onLectureMetaChange({ ...lecture, tags: [], note: `` });
  }

  function setBulkPreset(kind) {
    let nums = [];
    if (kind === `all`) nums = course.lectures.map(l => l.num);
    if (kind === `watch`) nums = course.lectures.filter(l => !l.completed).map(l => l.num);
    if (kind === `review`) nums = course.lectures.filter(l => l.completed && !l.reviewed).map(l => l.num);
    if (kind === `tagged`) nums = course.lectures.filter(l => (l.tags || []).length > 0 || (l.note || ``).trim()).map(l => l.num);
    setBulkRange(compactLectureNums(nums));
  }

  function applyBulk(action) {
    if (bulkNums.length === 0) {
      alert(`처리할 강의 범위를 입력해 주세요. 예: 1-5, 8, 10-12`);
      return;
    }
    if (action === `delete` && !confirm(`${compactLectureNums(bulkNums)}강을 삭제할까요? 이미 합산된 학습시간은 그대로 유지됩니다.`)) return;

    const changedLectures = [];
    let nextLectures = course.lectures.map(l => {
      if (!bulkNumSet.has(l.num)) return l;
      let next = l;
      if (action === `complete`) next = { ...l, progress: 100, completed: true };
      if (action === `review`) next = completeCourseLectureReview(l, today);
      if (action === `unreview`) next = { ...l, reviewed: false, nextReviewDate: null };
      if (action === `tagAdd`) {
        if ((l.tags || []).includes(bulkTag)) return l;
        const patch = nextLectureTagPatch(l, bulkTag, today);
        next = { ...l, ...patch };
        changedLectures.push(next);
      }
      if (action === `tagRemove`) {
        const current = l.tags || [];
        const nextTags = current.filter(t => t !== bulkTag);
        let nextReviewDate = l.nextReviewDate;
        if (bulkTag === `hard`) nextReviewDate = nextTags.includes(`again`) ? today : null;
        if (bulkTag === `again`) nextReviewDate = nextTags.includes(`hard`) ? (l.nextReviewDate || addDays(today, 1)) : null;
        next = {
          ...l,
          tags: nextTags,
          nextReviewDate,
          hardReviewCount: bulkTag === `hard` ? 0 : l.hardReviewCount,
        };
        if (current.includes(bulkTag)) changedLectures.push(next);
      }
      return next;
    });

    if (action === `delete`) {
      const deletedLectures = course.lectures.filter(l => bulkNumSet.has(l.num));
      nextLectures = course.lectures.filter(l => !bulkNumSet.has(l.num));
      deletedLectures.forEach(l => onLectureMetaChange && onLectureMetaChange({ ...l, tags: [], note: `` }));
    }

    onUpdate(nextLectures);
    if (action === `review`) onBulkReviewAdvance && onBulkReviewAdvance(bulkNums);
    changedLectures.forEach(l => onLectureMetaChange && onLectureMetaChange(l));
    if (action === `tagAdd`) {
      changedLectures.forEach(l => onAddTrackInbox && onAddTrackInbox(buildCourseTrackInboxItem(course, l, bulkTag, today)));
    }
    setBulkRange(``);
  }

  function updateLectureMeta(lecNum, patch) {
    let updatedLecture = null;
    const nextLectures = course.lectures.map(l => {
      if (l.num !== lecNum) return l;
      updatedLecture = { ...l, ...patch };
      return updatedLecture;
    });
    onUpdate(nextLectures);
    if (updatedLecture) onLectureMetaChange && onLectureMetaChange(updatedLecture);
  }

  function toggleLectureTag(lecNum, tagKey) {
    const lec = course.lectures.find(l => l.num === lecNum);
    const adding = !(lec?.tags || []).includes(tagKey);
    const patch = nextLectureTagPatch(lec, tagKey, today);
    updateLectureMeta(lecNum, patch);
    if (adding && lec) {
      onAddTrackInbox && onAddTrackInbox(buildCourseTrackInboxItem(course, { ...lec, ...patch }, tagKey, today));
    }
  }

  function sendLectureMemoToInbox(lecture, trackKey) {
    if (!lecture || !onAddTrackInbox) return;
    const memo = (lecture.note || ``).trim();
    const text = memo
      ? `[${course.subject}] ${course.name} ${lecture.num}강 · ${memo}`
      : `[${course.subject}] ${course.name} ${lecture.num}강 · ${lecture.title}`;
    onAddTrackInbox(buildTrackInboxItem({
      date: today,
      trackKey,
      text,
      source: `강의 메모`,
      sourceId: `course-memo:${course.id}:${lecture.num}:${trackKey}:${normalizeTrackInboxText(text)}`,
      subject: course.subject,
    }));
  }

  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}` }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding:`12px 14px`, display:`flex`, alignItems:`center`, gap:10, cursor:`pointer` }}>
        <div style={{ width:3, alignSelf:`stretch`, background:subColor }} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:`flex`, alignItems:`baseline`, justifyContent:`space-between`, gap:8 }}>
            <div className={`kserif`} style={{ fontSize:13, fontWeight:600, color:C.ink, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{course.name}</div>
            <div className={`mono`} style={{ fontSize:11, flexShrink:0 }}>
              수강 <span style={{ color: pct === 100 ? C.good : C.ink, fontWeight:600 }}>{completed}</span>
              <span style={{ color:C.muted, margin: '0 4px' }}>|</span>
              복습 <span style={{ color: reviewPct === 100 ? C.good : C.ink, fontWeight:600 }}>{reviewed}</span>
              <span style={{ color:C.muted, marginLeft:2 }}>/{total}</span>
            </div>
          </div>
          
          <div style={{ fontSize:10, color:C.muted, marginTop:3, display:`flex`, alignItems:`center`, gap:6, flexWrap:`wrap` }}>
            <span style={{ color:subColor, fontWeight:600 }}>{course.subject}</span> · {typeLabel}
            {remainingLectures > 0 && actualPace !== null && (
              <span style={{ color: isPaceGood ? C.good : isPaceWarning ? C.warn : C.accent, fontWeight: 600 }}>
                수강 {isPaceGood ? `안정` : isPaceWarning ? `주의` : `지연`}
              </span>
            )}
            {remainingLectures > 0 && (
              <span style={{ color:C.muted }}>
                완강 예상 {pace.projectedEndDate ? fmtShortDate(pace.projectedEndDate) : `계산 전`}
              </span>
            )}
            {remainingReviews > 0 && actualReviewPace !== null && (
              <span style={{ color: isReviewGood ? C.good : isReviewWarning ? C.warn : C.accent, fontWeight: 600 }}>
                복습 {isReviewGood ? `안정` : isReviewWarning ? `주의` : `지연`}
              </span>
            )}
          </div>
          <div style={{ height:4, background:C.lineSoft, marginTop:8, position:`relative`, overflow: 'hidden' }}>
            <div style={{ position:`absolute`, left:0, top:0, bottom:0, width:`${pct}%`, background: pct === 100 ? C.good : subColor, opacity: 0.4 }} />
            <div style={{ position:`absolute`, left:0, top:0, bottom:0, width:`${reviewPct}%`, background: reviewPct === 100 ? C.good : subColor }} />
          </div>
        </div>
        <ChevronDown size={14} color={C.muted} style={{ transform: open ? `rotate(180deg)` : `none`, transition:`transform .2s`, flexShrink:0 }} />
      </div>

      {open && (
        <div style={{ borderTop:`1px dashed ${C.lineSoft}`, padding:`10px 14px` }}>
          <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`center`, gap:8, marginBottom:10 }}>
            <div className={`mono`} style={{ fontSize:10, color:C.muted }}>총 {total}강 · 마지막 갱신 {course.lastUpdated || `-`}</div>
            <button onClick={() => setManageOpen(o => !o)}
              style={{ background:manageOpen ? C.ink : C.bg, color:manageOpen ? `#fff` : C.ink, border:`1px solid ${manageOpen ? C.ink : C.line}`, padding:`5px 8px`, cursor:`pointer`, fontSize:10, display:`flex`, alignItems:`center`, gap:4, flexShrink:0 }}>
              <SettingsIcon size={11} /> 관리
            </button>
          </div>

          {manageOpen && (
            <div style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:10, marginBottom:12 }}>
              <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`center`, gap:8, marginBottom:10 }}>
                <div style={{ fontSize:10, color:C.muted }}>목록 · 기준 · 목표일</div>
                <div style={{ display:`flex`, gap:6, flexShrink:0 }}>
                  <button onClick={() => setUpdateMode(true)} style={{ background:updateMode ? C.ink : C.paper, color:updateMode ? `#fff` : C.ink, border:`1px solid ${updateMode ? C.ink : C.line}`, padding:`5px 8px`, cursor:`pointer`, fontSize:10, display:`flex`, alignItems:`center`, gap:4 }}>
                    <RefreshCw size={11} /> 목록 갱신
                  </button>
                  <button onClick={onDelete} style={{ background:C.paper, color:C.accent, border:`1px solid ${C.line}`, padding:`5px 8px`, cursor:`pointer`, fontSize:10, display:`flex`, alignItems:`center`, gap:4 }}>
                    <Trash2 size={11} /> 삭제
                  </button>
                </div>
              </div>

              <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`center`, gap:8, background:C.paper, border:`1px solid ${C.lineSoft}`, padding:`7px 8px`, marginBottom:(updateMode || remainingLectures > 0 || remainingReviews > 0) ? 10 : 0 }}>
                <div style={{ fontSize:10, color:C.muted }}>
                  완강 기준 <span className={`mono`} style={{ color:subColor, fontWeight:600 }}>{completeThreshold}%</span>
                </div>
                <div style={{ display:`flex`, gap:4, flexShrink:0 }}>
                  {COURSE_COMPLETE_THRESHOLDS.map(t => (
                    <button key={t} onClick={() => onUpdateMeta && onUpdateMeta({ completeThreshold: t })}
                      style={{
                        background: completeThreshold === t ? subColor : C.paper,
                        color: completeThreshold === t ? `#fff` : C.muted,
                        border:`1px solid ${completeThreshold === t ? subColor : C.line}`,
                        padding:`4px 7px`, fontSize:10, cursor:`pointer`,
                      }}>{t}%</button>
                  ))}
                </div>
              </div>

              <div style={{ background:C.paper, border:`1px solid ${C.lineSoft}`, padding:`9px 10px`, marginBottom:(updateMode || remainingLectures > 0 || remainingReviews > 0) ? 10 : 0 }}>
                <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`center`, gap:8, marginBottom:7 }}>
                  <div className={`kserif`} style={{ fontSize:11, fontWeight:700, color:C.ink }}>범위 일괄 처리</div>
                  <div className={`mono`} style={{ fontSize:10, color:bulkNums.length ? subColor : C.muted, fontWeight:bulkNums.length ? 700 : 400 }}>{bulkSummary}</div>
                </div>
                <div style={{ display:`grid`, gridTemplateColumns:`minmax(0, 1fr) auto`, gap:6, marginBottom:7 }}>
                  <input value={bulkRange} onChange={e => setBulkRange(e.target.value)} placeholder={`예: 1-5, 8, 10-12`}
                    style={{ minWidth:0, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`7px 8px`, fontSize:11, outline:`none`, fontFamily:`JetBrains Mono, monospace` }} />
                  <select value={bulkTag} onChange={e => setBulkTag(e.target.value)}
                    style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`7px 8px`, fontSize:11, outline:`none` }}>
                    {COURSE_TAGS.map(tag => <option key={tag.key} value={tag.key}>{tag.label}</option>)}
                  </select>
                </div>
                <div style={{ display:`flex`, gap:5, flexWrap:`wrap`, marginBottom:7 }}>
                  <button onClick={() => setBulkPreset(`watch`)} style={{ background:C.bg, color:C.muted, border:`1px solid ${C.lineSoft}`, padding:`4px 7px`, fontSize:9.5, cursor:`pointer` }}>미수강</button>
                  <button onClick={() => setBulkPreset(`review`)} style={{ background:C.bg, color:C.muted, border:`1px solid ${C.lineSoft}`, padding:`4px 7px`, fontSize:9.5, cursor:`pointer` }}>미복습</button>
                  <button onClick={() => setBulkPreset(`tagged`)} style={{ background:C.bg, color:C.muted, border:`1px solid ${C.lineSoft}`, padding:`4px 7px`, fontSize:9.5, cursor:`pointer` }}>태그/메모</button>
                  <button onClick={() => setBulkPreset(`all`)} style={{ background:C.bg, color:C.muted, border:`1px solid ${C.lineSoft}`, padding:`4px 7px`, fontSize:9.5, cursor:`pointer` }}>전체</button>
                </div>
                <div style={{ display:`grid`, gridTemplateColumns:`repeat(auto-fit, minmax(86px, 1fr))`, gap:5 }}>
                  <button onClick={() => applyBulk(`complete`)} disabled={bulkNums.length === 0}
                    style={{ background:bulkNums.length ? subColor : C.lineSoft, color:bulkNums.length ? `#fff` : C.muted, border:`none`, padding:`6px 7px`, fontSize:10, cursor:bulkNums.length ? `pointer` : `default`, fontWeight:700 }}>
                    완강
                  </button>
                  <button onClick={() => applyBulk(`review`)} disabled={bulkNums.length === 0}
                    style={{ background:bulkNums.length ? C.good : C.lineSoft, color:bulkNums.length ? `#fff` : C.muted, border:`none`, padding:`6px 7px`, fontSize:10, cursor:bulkNums.length ? `pointer` : `default`, fontWeight:700 }}>
                    복습완료
                  </button>
                  <button onClick={() => applyBulk(`unreview`)} disabled={bulkNums.length === 0}
                    style={{ background:C.bg, color:bulkNums.length ? C.muted : C.lineSoft, border:`1px solid ${C.lineSoft}`, padding:`6px 7px`, fontSize:10, cursor:bulkNums.length ? `pointer` : `default` }}>
                    복습해제
                  </button>
                  <button onClick={() => applyBulk(`tagAdd`)} disabled={bulkNums.length === 0}
                    style={{ background:C.bg, color:bulkNums.length ? C.ink : C.lineSoft, border:`1px solid ${C.lineSoft}`, padding:`6px 7px`, fontSize:10, cursor:bulkNums.length ? `pointer` : `default` }}>
                    태그+
                  </button>
                  <button onClick={() => applyBulk(`tagRemove`)} disabled={bulkNums.length === 0}
                    style={{ background:C.bg, color:bulkNums.length ? C.muted : C.lineSoft, border:`1px solid ${C.lineSoft}`, padding:`6px 7px`, fontSize:10, cursor:bulkNums.length ? `pointer` : `default` }}>
                    태그-
                  </button>
                  <button onClick={() => applyBulk(`delete`)} disabled={bulkNums.length === 0}
                    style={{ background:C.paper, color:bulkNums.length ? C.accent : C.lineSoft, border:`1px solid ${bulkNums.length ? C.accent : C.lineSoft}`, padding:`6px 7px`, fontSize:10, cursor:bulkNums.length ? `pointer` : `default` }}>
                    삭제
                  </button>
                </div>
              </div>

              {updateMode && (
                <div style={{ background:C.paper, border:`1px solid ${C.lineSoft}`, padding:12, marginBottom:10 }}>
                  <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`center`, gap:8, marginBottom:6 }}>
                    <div style={{ fontSize:10, color:C.muted }}>새 진도표 붙여넣기</div>
                    <div className={`mono`} style={{ fontSize:10, color: parsedUpdateRaw.length > 0 ? C.ink : C.muted, fontWeight: parsedUpdateRaw.length > 0 ? 600 : 400 }}>
                      {parsedUpdateRaw.length > 0 ? `${parsedUpdate.length}강 선택` : `대기`}
                    </div>
                  </div>
                  <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
                    placeholder={`사이트의 최신 강의 목록을 통째로 붙여넣으세요.\n기존 복습 체크와 복습 시간은 유지됩니다.`}
                    style={{ width:`100%`, background:C.bg, border:`1px solid ${C.line}`, padding:`8px 10px`, fontSize:11, marginBottom:10, outline:`none`, resize:`vertical`, fontFamily:`JetBrains Mono, monospace`, lineHeight:1.5 }} />

                  {parsedUpdateRaw.length > 0 && (
                    <div style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`8px 10px`, marginBottom:10 }}>
                      <div style={{ display:`flex`, gap:12, fontSize:10, marginBottom:6, flexWrap:`wrap` }}>
                        <span className={`kserif`}>추가 <span className={`mono`} style={{ color:addedLectureCount > 0 ? subColor : C.muted, fontWeight:600 }}>{addedLectureCount}</span></span>
                        <span className={`kserif`}>제외 <span className={`mono`} style={{ color:removedLectureCount > 0 ? C.accent : C.muted, fontWeight:600 }}>{removedLectureCount}</span></span>
                        <span className={`kserif`}>새 완강 <span className={`mono`} style={{ color:newlyCompletedCount > 0 ? C.good : C.muted, fontWeight:600 }}>{newlyCompletedCount}</span></span>
                        <span className={`kserif`}>합산될 학습시간 <span className={`mono`} style={{ color:newlyCompletedMin > 0 ? subColor : C.muted, fontWeight:600 }}>+{fmtMin(newlyCompletedMin)}</span></span>
                        {excludedUpdateCount > 0 && (
                          <button onClick={() => setUpdateExcludedNums([])}
                            style={{ background:C.paper, color:C.accent, border:`1px solid ${C.line}`, padding:`2px 6px`, fontSize:9.5, cursor:`pointer` }}>
                            제외 {excludedUpdateCount}개 복구
                          </button>
                        )}
                      </div>
                      <div style={{ maxHeight:110, overflowY:`auto`, fontSize:10 }}>
                        {parsedUpdateRaw.map(l => {
                          const wasReviewed = !!existingByNum.get(l.num)?.reviewed;
                          const excluded = updateExcludedSet.has(l.num);
                          return (
                            <div key={l.num} style={{ display:`flex`, gap:6, padding:`2px 0`, borderBottom:`1px dashed ${C.lineSoft}`, opacity: excluded ? 0.45 : 1 }}>
                              <span className={`mono`} style={{ color:C.muted, minWidth:24 }}>{l.num}강</span>
                              <span style={{ flex:1, color: excluded ? C.muted : C.ink, minWidth:0, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap`, textDecoration: excluded ? `line-through` : `none` }}>{l.title}</span>
                              {wasReviewed && <span className={`mono`} style={{ color:C.good, minWidth:30 }}>복습</span>}
                              <span className={`mono`} style={{ color:C.muted, minWidth:34, textAlign:`right` }}>{l.durationMin || `-`}분</span>
                              <span className={`mono`} style={{ color: l.completed ? C.good : C.muted, fontWeight: l.completed ? 600 : 400, minWidth:38, textAlign:`right` }}>
                                {l.completed ? `완강` : `${l.progress}%`}
                              </span>
                              <button onClick={() => excluded ? setUpdateExcludedNums(prev => prev.filter(n => n !== l.num)) : excludeUpdateLecture(l.num)}
                                style={{ background:C.paper, color:excluded ? C.good : C.accent, border:`1px solid ${C.lineSoft}`, padding:`1px 5px`, fontSize:9, cursor:`pointer`, flexShrink:0 }}>
                                {excluded ? `복구` : `제외`}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ display:`flex`, gap:6 }}>
                    <button onClick={cancelUpdateList} style={{ flex:1, background:C.bg, border:`1px solid ${C.line}`, padding:`7px`, cursor:`pointer`, fontSize:11 }}>취소</button>
                    <button onClick={submitUpdateList} disabled={!canUpdateList}
                      style={{ flex:2, background: canUpdateList ? C.ink : C.line, color:`#fff`, border:`none`, padding:`7px`, cursor: canUpdateList ? `pointer` : `default`, fontSize:11, fontWeight:600 }}>
                      {newlyCompletedMin > 0 ? `갱신 · +${fmtMin(newlyCompletedMin)} 합산` : `목록 갱신`}
                    </button>
                  </div>
                </div>
              )}

              {(remainingLectures > 0 || remainingReviews > 0) && (
                <div style={{ background: C.paper, border: `1px solid ${C.lineSoft}`, padding: `12px`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {remainingLectures > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap:10, fontSize: 11 }}>
                      <div>
                        <span style={{ fontWeight: 600, color: isPaceGood ? C.good : isPaceWarning ? C.warn : C.accent }}>
                          수강 페이스
                        </span>
                        <div style={{ color: C.muted, marginTop: 4 }}>
                          현재 <span className="mono" style={{ color:C.ink, fontWeight:600 }}>{actualPace.toFixed(1)}</span>강/일 · 필요 <span className="mono" style={{ color:C.ink, fontWeight:600 }}>{requiredPace}</span>강/일
                          <span> · 예상 </span><span className="mono" style={{ color:C.ink, fontWeight:600 }}>{pace.projectedEndDate ? fmtShortDate(pace.projectedEndDate) : `계산 전`}</span>
                          {pace.plannedBehind > 0 && <span style={{ color:C.accent }}> · {pace.plannedBehind}강 밀림</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', gap: 10, flexWrap:`wrap`, justifyContent:`flex-end` }}>
                        <div>
                          <div style={{ color: C.muted, marginBottom: 2 }}>시작일</div>
                          <input type="date" value={startDate} onChange={e => onUpdateMeta && onUpdateMeta({ startDate: e.target.value })} style={{ border: `1px solid ${C.line}`, background: C.bg, outline: 'none', padding: '1px 3px', fontSize: 10, color: C.ink, fontFamily: `JetBrains Mono, monospace` }} />
                        </div>
                        <div>
                          <div style={{ color: C.muted, marginBottom: 2 }}>목표일 (D-{daysUntilTarget})</div>
                          <input type="date" value={targetEndDate} onChange={e => onUpdateMeta && onUpdateMeta({ targetEndDate: e.target.value })} style={{ border: `1px solid ${C.line}`, background: C.bg, outline: 'none', padding: '1px 3px', fontSize: 10, color: C.ink, fontFamily: `JetBrains Mono, monospace` }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {remainingLectures > 0 && remainingReviews > 0 && <div style={{ borderTop: `1px dashed ${C.lineSoft}` }} />}
                  {remainingReviews > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap:10, fontSize: 11 }}>
                      <div>
                        <span style={{ fontWeight: 600, color: isReviewGood ? C.good : isReviewWarning ? C.warn : C.accent }}>복습 페이스</span>
                        <div style={{ color: C.muted, marginTop: 4 }}>현재 <span className="mono" style={{ color:C.ink, fontWeight:600 }}>{actualReviewPace.toFixed(1)}</span>강/일 · 필요 <span className="mono" style={{ color:C.ink, fontWeight:600 }}>{requiredReviewPace}</span>강/일</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: C.muted, marginBottom: 2 }}>목표일 (D-{daysUntilReviewTarget})</div>
                        <input type="date" value={targetReviewDate} onChange={e => onUpdateMeta && onUpdateMeta({ targetReviewDate: e.target.value })} style={{ border: `1px solid ${C.line}`, background: C.bg, outline: 'none', padding: '1px 3px', fontSize: 10, color: C.ink, fontFamily: `JetBrains Mono, monospace` }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ maxHeight:240, overflowY:`auto`, marginBottom:10 }}>
            {course.lectures.map(l => {
              const isRunning = activeTimerLec === l.num;
              const isReviewOk = l.reviewDurationMin <= l.durationMin;
              const activeTags = (l.tags || []).map(key => COURSE_TAGS.find(t => t.key === key)?.label).filter(Boolean);
              const memoOpen = memoOpenNum === l.num;
              
              return (
                <div key={l.num} style={{ borderBottom:`1px dashed ${C.lineSoft}`, padding:`6px 0` }}>
                  <div style={{ display:`flex`, gap:6, fontSize:11, alignItems: 'center', minHeight:36 }}>
                    <span className={`mono`} style={{ color:C.muted, minWidth:26 }}>{l.num}강</span>
                    <span style={{ flex:1, color:C.ink, minWidth:0, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{l.title}</span>
                    {activeTags.length > 0 && (
                      <span style={{ color:C.accent, fontSize:9, maxWidth:82, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap`, flexShrink:0 }}>{activeTags.join(`·`)}</span>
                    )}
                    <button onClick={() => setMemoOpenNum(memoOpen ? null : l.num)} className={`tap`}
                      style={{ background:(l.note || activeTags.length) ? C.ink : C.bg, color:(l.note || activeTags.length) ? `#fff` : C.muted, border:`1px solid ${(l.note || activeTags.length) ? C.ink : C.line}`, padding:`5px 7px`, fontSize:9, cursor:`pointer`, flexShrink:0 }}>
                      메모
                    </button>
                    {manageOpen && (
                      <button title={`${l.num}강 삭제`} aria-label={`${l.num}강 삭제`} onClick={(e) => { e.stopPropagation(); deleteLecture(l.num); }} className={`tap`}
                        style={{ background:C.bg, color:C.accent, border:`1px solid ${C.line}`, width:28, height:28, cursor:`pointer`, flexShrink:0, display:`grid`, placeItems:`center` }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                    <span className={`mono`} style={{ color:C.muted, minWidth:30 }}>{l.durationMin || `-`}분</span>
                    <button onClick={(e) => { e.stopPropagation(); onToggleReview && onToggleReview(l.num); }} className={`tap`}
                      style={{
                        background: l.reviewed ? C.good : C.bg,
                        color: l.reviewed ? `#fff` : C.ink,
                        border:`1px solid ${l.reviewed ? C.good : C.line}`,
                        padding:`5px 8px`, fontSize:9, cursor:`pointer`, flexShrink:0,
                        display:`flex`, alignItems:`center`, gap:3,
                      }}>
                      {l.reviewed ? <CheckSquare size={11} /> : <Square size={11} />} {l.reviewed ? `완료` : `복습`}
                    </button>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 60 }}>
                      {isRunning ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span className="mono" style={{ color: C.accent, fontSize: 10, fontWeight: 600 }}>
                            {Math.floor(tick / 60)}:{(tick % 60).toString().padStart(2, '0')}
                          </span>
                          <button onClick={(e) => stopReviewTimer(e, l.num)} className={`tap`} style={{ background: C.accent, color: '#fff', border: 'none', padding: '5px 7px', fontSize: 9, borderRadius: 3, cursor: 'pointer' }}>
                            정지
                          </button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setActiveTimerLec(l.num); setTimerStartAt(Date.now()); setTick(0); }} className={`tap`} style={{ background: C.bg, color: C.ink, border: `1px solid ${C.line}`, padding: '5px 7px', fontSize: 9, borderRadius: 3, cursor: 'pointer', display:`flex`, alignItems:`center`, gap:3 }}>
                          <Clock size={10} /> 시작
                        </button>
                      )}
                      
                      {!isRunning && l.reviewed && l.reviewDurationMin !== undefined && (
                        <span className="mono" style={{ fontSize: 9, color: isReviewOk ? C.good : C.accent }}>
                          {l.reviewDurationMin}분 {isReviewOk ? `적정` : `초과`}
                        </span>
                      )}
                    </div>
                    
                    <span className={`mono`} style={{ color: l.completed ? C.ink : C.muted, fontWeight: l.completed ? 600 : 400, minWidth:38, textAlign:`right` }}>{l.completed ? `✓ 완강` : `${l.progress}%`}</span>
                  </div>
                  {memoOpen && (
                    <div style={{ margin:`7px 0 2px 32px`, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:8 }}>
                      <div style={{ display:`flex`, gap:4, flexWrap:`wrap`, marginBottom:6 }}>
                        {COURSE_TAGS.map(tag => {
                          const active = (l.tags || []).includes(tag.key);
                          return (
                            <button key={tag.key} onClick={() => toggleLectureTag(l.num, tag.key)}
                              style={{
                                background: active ? subColor : C.paper,
                                color: active ? `#fff` : C.muted,
                                border:`1px solid ${active ? subColor : C.line}`,
                                padding:`4px 7px`, fontSize:10, cursor:`pointer`,
                              }}>{tag.label}</button>
                          );
                        })}
                      </div>
                      <input value={l.note || ``} onChange={e => updateLectureMeta(l.num, { note: e.target.value })}
                        placeholder={`이 강의에서 다시 볼 포인트`}
                        style={{ width:`100%`, background:C.paper, border:`1px solid ${C.line}`, padding:`7px 8px`, outline:`none`, fontSize:11, color:C.ink }} />
                      <div style={{ display:`flex`, alignItems:`center`, gap:4, flexWrap:`wrap`, marginTop:6 }}>
                        <span className={`kserif`} style={{ fontSize:9, color:C.muted, marginRight:2 }}>인박스</span>
                        {TRACK_TYPES.map(track => (
                          <button key={track.key} title={`${track.label} 인박스에 담기`} onClick={() => sendLectureMemoToInbox(l, track.key)} className={`tap`}
                            style={{ background:C.paper, color:track.color, border:`1px solid ${C.lineSoft}`, width:23, height:23, display:`grid`, placeItems:`center`, fontSize:9, fontWeight:700, cursor:`pointer`, fontFamily:`Noto Serif KR, serif` }}>
                            {track.short}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
/* ============================================================ CHECKLIST (점수 누수 방어) ============================================================ */

function ChecklistView({ today, settings, checklists = [], setChecklists }) {
  const [activeId, setActiveId] = useState(checklists[0]?.id || null);
  const [showAdd, setShowAdd] = useState(false);
  const [newCatName, setNewCatName] = useState(``);
  const [newCatSubject, setNewCatSubject] = useState(`민사법`);

  const dday = daysDiff(today, settings.examDate);
  const isUrgent = dday >= 0 && dday <= 7;

  const active = checklists.find(c => c.id === activeId) || checklists[0];

  function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    const cat = {
      id: uid(), name, subject: newCatSubject,
      color: SUBJECTS[newCatSubject]?.color || C.muted,
      items: [], lastReviewed: null,
    };
    setChecklists([...checklists, cat]);
    setActiveId(cat.id);
    setNewCatName(``); setShowAdd(false);
  }
  function delCategory(id) {
    if (!confirm(`이 체크리스트를 삭제할까요? 안의 항목도 모두 사라집니다.`)) return;
    const next = checklists.filter(c => c.id !== id);
    setChecklists(next);
    if (activeId === id) setActiveId(next[0]?.id || null);
  }
  function addItem(text, stars = 2) {
    if (!active) return;
    const t = text.trim(); if (!t) return;
    setChecklists(checklists.map(c => c.id === active.id ? {
      ...c, items: [...c.items, { id: uid(), text: t, stars }],
    } : c));
  }
  function delItem(itemId) {
    setChecklists(checklists.map(c => c.id === active.id ? {
      ...c, items: c.items.filter(it => it.id !== itemId),
    } : c));
  }
  function updItem(itemId, patch) {
    setChecklists(checklists.map(c => c.id === active.id ? {
      ...c, items: c.items.map(it => it.id === itemId ? { ...it, ...patch } : it),
    } : c));
  }
  function moveItem(itemId, dir) {
    setChecklists(checklists.map(c => {
      if (c.id !== active.id) return c;
      const idx = c.items.findIndex(it => it.id === itemId);
      if (idx < 0) return c;
      const next = [...c.items];
      const newIdx = dir === `up` ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= next.length) return c;
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return { ...c, items: next };
    }));
  }
  function markReviewed() {
    if (!active) return;
    setChecklists(checklists.map(c => c.id === active.id ? { ...c, lastReviewed: today } : c));
  }
  function daysSinceReview(c) {
    if (!c.lastReviewed) return null;
    return daysDiff(c.lastReviewed, today);
  }

  return (
    <div className={`fadeIn`} style={{ padding:`18px 0 24px` }}>
      <div style={{ marginBottom:14 }}>
        <h1 className={`serif`} style={{ margin:0, fontSize:22, fontWeight:600 }}>체크리스트</h1>
        <div style={{ fontSize:11, color:C.muted, marginTop:3, lineHeight:1.5 }}>
          답안 작성 직전·직후 점검용 — 점수 누수 방어의 핵심.
        </div>
      </div>

      {isUrgent && (
        <div style={{ background:C.accent, color:`#fff`, padding:`10px 14px`, marginBottom:12, fontSize:12 }}>
          <span className={`kserif`} style={{ fontWeight:600 }}>D-{dday} · 직전 점검 모드</span>
          <div style={{ fontSize:11, opacity:0.9, marginTop:3 }}>각 카테고리를 매일 한 번 이상 회독하세요.</div>
        </div>
      )}

      {/* 카테고리 탭 */}
      <div style={{ display:`flex`, gap:6, overflowX:`auto`, marginBottom:12, paddingBottom:4 }} className={`hide-scroll`}>
        {checklists.map(c => {
          const sinceRev = daysSinceReview(c);
          const stale = sinceRev !== null && sinceRev >= 14;
          const fresh = sinceRev !== null && sinceRev <= 1;
          const isActive = c.id === active?.id;
          return (
            <button key={c.id} onClick={() => setActiveId(c.id)}
              style={{
                background: isActive ? c.color : C.paper,
                color: isActive ? `#fff` : C.ink,
                border: `1px solid ${isActive ? c.color : C.line}`,
                padding:`7px 12px`, cursor:`pointer`, fontSize:12,
                whiteSpace:`nowrap`, display:`flex`, alignItems:`center`, gap:5,
                fontWeight: isActive ? 600 : 400,
                position:`relative`,
              }}>
              {c.name}
              {sinceRev !== null && (
                <span className={`mono`} style={{
                  fontSize:9, opacity: isActive ? 0.85 : 0.6,
                  color: stale ? (isActive ? `#FFB6B6` : C.accent) : (fresh ? (isActive ? `#B6FFB6` : C.good) : `inherit`),
                  fontWeight: stale ? 700 : 400,
                }}>{sinceRev === 0 ? `오늘` : `${sinceRev}d`}</span>
              )}
              {sinceRev === null && (
                <span className={`mono`} style={{ fontSize:9, opacity:0.6 }}>—</span>
              )}
            </button>
          );
        })}
        <button onClick={() => setShowAdd(true)}
          style={{ background:C.bg, border:`1px dashed ${C.line}`, color:C.muted, padding:`7px 10px`, cursor:`pointer`, fontSize:12, whiteSpace:`nowrap`, display:`flex`, alignItems:`center`, gap:4 }}>
          <Plus size={12} /> 새 카테고리
        </button>
      </div>

      {showAdd && (
        <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:12, marginBottom:12 }}>
          <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
            placeholder={`카테고리 이름 (예: 공사례, 상법, 시험 직전)`}
            style={{ width:`100%`, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`7px 10px`, fontSize:12, marginBottom:8, outline:`none` }} />
          <div style={{ display:`flex`, gap:6, marginBottom:8 }}>
            {Object.keys(SUBJECTS).map(s => (
              <button key={s} onClick={() => setNewCatSubject(s)}
                style={{
                  flex:1, background: newCatSubject === s ? SUBJECTS[s].color : C.bg,
                  color: newCatSubject === s ? `#fff` : C.muted,
                  border: `1px solid ${newCatSubject === s ? SUBJECTS[s].color : C.lineSoft}`,
                  padding:`6px 4px`, fontSize:10, cursor:`pointer`,
                }}>{SUBJECTS[s].short}</button>
            ))}
          </div>
          <div style={{ display:`flex`, gap:6 }}>
            <button onClick={() => setShowAdd(false)} style={{ flex:1, background:C.bg, border:`1px solid ${C.line}`, padding:`7px`, cursor:`pointer`, fontSize:12 }}>취소</button>
            <button onClick={addCategory} style={{ flex:1, background:C.ink, color:`#fff`, border:`none`, padding:`7px`, cursor:`pointer`, fontSize:12 }}>추가</button>
          </div>
        </div>
      )}

      {!active ? (
        <div style={{ background:C.paper, border:`1px dashed ${C.line}`, padding:30, textAlign:`center`, fontSize:12, color:C.muted }}>
          왼쪽 위에서 카테고리를 만들어 시작하세요.
        </div>
      ) : (
        <ChecklistDetail
          category={active}
          onAddItem={addItem}
          onDelItem={delItem}
          onUpdItem={updItem}
          onMoveItem={moveItem}
          onMarkReviewed={markReviewed}
          onDelCategory={() => delCategory(active.id)}
          daysSinceReview={daysSinceReview(active)}
        />
      )}
    </div>
  );
}

function ChecklistDetail({ category, onAddItem, onDelItem, onUpdItem, onMoveItem, onMarkReviewed, onDelCategory, daysSinceReview }) {
  const [newText, setNewText] = useState(``);
  const [newStars, setNewStars] = useState(2);
  const [filterStars, setFilterStars] = useState(0); //
  const [editId, setEditId] = useState(null);

  const items = category.items.filter(it => it.stars >= filterStars);
  const stale = daysSinceReview !== null && daysSinceReview >= 14;

  function submit() {
    if (!newText.trim()) return;
    onAddItem(newText.trim(), newStars);
    setNewText(``);
  }

  return (
    <div>
      {/* 헤더 */}
      <div style={{
        background: category.color, color:`#fff`, padding:`14px 16px`, marginBottom:0,
        display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:10,
      }}>
        <div style={{ minWidth:0, flex:1 }}>
          <div className={`serif`} style={{ fontSize:18, fontWeight:600, letterSpacing:`-0.01em` }}>{category.name}</div>
          <div style={{ fontSize:10, opacity:0.85, marginTop:3, fontFamily:`JetBrains Mono, monospace` }}>
            {category.items.length}개 항목 · {` `}
            {daysSinceReview === null ? `미회독` :
             daysSinceReview === 0 ? `오늘 회독` :
             `${daysSinceReview}일 전 회독`}
            {stale && <span style={{ marginLeft:6, padding:`1px 5px`, background:`rgba(255,255,255,0.25)`, fontWeight:600 }}>점검 필요</span>}
          </div>
        </div>
        <button onClick={onMarkReviewed}
          style={{ background:`rgba(255,255,255,0.2)`, border:`1px solid rgba(255,255,255,0.4)`, color:`#fff`, padding:`7px 12px`, cursor:`pointer`, fontSize:11, display:`flex`, alignItems:`center`, gap:5, flexShrink:0 }}>
          <Check size={12} /> 회독 완료
        </button>
      </div>

      {/* 필터 / 추가 */}
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, borderTop:`none`, padding:`10px 14px` }}>
        <div style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between`, marginBottom:10 }}>
          <div style={{ display:`flex`, gap:5 }}>
            {[0, 1, 2, 3].map(s => (
              <button key={s} onClick={() => setFilterStars(s)}
                style={{
                  background: filterStars === s ? C.ink : C.bg,
                  color: filterStars === s ? `#fff` : C.muted,
                  border: `1px solid ${filterStars === s ? C.ink : C.lineSoft}`,
                  padding:`4px 8px`, fontSize:10, cursor:`pointer`,
                }}>
                {s === 0 ? `전체` : `★${s}↑`}
              </button>
            ))}
          </div>
          <button onClick={onDelCategory}
            style={{ background:`none`, border:`none`, color:C.muted, cursor:`pointer`, fontSize:10, display:`flex`, alignItems:`center`, gap:3 }}>
            <Trash2 size={11} /> 카테고리 삭제
          </button>
        </div>

        {/* 항목 목록 */}
        {items.length === 0 ? (
          <div style={{ fontSize:11, color:C.muted, textAlign:`center`, padding:`20px 0` }}>
            {category.items.length === 0 ? `아래에서 항목을 추가하세요.` : `필터 조건에 맞는 항목이 없습니다.`}
          </div>
        ) : (
          <div style={{ display:`flex`, flexDirection:`column`, gap:4, marginBottom:12 }}>
            {items.map((it, idx) => (
              <ChecklistItemRow key={it.id} item={it} idx={idx} total={items.length}
                isEditing={editId === it.id}
                onStartEdit={() => setEditId(it.id)}
                onCancelEdit={() => setEditId(null)}
                onSave={(patch) => { onUpdItem(it.id, patch); setEditId(null); }}
                onDelete={() => onDelItem(it.id)}
                onUp={() => onMoveItem(it.id, `up`)}
                onDown={() => onMoveItem(it.id, `down`)}
                color={category.color}
              />
            ))}
          </div>
        )}

        {/* 추가 폼 */}
        <div style={{ borderTop:`1px dashed ${C.lineSoft}`, paddingTop:10 }}>
          <div style={{ display:`flex`, gap:6, marginBottom:6 }}>
            <input value={newText} onChange={e => setNewText(e.target.value)}
              onKeyDown={e => { if (e.key === `Enter`) submit(); }}
              placeholder={`새 항목 (예: 공소시효 항변 검토)`}
              style={{ flex:1, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`8px 10px`, fontSize:12, outline:`none` }} />
            <button onClick={submit}
              style={{ background:C.ink, color:`#fff`, border:`none`, padding:`0 14px`, fontSize:12, cursor:`pointer` }}>
              <Plus size={13} />
            </button>
          </div>
          <div style={{ display:`flex`, gap:5, alignItems:`center`, fontSize:10, color:C.muted }}>
            <span>중요도</span>
            {[1, 2, 3].map(s => (
              <button key={s} onClick={() => setNewStars(s)}
                style={{
                  background: newStars === s ? `#D4A437` : `transparent`,
                  color: newStars === s ? `#fff` : `#D4A437`,
                  border: `1px solid #D4A437`,
                  padding:`3px 7px`, fontSize:10, cursor:`pointer`, fontWeight:700, letterSpacing:`-0.05em`,
                }}>{`★`.repeat(s)}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChecklistItemRow({ item, idx, total, isEditing, onStartEdit, onCancelEdit, onSave, onDelete, onUp, onDown, color }) {
  const [text, setText] = useState(item.text);
  const [stars, setStars] = useState(item.stars || 2);
  useEffect(() => { setText(item.text); setStars(item.stars || 2); }, [item.id, isEditing]);

  if (isEditing) {
    return (
      <div style={{ background:C.bg, border:`1px solid ${C.line}`, padding:`8px 10px` }}>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
          style={{ width:`100%`, background:C.paper, border:`1px solid ${C.lineSoft}`, padding:`6px 8px`, fontSize:12, outline:`none`, resize:`vertical`, fontFamily:`Noto Serif KR, serif`, marginBottom:6 }} />
        <div style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:6 }}>
          <div style={{ display:`flex`, gap:4 }}>
            {[1, 2, 3].map(s => (
              <button key={s} onClick={() => setStars(s)}
                style={{
                  background: stars === s ? `#D4A437` : C.paper,
                  color: stars === s ? `#fff` : `#D4A437`,
                  border: `1px solid #D4A437`,
                  padding:`3px 7px`, fontSize:10, cursor:`pointer`, fontWeight:700, letterSpacing:`-0.05em`,
                }}>{`★`.repeat(s)}</button>
            ))}
          </div>
          <div style={{ display:`flex`, gap:4 }}>
            <button onClick={onCancelEdit} style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`5px 10px`, cursor:`pointer`, fontSize:11 }}>취소</button>
            <button onClick={() => onSave({ text: text.trim() || item.text, stars })} style={{ background:C.ink, color:`#fff`, border:`none`, padding:`5px 10px`, cursor:`pointer`, fontSize:11 }}>저장</button>
          </div>
        </div>
      </div>
    );
  }

  const STAR_COLOR = `#D4A437`; //
  const borderWidth = item.stars === 3 ? 4 : item.stars === 2 ? 3 : 2;
  return (
    <div style={{
      background:C.bg, border:`1px solid ${C.lineSoft}`,
      padding:`8px 10px`, display:`flex`, alignItems:`flex-start`, gap:8,
      borderLeft:`${borderWidth}px solid ${color}`,
    }}>
      <span style={{ fontSize:11, color:STAR_COLOR, flexShrink:0, marginTop:1, fontFamily:`JetBrains Mono, monospace`, letterSpacing:`-0.05em`, fontWeight:700 }}>
        {`★`.repeat(item.stars || 1)}
      </span>
      <span onClick={onStartEdit}
        style={{ flex:1, fontSize:12, color:C.ink, lineHeight:1.5, cursor:`pointer`, fontFamily:`Noto Serif KR, serif`, minWidth:0 }}>
        {item.text}
      </span>
      <div style={{ display:`flex`, flexDirection:`column`, gap:1, flexShrink:0 }}>
        <button onClick={onUp} disabled={idx === 0}
          style={{ background:`none`, border:`none`, cursor: idx === 0 ? `default` : `pointer`, padding:`1px 4px`, color: idx === 0 ? C.lineSoft : C.muted, fontSize:9 }}>▲</button>
        <button onClick={onDown} disabled={idx === total - 1}
          style={{ background:`none`, border:`none`, cursor: idx === total - 1 ? `default` : `pointer`, padding:`1px 4px`, color: idx === total - 1 ? C.lineSoft : C.muted, fontSize:9 }}>▼</button>
      </div>
      <button onClick={onDelete}
        style={{ background:`none`, border:`none`, cursor:`pointer`, padding:`2px`, color:C.muted, flexShrink:0 }}>
        <X size={11} />
      </button>
    </div>
  );
}

/* ============================================================ REPORT (리포트) ============================================================ */

function classifyConditionText(text = ``) {
  const body = String(text || ``).toLowerCase();
  if (!body.trim()) return { key:`none`, label:`기록 없음`, color:C.muted };
  if (CONDITION_KEYWORDS.bad.some(k => body.includes(k))) return { key:`bad`, label:`저컨디션`, color:C.accent };
  if (CONDITION_KEYWORDS.good.some(k => body.includes(k))) return { key:`good`, label:`좋음`, color:C.good };
  return { key:`neutral`, label:`보통`, color:C.book };
}

function avgNumber(list) {
  const nums = list.filter(v => Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function buildConditionPerformance({ today, logs = {}, moods = {}, examScores = [], rankScores = [] }) {
  const rows = Object.keys(moods)
    .filter(date => date <= today && (moods[date] || ``).trim())
    .sort()
    .slice(-45)
    .map(date => {
      const condition = classifyConditionText(moods[date]);
      const minutes = Object.values(logs[date] || {}).reduce((s, v) => s + (v || 0), 0);
      const mcq = examScores.filter(s => s.date === date);
      const rank = rankScores.filter(s => s.date === date);
      const wrongRates = mcq.map(s => s.total ? (s.wrong / s.total) * 100 : null).filter(v => v != null);
      const rankPercents = rank.map(s => Number(s.topPercent)).filter(v => Number.isFinite(v));
      return {
        date,
        mood:moods[date],
        condition,
        minutes,
        mcqCount:mcq.length,
        rankCount:rank.length,
        avgWrongRate:avgNumber(wrongRates),
        avgRankPercent:avgNumber(rankPercents),
      };
    });

  const groups = [`good`, `neutral`, `bad`].map(key => {
    const items = rows.filter(row => row.condition.key === key);
    const meta = key === `good`
      ? { label:`좋음`, color:C.good }
      : key === `bad`
      ? { label:`저컨디션`, color:C.accent }
      : { label:`보통`, color:C.book };
    return {
      ...meta,
      key,
      count:items.length,
      avgMin:avgNumber(items.map(row => row.minutes)) || 0,
      avgWrongRate:avgNumber(items.map(row => row.avgWrongRate)),
      avgRankPercent:avgNumber(items.map(row => row.avgRankPercent)),
    };
  });

  const good = groups.find(g => g.key === `good`);
  const bad = groups.find(g => g.key === `bad`);
  const insight = good?.count && bad?.count
    ? `좋은 컨디션 평균 ${fmtHour(good.avgMin)}, 저컨디션 평균 ${fmtHour(bad.avgMin)}입니다.`
    : rows.length > 0
    ? `컨디션 메모 ${rows.length}일치가 쌓였습니다. 좋은/나쁜 날 키워드를 조금 더 적으면 비교가 선명해집니다.`
    : `하루 메모에 피곤, 불안, 좋음, 집중 같은 단어를 남기면 자동으로 묶입니다.`;

  return { rows, groups, insight, recent:rows.slice(-6).reverse() };
}

function DeadlineBackcastSection({ today, settings, courses = [], materials = [], reviews = [], schedules = [] }) {
  const examDate = settings.examDate || today;
  const examLeft = Math.max(1, daysDiff(today, examDate));
  const items = [];

  if (settings.examDate) {
    items.push({
      kind:`본시험`,
      title:settings.examLabel || `변호사시험`,
      dueDate:settings.examDate,
      daysLeft:daysDiff(today, settings.examDate),
      workload:`최종 압축`,
      action:`새 자료보다 기존 자료 회독으로 고정`,
      tone:C.accent,
      rank:0,
    });
  }

  (settings.mockExams || [])
    .filter(m => m.start >= today)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 2)
    .forEach(m => {
      const left = daysDiff(today, m.start);
      items.push({
        kind:`모의고사`,
        title:m.label,
        dueDate:m.start,
        daysLeft:left,
        workload:`${daysDiff(m.start, m.end) + 1}일`,
        action:left <= 0 ? `오늘 시작` : `${left}일 남음 · 복기 계획까지 미리 확보`,
        tone:left <= 7 ? C.accent : C.warn,
        rank:1,
      });
    });

  courses.forEach(course => {
    const lectures = course.lectures || [];
    const remainingWatch = lectures.filter(l => !l.completed).length;
    const targetEnd = course.targetEndDate || settings.examDate || addDays(today, 30);
    const watchLeft = daysDiff(today, targetEnd);
    if (remainingWatch > 0) {
      const tomorrowDays = Math.max(1, watchLeft - 1);
      const tomorrowNeed = Math.ceil(remainingWatch / tomorrowDays);
      const todayNeed = Math.ceil(remainingWatch / Math.max(1, watchLeft));
      const tone = watchLeft <= 0 || tomorrowNeed >= 5 ? C.accent : tomorrowNeed >= 3 ? C.warn : C.book;
      items.push({
        kind:`강의수강`,
        title:course.name,
        dueDate:targetEnd,
        daysLeft:watchLeft,
        workload:`${remainingWatch}강`,
        action:`오늘 안 하면 내일부터 ${tomorrowNeed}강/일${todayNeed !== tomorrowNeed ? ` (현재 ${todayNeed}강/일)` : ``}`,
        tone,
        rank:tone === C.accent ? 2 : tone === C.warn ? 3 : 5,
      });
    }

    const remainingReview = lectures.filter(l => l.completed && !l.reviewed).length;
    const targetReview = course.targetReviewDate || targetEnd;
    const reviewLeft = daysDiff(today, targetReview);
    if (remainingReview > 0) {
      const tomorrowNeed = Math.ceil(remainingReview / Math.max(1, reviewLeft - 1));
      const tone = reviewLeft <= 0 || tomorrowNeed >= 6 ? C.accent : tomorrowNeed >= 3 ? C.warn : C.good;
      items.push({
        kind:`강의복습`,
        title:course.name,
        dueDate:targetReview,
        daysLeft:reviewLeft,
        workload:`${remainingReview}강`,
        action:`오늘 안 하면 내일부터 ${tomorrowNeed}강/일 복습`,
        tone,
        rank:tone === C.accent ? 2 : tone === C.warn ? 3 : 5,
      });
    }
  });

  materials.forEach(mat => {
    const remaining = Math.max(0, (mat.target || 0) - (mat.rounds || 0));
    if (remaining === 0) return;
    const perWeek = Math.ceil((remaining / examLeft) * 7);
    items.push({
      kind:`자료회독`,
      title:mat.name,
      dueDate:examDate,
      daysLeft:daysDiff(today, examDate),
      workload:`${remaining}회`,
      action:`시험일까지 주 ${Math.max(1, perWeek)}회 페이스`,
      tone:perWeek >= 3 ? C.warn : C.book,
      rank:6,
    });
  });

  reviews
    .map(r => ({ ...r, ...getReviewDueInfo(r, today) }))
    .filter(r => r.daysUntilDue <= 7)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    .slice(0, 4)
    .forEach(r => {
      items.push({
        kind:`주제회독`,
        title:r.title,
        dueDate:r.dueDate,
        daysLeft:r.daysUntilDue,
        workload:`${r.roundNum}회차`,
        action:r.daysUntilDue < 0 ? `${Math.abs(r.daysUntilDue)}일 밀림` : r.daysUntilDue === 0 ? `오늘 회독` : `${r.daysUntilDue}일 안에 회독`,
        tone:r.daysUntilDue < 0 ? C.accent : r.daysUntilDue <= 1 ? C.warn : C.good,
        rank:r.daysUntilDue < 0 ? 2 : 4,
      });
    });

  schedules
    .filter(s => s.start >= today)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 3)
    .forEach(s => {
      const left = daysDiff(today, s.start);
      items.push({
        kind:`일정`,
        title:s.title,
        dueDate:s.start,
        daysLeft:left,
        workload:`${daysDiff(s.start, s.end) + 1}일`,
        action:left === 0 ? `오늘 시작` : `${left}일 후 시작`,
        tone:s.color || C.muted,
        rank:7,
      });
    });

  const sorted = items.sort((a, b) => a.rank - b.rank || a.daysLeft - b.daysLeft).slice(0, 10);
  if (sorted.length === 0) return null;

  return (
    <>
      <SectionTitle>마감 역산</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`6px 13px`, marginBottom:18 }}>
        {sorted.map((item, idx) => (
          <div key={`${item.kind}-${item.title}-${item.dueDate}-${idx}`} style={{ display:`grid`, gridTemplateColumns:`72px 1fr auto`, gap:8, alignItems:`center`, padding:`10px 0`, borderBottom:idx < sorted.length - 1 ? `1px dashed ${C.lineSoft}` : `none` }}>
            <div>
              <div className={`kserif`} style={{ fontSize:10, color:item.tone, fontWeight:700 }}>{item.kind}</div>
              <div className={`mono`} style={{ fontSize:9, color:C.muted, marginTop:3 }}>{item.dueDate?.slice(5) || ``}</div>
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:11, color:C.ink, fontWeight:600, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{item.title}</div>
              <div style={{ fontSize:10, color:C.muted, marginTop:3, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{item.action}</div>
            </div>
            <div style={{ textAlign:`right`, flexShrink:0 }}>
              <div className={`mono`} style={{ color:item.tone, fontSize:13, fontWeight:700 }}>{item.daysLeft < 0 ? `+${Math.abs(item.daysLeft)}` : `D-${item.daysLeft}`}</div>
              <div style={{ fontSize:9, color:C.muted, marginTop:3 }}>{item.workload}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ConditionPerformanceSection({ summary }) {
  if (!summary || summary.rows.length === 0) return (
    <>
      <SectionTitle>컨디션-성과</SectionTitle>
      <div style={{ background:C.paper, border:`1px dashed ${C.line}`, padding:18, marginBottom:18, textAlign:`center`, color:C.muted, fontSize:12 }}>
        하루 메모에 컨디션을 남기면 공부량과 함께 자동 비교됩니다.
      </div>
    </>
  );

  return (
    <>
      <SectionTitle>컨디션-성과</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:18 }}>
        <div style={{ fontSize:11, color:C.muted, lineHeight:1.6, marginBottom:10 }}>{summary.insight}</div>
        <div style={{ display:`grid`, gridTemplateColumns:`repeat(3, minmax(0, 1fr))`, gap:6, marginBottom:12 }}>
          {summary.groups.map(g => (
            <div key={g.key} style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`9px 7px`, textAlign:`center` }}>
              <div className={`mono`} style={{ color:g.color, fontSize:15, fontWeight:700 }}>{fmtHour(g.avgMin)}</div>
              <div className={`kserif`} style={{ color:C.muted, fontSize:9, marginTop:4 }}>{g.label} · {g.count}일</div>
              {(g.avgWrongRate != null || g.avgRankPercent != null) && (
                <div className={`mono`} style={{ color:C.muted, fontSize:8.5, marginTop:4 }}>
                  {g.avgWrongRate != null ? `객 ${Math.round(g.avgWrongRate)}% 오답` : ``}{g.avgWrongRate != null && g.avgRankPercent != null ? ` · ` : ``}{g.avgRankPercent != null ? `상위 ${Math.round(g.avgRankPercent)}%` : ``}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display:`flex`, flexDirection:`column`, gap:6 }}>
          {summary.recent.map(row => (
            <div key={row.date} style={{ display:`grid`, gridTemplateColumns:`54px 56px 1fr`, gap:8, alignItems:`center`, fontSize:10, borderTop:`1px dashed ${C.lineSoft}`, paddingTop:6 }}>
              <span className={`mono`} style={{ color:C.muted }}>{row.date.slice(5)}</span>
              <span className={`kserif`} style={{ color:row.condition.color, fontWeight:700 }}>{row.condition.label}</span>
              <span style={{ color:C.ink, minWidth:0, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>
                {fmtMin(row.minutes)} · {row.mood}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ReportView({ today, settings, logs, examScores, rankScores = [], materials = [], moods = {}, courses = [], reviews = [], schedules = [] }) {
  const weekStart = weekStartOf(today);
  const wDates = weekDays(weekStart);

  const weeklyBySubject = {};
  Object.keys(SUBJECTS).forEach(s => { weeklyBySubject[s] = 0; });
  wDates.forEach(d => {
    const dl = logs[d] || {};
    Object.entries(dl).forEach(([k, v]) => {
      const [sub] = k.split(`::`);
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
      arr.push({ date: d.slice(5).replace(`-`, `/`), minutes: total, hours: Math.round(total/60*10)/10 });
    }
    return arr;
  }, [today, logs]);

  // breakdown by type (since beginning) per subject
  const typeBreakdown = useMemo(() => {
    const out = {};
    Object.keys(SUBJECTS).forEach(s => { out[s] = {}; });
    Object.values(logs).forEach(dl => {
      Object.entries(dl).forEach(([k, v]) => {
        const [sub, type] = k.split(`::`);
        if (out[sub]) out[sub][type] = (out[sub][type] || 0) + (v || 0);
      });
    });
    return out;
  }, [logs]);

  // total study time
  const allMin = Object.values(logs).reduce((s, dl) => s + Object.values(dl).reduce((a,b) => a+b, 0), 0);
  const studyDays = Object.keys(logs).length;
  const avgPerDay = studyDays > 0 ? allMin / studyDays : 0;
  const conditionSummary = useMemo(() => buildConditionPerformance({ today, logs, moods, examScores, rankScores }), [today, logs, moods, examScores, rankScores]);

  // mock score average per subject
  const mockAvg = useMemo(() => {
    const out = {};
    Object.keys(SUBJECTS).filter(s => s !== `선택법`).forEach(s => {
      const subScores = examScores.filter(es => es.subject === s);
      if (subScores.length === 0) { out[s] = null; return; }
      const avg = subScores.reduce((a,b) => a + b.wrong, 0) / subScores.length;
      out[s] = { avg: Math.round(avg * 10) / 10, count: subScores.length };
    });
    return out;
  }, [examScores]);

  return (
    <div className={`fadeIn`} style={{ padding:`18px 0 24px` }}>
      <div style={{ marginBottom:16 }}>
        <h1 className={`serif`} style={{ margin:0, fontSize:22, fontWeight:600 }}>리포트</h1>
        <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>
          총 학습일 {studyDays}일 · 누적 {fmtHour(allMin)} · 일평균 {fmtHour(avgPerDay)}
        </div>
      </div>

      <DeadlineBackcastSection
        today={today}
        settings={settings}
        courses={courses}
        materials={materials}
        reviews={reviews}
        schedules={schedules}
      />

      <ConditionPerformanceSection summary={conditionSummary} />

      {/* Weekly progress */}
      <SectionTitle>주간 목표 (이번 주)</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`14px 14px`, marginBottom:18 }}>
        {weeklyData.map(w => {
          const pct = w.target > 0 ? Math.min(100, (w.minutes / w.target) * 100) : 0;
          return (
            <div key={w.fullName} style={{ marginBottom:10 }}>
              <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`baseline`, marginBottom:4 }}>
                <span className={`kserif`} style={{ fontSize:12, fontWeight:600, color:w.color }}>{w.fullName}</span>
                <span className={`mono`} style={{ fontSize:10, color:C.muted }}>
                  {fmtHour(w.minutes)} / {fmtHour(w.target)}
                </span>
              </div>
              <div style={{ height:4, background:C.lineSoft, position:`relative` }}>
                <div style={{ position:`absolute`, left:0, top:0, bottom:0, width:`${pct}%`, background: pct >= 100 ? C.good : w.color }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Daily 14-day trend */}
      <SectionTitle>최근 14일 학습 시간</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`14px 8px 10px`, marginBottom:18 }}>
        <ResponsiveContainer width={`100%`} height={160}>
          <BarChart data={dailyData} margin={{ top:5, right:5, bottom:0, left:-20 }}>
            <CartesianGrid stroke={C.lineSoft} strokeDasharray={`3 3`} />
            <XAxis dataKey={`date`} tick={{ fontSize:9, fill:C.muted }} interval={1} />
            <YAxis tick={{ fontSize:9, fill:C.muted }} />
            <Tooltip contentStyle={{ background:C.paper, border:`1px solid ${C.line}`, fontSize:11 }} formatter={v => fmtMin(v)} />
            <Bar dataKey={`minutes`} fill={C.accent} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Mock score averages */}
      {Object.values(mockAvg).some(v => v) && (
        <>
          <SectionTitle>객관식 평균 (전체 기록 기준)</SectionTitle>
          <div style={{ display:`grid`, gridTemplateColumns:`repeat(3, 1fr)`, gap:6, marginBottom:18 }}>
            {Object.entries(mockAvg).map(([sub, m]) => (
              <div key={sub} style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`10px 8px`, textAlign:`center` }}>
                <div className={`kserif`} style={{ fontSize:11, fontWeight:600, color:SUBJECTS[sub].color }}>{sub}</div>
                {m ? (
                  <>
                    <div className={`serif`} style={{ fontSize:20, fontWeight:600, marginTop:3 }}>-{m.avg}</div>
                    <div className={`mono`} style={{ fontSize:9, color:C.muted, marginTop:1 }}>{m.count}회 평균</div>
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
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`8px 14px`, marginBottom:18 }}>
        {Object.keys(SUBJECTS).map(sub => {
          const types = typeBreakdown[sub] || {};
          const total = Object.values(types).reduce((a,b) => a+b, 0);
          if (total === 0) return (
            <div key={sub} style={{ padding:`10px 0`, borderBottom:`1px dashed ${C.lineSoft}` }}>
              <span className={`kserif`} style={{ fontSize:11, fontWeight:600, color:SUBJECTS[sub].color }}>{sub}</span>
              <span style={{ fontSize:10, color:C.muted, marginLeft:8 }}>기록 없음</span>
            </div>
          );
          return (
            <div key={sub} style={{ padding:`10px 0`, borderBottom:`1px dashed ${C.lineSoft}` }}>
              <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`baseline`, marginBottom:6 }}>
                <span className={`kserif`} style={{ fontSize:11, fontWeight:600, color:SUBJECTS[sub].color }}>{sub}</span>
                <span className={`mono`} style={{ fontSize:10, color:C.muted }}>{fmtHour(total)}</span>
              </div>
              <div style={{ display:`flex`, height:6, background:C.lineSoft, overflow:`hidden` }}>
                {getStudyTypes(sub).map((t, i) => {
                  const v = types[t.key] || 0;
                  const pct = (v / total) * 100;
                  if (pct === 0) return null;
                  const tColor = SUBJECTS[sub].color;
                  const opacity = 0.4 + (i / getStudyTypes(sub).length) * 0.6;
                  return <div key={t.key} style={{ width:`${pct}%`, background: tColor, opacity, transition:`all .3s` }} title={`${t.label} ${fmtMin(v)}`} />;
                })}
              </div>
              <div style={{ display:`flex`, flexWrap:`wrap`, gap:8, marginTop:5, fontSize:9, color:C.muted }}>
                {getStudyTypes(sub).map(t => {
                  const v = types[t.key] || 0;
                  if (v === 0) return null;
                  return <span key={t.key}>{t.label} <span className={`mono`} style={{ color:C.ink }}>{fmtMin(v)}</span></span>;
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
          <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`8px 14px`, marginBottom:18 }}>
            {Object.keys(SUBJECTS).map(sub => {
              const ms = materials.filter(m => m.subject === sub);
              if (ms.length === 0) return null;
              const totalRounds = ms.reduce((s,m) => s + m.rounds, 0);
              const totalTarget = ms.reduce((s,m) => s + m.target, 0);
              const completed = ms.filter(m => m.rounds >= m.target).length;
              return (
                <div key={sub} style={{ padding:`8px 0`, borderBottom:`1px dashed ${C.lineSoft}`, display:`flex`, justifyContent:`space-between`, alignItems:`baseline` }}>
                  <span className={`kserif`} style={{ fontSize:12, fontWeight:600, color:SUBJECTS[sub].color }}>{sub}</span>
                  <span className={`mono`} style={{ fontSize:10, color:C.muted }}>
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

/* RoutineEditor — 드래그(누르고 끌기) + ▲▼ 버튼 동시 지원 */
function RoutineEditor({ routines, setRoutines }) {
  const sorted = [...routines].sort((a, b) => (a.order || 0) - (b.order || 0));
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [touchY, setTouchY] = useState(0);
  const itemRefs = useRef({});

  function reorder(fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= sorted.length || toIdx >= sorted.length) return;
    const next = [...sorted];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    // order 재할당
    const reordered = next.map((r, i) => ({ ...r, order: i + 1 }));
    setRoutines(reordered);
  }

  function moveBy(routineId, delta) {
    const idx = sorted.findIndex(r => r.id === routineId);
    reorder(idx, idx + delta);
  }

  function updRoutine(id, patch) {
    setRoutines(routines.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  function delRoutine(id) {
    setRoutines(routines.filter(r => r.id !== id));
  }
  function addRoutine() {
    setRoutines([...routines, { id: uid(), name: `새 루틴`, icon: `✓`, order: (routines.length || 0) + 1 }]);
  }

  // Desktop drag handlers
  function onDragStart(e, id) {
    setDragId(id);
    e.dataTransfer.effectAllowed=`move`;
    try { e.dataTransfer.setData(`text/plain`, id); } catch {}
  }
  function onDragOver(e, id) {
    e.preventDefault();
    if (id !== dragOverId) setDragOverId(id);
  }
  function onDragEnd() {
    if (dragId && dragOverId && dragId !== dragOverId) {
      const fromIdx = sorted.findIndex(r => r.id === dragId);
      const toIdx = sorted.findIndex(r => r.id === dragOverId);
      reorder(fromIdx, toIdx);
    }
    setDragId(null);
    setDragOverId(null);
  }

  // Touch drag handlers (mobile)
  function onTouchStart(e, id) {
    setDragId(id);
    setTouchY(e.touches[0].clientY);
  }
  function onTouchMove(e, id) {
    if (!dragId) return;
    const y = e.touches[0].clientY;
    setTouchY(y);
    // Find which item the finger is over
    let overId = null;
    for (const r of sorted) {
      const el = itemRefs.current[r.id];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        overId = r.id;
        break;
      }
    }
    if (overId && overId !== dragOverId) setDragOverId(overId);
  }
  function onTouchEnd() {
    if (dragId && dragOverId && dragId !== dragOverId) {
      const fromIdx = sorted.findIndex(r => r.id === dragId);
      const toIdx = sorted.findIndex(r => r.id === dragOverId);
      reorder(fromIdx, toIdx);
    }
    setDragId(null);
    setDragOverId(null);
  }

  return (
    <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:18 }}>
      <div style={{ fontSize:11, color:C.muted, marginBottom:10, lineHeight:1.5 }}>
        매일 지키고 싶은 생활 루틴(기상·식사·취침 등). 왼쪽 손잡이를 <b>꾹 누르고 위아래로 끌면</b> 순서를 바꿀 수 있어요. ▲▼ 버튼도 가능합니다.
      </div>
      {sorted.map((r, idx) => {
        const isDragging = dragId === r.id;
        const isOver = dragOverId === r.id && dragId !== r.id;
        return (
          <div key={r.id}
            ref={el => { itemRefs.current[r.id] = el; }}
            style={{
              display:`flex`, gap:6, marginBottom:6, alignItems:`center`,
              opacity: isDragging ? 0.5 : 1,
              background: isOver ? `#F4EAD0` : `transparent`,
              border: isOver ? `1px dashed ${C.accent}` : `1px solid transparent`,
              padding: isOver ? `4px` : `5px`,
              transition: `background .12s ease`,
            }}>
            {/* 드래그 손잡이 */}
            <div
              draggable
              onDragStart={(e) => onDragStart(e, r.id)}
              onDragOver={(e) => onDragOver(e, r.id)}
              onDragEnd={onDragEnd}
              onTouchStart={(e) => onTouchStart(e, r.id)}
              onTouchMove={(e) => onTouchMove(e, r.id)}
              onTouchEnd={onTouchEnd}
              style={{
                cursor: `grab`, touchAction: `none`, flexShrink: 0,
                width: 24, height: 30, display: `grid`, placeItems: `center`,
                color: C.muted, fontSize: 14, lineHeight: 1, userSelect: `none`,
                background: isDragging ? C.lineSoft : `transparent`,
              }}>
              ⋮⋮
            </div>

            {/* 위/아래 버튼 */}
            <div style={{ display:`flex`, flexDirection:`column`, gap:1, flexShrink:0 }}>
              <button onClick={() => moveBy(r.id, -1)} disabled={idx === 0}
                style={{ background:`none`, border:`none`, cursor: idx === 0 ? `default` : `pointer`, padding:`1px 4px`, color: idx === 0 ? C.lineSoft : C.muted, fontSize:9, lineHeight:1 }}>▲</button>
              <button onClick={() => moveBy(r.id, 1)} disabled={idx === sorted.length - 1}
                style={{ background:`none`, border:`none`, cursor: idx === sorted.length - 1 ? `default` : `pointer`, padding:`1px 4px`, color: idx === sorted.length - 1 ? C.lineSoft : C.muted, fontSize:9, lineHeight:1 }}>▼</button>
            </div>

            <input value={r.icon || ``} onChange={e => updRoutine(r.id, { icon: e.target.value.slice(0, 2) })}
              maxLength={2} placeholder={`🌅`}
              style={{ width:36, textAlign:`center`, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`6px 4px`, fontSize:14, outline:`none` }} />
            <input value={r.name} onChange={e => updRoutine(r.id, { name: e.target.value })}
              placeholder={`루틴 이름`}
              style={{ flex:1, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`6px 8px`, fontSize:11, outline:`none` }} />
            <button onClick={() => delRoutine(r.id)}
              style={{ background:`none`, border:`1px solid ${C.lineSoft}`, padding:`6px 8px`, cursor:`pointer`, color:C.muted, flexShrink:0 }}>
              <Trash2 size={12} />
            </button>
          </div>
        );
      })}
      <button onClick={addRoutine}
        style={{ width:`100%`, background:C.bg, border:`1px dashed ${C.line}`, padding:`8px`, cursor:`pointer`, fontSize:11, color:C.muted, marginTop:6 }}>
        + 루틴 추가
      </button>
    </div>
  );
}

function SettingsView({ settings, setSettings, schedules = [], setSchedules, routines = [], setRoutines, user, onLogout, onReset, onExport, onImport, onExportXLSX }) {
  const [examDate, setExamDate] = useState(settings.examDate);
  const [examLabel, setExamLabel] = useState(settings.examLabel);
  const [targets, setTargets] = useState(settings.weeklyTargets);
  const [cycleDefs, setCycleDefs] = useState(settings.cycleDefs);
  const [mockExams, setMockExams] = useState(settings.mockExams || []);
  const [d30Mode, setD30Mode] = useState(settings.d30Mode);
  const [autoGen, setAutoGen] = useState(settings.autoGenMockReview);
  const [cycleEnabled, setCycleEnabled] = useState(settings.cycleEnabled !== false);

  function save() {
    setSettings({
      ...settings,
      examDate, examLabel,
      weeklyTargets: targets,
      cycleDefs,
      mockExams,
      d30Mode,
      autoGenMockReview: autoGen,
      cycleEnabled, // 추가
    });
    alert(`저장되었습니다`);
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
      id: uid(), title: `새 일정`, color: SCHEDULE_PALETTE[0],
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

  async function importJSON(event) {
    const file = event.target.files?.[0];
    event.target.value = ``;
    if (!file) return;
    try {
      const text = await file.text();
      onImport?.(JSON.parse(text));
    } catch (e) {
      console.error(e);
      alert(`JSON 복원 실패: ` + (e.message || e));
    }
  }

  const palette = SCHEDULE_PALETTE;

  return (
    <div className={`fadeIn`} style={{ padding:`18px 0 24px` }}>
      <div style={{ marginBottom:14 }}>
        <h1 className={`serif`} style={{ margin:0, fontSize:22, fontWeight:600 }}>설정</h1>
      </div>

      <SectionTitle>시험</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:18 }}>
        <label style={{ display:`block`, fontSize:11, color:C.muted, marginBottom:4 }}>시험 이름</label>
        <input value={examLabel} onChange={e => setExamLabel(e.target.value)}
          style={{ width:`100%`, background:C.bg, border:`1px solid ${C.line}`, padding:`8px 10px`, fontSize:12, marginBottom:10, outline:`none` }} />
        <label style={{ display:`block`, fontSize:11, color:C.muted, marginBottom:4 }}>시험 날짜</label>
        <input type={`date`} value={examDate} onChange={e => setExamDate(e.target.value)}
          style={{ width:`100%`, background:C.bg, border:`1px solid ${C.line}`, padding:`8px 10px`, fontSize:12, outline:`none` }} />
      </div>

      <SectionTitle>모의고사 일정</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:18 }}>
        {mockExams.map(m => (
          <div key={m.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:`1px dashed ${C.lineSoft}` }}>
            <div style={{ display:`flex`, gap:6, marginBottom:5 }}>
              <input value={m.label} onChange={e => updMock(m.id, `label`, e.target.value)}
                style={{ flex:1, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`6px 8px`, fontSize:11, outline:`none` }} />
              <button onClick={() => delMock(m.id)} style={{ background:`none`, border:`1px solid ${C.lineSoft}`, padding:`6px 8px`, cursor:`pointer`, color:C.muted }}>
                <Trash2 size={12} />
              </button>
            </div>
            <div style={{ display:`flex`, gap:6 }}>
              <input type={`date`} value={m.start} onChange={e => updMock(m.id, `start`, e.target.value)}
                style={{ flex:1, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`5px 8px`, fontSize:11, outline:`none` }} />
              <span style={{ alignSelf:`center`, color:C.muted, fontSize:11 }}>~</span>
              <input type={`date`} value={m.end} onChange={e => updMock(m.id, `end`, e.target.value)}
                style={{ flex:1, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`5px 8px`, fontSize:11, outline:`none` }} />
            </div>
          </div>
        ))}
        <button onClick={addMock} style={{ width:`100%`, background:C.bg, border:`1px dashed ${C.line}`, padding:`8px`, cursor:`pointer`, fontSize:11, color:C.muted }}>
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
            <div style={{ display:`flex`, gap:6, marginBottom:6 }}>
              <input value={s.title} onChange={e => updSchedule(s.id, `title`, e.target.value)}
                style={{ flex:1, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`6px 8px`, fontSize:11, outline:`none` }} />
              <button onClick={() => delSchedule(s.id)} style={{ background:`none`, border:`1px solid ${C.lineSoft}`, padding:`6px 8px`, cursor:`pointer`, color:C.muted }}>
                <Trash2 size={12} />
              </button>
            </div>
            <div style={{ display:`flex`, gap:6, marginBottom:6 }}>
              <input type={`date`} value={s.start} onChange={e => updSchedule(s.id, `start`, e.target.value)}
                style={{ flex:1, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`5px 8px`, fontSize:11, outline:`none` }} />
              <span style={{ alignSelf:`center`, color:C.muted, fontSize:11 }}>~</span>
              <input type={`date`} value={s.end} onChange={e => updSchedule(s.id, `end`, e.target.value)}
                style={{ flex:1, background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`5px 8px`, fontSize:11, outline:`none` }} />
            </div>
            <div style={{ display:`flex`, gap:5, alignItems:`center` }}>
              <span style={{ fontSize:10, color:C.muted, marginRight:4 }}>색</span>
              {palette.map(c => (
                <button key={c} onClick={() => updSchedule(s.id, `color`, c)}
                  style={{
                    width:18, height:18, background:c, cursor:`pointer`,
                    border: s.color === c ? `2px solid ${C.ink}` : `1px solid transparent`,
                    padding:0,
                  }} />
              ))}
            </div>
          </div>
        ))}
        <button onClick={addSchedule} style={{ width:`100%`, background:C.bg, border:`1px dashed ${C.line}`, padding:`8px`, cursor:`pointer`, fontSize:11, color:C.muted }}>
          + 일정 추가
        </button>
      </div>

      <SectionTitle>사이클 (블록 일수)</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:18 }}>
        <div style={{ fontSize:11, color:C.muted, marginBottom:10, lineHeight:1.5 }}>
          순서: 민사법(+선택법) → 형사법 → 공법<br/>
          각 모의고사 / 본시험 직전부터 거꾸로 깔립니다.
        </div>
        {cycleDefs.map(c => (
          <div key={c.id} style={{ marginBottom:12 }}>
            <div className={`kserif`} style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>{c.label}</div>
            <div style={{ display:`grid`, gridTemplateColumns:`repeat(3, 1fr)`, gap:6 }}>
              {c.blocks.map((b, i) => (
                <div key={i} style={{ background:C.bg, border:`1px solid ${C.lineSoft}`, padding:`6px 8px` }}>
                  <div style={{ fontSize:10, color:SUBJECTS[b.subject].color, fontWeight:600, marginBottom:3 }}>{b.subject}</div>
                  <div style={{ display:`flex`, alignItems:`center`, gap:4 }}>
                    <input type={`number`} value={b.days} onChange={e => updCycleBlock(c.id, i, e.target.value)} min={1}
                      style={{ width:`100%`, background:`transparent`, border:`none`, fontSize:14, fontWeight:600, color:C.ink, outline:`none`, fontFamily:`JetBrains Mono, monospace` }} />
                    <span style={{ fontSize:10, color:C.muted }}>일</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>주간 학습 시간 목표</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:18 }}>
        <div style={{ fontSize:11, color:C.muted, marginBottom:12, lineHeight:1.5 }}>
          시간(h) 단위로 입력하세요. ± 버튼은 30분씩 증감.
        </div>
        {Object.keys(SUBJECTS).map(sub => {
          const min = targets[sub] || 0;
          const hours = (min / 60).toFixed(1).replace(/\.0$/, ``);
          return (
            <div key={sub} style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between`, marginBottom:10, paddingBottom:10, borderBottom:`1px dashed ${C.lineSoft}` }}>
              <div style={{ flex:1 }}>
                <span className={`kserif`} style={{ fontSize:13, fontWeight:600, color:SUBJECTS[sub].color }}>{sub}</span>
                <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>일평균 약 {fmtMin(Math.round(min / 7))}</div>
              </div>
              <div style={{ display:`flex`, alignItems:`center`, gap:4 }}>
                <button onClick={() => setTargets({ ...targets, [sub]: Math.max(0, min - 30) })}
                  style={{ background:C.bg, border:`1px solid ${C.line}`, width:28, height:28, cursor:`pointer`, display:`grid`, placeItems:`center`, color:C.muted }}>
                  <Minus size={12} />
                </button>
                <div style={{ display:`flex`, alignItems:`baseline`, gap:3, minWidth:64, justifyContent:`center`, padding:`4px 6px`, background:C.bg, border:`1px solid ${C.line}` }}>
                  <input type={`number`} inputMode={`decimal`} value={hours}
                    onChange={e => {
                      const h = parseFloat(e.target.value) || 0;
                      setTargets({ ...targets, [sub]: Math.round(h * 60) });
                    }}
                    style={{ width:36, textAlign:`right`, background:`transparent`, border:`none`, outline:`none`, fontSize:14, fontWeight:700, color:SUBJECTS[sub].color, fontFamily:`JetBrains Mono, monospace` }} />
                  <span style={{ fontSize:10, color:C.muted }}>h</span>
                </div>
                <button onClick={() => setTargets({ ...targets, [sub]: min + 30 })}
                  style={{ background:C.bg, border:`1px solid ${C.line}`, width:28, height:28, cursor:`pointer`, display:`grid`, placeItems:`center`, color:C.muted }}>
                  <Plus size={12} />
                </button>
              </div>
            </div>
          );
        })}
        <div style={{ display:`flex`, justifyContent:`space-between`, alignItems:`baseline`, paddingTop:6 }}>
          <span className={`kserif`} style={{ fontSize:12, fontWeight:600, color:C.ink }}>총 주간 목표</span>
          <span className={`mono`} style={{ fontSize:14, fontWeight:600, color:C.accent }}>
            {fmtHour(Object.values(targets).reduce((a,b) => a + (b || 0), 0))}
            <span style={{ fontSize:10, color:C.muted, marginLeft:6 }}>일평균 {fmtHour(Object.values(targets).reduce((a,b) => a + (b || 0), 0) / 7)}</span>
          </span>
        </div>
      </div>

      <SectionTitle>루틴 (생활 패턴)</SectionTitle>
      <RoutineEditor routines={routines || []} setRoutines={setRoutines} />

      <SectionTitle>자동화</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`4px 0`, marginBottom:18 }}>
        <label style={{ display:`flex`, alignItems:`center`, gap:10, padding:`10px 14px`, cursor:`pointer`, borderBottom:`1px dashed ${C.lineSoft}` }}>
          <input type={`checkbox`} checked={d30Mode} onChange={e => setD30Mode(e.target.checked)} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontWeight:600 }}>D-30/D-7 모드 배너</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>시험 30/7일 전 압축/벼락치기 모드 알림</div>
          </div>
        </label>
        <label style={{ display:`flex`, alignItems:`center`, gap:10, padding:`10px 14px`, cursor:`pointer`, borderBottom:`1px dashed ${C.lineSoft}` }}>
          <input type={`checkbox`} checked={autoGen} onChange={e => setAutoGen(e.target.checked)} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontWeight:600 }}>모의고사 리뷰 자동 생성</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>모의고사 종료 후 1~7일 동안 리뷰 할 일 자동 추가</div>
          </div>
        </label>
        <label style={{ display:`flex`, alignItems:`center`, gap:10, padding:`10px 14px`, cursor:`pointer` }}>
          <input type={`checkbox`} checked={cycleEnabled} onChange={e => setCycleEnabled(e.target.checked)} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontWeight:600 }}>사이클(블록) 기능 사용</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
              끄면 홈/캘린더에서 민→형→공 사이클 표시가 사라집니다. (사이클 정의는 그대로 보존)
            </div>
          </div>
        </label>
      </div>

      <button onClick={save} style={{ width:`100%`, background:C.ink, color:`#fff`, border:`none`, padding:`12px`, cursor:`pointer`, fontSize:13, marginBottom:14, fontWeight:600 }}>
        저장하기
      </button>

      <SectionTitle>캘린더 동기화</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`14px 14px`, marginBottom:18 }}>
        <div style={{ fontSize:11, color:C.muted, lineHeight:1.7, marginBottom:10 }}>
          본시험·모의고사·내가 추가한 모든 일정을 .ics 파일로 받아서 애플 캘린더에 추가할 수 있습니다.
          <br />아이폰: 다운로드된 파일 탭 → `캘린더에 추가`. 구글 캘린더에도 같은 방식으로 가져오기 가능합니다.
        </div>
        <button onClick={() => {
          const ics = buildICS({
            examDate, examLabel,
            mockExams,
            schedules: schedules || [],
          });
          downloadICS(ics, `변시일정_${examDate.replaceAll( `-`, ``)}.ics`);
        }}
          style={{ width:`100%`, background:C.ink, color:`#fff`, border:`none`, padding:`11px`, cursor:`pointer`, fontSize:12, fontWeight:600, display:`flex`, alignItems:`center`, justifyContent:`center`, gap:6 }}>
          <CalendarIcon size={13} /> .ics 파일 받기 (애플/구글 캘린더)
        </button>
      </div>

      <SectionTitle>데이터</SectionTitle>
      <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:14, marginBottom:18 }}>
        <button onClick={onExportXLSX}
          style={{ width:`100%`, background:`#1F6B3F`, color:`#fff`, border:`none`, padding:`12px`, cursor:`pointer`, fontSize:13, fontWeight:600, display:`flex`, alignItems:`center`, justifyContent:`center`, gap:6, marginBottom:8 }}>
          <Sheet size={14} /> 엑셀(.xlsx)로 내보내기
        </button>
        <div style={{ fontSize:10, color:C.muted, marginBottom:12, lineHeight:1.5 }}>
          요약 / 학습시간 / 5트랙 / 인박스 / 버릴목록 / 회차점수 / 사례등수 / 강의요약 / 강의목록 / 주간계획 / 루틴 등 — 17개 시트로 정리됩니다.
        </div>
        <div style={{ display:`grid`, gridTemplateColumns:`1fr 1fr`, gap:8 }}>
          <button onClick={onExport} style={{ background:C.bg, border:`1px solid ${C.line}`, padding:`10px`, cursor:`pointer`, fontSize:11, display:`flex`, alignItems:`center`, justifyContent:`center`, gap:5 }}>
            <Download size={13} /> JSON 백업
          </button>
          <button onClick={onReset} style={{ background:C.bg, border:`1px solid ${C.accent}`, color:C.accent, padding:`10px`, cursor:`pointer`, fontSize:11, display:`flex`, alignItems:`center`, justifyContent:`center`, gap:5 }}>
            <RefreshCw size={13} /> 전체 초기화
          </button>
          <label style={{ gridColumn:`1 / -1`, background:C.bg, border:`1px solid ${C.line}`, padding:`10px`, cursor:`pointer`, fontSize:11, display:`flex`, alignItems:`center`, justifyContent:`center`, gap:5 }}>
            <FileText size={13} /> JSON 복원
            <input type={`file`} accept={`application/json,.json`} onChange={importJSON} style={{ display:`none` }} />
          </label>
        </div>
      </div>

      {user && (
        <>
          <SectionTitle>계정</SectionTitle>
          <div style={{ background:C.paper, border:`1px solid ${C.line}`, padding:`12px 14px`, marginBottom:18 }}>
            <div style={{ display:`flex`, alignItems:`center`, justifyContent:`space-between`, gap:10 }}>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ fontSize:12, fontWeight:600, color:C.ink, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{user.displayName || `(이름 없음)`}</div>
                <div className={`mono`} style={{ fontSize:10, color:C.muted, marginTop:2, overflow:`hidden`, textOverflow:`ellipsis`, whiteSpace:`nowrap` }}>{user.email}</div>
              </div>
              <button onClick={onLogout} style={{ background:C.bg, border:`1px solid ${C.line}`, color:C.muted, padding:`7px 12px`, cursor:`pointer`, fontSize:11, display:`flex`, alignItems:`center`, gap:5, flexShrink:0 }}>
                <LogOut size={12} /> 로그아웃
              </button>
            </div>
          </div>
        </>
      )}

      <div style={{ textAlign:`center`, fontSize:10, color:C.muted, marginTop:30, fontStyle:`italic` }}>
        Bar Exam Journal · 16회 변시
      </div>
    </div>
  );
}
