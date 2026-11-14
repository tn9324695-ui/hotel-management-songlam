import { Router } from 'express';
import { AppError } from '../../shared/errors.js';
import { rejectClientActor,requireOrigin } from '../auth/security.js';
import { shape } from '../bookings/validation.js';
import { createCustomersService } from './service.js';
export function customersRoutes({auth,gateway,config}){
 const router=Router(),service=createCustomersService({gateway});
 router.post('/',auth.authenticate,rejectClientActor,requireOrigin(config.publicOrigin),auth.csrf,async(req,res)=>{
  if(!req.is('application/json'))throw new AppError(415,'JSON_REQUIRED','Yêu cầu JSON.');shape(req.query,[],[]);
  const data=await service.create(req.auth.actor,req.body,req.get('Idempotency-Key'),req.requestId);
  res.status(data.replayed?200:201).json({data,requestId:req.requestId});
 });return router;
}
