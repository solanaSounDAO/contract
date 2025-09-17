# Solana Pump.fun Fork Platform 완벽 가이드

## 프로젝트 개요

이 프로젝트는 Pump.fun을 포크한 솔라나 기반 탈중앙화 거래소(DEX) 컨트랙트입니다. 사용자는 토큰 생성, 유동성 풀 관리, 토큰 거래를 할 수 있습니다. Anchor 프레임워크를 사용하여 솔라나 개발을 더 구조적이고 이해하기 쉽게 만들었습니다.

## 시스템 구조

```
Solana-Pump.fun-Platform-Fork/
├── programs/                  # 스마트 컨트랙트 (온체인 프로그램)
│   └── pumpdotfun/           # 메인 프로그램
│       ├── src/
│       │   ├── lib.rs        # 프로그램 진입점
│       │   ├── state.rs      # 데이터 구조
│       │   ├── consts.rs     # 상수값
│       │   ├── errors.rs     # 에러 정의
│       │   ├── instructions/ # 핵심 기능
│       │   │   ├── initialize.rs       # 시스템 초기화
│       │   │   ├── create_token.rs     # 토큰 생성
│       │   │   ├── create_pool.rs      # 풀 생성
│       │   │   ├── add_liquidity.rs    # 풀에 자금 추가
│       │   │   ├── remove_liquidity.rs # 자금 인출
│       │   │   ├── buy.rs              # 토큰 구매
│       │   │   ├── sell.rs             # 토큰 판매
│       │   │   ├── swap.rs             # 토큰 스왑
│       │   │   └── withdraw.rs         # 토큰 출금
│       │   └── utils/        # 헬퍼 함수
│       └── Cargo.toml        # Rust 의존성
├── tests/                    # 테스트 코드
│   └── index.ts             # TypeScript 테스트
├── client/                   # 클라이언트 예제
├── migrations/              # 배포 스크립트
├── Anchor.toml              # Anchor 설정
├── Cargo.toml               # Rust 워크스페이스 설정
├── package.json             # Node.js 의존성
└── README.md                # 프로젝트 문서
```

## 핵심 컴포넌트 설명

### 1. **lib.rs** - 프로그램 진입점
블록체인에 노출되는 모든 함수가 정의되는 메인 파일입니다.

**주요 함수:**
- `initialize`: 시스템 설정, 수수료 구성
- `create_token`: 메타데이터와 함께 새 SPL 토큰 생성
- `create_pool`: 유동성 풀 생성
- `add_liquidity`: 풀에 토큰/SOL 추가
- `remove_liquidity`: 풀에서 인출
- `buy`: SOL로 토큰 구매
- `sell`: 토큰을 SOL로 판매
- `withdraw`: 계정에서 토큰 출금

### 2. **state.rs** - 데이터 구조
블록체인에 저장될 데이터를 정의합니다.

**주요 구조체:**
- `CurveConfiguration`: 전역 설정 (수수료, 관리자)
- `LiquidityPool`: 풀 정보 (준비금, 생성자, 토큰 수량)
- `LiquidityProvider`: LP 지분 추적

### 3. **consts.rs** - 상수
중요한 시스템 파라미터:
- `INITIAL_PRICE_DIVIDER`: 800,000 (초기 토큰 가격)
- `INITIAL_LAMPORTS_FOR_POOL`: 10,000,000 (0.01 SOL 초기 풀)
- `TOKEN_SELL_LIMIT_PERCENT`: 8000 (80% 판매 제한)
- `V_SOL_AMOUNT`: 30.0 (본딩 커브용 가상 SOL)
- `V_TOKEN_AMOUNT`: 279,900,000.0 (가상 토큰)

### 4. **Instructions 폴더** - 핵심 기능

#### **create_token.rs**
새 토큰 생성:
- 이름, 심볼, URI (메타데이터 링크)
- 9 소수점 (솔라나 표준)
- 총 공급량을 생성자에게 민팅

#### **buy.rs / sell.rs**
본딩 커브를 사용한 거래 메커니즘:
- 자동 가격 계산
- 수수료 차감
- 잔액 업데이트

#### **add_liquidity.rs / remove_liquidity.rs**
풀 관리:
- 풀에 SOL과 토큰 추가
- LP 지분 받기
- 비율에 따라 인출

## 작동 원리

### 1. 본딩 커브 메커니즘
플랫폼은 자동 가격 발견을 위해 본딩 커브를 사용합니다:
- 토큰을 더 많이 구매할수록 가격 상승
- 토큰을 판매할수록 가격 하락
- 초기 유동성을 위해 가상 준비금 (V_SOL, V_TOKEN) 사용

### 2. 계정 구조 (PDA - Program Derived Addresses)
솔라나는 결정론적 계정 생성을 위해 PDA를 사용합니다:
- 풀 계정: `["liquidity_pool", token_mint]`
- 설정: `["CurveConfiguration"]`
- SOL 보관소: `["sol_vault", token_mint]`

### 3. 수수료 시스템
- 초기화 시 거래 수수료 설정
- 수수료는 풀에 수집
- 관리자가 누적된 수수료 인출 가능

## 설치 및 실행 가이드

### 필수 프로그램 설치

1. **Rust 설치**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

2. **Solana CLI 설치**
```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
export PATH="/Users/$USER/.local/share/solana/install/active_release/bin:$PATH"
```

3. **Anchor 설치**
```bash
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked
```

4. **Node.js 의존성 설치**
```bash
npm install
```

### 설정

1. **솔라나 지갑 생성**
```bash
solana-keygen new
# 시드 구문을 안전하게 보관하세요!
```

2. **네트워크를 Devnet으로 설정**
```bash
solana config set --url https://api.devnet.solana.com
```

3. **테스트 SOL 받기**
```bash
solana airdrop 2
```

4. **Anchor.toml 업데이트**
파일을 편집하고 다음을 교체:
- `"YOUR CONTRACT ADDRESS"`를 배포된 프로그램 ID로 (배포 후)
- 지갑 경로를 본인의 키페어 위치로 업데이트

### 배포 과정

1. **프로그램 빌드**
```bash
anchor build
```
생성되는 파일:
- 컴파일된 프로그램: `target/deploy/`
- IDL 파일: `target/idl/`
- TypeScript 타입: `target/types/`

2. **프로그램 ID 확인**
```bash
solana address -k target/deploy/pumpdotfun-keypair.json
```

3. **프로그램 ID 업데이트**
- 프로그램 ID 복사
- 다음 위치의 `"YOUR CONTRACT ADDRESS"` 교체:
  - `programs/pumpdotfun/src/lib.rs` (11번째 줄)
  - `Anchor.toml` (8번째 줄)

4. **올바른 ID로 다시 빌드**
```bash
anchor build
```

5. **Devnet에 배포**
```bash
anchor deploy
```

6. **배포 확인**
```bash
solana program show <PROGRAM_ID>
```

### 컨트랙트 테스트

1. **테스트 실행**
```bash
anchor test
```

2. **테스트 함수 순서**
- 설정 초기화
- 토큰 생성
- 풀 생성
- 유동성 추가
- 토큰 구매
- 토큰 판매
- 유동성 제거

### 컨트랙트와 상호작용

#### TypeScript 클라이언트 사용

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Pumpdotfun } from "./target/types/pumpdotfun";

// 설정
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.Pumpdotfun as Program<Pumpdotfun>;

// 시스템 초기화
async function initialize() {
    const [configPDA] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("CurveConfiguration")],
        program.programId
    );
    
    await program.methods
        .initialize(0.03) // 3% 수수료
        .accounts({
            dexConfigurationAccount: configPDA,
            admin: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
}

// 토큰 생성
async function createToken() {
    const mintKeypair = anchor.web3.Keypair.generate();
    
    await program.methods
        .createToken(
            "MyToken",           // 이름
            "MTK",              // 심볼
            "https://...",      // 메타데이터 URI
            new anchor.BN(1_000_000_000_000_000) // 9 소수점으로 1M 토큰
        )
        .accounts({
            payer: provider.wallet.publicKey,
            mintAccount: mintKeypair.publicKey,
            // ... 다른 계정들
        })
        .signers([mintKeypair])
        .rpc();
        
    return mintKeypair.publicKey;
}
```

## 일반적인 작업 가이드

### 1. 새 토큰 생성
```bash
# CLI 사용 (설정 후)
anchor run client -- create-token --name "MyToken" --symbol "MTK" --supply 1000000
```

### 2. 유동성 풀 생성
```bash
anchor run client -- create-pool --token <TOKEN_MINT_ADDRESS>
```

### 3. 토큰 구매
```bash
anchor run client -- buy --token <TOKEN_MINT_ADDRESS> --amount 0.1
```

### 4. 토큰 판매
```bash
anchor run client -- sell --token <TOKEN_MINT_ADDRESS> --amount 1000
```

## 초보자를 위한 중요 개념

### 1. **램포트 (Lamports)**
- 솔라나의 최소 단위 (이더리움의 Wei와 같음)
- 1 SOL = 1,000,000,000 램포트

### 2. **SPL 토큰**
- 솔라나의 토큰 표준 (ERC-20과 같음)
- 모든 토큰은 각 보유자마다 연관된 계정이 있음

### 3. **프로그램 파생 주소 (PDAs)**
- 프로그램이 생성한 결정론적 주소
- 프로그램 데이터와 권한 저장에 사용

### 4. **연관 토큰 계정 (ATAs)**
- 사용자를 위한 표준화된 토큰 계정
- 사용자당 토큰당 하나의 ATA

### 5. **본딩 커브**
- 가격 계산을 위한 수학 공식
- 가격 = (준비금_SOL + 가상_SOL) / (준비금_토큰 + 가상_토큰)

## 문제 해결

### 일반적인 문제와 해결책

1. **"SOL 잔액 부족"**
   - 테스트 SOL 더 받기: `solana airdrop 2`

2. **"프로그램을 찾을 수 없음"**
   - 프로그램 배포 확인: `solana program show <PROGRAM_ID>`
   - 올바른 네트워크 확인: `solana config get`

3. **"계정이 존재하지 않음"**
   - 먼저 시스템 초기화
   - 풀 생성 전에 토큰 생성

4. **빌드 에러**
   - Anchor 업데이트: `anchor upgrade`
   - Rust 버전 확인: `rustc --version`
   - 빌드 정리: `anchor clean && anchor build`

## 보안 고려사항

1. **이것은 예제 코드입니다**
   - 프로덕션용으로 감사받지 않음
   - 학습/테스트용으로만 사용

2. **메인넷 배포 전**
   - 전문 감사 받기
   - devnet/testnet에서 충분히 테스트
   - 적절한 접근 제어 구현
   - 긴급 중지 메커니즘 추가

3. **확인해야 할 일반적인 취약점**
   - 정수 오버플로우/언더플로우
   - 재진입 공격
   - 권한 검증
   - 적절한 PDA 확인

## 다음 단계

1. **컨트랙트 커스터마이징**
   - 수수료 구조 수정
   - 새 기능 추가
   - 거버넌스 구현

2. **프론트엔드 구축**
   - React/Next.js 앱 생성
   - 지갑 어댑터 통합
   - 거래 인터페이스 구축

3. **고급 기능**
   - 스테이킹 메커니즘 추가
   - 추천 시스템 구현
   - 분석 대시보드 생성

## 참고 자료

- [솔라나 문서](https://docs.solana.com)
- [Anchor 프레임워크](https://www.anchor-lang.com)
- [솔라나 쿡북](https://solanacookbook.com)
- [메타플렉스 토큰 메타데이터](https://docs.metaplex.com)

## 지원

질문이나 문제가 있을 경우:
- 원본 README.md 검토
- 솔라나/Anchor 문서 확인
- 작은 양으로 먼저 테스트
- 솔라나 Discord 커뮤니티 참여

---

**기억하세요**: 항상 devnet으로 테스트를 시작하고, 작은 양을 사용하며, 중요한 것을 배포하기 전에 코드를 이해하세요!