<!-- eslint-disable prettier/prettier -->
<!-- 백그라운드에서 돌리는 서버에서 실제로 화면 렌더링을 담당하는 클라이언트 부분 -->
<template>
  <v-app>
    <!-- 상단바(앱바) -->
    <div style="user-select: none">
      <v-app-bar app :color="theme_color" id="appbar" dark class="yes-drag">
        <v-app-bar-nav-icon
          @click="open_drawer"
          class="no-drag"></v-app-bar-nav-icon>
        <v-toolbar-title class="pl-1">{{ title }}</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon @click="minimize_window" class="no-drag">
          <v-icon>mdi-window-minimize</v-icon>
        </v-btn>
        <v-btn icon @click="close_window" class="no-drag">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-app-bar>
    </div>
    <!-- 본문 -->
    <v-main>
      <v-container>
        <!-- 상단 유저 입력 메뉴 -->
        <v-row>
          <v-col cols="2">
            <v-select
              :items="select_box.items"
              v-model="select_box.selected_item"
              :menu-props="{ offsetY: true }"></v-select>
          </v-col>
          <v-col cols="auto" style="width: 110px">
            <v-text-field
              label="반복 횟수"
              v-model.number="repeat_cnt"
              type="number"
              hide-spin-buttons></v-text-field>
          </v-col>
          <v-col cols="2">
            <v-text-field label="갤러리 ID" v-model="gallery_id"></v-text-field>
          </v-col>
          <v-col cols="5">
            <v-text-field
              label="검색어"
              v-model="keyword"
              :spellcheck="false"
              @keypress="search_keypress"></v-text-field>
          </v-col>
          <v-col>
            <v-btn
              :color="theme_color"
              dark
              class="mt-2"
              @click="search_btn_click"
              :loading="search_btn.is_loading">
              <v-icon>mdi-magnify</v-icon>
            </v-btn>
          </v-col>
        </v-row>
        <!-- 메인 테이블 (전체) -->
        <main-table
          :rows_data="table_rows"
          :loading_text_data="loading_text_data"
          :progress_value="progress_value"
          :is_loading="search_btn.is_loading"
          :is_manual_save_loading="save_button.is_loading"
          @manual_save="save_manual_data"></main-table>
      </v-container>
    </v-main>

    <!-- 왼쪽 네비게이션 서랍 (Drawer) -->
    <navigation-drawer
      :is-open="is_open_drawer"
      :items="drawer_items"
      @update:is_open="is_open_drawer = $event"
      @item-click="drawer_item_click" />

    <!-- 설정 다이얼 로그 -->
    <settings-dialog
      :value="is_open_settings"
      :color="theme_color"
      @input="is_open_settings = $event" />

    <!-- About 다이얼 로그 -->
    <about-dialog
      :color="theme_color"
      :is_open_dialog="is_open_about"
      v-on:update:value="is_open_about = $event" />

    <!-- 불러오기 다이얼 로그 -->
    <load-interface
      :is_open_dialog="is_open_load"
      v-on:update:value="is_open_load = $event"
      v-on:delete:article="delete_article"
      :color="theme_color"
      :auto_save_data="save_data.auto_save"
      :manual_save_data="save_data.manual_save"></load-interface>
  </v-app>
</template>

<script lang="ts">
import { ipcRenderer, IpcRendererEvent } from "electron";
import Vue from "vue";
import { Article } from "../types/dcinside";
import { DCWebRequest, IPCChannel } from "../types/ipc";
import {
  AGGridVueArticle,
  DrawerAction,
  SaveArticleData,
  SaveData,
  Settings,
} from "../types/view";
import { Nullable } from "../types/default";
import MainTable from "./components/MainTable.vue";
import AboutDialog from "./components/Dialog/About.vue";
import LoadInterface from "./components/Dialog/LoadInterface.vue";
import SettingsDialog from "./components/Dialog/Settings.vue";
import NavigationDrawer from "./components/NavigationDrawer.vue";

// Mode와 LoadMode는 IPC 통신을 통해 가져옵니다
const Mode = {
  AUTO: "auto",
  MANUAL: "manual",
} as const;

const LoadMode = {
  ...Mode,
  ALL: "all" as const,
} as const;

export default Vue.extend({
  name: "App",
  data() {
    return {
      title: "DCInside Explorer", // 프로그램 창 타이틀에 사용하는 변수
      theme_color: "#3B4890", // 프로그램 테마 색상
      base_folder_location: "./dc_config", // 프로그램 설정 파일이 저장될 폴더 이름

      // 창 상단 ===============================================
      select_box: {
        // 검색 옵션
        items: ["제목+내용", "제목", "내용", "글쓴이", "댓글"],
        selected_item: "",
      },
      repeat_cnt: 0, // 반복 횟수
      gallery_id: "", // 갤러리 ID
      keyword: "", // 검색어
      // =======================================================

      drawer_items: [
        {
          title: "설정",
          icon: "mdi-cog",
          action: DrawerAction.Settings,
        },
        {
          title: "불러오기",
          icon: "mdi-file",
          action: DrawerAction.Load,
        },
        {
          title: "정보",
          icon: "mdi-help-box",
          action: DrawerAction.About,
        },
      ],

      selected_auto_save_data: null as Nullable<SaveArticleData>,

      /*
        RAM 상에서 저장될 자동 / 수동 저장 데이터
        원래는 불러올때마다 파일(디스크)에서 불러왔지만 그러면
        속도저하가 커서 프로그램 첫 시작시에만 디스크 불러와 해당 변수(RAM) 에 저장해두고,
        이후에 불러올때는 해당 변수(RAM)에서 보여주는 방식으로 변경.
        저장시엔 변수에 저장된 데이터를 디스크에 저장.
        OS에 흔히 쓰이는 버퍼 기법.
      */
      save_data: {
        auto_save: [] as SaveArticleData[],
        manual_save: [] as SaveArticleData[],
      },

      // 표에 뿌릴 데이터
      table_rows: [] as AGGridVueArticle[],

      // 검색 버튼의 로딩 상태를 나타내는 변수
      search_btn: { is_loading: false },

      // 수동 저장 버튼의 로딩 상태를 나타내는 변수
      save_button: { is_loading: false },

      progress_value: "",
      loading_text_data: "",

      // =========================================================================
      is_open_settings: false, // 설정창 다이얼로그
      is_open_about: false, // 정보 다이얼로그
      is_open_drawer: false, // 왼쪽위 석삼자 네비게이션 서랍
      is_open_load: false, // 불러오기 다이얼로그
      is_open_save_data: false, // 불러오기 안의 자동 저장 목록 다이얼로그
      // =========================================================================
    };
  },
  components: {
    MainTable,
    AboutDialog,
    LoadInterface,
    SettingsDialog,
    NavigationDrawer,
  },

  // 처음 실행시 실행되는 함수
  async mounted() {
    this.initialize_ui(); // UI 설정 저장 파일 없으면 생성 & 있으면 로드
    await this.load_article_db(); // SQLite 글 데이터 로드
  },

  // 종료 직전에 실행되는 함수
  async beforeDestroy() {
    await this.save_ui_data();
  },

  methods: {
    // 가장 초기에 UI 설정 파일을 준비하기 위해 호출되는 함수(mounted에서 사용)
    async initialize_ui() {
      // 기본 설정값
      const default_data = {
        // v-select는 첫 번째 아이템으로 기본값 설정
        search_type: this.select_box.items[0],
        repeat_cnt: this.repeat_cnt,
        gallery_id: this.gallery_id,
        keyword: this.keyword,
        settings: {
          program_entire_settings: {
            max_parallel: 100,
          },
          user_preferences: {
            clear_data_on_search: true,
          },
          auto_save: {
            auto_save_result: true,
            max_auto_save: 10,
          },
        },
      };

      try {
        console.time("설정 파일 처리 시간");

        // IPC로 설정 파일 초기화 및 로드 요청
        const result = await ipcRenderer.invoke(
          IPCChannel.FileSystem.INITIALIZE_SETTINGS,
          this.setting_file_location,
          default_data
        );

        if (result.success) {
          const parsed_data: SaveData = result.data;

          // UI에 설정 데이터 반영
          this.repeat_cnt = parsed_data.repeat_cnt;
          this.gallery_id = parsed_data.gallery_id;
          this.keyword = parsed_data.keyword;
          this.select_box.selected_item = parsed_data.search_type;

          // Vuex store에 settings 저장
          this.settings = parsed_data.settings;

          console.log("설정 파일을 성공적으로 불러왔습니다.");
          console.timeEnd("설정 파일 처리 시간");
        } else {
          console.error(
            "설정 파일을 불러오는 중 오류가 발생했습니다.",
            result.error
          );
        }
      } catch (e) {
        console.error("설정 파일을 불러오는 중 오류가 발생했습니다.", e);
      }
    },

    async delete_article(obj: {
      type: (typeof Mode)[keyof typeof Mode];
      index: number;
    }) {
      try {
        // 삭제할 로그의 ID를 찾기 위해 해당 인덱스의 로그를 가져옴
        const target_log =
          obj.type === Mode.MANUAL
            ? this.save_data.manual_save[obj.index]
            : this.save_data.auto_save[obj.index];

        if (!target_log) {
          console.error("[삭제] 해당 인덱스의 로그를 찾을 수 없습니다.");
          return;
        }

        // IPC로 삭제 요청
        const res = await ipcRenderer.invoke(
          IPCChannel.DB.DELETE_ARTICLE_SEARCH_LOG,
          target_log.log_id,
          obj.type
        );

        if (res.success) {
          console.log(`[삭제] ${obj.type} 로그 삭제 완료`);

          // 메모리에서도 삭제
          if (obj.type === Mode.MANUAL) {
            this.save_data.manual_save.splice(obj.index, 1);
          } else {
            this.save_data.auto_save.splice(obj.index, 1);
          }

          this.$toast("삭제가 완료되었습니다", {
            position: "bottom-center",
            timeout: 718,
            closeOnClick: true,
            pauseOnFocusLoss: true,
            pauseOnHover: false,
            draggable: true,
            draggablePercent: 0.6,
            showCloseButtonOnHover: true,
            hideProgressBar: true,
            closeButton: "button",
            icon: true,
            rtl: false,
          } as any);
        } else {
          console.error("[삭제] 로그 삭제 실패:", res.error);
        }
      } catch (error: any) {
        console.error("[삭제] 오류 발생:", error);
      }
    },

    // IPC를 통한 글 DB 데이터 불러오기
    async load_article_db() {
      try {
        console.time("DB를 불러왔습니다");

        const article_data = await ipcRenderer.invoke(
          IPCChannel.DB.LOAD_ARTICLE_SEARCH_LOG,
          LoadMode.ALL
        );

        this.save_data.manual_save = article_data.manual_save;
        this.save_data.auto_save = article_data.auto_save;
        console.timeEnd("DB를 불러왔습니다");

        console.log("불러온 DB 데이터 :", article_data);
      } catch (e) {
        console.error("[DB-Load] IPC 오류", e);
      }
    },

    /*
      해당 함수는 수동 저장 버튼을 누를 때마다 호출된다.
      참고로 버튼을 연타하니깐 race condition 인지 몰라도
      Json.Parse 부분에서 오류가 발생해서 버튼을 연타하지 못하도록 변경했다.
      (수동 저장이 다 이루어지기 전까진 버튼이 로딩 상태로 변함)
    */
    async save_manual_data() {
      try {
        this.save_button.is_loading = true; // 버튼을 로딩 상태로 변경

        // IPC로 저장 요청할 데이터 형식
        const data = {
          mode: Mode.MANUAL,
          user_input: {
            search_type: this.select_box.selected_item,
            repeat_cnt: this.repeat_cnt,
            gallery_id: this.gallery_id,
            keyword: this.keyword,
          },
          article_data: {
            items: this.table_rows,
          },
        };

        console.time("DB 저장에 걸린 시간 : ");
        const res = await ipcRenderer.invoke(
          IPCChannel.DB.SAVE_ARTICLE_SEARCH_LOG,
          data
        );
        console.timeEnd("DB 저장에 걸린 시간 : ");

        if (res.success) {
          console.log("[수동 저장] DB에 글 저장 완료");

          // 데이터 바인딩 수행
          // 수동 저장 데이터 업데이트, 메모리로 저장하는 배열 끝에 삽입
          this.save_data.manual_save.push({
            log_id: res.log_id,
            created_at: new Date().toISOString(),
            user_input: {
              search_type: this.select_box.selected_item,
              repeat_cnt: this.repeat_cnt,
              gallery_id: this.gallery_id,
              keyword: this.keyword,
            },
            article_data: this.table_rows,
          });

          this.$toast("저장이 완료되었습니다", {
            position: "bottom-center",
            timeout: 718,
            closeOnClick: true,
            pauseOnFocusLoss: true,
            pauseOnHover: false,
            draggable: true,
            draggablePercent: 0.6,
            showCloseButtonOnHover: true,
            hideProgressBar: true,
            closeButton: "button",
            icon: true,
            rtl: false,
          } as any);
        } else {
          console.error("[수동 저장] DB에 글 저장 실패:", res.error);
        }
      } catch (error: any) {
        console.error("[수동 저장] 오류 발생:", error);
      } finally {
        this.save_button.is_loading = false; // 버튼을 로딩 상태에서 해제
      }
    },

    async save_ui_data() {
      // 종료 직전에 프로그램의 입력 데이터를 저장한다.
      const data: SaveData = {
        search_type: this.select_box.selected_item,
        repeat_cnt: this.repeat_cnt,
        gallery_id: this.gallery_id,
        keyword: this.keyword,
        settings: this.settings,
      };

      // IPC로 파일 저장 요청
      try {
        const result = await ipcRenderer.invoke(
          IPCChannel.FileSystem.SAVE_SETTINGS,
          this.setting_file_location,
          data
        );

        if (!result.success) {
          throw new Error(result.error);
        }
      } catch (err) {
        console.error(err);
      }
    },

    click_auto_save_item(article: SaveArticleData) {
      this.selected_auto_save_data = article;
      this.is_open_save_data = !this.is_open_save_data;
    },

    // 왼쪽 네비게이션 서랍 메뉴 클릭 시 실행되는 함수
    async drawer_item_click(action: DrawerAction) {
      if (action === DrawerAction.Settings) {
        this.is_open_settings = true;
      } else if (action === DrawerAction.Load) {
        this.is_open_load = true;
      } else if (action === DrawerAction.About) {
        this.is_open_about = true;
      }

      // 아이템을 누르면 왼쪽의 네비게이션 서랍은 닫힌다.
      this.is_open_drawer = false;
    },
    // 왼쪽 위 석삼자 누를 시 실행되는 함수
    open_drawer() {
      this.is_open_drawer = !this.is_open_drawer;
    },
    search_keypress(e: KeyboardEvent) {
      if (e.key === "Enter") {
        // 버튼이 로딩중이면 키 이벤트를 즉시 무시한다. (연타 방지)
        if (this.search_btn.is_loading) return;
        e.preventDefault(); // Ensure it is only this code that runs
        this.search_btn_click();
        // alert("Enter was pressed was presses");
      }
    },
    string_to_query(selected_items: string): string {
      const query_match_ui: any = {
        "제목+내용": "search_subject_memo",
        제목: "search_subject",
        내용: "search_memo",
        글쓴이: "search_name",
        댓글: "search_comment",
      };
      return query_match_ui[selected_items];
    },

    minimize_window() {
      // 현재 창 최소화
      ipcRenderer.send(IPCChannel.Window.MINIMIZE_ME);
    },
    close_window() {
      // 확실한 종료 보장을 위해 일렉트론 백그라운드 서버와 IPC 통신으로 종료 요청
      ipcRenderer.send(IPCChannel.Window.CLOSE_ME);
    },

    // 검색 버튼 누를 시 실행되는 함수
    async search_btn_click() {
      // 여기서 그냥 웹 요청 보내면 CORS가 걸려서 ipc로 백그라운드 node.js 서버에서
      // 웹 요청을 보내고 응답을 받아서 화면에 렌더링하는 방식으로 구현해야 함

      // 검색 버튼 누르면 기존 검색 결과 초기화
      if (this.settings.user_preferences.clear_data_on_search)
        this.table_rows = [];

      // 버튼에 로딩 상태 반영
      this.search_btn.is_loading = true;

      // 디버깅용 출력
      console.log({
        id: this.gallery_id,
        repeat_cnt: this.repeat_cnt,
        keyword: this.keyword,
        search_type: this.string_to_query(this.select_box.selected_item),
        option: {
          requests_limit: this.settings.program_entire_settings.max_parallel,
        },
      });

      // 웹 요청 보내기
      ipcRenderer.send(IPCChannel.Web.REQUEST, {
        id: this.gallery_id,
        repeat_cnt: this.repeat_cnt,
        keyword: this.keyword,
        search_type: this.string_to_query(this.select_box.selected_item),
        option: {
          requests_limit: this.settings.program_entire_settings.max_parallel,
        },
      } as DCWebRequest);

      /*
        주의 : 아래 IPC 응답을 받기 위해 리스너 함수를 ipcRenderer.on() 이 아닌 반드시 .once() 로 등록해야 한다
          .on() 으로 등록 시 계속해서 IPC 요청에 대한 응답 함수를 '누적' 해서 더하는 형태로 작동하기에 응답 한 번 처리 후 자동 해제되는 once() 를 사용해야 한다.
        지금까지 .on() 의 동작을 잘못 이해해서 검색이 매번 이루어질때마다 응답 함수가 반복 호출되고 있는 끔찍한 일이 일어나고 있었던 것... ㅜㅜㅜ
      */
      // 백그라운드 서버로부터 응답 받기
      ipcRenderer.once(IPCChannel.Web.RESPONSE, this.web_response_callback);

      /*
        백그라운드 서버로부터 진행 상황 받기
        이 경우엔 전달 값이 계속해서 연속적으로 들어오므로, on() 으로 계속해서 받는 Logic은 유지하되,
        버튼을 누르면 on()이 계속 호출되어 누적되므로 누적을 제거하는 코드까지 포함해야 한다.
      */
      ipcRenderer.removeAllListeners(IPCChannel.Web.REQUEST_PROGRESS);
      ipcRenderer.on(
        IPCChannel.Web.REQUEST_PROGRESS,
        (_event, progress: string, status: string) => {
          this.progress_value = progress;
          this.loading_text_data = status;
        }
      );
    },

    // 웹 응답 받아 처리하는 콜백 함수
    async web_response_callback(_event: IpcRendererEvent, result: Article[][]) {
      const total_count = result.flat().length;
      console.log(`검색 결과 : ${total_count}개`);

      console.time("배열 준비 시간 : "); // ==============================

      // 중첩 배열 평탄화 및 AGGridVueArticle 형태로 변환
      const items: AGGridVueArticle[] = result.flat().map((item) => ({
        번호: item.gall_num,
        제목: item.gall_tit,
        댓글수: item.reply_num,
        작성자: item.gall_writer,
        조회수: item.gall_count,
        추천: item.gall_recommend,
        작성일: item.gall_date,
      }));

      console.timeEnd("배열 준비 시간 : "); // ==============================

      // 데이터 바인딩 (표에 데이터 반영)
      this.table_rows = items;

      // 버튼 로딩 완료 반영
      this.search_btn.is_loading = false;

      /*
        vuex 데이터에 갤러리 id 반영
        검색이 완료된 후 vuex에 반영해야 유저가 검색 성공 이후에 갤러리 id를 바꿔도
        프로그램이 망가지지 않음 - 링크 열기
      */
      this.vuex_gallery_id = this.gallery_id;

      // 자동 저장이 활성화 되어 있고, 저장할 게 있다면 자동 저장 수행
      if (this.settings.auto_save.auto_save_result && items.length > 0) {
        await this.save_auto_search_result(items);
      }
    },

    // 자동 저장 로직을 처리하는 함수
    async save_auto_search_result(items: AGGridVueArticle[]) {
      // 자동 저장 개수 초과 검사
      if (
        this.save_data.auto_save.length >= this.settings.auto_save.max_auto_save
      ) {
        console.log("자동 저장 개수를 초과해 DB에 저장하지 않습니다.");
        return; // Early return
      }

      // IPC로 저장 요청할 데이터 형식
      const data = {
        mode: Mode.AUTO,
        user_input: {
          search_type: this.select_box.selected_item,
          repeat_cnt: this.repeat_cnt,
          gallery_id: this.gallery_id,
          keyword: this.keyword,
        },
        article_data: {
          items,
        },
      };

      console.time("DB 저장에 걸린 시간 : ");
      const res = await ipcRenderer.invoke(
        IPCChannel.DB.SAVE_ARTICLE_SEARCH_LOG,
        data
      );
      console.timeEnd("DB 저장에 걸린 시간 : ");

      if (res.success) {
        console.log("[자동 저장] DB에 글 저장 완료");

        // 데이터 바인딩 수행
        // 자동 저장 데이터 업데이트, 메모리로 저장하는 배열 끝에 삽입
        this.save_data.auto_save.push({
          log_id: res.log_id,
          created_at: new Date().toISOString(),
          user_input: {
            search_type: this.select_box.selected_item,
            repeat_cnt: this.repeat_cnt,
            gallery_id: this.gallery_id,
            keyword: this.keyword,
          },
          article_data: items,
        });
      } else {
        console.error("[자동 저장] DB에 글 저장 실패:", res.error);
      }
    },
  },

  computed: {
    /*
      base_folder_location 변수를 참조해 사용하려면
      data() 안에서 바로 사용하면 안된다.
      data 안에 있는 값을 서로 사용하려면 data 객체가 완전히 초기화 되고 나서 사용해야 한다.
      computed 안에서 사용시 data 항목이 모두 초기화된 후에 계산된 값을 얻을 수 있기에 문제 해결이 가능하다.

      또한 return type string 을 명시적으로 지정해줘야 오류가 안난다.

      TypeScript는 Vue의 computed 속성 안에서 this의 타입을 자동으로 추론하지 못할 때가 있습니다.
      특히, Vue의 data 함수 안에서 정의된 속성들을 참조할 때 이런 문제가 발생할 수 있습니다.
      TypeScript는 this가 무엇을 가리키는지 정확히 알 수 있어야 하는데,
      Vue의 컴포넌트 내부에서는 this가 굉장히 유연하게 사용되기 때문에 TypeScript가 정확히 추론하기 어려울 때가 있습니다.
      이런 경우에는 개발자가 명시적으로 타입을 지정해 주어야 합니다.

      by GPT4o : 정확한 내용은 검증이 필요.
    */
    setting_file_location(): string {
      return `${this.base_folder_location}/settings.json`;
    },

    // Vuex 데이터 추가
    vuex_gallery_id: {
      get(): string {
        return this.$store.getters.get_gallery_id;
      },
      set(value: string) {
        this.$store.commit("set_gallery_id", value);
      },
    },

    // settings를 Vuex store와 연동
    settings: {
      get(): Settings {
        return this.$store.getters.get_settings;
      },
      set(value: Settings) {
        this.$store.commit("set_settings", value);
      },
    },
  },
});
</script>

<style scoped>
/*
  드래그 옵션, 일렉트론의 frame : false 와 조합해야만 유효하며,
  드래그 될 대상에는 웹킷 drag 옵션을 줘야 그것으로 창을 옮길 수 있고
  버튼 같은 상호 작용 요소엔 no-drag를 줘야 클릭이 정상적으로 된다.
*/
.yes-drag {
  -webkit-app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}

/* 카드 뾰족하게 */
/* .v-sheet.v-card {
  border-radius: 0px;
} */
</style>
