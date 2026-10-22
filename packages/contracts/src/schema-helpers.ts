import { Type, type TSchema } from 'typebox';

// Small building blocks shared by the source/run/artifact contracts.
export const Strict = { additionalProperties: false } as const;
export const Nullable = <T extends TSchema>(schema: T) =>
  Type.Union([schema, Type.Null()]);
export const TimestampSchema = Type.String({ format: 'date-time' });
// Version labels written by the analyzer, e.g. `vb6-physical-code-v1`.
export const VersionLabelSchema = Type.String({
  pattern: '^[a-z0-9][a-z0-9.-]{0,63}$',
});
// Page size travels as a query string; coercion is off at the API.
export const PageLimitQuerySchema = (defaultValue: number) =>
  Type.String({
    pattern: '^(?:[1-9]|[1-9][0-9]|100)$',
    default: String(defaultValue),
  });
