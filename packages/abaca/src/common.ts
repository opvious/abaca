import {appTelemetry} from '@opvious/stl-bootstrap';
import __inlinable from 'inlinable';
import os from 'os';
import path from 'path';

export const packageInfo = __inlinable((ctx) =>
  ctx.enclosing(import.meta.url).metadata()
);

export function logPath(): string {
  return path.join(os.tmpdir(), packageInfo.name + '.log');
}

export const telemetry = appTelemetry(packageInfo, {
  loggerOptions: {
    destination: logPath(),
    base: {pid: process.pid},
  },
});
