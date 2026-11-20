import assert from "node:assert/strict";
import { network } from "hardhat";

const { ethers } = await network.connect();

const Role = { None: 0, Supplier: 1, Manufacturer: 2, Carrier: 3, Distributor: 4 } as const;
const Status = { Created: 0, Processed: 1, InTransit: 2, Delivered: 3 } as const;
const NO_HASH = "0x" + "00".repeat(32);

// Deploys a fresh contract and returns the accounts used in the tests.
// signers[0] = owner and Supplier, then one account per role, then a stranger.
async function deploy() {
  const [owner, manufacturer, carrier, distributor, stranger] = await ethers.getSigners();
  const contract = await ethers.deployContract("SupplyChain");
  await contract.waitForDeployment();
  return { contract, owner, manufacturer, carrier, distributor, stranger };
}

type Ctx = Awaited<ReturnType<typeof deploy>>;

async function assignAllRoles(ctx: Ctx) {
  await (await ctx.contract.assignRole(ctx.manufacturer.address, Role.Manufacturer)).wait();
  await (await ctx.contract.assignRole(ctx.carrier.address, Role.Carrier)).wait();
  await (await ctx.contract.assignRole(ctx.distributor.address, Role.Distributor)).wait();
}

async function createSampleLot(ctx: Ctx) {
  const tx = await ctx.contract.createLot("Extra virgin olive oil", 1000n, "litres", "Sfax, Tunisia");
  return tx.wait();
}

function recordStep(
  ctx: Ctx,
  signer: any,
  lotId: bigint | number,
  status: number,
  description = "Test step",
  location = "Tunis, Tunisia",
  documentHash = NO_HASH
) {
  return ctx.contract.connect(signer).recordStep(lotId, status, description, location, documentHash);
}

// Checks that a transaction or call is rejected with a given revert reason.
async function expectRevert(promise: Promise<unknown>, reason: string) {
  try {
    await promise;
  } catch (error: any) {
    const text = [error?.message, error?.shortMessage, error?.reason]
      .filter(Boolean)
      .join(" ");
    assert.ok(text.includes(reason), `Expected revert "${reason}" but got: ${text}`);
    return;
  }
  assert.fail(`Expected revert "${reason}" but the call succeeded`);
}

describe("SupplyChain", () => {
  let ctx: Ctx;

  beforeEach(async () => {
    ctx = await deploy();
  });

  describe("deployment and roles", () => {
    it("makes the deployer the owner and a Supplier", async () => {
      assert.equal(await ctx.contract.owner(), ctx.owner.address);
      assert.equal(Number(await ctx.contract.roles(ctx.owner.address)), Role.Supplier);
    });

    it("starts the lot counter at 1", async () => {
      assert.equal(await ctx.contract.nextLotId(), 1n);
    });

    it("lets the owner assign roles", async () => {
      await assignAllRoles(ctx);
      assert.equal(Number(await ctx.contract.roles(ctx.manufacturer.address)), Role.Manufacturer);
      assert.equal(Number(await ctx.contract.roles(ctx.carrier.address)), Role.Carrier);
      assert.equal(Number(await ctx.contract.roles(ctx.distributor.address)), Role.Distributor);
    });

    it("T3: rejects role assignment by a non-owner", async () => {
      await expectRevert(
        ctx.contract.connect(ctx.manufacturer).assignRole(ctx.manufacturer.address, Role.Manufacturer),
        "Owner only"
      );
    });

    it("rejects the zero address and the None role", async () => {
      await expectRevert(ctx.contract.assignRole(ethers.ZeroAddress, Role.Carrier), "Invalid address");
      await expectRevert(ctx.contract.assignRole(ctx.carrier.address, Role.None), "Invalid role");
    });
  });

  describe("lot creation", () => {
    it("lets a Supplier create a lot and stores its data", async () => {
      await createSampleLot(ctx);

      const lot = await ctx.contract.getLot(1n);
      assert.equal(lot.id, 1n);
      assert.equal(lot.productName, "Extra virgin olive oil");
      assert.equal(lot.quantity, 1000n);
      assert.equal(lot.unit, "litres");
      assert.equal(lot.origin, "Sfax, Tunisia");
      assert.equal(Number(lot.status), Status.Created);
      assert.equal(lot.creator, ctx.owner.address);
      assert.equal(await ctx.contract.nextLotId(), 2n);
    });

    it("records the first history step automatically", async () => {
      await createSampleLot(ctx);

      assert.equal(await ctx.contract.getHistoryCount(1n), 1n);
      const step = await ctx.contract.getHistoryStep(1n, 0n);
      assert.equal(step.description, "Lot created");
      assert.equal(step.location, "Sfax, Tunisia");
      assert.equal(step.actor, ctx.owner.address);
      assert.equal(Number(step.status), Status.Created);
    });

    it("emits the LotCreated event with the new ID", async () => {
      const receipt: any = await createSampleLot(ctx);
      const parsed = receipt.logs
        .map((log: any) => {
          try {
            return ctx.contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((event: any) => event && event.name === "LotCreated");

      assert.ok(parsed, "LotCreated event not found");
      assert.equal(parsed.args.lotId, 1n);
      assert.equal(parsed.args.creator, ctx.owner.address);
    });

    it("T1: rejects a null quantity", async () => {
      await expectRevert(
        ctx.contract.createLot("Extra virgin olive oil", 0n, "litres", "Sfax, Tunisia"),
        "Quantity must be positive"
      );
    });

    it("rejects an empty name or an empty unit", async () => {
      await expectRevert(ctx.contract.createLot("", 10n, "litres", "Sfax"), "Empty name");
      await expectRevert(ctx.contract.createLot("Olive oil", 10n, "", "Sfax"), "Empty unit");
    });

    it("T2: rejects lot creation by an account that is not a Supplier", async () => {
      await assignAllRoles(ctx);
      await expectRevert(
        ctx.contract.connect(ctx.manufacturer).createLot("Olive oil", 10n, "litres", "Sfax"),
        "Unauthorized role"
      );
      await expectRevert(
        ctx.contract.connect(ctx.stranger).createLot("Olive oil", 10n, "litres", "Sfax"),
        "Unauthorized role"
      );
    });
  });

  describe("lot lifecycle", () => {
    beforeEach(async () => {
      await assignAllRoles(ctx);
      await createSampleLot(ctx);
    });

    it("T8: runs the full cycle with the right accounts and order", async () => {
      await (await recordStep(ctx, ctx.manufacturer, 1n, Status.Processed, "Packaging and quality control", "Sfax, Tunisia")).wait();
      await (await recordStep(ctx, ctx.carrier, 1n, Status.InTransit, "Goods picked up", "Sfax - Tunis")).wait();
      await (await recordStep(ctx, ctx.distributor, 1n, Status.Delivered, "Reception and control", "Tunis, Tunisia")).wait();

      const lot = await ctx.contract.getLot(1n);
      assert.equal(Number(lot.status), Status.Delivered);
      assert.equal(await ctx.contract.getHistoryCount(1n), 4n);

      const expected = [
        { actor: ctx.owner.address, status: Status.Created },
        { actor: ctx.manufacturer.address, status: Status.Processed },
        { actor: ctx.carrier.address, status: Status.InTransit },
        { actor: ctx.distributor.address, status: Status.Delivered },
      ];
      for (let i = 0; i < expected.length; i++) {
        const step = await ctx.contract.getHistoryStep(1n, BigInt(i));
        assert.equal(step.actor, expected[i].actor);
        assert.equal(Number(step.status), expected[i].status);
      }
    });

    it("emits a StepRecorded event for each step", async () => {
      const tx = await recordStep(ctx, ctx.manufacturer, 1n, Status.Processed);
      const receipt: any = await tx.wait();
      const parsed = receipt.logs
        .map((log: any) => {
          try {
            return ctx.contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((event: any) => event && event.name === "StepRecorded");

      assert.ok(parsed, "StepRecorded event not found");
      assert.equal(parsed.args.lotId, 1n);
      assert.equal(Number(parsed.args.status), Status.Processed);
      assert.equal(parsed.args.actor, ctx.manufacturer.address);
    });

    it("stores the document hash of a step", async () => {
      const hash = "0x" + "ab".repeat(32);
      await (await recordStep(ctx, ctx.manufacturer, 1n, Status.Processed, "Quality certificate", "Sfax", hash)).wait();

      const step = await ctx.contract.getHistoryStep(1n, 1n);
      assert.equal(step.documentHash, hash);
    });

    it("T4: rejects transport before processing", async () => {
      await expectRevert(recordStep(ctx, ctx.carrier, 1n, Status.InTransit), "Invalid transition");
    });

    it("T5: rejects a delivery recorded by a Carrier", async () => {
      await expectRevert(recordStep(ctx, ctx.carrier, 1n, Status.Delivered), "Distributor only");
    });

    it("rejects a step recorded by the wrong role", async () => {
      await expectRevert(recordStep(ctx, ctx.carrier, 1n, Status.Processed), "Manufacturer only");
      await expectRevert(recordStep(ctx, ctx.manufacturer, 1n, Status.InTransit), "Carrier only");
      await expectRevert(recordStep(ctx, ctx.stranger, 1n, Status.Processed), "Manufacturer only");
    });

    it("rejects skipped and repeated transitions", async () => {
      await expectRevert(recordStep(ctx, ctx.distributor, 1n, Status.Delivered), "Invalid transition");

      await (await recordStep(ctx, ctx.manufacturer, 1n, Status.Processed)).wait();
      await expectRevert(recordStep(ctx, ctx.manufacturer, 1n, Status.Processed), "Invalid transition");
    });

    it("rejects the Created status and empty fields", async () => {
      await expectRevert(recordStep(ctx, ctx.manufacturer, 1n, Status.Created), "Invalid new status");
      await expectRevert(recordStep(ctx, ctx.manufacturer, 1n, Status.Processed, "", "Sfax"), "Empty description");
      await expectRevert(recordStep(ctx, ctx.manufacturer, 1n, Status.Processed, "Control", ""), "Empty location");
    });

    it("rejects steps on a lot that does not exist", async () => {
      await expectRevert(recordStep(ctx, ctx.manufacturer, 999n, Status.Processed), "Lot does not exist");
    });
  });

  describe("reading", () => {
    it("T6: rejects reading a lot that does not exist", async () => {
      await expectRevert(ctx.contract.getLot(999n), "Lot does not exist");
      await expectRevert(ctx.contract.getHistoryCount(999n), "Lot does not exist");
    });

    it("T7: rejects reading a history index that does not exist", async () => {
      await createSampleLot(ctx);
      await expectRevert(ctx.contract.getHistoryStep(1n, 99n), "Invalid history index");
    });
  });

  describe("known limitations of this version", () => {
    it("lets the owner overwrite an existing role at any time", async () => {
      await assignAllRoles(ctx);
      await createSampleLot(ctx);

      // The owner turns the Manufacturer into a Distributor: there is no revocation
      // process, no delay and no multi-signature protection in this version.
      await (await ctx.contract.assignRole(ctx.manufacturer.address, Role.Distributor)).wait();

      assert.equal(Number(await ctx.contract.roles(ctx.manufacturer.address)), Role.Distributor);
      await expectRevert(recordStep(ctx, ctx.manufacturer, 1n, Status.Processed), "Manufacturer only");
    });

    it("does not prevent a Carrier from moving any lot", async () => {
      await assignAllRoles(ctx);
      await createSampleLot(ctx);
      await (await ctx.contract.createLot("Dates", 50n, "kg", "Tozeur")).wait();

      await (await recordStep(ctx, ctx.manufacturer, 2n, Status.Processed)).wait();
      // Roles are global, not per lot: this Carrier can take charge of lot 2
      // even though the Supplier never assigned it to this carrier.
      await (await recordStep(ctx, ctx.carrier, 2n, Status.InTransit)).wait();

      const lot = await ctx.contract.getLot(2n);
      assert.equal(Number(lot.status), Status.InTransit);
    });
  });

  describe("gas usage", () => {
    it("reports the gas used by each operation", async () => {
      const rows: { operation: string; gasUsed: string }[] = [];

      const measure = async (operation: string, txPromise: Promise<any>) => {
        const receipt = await (await txPromise).wait();
        rows.push({ operation, gasUsed: receipt.gasUsed.toString() });
      };

      const deploymentReceipt = await ctx.contract.deploymentTransaction()?.wait();
      if (deploymentReceipt) {
        rows.push({ operation: "deployment", gasUsed: deploymentReceipt.gasUsed.toString() });
      }

      await measure("assignRole", ctx.contract.assignRole(ctx.manufacturer.address, Role.Manufacturer));
      await ctx.contract.assignRole(ctx.carrier.address, Role.Carrier);
      await ctx.contract.assignRole(ctx.distributor.address, Role.Distributor);

      await measure("createLot", ctx.contract.createLot("Extra virgin olive oil", 1000n, "litres", "Sfax, Tunisia"));
      await measure("recordStep (Processed)", recordStep(ctx, ctx.manufacturer, 1n, Status.Processed));
      await measure("recordStep (InTransit)", recordStep(ctx, ctx.carrier, 1n, Status.InTransit));
      await measure("recordStep (Delivered)", recordStep(ctx, ctx.distributor, 1n, Status.Delivered));

      console.table(rows);
      assert.equal(rows.length >= 5, true);
    });
  });
});
