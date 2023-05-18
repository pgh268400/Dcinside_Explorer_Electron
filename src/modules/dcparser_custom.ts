/* eslint-disable prefer-const */
import axios from "axios";
import { Gallary, Search, Page, Article } from "../types/dcinside";
import rateLimit from "axios-rate-limit";
import * as http from "http";
import * as https from "https";
import axiosRetry from "axios-retry";
import * as cliProgress from "cli-progress";
import fetch, { Response } from "node-fetch";

class DCAsyncParser {
  // ==========================================================
  // 멤버 변수 선언
  private headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    Referer: "https://gall.dcinside.com/board/lists/?id=baseball_new11",
    // "Sec-Fetch-Site": "same-origin",
    // "Sec-Fetch-Mode": "navigate",
    // "Sec-Fetch-User": "?1",
    // "Sec-Fetch-Dest": "document",
    "Access-Control-Allow-Origin": "*",
  };

  // 동시 요청 제한 횟수
  private requests_limit = 100;

  // 동시 요청 제한시 몇ms 이후 다시 요청할지 지연시간
  private requests_delay = 125;

  // 갤러리 타입(일반, 마이너, 미니)
  private gallary_type: Gallary;

  // 검색 타입(제목, 내용, 제목+내용, 등등)
  private search_type: Search;

  // 검색 키워드
  private keyword: string;

  // 갤러리 ID
  private id: string;

  // maxRPS 는 perMilliseconds: 1000의 줄임말
  // maxRequests 및 perMilliseconds로 지정된 경우 우선 순위를 가진다
  // axios를 rateLimit로 묶어서 axios에 요청 제한을 건 상태로 사용한다.
  // 아마 maxRps를 걸면 다른 옵션이 무시되는거같음..?
  private http = rateLimit(
    axios.create({
      httpAgent: new http.Agent({ keepAlive: true, timeout: 60000 }),
      httpsAgent: new https.Agent({ keepAlive: true, timeout: 60000 }),
    }),
    {
      maxRequests: this.requests_limit,
      perMilliseconds: this.requests_delay,
      // maxRPS: this.requests_limit,
    }
  );

  // 아래 2코드는 같은 코드 이유는 잘..?
  // const http = rateLimit(axios.create(), { maxRequests: 2, perMilliseconds: 1000, maxRPS: 2 })
  // http.setMaxRPS(3)
  // http.setRateLimitOptions({ maxRequests: 6, perMilliseconds: 150 }) // same options as constructor

  // ==========================================================
  // 멤버 함수 선언

  public constructor(id: string) {
    this.id = id;
  }

  public static async create(id: string): Promise<DCAsyncParser> {
    const o = new DCAsyncParser(id);
    await o.initialize();
    return o;
  }

  // Promise.all 의 진행률을 확인가능한 Wrapper 함수
  private promise_all_progress<T>(
    proms: Promise<T>[],
    progress_callback: (progress: number) => void
  ) {
    let d = 0;
    progress_callback(0);
    for (const p of proms) {
      p.then(() => {
        d++;
        progress_callback((d * 100) / proms.length);
      });
    }
    return Promise.all(proms);
    // return Promise.allSettled(proms);
  }

  // 위 함수에 동시 요청 제한 기능을 추가한 함수
  promise_all_limit_progress = async <T>(
    max_concurrency: number,
    promises: (() => Promise<T>)[],
    progress_callback: (progress: number) => void
  ) => {
    const head = promises.slice(0, max_concurrency);
    const tail = promises.slice(max_concurrency);
    const result: T[] = [];
    const execute = async (
      promise: () => Promise<T>,
      i: number,
      runNext: () => Promise<void>
    ) => {
      result[i] = await promise();
      await runNext();
    };
    const runNext = async () => {
      const i = promises.length - tail.length;
      const promise = tail.shift();
      if (promise !== undefined) {
        await execute(promise, i, runNext);
      }
    };
    let d = 0;
    progress_callback(0);
    for (const p of promises) {
      p().then(() => {
        d++;
        progress_callback((d * 100) / promises.length);
      });
    }
    await Promise.all(head.map((promise, i) => execute(promise, i, runNext)));
    return result;
  };

  // 바로 순수 response data만 응답하는 커스텀 HTTP 요청
  private async custom_fetch(url: string, headers = this.headers) {
    // 타임아웃과 keepAlive를 설정해야지 연결이 끊기지 않고 TCP Connection을 재활용할 수 있음.
    // 아마 파이썬의 session.get 과 유사한 기능인듯?
    // 다만 디시 서버에서 연결이 타임아웃으로 끊기는건 너무 여러번 요청을 보내서 차단 당했을때임.
    // 너무 너무 빠르게 보내면 바로 Connection Refused 가 뜨고 조금 느리게 보내도 제한에 걸리는 순간 Connection Timeout이 뜸.
    this.http.defaults.timeout = 60000;
    this.http.defaults.httpsAgent = new https.Agent({ keepAlive: true });

    // ==========================================================

    // const res = await this.http.get(url, { headers });

    const delay = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(() => resolve(), ms));

    const retry_fetch = (
      url: string,
      fetchOptions = {},
      retries = 3,
      retryDelay = 1000,
      timeout: number
    ): Promise<Response> => {
      return new Promise((resolve, reject) => {
        // check for timeout
        if (timeout) setTimeout(() => reject("error: timeout"), timeout);

        const wrapper = (n: number) => {
          fetch(url, fetchOptions)
            .then((res) => resolve(res))
            .catch(async (err) => {
              if (n > 0) {
                await delay(retryDelay);
                wrapper(--n);
              } else {
                reject(err);
              }
            });
        };
        wrapper(retries);
      });
    };

    // 참고로 async 함수에서 값을 반환하면 Promise로 묶여서 반환되고,
    // 그냥 프로미스를 반환하면 프로미스가 그대로 반환 됨.
    const res = await retry_fetch(url, { headers }, 3, 125, 60000);
    return res.text();

    // const res = await this.http.get(url, { headers });
    // return await res.data;

    // return this.http
    //   .get(url, { headers })
    //   .then((res) => res.data)
    //   .catch((err) => {});

    // const res = await fetch(url, { headers });
    // return await res.text();

    // const res = await axios(url, { headers });
    // // return res.data;
  }

  private async initialize(): Promise<void> {
    const url = `https://gall.dcinside.com/board/lists?id=${this.id}`;
    const res = await this.custom_fetch(url);

    if (res.includes("location.replace")) {
      if (res.includes("mgallery")) {
        this.gallary_type = Gallary.Miner;
      } else {
        this.gallary_type = Gallary.Mini;
      }
    } else {
      this.gallary_type = Gallary.Default;
    }

    // for debug===============================================
    // let output = "";
    // if (this.gallary_type === Gallary.Default) {
    //   output = "일반";
    // } else if (this.gallary_type === Gallary.Miner) {
    //   output = "마이너";
    // } else if (this.gallary_type === Gallary.Mini) {
    //   output = "미니";
    // }
    // console.log("갤러리 타입 :", output);
    // ==========================================================

    // axios auto retry
    axiosRetry(this.http, {
      retries: 3,
      retryDelay: (retryCount) => {
        return 125;
      },
    });
  }

  private async get_page_structure(pos: number): Promise<Page> {
    const url = `https://gall.dcinside.com/${this.gallary_type}board/lists/?id=${this.id}&s_type=${this.search_type}&s_keyword=${this.keyword}&search_pos=${pos}`;
    let res = await this.custom_fetch(url);

    const result_guide_index = res.indexOf("result_guide");
    res = res.slice(0, result_guide_index); // result_guide 이전으로 짜르기

    const pattern = /page=(\d+)/g;
    const matches = [...res.matchAll(pattern)];

    let start_page = 1;
    let last_page = 1;

    if (matches == null || matches.length == 0) {
      console.log(res);
      console.log(url);
      console.log("파싱중 문제 발생");
      return { pos, start_page, last_page };

      // throw new Error("끝 페이지 파싱에 실패하였습니다.");
    }

    if (Math.abs(pos) < 10000) {
      // 10000개 이하의 글 검색 위치면 마지막 페이지에서 검색중이라는 뜻
      last_page = parseInt(matches[matches.length - 1][1]);
    } else {
      // 마지막 페이지가 아님
      last_page = parseInt(matches[matches.length - 2][1]);
    }

    return { pos, start_page, last_page };
  }

  private async get_article_from_page(
    pos: number,
    page: number
  ): Promise<Article[]> {
    const url = `https://gall.dcinside.com/${this.gallary_type}board/lists/?id=${this.id}&s_type=${this.search_type}&s_keyword=${this.keyword}&page=${page}&search_pos=${pos}`;
    // console.log(url);
    const res: string = await this.custom_fetch(url);

    // result_guide 이전으로 짜르기 (아래에 부수 검색 결과 거르기 위한 용도)
    const idx = res.indexOf("result_guide");
    const res2 = idx > -1 ? res.substring(0, idx) : res;

    const pattern = /<tr class="ub-content us-post"[\s\S]*?<\/tr>/gs;
    const trs = res2.match(pattern);

    if (trs == null || trs.length == 0) {
      // throw new Error(`${url} 글 목록 파싱에 실패하였습니다.`);
      // console.log(`${url} 글 목록 파싱에 실패하였습니다.`);
      return [];
    }

    const result: Article[] = [];
    for (const tr of trs) {
      // tr 태그 안에 있는 문자열 가져오기
      const gall_num: string = (tr.match(
        /<td class="gall_num".*?>(.*?)<\/td>/s
      ) || [])[1].trim();

      let gall_tit: string = (tr.match(/<td class="gall_tit.*?>(.*?)<\/td>/s) ||
        [])[1].trim();

      // 쓸데없는 태그 내용들 다 날리기
      gall_tit = gall_tit.split('view-msg ="">')[1].split("</a>")[0].trim();

      // em 태그 관련 다 지우기
      let regex = /<em class=".*?"><\/em>/g;
      gall_tit = gall_tit.replace(regex, "");

      // strong 태그 지우기
      regex = /<\/?strong>/gi;
      gall_tit = gall_tit.replace(regex, "");

      const gall_writer = (tr.match(/data-nick="([^"]*)"/) || [])[1].trim();
      const gall_date = (tr.match(/<td class="gall_date".*?>(.*?)<\/td>/) ||
        [])[1].trim();
      const gall_count = (tr.match(/<td class="gall_count">(.*?)<\/td>/) ||
        [])[1].trim();

      // console.log(tr);

      let gall_recommend: any =
        tr.match(/<td class="gall_recommend">(.*?)<\/td>/) || [];

      if (gall_recommend.length > 0) {
        gall_recommend = gall_recommend[1].trim();
      } else {
        gall_recommend =
          tr.match(/<td class="gall_recommend"(.*?)<\/td>/) || [];
      }

      result.push({
        gall_num: parseInt(gall_num),
        gall_tit,
        gall_writer,
        gall_date,
        gall_count: parseInt(gall_count),
        gall_recommend: parseInt(gall_recommend),
        reply_num: 0,
      });
    }

    return result;
  }

  public async search(
    search_type: Search,
    keyword: string,
    repeat_cnt: number,
    progress_call_back: any,
    isdebug = false
  ) {
    // 객체 변수에 검색에 관련 정보를 기억시킨다.
    // 매번 메서드 매개변수에 넘기는게 번거롭기 때문
    this.search_type = search_type;
    this.keyword = keyword;

    // 제일 처음 검색 페이지에 요청을 던져서 글 갯수 (검색 위치) 를 파악한다.
    const url = `https://gall.dcinside.com/${this.gallary_type}board/lists/?id=${this.id}&s_type=${this.search_type}&s_keyword=${this.keyword};`;
    const res = await this.custom_fetch(url);

    // 다음 페이지 버튼에서 다음 10000개 글 검색 위치를 찾는다
    // 현재 글 위치는 next_pos - 10000 으로 계산 가능, DC 서버는 10000개씩 검색하기 때문

    let next_pos_obj = res.match(/search_pos=(-?\d+)/);

    if (next_pos_obj == null || next_pos_obj.length == 0) {
      throw new Error("다음 검색 위치를 찾을 수 없습니다.");
    }
    const next_pos = parseInt(next_pos_obj[1]);

    const current_pos: number = next_pos - 10000;
    if (isdebug) {
      console.log(`현재 글 위치 : ${current_pos}`);
      console.log(`다음 검색 위치 : ${next_pos}`);
      console.log(`전체 글 목록 ${Math.abs(next_pos)}개`);
      console.log(
        "먼저 10000개 단위로 검색하면서 각 목록의 페이지 수를 파악합니다."
      );
    }

    const start = new Date().getTime();

    // 최대 페이지
    const max_pos = Math.floor(Math.abs(current_pos) / 10000 + 1);
    if (isdebug) console.log(`최대 탐색 가능 횟수 : ${max_pos}개`);

    // 다음 검색을 누를 횟수 (수정하는 부분)
    // next_search_cnt = max_pos;
    const next_search_cnt = repeat_cnt;

    // url에 현재 pos 부터 10000씩 더해가면서 요청을 보낸다
    // 그때 사용할 임시 변수 : pos
    let tmp_pos = current_pos;

    // pos 범위 임시 출력용 리스트
    // const tmp_pos_list: number[] = [];

    // const promises = [];

    // console.time("Blocking Test 1");
    // for (let i = 0; i < next_search_cnt; i++) {
    //   const promise = this.get_page_structure(tmp_pos)
    //     .then((item) => {
    //       return new Promise((resolve) => {
    //         resolve(item);
    //       });
    //     })
    //     .then((item: any) => {
    //       const page_promises = [];

    //       for (let page = item.start_page; page <= item.last_page; page++) {
    //         const page_promise = this.get_article_from_page(item.pos, page);
    //         page_promises.push(page_promise);
    //       }

    //       return Promise.all(page_promises);
    //     });

    //   promises.push(promise);

    //   tmp_pos += 10000;
    //   if (Math.abs(tmp_pos) < 10000) {
    //     break;
    //   }
    // }
    // console.timeEnd("Blocking Test 1");

    // console.time("Blocking Test 2");
    // const result = await this.promise_all_limit_progress(
    //   100,
    //   promises.map((p) => () => p),
    //   (p) => {
    //     console.log(p);
    //   }
    // );
    // // console.log(result);
    // console.timeEnd("Blocking Test 2");

    // const result_articles: Article[][] = [];

    // console.time("Blocking Test");
    // for (let i = 0; i < next_search_cnt; i++) {
    //   this.get_page_structure(tmp_pos)
    //     .then((item) => {
    //       return new Promise((resolve) => {
    //         resolve(item);
    //       });
    //     })
    //     .then((item: any) => {
    //       for (let page = item.start_page; page <= item.last_page; page++) {
    //         this.get_article_from_page(item.pos, page).then((articles) => {
    //           result_articles.push(articles);
    //           console.log(articles);
    //         });
    //       }
    //     });

    //   tmp_pos += 10000;
    //   if (Math.abs(tmp_pos) < 10000) {
    //     break;
    //   }
    // }
    // console.timeEnd("Blocking Test");

    // console.log("기다립시다");
    // console.log(result_articles);

    const result: any = [];
    for (let i = 0; i < next_search_cnt; i++) {
      this.get_page_structure(tmp_pos).then((item) => {
        for (let page = item.start_page; page <= item.last_page; page++) {
          this.get_article_from_page(item.pos, page).then((articles) => {
            // console.log(articles);
            result.push(articles);
          });
        }
      });

      tmp_pos += 10000;
      if (Math.abs(tmp_pos) < 10000) {
        break;
      }
    }

    return result;
  }
}

export { DCAsyncParser };

// 실제 실행 코드
async function main() {
  const parser = await DCAsyncParser.create("baseball_new11");
  const result = await parser.search(
    Search.TITLE_PLUS_CONTENT,
    "야순이",
    999,
    // slint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    (p: number) => {
      //
    },
    true
  );
  // console.log(result);
  // const parser = await DCAsyncParser.create("tboi");
  // const result = await parser.search(
  //   Search.TITLE_PLUS_CONTENT,
  //   "아이작",
  //   1,
  //   // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
  //   (p: number) => {},
  //   true
  // );
  // console.log(result);
  // console.log(result.length);
}

// 파이썬의 if __name__ == '__main__' 과 동일한 코드
if (require.main === module) {
  // 즉시 실행 함수 꼼수 이용하여 TOP LEVEL async 함수 실행
  (async function () {
    await main();
  })();
}