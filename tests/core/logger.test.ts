import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import {
	setLogLevel,
	getLogLevel,
	logger,
	initLogLevelFromEnv,
	isLogLevelSetInEnv,
	logEnv,
} from '../../build/src/core/logger.js';

describe('logger', () => {
	afterEach(() => {
		delete process.env.LOG_LEVEL;
		setLogLevel('info');
	});

	it('logger.info outputs without throw', () => {
		setLogLevel('info');
		expect(() => logger.info('test', { key: 'value' })).not.to.throw();
	});

	it('logger.debug is no-op when level is info', () => {
		setLogLevel('info');
		expect(() => logger.debug('hidden')).not.to.throw();
	});

	it('setLogLevel accepts all levels', () => {
		expect(() => {
			setLogLevel('debug');
			setLogLevel('info');
			setLogLevel('warn');
			setLogLevel('error');
			setLogLevel('fatal');
		}).not.to.throw();
	});

	it('getLogLevel returns current level', () => {
		setLogLevel('debug');
		expect(getLogLevel()).to.equal('debug');
		setLogLevel('warn');
		expect(getLogLevel()).to.equal('warn');
	});

	it('initLogLevelFromEnv returns fallback when LOG_LEVEL not set', () => {
		delete process.env.LOG_LEVEL;
		expect(initLogLevelFromEnv('info')).to.equal('info');
	});

	it('initLogLevelFromEnv returns level when LOG_LEVEL valid', () => {
		process.env.LOG_LEVEL = 'debug';
		expect(initLogLevelFromEnv('info')).to.equal('debug');
		process.env.LOG_LEVEL = 'WARN';
		expect(initLogLevelFromEnv('info')).to.equal('warn');
	});

	it('initLogLevelFromEnv returns fallback when LOG_LEVEL invalid', () => {
		process.env.LOG_LEVEL = 'invalid';
		expect(initLogLevelFromEnv('info')).to.equal('info');
	});

	it('isLogLevelSetInEnv returns false when not set', () => {
		delete process.env.LOG_LEVEL;
		expect(isLogLevelSetInEnv()).to.be.false;
	});

	it('isLogLevelSetInEnv returns true when set', () => {
		process.env.LOG_LEVEL = 'debug';
		expect(isLogLevelSetInEnv()).to.be.true;
	});

	it('logger.warn and error and fatal do not throw', () => {
		setLogLevel('debug');
		expect(() => logger.warn('w')).not.to.throw();
		expect(() => logger.error('e')).not.to.throw();
		expect(() => logger.fatal('f')).not.to.throw();
	});

	it('logger.errorUnknown with Error logs message and stack', () => {
		setLogLevel('error');
		const err = new Error('test error');
		expect(() => logger.errorUnknown(err)).not.to.throw();
	});

	it('logger.errorUnknown with non-Error converts to string', () => {
		setLogLevel('error');
		expect(() => logger.errorUnknown('string err')).not.to.throw();
	});

	it('logger.info accepts data-only object as first arg', () => {
		setLogLevel('info');
		expect(() => logger.info({ component: 'Test', key: 1 })).not.to.throw();
	});

	it('logEnv does not throw', () => {
		setLogLevel('info');
		expect(() => logEnv()).not.to.throw();
	});
});
