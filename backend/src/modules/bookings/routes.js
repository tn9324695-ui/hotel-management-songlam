import { Router } from 'express';
import { rejectClientActor, requireOrigin } from '../auth/security.js';
import { bookingError, identifier, idempotencyKey, readInput } from './validation.js';
import { createBookingsService } from './service.js';

export function bookingsRoutes({ auth, gateway, pricingService, config }) {
  const router = Router(), service = createBookingsService({ gateway, pricingService });
  const readGuards = [auth.authenticate, rejectClientActor];
  const writeGuards = [...readGuards, requireOrigin(config.publicOrigin), auth.csrf, (req, _res, next) => {
    if (!req.is('application/json')) return next(bookingError('JSON_REQUIRED', 'Thao tác đặt phòng yêu cầu application/json.', 415));
    if (Object.keys(req.query).length) return next(bookingError('VALIDATION_ERROR', 'Thao tác ghi không nhận tham số query.', 400));
    try { req.bookingIdempotencyKey = idempotencyKey(req.get('Idempotency-Key')); next(); } catch (error) { next(error); }
  }];
  for (const operation of ['availability', 'timeline']) router.get('/' + operation, ...readGuards, async (req, res) => {
    const result = await service.read(req.auth.actor, operation, readInput(operation, req.query), req.requestId);
    res.json({ ...result, requestId: req.requestId });
  });
  router.get('/', ...readGuards, async (req, res) => {
    const result = await service.read(req.auth.actor, 'list', readInput('list', req.query), req.requestId);
    res.json({ ...result, requestId: req.requestId });
  });
  router.get('/:id', ...readGuards, async (req, res) => {
    if (Object.keys(req.query).length) throw bookingError('VALIDATION_ERROR', 'Chi tiết đơn không nhận query.', 400);
    const result = await service.read(req.auth.actor, 'detail', { bookingId: identifier(req.params.id) }, req.requestId);
    res.json({ ...result, requestId: req.requestId });
  });
  for (const [path, groupOnly] of [['/', false], ['/groups', true]]) router.post(path, ...writeGuards, async (req, res) => {
    const data = await service.create(req.auth.actor, req.body, req.bookingIdempotencyKey, req.requestId, groupOnly);
    res.status(data.replayed ? 200 : 201).json({ data, requestId: req.requestId });
  });
  router.put('/:id/rooms/:bookingRoomId/assignment', ...writeGuards, async (req, res) => {
    const data = await service.assign(req.auth.actor, req.params.id, req.params.bookingRoomId, req.body, req.bookingIdempotencyKey, req.requestId);
    res.json({ data, requestId: req.requestId });
  });
  for (const [path, partial] of [['/:id/cancel', false], ['/:id/rooms/cancel', true]]) router.post(path, ...writeGuards, async (req, res) => {
    const data = await service.cancel(req.auth.actor, req.params.id, req.body, req.bookingIdempotencyKey, req.requestId, partial);
    res.json({ data, requestId: req.requestId });
  });
  return router;
}
