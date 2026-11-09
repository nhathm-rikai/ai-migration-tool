// Table name mapping now lives in the contracts package so the customer
// report counts tables by the same function (AR02 review 1); this module
// keeps the import path of the web code.
export {
  crudTables,
  effectiveMapping,
  hasMappedCrud,
  inferDefaultSchema,
  mappedCrud,
  normalizeTableName,
  type CrudTables,
  type EffectiveMapping,
  type MappedCrudEntry,
} from '@portal/contracts';
