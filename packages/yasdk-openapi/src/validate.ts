import {
  assert,
  errorFactories,
  ErrorStatus,
  StandardErrorForCode,
  statusError,
} from '@opvious/stl-errors';
import {default as ajv, ErrorObject, ValidateFunction} from 'ajv';

import {OpenapiDocument} from './document/index.js';

type Ajv = ajv.default;
const Ajv = ajv.default ?? ajv;

const [errors, codes] = errorFactories({
  definitions: {
    invalidValue: (errs: ReadonlyArray<ErrorObject>, val?: unknown) => ({
      message: 'Value does not match its schema: ' + formatErrors(errs),
      tags: {errors: [...errs], value: val},
    }),
  },
  prefix: 'ERR_OPENAPI_',
});

export const errorCodes = codes;

/**
 * Creates a new schema validator factory.
 *
 * Sample usage:
 *
 *    const schemaEnforcer = openapiSchemaEnforcer<Schemas>(doc);
 *    const validators = schemaEnforcer.validators({
 *      names: ['Outline', 'Summary'],
 *    });
 *    validators.isOutline(arg);
 */
export function openapiSchemaEnforcer<S>(
  doc: OpenapiDocument
): SchemaEnforcer<S> {
  return RealSchemaEnforcer.create(doc);
}

/** Schema validator factory. */
export interface SchemaEnforcer<S> {
  /** Creates validators for the requested type names */
  validators<N extends keyof S & string>(args: {
    readonly names: ReadonlyArray<N>;
  }): ValidatorsFor<Pick<S, N>>;
}

/** Schema validators. */
export type ValidatorsFor<S> = {
  readonly [K in keyof S & string as `is${K}`]: ValidationPredicate<S[K]>;
};

export interface ValidationPredicate<V> {
  (arg: unknown): arg is V;
  readonly errors?: ReadonlyArray<ErrorObject> | null;
}

class RealSchemaEnforcer<S> implements SchemaEnforcer<S> {
  private constructor(
    private readonly document: OpenapiDocument,
    private readonly ajv: Ajv
  ) {}

  static create<S>(doc: OpenapiDocument): SchemaEnforcer<S> {
    return new RealSchemaEnforcer(doc, new Ajv());
  }

  validators<N extends keyof S & string>(args: {
    readonly names: ReadonlyArray<N>;
  }): ValidatorsFor<Pick<S, N>> {
    const validators: any = {};
    for (const name of args.names) {
      const validate = this.validator(name);
      validators['is' + name] = validate;
    }
    return validators;
  }

  private validator(name: string): ValidateFunction {
    const schema = (this.document as any).components.schemas[name];
    return this.ajv.compile(schema);
  }
}

/** Throws if errors is null or empty. */
export function invalidValueError(
  errs: ReadonlyArray<ErrorObject> | null | undefined,
  val?: unknown
): InvalidValueError {
  assert(errs?.length, 'Missing validation errors');
  return errors.invalidValue(errs, val);
}

export type InvalidValueError = StandardErrorForCode<typeof codes.InvalidValue>;

function formatErrors(errs: ReadonlyArray<ErrorObject>): string {
  return errs.map((e) => `path $${e.instancePath} ${e.message}`).join(', ');
}

/** Asserts that a value satisfies the provided validator. */
export function assertValue<V>(
  pred: ValidationPredicate<V>,
  val: unknown,
  status?: ErrorStatus
): asserts val is V {
  if (pred(val)) {
    return;
  }
  const err = invalidValueError(pred.errors, val);
  throw status == null ? err : statusError(status, err);
}
