// Minibar has integral consumption and SQL-owned room/segment provenance.
// Reuse the common envelope validation, without a second money calculation.
export { consumptionInput as minibarInput, consumptionQuery as minibarQuery } from '../services/validation.js';
