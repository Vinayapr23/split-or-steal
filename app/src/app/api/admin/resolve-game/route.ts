import { NextRequest, NextResponse } from "next/server";
import { SystemProgram, Transaction, sendAndConfirmTransaction, PublicKey } from "@solana/web3.js";
import { BN, BorshCoder } from "@coral-xyz/anchor";
import { IDL } from "@/lib/idl";
import { getAdminKeypair, getProgram, getConnection } from "@/lib/serverUtils";
import { deriveGamePDA } from "@/lib/constants";

async function ensureRentExempt(
  connection: ReturnType<typeof getConnection>,
  admin: ReturnType<typeof getAdminKeypair>,
  ...pubkeys: PublicKey[]
) {
  const minBalance = await connection.getMinimumBalanceForRentExemption(0);
  const balances = await Promise.all(pubkeys.map((pk) => connection.getBalance(pk)));

  const transfers = pubkeys
    .map((pk, i) => ({ pk, shortfall: minBalance - balances[i] }))
    .filter(({ shortfall }) => shortfall > 0);

  if (transfers.length === 0) return;

  const tx = new Transaction();
  for (const { pk, shortfall } of transfers) {
    tx.add(
      SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: pk, lamports: shortfall })
    );
  }
  await sendAndConfirmTransaction(connection, tx, [admin], { commitment: "confirmed" });
}

export async function POST(req: NextRequest) {
  try {
    const { gameId } = await req.json();
    const admin = getAdminKeypair();
    const connection = getConnection();
    const program = getProgram(admin, connection);

    const id = BigInt(gameId);
    const gamePda = deriveGamePDA(id);

    const accountInfo = await connection.getAccountInfo(gamePda);
    if (!accountInfo) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    const game = new BorshCoder(IDL as any).accounts.decode("Game", accountInfo.data);
    if (!game.player1 || !game.player2)
      return NextResponse.json({ error: "Players not set" }, { status: 400 });

    await ensureRentExempt(connection, admin, game.player1, game.player2);

    const tx = await (program as any).methods
      .resolveGame(new BN(gameId))
      .accounts({
        admin: game.admin,
        player1: game.player1,
        player2: game.player2,
        game: gamePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return NextResponse.json({ success: true, tx });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
