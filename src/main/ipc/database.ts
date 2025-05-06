import { ipcMain } from "electron";
import { IPCChannel } from "@/types/ipc";
import {
  save_search_log,
  delete_search_log,
  get_full_logs,
  load_search_logs,
  Mode,
  LoadMode,
  LoadModeType,
} from "../modules/lmdb";

// DB 관련 IPC 핸들러 등록 함수
export function register_database_handlers() {
  // 검색 로그 저장 핸들러
  ipcMain.handle(
    IPCChannel.DB.SAVE_ARTICLE_SEARCH_LOG,
    async (_event, { mode, user_input, article_data }) => {
      try {
        const last_id = await save_search_log(
          article_data.items,
          user_input,
          mode
        );
        return { success: true, log_id: last_id };
      } catch (err: any) {
        console.error("[db-save-search-log] 오류 발생:", err);
        return { success: false, error: err.message };
      }
    }
  );

  // 검색 로그 삭제 핸들러
  ipcMain.handle(
    IPCChannel.DB.DELETE_ARTICLE_SEARCH_LOG,
    async (_event, log_id: number, mode: Mode) => {
      try {
        await delete_search_log(log_id, mode);
        return { success: true };
      } catch (err: any) {
        console.error("[db-delete-search-log] 오류 발생:", err);
        return { success: false, error: err.message };
      }
    }
  );

  // 검색 로그 조회 핸들러
  ipcMain.handle(
    IPCChannel.DB.LOAD_ARTICLE_SEARCH_LOG,
    async (_event, load_mode: LoadModeType) => {
      if (load_mode === LoadMode.ALL) {
        // auto / manual 각각 원본 배열 조회
        const auto_logs = await get_full_logs(Mode.AUTO);
        const manual_logs = await get_full_logs(Mode.MANUAL);

        // 원하는 형태로 객체 묶어서 반환
        return {
          auto_save: auto_logs, // 자동 저장 로그 배열
          manual_save: manual_logs, // 수동 저장 로그 배열
        };
      }

      // 단일 모드(flatten) 조회는 그대로 유지
      return await load_search_logs(load_mode as Mode);
    }
  );
}
