# 포챔스 달콤아 봇

웹앱과 동일한 `dist/engine.mjs`를 사용합니다. 슬래시 명령만 처리하며 일반 채널 메시지를 읽거나 저장하지 않습니다. `/명령어` 목록만 채널에 공개하고 나머지 응답은 요청한 사용자에게만 표시합니다. 챔피언스 이외의 게임 데이터 API를 호출하지 않습니다.

| 명령 | 동작 |
| --- | --- |
| `/메타` | 공개 파티 표본 내 채용 비율 |
| `/메타 포켓몬:블래키 모드:싱글` | 해당 포켓몬의 상세 통계와 개별 채용률 |
| `/샘플 포켓몬:블래키 모드:싱글` | 검색 후보의 순위·공개파티 채용률과 최상위 통계 세팅 |
| `/추천 포켓몬:블래키,한카리아스` | 팀메이트와 공개 파티 동반 기록 기반 후보 |
| `/파티 포켓몬:블래키` | 고정 멤버를 포함한 여섯 마리 세팅 초안 |
| `/결정력계산기 공격포켓몬:달코퀸 방어포켓몬:한카리아스` | 채용률 상위 4개 기술 중 대상에게 가장 강한 기술로 7개 내구 배분의 타수 일괄 계산 |
| `/스피드계산기 공격포켓몬:달코퀸 방어포켓몬:한카리아스` | 최속·준속·무보정 및 각 스카프 기준 일괄 비교 |
| `/계산기 공격포켓몬:달코퀸 방어포켓몬:한카리아스 기술:트리플악셀 방어배분:H0·B/D0 모드:싱글` | 통계 1위 공격 세팅으로 데미지·확정/난수 타수·결정력·내구력·스피드 계산 |
| `/웹앱` | 포챔스 달콤아 봇 웹앱 주소 표시 |
| `/스크린샷` | 웹앱의 OCR 입력 기능 안내. 봇 첨부 이미지 자동 인식은 미구현 |
| `/명령어` | 전체 명령어 목록을 채널에 공개 메시지로 표시 |

`/계산기`의 공격 포켓몬·방어 포켓몬·기술은 자동완성을 지원합니다. 기술은 선택한 공격 포켓몬의 해당 모드 통계에 등재된 공격기만 보여 줍니다. 공격 측은 도구·특성·성격·능력배분 각각의 채용률 1위를 조합하고, 방어 측은 선택한 내구 배분과 무보정 성격을 사용합니다. 이는 실제로 함께 채용된 완성 세트의 통계가 아닙니다.

`/결정력계산기`는 공격 측 채용률 상위 4개 기술 중 대상에게 계산상 최대 피해를 주는 공격기를 자동 선택합니다. `H0 B0`, `H32 B0`, `H32 B32`, `H0 B32`, `H32 D0`, `H32 D32`, `H0 D32`를 줄별로 표시합니다. `/스피드계산기`의 최속은 S32+상승 성격, 준속은 S32 무보정 성격, 무보정은 S0이며 스카프는 각각 ×1.5 후 버림합니다.

## 연결 준비

1. Discord Developer Portal에서 Application을 만들고 Application ID와 Public Key를 확인합니다. 앱 이름은 `포챔스 달콤아 봇`으로 맞추고, 앱 아이콘에는 `dist/assets/dalkoma-logo-512.png`를 업로드하면 웹앱과 동일한 로고가 적용됩니다.
2. AWS 배포 시 Public Key를 전달합니다. 공개키는 비밀 토큰이 아닙니다.

```bash
python aws/deploy.py --region ap-northeast-2 --discord-public-key YOUR_PUBLIC_KEY
```

3. 반환된 DiscordEndpoint를 Application의 Interactions Endpoint URL에 입력합니다. 서버는 Ed25519 서명과 타임스탬프를 검증하며 PING 요청에 응답합니다.
4. Bot 탭의 토큰을 로컬 환경 변수로만 설정한 다음 명령을 등록합니다. 토큰을 채팅이나 소스에 붙여넣지 마세요.

```bash
node discord/register.mjs
```

필요한 환경 변수는 `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`입니다. 서버 한 곳에는 `DISCORD_GUILD_ID`, 여러 서버에는 쉼표로 구분한 `DISCORD_GUILD_IDS`를 지정합니다. 등록 스크립트는 Discord의 일괄 덮어쓰기 API를 한 번 호출하므로 429 요청 제한을 피하고, 제한 응답을 받으면 자동으로 기다렸다가 다시 시도합니다. 지정한 범위에서 이 앱이 전에 등록했던 명령은 위 목록으로 교체됩니다.

```bash
export DISCORD_GUILD_IDS=1330195389839704215,1525552172417286266
read -s DISCORD_BOT_TOKEN
export DISCORD_BOT_TOKEN
node discord/register.mjs
unset DISCORD_BOT_TOKEN
```

5. Developer Portal의 **Installation**에서 **Guild Install**을 켜고, 기본 범위에 `applications.commands`와 `bot`을 모두 추가합니다. 설치 링크를 여는 계정은 대상 서버의 **서버 관리(Manage Server)** 권한이 있어야 합니다. 봇 권한은 이 기능 기준 `Send Messages`만으로 충분하며 일반 메시지 읽기나 관리자 권한은 필요하지 않습니다.

## 실행 구조

Discord → 서명 검증 Lambda Function URL → 공유 추천 엔진 → 비공개 응답.

초기 응답 제한을 고려해 계산은 동기적으로 수행합니다. 기본 통계는 배포 패키지에 포함하고 오픈데이터는 자체 웹앱의 캐시 파일에서만 최대 0.7초 동안 확인합니다. 원본 데이터 제공 사이트에 명령마다 요청하지 않습니다. 정상적인 자체 데이터 조회가 실패하면 마지막 정상 스냅샷을 사용하며 응답에 데이터 기준일을 표시합니다.

AWS와 Discord 계정 연결은 아직 실행하지 않았습니다. 실제 서버에서 연결, 응답 지연, 공개키 설정을 확인해야 합니다. 웹의 개인 파티와 디스코드 계정의 영구 동기화는 현재 지원하지 않습니다.

공식 문서:
- https://docs.discord.com/developers/interactions/overview
- https://docs.discord.com/developers/interactions/application-commands
- https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html
