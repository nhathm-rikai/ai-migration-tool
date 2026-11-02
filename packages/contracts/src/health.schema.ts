import { Type } from 'typebox';

export const EmptyQuerySchema = Type.Object(
  {},
  { additionalProperties: false },
);
export const HealthSchema = Type.Object(
  {
    status: Type.Literal('ok'),
    mode: Type.Literal('fixture'),
    runner: Type.Union([
      Type.Literal('fake'),
      Type.Literal('claude-cli'),
      Type.Literal('codex-cli'),
    ]),
  },
  { additionalProperties: false },
);
