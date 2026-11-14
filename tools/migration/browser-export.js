/* Paste this file into DevTools on the PMS origin. It defines a function only.
 * Then explicitly run: await SongLamMigrationExport()
 * No Store initialization, cookies, sessionStorage or localStorage enumeration.
 */
globalThis.SongLamMigrationExport = async function () {
  'use strict';
  if (!globalThis.confirm('Xuất bản sao PMS có dữ liệu khách? Chỉ lưu trên máy/nơi lưu trữ nội bộ được phép. Không gửi lên Git hoặc dịch vụ công cộng.')) return;
  const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value);
  const sha = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2, '0')).join('');
  const part = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
  const key = 'songlam_hotel_pms_data_v2';
  const raw = localStorage.getItem(key);
  if (raw === null) throw new Error('Không có key PMS. Không khởi tạo Store để tạo dữ liệu xuất.');
  const input = JSON.parse(raw);
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('Dữ liệu gốc không hợp lệ. Không sửa nguồn.');
  const redactions = [];
  const secret = /password|passwd|pwd|hash|token|session|cookie|authorization|secret|credential|private.?key|connection.?string|ciphertext|hmac|cvv|cvc|cardnumber|pan$|iban|accountnumber|webhook|providerpayload|rawpayload/i;
  // Free text can contain pasted credentials/payment details; withheld for separate secure review.
  const freeText = /^(notes?|description|message|details?|before|after|payload|request|response|reason|reasonText|bankAccount)$/i;
  // Unknown fields are inventoried as redactions instead of exporting arbitrary values.
  // Extend only after reviewing the actual structure; omission always blocks import review.
  const known = new Set(`version updatedAt hotelInfo roomClasses rooms stays bookings services housekeepingTasks
    minibarAudits maintenanceTickets lostAndFound transactions refundRequests roles users customers exceptionCases
    cashierShifts dailyLedgers policies id code name fullName username roleCode roleName email phone address
    taxCode brandReference currency workingDate number floor classCode roomClassCode area standardOccupancy
    maxOccupancy bedConfig amenities status stayStatus cleanStatus exploitationStatus currentStayId basePrice
    weekendPrice holidayPrice unit price category type isActive customerId guestName checkInDate checkOutDate
    expectedCheckOutDate actualCheckOutDate nights hours stayType roomQuantity assignedRooms checkedInRooms
    ratePerNight nightlyRates totalEstimated depositAmount depositPaid priceLocked bookingStatus paymentStatus
    paymentMethod createdAt createdBy guest companions identityCard relation roomNumber roomRate guaranteeDeposit
    servicesUsed surcharges discount transferHistory extensionHistory folioSnapshot bookingId stayId serviceId
    quantity unitPrice amount orderTime paymentOption minibarAuditId isMinibar checkoutTime inspectedBy itemsUsed
    totalAmount referenceCode idempotencyKey methodName gatewayVerified timestamp cashier isInternalAllocation
    tier totalStays totalSpent representative companyCode permissions date rate nightlyRate subtotal total
    taskId assignedTo startedAt completedAt reportedAt resolvedAt foundAt returnedAt location foundBy receivedBy
    priority severity dueAt updatedBy source requestedBy approvedBy approvedAt requestedAt originalTransactionId
    transactionId refundAmount businessDate openedAt closedAt openingCash countedCash expectedCash difference
    actor actorId action entity entityId result reference eventId policyVersion ratePlanId dateFrom dateTo
    startDate endDate fromRoom toRoom transferredAt previousCheckOutDate newCheckOutDate`.split(/\s+/));
  const clean = (value, pointer = '') => {
    if (Array.isArray(value)) return value.map((v, i) => clean(v, `${pointer}/${i}`));
    if (value && typeof value === 'object') {
      const result = Object.create(null);
      for (const [field, child] of Object.entries(value)) {
        const p = `${pointer}/${part(field)}`;
        if (secret.test(field) || freeText.test(field) || !known.has(field)) {
          redactions.push({ pointer: p, reason: secret.test(field) ? 'SECRET_FIELD_WITHHELD'
            : freeText.test(field) ? 'FREE_TEXT_WITHHELD' : 'UNKNOWN_FIELD_WITHHELD' });
          // Keep unknown collection positions/counts visible without exporting its values.
          if (!secret.test(field) && !freeText.test(field)) result[field] = Array.isArray(child) ? child.map(() => null) : null;
        } else result[field] = clean(child, p);
      }
      return result;
    }
    // Unknown string values cannot be guaranteed credential-free. Reject recognizable tokens.
    if (typeof value === 'string' && /(?:Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.|-----BEGIN .*PRIVATE KEY|(?:password|token|secret)\s*[:=])/i.test(value)) {
      redactions.push({ pointer, reason: 'POSSIBLE_SECRET_VALUE_WITHHELD' });
      return null;
    }
    return value;
  };
  const source = clean(input);
  const manifest = {
    format: 'songlam-migration/1', schemaVersion: 1, batchId: crypto.randomUUID(),
    exportedAtUtc: new Date().toISOString(), sourceKey: key,
    sourceSchemaVersion: typeof input.version === 'string' ? input.version : 'UNKNOWN',
    origin: location.origin, originalUtf8Sha256: await sha(raw),
    exportedSourceSha256: await sha(canonical(source)), redactions,
    originalDatasetInventory: Object.entries(input).map(([name, value]) => ({
      name, count: Array.isArray(value) ? value.length : 1,
      exported: Object.prototype.hasOwnProperty.call(source, name)
    })),
    datasets: await Promise.all(Object.keys(source).sort().map(async name => ({
      name, count: Array.isArray(source[name]) ? source[name].length : 1,
      sha256: await sha(canonical(source[name]))
    })))
  };
  const blob = new Blob([JSON.stringify({ manifest, source }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `songlam-export-${manifest.batchId}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  // Intentionally do not return or console.log source/customer records.
  return { batchId: manifest.batchId, datasets: manifest.datasets.length, redactions: redactions.length };
};
