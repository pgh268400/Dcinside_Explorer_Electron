# Dcinside_Explorer_Electron
![image](https://github.com/pgh268400/Dcinside_Explorer_Electron/assets/31213158/e9d583e7-3828-43f6-b1c8-4f78f7bf9c3b)

기존 파이썬으로 구현된 동기적 디시 글 검색기를 타입스크립트를 활용한 비동기 병렬 처리로 개선한 버전입니다.
데스크탑 앱 제작을 위해 ```Electron``` 프레임 워크를 백엔드로 사용하며 화면 렌더링을 위해 클라이언트로 ```Vue```와 ```Vuetify``` 프레임워크를 사용합니다.  
기존 파이썬 프로젝트와 다르게 페이지 단위가 아닌 전체 10000개 단위에서 모든 글을 추출하는 형태로 동작합니다.  
예를 들어서 갤러리 글이 100만개인 경우 반복 횟수를 100만 주면 100 * 10000개 만큼 병렬 처리가 돌아가 모든 갤러리 글의 검색 결과를 가져올 수 있습니다.

## 주의, 참고사항
- 해당 프로그램은 테스트 버전이며 잠재적인 버그가 많을 수 있습니다.
- 메모리 누수가 발생할 수 있습니다.
- 일렉트론은 크로미움 엔진 (크롬 브라우저) 을 사용하기 때문에 메모리, CPU 사용량이 매우 많습니다.
  - 크롬 브라우저가 컴퓨터 자원을 많이 먹는걸 생각해보면 됩니다.
- 디시 서버 상태, 검색어에 따라 응답 속도가 매우 차이날 수 있습니다.
  - 디시 서버 자체가 느려서 검색 속도를 극적으로 개선하기가 어렵습니다.
  - 현재는 평균적으로 국내야구 갤러리의 700만개의 글을 모두 검색하는데 40초 정도의 성능을 보입니다.
