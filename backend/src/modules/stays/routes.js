import { Router } from 'express';
import { rejectClientActor, requireOrigin } from '../auth/security.js';
import { bookingError, idempotencyKey, identifier } from '../bookings/validation.js';
import { stayReadInput } from './validation.js';
import { createStaysService } from './service.js';

export function staysRoutes({ auth, gateway, pricingService, config }) {
  const router = Router(), service = createStaysService({ gateway, pricingService }), guards = [auth.authenticate, rejectClientActor];
  const writeGuards = [...guards, requireOrigin(config.publicOrigin), auth.csrf, (req, _res, next) => {
    if (!req.is('application/json')) return next(bookingError('JSON_REQUIRED', 'Thao tác lưu trú yêu cầu application/json.', 415));
    if (Object.keys(req.query).length) return next(bookingError('VALIDATION_ERROR', 'Thao tác ghi lưu trú không nhận query.', 400));
    try { req.stayIdempotencyKey = idempotencyKey(req.get('Idempotency-Key')); next(); } catch (error) { next(error); }
  }];
  for (const [path, operation] of [['/arrivals', 'arrivals'], ['/room-readiness', 'readiness'], ['/', 'list']]) router.get(path, ...guards, async (req, res) => {
    const result = await service.read(req.auth.actor, operation, stayReadInput(operation, req.query), req.requestId);
    res.json({ ...result, requestId: req.requestId });
  });
  router.get('/:id', ...guards, async (req, res) => {
    if (Object.keys(req.query).length) throw bookingError('VALIDATION_ERROR', 'Chi tiết lưu trú không nhận query.', 400);
    const result = await service.read(req.auth.actor, 'detail', { stayId: identifier(req.params.id) }, req.requestId);
    res.json({ ...result, requestId: req.requestId });
  });
  router.post('/check-in', ...writeGuards, async (req, res) => {
    const data = await service.checkIn(req.auth.actor, req.body, req.stayIdempotencyKey, req.requestId);
    res.status(data.replayed ? 200 : 201).json({ data, requestId: req.requestId });
  });
  router.post('/:id/price-change-preview', ...guards, requireOrigin(config.publicOrigin), auth.csrf, async (req, res) => {
    if (!req.is('application/json')) throw bookingError('JSON_REQUIRED', 'Xem giá điều chỉnh yêu cầu application/json.', 415);
    if (Object.keys(req.query).length || !req.body || !['extend', 'shorten'].includes(req.body.direction)) throw bookingError('VALIDATION_ERROR', 'Chọn gia hạn hoặc trả sớm.', 400);
    const { direction, ...body } = req.body;
    const data = await service.previewPriceChange(req.auth.actor, direction, identifier(req.params.id), body, req.requestId);
    res.json({ data, requestId: req.requestId });
  });
  for (const operation of ['transfer-room', 'extend', 'shorten']) router.post('/:id/' + operation, ...writeGuards, async (req, res) => {
    const data = await service.mutate(req.auth.actor, operation, req.params.id, req.body, req.stayIdempotencyKey, req.requestId);
    res.json({ data, requestId: req.requestId });
  });
  return router;
}
