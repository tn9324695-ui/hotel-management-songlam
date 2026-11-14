import { Router } from 'express';
import { rejectClientActor } from '../auth/security.js';
import { identifier, shape } from '../bookings/validation.js';
import { adminQuery } from './validation.js';
import { requireManagementPermission, managementError } from './model.js';
export function managementRoutes({ auth, service, resource }) {
  const router = Router(), guards = [auth.authenticate, rejectClientActor];
  const recordId = value => identifier(value, 'id', !['roles', 'permissions'].includes(resource));
  router.get('/capabilities', ...guards, (req, res) => res.json({ data: service.capabilities(req.auth.actor), requestId: req.requestId }));
  router.get('/', ...guards, async (req, res) => res.json({ ...await service.read(req.auth.actor, 'list', adminQuery(resource, 'list', req.query), req.requestId), requestId: req.requestId }));
  if (resource === 'exceptions') router.get('/observations', ...guards, async (req, res) => res.json({
    ...await service.read(req.auth.actor, 'observations', adminQuery(resource, 'observations', req.query), req.requestId), requestId: req.requestId
  }));
  for (const operation of resource === 'users' ? ['roles', 'permissions'] : resource === 'roles' ? ['permissions'] : []) router.get('/:id/' + operation, ...guards, async (req, res) => {
    res.json({ ...await service.read(req.auth.actor, operation, { ...adminQuery(operation === 'roles' ? 'roles' : 'permissions', operation, req.query), id: recordId(req.params.id) }, req.requestId), requestId: req.requestId });
  });
  router.get('/:id', ...guards, async (req, res) => {
    shape(req.query, [], []); res.json({ ...await service.read(req.auth.actor, 'detail', { id: recordId(req.params.id) }, req.requestId), requestId: req.requestId });
  });
  router.use(...guards, (req, _res, next) => {
    try { requireManagementPermission(req.auth.actor, resource, 'list');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) throw managementError('MANAGEMENT_READ_ONLY', 'G10 chỉ đọc; chưa bật sửa tài khoản/quyền hoặc sửa/xóa nhật ký, ngoại lệ.', 405); next();
    } catch (error) { next(error); }
  });
  return router;
}
