<!-- 전체 필터링, ag-grid-vue, 페이지 당 보여질 갯수를 한꺼번에 묶어놓은 컴포넌트 -->
<template>
  <div>
    <!-- 검색 중에만 프로그래스바, 설명 표시 -->
    <div v-if="is_loading">
      <v-progress-linear color="primary" :value="progress_value" :height="25">
        <template v-slot:default="{ value }">
          <strong style="color: white">{{ value }}%</strong>
        </template>
      </v-progress-linear>
      <div class="text-center" style="font-size: 0.875rem">
        {{ loading_text_data }}
      </div>
    </div>
    <v-text-field
      v-model="filter_text"
      append-icon="mdi-magnify"
      label="전체 필터링"
      single-line
      hide-details
      style="margin-bottom: 2px"
      @input="onFilterTextChange"></v-text-field>
    <template>
      <ag-grid-vue
        style="height: 537px"
        class="ag-theme-material"
        :defaultColDef="ag_grid_vue.default_columns_def"
        :columnDefs="ag_grid_vue.columns"
        :rowData="rows_data"
        :pagination="ag_grid_vue.is_pagination"
        :localeText="ag_grid_vue.locale_text"
        :suppressPaginationPanel="true"
        :paginationPageSize="ag_grid_vue.pagination_size"
        @grid-ready="onGridReady"
        @grid-size-changed="onGridSizeChanged"
        @pagination-changed="onPaginationChanged"
        suppressBrowserResizeObserver="true"
        :cacheQuickFilter="true"></ag-grid-vue>
    </template>

    <v-row class="pagination-bar" align="center" justify="end">
      <v-col>
        <v-btn
          color="primary"
          v-if="!is_hide_save_button && ag_grid_vue.total_page"
          style="height: 29px; padding: 10px 10px"
          @click="save_search_data_manually()"
          :loading="is_manual_save_loading">
          검색 저장
        </v-btn>
      </v-col>
      <v-col cols="auto">
        <div style="height: 25px" class="no-drag">페이지 당 보여질 갯수</div>
      </v-col>
      <v-col cols="auto" style="width: 80px">
        <v-select
          v-model="page_select_box.selected_item"
          :items="page_select_box.items"
          class="custom-select"
          @change="onPageSizeChange"
          :menu-props="{ top: true, offsetY: true }"></v-select>
      </v-col>
      <v-col cols="auto" v-if="ag_grid_vue.total_page" class="no-drag">
        {{ ag_grid_vue.start_page_idx }} - {{ ag_grid_vue.end_page_idx }} /
        {{ ag_grid_vue.total_item_cnt }}
      </v-col>
      <v-col cols="auto">
        <v-btn icon @click="first_page" :disabled="is_first_page">
          <v-icon>mdi-page-first</v-icon>
        </v-btn>
        <v-btn icon @click="prev_page" :disabled="is_first_page">
          <v-icon>mdi-chevron-left</v-icon>
        </v-btn>
        <span v-if="ag_grid_vue.total_page" class="no-drag">
          총
          <b>{{ ag_grid_vue.total_page }}</b>
          페이지 중
          <b>{{ ag_grid_vue.current_page }}</b>
          페이지
        </span>

        <v-btn icon @click="next_page" :disabled="is_last_page && !is_loading">
          <v-icon>mdi-chevron-right</v-icon>
        </v-btn>
        <v-btn icon @click="last_page" :disabled="is_last_page && !is_loading">
          <v-icon>mdi-page-last</v-icon>
        </v-btn>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Nullable } from "@/types/default";
import AG_GRID_LOCALE_EN from "../locales/locale.en";
import { AGGridVueArticle } from "@/types/view";
import { ColumnApi, GridApi, GridReadyEvent } from "ag-grid-community";
import { defineComponent } from "vue";
import { AgGridVue } from "ag-grid-vue";
import CustomLinkRenderer from "./CustomRenderer/LinkRenderer.vue";
import TitleRenderer from "./CustomRenderer/TitleRenderer.vue";

// 컴포넌트 만들 시 defineComponent() 로 반드시 묶어줘야 한다.
export default defineComponent({
  // 상위 컴포넌트에서 전달받는 props
  props: {
    progress_value: String, // 프로그레스바 표시를 위한 변수
    loading_text_data: String, // 로딩중에 표시할 텍스트
    is_loading: Boolean, // 검색 버튼에서 로딩중인지 표시
    is_manual_save_loading: Boolean, // 수동 저장 버튼에서 로딩중인지 표시

    // 데이터 표시를 위한 props
    rows_data: {
      required: true,
      type: Array as () => AGGridVueArticle[],
    },

    //왼쪽 아래 저장 버튼 숨기기 여부
    is_hide_save_button: {
      required: false,
      type: Boolean,
      default: false,
    },
  },

  // 저장하는 데이터
  data() {
    return {
      theme_color: "#3B4890",
      // 페이지 당 보여질 갯수
      page_select_box: {
        items: ["10", "20", "30", "40", "50", "모두"],
        selected_item: "",
      },

      // ag_grid_vue 에서 사용하는 옵션들
      ag_grid_vue: {
        // ag_grid_vue 의 모든 Column 에 기본 적용되는 옵션
        default_columns_def: {
          sortable: true,
          resizable: true,
          cellStyle: { fontSize: "0.875rem" },
          lockVisible: true, // 열 삭제 기능 제거
          // wrapText: true,
          // autoHeight: true,
        },
        columns: [
          {
            field: "번호",
            width: 95,
            cellRenderer: "CustomLinkRenderer",
            cellRendererParams: "",
            // filter: "agNumberColumnFilter",
          },
          {
            field: "제목",
            flex: 1,
            filter: "agTextColumnFilter",
            cellRendererFramework: "SpoilerRenderer",
          },
          {
            field: "댓글수",
            width: 70,
            // filter: "agNumberColumnFilter"
          },
          {
            field: "작성자",
            width: 100,
            // filter: "agTextColumnFilter"
          },
          {
            field: "작성일",
            width: 70,
            // filter: "agTextColumnFilter"
          },
          {
            field: "조회수",
            width: 70,
            // filter: "agNumberColumnFilter"
          },
          { field: "추천", width: 80, filter: "agNumberColumnFilter" },
        ],
        rows: [
          // { 열1: "값1", 열2: "값2", 열3: 값3 },
        ] as AGGridVueArticle[],
        locale_text: AG_GRID_LOCALE_EN,
        grid_api: null as Nullable<GridApi>,
        grid_column_api: null as Nullable<ColumnApi>,
        current_page: null as Nullable<number>,
        total_page: null as Nullable<number>,
        start_page_idx: null as Nullable<number>,
        end_page_idx: null as Nullable<number>,
        total_item_cnt: null as Nullable<number>,
        pagination_size: 10,
        is_pagination: true,
      },

      filter_text: "", // 전체 필터링에 넣을 텍스트
    } as any;
  },
  // 계산된 속성
  computed: {
    // 첫 번째 페이지인지 계산
    is_first_page() {
      if (
        this.ag_grid_vue.current_page === 1 &&
        this.ag_grid_vue.start_page_idx === 1
      ) {
        return true;
      } else {
        return false;
      }
    },
    // 마지막 페이지인지 계산
    is_last_page() {
      if (
        this.ag_grid_vue.current_page === this.ag_grid_vue.total_page &&
        this.ag_grid_vue.end_page_idx === this.ag_grid_vue.total_item_cnt
      ) {
        return true;
      } else {
        return false;
      }
    },
  },
  methods: {
    save_search_data_manually() {
      // 검색 저장 버튼 클릭시 호출되는 함수

      // 저장을 위해 이벤트를 상위로 전파시킨다.
      this.$emit("manual_save");
    },
    // 맨 첫페이지 << 버튼
    first_page() {
      this.ag_grid_vue.grid_api?.paginationGoToFirstPage();
    },
    // 맨 마지막 페이지 >> 버튼
    last_page() {
      this.ag_grid_vue.grid_api?.paginationGoToLastPage();
    },
    // 이전 페이지 < 버튼
    prev_page() {
      this.ag_grid_vue.grid_api?.paginationGoToPreviousPage();
    },
    // 다음 페이지 > 버튼
    next_page() {
      this.ag_grid_vue.grid_api?.paginationGoToNextPage();
    },
    // 페이지 모드를 "모두" 로 바꾸면 페이지로 보여주는 기능을 제거하고 (Remove Pagnation),
    // 아니라면 페이지 모드를 켜고 페이지 사이즈를 바꾼다.
    onPageSizeChange() {
      if (this.page_select_box.selected_item != "모두") {
        this.ag_grid_vue.is_pagination = true;
        this.ag_grid_vue.pagination_size = parseInt(
          this.page_select_box.selected_item
        );
      } else {
        this.ag_grid_vue.is_pagination = false;
      }
    },
    // 필터링 텍스트가 바뀔때마다 호출되는 함수
    onFilterTextChange() {
      if (this.ag_grid_vue.grid_api) {
        // 렉이 걸리는 것을 방지하기 위해 비동기 setTimeout 사용
        setTimeout(() => {
          this.ag_grid_vue.grid_api?.setQuickFilter(this.filter_text);
        }, 0);
      }
    },
    onGridReady(params: GridReadyEvent) {
      this.ag_grid_vue.grid_api = params.api;
      this.ag_grid_vue.grid_column_api = params.columnApi;

      // 그리드가 준비되면 즉시 페이지네이션 상태 업데이트
      this.$nextTick(() => {
        this.onPaginationChanged();
      });
    },
    onGridSizeChanged(params: any) {
      // params.api.sizeColumnsToFit();
    },
    onPaginationChanged() {
      if (this.ag_grid_vue.grid_api) {
        // 현재 페이지가 0이 아닐때만 렌더링
        this.ag_grid_vue.current_page =
          this.ag_grid_vue.grid_api.paginationGetCurrentPage() + 1;
        this.ag_grid_vue.total_page =
          this.ag_grid_vue.grid_api.paginationGetTotalPages();

        this.ag_grid_vue.total_item_cnt =
          this.ag_grid_vue.grid_api.getDisplayedRowCount();

        const row_count = this.ag_grid_vue.total_item_cnt;
        const last_grid_idx = row_count - 1;
        const current_page = this.ag_grid_vue.current_page;
        const page_size = this.ag_grid_vue.grid_api.paginationGetPageSize();
        let start_page_idx = (current_page - 1) * page_size;
        let end_page_idx = current_page * page_size - 1;

        if (end_page_idx > last_grid_idx) {
          end_page_idx = last_grid_idx;
        }

        this.ag_grid_vue.start_page_idx = start_page_idx + 1;
        this.ag_grid_vue.end_page_idx = end_page_idx + 1;
      }
    },
  },
  mounted() {
    // 첫 번째 아이템으로 기본값 설정
    this.page_select_box.selected_item = this.page_select_box.items[0];
  },
  components: {
    // 갤러리 번호 클릭시 새 탭으로 열기 위한 커스텀 컴포넌트 (필수)
    // eslint-disable-next-line vue/no-unused-components
    CustomLinkRenderer,
    // eslint-disable-next-line vue/no-unused-components
    SpoilerRenderer: TitleRenderer,
    AgGridVue,
  },
});
</script>

<style lang="scss">
@import "~ag-grid-community/styles/ag-grid.css";
// @import "~ag-grid-community/styles/ag-theme-alpine.css";
@import "~ag-grid-community/styles/ag-theme-material.css";
</style>

<style scoped>
.pagination-bar {
  font-size: 0.75rem;
  margin-top: -25px;
  justify-content: flex-end;
}

.custom-select {
  font-size: 0.75rem;
}

.ag-theme-material {
  --ag-cell-horizontal-padding: 16px;
  border-bottom: none;
}

.no-drag {
  user-select: none;
}
</style>
