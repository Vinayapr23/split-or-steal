# Split or Steal

A on-chain implementation of the classic split-or-steal prisoner's dilemma game, built on Solana. Two players secretly choose to **split** or **steal** a SOL pot — the result is enforced by a smart contract with no possibility of cheating.

## How it works

| Player 1 | Player 2 | Outcome |
|----------|----------|---------|
| Split | Split | Each gets half the pot |
| Steal | Split | Stealer takes everything |
| Split | Steal | Stealer takes everything |
| Steal | Steal | House keeps the pot |

Choices are submitted as **commit-reveal**: each player first posts a SHA-256 hash of their choice, then reveals the preimage after both have committed. This prevents either player from seeing the other's choice before locking in their own.

## Architecture

```
split-or-steal/
├── programs/split_or_steal/   # Anchor smart contract (Rust)
│   └── src/
│       ├── instructions/      # create_game, join_game, commit_choice, reveal_choice, resolve_game
│       └── state/             # Game account schema
├── app/                       # Next.js 16 frontend
│   └── src/
│       ├── app/
│       │   ├── api/           # Server-side API routes (admin, game actions)
│       │   ├── game/          # Game room UI
│       │   ├── admin/         # Admin dashboard
│       │   └── page.tsx       # Lobby
│       ├── hooks/             # Solana data-fetching hooks
│       ├── components/        # UI components
│       └── lib/               # Constants, IDL, server utilities
└── tests/                     # Anchor integration tests (Mocha/Chai)
```

## Game flow

```
CreateGame (admin, sets pot)
    └── JoinGame (player 1 & 2)
            └── CommitChoice x2 (SHA-256 hash of choice + nonce)
                    └── RevealChoice x2 (opens the hash)
                            └── ResolveGame (admin, distributes pot)
```

Player keypairs are server-derived deterministic accounts — users interact through the web UI and the server signs on their behalf.

## Program

- **Network**: Solana Devnet
- **Program ID**: `EUhegCm4fWDW5dN8MbYNN7tvTjeRVD1QA8Kuo2vCdorq`
- **Framework**: Anchor 0.32

## Tech stack

| Layer | Technology |
|-------|-----------|
| Smart contract | Rust, Anchor 0.32 |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Solana client | `@solana/web3.js`, `@coral-xyz/anchor` |
| Wallet | `@solana/wallet-adapter` |
| Deployment | Vercel (frontend), Solana Devnet (program) |

## Local development

### Prerequisites

- [Rust](https://rustup.rs/) + `solana` CLI + `anchor` CLI
- Node.js 18+ and Yarn
- A funded Solana devnet wallet at `~/.config/solana/id.json`

### 1. Build and deploy the program

```bash
anchor build
anchor deploy --provider.cluster devnet
```

### 2. Run the frontend

```bash
cd app
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Run tests

```bash
anchor test
```

## Environment variables

Create `app/.env.local`:

```env
# Admin password for accessing the game dashboard
ADMIN_PASSWORD=strong-string-password

# Base58-encoded JSON secret key for the admin/house wallet
ADMIN_PRIVATE_KEY='[1,2,3,...]'

# Arbitrary secret used to derive per-game player keypairs
SERVER_SECRET=your-random-secret-here

# Solana RPC endpoint
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
```

> The admin wallet funds the pot on game creation and pays the shortfall to fund player accounts at resolution time. Keep it topped up with devnet SOL (`solana airdrop 2`).

## Deployment

The frontend deploys to Vercel automatically. The smart contract lives on Solana Devnet at the program ID above — redeployment requires `anchor deploy` with the program keypair.
