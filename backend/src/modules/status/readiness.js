export function getReadiness(config) {
  const missing = [];
  if (!config.sql.server) missing.push('SQL_SERVER');
  // SQL_PORT is optional in validated config (for example named instances).
  // A configured address is never evidence of a connected SQL driver/pool.
  return {
    ready: false,
    stage: 'G10',
    checks: {
      sqlConfiguration: { status: missing.length ? 'missing' : 'configured', missing },
      sqlConnection: { status: 'not_verified', code: 'SQL_NOT_CONNECTED' },
      authentication: { status: 'pending_approval', code: 'AUTH_NOT_CONFIGURED' },
      currentIdentity: { status: 'pending_approval', code: 'IDENTITY_CONTRACT_NOT_APPROVED' },
      passwordFormat: { status: 'not_verified', code: 'PASSWORD_FORMAT_NOT_VERIFIED' },
      actorDelegation: { status: 'pending_approval', code: 'ACTOR_CONTRACT_NOT_APPROVED' },
      sessionStore: { status: 'not_configured', code: 'SESSION_NOT_CONFIGURED' },
      catalogRead: { status: 'pending_approval', code: 'READ_CONTRACT_NOT_APPROVED' },
      pricing: { status: 'pending_approval', code: 'PRICING_CONTRACT_NOT_APPROVED' },
      bookings: { status: 'pending_approval', code: 'BOOKING_ATOMIC_CONTRACT_MISSING' },
      stays: { status: 'pending_approval', code: 'STAY_ATOMIC_CONTRACT_MISSING' },
      stayPriceChanges: { status: 'pending_approval', code: 'STAY_PRICE_CONTRACT_NOT_APPROVED' },
      housekeepingMaintenanceLostFound: { status: 'pending_approval', code: 'OPERATIONS_CONTRACT_NOT_APPROVED' },
      inspectionAuthorization: { status: 'pending_approval', code: 'INSPECTION_AUTHORIZATION_PENDING' },
      roomEligibility: { status: 'pending_approval', code: 'ROOM_ELIGIBILITY_CONTRACT_MISSING' },
      servicesMinibarFolio: { status: 'pending_approval', code: 'CONSUMPTION_CONTRACT_NOT_APPROVED' },
      financeCheckout: { status: 'pending_approval', code: 'FINANCE_CONTRACT_NOT_APPROVED' },
      refundApproval: { status: 'pending_approval', code: 'REFUND_APPROVAL_POLICY_PENDING' },
      businessClock: { status: 'pending_approval', code: 'BUSINESS_CLOCK_POLICY_PENDING' },
      managementReports: { status: 'pending_approval', code: 'MANAGEMENT_READ_CONTRACT_PENDING' },
      durableRejectedRequests: { status: 'not_configured', code: 'DURABLE_EXCEPTION_JOURNAL_PENDING' }
    }
  };
}
