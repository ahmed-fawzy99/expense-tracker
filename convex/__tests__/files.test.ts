/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import {
  makeT,
  makeUser,
  seedRolesAndTeams,
  storeReceiptForTest,
} from "./testHelpers.utils";

async function setup() {
  const t = makeT();
  const world = await seedRolesAndTeams(t);
  const { userId: managerId } = await makeUser(t, {
    email: "m@hq.test",
    teamId: world.teamId,
    managerId: null,
    roleIds: [world.roles.manager],
  });
  const { subject: empSubject } = await makeUser(t, {
    email: "e@hq.test",
    teamId: world.teamId,
    managerId,
    roleIds: [world.roles.employee],
  });
  return { t, world, asEmp: t.withIdentity({ subject: empSubject }) };
}

describe("receipt validation", () => {
  test("accepts a small JPEG", async () => {
    const { t, asEmp } = await setup();
    const storageId = await storeReceiptForTest(t, {
      bytes: 2048,
      contentType: "image/jpeg",
    });
    const draftId = await asEmp.mutation(api.expenses.createDraft, {
      description: "ok",
      amount: 1000,
      currency: "USD",
      category: "other",
      receiptStorageId: storageId,
    });
    expect(draftId).toBeDefined();
  });

  test("rejects an oversized blob (≥ 10 MB)", async () => {
    const { t, asEmp } = await setup();
    const storageId = await storeReceiptForTest(t, {
      bytes: 11 * 1024 * 1024, // 11 MB > 10 MB limit
      contentType: "image/jpeg",
    });

    await expect(
      asEmp.mutation(api.expenses.createDraft, {
        description: "too big",
        amount: 1000,
        currency: "USD",
        category: "other",
        receiptStorageId: storageId,
      }),
    ).rejects.toThrow(/10 MB/);

    // Orphan cleanup is deferred to a future cron sweep — see expenses.ts
    // `validateReceiptOrThrow` for the rationale (transactional rollback
    // prevents inline cleanup).
  });

  test("rejects disallowed MIME (.exe / application/x-msdownload)", async () => {
    const { t, asEmp } = await setup();
    const storageId = await storeReceiptForTest(t, {
      bytes: 1024,
      contentType: "application/x-msdownload",
    });
    await expect(
      asEmp.mutation(api.expenses.createDraft, {
        description: "exe",
        amount: 1000,
        currency: "USD",
        category: "other",
        receiptStorageId: storageId,
      }),
    ).rejects.toThrow(/PNG\/JPEG\/WEBP\/PDF/);
  });

  test("accepts a PDF receipt", async () => {
    const { t, asEmp } = await setup();
    const storageId = await storeReceiptForTest(t, {
      bytes: 1024,
      contentType: "application/pdf",
    });
    const draftId = await asEmp.mutation(api.expenses.createDraft, {
      description: "pdf",
      amount: 1000,
      currency: "USD",
      category: "other",
      receiptStorageId: storageId,
    });
    expect(draftId).toBeDefined();
  });
});
