<template>
  <div>
    <v-dialog v-model="sync_is_open_dialog" width="400px">
      <v-card>
        <v-toolbar density="compact" :color="color" dense>
          <v-toolbar-title>
            <span style="color: white" class="no-drag">Load Interface</span>
          </v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon @click="sync_is_open_dialog = false" class="no-drag">
            <v-icon color="white">mdi-close</v-icon>
          </v-btn>
        </v-toolbar>
        <div class="pa-4">
          <v-list-item two-line>
            <v-list-item-content>
              <v-list-item-title class="text-h5">저장 목록</v-list-item-title>
              <v-list-item-subtitle class="mb-2">
                어떤 저장 목록을 확인하실 지 선택해주세요
              </v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
          <v-list-item>
            <v-list-item-content>
              <v-btn color="primary" class="mb-3" @click="click_auto_save_item">
                자동 저장 목록
              </v-btn>
              <v-btn color="success" @click="click_manual_save_item">
                수동 저장 목록
              </v-btn>
            </v-list-item-content>
          </v-list-item>
        </div>
      </v-card>
    </v-dialog>

    <!-- 수동 저장 목록 -->
    <save-all-list
      :type="save_type.manual"
      :is_open_dialog="is_open_manual_data"
      :color="color"
      v-on:update:value="is_open_manual_data = $event"
      v-on:delete:article="manual_delete_article"
      :save_data="manual_save_data"></save-all-list>

    <!-- 자동 저장 목록 -->
    <save-all-list
      :type="save_type.auto"
      :is_open_dialog="is_open_save_data"
      :color="color"
      v-on:update:value="is_open_save_data = $event"
      v-on:delete:article="auto_delete_article"
      :save_data="auto_save_data"></save-all-list>
  </div>
</template>

<script lang="ts">
import { Nullable } from "@/types/default";
import { SaveArticleData } from "@/types/view";
import { defineComponent } from "vue";
import SaveAllList from "./SaveList.vue";
import { ipcRenderer } from "electron";
import Vue from "vue";
import { IPCChannel } from "../../../types/ipc";

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
  props: {
    is_open_dialog: Boolean,
    color: String,
    auto_save_data: {
      type: Array as () => SaveArticleData[],
      default: () => [],
    },
    manual_save_data: {
      type: Array as () => SaveArticleData[],
      default: () => [],
    },
  },
  data() {
    return {
      save_type: {
        auto: Mode.AUTO,
        manual: Mode.MANUAL,
      },
      selected_auto_save_data: null as Nullable<SaveArticleData>,
      is_open_save_data: false,
      is_open_manual_data: false,
    };
  },
  computed: {
    // 부모에서 값을 자식에도 실시간 바인딩 시키려면 computed를 사용해야 한다.
    sync_is_open_dialog: {
      get(): boolean {
        return this.is_open_dialog;
      },
      set(value: boolean) {
        this.$emit("update:value", value);
      },
    },
  },
  methods: {
    // 수동 저장 목록 클릭
    async click_auto_save_item() {
      // await this.read_file();
      this.is_open_save_data = !this.is_open_save_data;
    },

    // 자동 저장 목록 클릭
    async click_manual_save_item() {
      // await this.read_file();
      this.is_open_manual_data = !this.is_open_manual_data;
    },

    async manual_delete_article(index: number) {
      // index 번을 삭제합니다 출력
      // console.log(`수동 삭제 : 상위에서 ${index}번을 삭제합니다.`);

      // 상위로 이벤트 전파
      this.$emit("delete:article", { type: "manual", index });
    },

    async auto_delete_article(index: number) {
      this.$emit("delete:article", { type: "auto", index });
      // // index 번을 삭제합니다 출력
      // console.log(`자동 삭제 : 상위에서 ${index}번을 삭제합니다.`);
    },

    // 클릭할때마다 호출해야 하는 파일 읽기 함수
    // async read_file() {
    //   try {
    //     const data = await fs.promises.readFile("dc_data.json", "utf-8");
    //     const parsed_data: SaveData = JSON.parse(data);
    //     if (parsed_data.auto_save && parsed_data.auto_save.length !== 0) {
    //       this.auto_save_data = parsed_data.auto_save;
    //     }
    //     if (parsed_data.manual_save && parsed_data.manual_save.length !== 0) {
    //       this.manual_save_data = parsed_data.manual_save;
    //     }
    //   } catch (error: any) {
    //     console.log(error);
    //   }
    // },
  },
  components: {
    SaveAllList,
  },
});
</script>

<style scoped></style>
