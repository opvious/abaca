import {
  assert,
  errorFactories,
  ErrorStatus,
  StandardErrorForCode,
  statusError,
} from '@opvious/stl-errors';
import {default as ajv, ErrorObject, ValidateFunction} from 'ajv';

import {OpenapiDocument} from './load.js';
import {ReferenceResolver} from './resolve.js';

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

export const validateErrorCodes = codes;

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

/**
 * Creates a new schema validator factory.
 *
 * Sample usage:
 *
 *    const validators = schemaEnforcer<Schemas>(doc).validators({
 *      names: ['Outline', 'Summary'],
 *    });
 *    validators.isOutline(arg);
 *    validators.assertOutline(arg, status?:);
 */
export function schemaEnforcer<S>(doc: OpenapiDocument): SchemaEnforcer<S> {
  return RealSchemaEnforcer.create(doc);
}

/** Schema validator factory. */
export interface SchemaEnforcer<S> {
  validators<N extends keyof S & string>(args: {
    readonly names: ReadonlyArray<N>;
  }): Promise<ValidatorsFor<Pick<S, N>>>;
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
    private readonly ajv: Ajv,
    private readonly resolver: ReferenceResolver
  ) {}

  static create<S>(doc: OpenapiDocument): SchemaEnforcer<S> {
    return new RealSchemaEnforcer(new Ajv(), ReferenceResolver.create(doc));
  }

  async validators<N extends keyof S & string>(args: {
    readonly names: ReadonlyArray<N>;
  }): Promise<ValidatorsFor<Pick<S, N>>> {
    const validators: any = {};
    for (const name of args.names) {
      const validate = await this.validator(name);
      validators['is' + name] = validate;
    }
    return validators;
  }

  private async validator(name: string): Promise<ValidateFunction> {
    const key = '#/components/schemas/' + name;
    const schema: any = await this.resolver.resolve(key);
    return this.ajv.compile(schema);
  }
}
