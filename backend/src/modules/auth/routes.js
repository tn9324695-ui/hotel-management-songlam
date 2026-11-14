import { Router } from 'express';
import { validateLogin } from '../../middleware/validate.js';
import { createLoginLimiter, rejectClientActor, requireOrigin } from './security.js';
import { publicUser } from './runtime.js';

export function authRoutes({ runtime, config, limiter = createLoginLimiter() }) {
  const router = Router();
  const origin = requireOrigin(config.publicOrigin);
  router.get('/status', async (req, res) => res.json({ data: await runtime.status(), requestId: req.requestId }));
  router.post('/login', validateLogin, rejectClientActor, runtime.requireAvailable, origin, limiter, runtime.login);
  router.post('/logout', runtime.authenticate, rejectClientActor, origin, runtime.csrf, runtime.logout);
  router.get('/me', runtime.authenticate, rejectClientActor, (req, res) => res.json({
    data: { user: publicUser(req.auth.person), csrfToken: req.auth.session.csrfToken }, requestId: req.requestId
  }));
  router.get('/permissions', runtime.authenticate, rejectClientActor, (req, res) => res.json({
    data: { permissions: req.auth.actor.permissions }, requestId: req.requestId
  }));
  return router;
}
