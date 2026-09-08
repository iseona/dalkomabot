# AWS 배포 안내

## 구성

웹앱은 `dist/`를 S3에 올려 CloudFront로 제공합니다. 스크린샷은 브라우저에서 최대 1600px JPEG로 축소한 뒤 인식 Lambda에 전송하며, Lambda가 OpenAI Responses API를 호출합니다. API 키는 Secrets Manager에만 보관합니다. 개인 파티는 브라우저 저장소에 저장합니다.

- S3: 정적 앱과 검증된 데이터 보관, 버전 관리, 버킷 직접 공개 차단
- CloudFront: HTTPS 배포, OAC로 S3 접근, 데이터 캐시 5분
- Lambda: 챔피언스 지정 호스트의 M-4 JSON 두 파일만 수집, 한글 명칭 대응 및 마스터 검증 후 `opendata.json` 교체
- EventBridge Scheduler: 하루 한 번 갱신 설정을 포함하지만 기본값은 비활성
- CloudWatch: 수집 로그 14일 보관

CloudFront 웹 주소는 앱 공개용이며 사용자 로그인 기능은 없습니다. 개인 파티는 서버에 올라가지 않습니다. 비공개 로그인 배포가 필요하면 Cognito 등 인증을 추가한 뒤 공개해야 합니다. AWS에 아직 실제 리소스를 생성하지 않았으며 비용은 발생시키지 않았습니다.

## 준비 및 실행

AWS CLI v2, Python 3, 본인 AWS 계정의 배포 권한을 준비합니다. 자격 증명을 소스에 쓰지 말고 AWS SSO나 CLI 프로필을 사용하세요. 아래 명령은 **실제 AWS 리소스를 생성하며 요금이 발생할 수 있습니다.**

```bash
aws sso login --profile your-profile
export AWS_PROFILE=your-profile
read -s -p "OpenAI API key: " OPENAI_API_KEY && export OPENAI_API_KEY && echo
python aws/deploy.py --region ap-northeast-2 --stack champions-party-lab --max-daily-recognition-requests 100
unset OPENAI_API_KEY
```

인식은 UTC 기준 일일 100회로 하드 제한됩니다. OpenAI 프로젝트에서도 월 지출 한도를 설정하세요.

이 스크립트는 CloudFormation 스택 생성, 정적 파일 업로드, Lambda 코드 업로드, CloudFront 캐시 갱신까지 수행하고 웹 주소를 출력합니다. `aws/collector.zip`은 자동 생성되며 소스 관리에서 제외됩니다.

정상 배포 후 반환된 CollectorName으로 Lambda를 한 번 수동 실행하고 로그와 데이터 결과를 확인합니다. 그다음 Scheduler 콘솔에서 해당 스케줄을 활성화하면 됩니다. 요청하지 않은 자동 갱신을 만들거나 실행하지 않도록 기본값은 비활성으로 준비했습니다.

## 데이터 수집 계약

참고 안내: https://champs.pokedb.tokyo/guide/opendata

오픈데이터는 서버에서 한 번 내려받아 앱에 제공하며 사용자의 브라우저에서 원본 사이트를 호출하지 않습니다. 구현은 M-4 싱글/더블을 각각 한 번 요청합니다. 최신 시즌 자동 탐색이나 다른 게임 호스트로의 대체 요청은 없습니다. 새 시즌을 쓰려면 마스터 목록과 명칭 대응표를 먼저 갱신한 뒤 승인된 시즌 번호를 코드에 반영하세요.

알 수 없는 ID, 이름, 도구가 들어오면 전체 갱신을 실패시키고 이전 정상 데이터를 유지합니다. 두 모드 검증 후 단일 S3 객체를 교체합니다. 상세 세팅은 별도 첨부 자료이므로 오픈데이터 갱신이 상세 세팅까지 최신화한 것으로 표시하지 않습니다. 스냅샷의 기준일과 공개 파티의 갱신 시각을 UI에 구분합니다.

원문에 들어 있는 다른 버전용 필드는 출력 데이터에서 제외했습니다. 공개 파티의 채용 비율은 전체 랭크배틀 사용률이 아닙니다.

## 검증과 남은 사항

로컬에서 데이터, JavaScript·Python 문법, AI 응답 스키마와 비용 제한을 검사합니다. AWS Lambda와 실제 OpenAI API 호출은 배포 전 샘플 검증이 필요합니다.

한국어 명칭은 첨부 마스터를 기준으로 유지합니다. 전체 명칭의 공식 원문 대조는 별도 검수 대상으로 남아 있습니다. 참고 이미지의 별명은 아이콘만으로 자동 확정하지 않습니다.

## AWS 공식 참고 문서

- S3 OAC: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
- CloudFormation OAC: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cloudfront-originaccesscontrol.html
- Lambda 스케줄: https://docs.aws.amazon.com/lambda/latest/dg/with-eventbridge-scheduler.html
