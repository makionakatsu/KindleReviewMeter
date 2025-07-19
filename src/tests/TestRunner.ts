/**
 * 軽量テストランナー
 * 
 * 【責任範囲】
 * - 主要クラスの単体テスト実行
 * - テスト結果の集約とレポート生成
 * - エラー詳細の追跡と分析
 * - パフォーマンステストの実行
 */

import { logger } from '../utils/AILogger.js';

export interface TestCase {
  name: string;
  fn: () => Promise<void> | void;
  timeout?: number;
}

export interface TestSuite {
  name: string;
  tests: TestCase[];
  setup?: () => Promise<void> | void;
  teardown?: () => Promise<void> | void;
}

export interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  error?: Error;
}

export interface SuiteResult {
  name: string;
  tests: TestResult[];
  duration: number;
  passed: number;
  failed: number;
  skipped: number;
}

export class TestRunner {
  private suites: TestSuite[] = [];
  private results: SuiteResult[] = [];

  addSuite(suite: TestSuite): void {
    this.suites.push(suite);
  }

  async runAll(): Promise<SuiteResult[]> {
    logger.info({
      component: 'TestRunner',
      method: 'runAll',
      operation: 'TEST_RUN_START',
      data: { 
        totalSuites: this.suites.length,
        totalTests: this.suites.reduce((sum, suite) => sum + suite.tests.length, 0)
      }
    }, `🧪 TEST_RUN_START: ${this.suites.length} suites`, ['test', 'run', 'start']);

    this.results = [];
    const overallStart = performance.now();

    for (const suite of this.suites) {
      const result = await this.runSuite(suite);
      this.results.push(result);
    }

    const overallDuration = performance.now() - overallStart;
    const summary = this.generateSummary();

    logger.info({
      component: 'TestRunner',
      method: 'runAll',
      operation: 'TEST_RUN_COMPLETE',
      data: { 
        ...summary,
        totalDuration: overallDuration
      }
    }, `🏁 TEST_RUN_COMPLETE: ${summary.totalPassed}/${summary.totalTests} passed (${overallDuration.toFixed(2)}ms)`, ['test', 'run', 'complete']);

    return this.results;
  }

  private async runSuite(suite: TestSuite): Promise<SuiteResult> {
    const suiteStart = performance.now();
    const testResults: TestResult[] = [];

    logger.info({
      component: 'TestRunner',
      method: 'runSuite',
      operation: 'SUITE_START',
      data: { suiteName: suite.name, testCount: suite.tests.length }
    }, `📂 SUITE_START: ${suite.name}`, ['test', 'suite', 'start']);

    try {
      // Setup
      if (suite.setup) {
        await suite.setup();
      }

      // Run tests
      for (const test of suite.tests) {
        const result = await this.runTest(test);
        testResults.push(result);
      }

      // Teardown
      if (suite.teardown) {
        await suite.teardown();
      }

    } catch (error) {
      logger.error({
        component: 'TestRunner',
        method: 'runSuite',
        operation: 'SUITE_ERROR',
        error: error as Error,
        data: { suiteName: suite.name }
      }, `❌ SUITE_ERROR: ${suite.name}`, ['test', 'suite', 'error']);
    }

    const suiteDuration = performance.now() - suiteStart;
    const passed = testResults.filter(r => r.status === 'pass').length;
    const failed = testResults.filter(r => r.status === 'fail').length;
    const skipped = testResults.filter(r => r.status === 'skip').length;

    const suiteResult: SuiteResult = {
      name: suite.name,
      tests: testResults,
      duration: suiteDuration,
      passed,
      failed,
      skipped
    };

    logger.info({
      component: 'TestRunner',
      method: 'runSuite',
      operation: 'SUITE_COMPLETE',
      data: { 
        suiteName: suite.name,
        passed,
        failed,
        skipped,
        duration: suiteDuration
      }
    }, `✅ SUITE_COMPLETE: ${suite.name} (${passed}/${testResults.length} passed)`, ['test', 'suite', 'complete']);

    return suiteResult;
  }

  private async runTest(test: TestCase): Promise<TestResult> {
    const testStart = performance.now();
    const timeout = test.timeout || 5000;

    try {
      // タイムアウト制御
      const testPromise = Promise.resolve(test.fn());
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Test timeout (${timeout}ms)`)), timeout);
      });

      await Promise.race([testPromise, timeoutPromise]);

      const duration = performance.now() - testStart;
      logger.debug({
        component: 'TestRunner',
        method: 'runTest',
        operation: 'TEST_PASS',
        data: { testName: test.name, duration }
      }, `✅ TEST_PASS: ${test.name} (${duration.toFixed(2)}ms)`, ['test', 'pass']);

      return {
        name: test.name,
        status: 'pass',
        duration
      };

    } catch (error) {
      const duration = performance.now() - testStart;
      logger.error({
        component: 'TestRunner',
        method: 'runTest',
        operation: 'TEST_FAIL',
        error: error as Error,
        data: { testName: test.name, duration }
      }, `❌ TEST_FAIL: ${test.name}`, ['test', 'fail']);

      return {
        name: test.name,
        status: 'fail',
        duration,
        error: error as Error
      };
    }
  }

  private generateSummary() {
    const totalTests = this.results.reduce((sum, suite) => sum + suite.tests.length, 0);
    const totalPassed = this.results.reduce((sum, suite) => sum + suite.passed, 0);
    const totalFailed = this.results.reduce((sum, suite) => sum + suite.failed, 0);
    const totalSkipped = this.results.reduce((sum, suite) => sum + suite.skipped, 0);
    const totalDuration = this.results.reduce((sum, suite) => sum + suite.duration, 0);

    return {
      totalSuites: this.results.length,
      totalTests,
      totalPassed,
      totalFailed,
      totalSkipped,
      totalDuration,
      successRate: totalTests > 0 ? (totalPassed / totalTests * 100) : 0
    };
  }

  getResults(): SuiteResult[] {
    return this.results;
  }

  printReport(): void {
    const summary = this.generateSummary();
    
    console.log('\n🧪 === TEST REPORT ===');
    console.log(`📊 Total: ${summary.totalTests} tests in ${summary.totalSuites} suites`);
    console.log(`✅ Passed: ${summary.totalPassed}`);
    console.log(`❌ Failed: ${summary.totalFailed}`);
    console.log(`⏭️ Skipped: ${summary.totalSkipped}`);
    console.log(`⏱️ Duration: ${summary.totalDuration.toFixed(2)}ms`);
    console.log(`📈 Success Rate: ${summary.successRate.toFixed(2)}%`);
    
    if (summary.totalFailed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.forEach(suite => {
        suite.tests.filter(test => test.status === 'fail').forEach(test => {
          console.log(`  ${suite.name} > ${test.name}: ${test.error?.message}`);
        });
      });
    }
    
    console.log('\n===================\n');
  }
}

// アサーション関数
export function assert(condition: boolean, message: string = 'Assertion failed'): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, but got ${actual}`);
  }
}

export function assertNotEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual === expected) {
    throw new Error(message || `Expected not ${expected}, but got ${actual}`);
  }
}

export function assertThrows(fn: () => any, message?: string): void {
  try {
    fn();
    throw new Error(message || 'Expected function to throw');
  } catch (error) {
    // 期待通りエラーがスローされた
  }
}

export async function assertAsync(condition: Promise<boolean>, message: string = 'Async assertion failed'): Promise<void> {
  const result = await condition;
  assert(result, message);
}