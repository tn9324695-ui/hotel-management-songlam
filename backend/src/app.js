import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from './shared/errors.js';
import { requestContext } from './middleware/request-context.js';
import { errorHandler } from './middleware/error-handler.js';
import { getReadiness } from './modules/status/readiness.js';
import { createAuthRuntime } from './modules/auth/runtime.js';
import { authRoutes } from './modules/auth/routes.js';
import { createCatalogSqlGateway } from './adapters/sql/catalog-gateway.js';
import { catalogRoutes } from './modules/catalog/routes.js';
import { createPricingSqlGateway } from './adapters/sql/pricing-gateway.js';
import { pricingRoutes } from './modules/pricing/routes.js';
import { createPricingService } from './modules/pricing/service.js';
import { createBookingsSqlGateway } from './adapters/sql/bookings-gateway.js';
import { bookingsRoutes } from './modules/bookings/routes.js';
import { createStaysSqlGateway } from './adapters/sql/stays-gateway.js';
import { createStayPricingSqlGateway } from './adapters/sql/stay-pricing-gateway.js';
import { staysRoutes } from './modules/stays/routes.js';
import { createOperationsSqlGateway } from './adapters/sql/operations-gateway.js';
import { createOperationsService } from './modules/operations/service.js';
import { housekeepingRoutes } from './modules/housekeeping/routes.js';
import { maintenanceRoutes } from './modules/maintenance/routes.js';
import { lostFoundRoutes } from './modules/lost-found/routes.js';
import { rejectClientActor } from './modules/auth/security.js';
import { createConsumptionSqlGateway } from './adapters/sql/consumption-gateway.js';
import { servicesRoutes } from './modules/services/routes.js';
import { minibarRoutes } from './modules/minibar/routes.js';
import { createFinanceSqlGateway } from './adapters/sql/finance-gateway.js';
import { foliosRoutes } from './modules/folios/routes.js';
import { depositsRoutes } from './modules/folios/deposit-routes.js';
import { paymentsRoutes } from './modules/payments/routes.js';
import { refundsRoutes } from './modules/refunds/routes.js';
import { checkoutRoutes } from './modules/checkout/routes.js';
import { invoicesRoutes } from './modules/invoices/routes.js';
import { cashierRoutes } from './modules/cashier/routes.js';
import { businessDaysRoutes } from './modules/business-days/routes.js';
import { createManagementSqlGateway } from './adapters/sql/management-gateway.js';
import { createReportsService } from './modules/reports/service.js';
import { reportsRoutes } from './modules/reports/routes.js';
import { usersRoutes } from './modules/users/routes.js';
import { rolesRoutes } from './modules/roles/routes.js';
import { auditRoutes } from './modules/audit/routes.js';
import { exceptionsRoutes } from './modules/exceptions/routes.js';
import { createManagementService } from './modules/management/service.js';
import { managementRoutes } from './modules/management/routes.js';
import { observeRejectedRequests } from './modules/exceptions/observations.js';
import { createCutoverRuntime } from './modules/cutover/runtime.js';
import { cutoverRoutes, internalStatusRoutes } from './modules/cutover/routes.js';
import { createBookingTestRuntime } from './modules/cutover/booking-test-runtime.js';
import { customersRoutes } from './modules/customers/routes.js';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const nullLogger = Object.freeze({ info() {}, error() {} });

export function createApp({ config, logger = nullLogger, registerRoutes, authRuntime, catalogGateway, pricingGateway, bookingsGateway, staysGateway, stayPricingGateway, operationsGateway, consumptionGateway, financeGateway, managementGateway, cutoverDependencies, receiptGateway, sqlRuntime, bookingTestGateway } = {}) {
  if (!config) throw new TypeError('createApp requires validated config.');
  if (registerRoutes && config.environment !== 'test') throw new TypeError('Custom test routes are restricted to test apps.');
  const app = express();
  const auth = authRuntime || createAuthRuntime({ config });
  // No production dependency probe/receipt SQL adapter is supplied by default.
  const cutover = config.cutover?.mode === 'test-booking' ? createBookingTestRuntime({config,gateway:bookingTestGateway,auth,logger}) : createCutoverRuntime({ config, logger, receiptGateway,
    dependencies: cutoverDependencies?.inspect ? { inspect: async () => {
      const [state, identityStatus] = await Promise.all([cutoverDependencies.inspect(), auth.status()]);
      return { ...state, authentication: state?.authentication === true && identityStatus.loginEnabled === true && !auth.fixture };
    } } : null });
  if (auth.fixture && config.environment !== 'test') throw new TypeError('Fixture authentication is restricted to test apps.');
  const catalog = catalogGateway || createCatalogSqlGateway({ environment: config.environment });
  if (catalog.testOnly && config.environment !== 'test') throw new TypeError('Test SQL gateways are restricted to test apps.');
  const pricing = pricingGateway || createPricingSqlGateway({ environment: config.environment });
  if (pricing.testOnly && config.environment !== 'test') throw new TypeError('Test pricing gateways are restricted to test apps.');
  const bookings = bookingsGateway || createBookingsSqlGateway({ environment: config.environment });
  if (bookings.testOnly && config.environment !== 'test') throw new TypeError('Test booking gateways are restricted to test apps.');
  const stays = staysGateway || createStaysSqlGateway({ environment: config.environment });
  const stayPricing = stayPricingGateway || createStayPricingSqlGateway({ environment: config.environment });
  if ((stays.testOnly || stayPricing.testOnly) && config.environment !== 'test') throw new TypeError('Test stay gateways are restricted to test apps.');
  const operations = operationsGateway || createOperationsSqlGateway({ environment: config.environment });
  if (operations.testOnly && config.environment !== 'test') throw new TypeError('Test operations gateways are restricted to test apps.');
  const consumption = consumptionGateway || createConsumptionSqlGateway({ environment: config.environment });
  if (consumption.testOnly && config.environment !== 'test') throw new TypeError('Test consumption gateways are restricted to test apps.');
  const finance = financeGateway || createFinanceSqlGateway({ environment: config.environment });
  if (finance.testOnly && config.environment !== 'test') throw new TypeError('Test finance gateways are restricted to test apps.');
  const management = managementGateway || createManagementSqlGateway({ environment: config.environment });
  if (management.testOnly && config.environment !== 'test') throw new TypeError('Test management gateways are restricted to test apps.');
  app.disable('x-powered-by');
  app.set('json escape', true);
  app.use(requestContext(logger));
  app.use(observeRejectedRequests(logger));
  app.use(cutover.observe);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(['/health', '/ready', '/api', '/internal'], (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const smallJson = express.json({ limit: '16kb', strict: true }), batchJson = express.json({ limit: '128kb', strict: true });
  app.use((req, res, next) => (['/api/v1/bookings', '/api/v1/stays', '/api/v1/service-orders', '/api/v1/minibar-audits', '/api/v1/payments', '/api/v1/checkouts'].some(path => req.path === path || req.path.startsWith(path + '/')) ? batchJson : smallJson)(req, res, next));

  app.get('/health', (req, res) => res.json({ data: { status: 'ok', service: 'songlam-pms', stage: cutover.testOnly?'BOOKING_SQL_TEST':'G12', buildId: config.cutover?.buildId || null }, requestId: req.requestId }));
  // Default remains 503. Only real runtime/auth checks can make an approved release ready.
  app.get('/ready', async (req, res) => {
    const state = await cutover.publicState();
    const data = state.writable ? { ready: true, stage: cutover.testOnly?'BOOKING_SQL_TEST':'G12', scope: cutover.testOnly?'CUSTOMER_BOOKING_TEST_ONLY':'ACCEPTED_OPERATIONS_ONLY',
      checks: { liveDependencies: { status: 'verified_by_runtime' } }, cutover: state }
      : { ...getReadiness(config), stage: 'G12', cutover: state };
    if (sqlRuntime) {
      const connection = await sqlRuntime.status();
      data.connection = connection;
      if (data.checks.sqlConnection) data.checks.sqlConnection = { status: connection.sqlConnected && connection.identityVerified ? 'verified' : 'not_verified', code: connection.sqlConnected && connection.identityVerified ? 'SQL_IDENTITY_VERIFIED' : 'SQL_NOT_CONNECTED' };
      // Configured dependencies are not proof of user login or business writes.
      // Keep readiness gated by cutover while reporting live setup accurately.
      let loginEnabled=false;try{loginEnabled=(await auth.status()).loginEnabled===true;}catch{}
      if (data.checks.authentication && connection.authentication===true && loginEnabled) {
        data.checks.authentication={status:'configured',code:'AUTH_RUNTIME_CONFIGURED'};
        data.checks.currentIdentity={status:'configured',code:'IDENTITY_CONTRACT_CONFIGURED'};
        data.checks.passwordFormat={status:'configured',code:'PASSWORD_VERIFIER_CONFIGURED'};
        data.checks.sessionStore={status:'configured',code:'DURABLE_SESSION_RUNTIME_CONFIGURED'};
      }
      if (data.checks.catalogRead && connection.modules?.includes('catalogGateway')) data.checks.catalogRead={status:'configured_not_exercised',code:'CATALOG_GATEWAY_CONFIGURED_NOT_SQL_TESTED'};
    }
    res.status(data.ready ? 200 : 503).json({ data, requestId: req.requestId });
  });
  app.get('/api/v1/connection/status', async (req,res) => {
    const state = sqlRuntime ? await sqlRuntime.status() : { mode:'disabled',configured:false,sqlConnected:false,identityVerified:false,authentication:false,modules:[],businessWritesEnabled:false };
    res.json({data:cutover.testOnly?{...state,businessWritesEnabled:(await cutover.publicState()).writable}:state,requestId:req.requestId});
  });
  app.use('/internal', internalStatusRoutes({ runtime: cutover, auth }));
  app.use('/api/v1', cutoverRoutes({ runtime: cutover, auth, config }));
  // Fixture routes exercise G2 independently of release activation. They can
  // only be registered in NODE_ENV=test and are never loaded by server.js.
  registerRoutes?.(app, auth);
  app.use('/api/v1', cutover.guard);
  app.use('/api/v1/auth', authRoutes({ runtime: auth, config }));
  app.get('/api/v1/admin/profile', auth.authenticate, rejectClientActor, (req, res) => res.json({
    data: { id: req.auth.actor.appUserId, username: req.auth.person.username, fullName: req.auth.person.fullName,
      navigation: { finance: ['collectPayment', 'approveRefund', 'manageCheckOut', 'printVatInvoice', 'viewDailyRevenue'].some(right => req.auth.actor.permissions.includes(right)),
        services: ['addServiceOrder', 'manageHousekeepingTasks', 'manageCheckOut'].some(right => req.auth.actor.permissions.includes(right)),
        housekeeping: ['viewRoomRack', 'manageHousekeepingTasks', 'reportMaintenance'].some(right => req.auth.actor.permissions.includes(right)) } }, requestId: req.requestId
  }));
  app.use('/api/v1/reports', reportsRoutes({ auth, service: createReportsService({ gateway: management }) }));
  for (const [prefix, factory] of [['users', usersRoutes], ['roles', rolesRoutes], ['audit', auditRoutes], ['exceptions', exceptionsRoutes]]) app.use('/api/v1/' + prefix, factory({ auth, gateway: management }));
  app.use('/api/v1/permissions', managementRoutes({ auth, resource: 'permissions', service: createManagementService({ gateway: management, resource: 'permissions' }) }));
  app.use('/api/v1/customers', customersRoutes({auth,gateway:bookingTestGateway,config}));
  app.use('/api/v1', catalogRoutes({ auth, gateway: catalog }));
  app.use('/api/v1/pricing', pricingRoutes({ auth, gateway: pricing, config }));
  app.use('/api/v1/bookings', bookingsRoutes({ auth, gateway: bookings, pricingService: createPricingService({ gateway: pricing }), config }));
  app.use('/api/v1/stays', staysRoutes({ auth, gateway: stays, pricingService: createPricingService({ gateway: pricing, stayChangeGateway: stayPricing }), config }));
  app.get('/api/v1/operations/capabilities', auth.authenticate, rejectClientActor, (req, res) => res.json({
    data: createOperationsService({ gateway: operations }).capabilities(req.auth.actor), requestId: req.requestId
  }));
  app.use('/api/v1/housekeeping', housekeepingRoutes({ auth, gateway: operations, config }));
  app.use('/api/v1/maintenance', maintenanceRoutes({ auth, gateway: operations, config }));
  app.use('/api/v1/lost-found', lostFoundRoutes({ auth, gateway: operations, config }));
  app.use('/api/v1/service-orders', servicesRoutes({ auth, gateway: consumption, config }));
  app.use('/api/v1/minibar-audits', minibarRoutes({ auth, gateway: consumption, config }));
  for (const [prefix, factory] of [['/folios', foliosRoutes], ['/deposit-accounts', depositsRoutes], ['/payments', paymentsRoutes], ['/refunds', refundsRoutes],
    ['/checkouts', checkoutRoutes], ['/invoices', invoicesRoutes], ['/cashier/shifts', cashierRoutes], ['/finance/business-days', businessDaysRoutes]]) {
    app.use('/api/v1' + prefix, factory({ auth, gateway: finance, config }));
  }
  // Future module registration and error tests can add routes before the final handler.
  // No fixture routes or automatic SQL connection/migration are registered.
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'API_NOT_FOUND', 'API chưa được triển khai.')));

  app.get('/', (_req, res) => res.redirect('/login.html'));
  app.get('/login', (_req, res) => res.redirect('/login.html'));
  // Synchronous script, before Store: server is authoritative for mode; no DB identity exposed.
  app.get('/js/deployment-config.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.type('application/javascript');
    const initial = { mode: cutover.mode, buildId: config.cutover?.buildId || null, managed: true, issuedAtMs: Date.now() };
    res.send('globalThis.SongLamDeploymentConfig = Object.freeze(' + JSON.stringify(initial).replaceAll('<', '\\u003c') + ');');
  });
  for (const name of ['login.html', 'index.html', 'reception.html', 'reception-api.html', 'catalog-api.html', 'housekeeping.html', 'housekeeping-api.html', 'services-api.html', 'finance-api.html', 'admin-api.html', 'operations-status.html', 'favicon.svg']) {
    app.get('/' + name, (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      // Managed SQL/test workspaces must never expose the legacy localStorage
      // workspaces as an apparent alternative source of business data.
      if (cutover.mode !== 'demo') {
        if (name === 'reception.html') return res.redirect('/reception-api.html');
        if (name === 'index.html') return res.redirect('/admin-api.html');
        if (name === 'housekeeping.html') return res.redirect('/housekeeping-api.html');
      }
      if (name === 'login.html') res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'self'; form-action 'none'");
      res.sendFile(name, { root: projectRoot, dotfiles: 'deny' }, error => { if (error) next(error); });
    });
  }
  for (const directory of ['css', 'js']) app.use('/' + directory, express.static(path.join(projectRoot, directory), {
    dotfiles: 'deny', index: false, redirect: false, fallthrough: false
  }));
  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Không tìm thấy tài nguyên.')));
  app.use(errorHandler(logger));
  return app;
}
