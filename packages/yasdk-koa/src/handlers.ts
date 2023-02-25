import Koa from 'koa';
import {AsyncOrSync, ValueOf} from 'ts-essentials';

import {OperationTypes} from './common.js';

export type HandlersFor<O extends OperationTypes, S = {}> = {
  readonly [K in keyof O]?: HandlerFor<O[K], S>;
}

export type HandlerFor<O extends OperationType, S = {}> =
  (ctx: Koa.ParameterizedContext<S, ContextFor<O>>) => AsyncOrSync<ResponseDataFor<O>>;

type ContextFor<O extends OperationType> = ValueOf<{
  [
}>;
