import { open } from "lmdb"; // LMDB 모듈에서 open 함수 가져오기
import path from "path"; // 경로 처리를 위한 path 모듈

// =====================================
// ⚙️ LMDB 스토어 초기화 설정
// =====================================
const db_dir = path.resolve(__dirname, "../dc_config/"); // LMDB 파일이 저장될 디렉터리 절대 경로
const auto_key = "auto_save"; // 자동 저장용 키 이름
const manual_key = "manual_save"; // 수동 저장용 키 이름
const seq_key = "meta:lastLogId"; // 로그 식별 시퀀스 관리용 키

// auto 모드 전용 LMDB 인스턴스 생성
const auto_db = open({
  path: db_dir, // DB 디렉터리
  name: "auto", // 데이터베이스 네임스페이스
  compression: true, // LZ4 압축 사용
  maxReaders: 126, // 최대 동시 읽기 가능 수
  mapSize: 2 * 1024 ** 3, // 최대 2GB 매핑 크기 설정
});

// manual 모드 전용 LMDB 인스턴스 생성
const manual_db = open({
  path: db_dir, // DB 디렉터리
  name: "manual", // 데이터베이스 네임스페이스
  compression: true, // LZ4 압축 사용
  maxReaders: 126, // 최대 동시 읽기 가능 수
  mapSize: 2 * 1024 ** 3, // 최대 2GB 매핑 크기 설정
});

// =====================================
// 📑 타입 정의
// =====================================
export enum Mode {
  AUTO = "auto", // 자동 저장 모드
  MANUAL = "manual", // 수동 저장 모드
}

// IPC 통신에서만 사용되는 로드 모드, AUTO / MANUAL 외에 ALL 추가
export const LoadMode = {
  ...Mode,
  ALL: "all" as const,
} as const;

export type LoadModeType = (typeof LoadMode)[keyof typeof LoadMode];

export interface ArticleData {
  // 렌더러에서 전달될 게시글 데이터 형태
  번호: number; // 게시글 고유 번호
  제목: string; // 게시글 제목
  댓글수: number; // 댓글 개수
  작성자: string; // 작성자 닉네임
  조회수: number; // 조회 수
  추천: number; // 추천 수
  작성일: string; // 작성일 문자열 (예: "05.04" 또는 "01:20")
}

// 내부 저장 시 seq_no를 추가한 구조
interface ArticleRecord extends ArticleData {
  seq_no: number; // 결과 리스트 내 순서 정보
}

// 사용자 검색 파라미터 형태
export interface UserInput {
  search_type: string; // 검색 타입 (제목+내용, 댓글 등)
  repeat_cnt: number; // 반복 검색 횟수
  gallery_id: string; // 갤러리 ID
  keyword: string; // 검색 키워드
}

// LMDB에 저장될 로그 레코드 구조
export interface LogRecord {
  log_id: number; // 자동 증가 시퀀스 ID
  created_at: string; // 로그 저장 시각 ISO 문자열
  user_input: UserInput; // 검색 파라미터 정보
  article_data: ArticleRecord[]; // 변환된 게시글 결과 리스트
}

// =====================================
// 🔄 모드별 DB·키 선택 유틸 함수
// =====================================
function get_db(mode: Mode) {
  // mode에 맞는 DB 인스턴스 반환
  return mode === Mode.AUTO ? auto_db : manual_db;
}
function get_key(mode: Mode) {
  // mode에 맞는 키 이름 반환
  return mode === Mode.AUTO ? auto_key : manual_key;
}

// =====================================
// 💾 검색 기록 저장 함수
// =====================================
export async function save_search_log(
  data: ArticleData[], // 저장할 게시글 데이터 배열
  user_input: UserInput, // 저장할 검색 파라미터
  mode: Mode // 저장 모드 (auto/manual)
): Promise<number> {
  const db = get_db(mode); // 해당 모드의 DB 인스턴스
  const key = get_key(mode); // 해당 모드의 키 이름

  const existing: LogRecord[] = (db.get(key) as LogRecord[]) || []; // 기존에 저장된 로그 배열
  const last_id: number = (db.get(seq_key) as number) || 0; // 마지막 시퀀스 조회
  const new_id = last_id + 1; // 새로운 시퀀스 계산

  const records: ArticleRecord[] = data.map((item, idx) => ({
    // ArticleData → ArticleRecord 변환
    seq_no: idx, // 순서 정보
    ...item, // 원래 데이터 포함
  }));

  const new_log: LogRecord = {
    // 새로운 로그 객체 생성
    log_id: new_id, // 시퀀스 ID
    created_at: new Date().toISOString(), // 생성 시각
    user_input, // 검색 파라미터
    article_data: records, // 변환된 결과 리스트
  };

  db.transaction(() => {
    // 원자적 트랜잭션 시작
    db.putSync(seq_key, new_id); // 시퀀스 키 업데이트
    db.putSync(key, [...existing, new_log]); // 기존 로그 배열 뒤에 새 로그 추가
  });

  return new_id; // 새로 생성된 log_id 반환
}

// =====================================
// 🔍 전체 원본 로그 조회 함수
// =====================================
export async function get_full_logs(mode: Mode): Promise<LogRecord[]> {
  const db = get_db(mode); // 해당 모드의 DB 인스턴스
  const key = get_key(mode); // 해당 모드의 키 이름
  return ((db.get(key) as LogRecord[]) || []).slice(); // 깊은 복사를 통해 배열 반환
}

// =====================================
// 🔍 모든 모드의 로그 병합 조회 함수
// =====================================
export async function get_all_logs(): Promise<
  Array<{ mode: Mode } & LogRecord>
> {
  const auto_logs = (await get_full_logs(Mode.AUTO)).map((l) => ({
    mode: Mode.AUTO,
    ...l,
  }));
  const manual_logs = (await get_full_logs(Mode.MANUAL)).map((l) => ({
    mode: Mode.MANUAL,
    ...l,
  }));
  return [...auto_logs, ...manual_logs] // auto + manual 병합
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - // 최신 순으로 정렬
        new Date(a.created_at).getTime()
    );
}

// =====================================
// 🔍 평탄화된 아티클 목록 조회 함수
// =====================================
export async function load_search_logs(
  mode: Mode
): Promise<Array<{ log_id: number; seq_no: number } & ArticleData>> {
  const db = get_db(mode); // 해당 모드의 DB 인스턴스
  const key = get_key(mode); // 해당 모드의 키 이름
  const logs = (db.get(key) as LogRecord[]) || []; // 저장된 로그 배열
  const list: Array<{ log_id: number; seq_no: number } & ArticleData> = [];

  logs.forEach((log) => {
    // 각 로그에 대해
    log.article_data.forEach((item) => {
      // 각 게시글 레코드에 대해
      const { seq_no, ...rest } = item; // seq_no 분리
      list.push({
        // 객체 병합 후 배열에 추가
        log_id: log.log_id, // 로그 ID
        seq_no, // 순서 정보
        ...rest, // 게시글 데이터
      });
    });
  });

  return list.sort((a, b) => b.log_id - a.log_id || a.seq_no - b.seq_no); // 정렬 후 반환
}

// =====================================
// 🗑 특정 로그 삭제 함수
// =====================================
export async function delete_search_log(
  log_id: number, // 삭제할 로그 ID
  mode: Mode // 모드 구분(auto/manual)
): Promise<void> {
  const db = get_db(mode); // 해당 모드의 DB 인스턴스
  const key = get_key(mode); // 해당 모드의 키 이름
  const logs = (db.get(key) as LogRecord[]) || []; // 저장된 로그 배열
  const filtered = logs.filter((log) => log.log_id !== log_id); // 삭제할 ID 필터링

  db.putSync(key, filtered); // 필터링된 배열로 덮어쓰기
  return Promise.resolve(); // Promise<void> 반환
}
