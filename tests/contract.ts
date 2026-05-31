import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { SplitOrSteal } from "../target/types/split_or_steal";
import { createHash } from "crypto";
import { assert } from "chai";

const MIN_POT = 1_000_000_000; // 1 SOL

function makeCommitment(choice: "split" | "steal", nonce: number): number[] {
  const nonceBuf = Buffer.allocUnsafe(8);
  nonceBuf.writeBigUInt64LE(BigInt(nonce));
  return [
    ...createHash("sha256")
      .update(Buffer.from([choice === "split" ? 0 : 1]))
      .update(nonceBuf)
      .digest(),
  ];
}

async function fund(
  provider: anchor.AnchorProvider,
  from: anchor.web3.Keypair,
  to: anchor.web3.PublicKey,
  lamports: number
) {
  const tx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports })
  );
  await provider.sendAndConfirm(tx, [from]);
}

describe("split_or_steal", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SplitOrSteal as Program<SplitOrSteal>;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const baseId = Math.floor(Date.now() / 1000);

  async function runGame(
    gameId: number,
    p1Choice: "split" | "steal",
    p2Choice: "split" | "steal"
  ) {
    const player1 = anchor.web3.Keypair.generate();
    const player2 = anchor.web3.Keypair.generate();
    // Fund players with just enough for tx fees
    await fund(provider, admin, player1.publicKey, 0.05 * 1e9);
    await fund(provider, admin, player2.publicKey, 0.05 * 1e9);

    const nonce1 = 11111 + gameId;
    const nonce2 = 22222 + gameId;
    const id = new BN(gameId);

    await program.methods.createGame(id, new BN(MIN_POT))
      .accounts({ admin: admin.publicKey })
      .signers([admin])
      .rpc();

    await program.methods.joinGame(id)
      .accounts({ player: player1.publicKey })
      .signers([player1]).rpc();

    await program.methods.joinGame(id)
      .accounts({ player: player2.publicKey })
      .signers([player2]).rpc();

    await program.methods.commitChoice(id, makeCommitment(p1Choice, nonce1))
      .accounts({ player: player1.publicKey })
      .signers([player1]).rpc();

    await program.methods.commitChoice(id, makeCommitment(p2Choice, nonce2))
      .accounts({ player: player2.publicKey })
      .signers([player2]).rpc();

    await program.methods.revealChoice(id, { [p1Choice]: {} } as any, new BN(nonce1))
      .accounts({ player: player1.publicKey })
      .signers([player1]).rpc();

    await program.methods.revealChoice(id, { [p2Choice]: {} } as any, new BN(nonce2))
      .accounts({ player: player2.publicKey })
      .signers([player2]).rpc();

    const p1Before = await provider.connection.getBalance(player1.publicKey);
    const p2Before = await provider.connection.getBalance(player2.publicKey);

    const gameSeed = Buffer.allocUnsafe(8);
    gameSeed.writeBigUInt64LE(BigInt(gameId));
    const [gamePDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("game"), gameSeed],
      program.programId
    );

    await program.methods.resolveGame(id)
      .accounts({ admin: admin.publicKey, player1: player1.publicKey, player2: player2.publicKey })
      .signers([admin]).rpc();

    const p1Gain = (await provider.connection.getBalance(player1.publicKey)) - p1Before;
    const p2Gain = (await provider.connection.getBalance(player2.publicKey)) - p2Before;
    const gameClosed = (await provider.connection.getAccountInfo(gamePDA)) === null;

    return { p1Gain, p2Gain, gameClosed };
  }

  it("both split: each player receives half the pot", async () => {
    const { p1Gain, p2Gain, gameClosed } = await runGame(baseId, "split", "split");
    assert.approximately(p1Gain, MIN_POT / 2, 5000);
    assert.approximately(p2Gain, MIN_POT / 2, 5000);
    assert.isTrue(gameClosed);
  });

  it("steal vs split: player1 (stealer) receives full pot", async () => {
    const { p1Gain, p2Gain, gameClosed } = await runGame(baseId + 1, "steal", "split");
    assert.approximately(p1Gain, MIN_POT, 5000);
    assert.approximately(p2Gain, 0, 5000);
    assert.isTrue(gameClosed);
  });

  it("split vs steal: player2 (stealer) receives full pot", async () => {
    const { p1Gain, p2Gain, gameClosed } = await runGame(baseId + 2, "split", "steal");
    assert.approximately(p1Gain, 0, 5000);
    assert.approximately(p2Gain, MIN_POT, 5000);
    assert.isTrue(gameClosed);
  });

  it("both steal: house keeps pot, game account closed", async () => {
    const { p1Gain, p2Gain, gameClosed } = await runGame(baseId + 3, "steal", "steal");
    assert.approximately(p1Gain, 0, 5000);
    assert.approximately(p2Gain, 0, 5000);
    assert.isTrue(gameClosed);
  });
});
