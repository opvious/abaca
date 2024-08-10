import {appTelemetry} from '@opvious/stl-bootstrap';
import {ResourceLoader} from '@opvious/stl-utils/files';
import __inlinable from 'inlinable';
import os from 'os';
import path from 'path';

export const packageInfo = __inlinable((ctx) =>
  ctx.enclosing(import.meta.url).metadata()
);

export const resourceLoader = ResourceLoader.enclosing(import.meta.url);

export const COMMAND_NAME = packageInfo.name;

export function logPath(): string {
  return path.join(os.tmpdir(), packageInfo.name + '.log');
}

export const telemetry = appTelemetry(packageInfo, {
  loggerOptions: {
    destination: logPath(),
    base: {pid: process.pid},
  },
});
