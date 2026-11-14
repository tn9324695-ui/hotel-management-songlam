import { MigrationError } from './lib/core.mjs';

// Deliberately no SQL driver, generic SQL text, user-supplied module loader or RPC name.
// A JSON flag/CLI argument cannot approve SQL or enable this adapter.
export function createApprovedImportAdapter() {
  throw new MigrationError('SQL_IMPORT_LOCKED_NO_APPROVED_CONTRACT_OR_REHEARSAL_ADAPTER');
}

/* G11 adapter contract to implement ONLY after separate SQL approval:
 * capabilities(): approved contract/environment/server/database fingerprint,
 *                 atomicBatch, durableIdempotency, sourceDigestRegistry, historicalOnly,
 *                 rollbackOnFailure, completeReadback, maxRecords, maxPayloadBytes.
 * verifyEnvironment(): trusted server identity, restored backup fingerprint, test marker.
 * registerSource({batchId, sourceSha256, manifestSha256, planSha256}): durable unique binding;
 *                 reject reused batchId with changed hashes across all clients/machines.
 * getReceipt({batchId, ordinal}): UNKNOWN or immutable COMMITTED receipt (same hashes).
 * importAtomicBatch({..., requestId, records}): ONE approved parameterized RPC;
 *                 transaction owns records+crosswalk+receipt+server checkpoint.
 *                 No calls to payments/checkout normal operational commands.
 * readback(): complete consistent, scoped snapshot incl. source line and ledger links.
 * close(): close only this tool's pool. Original staff + import operator are distinct;
 *          neither is inferred from names, PrincipalBinding mutations or connection state.
 * Errors/timeout are sanitized. On timeout receipt readback determines commit outcome;
 * unknown => stop, retain same requestId, never start a replacement collection.
 */
