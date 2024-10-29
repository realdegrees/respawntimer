/* eslint-disable no-console */
import { install } from 'source-map-support';

// Install source-map support for stacktrace
install({ hookRequire: true });

enum Level {
	'DEBUG' = '#00ad3a',
	'LOG' = '#008ead',
	'INFO' = '#ada700',
	'WARNING' = '#ad7300',
	'ERROR' = '#7d1500'
}

const logLevel: Level = (() => {
	const logLevel = process.env.LOG_LEVEL?.toUpperCase() as keyof typeof Level | undefined;
	if (logLevel && Level[logLevel]) {
		return Level[logLevel];
	}
	return Level.INFO;
})();

const warnEmptyStackTracesThreshold = 3;
let emptyStackTraces = 0;

let projectRoot = process.cwd() + '/';
let stackTraceDepth = process.env.STACK_TRACE_DEPTH ? parseInt(process.env.STACK_TRACE_DEPTH) : 1;
class Logger {
	/**
	 * @param path Absolute path to the projects root directory
	 */
	public setProjectRoot(path: string): void {
		projectRoot = path.endsWith('/') ? path : path + '/';
	}
	/**
	 * Sets the amount of calls from the stack trace that are displayed
	 * Defaults to 3
	 * @param depth
	 */
	public setStackTraceDepth(depth: number): void {
		stackTraceDepth = depth;
	}
	public log(message: string, ...optionalParams: unknown[]): void {
		log(Level.LOG, message, optionalParams);
	}
	public info(message: string, ...optionalParams: unknown[]): void {
		log(Level.INFO, message, optionalParams);
	}
	public warn(message: string, ...optionalParams: unknown[]): void {
		log(Level.WARNING, message, optionalParams);
	}
	public debug(message: string, ...optionalParams: unknown[]): void {
		log(Level.DEBUG, message, optionalParams);
	}
	public error(error: Error | string, ...optionalParams: unknown[]): void {
		if (error instanceof Error) {
			log(Level.ERROR, error.message, optionalParams, false, error.stack);
		} else {
			log(Level.ERROR, error, optionalParams);
		}
	}
}
// eslint-disable-next-line @typescript-eslint/no-empty-function
const preLogHook = (): void => {
	// TODO
};
const afterLogHook = (): void => {
	if (emptyStackTraces === warnEmptyStackTracesThreshold) {
		emptyStackTraces++;

		log(
			Level.WARNING,
			"Degrees' Logger Warning",
			[
				`Detected ${emptyStackTraces - 1} empty stack trace logs!`,
				`You may need to use Logger.setProjectRoot() 
                if [${process.cwd()} is not your project root.]`
			],
			true
		);
	}
};
const log = (
	level: Level,
	message: string,
	params: unknown[],
	noStackTrace?: boolean,
	fromStack?: string
): void => {
	if (Object.keys(Level).indexOf(level) < Object.keys(Level).indexOf(logLevel)) {
		return;
	}

	preLogHook();

	const timestamp = new Date().toLocaleString().replace(/T/, ' ').replace(/\..+/, '');
	const stack = getStackTrace(fromStack);
	if (stackTraceDepth >= 0) {
		stack.length = Math.min(stack.length, stackTraceDepth); // Applies the stackTraceDepth limit
	}
	// If stackTraceDepth is -1, keep the stack length as is

	const stackSequence = noStackTrace || !stack.length ? '' : `(${stack.join(' <- ')})`;

	if (!noStackTrace && stack.every((call) => ['internal', 'external'].includes(call))) {
		emptyStackTraces++;
	}

	logFunc(level)(`[${timestamp}] ${message} ${stackSequence}`);
	logParams(timestamp.length, level, params);

	afterLogHook();
};
const logParams = (indentation: number, level: Level, params: unknown[]): void => {
	if (params.length <= 0) {
		return;
	}
	params.forEach((param) => {
		if (Array.isArray(param)) {
			logParams(indentation, level, param);
			return;
		}
		logFunc(level)(`[${'-'.repeat(indentation)}] ${JSON.stringify(param)}`);
	});
};
const logFunc = (level: Level): ((message?: unknown, ...optionalParams: unknown[]) => void) => {
	switch (level) {
		case Level.LOG:
			return console.log;
		case Level.INFO:
			return console.info;
		case Level.WARNING:
			return console.warn;
		case Level.DEBUG:
			return console.debug;
		case Level.ERROR:
			return console.error;
	}
};
const getStackTrace = (fromExisting?: string): string[] => {
	const stack = fromExisting ? fromExisting : new Error().stack;

	return (
		stack
			?.split('\n')
			.slice(fromExisting ? 1 : 4) // Remove logger function from stacktrace
			.map((line) => line.trim().split(' ').slice(-1)[0].replace(/[)(]/g, '')) // Extract the path
			.map((path) => mapNonProjectCalls(path)) // Hide internal and external calls
			.filter((call, index, paths) => index === paths.length - 1 || paths[index + 1] !== call) // Remove duplice adjacent values
			.map((call) => call.replace(`${projectRoot}`, '').trim()) ?? [] // Remove project root to shorten path
	);
};
const mapNonProjectCalls = (path: string): string => {
    if (path.includes('dist/')) {
        return 'compiled';
    } else if (path.includes(`${projectRoot}`)) {
        return path;
    } else if (path.includes('<anonymous>')) {
        return 'anonymous';
    } else if (path.includes('node_modules')) {
        return 'dependency';
    } else if (path.startsWith('node:internal')) {
        return 'node';
    } else {
        return path;
    }
};
export default new Logger();
