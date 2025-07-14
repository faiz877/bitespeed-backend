import { db } from "./db";
import { IdentifyRequest, IdentifyResponse, Contact } from "./types";
import { PoolClient } from "pg";

/**
 * Reconciles contact identities based on email and/or phone.
 * Ensures related contacts link under a single primary, handling merges and new secondaries.
 * All operations are atomic within a database transaction.
 */
export async function identify(
  request: IdentifyRequest
): Promise<IdentifyResponse> {
  const { email, phoneNumber } = request;

  if (!email && !phoneNumber) {
    throw new Error("At least one of email or phoneNumber must be provided.");
  }

  return db.transaction(async (trxClient: PoolClient) => {
    const existingContacts = await db.findContacts(
      trxClient,
      email,
      phoneNumber
    );

    let primaryContacts: Contact[] = [];
    let secondaryContacts: Contact[] = [];

    existingContacts.forEach((contact) => {
      if (contact.linkPrecedence === "primary") {
        primaryContacts.push(contact);
      } else {
        secondaryContacts.push(contact);
      }
    });

    // Gather primaries from linked secondaries
    const linkedPrimaryIds = new Set<number>();
    for (const c of secondaryContacts) {
      if (c.linkedId !== null) {
        linkedPrimaryIds.add(c.linkedId);
      }
    }

    for (const id of Array.from(linkedPrimaryIds)) {
      const primary = await db.findById(trxClient, id);
      if (primary && primary.linkPrecedence === "primary") {
        primaryContacts.push(primary);
      }
    }

    // Ensure unique primary contacts and sort by creation date (oldest first)
    primaryContacts = Array.from(
      new Map(primaryContacts.map((p) => [p.id, p])).values()
    ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    let ultimatePrimary: Contact;

    if (primaryContacts.length === 0) {
      // No existing contacts found; create a new primary.
      ultimatePrimary = await db.createContact(trxClient, {
        email: email || null,
        phoneNumber: phoneNumber || null,
        linkPrecedence: "primary",
        linkedId: null,
      });
      console.log(`Created primary: ${ultimatePrimary.id}`);
    } else {
      // Existing contacts found. Oldest primary becomes the ultimate primary.
      ultimatePrimary = primaryContacts[0];
      console.log(`Ultimate primary: ${ultimatePrimary.id}`);

      const demotedPrimaryIds = primaryContacts.slice(1).map((c) => c.id);

      if (demotedPrimaryIds.length > 0) {
        console.log(`Demoting primaries: ${demotedPrimaryIds.join(", ")}`);
        // Demote other primaries to secondary, linking them to the ultimate primary.
        await db.updateContacts(trxClient, demotedPrimaryIds, {
          linkPrecedence: "secondary",
          linkedId: ultimatePrimary.id,
        });

        // Re-link secondaries that were pointing to now-demoted primaries.
        const secondariesToRelink = (
          await Promise.all(
            demotedPrimaryIds.map((id) => db.findByLinkedId(trxClient, id))
          )
        ).flat();

        if (secondariesToRelink.length > 0) {
          await db.updateContacts(
            trxClient,
            secondariesToRelink.map((c) => c.id),
            { linkedId: ultimatePrimary.id }
          );
        }
      }

      // Check if a new secondary contact needs to be created
      const currentReconciledGroup = await db.queryAllLinkedContacts(
        trxClient,
        ultimatePrimary.id
      );

      let exactMatchFoundInGroup = false;
      for (const c of currentReconciledGroup) {
        const emailMatches =
          email === undefined || email === null || email === c.email;
        const phoneMatches =
          phoneNumber === undefined ||
          phoneNumber === null ||
          phoneNumber === c.phoneNumber;

        if (emailMatches && phoneMatches) {
          exactMatchFoundInGroup = true;
          break;
        }
      }

      if (!exactMatchFoundInGroup && (email || phoneNumber)) {
        await db.createContact(trxClient, {
          email: email || null,
          phoneNumber: phoneNumber || null,
          linkPrecedence: "secondary",
          linkedId: ultimatePrimary.id,
        });
        console.log(
          `Debug: Created new secondary for input: email=${
            email || "null"
          }, phone=${phoneNumber || "null"}`
        );
      } else {
        console.log(
          `Debug: Input combination already exists in group. No new secondary created.`
        );
      }
    }

    // Assemble Response: Get all contacts in the reconciled group.
    const allLinkedContacts = await db.queryAllLinkedContacts(
      trxClient,
      ultimatePrimary.id
    );

    const emails = new Set<string>();
    const phoneNumbers = new Set<string>();
    const secondaryContactIds: number[] = [];

    allLinkedContacts.forEach((contact) => {
      if (contact.email) emails.add(contact.email);
      if (contact.phoneNumber) phoneNumbers.add(contact.phoneNumber);
      if (
        contact.linkPrecedence === "secondary" &&
        contact.linkedId === ultimatePrimary.id
      ) {
        secondaryContactIds.push(contact.id);
      }
    });

    return {
      contact: {
        primaryContactId: ultimatePrimary.id,
        emails: Array.from(emails).sort(),
        phoneNumbers: Array.from(phoneNumbers).sort(),
        secondaryContactIds: secondaryContactIds.sort((a, b) => a - b),
      },
    };
  });
}

// --- Local Testing Suite ---
async function runLocalTests() {
  console.log("\n--- Starting Local Tests ---");

  // Uncomment to clear DB for consistent test runs
  try {
    await db.transaction(async (trx) => {
      await trx.query("DELETE FROM Contact;");
      await trx.query("ALTER SEQUENCE contact_id_seq RESTART WITH 1;");
      console.log("DB cleared for testing.");
    });
  } catch (err) {
    console.error("Error clearing DB:", err);
  }

  const logResult = (label: string, result: IdentifyResponse) => {
    console.log(`\n--- ${label} ---`);
    console.log(JSON.stringify(result, null, 2));
  };

  try {
    const res1 = await identify({
      email: "test1@example.com",
      phoneNumber: "1111111111",
    });
    logResult("TC1: New Primary", res1);

    const res2 = await identify({
      email: "test1@example.com",
      phoneNumber: "2222222222",
    });
    logResult("TC2: Existing Email, New Phone", res2);

    const res3 = await identify({
      email: "test1_alt@example.com",
      phoneNumber: "1111111111",
    });
    logResult("TC3: Existing Phone, New Email", res3);

    const res4 = await identify({
      email: "test_merge@example.com",
      phoneNumber: "9999999999",
    });
    logResult("TC4: Primary for Merge", res4);

    const res5 = await identify({
      email: "test1@example.com",
      phoneNumber: "9999999999",
    });
    logResult("TC5: Merge Two Primary Groups", res5);

    const res6 = await identify({
      email: "test1_alt@example.com",
      phoneNumber: "9999999999",
    });
    logResult("TC6: Input Already Covered", res6);

    const res7 = await identify({ email: "test_merge@example.com" });
    logResult("TC7: Only Email (Existing)", res7);

    const res8 = await identify({ phoneNumber: "2222222222" });
    logResult("TC8: Only Phone (Existing)", res8);
  } catch (error: any) {
    console.error("\n--- !!! Local Test Error !!! ---");
    console.error("Error:", error.message);
    console.error(error.stack);
  } finally {
    console.log("\n--- Local Tests Finished ---");
    process.exit(0);
  }
}

// Uncomment to run tests:
runLocalTests().catch(console.error);
